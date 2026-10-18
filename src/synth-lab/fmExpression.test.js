// @vitest-environment node
import fs from 'node:fs';
import {initialFM,cloneFM,fmPacket,sanitizeFM,FM_RECIPES} from './fmPatch';
const module=new WebAssembly.Module(fs.readFileSync('public/synth-lab/fm.wasm'));
function patch(){const p=initialFM();p.routes=Array.from({length:6},()=>Array(6).fill(0));p.carriers=[1,0,0,0,0,0];Object.assign(p.global,{quality:1,gain:.15,feedback:0});for(const op of p.operators)Object.assign(op,{level:.7,attack:.2,decay1:.1,breakpoint:1,decay2:.1,sustain:1,release:.25,velocity:0});return p;}
function engine(p,rate=48000){const e=new WebAssembly.Instance(module,{}).exports;e.fm_init(rate);const data=fmPacket(p);data.globals.forEach(t=>e.fm_param(...t));data.operators.forEach(t=>e.fm_op(...t));data.routes.forEach(t=>e.fm_route(...t));data.carriers.forEach(t=>e.fm_carrier(...t));return e;}
function render(e,frames,chunk=128){const out=[new Float32Array(frames),new Float32Array(frames)];for(let at=0;at<frames;at+=chunk){const n=Math.min(chunk,frames-at);e.fm_render(n);for(let ch=0;ch<2;ch++)out[ch].set(new Float32Array(e.memory.buffer,e.fm_output(ch),n),at);}return out;}
const rms=x=>Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length);
test('FM expression patch import keeps compatible defaults and clamps append-only routes',()=>{
 const p=sanitizeFM({version:1,kind:'fm'});expect(p.global).toMatchObject({wanderCents:0,modSource1:0,modDepth4:0});expect(p.operators[0]).toMatchObject({attackCurve:1,decayCurve:1,releaseCurve:1});p.global.modTarget1=999;p.global.modDepth2=Infinity;p.operators[0].attackCurve=-1;expect(cloneFM(p)).toMatchObject({global:{modTarget1:11,modDepth2:0},operators:[{attackCurve:.25},{},{},{},{},{}]});
});
test('operator curves change the attack while preserving the held body and release endpoint',()=>{
 const p=patch(),q=cloneFM(p);q.operators[0].attackCurve=2;q.operators[0].releaseCurve=2;
 for(const rate of [44100,48000,96000]){const run=p=>{const e=engine(p,rate);e.fm_event(0,1,0,69,.8);e.fm_event(1,1,Math.round(rate*.6),0,0);return render(e,rate)[0];};const a=run(p),b=run(q),level=(x,start,end)=>rms(x.slice(Math.round(rate*start),Math.round(rate*end)));expect(level(b,.08,.1)).toBeLessThan(level(a,.08,.1)*.6);expect(level(b,.4,.5)).toBeCloseTo(level(a,.4,.5),5);expect(level(b,.9,1)).toBeLessThan(1e-8);}
});
test('FM destinations cover pitch, index, feedback, amplitude, balance and individual operator levels',()=>{
 for(let target=1;target<=11;target++){
  const p=cloneFM(FM_RECIPES[4]);Object.assign(p.global,{pressure:.8,modSource1:6,modTarget1:target,modDepth1:.6});const q=cloneFM(p);q.global.modDepth1=0;
  const run=p=>{const e=engine(p);e.fm_event(0,1,0,60,.7);return render(e,24000);};const a=run(p),b=run(q);expect(a[0]).not.toEqual(b[0]);expect(a[0].every(Number.isFinite)).toBe(true);
  if(target===5)expect(rms(a[1].slice(-8000))).toBeGreaterThan(rms(a[0].slice(-8000)));
 }
});
test('FM expression sources are repeatable across chunks and sustain/glide/panic preserve lifecycle',()=>{
 for(let source=1;source<=8;source++){
  const p=patch();Object.assign(p.global,{modSource1:source,modTarget1:5,modDepth1:.65,modAttack:.05,modDecay:.1,modSustain:.8,lfo2Rate:1,wanderRate:1,wheel:.6,pressure:.6});const run=chunk=>{const e=engine(p);e.fm_event(0,1,13,72,.8);e.fm_event(5,1,12000,69,.1);e.fm_event(2,0,24000,1,0);e.fm_event(1,1,25000,0,0);const out=render(e,30000,chunk);expect(e.fm_stat(0)).toBe(1);expect(out[0].some((x,i)=>Math.abs(x-out[1][i])>1e-5)).toBe(true);e.fm_event(2,0,30000,0,0);render(e,20000,chunk);expect(e.fm_stat(0)).toBe(0);e.fm_panic();expect(rms(render(e,1000,chunk)[0])).toBe(0);return out;};const a=run(128),b=run(257);expect(Buffer.from(a[0].buffer).equals(Buffer.from(b[0].buffer))).toBe(true);
 }
});
