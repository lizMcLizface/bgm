// @vitest-environment node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {defaultEffects,sanitizeEffects,effectTriples,effectTail,delayAtTempo} from './effectsConfig';
const binary=fs.readFileSync('public/synth-lab/effects.wasm'),module=new WebAssembly.Module(binary);
function engine(settings={},rate=48000){const e=new WebAssembly.Instance(module,{}).exports;e.fx_init(rate);for(const pair of effectTriples({...defaultEffects(),...settings}))e.fx_param(...pair);return e;}
function render(e,seconds,{rate=48000,impulse=false,chunk=128}={}){
 const n=Math.round(seconds*rate),left=new Float32Array(n),right=new Float32Array(n);
 const inputs=Array.from({length:6},(_,c)=>new Float32Array(e.memory.buffer,e.fx_input(c),2048));
 for(let at=0;at<n;at+=chunk){const count=Math.min(chunk,n-at);for(const x of inputs){x.fill(0);if(at===0&&impulse)x[0]=.25;}
  e.fx_render(count);left.set(new Float32Array(e.memory.buffer,e.fx_output(0),count),at);right.set(new Float32Array(e.memory.buffer,e.fx_output(1),count),at);
 }return [left,right];
}
const rms=x=>Math.sqrt(x.reduce((sum,n)=>sum+n*n,0)/Math.max(1,x.length));
test('effects artifact matches its Rust source and its independent ABI',()=>{
 const m=JSON.parse(fs.readFileSync('public/synth-lab/effects-build.json'));
 const hash=crypto.createHash('sha256').update(['synth-engine/effects/Cargo.toml','synth-engine/effects/src/lib.rs','synth-engine/common/headroom.rs'].map(f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n')).join('\n')).digest('hex');
 expect(m.source).toBe(hash);expect(m.wasm).toBe(crypto.createHash('sha256').update(binary).digest('hex'));expect(engine().fx_api()).toBe(1);
});
test('echo arrives on time, feeds across stereo channels and ends cleanly after clear',()=>{
 for(const rate of [44100,48000,96000]){
  const e=engine({dry:0,reverb:0,delay:.5,delayMs:100,feedback:.5,delayToReverb:0},rate);
  const ins=Array.from({length:6},(_,c)=>new Float32Array(e.memory.buffer,e.fx_input(c),2048));let first=-1,rightSecond=0;
  for(let at=0;at<rate/2;at+=128){for(const x of ins)x.fill(0);if(at===0)ins[4][0]=.25;e.fx_render(128);
   const l=new Float32Array(e.memory.buffer,e.fx_output(0),128),r=new Float32Array(e.memory.buffer,e.fx_output(1),128);
   for(let i=0;i<128;i++){if(first<0&&Math.abs(l[i])>1e-5)first=at+i;if(at+i>rate*.19&&at+i<rate*.23)rightSecond=Math.max(rightSecond,Math.abs(r[i]));}
  }expect(Math.abs(first-rate*.1)).toBeLessThanOrEqual(1);expect(rightSecond).toBeGreaterThan(.001);expect(e.fx_stat(5)).toBe(0);e.fx_clear();const [l]=render(e,.1,{rate});expect(rms(l)).toBe(0);
 }
});

test('delay-only input skips the FDN, while an echo sent to the room wakes it on arrival',()=>{
 const e=engine({dry:0,reverb:0,delay:.8,delayMs:409,feedback:.4,delayToReverb:0});
 render(e,.5,{impulse:true});expect(e.fx_stat(5)).toBe(0);expect(e.fx_stat(4)).toBe(0);
 const room=engine({dry:0,reverb:0,delay:.8,delayMs:409,feedback:.4,delayToReverb:.2});
 render(room,.3,{impulse:true});expect(room.fx_stat(5)).toBe(0);
 render(room,.3);expect(room.fx_stat(5)).toBeGreaterThan(1000);expect(room.fx_stat(4)).toBe(1);
});

test('turning off a reverb send preserves its tail and then parks the network while echo keeps running',()=>{
 const e=engine({dry:0,reverb:.4,delay:.8,delayToReverb:0,decay:.3});
 render(e,.25,{impulse:true});const before=e.fx_stat(5);e.fx_param(1,0);
 const [tail]=render(e,.25);expect(rms(tail)).toBeGreaterThan(1e-8);expect(e.fx_stat(5)).toBeGreaterThan(before);
 const ins=Array.from({length:6},(_,c)=>new Float32Array(e.memory.buffer,e.fx_input(c),2048));
 const stream=seconds=>{for(let at=0;at<seconds*48000;at+=128){for(const x of ins)x.fill(0);for(let i=0;i<128;i++){const x=.1*Math.sin(2*Math.PI*440*(at+i)/48000);ins[2][i]=ins[3][i]=ins[4][i]=ins[5][i]=x;}e.fx_render(128);}};
 stream(3);expect(e.fx_stat(1)).toBe(0);expect(e.fx_stat(4)).toBe(0);
 const parked=e.fx_stat(5);stream(.5);expect(e.fx_stat(5)).toBe(parked);
 e.fx_param(1,.4);stream(.1);expect(e.fx_stat(4)).toBe(1);expect(e.fx_stat(5)).toBeGreaterThan(parked);
});
test('longer decay retains a tail without growing memory, and 8/16-line outputs stay finite',()=>{
 for(const quality of [0,1]){
  const short=engine({dry:0,delay:0,delayToReverb:0,decay:1,quality}),long=engine({dry:0,delay:0,delayToReverb:0,decay:12,quality});
  const memory=long.memory.buffer.byteLength;
  const [a]=render(short,5,{impulse:true}),[b]=render(long,5,{impulse:true});
  expect([...b].every(Number.isFinite)).toBe(true);expect(rms(b.slice(48000*3))).toBeGreaterThan(rms(a.slice(48000*3))*100);
  expect(long.memory.buffer.byteLength).toBe(memory);expect(short.memory.buffer.byteLength).toBe(memory);
 }
});
test('effects are deterministic across block sizes and bypass is dry with no resurrected tail',()=>{
 const run=chunk=>render(engine(),.5,{impulse:true,chunk})[0];expect(run(1)).toEqual(run(257));
 const e=engine();render(e,.4,{impulse:true});e.fx_param(15,1);const [dry]=render(e,.1,{impulse:true});expect(dry[0]).toBe(.25);expect(rms(dry.slice(1))).toBe(0);
 e.fx_param(15,0);expect(rms(render(e,.5)[0])).toBe(0);
});
test('finished tails sleep, wake on new sends, and extreme parameters do not produce nonfinite output',()=>{
 const e=engine({dry:0,delay:0,delayToReverb:0,decay:.3,modulation:1,damping:16000,size:1});render(e,5,{impulse:true});expect(e.fx_stat(1)).toBe(1);
 const [x]=render(e,.5,{impulse:true});expect(rms(x)).toBeGreaterThan(0);expect(e.fx_stat(1)).toBe(0);
 e.fx_param(3,30);e.fx_param(10,.85);e.fx_param(2,.8);const [high]=render(e,2,{impulse:true});expect([...high].every(Number.isFinite)).toBe(true);expect(Math.max(...high.map(Math.abs))).toBeLessThanOrEqual(1);
});
test('settings, tempo divisions and export tail bounds are finite and backward compatible',()=>{
 expect(sanitizeEffects({decay:Infinity,feedback:1e9,quality:1.5}).feedback).toBe(.85);
 expect(delayAtTempo(120,.75)).toBe(375);expect(delayAtTempo(40,1.5)).toBe(2000);
 expect(effectTail({...defaultEffects(),bypass:1})).toBe(0);expect(effectTail({...defaultEffects(),decay:20})).toBeGreaterThan(30);
});

test('a long tail retains an audible midrange body at ordinary sends across sample rates and quality tiers',()=>{
 for(const rate of [44100,48000,96000])for(const quality of [0,1]){
  const e=engine({dry:0,delay:0,delayToReverb:0,reverb:.22,decay:20,quality},rate);
  const ins=Array.from({length:6},(_,c)=>new Float32Array(e.memory.buffer,e.fx_input(c),2048));
  const out=new Float32Array(rate*8);
  for(let at=0;at<out.length;at+=128){
   const n=Math.min(128,out.length-at);for(const x of ins)x.fill(0);
   for(let i=0;i<n;i++){const t=(at+i)/rate;ins[2][i]=ins[3][i]=t<.3?.1*Math.sin(2*Math.PI*1000*t)*Math.sin(Math.PI*t/.3)**2:0;}
   e.fx_render(n);out.set(new Float32Array(e.memory.buffer,e.fx_output(0),n),at);
  }
  const early=rms(out.slice(rate,rate*2)),late=rms(out.slice(rate*6,rate*7));
  // Protect absolute wet level as well as decay. The previous implementation
  // passed a broadband RT60 fit while losing the useful midrange far sooner.
  expect(20*Math.log10(early)).toBeGreaterThan(-46);
  expect(20*Math.log10(late)).toBeGreaterThan(-65);
  expect(late/early).toBeGreaterThan(.08);expect(late/early).toBeLessThan(.3);
 }
});

test('reverb return changes only wet gain and live edits are sample-consistent across blocks',()=>{
 const settings={dry:0,delay:0,delayToReverb:0,reverb:.1,decay:8};
 const a=render(engine({...settings,reverbReturn:0}),1,{impulse:true})[0],b=render(engine({...settings,reverbReturn:12}),1,{impulse:true})[0];
 expect(rms(b)/rms(a)).toBeGreaterThan(3.95);expect(rms(b)/rms(a)).toBeLessThan(4.01);
 const run=chunk=>{const e=engine(settings);render(e,.5,{impulse:true});e.fx_param(16,12);return render(e,.5,{chunk})[0];};
 expect(run(1)).toEqual(run(257));
 expect(sanitizeEffects({reverbReturn:Infinity}).reverbReturn).toBe(0);
 expect(sanitizeEffects({reverbReturn:900}).reverbReturn).toBe(18);
 expect(effectTail({...settings,reverbReturn:18})).toBeGreaterThan(effectTail({...settings,reverbReturn:0}));
});
