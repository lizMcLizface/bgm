// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {createWorkbenchTestSuite,sourceTestChecks} from './workbenchTestSuite';
import {clonePatch,RECIPES} from '../synth-lab/patch';

function setup(){
 const node=()=>({connect:vi.fn(),disconnect:vi.fn(),gain:{value:1,setTargetAtTime:vi.fn()}});
 const lease={kind:'subtractive',patch:clonePatch(RECIPES[0]),input:node(),channelOutput:node(),masterOutput:node(),tune:n=>n,assertCurrent:vi.fn(),release:vi.fn()};
 const host={context:{sampleRate:48000,currentTime:0,createGain:node,createAnalyser:()=>({...node(),getFloatTimeDomainData:b=>b.fill(0)})},openSourceStem:vi.fn(()=>lease)};
 const project={bars:1,stepsPerBar:16,key:{tonic:0,scale:[0,2,4,5,7,9,11]},patterns:{lead:{mode:'note',follow:'off',length:16,steps:[{n:[{midi:60}]},...Array(15).fill(null)]}}};
 const routes=[],done=vi.fn(),config={host,project,part:{startBar:0,bars:1},roles:['lead'],bpm:120,onDone:done,loadAssets:vi.fn(async()=>({manifest:{version:'test'}})),makeRoute:vi.fn(async(_c,_a,graph,options)=>{
  const g={frame:options.endFrame,applied:graph.events.length,late:0,overflow:0},r={node:node(),executor:{actual:options.mode},start:vi.fn(),dispose:vi.fn(),check:vi.fn(),stats:vi.fn(async()=>({output:{sourceFrame:options.endFrame,...(options.mode==='serial'?{serial:{graph:g}}:{queue:{underrunFrames:0,lateBlocks:0,rejectedBlocks:0,staleGeneration:0}})},...(options.mode==='worker'?{worker:{graph:g,badRecycles:0}}:{})}))};
  routes.push({r,graph,options});return r;
 })};
 return {config,host,lease,project,routes,done};
}
async function finishCase(s,index){await vi.waitFor(()=>expect(s.routes).toHaveLength(index+1));s.routes[index].options.onFinished({reason:'completed'});}

it('captures once, runs all four complete muted guarded cases, and binds equal input per pair',async()=>{
 const s=setup(),suite=createWorkbenchTestSuite(s.config);await suite.ready;
 const audition=JSON.stringify(s.routes[0].graph);
 s.project.patterns.lead.steps[0].n[0].midi=90;
 for(let i=0;i<4;i++){await finishCase(s,i);if(i===0)await vi.waitFor(()=>expect(s.routes).toHaveLength(2));}
 await vi.waitFor(()=>expect(s.done).toHaveBeenCalledOnce());const report=s.done.mock.calls[0][0];
 expect(report).toMatchObject({reason:'suite-completed',suite:{complete:true,passedCases:4,checksPassed:true,sameCapturedInputByMaterial:true,muted:true},complete:false,pass:false,listening:'not assessed'});
 expect(s.routes.map(t=>t.options.mode)).toEqual(['serial','worker','serial','worker']);
 expect(JSON.stringify(s.routes[1].graph)).toBe(audition);expect(s.routes[2].graph).toEqual(s.routes[3].graph);
 expect(s.routes[2].graph.events.find(e=>e.event===0).a).toBe(60);
 for(const t of s.routes){expect(t.options.stopOnUnderrun).toBe(true);expect(t.options.endFrame).toBeGreaterThan(96000);expect(t.r.node.connect.mock.calls[0][0].gain.value).toBe(0);expect(t.r.dispose).toHaveBeenCalledOnce();}
 expect(s.routes[1].options.options.poolBlocks).toBe(12);expect(s.routes[3].options.options.poolBlocks).toBe(12);
 expect(s.host.openSourceStem).toHaveBeenCalledOnce();expect(s.lease.release).toHaveBeenCalledOnce();expect(s.lease.input.disconnect).not.toHaveBeenCalled();expect(s.config.loadAssets).toHaveBeenCalledOnce();
 await suite.stop();expect(s.done).toHaveBeenCalledOnce();
});
it('never accepts missing delivery, recycle or clock evidence as a passing silent check',async()=>{
 const s=setup(),p=createWorkbenchTestSuite(s.config);await p.ready;await finishCase(s,0);await vi.waitFor(()=>expect(s.routes).toHaveLength(2));
 const get=s.routes[1].r.stats.getMockImplementation();s.routes[1].r.stats.mockImplementation(async()=>{const r=await get();delete r.output.queue.lateBlocks;return r;});
 for(let i=1;i<4;i++)await finishCase(s,i);await vi.waitFor(()=>expect(s.done).toHaveBeenCalledOnce());const r=s.done.mock.calls[0][0];expect(r.suite).toMatchObject({complete:true,passedCases:3,checksPassed:false});expect(r.suite.checks[1].checks.delivery).toBe(false);
 expect(sourceTestChecks({}).pass).toBe(false);
});
it('stops all cases on a delivery gap, preserving the failed case and releasing actual sources',async()=>{
 const s=setup(),p=createWorkbenchTestSuite(s.config);await p.ready;await finishCase(s,0);await vi.waitFor(()=>expect(s.routes).toHaveLength(2));s.routes[1].options.onFinished({reason:'delivery-gap'});
 await vi.waitFor(()=>expect(s.done).toHaveBeenCalledOnce());expect(s.done.mock.calls[0][0]).toMatchObject({reason:'suite-stopped',suite:{complete:false,checksPassed:false,passedCases:1},trials:[{reason:'probe-completed'},{reason:'delivery-gap'}]});expect(s.routes).toHaveLength(2);expect(s.lease.release).toHaveBeenCalledOnce();await p.stop();
});
it('cancels in preparation and between cases without launching a late owner',async()=>{
 const s=setup();let resolve;s.config.loadAssets=()=>new Promise(r=>{resolve=r;});const p=createWorkbenchTestSuite(s.config);await vi.waitFor(()=>expect(resolve).toBeTypeOf('function'));await p.stop();resolve({manifest:{version:'test'}});await p.ready;expect(s.routes).toHaveLength(0);expect(s.lease.release).toHaveBeenCalledOnce();
 const t=setup();let q;t.config.onState=(phase,progress)=>{if(phase==='preparing'&&progress?.trial===2)void q.stop();};q=createWorkbenchTestSuite(t.config);await q.ready;await finishCase(t,0);await vi.waitFor(()=>expect(t.done).toHaveBeenCalledOnce());expect(t.routes).toHaveLength(1);expect(t.lease.release).toHaveBeenCalledOnce();
});
it('fails closed on source invalidation or executor fallback',async()=>{
 const s=setup(),p=createWorkbenchTestSuite(s.config);await p.ready;s.lease.assertCurrent.mockImplementation(()=>{throw Error('kit changed');});await finishCase(s,0);await vi.waitFor(()=>expect(s.done).toHaveBeenCalledOnce());expect(s.routes).toHaveLength(1);expect(s.done.mock.calls[0][0].error).toContain('kit changed');expect(s.lease.release).toHaveBeenCalledOnce();
 const t=setup(),make=t.config.makeRoute.getMockImplementation();t.config.makeRoute=async(...args)=>{const r=await make(...args);if(t.routes.length===2)r.executor.actual='serial';return r;};const q=createWorkbenchTestSuite(t.config);await q.ready;await finishCase(t,0);await vi.waitFor(()=>expect(t.done).toHaveBeenCalledOnce());expect(t.done.mock.calls[0][0].suite.complete).toBe(false);expect(t.routes[1].r.start).not.toHaveBeenCalled();expect(t.lease.release).toHaveBeenCalledOnce();
});
it('rejects invalid roles, contexts and fully muted sets before running, and handles host closure',async()=>{
 for(const patch of [{roles:[]},{roles:['lead','lead']},{mutedRoles:['lead']}]){const s=setup();Object.assign(s.config,patch);await expect(createWorkbenchTestSuite(s.config).ready).rejects.toThrow();expect(s.routes).toHaveLength(0);}
 const s=setup();s.host.context.sampleRate=96000;await expect(createWorkbenchTestSuite(s.config).ready).rejects.toThrow('48 kHz');expect(s.host.openSourceStem).not.toHaveBeenCalled();
 const t=setup(),p=createWorkbenchTestSuite(t.config);await p.ready;t.host.openSourceStem.mock.calls[0][1]();await vi.waitFor(()=>expect(t.done).toHaveBeenCalledOnce());expect(t.done.mock.calls[0][0].reason).toBe('host-closed');expect(t.routes).toHaveLength(1);expect(t.lease.release).toHaveBeenCalledOnce();
});
