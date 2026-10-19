// @vitest-environment node
import fs from 'node:fs';
import vm from 'node:vm';
import {percussionPresetKit} from '../app/percussionVoices';
const module=new WebAssembly.Module(fs.readFileSync('public/synth-lab/percussion.wasm'));
const make=(rate=48000)=>{const e=new WebAssembly.Instance(module,{}).exports;e.init(rate);return e;};
function render(e,n,block=128){const data=new Float32Array(n*2);for(let i=0;i<n;i+=block){const size=Math.min(block,n-i);e.process(size);const out=new Float32Array(e.memory.buffer,e.output_ptr(),256);for(let j=0;j<size;j++){data[(i+j)*2]=out[j];data[(i+j)*2+1]=out[128+j];}}return data;}
const hit=(e,drum,frame,model=0,id=1)=>e.hit(drum,frame,.5,.7,0,0,1,id,model);
const rms=a=>Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length);
test('future hits remain queued data, allocate no voices or memory, and start on the exact sample',()=>{
 const e=make();const memory=e.memory.buffer.byteLength;
 for(let i=0;i<500;i++)expect(hit(e,i%14,960000+i*1000,0,i+1)).toBe(1);
 expect(e.stat(0)).toBe(0);expect(e.stat(1)).toBe(500);expect(rms(render(e,1000))).toBe(0);expect(e.memory.buffer.byteLength).toBe(memory);
 e.clear();e.set_frame(0);const at=e.stat(5)+256;hit(e,0,at);expect(rms(render(e,256))).toBe(0);expect(rms(render(e,512))).toBeGreaterThan(.01);
});
test('out-of-order events and block sizes preserve deterministic PCM',()=>{
 const a=make(),b=make();for(const e of[a,b]){hit(e,11,1800);hit(e,0,41);hit(e,10,511);}
 expect(render(a,8000,1)).toEqual(render(b,8000,128));
});
test('bounded queue reports overflow and clear removes all future and active hits',()=>{
 const e=make();for(let i=0;i<8192;i++)expect(hit(e,0,100000+i)).toBe(1);expect(hit(e,0,200000)).toBe(0);expect(e.stat(3)).toBe(1);e.clear();expect(e.stat(1)).toBe(0);expect(rms(render(e,1000))).toBe(0);expect(e.hit(99,0,1,1,0,0,1,1,0)).toBe(0);expect(hit(e,0,Infinity)).toBe(0);
});
test('a full hit queue cannot reject a scheduled stop',()=>{
 const e=make();for(let i=0;i<8192;i++)hit(e,0,100000+i);
 e.silence(200000);expect(e.stat(1)).toBe(8192);expect(e.stat(3)).toBe(1);
 e.set_frame(200000);render(e,1500);expect(e.stat(0)).toBe(0);expect(e.stat(1)).toBe(0);
});
test('silence cancels old future hits, fades active hits, and does not cancel newly scheduled replacements',()=>{
 const e=make();hit(e,0,0);hit(e,10,5000);e.silence(1000);hit(e,6,3000);render(e,2500);expect(e.stat(0)).toBe(0);expect(e.stat(1)).toBe(1);expect(rms(render(e,1000))).toBeGreaterThan(.01);render(e,30000);expect(e.stat(0)).toBe(0);expect(e.stat(1)).toBe(0);
});
test('voice stealing stays bounded, finite and allocation-free under a large simultaneous stack',()=>{
 const e=make();const memory=e.memory.buffer.byteLength;for(let i=0;i<100;i++)hit(e,i%14,128,0,i+1);const a=render(e,5000);expect(e.stat(6)).toBe(64);expect(e.stat(2)).toBe(36);expect(a.every(Number.isFinite)).toBe(true);expect(e.memory.buffer.byteLength).toBe(memory);
});
test.each([44100,48000,96000])('all 14 slots and all three models produce finite sound and finish at %i Hz',rate=>{
 const e=make(rate);
 for(let model=0;model<3;model++)for(let drum=0;drum<14;drum++){
  e.clear();hit(e,drum,e.stat(5),model);const a=render(e,Math.ceil(rate*.25));expect(a.every(Number.isFinite)).toBe(true);expect(rms(a)).toBeGreaterThan(.00001);
  e.set_frame(e.stat(5)+rate*10); // Voice ages are rendered, not tied to frame skips.
  render(e,Math.ceil(rate*5));expect(e.stat(0)).toBe(0);
 }
});
test('808 closed hats fade the open hat without choking the compatibility brush swish',()=>{
 for(const model of[0,1]){const e=make();hit(e,5,0,model);render(e,1000);hit(e,4,1000,model);render(e,1000);expect(e.stat(0)).toBe(model===0?2:1);}
});
test('zero level mutes active and future output after the 20ms smoothing tail',()=>{
 const e=make();e.level(0,0);render(e,48000);hit(e,0,e.stat(5));expect(rms(render(e,10000))).toBeLessThan(1e-12);
});
function worklet(offline=false){let Type;const scope={WebAssembly,sampleRate:48000,currentFrame:0,AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(_,c)=>Type=c};vm.runInNewContext(fs.readFileSync('public/synth-lab/percussion-processor.js','utf8'),scope);const p=new Type({processorOptions:{module,endFrame:offline?48000:null}});const output=[[new Float32Array(128),new Float32Array(128)]];return{p,scope,output,step(){output[0].forEach(a=>a.fill(0));return p.process([],output);},send(data){p.port.onmessage({data});}};}
test('worklet handles repeated and forward-gap realtime stamps without rewinding',()=>{
 const a=worklet(),b=worklet();for(const k of[a,b])k.send({type:'hit',values:[0,1000,.5,.7,0,0,1,1,0]});
 for(let i=0;i<30;i++){a.scope.currentFrame=i*128;b.scope.currentFrame=i>=8&&i<=12?7*128:i*128;a.step();b.step();expect(b.output).toEqual(a.output);expect(b.p.clock).toBe((i+1)*128);}
 expect(b.p.resyncs).toBe(0);b.scope.currentFrame=48000;b.step();expect(b.p.clock).toBe(48128);expect(b.p.resyncs).toBe(1);
});
test('offline processor ignores realtime frame and dispose terminates rendering',()=>{
 const a=worklet(true);a.scope.currentFrame=48000;a.step();expect(a.p.clock).toBe(128);a.send({type:'dispose'});expect(a.step()).toBe(false);
});


test('a new voice remaps future attacks in place, including legacy mapped event IDs',()=>{
 for(const [preset,inputs,targets,model]of [[1,[12,11,13],[0,1,4],0],[2,[0,1,4],[12,11,13],0],[3,[12,1,13],[0,11,4],1],[4,[12,11,13],[0,1,4],2]]){
  const a=make(),b=make();inputs.forEach((drum,i)=>hit(a,drum,128+i*4000,0,i+1));a.voice_preset(preset);
  targets.forEach((drum,i)=>hit(b,drum,128+i*4000,model,i+1));
  expect(a.stat(1)).toBe(3);expect(render(a,16000)).toEqual(render(b,16000));expect(a.stat(3)).toBe(0);
 }
});
test('queued attacks use current tone/length while sounding hits retain their timbre',()=>{
 const a=make(),b=make();for(const e of[a,b]){e.voice_preset(1);hit(e,0,0);render(e,128);}
 a.voice_preset(3);a.tone_param(0,1);a.decay_param(0,2);expect(render(a,2000)).toEqual(render(b,2000));
 const c=make(),d=make();hit(c,0,128);c.voice_preset(1);c.tone_param(0,-.5);c.decay_param(0,1.5);d.hit(0,128,.5,.7,0,-.5,1.5,1,0);expect(render(c,16000)).toEqual(render(d,16000));
});


test('hand percussion keeps modal bodies distinct and bounds an overlapping hand-kit queue',()=>{
 const e=make();e.voice_preset(4);const memory=e.memory.buffer.byteLength;
 const signatures=[];
 for(let drum=0;drum<11;drum++){
  e.clear();e.hit(drum,e.stat(5),.5,.7,0,0,1,1,0);const out=render(e,24000);expect(out.every(Number.isFinite)).toBe(true);expect(Math.max(...out.map(Math.abs))).toBeLessThan(1);signatures.push(rms(out));
 }
 expect(new Set(signatures.map(n=>n.toFixed(5))).size).toBe(11);
 e.clear();for(let i=0;i<400;i++)hit(e,i%11,e.stat(5)+i*128,2,i+1);
 expect(e.stat(1)).toBe(400);expect(e.stat(0)).toBe(0);expect(render(e,96000).every(Number.isFinite)).toBe(true);expect(e.stat(3)).toBe(0);expect(e.memory.buffer.byteLength).toBe(memory);
});

test('Hand kit energy sits near Felt at equal velocity, with headroom for its quiet extras',()=>{
 const handKit=percussionPresetKit('hand');
 const names=['kick','brush','shaker','rim','hat','swish','tom','clap','ride','crash','bell'];
 for(let drum=0;drum<names.length;drum++){
  const felt=make(),hand=make();hit(felt,drum,0);hit(hand,drum,0,2);
  const reference=render(felt,48000),candidate=render(hand,48000),trim=handKit[names[drum]].level;
  const ratio=rms(candidate)*trim/rms(reference);
  // Comparable roles need comparable audible energy, even with different envelopes.
  expect(ratio,names[drum]).toBeGreaterThan(.5);expect(ratio,names[drum]).toBeLessThan(1.35);
  expect(candidate.every(Number.isFinite)).toBe(true);expect(Math.max(...candidate.map(Math.abs))*trim).toBeLessThan(.85);
 }
});
