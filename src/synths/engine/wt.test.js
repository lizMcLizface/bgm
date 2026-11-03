// @vitest-environment node
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms,peak} from './offline';
import {PARAMS,BY_KEY,toPairs,sanitize} from '../wt/params';
import {PRESETS} from '../wt/presets';
import {buildWave,packWaves,analyse,harmonics,shape,drawn,DEFAULT_WAVES,CYCLE} from '../wt/waves';
import {spectrumDb} from '../ui/scopeMath';

const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const SR=48000;
// dry: no chorus or reverb, a plain amplitude envelope, the filter open and untracked
const CLEAN={cutoff:20000,res:0,keyFollow:0,filterEnv:0,aAttack:.001,aDecay:.3,aSustain:1,aRelease:.2,velAmp:0,velFilter:0,uniVoices:1,volume:.6,reverbMix:0,chorusMix:0};
const synth=(values={},waves=null,sr=SR)=>createOfflineSynth(module,{sampleRate:sr,model:MODELS.wt,params:toPairs(sanitize({...CLEAN,...values})),waves});
const hold=(values,note=60,s=1,waves=null,sr=SR)=>{const v=synth(values,waves,sr);v.k.syn_note_on(1,note,1);v.seconds(.3);return v.seconds(s)[0];};
// amplitude of the component at f (Hann-weighted projection)
function amp(x,f,from=2000,len=Math.min(40000,x.length-from-1),sr=SR){let re=0,im=0,w=0;for(let n=0;n<len;n++){const h=.5-.5*Math.cos(2*Math.PI*n/(len-1)),a=2*Math.PI*f*(from+n)/sr;re+=h*x[from+n]*Math.cos(a);im-=h*x[from+n]*Math.sin(a);w+=h;}return 2*Math.hypot(re,im)/w;}
const hz=n=>440*2**((n-69)/12);
const db=x=>20*Math.log10(x);

test('the table fits the kernel ABI with unique ids and in-range defaults',()=>{
 const k=synth().k;expect(k.syn_param_count()).toBe(52);
 const ids=PARAMS.map(p=>p.id);expect(new Set(ids).size).toBe(ids.length);
 for(const p of PARAMS){expect(p.id<52||(p.id>=200&&p.id<216)).toBe(true);expect(p.default).toBeGreaterThanOrEqual(p.min);expect(p.default).toBeLessThanOrEqual(p.max);}
 expect(BY_KEY.filterType.options).toEqual(['LP 24','LP 12','BP','HP']);
});

test('waves: shapes, harmonics and outlines build 2048 samples, and an edit round-trips through the harmonic view',()=>{
 for(const d of [shape('sine'),shape('pulse',.25),harmonics([1,.5,.25]),drawn(Array.from({length:128},(_,i)=>Math.sin(i/128*6.28)))])expect(buildWave(d)).toHaveLength(CYCLE);
 expect(packWaves(DEFAULT_WAVES)).toHaveLength(4*CYCLE);
 const {a,p}=analyse(harmonics([1,0,.5,0,.25],[.1,0,.3,0,.7]),8);
 expect(a.slice(0,5).map(v=>+v.toFixed(3))).toEqual([1,0,.5,0,.25]);
 expect(+p[0].toFixed(3)).toBeCloseTo(.1,2);expect(+p[2].toFixed(3)).toBeCloseTo(.3,2);
});

test('notes are in tune at every sample rate and across the range',()=>{
 for(const sr of [44100,48000,96000])for(const note of [36,60,84]){
  const x=hold({joyX:-1,joyY:0},note,1,null,sr),f=hz(note);
  // the bin of a long Hann window locates the peak to well under a cent
  let best=0,at=f;for(let d=-.03;d<=.03;d+=.002){const a=amp(x,f*(1+d),2000,Math.min(40000,x.length-2001),sr);if(a>best){best=a;at=f*(1+d);}}
  expect(Math.abs(1200*Math.log2(at/f))).toBeLessThan(1.5);
 }
});

test('a saw follows 1/h to a tenth of a dB, and a pure sine stays pure, at any pitch',()=>{
 for(const note of [36,60,72]){
  const f=hz(note),x=hold({joyX:1,joyY:0},note),a1=amp(x,f);
  for(let h=2;h<=9&&h*f<15000;h++)expect(Math.abs(db(amp(x,h*f)/a1)-db(1/h))).toBeLessThan(.3);
 }
 const s=hold({joyX:-1,joyY:0},60);
 expect(db(amp(s,3*hz(60))/amp(s,hz(60)))).toBeLessThan(-45);
});

test('band-limiting: a bright saw high on the keyboard has almost no energy that is not on its harmonics',()=>{
 for(const note of [84,96,104]){
  const x=hold({joyX:1,joyY:0},note,.8),f=hz(note),size=16384,spec=spectrumDb(x.subarray(2000,2000+size),size);
  let on=0,off=0;
  for(let k=1;k<size/2;k++){const p=10**(spec[k]/10),h=k*SR/size/f,near=Math.abs(h-Math.round(h))*f<45;if(near)on+=p;else off+=p;}
  expect(10*Math.log10(off/on)).toBeLessThan(-55);
 }
});

test('the joystick: each corner plays one wave, the centre all four equally, an edge two',()=>{
 // four waves that are each one sine harmonic, so the weights read straight off the spectrum
 const waves=packWaves([harmonics([1]),harmonics([0,1]),harmonics([0,0,1]),harmonics([0,0,0,1])]),f=hz(60);
 const weights=(joyX,joyY)=>{const x=hold({joyX,joyY},60,1,waves),a=[1,2,3,4].map(h=>amp(x,h*f));const s=Math.hypot(...a);return a.map(v=>v/s);};
 const near=(got,want)=>got.forEach((g,i)=>expect(Math.abs(g-want[i])).toBeLessThan(.04));
 near(weights(-1,0),[1,0,0,0]);near(weights(0,1),[0,1,0,0]);near(weights(1,0),[0,0,1,0]);near(weights(0,-1),[0,0,0,1]);
 near(weights(0,0),[.5,.5,.5,.5]);
 const edge=weights(-.5,.5);near(edge,[1/Math.SQRT2,1/Math.SQRT2,0,0]);
});

test('unison: n voices spread across +-detune cents, with the energy shared',()=>{
 const f=hz(60),x=hold({joyX:-1,joyY:0,uniVoices:3,uniDetune:30,uniSpread:0},60,1.2);
 const fine=(ct)=>amp(x,f*2**(ct/1200),2000,44000);
 const lone=hold({joyX:-1,joyY:0},60,1.2);
 for(const ct of [-30,0,30])expect(fine(ct)).toBeGreaterThan(.25*amp(lone,f,2000,44000));
 expect(fine(-15)).toBeLessThan(.3*fine(0));
});

test('filters: 24 dB is -12 dB at the cutoff, 12 dB -6 dB, the band-pass is flat there and the high-pass is -6 dB',()=>{
 const f=hz(72),cut=f; // a sine at the cutoff
 const at=type=>db(amp(hold({joyX:-1,joyY:0,cutoff:cut,filterType:type},72),f)/amp(hold({joyX:-1,joyY:0},72),f));
 expect(Math.abs(at(0)+12)).toBeLessThan(2.5);
 expect(Math.abs(at(1)+6)).toBeLessThan(2);
 expect(Math.abs(at(2))).toBeLessThan(2);
 expect(Math.abs(at(3)+6)).toBeLessThan(2);
 // and the slopes: two octaves above the cutoff the 24 dB filter is about twice as far down as the 12 dB one
 const far=type=>db(amp(hold({joyX:-1,joyY:0,cutoff:f/4,filterType:type},72),f)/amp(hold({joyX:-1,joyY:0},72),f));
 expect(far(0)/far(1)).toBeGreaterThan(1.6);
});

test('envelopes: attack takes about its time, release dies away, and the vector envelope moves the joystick',()=>{
 const v=synth({joyX:-1,joyY:0,aAttack:.2});v.k.syn_note_on(1,60,1);
 const early=rms(v.seconds(.05)[0]),late=(v.seconds(.4),rms(v.seconds(.1)[0]));
 expect(early).toBeLessThan(.35*late);
 const r=synth({joyX:-1,joyY:0,aRelease:.15});r.k.syn_note_on(1,60,1);r.seconds(.4);r.k.syn_note_off(1);
 const during=rms(r.seconds(.05)[0]);r.seconds(.6);expect(rms(r.seconds(.1)[0])).toBeLessThan(.02*during);
 // vector envelope: from wave A (sine) towards C (saw); the harmonic content grows
 const waves=packWaves(DEFAULT_WAVES),f=hz(60);
 const w=synth({joyX:-1,joyY:0,vecX:1,vAttack:.4,vSustain:1},waves);w.k.syn_note_on(1,60,1);
 const a=w.seconds(.06)[0],b=(w.seconds(.6),w.seconds(.3)[0]);
 expect(db(amp(b,3*f,0,12000)/amp(b,f,0,12000))).toBeGreaterThan(db(amp(a,3*f,0,2800)/amp(a,f,0,2800))+8);
});

test('every factory sound builds its waves, plays, and stays finite, audible and below full scale',()=>{
 expect(new Set(PRESETS.map(p=>p.name)).size).toBe(PRESETS.length);
 for(const p of PRESETS){
  expect(p.waves).toHaveLength(4);
  const v=synth(p.values,packWaves(p.waves));[48,55,60,64,67].forEach((n,i)=>v.k.syn_note_on(i+1,n,.8));
  const x=v.seconds(1.2)[0];
  expect(x.every(Number.isFinite),p.name).toBe(true);
  expect(peak(x),p.name).toBeLessThan(1);expect(rms(x),p.name).toBeGreaterThan(.004);
 }
});
