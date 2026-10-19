// @vitest-environment node
import fs from 'node:fs';import crypto from 'node:crypto';
import {FM_RECIPES,FM_GLOBAL,FM_OPERATOR,initialFM,cloneFM,sanitizeFM,fmPacket,topology} from './fmPatch';
const bytes=fs.readFileSync('public/synth-lab/fm.wasm'),module=new WebAssembly.Module(bytes);
function engine(p=initialFM(),sr=48000){const e=new WebAssembly.Instance(module,{}).exports;e.fm_init(sr);const packet=fmPacket(p);for(const a of packet.globals)e.fm_param(...a);for(const a of packet.operators)e.fm_op(...a);for(const a of packet.routes)e.fm_route(...a);for(const a of packet.carriers)e.fm_carrier(...a);return e;}
function render(e,frames,chunk=128){const out=new Float32Array(frames);for(let at=0;at<frames;at+=chunk){const count=Math.min(chunk,frames-at);e.fm_render(count);out.set(new Float32Array(e.memory.buffer,e.fm_output(0),count),at);}return out;}
const rms=x=>Math.sqrt(x.reduce((s,v)=>s+v*v,0)/Math.max(1,x.length));
function clean(quality=1){const p=initialFM();Object.assign(p.global,{operators:4,quality,feedback:0,vibrato:0,pitchStart:0});p.routes=Array.from({length:6},()=>Array(6).fill(0));p.carriers=[1,0,0,0,0,0];for(const op of p.operators)Object.assign(op,{attack:.002,decay1:.002,peak:1,breakpoint:1,decay2:.002,sustain:1,release:.01,level:.7,velocity:0,keyScale:0,rateScale:0});return p;}
function frequency(data,sr){const crossings=[];for(let i=1000;i<data.length;i++)if(data[i-1]<0&&data[i]>=0)crossings.push(i-data[i]/(data[i]-data[i-1]));return (crossings.length-1)*sr/(crossings.at(-1)-crossings[0]);}
test('FM artifact and independent parameter ABI match the checked-in source',()=>{
 const m=JSON.parse(fs.readFileSync('public/synth-lab/fm-build.json'));const hash=crypto.createHash('sha256').update(['synth-engine/fm/Cargo.toml','synth-engine/fm/src/lib.rs','synth-engine/fm/src/simd_voices.rs','synth-engine/common/simd.rs','synth-engine/fm/src/simd_operators.rs','synth-engine/common/colour.rs','synth-engine/common/notes.rs','synth-engine/common/headroom.rs','synth-engine/common/denormal.rs'].map(f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n')).join('\n')).digest('hex');expect(m.source).toBe(hash);expect(m.wasm).toBe(crypto.createHash('sha256').update(bytes).digest('hex'));expect(engine().fm_api()).toBe(1);expect(FM_GLOBAL).toHaveLength(54);expect(FM_OPERATOR).toHaveLength(22);
});
test('single-carrier tuning and scheduled gates work at all sample rates and oversampling levels',()=>{
 for(const sr of [44100,48000,96000])for(const quality of [0,1,2]){const e=engine(clean(quality),sr);e.fm_event(0,1,256,69,.8);expect(rms(render(e,256))).toBe(0);const data=render(e,Math.round(sr*.2));expect(Math.abs(1200*Math.log2(frequency(data,sr)/440))).toBeLessThan(1);e.fm_event(1,1,e.fm_stat(4),0,0);render(e,sr/4);expect(e.fm_stat(0)).toBe(0);}
});
test('all FM recipes and quality tiers are finite under polyphony, feedback, pressure and modulation stress',()=>{
 for(const recipe of FM_RECIPES)for(const quality of [0,1,2]){const p=cloneFM(recipe);Object.assign(p.global,{quality,polyphony:8,feedback:.8,index:2,pressure:1});const e=engine(p);for(let i=0;i<12;i++)e.fm_event(0,i+1,i*99,36+i*5,.9);const data=render(e,12000);expect([...data].every(Number.isFinite)).toBe(true);expect(Math.max(...data.map(Math.abs))).toBeLessThanOrEqual(.981);expect(rms(data)).toBeGreaterThan(.0001);expect(e.fm_stat(0)).toBeLessThanOrEqual(8);}
});
test('sustain, stealing, stale releases and panic preserve independent note IDs',()=>{
 const p=clean();p.global.polyphony=2;const e=engine(p);for(let i=1;i<=3;i++)e.fm_event(0,i,0,60+i,.7);render(e,500);expect(e.fm_stat(0)).toBe(2);expect(e.fm_stat(1)).toBe(1);e.fm_event(1,1,500,0,0);render(e,1000);expect(e.fm_stat(0)).toBe(2);
 e.fm_event(2,0,1500,1,0);e.fm_event(1,2,1500,0,0);render(e,2000);expect(e.fm_stat(0)).toBe(2);e.fm_event(2,0,3500,0,0);render(e,2000);expect(e.fm_stat(0)).toBe(1);e.fm_event(0,10,100000,70,.5);e.fm_panic();expect(rms(render(e,110000))).toBe(0);
});
test('held retuning reaches the new pitch without restarting its amplitude envelope',()=>{
 const p=clean();p.operators[0].attack=.4;const e=engine(p);e.fm_event(0,1,0,69,.8);const before=render(e,33600);e.fm_event(5,1,33600,81,.5);const glide=render(e,33600);expect(rms(glide.slice(0,5000))).toBeGreaterThan(rms(before.slice(-5000))*.7);expect(Math.abs(1200*Math.log2(frequency(glide.slice(-8000),48000)/880))).toBeLessThan(1);expect(e.fm_stat(0)).toBe(1);
});
test('FM event execution and oversampling are deterministic across callback sizes',()=>{
 const run=chunk=>{const e=engine(FM_RECIPES[0]);e.fm_event(1,1,6000,0,0);e.fm_event(0,1,171,60,.7);return render(e,10000,chunk);};expect(run(1)).toEqual(run(257));
 const e=engine();for(let i=0;i<4096;i++)expect(e.fm_event(0,i+1,100000+i,60,.5)).toBe(1);expect(e.fm_event(0,5000,200000,60,.5)).toBe(0);expect(e.fm_stat(2)).toBe(1);
});
test('FM patches round-trip while rejecting cycles, unsafe values and incompatible formats',()=>{
 for(const p of FM_RECIPES)expect(cloneFM(p)).toEqual(p);const p=initialFM();p.global.operators=5;p.operators[0].ratio=Infinity;p.routes[4][1]=1;p.carriers.fill(0);const q=sanitizeFM(p);expect(q.global.operators).toBe(6);expect(q.routes[4][1]).toBe(0);expect(q.operators[0].ratio).toBe(1);expect(q.carriers.some(Boolean)).toBe(true);expect(()=>sanitizeFM({version:1})).toThrow();
 for(const n of [4,6])for(let alg=0;alg<6;alg++){const t=topology(n,alg);expect(t.carriers.some(Boolean)).toBe(true);expect(t.routes.every((row,i)=>row.every((v,j)=>!v||j>i))).toBe(true);}
});

test('held operator level edits ramp rather than jumping to the new output level',()=>{
 const p=clean(0);p.operators[0].level=.1;const e=engine(p);e.fm_event(0,1,0,69,.8);render(e,4800);e.fm_op(0,3,4);const data=render(e,4800);expect(rms(data.slice(0,128))).toBeLessThan(rms(data.slice(-512))*.6);expect(e.fm_stat(0)).toBe(1);
});

test('fixed-frequency carriers stay fixed across note pitches and non-sine operators remain finite',()=>{
 const p=clean(2);p.operators[0].fixed=880;p.operators[0].ratio=13;
 for(const midi of [48,72]){const e=engine(p);e.fm_event(0,1,0,midi,.7);const data=render(e,14000);expect(Math.abs(1200*Math.log2(frequency(data,48000)/880))).toBeLessThan(1);}
 for(const wave of [1,2,3]){p.operators[0].wave=wave;const e=engine(p);e.fm_event(0,1,0,60,.7);const data=render(e,8000);expect([...data].every(Number.isFinite)).toBe(true);expect(rms(data)).toBeGreaterThan(.01);}
});
