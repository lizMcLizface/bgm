const mocks=vi.hoisted(()=>({made:[],factory:vi.fn(),limiter:null}));
vi.mock('./graph',()=>({createRack:(...args)=>mocks.factory(...args)}));
vi.mock('../all/mixerAudio',async()=>({...await vi.importActual('../all/mixerAudio'),createDeskLimiter:async c=>{const n=c.make('limiter');n.port={postMessage:vi.fn()};mocks.limiter=n;return n;}}));
import {createParallelRack,createWorkbenchRack} from './workbenchRack';
import {parallelPreset} from './parallelModel';
import {cleanRack,rackPackets} from './params';

function context(){
 const nodes=[],param=v=>({value:v,cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(function(x){this.value=x;}),setTargetAtTime:vi.fn(function(x){this.value=x;})});
 const make=kind=>{const links=[],n={kind,links,gain:param(1),frequency:param(1000),Q:param(1),pan:param(0),connect:vi.fn((to,channel)=>{links.push(to);if(kind==='split')to.sourceChannel=channel;return to;}),disconnect:vi.fn(to=>{if(to){const i=links.indexOf(to);if(i>=0)links.splice(i,1);}else links.length=0;}),getFloatTimeDomainData:vi.fn(a=>a.fill(n.sourceChannel===1?-.7:.2))};nodes.push(n);return n;};
 return {nodes,make,currentTime:0,sampleRate:48000,createGain:()=>make('gain'),createBiquadFilter:()=>make('filter'),createStereoPanner:()=>make('pan'),createChannelSplitter:()=>make('split'),createChannelMerger:()=>make('merge'),createAnalyser:()=>make('analyser')};
}
function rack(c,values,options){
 const input=c.make('rack-input'),node=c.make('rack-output');input.connect(node);
 const r={input,node,values,options,patch:vi.fn(),connect:to=>node.connect(to),dispose:vi.fn(()=>{input.disconnect();node.disconnect();}),clear:vi.fn(),setInstances:vi.fn(),reduction:0,meters:{drivePeaks:{}}};mocks.made.push(r);return r;
}
beforeEach(()=>{mocks.made=[];mocks.factory.mockReset().mockImplementation(async(...args)=>rack(...args));});
it('fans out once to dry/drive/wet and routes only their summed master through its own insert and limiter',async()=>{
 const c=context(),p=parallelPreset(),g=await createParallelRack(c,cleanRack(),p);
 expect(mocks.made).toHaveLength(3);const [drive,wet,master]=mocks.made;
 expect(wet.options.instances.chain).toEqual(['zplane','chorus','vibrato','delay']);expect(rackPackets(wet.values).extras.zplane.on).toBe(true);expect(rackPackets(wet.values).inserts.chorus).toBe(.8);
 expect(wet.values['effects.delayMs']).toBe(375);expect(master.values['effects.delayMs']).toBe(125);
 const splitter=c.nodes.find(n=>n.links.includes(drive.input)&&n.links.includes(wet.input));expect(splitter.links).toHaveLength(3);expect(splitter.links.filter(n=>n.kind==='rack-input')).toHaveLength(2);
 expect(master.node.links.some(n=>n.links.some(fader=>fader.links.includes(mocks.limiter)))).toBe(true);expect(drive.node.links).not.toContain(master.input);expect(wet.node.links).not.toContain(master.input);
 p.buses.wet.rack['effects.delayMs']=777;g.patch(cleanRack(),false,null,p);expect(wet.patch.mock.lastCall[0]['effects.delayMs']).toBe(777);expect(master.patch.mock.lastCall[0]['effects.delayMs']).toBe(125);
 const meter=g.openMeters(),read=meter.read();expect(read.wet).toBeCloseTo(.7);expect(read.dry).toBeCloseTo(.7);expect(read.left).toBeCloseTo(.2);expect(read.right).toBeCloseTo(.7);expect(g.meters.busMeters.wet.peak).toBeCloseTo(.7);meter.dispose();meter.dispose();
 g.dispose();g.dispose();expect(mocks.made.every(r=>r.dispose.mock.calls.length===1)).toBe(true);expect(mocks.limiter.disconnect).toHaveBeenCalledOnce();
});
it('prepares live mode changes and applies the latest parameters without replacing source/output endpoints',async()=>{
 const c=context(),g=await createWorkbenchRack(c,cleanRack()),input=g.input,node=g.node,p=parallelPreset();
 g.patch(cleanRack(),false,null,p);const next=structuredClone(p);next.buses.wet.rack['effects.delayMs']=888;g.patch(cleanRack(),false,null,next);
 await vi.waitFor(()=>expect(mocks.made[2]?.patch.mock.lastCall?.[0]['effects.delayMs']).toBe(888));await new Promise(r=>setTimeout(r,80));
 expect(g.input).toBe(input);expect(g.node).toBe(node);expect(mocks.made[0].dispose).toHaveBeenCalledOnce();
 g.patch(cleanRack(),false,null,null);await vi.waitFor(()=>expect(mocks.made).toHaveLength(5));await new Promise(r=>setTimeout(r,80));
 expect(mocks.made.slice(1,4).every(r=>r.dispose.mock.calls.length===1)).toBe(true);g.dispose();expect(mocks.made[4].dispose).toHaveBeenCalledOnce();
});
it('disposes late parallel allocations after shutdown instead of wiring an abandoned graph',async()=>{
 const c=context(),g=await createWorkbenchRack(c,cleanRack());let resolve;
 mocks.factory.mockImplementationOnce((...args)=>new Promise(r=>{resolve=()=>r(rack(...args));}));
 g.patch(cleanRack(),false,null,parallelPreset());g.dispose();resolve();
 await vi.waitFor(()=>expect(mocks.made.length).toBe(4));await vi.waitFor(()=>expect(mocks.made.every(r=>r.dispose.mock.calls.length===1)).toBe(true));expect(g.input.links).toHaveLength(0);
});
