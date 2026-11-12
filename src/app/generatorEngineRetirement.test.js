import{beforeEach,it,expect,vi}from'vitest';
vi.mock('../audio/context',()=>({audioContext:{}}));
vi.mock('../audio/bus',()=>({masterBus:{}}));
vi.mock('../audio/performance',()=>({PERFORMANCE:{sharedReverb:false},isMobile:()=>false}));
const controls=vi.hoisted(()=>({made:[],construct:null,dispose:null,connect:null}));
vi.mock('./engine/Instrument',()=>({default:class{
 constructor(options){this.preset=options.preset;this.polyphony=options.polyphony;this.connect=vi.fn(()=>controls.connect?.(this));this.dispose=vi.fn(()=>controls.dispose?.(this));controls.construct?.(this);controls.made.push(this);}
}}));
import Generator from'./Generator.js';
const ids=['lead','counter','pad','bass','rhythm'];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function fixture(){const g=Object.create(Generator.prototype);g.AC={};g.settings={};g.roles=Object.fromEntries(ids.map(id=>[id,{instrument:{preset:{},polyphony:4,dispose:vi.fn()},tone:{}}]));g.roles.perc={instrument:{preset:{}}};g.applyWander=vi.fn();g.applyMix=vi.fn();Object.defineProperty(g,'isRunning',{value:false,writable:true});return g;}
beforeEach(()=>{controls.made=[];controls.construct=null;controls.dispose=null;controls.connect=null;});
it('keeps engine readiness and every captured source retirement pending until real ACKs settle',async()=>{
 const g=fixture(),old=ids.map(id=>g.roles[id].instrument),gates=old.map(()=>deferred());old.forEach((o,i)=>o.dispose.mockReturnValue(gates[i].promise));
 const work=g.setAudioEngine('legacy');let finished=false;work.finally(()=>finished=true);await Promise.resolve();
 expect(g.audioEngineReady).toBeTruthy();expect(g.sourceRetirements.size).toBe(5);expect(finished).toBe(false);expect(ids.every((id,i)=>g.roles[id].instrument!==old[i])).toBe(true);
 gates.slice(0,4).forEach(gate=>gate.resolve());await Promise.resolve();expect(finished).toBe(false);gates[4].resolve();await work;await Promise.resolve();
 expect(g.audioEngineReady).toBeNull();expect(g.sourceRetirements.size).toBe(0);expect(old.every(o=>o.dispose.mock.calls.length===1)).toBe(true);expect(controls.made.every(o=>!o.dispose.mock.calls.length)).toBe(true);
});
it('awaits stale candidates without changing any installed source',async()=>{
 const g=fixture(),old=ids.map(id=>g.roles[id].instrument),gate=deferred();controls.construct=()=>g.audioEngineRevision++;controls.dispose=()=>gate.promise;
 const work=g.setAudioEngine('legacy');let finished=false;work.finally(()=>finished=true);await Promise.resolve();expect(controls.made).toHaveLength(5);expect(controls.made.every(o=>o.dispose.mock.calls.length===1)).toBe(true);expect(finished).toBe(false);expect(ids.map(id=>g.roles[id].instrument)).toEqual(old);gate.resolve();await work;expect(old.every(o=>!o.dispose.mock.calls.length)).toBe(true);
});
it('preserves a failed source ACK and still waits for the other source retirements',async()=>{
 const g=fixture(),failure=Error('source terminal timeout'),gate=deferred();g.roles.lead.instrument.dispose.mockRejectedValue(failure);g.roles.counter.instrument.dispose.mockReturnValue(gate.promise);
 const work=g.setAudioEngine('legacy'),rejected=expect(work).rejects.toThrow('Engine source retirement failed');await Promise.resolve();expect(g.audioEngineReady).toBeTruthy();expect(ids.every(id=>g.roles[id].instrument===controls.made[ids.indexOf(id)])).toBe(true);gate.resolve();await rejected;expect(g.sourceRetirementFailure.errors).toContain(failure);expect(g.audioEngineReady).toBeNull();expect(controls.made.every(o=>!o.dispose.mock.calls.length)).toBe(true);
});
it('retains construction failure plus aggregate cleanup failure and attempts every created candidate',async()=>{
 const g=fixture(),primary=Error('third source creation failed'),cleanup=Error('candidate close failed'),gate=deferred();let calls=0;controls.construct=()=>{if(++calls===3)throw primary;};controls.dispose=o=>o===controls.made[0]?Promise.reject(cleanup):gate.promise;
 const work=g.setAudioEngine('legacy'),rejected=expect(work).rejects.toBe(primary);await Promise.resolve();expect(controls.made).toHaveLength(2);expect(controls.made.every(o=>o.dispose.mock.calls.length===1)).toBe(true);expect(g.audioEngineReady).toBeTruthy();gate.resolve();await rejected;expect(JSON.stringify(primary.cleanupError,(key,value)=>value instanceof Error?{message:value.message,errors:value.errors}:value)).toContain(cleanup.message);expect(ids.every(id=>g.roles[id].instrument.dispose.mock.calls.length===0)).toBe(true);
});
it('does not restart a running generator until captured old source ACKs settle',async()=>{
 const g=fixture(),gate=deferred();g.isRunning=true;g.stop=vi.fn(()=>g.isRunning=false);g.start=vi.fn(async()=>{});g.roles.lead.instrument.dispose.mockReturnValue(gate.promise);const work=g.setAudioEngine('legacy');await Promise.resolve();expect(g.stop).toHaveBeenCalledOnce();expect(g.start).not.toHaveBeenCalled();gate.resolve();await work;expect(g.start).toHaveBeenCalledOnce();
});



it('preserves a post-publication control failure while awaiting all captured ACKs',async()=>{
 const g=fixture(),gate=deferred(),primary=Error('control apply failed'),cleanup=Error('source close failed');g.roles.lead.instrument.dispose.mockReturnValue(gate.promise);g.roles.counter.instrument.dispose.mockRejectedValue(cleanup);g.applyWander.mockImplementation(()=>{throw primary;});const work=g.setAudioEngine('legacy'),rejected=expect(work).rejects.toBe(primary);await Promise.resolve();expect(g.audioEngineReady).toBeTruthy();gate.resolve();await rejected;expect(primary.cleanupError.errors).toBeTruthy();expect(g.sourceRetirementFailure.errors).toContain(cleanup);expect(controls.made.every(o=>!o.dispose.mock.calls.length)).toBe(true);
});

it('waits for every already captured old ACK even if a later logical connect fails midway',async()=>{const g=fixture(),old=ids.map(id=>g.roles[id].instrument),gate=deferred(),primary=Error('second source connect failed'),sourceFailure=Error('old source close failed'),candidateFailure=Error('new source close failed');old[0].dispose.mockReturnValue(gate.promise);old[1].dispose.mockRejectedValue(sourceFailure);controls.connect=owner=>{if(controls.made.indexOf(owner)===1)throw primary;};controls.dispose=owner=>{if(controls.made.indexOf(owner)===0)throw candidateFailure;};const work=g.setAudioEngine('legacy'),rejected=expect(work).rejects.toBe(primary);await Promise.resolve();expect(g.audioEngineReady).toBeTruthy();expect(old[0].dispose).toHaveBeenCalledOnce();expect(old[1].dispose).toHaveBeenCalledOnce();expect(old.slice(2).every(o=>!o.dispose.mock.calls.length)).toBe(true);expect(controls.made.every(o=>o.dispose.mock.calls.length===1)).toBe(true);gate.resolve();await rejected;const tree=JSON.stringify(primary.cleanupError,(key,value)=>value instanceof Error?{message:value.message,errors:value.errors}:value);expect(tree).toContain(sourceFailure.message);expect(tree).toContain(candidateFailure.message);expect(g.sourceRetirementFailure.errors).toContain(sourceFailure);expect(g.audioEngineReady).toBeNull();});
