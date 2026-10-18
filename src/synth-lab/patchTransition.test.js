// @vitest-environment node
import fs from 'node:fs';
import vm from 'node:vm';
import {PatchTransition,coreDiscrete,coreLog,fmDiscrete,fmLog,flattenFM} from '../../public/synth-lab/patch-transition';
import {initialPatch,parameterTriples} from './patch';
import {initialFM,fmPacket} from './fmPatch';
import {behaviorConfig,behaviorFixture,BEHAVIOR_SOUNDS,BEHAVIOR_EXAMPLES} from './behaviorFixtures';
const performance={mode:0,portamento:0,glide:'overlap'};
test('continuous controls reach exact targets, frequency ramps are logarithmic and retarget from the audible setting',()=>{
 const apply=vi.fn(),t=new PatchTransition([[1,9,100],[0,4,.3]],performance,apply,()=>{},coreDiscrete,coreLog,48000);
 t.schedule([[1,9,1600],[0,4,.1]],performance,100,.1);t.tick(99);expect(apply).not.toHaveBeenCalled();t.tick(100);t.tick(2500);expect(t.values.get('1:9')).toBeCloseTo(400);expect(t.values.get('0:4')).toBeCloseTo(.2);
 t.schedule([[1,9,100],[0,4,.3]],performance,2500,.1);t.tick(2500);expect(t.values.get('1:9')).toBeCloseTo(400);t.tick(7300);expect(t.values.get('1:9')).toBe(100);expect(t.values.get('0:4')).toBe(.3);expect(t.active).toBe(null);
});
test('discrete changes switch only at the muted midpoint and rapid edits retain bounded gain slew',()=>{
 const apply=vi.fn(),t=new PatchTransition([[1,0,3]],performance,apply,()=>{},coreDiscrete,coreLog,48000);t.schedule([[1,0,2]],performance,0,.06);t.tick(0);let previous=1,maxStep=0,atMiddle;
 for(let i=0;i<=3000;i++){if(i===1400){t.schedule([[1,0,4]],performance,i,.06);t.tick(i);}if(i%16===0)t.tick(i);const gain=t.gain(i);maxStep=Math.max(maxStep,Math.abs(gain-previous));previous=gain;if(i===1440)atMiddle=gain;}
 expect(maxStep).toBeLessThanOrEqual(1/(48000*.004)+1e-12);expect(atMiddle).toBeLessThan(1);t.tick(5000);expect(t.values.get('1:0')).toBe(4);
 const clean=new PatchTransition([[1,0,3]],performance,apply,()=>{},coreDiscrete,coreLog,48000);clean.schedule([[1,0,2]],performance,0,.06);for(let i=0;i<=1440;i++){if(i%16===0)clean.tick(i);clean.gain(i);}expect(clean.outputGain).toBeCloseTo(0,8);expect(clean.values.get('1:0')).toBe(2);
});
test('patch queues are bounded/coalesce same-frame edits; panic clears queued and active transitions',()=>{
 const t=new PatchTransition([[0,4,.3]],performance,()=>{},()=>{},coreDiscrete,coreLog,48000);for(let i=0;i<32;i++)t.schedule([[0,4,.2]],performance,100+i*100,.06);t.schedule([[0,4,.1]],performance,100,.1);expect(t.pending).toHaveLength(32);expect(()=>t.schedule([[0,4,.2]],performance,99999,.06)).toThrow('full');expect(()=>t.schedule([[0,4,NaN]],performance,0,.06)).toThrow();t.tick(100);expect(t.active).toBeTruthy();t.clear();expect(t.pending).toHaveLength(0);expect(t.active).toBe(null);expect(t.gain(10000)).toBe(1);
});
function processor(kind,patches=[]){
 const fm=kind==='fm',p=fm?initialFM():initialPatch(),messages=[];let Type;
 const node={port:{onmessage:null,postMessage:m=>messages.push(m),close(){}}};class Base{constructor(){this.port=node.port;}}
 const source=fs.readFileSync('public/synth-lab/patch-transition.js','utf8').replace(/export /g,'')+';'+fs.readFileSync(`public/synth-lab/${fm?'fm-processor':'processor'}.js`,'utf8').replace(/^import .*$/gm,'');
 vm.runInNewContext(source,{AudioWorkletProcessor:Base,WebAssembly,sampleRate:48000,currentFrame:0,registerProcessor:(_,t)=>{Type=t;}});
 const packet=fm?fmPacket(p):parameterTriples(p),o={module:new WebAssembly.Module(fs.readFileSync(`public/synth-lab/${kind}.wasm`)),parameters:packet,patch:packet,offline:true,events:[[0,1,0,57,.7],[1,1,30000,0,0]],patches,performance};return {p:new Type({processorOptions:o}),messages};
}
for(const kind of ['core','fm'])test(kind+': worklet patch events preserve pre-edit PCM, held voices and deterministic scheduling',()=>{
 const initial=kind==='fm'?initialFM():initialPatch(),edited=structuredClone(initial);if(kind==='fm')edited.global.gain=.03;else edited.global.gain=.03;
 const patches=[{frame:6000,seconds:.06,values:kind==='fm'?undefined:parameterTriples(edited),patch:kind==='fm'?fmPacket(edited):undefined,performance}];
 const render=(changes,chunk)=>{const {p,messages}=processor(kind,changes),data=new Float32Array(20000);for(let i=0;i<data.length;i+=chunk){const n=Math.min(chunk,data.length-i),out=[[new Float32Array(n),new Float32Array(n)]];expect(p.process([],out)).toBe(true);data.set(out[0][0],i);}expect(messages.some(m=>m.type==='error')).toBe(false);return data;};
 // Control interpolation uses the callback's small grid; sample-timed edit start is exact.
 const baseline=render([],128),a=render(patches,128),b=render(patches,257);expect(a).toEqual(b);expect(a.slice(0,6000)).toEqual(baseline.slice(0,6000));expect(a.slice(12000)).not.toEqual(baseline.slice(12000));
 const {p}=processor(kind,patches);p.port.onmessage({data:{type:'panic'}});const out=[[new Float32Array(128),new Float32Array(128)]];p.process([],out);expect([...out[0][0]].every(x=>x===0)).toBe(true);expect(p.transition.pending).toHaveLength(0);
});
test('every comparison keeps equal scores/windows, valid modes and explicit patch-change times',()=>{
 for(const [sound]of BEHAVIOR_SOUNDS)for(const [example]of BEHAVIOR_EXAMPLES){const f=behaviorFixture({sound,example});expect(f.rows).toHaveLength(3);expect(f.rows.every(r=>r.events===f.events)).toBe(true);expect(f.seconds).toBeGreaterThan(f.scoreSeconds);expect(f.events.every(e=>e.every(Number.isFinite))).toBe(true);if(example==='patch'){expect(f.rows.map(r=>r.patches[0].seconds)).toEqual([0,.06,.25]);expect(f.rows.every(r=>r.patch.performance.mode===0)).toBe(true);}else expect(f.rows.map(r=>r.patch.performance.mode)).toEqual([0,1,2]);}
 expect(behaviorConfig({rate:0,mode:999,portamento:Infinity,transition:-1})).toMatchObject({rate:48000,mode:2,portamento:.18,transition:.016});expect(flattenFM(fmPacket(initialFM()))).toHaveLength(54+6*22+36+6);expect(fmDiscrete(1,17)).toBe(true);expect(fmDiscrete(1,21)).toBe(true);expect(coreDiscrete(1,99)).toBe(true);expect(fmLog(1,0)).toBe(true);
});
