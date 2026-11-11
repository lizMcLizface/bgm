const mocks=vi.hoisted(()=>({buses:[],inserts:[],extras:[],drives:[],bus:vi.fn()}));
vi.mock('./driveStage',()=>({createDriveStage:(_context,kind)=>{const s={...stage(kind),peak:.4};mocks.drives.push(s);return s;}}));
vi.mock('../../synth-lab/effects',()=>({createEffectsBus:(...args)=>mocks.bus(...args)}));
vi.mock('../../synth-lab/inserts',()=>({createInstrumentInserts:async()=>{const i=stage('insert');mocks.inserts.push(i);return i;}}));
vi.mock('./extras',()=>({EXTRA_KINDS:['filter','limiter'],createExtraStage:async(_context,kind,options)=>{const s={...stage(kind),options};mocks.extras.push(s);return s;}}));
import {createRack} from './graph';
import {cleanRack} from './params';
import {logicalOrder,routingPatch} from './routing';
import {moveUnit} from './order';
import {migrateInstances,projectInstances} from './instances';
function param(){return {value:0,setValueAtTime:vi.fn(),setTargetAtTime:vi.fn(),cancelScheduledValues:vi.fn()};}
function node(name){return {name,connect:vi.fn(),disconnect:vi.fn(),gain:param(),threshold:param(),ratio:param(),knee:param(),attack:param(),release:param(),reduction:-4};}
function stage(name){return {input:node(name+'-input'),node:node(name+'-out'),output:node(name+'-out'),patch:vi.fn(),clear:vi.fn(),dispose:vi.fn()};}
function context(){return {currentTime:0,createGain:()=>node('gain'),createDynamicsCompressor:()=>node('compressor'),createAnalyser:()=>({...node('analyser'),getFloatTimeDomainData:data=>data.fill(.1)})};}
const configured=chain=>{const v={...cleanRack(),'effects.delay':.25,'effects.reverb':.3,'compressor.enabled':1};return {...v,...routingPatch(v,{chain})};};
beforeEach(()=>{vi.useFakeTimers();mocks.buses=[];mocks.inserts=[];mocks.extras=[];mocks.drives=[];mocks.bus.mockReset().mockImplementation(async(_ctx,p)=>{const b={...stage('space'),initial:p};mocks.buses.push(b);return b;});});
afterEach(()=>vi.useRealTimers());
it('loads only the required independent bus and masks its opposite effect from construction onward',async()=>{
 const v=configured(['delay']),rack=await createRack(context(),v);expect(mocks.buses).toHaveLength(1);const b=mocks.buses[0];
 expect(b.initial).toMatchObject({delay:.25,reverb:0,delayToReverb:0,dry:1});expect(b.patch.mock.lastCall[0]).toMatchObject({reverb:0,dry:1});
 rack.patch({...v,'effects.feedback':.7});expect(b.patch.mock.lastCall[0].feedback).toBe(.7);rack.clear();expect(b.clear).toHaveBeenCalledOnce();rack.dispose();rack.dispose();expect(b.dispose).toHaveBeenCalledOnce();
});
it('keeps an old rack on its compatible kernel then allocates isolated stages after a structural edit',async()=>{
 const v={...cleanRack(),'effects.delay':.25,'effects.reverb':.3},rack=await createRack(context(),v);expect(mocks.buses).toHaveLength(1);expect(mocks.buses[0].initial).toMatchObject({delay:.25,reverb:.3});
 const next={...v,...routingPatch(v,{order:moveUnit(logicalOrder(v),'delay',0)})};rack.patch(next);await vi.runAllTimersAsync();
 expect(mocks.buses).toHaveLength(3);expect(mocks.buses[1].initial).toMatchObject({delay:.25,reverb:0,dry:1});expect(mocks.buses[2].initial).toMatchObject({delay:0,reverb:.3,delayToReverb:0});
 rack.patch({...next,...routingPatch(next,{chain:['reverb']})});await vi.runAllTimersAsync();expect(mocks.buses).toHaveLength(3);rack.dispose();for(const b of mocks.buses)expect(b.dispose).toHaveBeenCalledOnce();
});
it('uses two independent buses even when delay and reverb are adjacent, and removing delay preserves the reverb processor',async()=>{
 const v=configured(['delay','reverb']),rack=await createRack(context(),v);expect(mocks.buses).toHaveLength(2);const reverb=mocks.buses[1];
 rack.patch({...v,...routingPatch(v,{chain:['reverb']})});await vi.runAllTimersAsync();expect(mocks.buses).toHaveLength(2);expect(reverb.dispose).not.toHaveBeenCalled();expect(reverb.clear).not.toHaveBeenCalled();expect(reverb.patch.mock.lastCall[0]).toMatchObject({reverb:.3,delay:0});rack.dispose();
});
it('disposes a late bus without reconnecting or reporting errors after the rack has closed',async()=>{
 const v=configured([]),onError=vi.fn(),rack=await createRack(context(),v,{onError});let resolve;
 mocks.bus.mockImplementation(()=>new Promise(r=>resolve=r));rack.patch({...v,...routingPatch(v,{chain:['delay']})});await Promise.resolve();rack.dispose();
 const late=stage('late');resolve(late);await vi.runAllTimersAsync();expect(late.dispose).toHaveBeenCalledOnce();expect(late.node.connect).not.toHaveBeenCalled();expect(onError).not.toHaveBeenCalled();
});
it('follows the newest routing if another edit arrives while a bus is loading, and reads real dynamics nodes',async()=>{
 const v=configured(['compressor']),rack=await createRack(context(),v);expect(rack.reduction).toBe(-4);expect(rack.meters.compressorInputDb).toBeCloseTo(-20,3);
 let resolve;mocks.bus.mockImplementationOnce(()=>new Promise(r=>resolve=r));rack.patch({...v,...routingPatch(v,{chain:['delay']})});await Promise.resolve();
 rack.patch({...v,...routingPatch(v,{chain:['reverb']})});resolve(stage('late-delay'));await vi.runAllTimersAsync();
 expect(mocks.bus).toHaveBeenCalledTimes(2);expect(mocks.bus.mock.lastCall[1]).toMatchObject({reverb:.3,delay:0});expect(rack.reduction).toBe(0);rack.dispose();
});
it('inserts native drive stages at their serial positions, retains processors on edits and disposes them once',async()=>{
 const raw=configured(['eq']),graph=migrateInstances(raw);graph.compatibility='serial';graph.chain=['boost','eq','fuzz'];graph.instances.find(i=>i.id==='boost').enabled=true;
 const rack=await createRack(context(),projectInstances(graph,raw),{instances:graph});expect(mocks.drives).toHaveLength(2);const [boost,fuzz]=mocks.drives;expect(boost.output.connect).toHaveBeenCalledWith(mocks.inserts[0].input);expect(mocks.inserts[0].node.connect).toHaveBeenCalledWith(fuzz.input);
 const next=structuredClone(graph);next.instances.find(i=>i.id==='boost').params.gain=18;rack.setInstances(next);expect(boost.patch.mock.lastCall[0].params.gain).toBe(18);expect(mocks.drives).toHaveLength(2);expect(rack.meters.drivePeaks).toEqual({boost:.4,fuzz:.4});
 next.chain=['fuzz','eq','boost'];rack.patch(projectInstances(next,raw),false,next);await vi.runAllTimersAsync();expect(fuzz.output.connect).toHaveBeenCalledWith(mocks.inserts[0].input);expect(mocks.inserts[0].node.connect).toHaveBeenLastCalledWith(boost.input);rack.dispose();rack.dispose();expect(boost.dispose).toHaveBeenCalledOnce();expect(fuzz.dispose).toHaveBeenCalledOnce();
});

it('forwards a prepared optional plugin factory and error callback without changing native stages',async()=>{const pluginFactory=vi.fn(),onError=vi.fn(),rack=await createRack(context(),configured(['filter']),{pluginFactory,onError});expect(mocks.extras[0].options).toMatchObject({pluginFactory,onError,initialPacket:expect.any(Object)});rack.clear();rack.dispose();expect(pluginFactory).not.toHaveBeenCalled();});

it('uses an optional whole dynamics stage, retains the pre-DSP detector and disposes async state once',async()=>{const ctx=context(),gains=[];ctx.createDynamicsCompressor=vi.fn(()=>node('native'));ctx.createGain=()=>{const n=node('gain-'+gains.length);gains.push(n);return n;};const owned={...stage('owned-compressor'),reduction:-9,arm:vi.fn(async()=>({ready:true})),dispose:vi.fn(async()=>{})},factory=vi.fn(()=>owned),onError=vi.fn(),rack=await createRack(ctx,configured(['compressor','limiter']),{dynamicsFactory:factory,onError});expect(ctx.createDynamicsCompressor).not.toHaveBeenCalled();expect(factory).toHaveBeenCalledWith(ctx,{kind:'compressor',onError});expect(gains[5].connect).toHaveBeenCalledWith(owned.input);expect(gains[5].connect.mock.calls.some(([n])=>n!==owned.input)).toBe(true);expect(owned.patch).toHaveBeenCalledWith(expect.objectContaining({enabled:1}),true);expect(mocks.extras[0].options.dynamicsFactory).toBe(factory);expect(rack.reduction).toBe(-9);await rack.armRuntime();expect(owned.arm).toHaveBeenCalledOnce();const closing=rack.dispose();expect(rack.dispose()).toBe(closing);await closing;expect(owned.dispose).toHaveBeenCalledOnce();expect(gains.every(g=>g.disconnect.mock.calls.length===1)).toBe(true);});
