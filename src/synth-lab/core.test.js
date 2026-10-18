// @vitest-environment node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {initialPatch,parameterTriples,clonePatch,RECIPES} from './patch';
const bytes=fs.readFileSync('public/synth-lab/core.wasm');
const wasmModule=new WebAssembly.Module(bytes);
function engine(patch=initialPatch(),sr=48000){const e=new WebAssembly.Instance(wasmModule,{}).exports;e.engine_init(sr);for(const triple of parameterTriples(patch))e.engine_param(...triple);return e;}
function render(e,frames,chunk=128){const data=new Float32Array(frames);for(let at=0;at<frames;at+=chunk){const n=Math.min(chunk,frames-at);e.engine_render(n);data.set(new Float32Array(e.memory.buffer,e.engine_left(),n),at);}return data;}
const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/Math.max(1,a.length));
function cleanPatch(){const p=initialPatch();Object.assign(p.global,{model:0,polyphony:8,unison:1,gain:.3,chorus:0});Object.assign(p.layers[0],{waveA:1,waveB:0,levelA:1,levelB:0,sub:0,noise:0,cutoff:16000,resonance:0,filter:0,filterAmount:0,keytrack:0,velocityTone:0,attack:.002,decay:.002,sustain:1,release:.01,drift:0,lfoPitch:0,lfoFilter:0,lfo2Pitch:0,lfo2Filter:0});return p;}
test('checked-in Wasm is built from the current Rust sources',()=>{
 const manifest=JSON.parse(fs.readFileSync('public/synth-lab/build.json'));
 const source=crypto.createHash('sha256').update(['synth-engine/Cargo.toml','synth-engine/src/lib.rs','synth-engine/common/colour.rs','synth-engine/common/notes.rs','synth-engine/common/headroom.rs'].map(f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n')).join('\n')).digest('hex');
 expect(engine().engine_api()).toBe(1);
 expect(manifest.source).toBe(source);expect(manifest.wasm).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));
});
test('notes start on the requested sample, release completely and stay tuned across sample rates',()=>{
 for(const sr of [44100,48000,96000]){const e=engine(cleanPatch(),sr);e.engine_event(0,1,256,69,.8);expect(rms(render(e,256))).toBe(0);const data=render(e,Math.round(sr*.25));const crossings=[];for(let i=2000;i<data.length;i++)if(data[i-1]<0&&data[i]>=0)crossings.push(i-data[i]/(data[i]-data[i-1]));const hz=(crossings.length-1)*sr/(crossings.at(-1)-crossings[0]);expect(Math.abs(1200*Math.log2(hz/440))).toBeLessThan(1);e.engine_event(1,1,e.engine_stat(4),0,0);const tail=render(e,sr/2);expect(e.engine_stat(0)).toBe(0);expect(rms(tail.slice(-1000))).toBeLessThan(1e-5);}
});
test('sustain and repeated-pitch note IDs release independently',()=>{
 const e=engine(cleanPatch());e.engine_event(0,1,0,60,.7);e.engine_event(0,2,0,60,.7);e.engine_event(1,1,1000,0,0);render(e,2000);expect(e.engine_stat(0)).toBe(1);e.engine_event(2,0,2000,1,0);e.engine_event(1,2,2100,0,0);render(e,2000);expect(e.engine_stat(0)).toBe(1);e.engine_event(2,0,4000,0,0);render(e,2000);expect(e.engine_stat(0)).toBe(0);
});
test('voice stealing respects capacity and stale note-offs cannot stop replacement notes',()=>{
 const p=cleanPatch();p.global.polyphony=2;const e=engine(p);for(let i=1;i<=3;i++)e.engine_event(0,i,0,60+i,.7);render(e,500);expect(e.engine_stat(0)).toBe(2);expect(e.engine_stat(1)).toBe(1);e.engine_event(1,1,500,0,0);render(e,1000);expect(e.engine_stat(0)).toBe(2);
});
test('panic cancels queued future notes and the bounded queue reports overflow',()=>{
 const e=engine(cleanPatch());for(let i=0;i<4096;i++)expect(e.engine_event(0,i+1,100000+i,60,.5)).toBe(1);expect(e.engine_event(0,5000,200000,60,.5)).toBe(0);expect(e.engine_stat(2)).toBe(1);e.engine_panic();expect(rms(render(e,110000))).toBe(0);expect(e.engine_stat(0)).toBe(0);expect(e.engine_event(0,1,Infinity,60,.5)).toBe(0);
});
test('event sorting and rendering are deterministic across block boundaries',()=>{
 const run=chunk=>{const e=engine(cleanPatch());e.engine_event(1,1,3000,0,0);e.engine_event(0,1,171,60,.7);e.engine_event(0,2,713,67,.6);e.engine_event(1,2,4000,0,0);return render(e,8000,chunk);};expect(run(1)).toEqual(run(128));expect(run(257)).toEqual(run(128));
});
test('all architectures remain finite under pressure, resonance, oscillator modulation, chorus and stealing',()=>{
 for(const recipe of RECIPES){const p=clonePatch(recipe);p.global.polyphony=8;p.global.unison=2;p.global.pressure=1;p.global.chorus=.7;for(const layer of p.layers){layer.resonance=.95;layer.polyPitch=.4;layer.polyPwm=.2;layer.noise=.1;}const e=engine(p);for(let i=0;i<20;i++)e.engine_event(0,i+1,i*100,30+i*3,.9);const data=render(e,24000);expect([...data].every(Number.isFinite)).toBe(true);expect(Math.max(...data.map(Math.abs))).toBeLessThanOrEqual(.981);expect(rms(data)).toBeGreaterThan(.0001);expect(e.engine_stat(0)).toBeLessThanOrEqual(8);}
});
test('editing release during a release does not amplify the tail or leave stuck voices',()=>{const p=cleanPatch();p.layers[0].release=.5;const e=engine(p);e.engine_event(0,1,0,60,.7);e.engine_event(1,1,1000,0,0);render(e,2000);e.engine_param(1,20,.002);const data=render(e,30000);expect(Math.max(...data.map(Math.abs))).toBeLessThan(.3);expect(e.engine_stat(0)).toBe(0);});
test('the DCO clock ignores independent B tuning and the layered model renders an independent channel B',()=>{
 const p=cleanPatch();p.global.model=3;Object.assign(p.layers[0],{waveA:0,waveB:4,levelA:0,levelB:1});
 const run=patch=>{const e=engine(patch);e.engine_event(0,1,0,60,.7);return render(e,8000);};
 const first=run(p);p.layers[0].coarseB=12;p.layers[0].fineB=40;expect(run(p)).toEqual(first);
 p.global.model=2;p.layers[0].mix=0;p.layers[1]={...cleanPatch().layers[0],coarseA:12};expect(rms(run(p))).toBeGreaterThan(.01);p.layers[1].mix=0;expect(rms(run(p))).toBe(0);
});
test('continuous note pressure changes filter brightness during a held note',()=>{
 const p=cleanPatch();Object.assign(p.layers[0],{waveA:3,cutoff:180,pressureTone:4});const e=engine(p);e.engine_event(0,1,0,60,.8);const before=render(e,12000);e.engine_event(3,1,12000,1,0);const after=render(e,12000);expect(rms(after.slice(3000))).toBeGreaterThan(rms(before.slice(3000))*2);
});

test('an open-filter held sine retains its calibrated body level until note-off',()=>{
 const e=engine(cleanPatch());e.engine_event(0,1,0,69,.8);
 const data=render(e,48000*3),body=rms(data.slice(24000,48000)),late=rms(data.slice(48000*2));
 expect(body).toBeGreaterThan(.075);expect(body).toBeLessThan(.13);
 expect(Math.abs(20*Math.log10(late/body))).toBeLessThan(.1);
 e.engine_event(1,1,48000*3,0,0);expect(rms(render(e,48000).slice(24000))).toBeLessThan(1e-10);
});

test('classic additions change routing while preserving finite polyphonic output',()=>{
 const p=cleanPatch();Object.assign(p.layers[0],{waveA:3,waveB:3,coarseB:-12,levelB:.1,envelopePitch:5,envelopeTarget:1,filterSustain:1});
 const run=p=>{const e=engine(p);e.engine_event(0,1,0,60,.8);return render(e,16000);};
 const free=run(p);p.layers[0].hardSync=1;const sync=run(p);expect(sync).not.toEqual(free);expect([...sync].every(Number.isFinite)).toBe(true);
 p.layers[0].filterFamily=1;p.layers[0].cutoff=700;p.layers[0].resonance=.85;const ladder=run(p);expect(ladder).not.toEqual(sync);expect([...ladder].every(Number.isFinite)).toBe(true);
 p.layers[0].hardSync=0;p.layers[0].bLow=1;p.layers[0].bKeytrack=0;p.layers[0].polyFilter=2;p.layers[0].pulseA=.2;p.layers[0].ring=.2;expect([...run(p)].every(Number.isFinite)).toBe(true);
});

test('held subtractive notes glide to a new pitch without a new envelope attack',()=>{
 const p=cleanPatch();p.layers[0].attack=.3;const e=engine(p);e.engine_event(0,1,0,69,.8);render(e,24000);e.engine_event(5,1,24000,81,.4);const data=render(e,30000);expect(rms(data.slice(0,4000))).toBeGreaterThan(.01);const tail=data.slice(-8000),crossings=[];for(let i=1;i<tail.length;i++)if(tail[i-1]<0&&tail[i]>=0)crossings.push(i-tail[i]/(tail[i]-tail[i-1]));const hz=(crossings.length-1)*48000/(crossings.at(-1)-crossings[0]);expect(Math.abs(1200*Math.log2(hz/880))).toBeLessThan(1);expect(e.engine_stat(0)).toBe(1);
});

test('moving pulse/sync edges remain deterministic and bounded across callback sizes and held pitch changes',()=>{
 for(const sync of [0,1]){const p=cleanPatch();Object.assign(p.layers[0],{waveA:4,waveB:1,coarseB:12,polyPwm:.36,hardSync:sync});
  const run=chunk=>{const e=engine(p);e.engine_event(0,1,0,90,.7);e.engine_event(5,1,4000,105,.1);e.engine_event(1,1,15000,0,0);return render(e,24000,chunk);};
  const a=run(128),b=run(257);expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);expect([...a].every(Number.isFinite)).toBe(true);expect(Math.max(...a.map(Math.abs))).toBeLessThan(1);expect(rms(a.slice(-1000))).toBeLessThan(1e-8);
 }
});
