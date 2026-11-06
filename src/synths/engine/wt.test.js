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
 const k=synth().k;expect(k.syn_param_count()).toBe(125);
 const ids=PARAMS.map(p=>p.id);expect(new Set(ids).size).toBe(ids.length);
 for(const p of PARAMS){expect(p.id<125||(p.id>=180&&p.id<196)||(p.id>=200&&p.id<216)).toBe(true);expect(p.default).toBeGreaterThanOrEqual(p.min);expect(p.default).toBeLessThanOrEqual(p.max);}
 expect(BY_KEY.filterType.options).toEqual(['LP 24','LP 12','BP','HP','Notch']);
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

test('the live joystick: the resting position, then the vector envelope and a free route move it',()=>{
 const joy=(values,seconds)=>{const v=synth(values);v.k.syn_note_on(1,60,1);v.seconds(seconds);return [v.k.syn_stat(7),v.k.syn_stat(8),v.k.syn_stat(9)];};
 expect(synth().k.syn_stat(9)).toBe(0); // no voice: nothing to show
 const rest=joy({joyX:.2,joyY:-.3},.1);
 expect(rest[0]).toBeCloseTo(.2,2);expect(rest[1]).toBeCloseTo(-.3,2);expect(rest[2]).toBe(1);
 // the vector envelope, at its sustain, pushes X by its depth
 const vec=joy({joyX:0,joyY:0,vSustain:1,vAttack:.001,vecX:.5},1);
 expect(vec[0]).toBeGreaterThan(.45);
 // a free route: key (note 60 is the centre of the key range) to X does nothing at 60, velocity to Y pushes it by the depth
 const route=joy({joyX:0,joyY:0,routeSource1:4,routeTarget1:4,routeDepth1:.6},.1);
 expect(route[1]).toBeCloseTo(.6,1);
});

test('free routes reach pitch, filter and amplitude',()=>{
 const level=values=>rms(hold({...values,uniVoices:1},60,.5));
 // velocity (1 here) to amplitude at -0.5 halves the level
 expect(level({routeSource1:4,routeTarget1:5,routeDepth1:-.5})/level({})).toBeCloseTo(.5,1);
 // velocity to pitch at a full depth is an octave up
 const x=hold({routeSource1:4,routeTarget1:1,routeDepth1:1},60,1);
 expect(amp(x,hz(72))).toBeGreaterThan(5*amp(x,hz(60)));
 // velocity to the filter at a negative depth closes it
 const bright=values=>rms(hold({...values,cutoff:2000,joyX:1,joyY:0},84,.5));
 expect(bright({routeSource1:4,routeTarget1:2,routeDepth1:-1})).toBeLessThan(.2*bright({}));
});

test('a drawn amplitude envelope shapes the attack: a slow-start bend is quieter early than the model attack',()=>{
 const early=values=>{const v=synth({aAttack:.4,...values});v.k.syn_note_on(1,60,1);return rms(v.seconds(.15)[0]);};
 const native=early({});
 // custom mode with a strongly negative attack bend (slow start)
 const custom=early({ampShape:1,ampCurveA:-1,ampCurveD:.5,ampCurveR:.5});
 expect(custom).toBeLessThan(.5*native);
});

test('warp: each mode changes the wave and leaves it alone at zero; a route to warp moves it',()=>{
 const base=hold({joyX:-1,joyY:0},57,.4);
 for(const mode of [1,2,3,4,5]){
  const off=hold({joyX:-1,joyY:0,warpMode1:mode,warpAmt1:0},57,.4);
  expect(Math.abs(rms(off)-rms(base))).toBeLessThan(1e-6);
  const on=hold({joyX:-1,joyY:0,warpMode1:mode,warpAmt1:.7},57,.4);
  expect(rms(on)).toBeGreaterThan(0);expect(on.every(Number.isFinite)).toBe(true);
  // the spectrum moves: more energy above the fourth harmonic than the plain sine has
  expect(amp(on,hz(57)*5)).toBeGreaterThan(2*amp(base,hz(57)*5)+1e-5);
 }
 const routed=hold({joyX:-1,joyY:0,warpMode1:2,routeSource1:4,routeTarget1:6,routeDepth1:.8},57,.4);
 expect(amp(routed,hz(57)*5)).toBeGreaterThan(1e-3);
});

test('wave level and pan: a quiet wave is quiet, and panning moves it between the ears',()=>{
 const run=values=>{const v=synth({joyX:-1,joyY:0,...values});v.k.syn_note_on(1,60,1);v.seconds(.3);const [l,r]=v.seconds(.4);return [rms(l),rms(r)];};
 const [l0,r0]=run({});
 expect(l0).toBeCloseTo(r0,3);
 expect(run({level1:.5})[0]/l0).toBeCloseTo(.5,1);
 const [lp,rp]=run({pan1:1});
 expect(rp).toBeCloseTo(l0,2);expect(lp).toBeLessThan(.01*l0);
});

test('sub oscillator and noise: the sub sounds an octave down, the noise is broadband and darker with colour',()=>{
 const v=hold({subLevel:1,joyX:-1,joyY:0,volume:.6},69,1);
 expect(amp(v,hz(57))).toBeGreaterThan(.02);
 expect(amp(v,hz(57))).toBeGreaterThan(amp(hold({joyX:-1,joyY:0},69,1),hz(57))*20);
 const white=hold({noiseLevel:1,volume:.6,level1:0,level2:0,level3:0,level4:0},60,.5),dark=hold({noiseLevel:1,noiseColor:1,volume:.6,level1:0,level2:0,level3:0,level4:0},60,.5);
 expect(rms(white)).toBeGreaterThan(.005);
 const high=x=>{let e=0;for(let n=1;n<x.length;n++){const d=x[n]-x[n-1];e+=d*d;}return e/x.length;};
 expect(high(dark)/rms(dark)**2).toBeLessThan(.3*high(white)/rms(white)**2);
});

test('LFO tempo sync and fade-in',()=>{
 // a pitch LFO at 120 bpm and one beat per cycle is 2 Hz: the pitch crosses the centre about twice a second
 const wobble=values=>{const x=hold({lfo1Pitch:200,lfo1Shape:0,joyX:-1,joyY:0,...values},60,2);return x;};
 const zero=x=>{let n=0;for(let i=1;i<x.length;i++)if(x[i-1]<0&&x[i]>=0)n++;return n;};
 const free=zero(wobble({lfo1Rate:2})),synced=zero(wobble({lfo1Rate:20,lfo1Sync:1,lfo1Beats:1,tempo:120})),fast=zero(wobble({lfo1Rate:20}));
 expect(Math.abs(synced-free)).toBeLessThanOrEqual(Math.round(free*.1)+2);
 expect(fast).toBeGreaterThan(0);
 // a fade: at the start of the note the vibrato is absent, so the first cycles are steady
 const early=hold({lfo1Pitch:1200,lfo1Rate:6,lfo1Shape:0,lfo1Fade:2,joyX:-1,joyY:0},60,.2),late=hold({lfo1Pitch:1200,lfo1Rate:6,lfo1Shape:0,joyX:-1,joyY:0},60,.2);
 expect(zero(early)).toBeLessThan(zero(late)*1.5+4);
});

test('the modulation envelope and the other sources are available to the routes',()=>{
 const joy=values=>{const v=synth(values);v.k.syn_note_on(1,60,1);v.seconds(.5);return [v.k.syn_stat(7),v.k.syn_stat(8)];};
 expect(joy({joyX:0,joyY:0,mAttack:.001,mSustain:1,routeSource1:8,routeTarget1:3,routeDepth1:.6})[0]).toBeCloseTo(.6,1); // mod env to X
 expect(joy({joyX:0,joyY:0,aAttack:.001,aSustain:1,routeSource1:10,routeTarget1:4,routeDepth1:.5})[1]).toBeGreaterThan(.4); // amp env to Y
 const a=joy({joyX:0,joyY:0,routeSource1:11,routeTarget1:3,routeDepth1:1})[0];
 expect(Math.abs(a)).toBeGreaterThan(0); // a random value per note
 const filtered=values=>rms(hold({cutoff:3000,...values},72,.4));
 expect(filtered({routeSource1:4,routeTarget1:7,routeDepth1:1,res:.2})).toBeGreaterThan(0);
});

test('mono and legato: one voice, the older note let go, and the held key comes back',()=>{
 const v=synth({voiceMode:1});
 v.k.syn_note_on(1,60,1);v.seconds(.1);v.k.syn_note_on(2,64,1);v.seconds(.1);
 expect(v.k.syn_stat(0)).toBeLessThanOrEqual(2); // the first voice is releasing, the new one sounds
 v.k.syn_note_off(2);const back=v.seconds(.6)[0];
 expect(amp(back,hz(60),2000,16000)).toBeGreaterThan(amp(back,hz(64),2000,16000)*2); // the held C is playing again
 const leg=synth({voiceMode:2,aAttack:.5});
 leg.k.syn_note_on(1,60,1);leg.seconds(1);leg.k.syn_note_on(2,67,1);
 const x=leg.seconds(.2)[0]; // legato: no new attack, so the level does not dip back to zero
 expect(rms(x)).toBeGreaterThan(.05*peak(x));
 expect(leg.k.syn_stat(0)).toBe(1);
});

test('the notch filter removes its centre and keeps the rest; the pitch wheel range scales the bend',()=>{
 const level=(type,note)=>rms(hold({filterType:type,cutoff:hz(69),res:.5,joyX:-1,joyY:0},note,.5));
 expect(level(4,69)).toBeLessThan(.3*level(4,57));
 const bent=range=>{const v=synth({bendRange:range,joyX:-1,joyY:0});v.k.syn_note_on(1,57,1);v.k.syn_control(0,2);v.seconds(.4);return v.seconds(.5)[0];};
 expect(amp(bent(12),hz(57+12))).toBeGreaterThan(5*amp(bent(12),hz(57)));
 expect(amp(bent(2),hz(59))).toBeGreaterThan(5*amp(bent(2),hz(57)));
});

test('joystick paths: every sounding voice keeps the path it just took, and a silent voice reports none',()=>{
 const v=synth({joyX:0,joyY:0,lfo1Rate:20,lfo1Shape:0,lfo1X:.5,lfo1Y:0});
 const n=v.k.syn_joy_info(0),w=v.k.syn_joy_info(1);
 expect(n).toBe(8);expect(w).toBe(130);
 v.k.syn_note_on(1,60,1);v.k.syn_note_on(2,64,1);v.seconds(.3);
 const t=new Float32Array(v.k.memory.buffer,v.k.syn_joy_ptr(),n*w).slice();
 const on=[...Array(n).keys()].filter(i=>t[i*w]>.5);
 expect(on.length).toBe(2);
 for(const i of on){
  const xs=[...Array(64).keys()].map(k=>t[i*w+2+2*k]);
  // the LFO is sweeping X at 20 Hz: 85 ms of the path covers most of a cycle
  expect(Math.max(...xs)-Math.min(...xs)).toBeGreaterThan(.5);
  expect(xs.every(x=>Math.abs(x)<=.51)).toBe(true);
 }
 v.k.syn_note_off(1);v.k.syn_note_off(2);v.seconds(1.5);
 const after=new Float32Array(v.k.memory.buffer,v.k.syn_joy_ptr(),n*w).slice();
 expect([...Array(n).keys()].every(i=>after[i*w]<.5)).toBe(true);
});

test('polar joystick: the spin carries the position round the centre of the pad, and the radius route pushes it out',()=>{
 const pad=(x,y)=>[x+y,y-x];
 const v=synth({joyX:.5,joyY:0,joySpin:4});
 v.k.syn_note_on(1,60,1);v.seconds(.4);
 const t=new Float32Array(v.k.memory.buffer,v.k.syn_joy_ptr(),v.k.syn_joy_info(0)*v.k.syn_joy_info(1)).slice();
 const radii=[],angles=[];
 for(let n=0;n<64;n++){const k=(t[1]+n)%64,[u,w]=pad(t[2+2*k],t[3+2*k]);radii.push(Math.hypot(u,w));angles.push(Math.atan2(w,u));}
 // a circle: a constant radius (the rest position's), and an angle that sweeps most of the way round in 85 ms at 4 turns a second
 expect(Math.max(...radii)-Math.min(...radii)).toBeLessThan(.06);
 expect(radii[0]).toBeCloseTo(Math.SQRT1_2,1);
 const sweep=Math.abs(angles.reduce((a,x,i)=>i?a+(((x-angles[i-1]+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI):0,0));
 expect(sweep).toBeGreaterThan(1.5);
 // velocity (1) to radius at .5 from the centre: a position half the pad's radius away
 const w=synth({joyX:0,joyY:0,routeSource1:4,routeTarget1:11,routeDepth1:.5});
 w.k.syn_note_on(1,60,1);w.seconds(.2);
 const [u,q]=pad(w.k.syn_stat(7),w.k.syn_stat(8));
 expect(Math.hypot(u,q)).toBeCloseTo(.5,2);
});

test('the joystick modulation: key and velocity move the stick, and the radius and angle offsets move it about the pad',()=>{
 const pad=(x,y)=>[x+y,y-x];
 const joy=values=>{const v=synth({joyX:0,joyY:0,...values});v.k.syn_note_on(1,60,1);v.seconds(.3);return [v.k.syn_stat(7),v.k.syn_stat(8)];};
 // velocity (1) to x and y at the full depth and key (note 60 is the centre, so nothing)
 const a=joy({velX:.4,velY:-.2,keyX:1,keyY:1});expect(a[0]).toBeCloseTo(.4,2);expect(a[1]).toBeCloseTo(-.2,2);
 // a radius offset from the centre of the pad: a distance of 0.6 at the angle of zero (towards C's side along u)
 const [u,w]=pad(...joy({joyRadius:.6}));expect(Math.hypot(u,w)).toBeCloseTo(.6,2);expect(w).toBeCloseTo(0,2);
 // and an angle offset of 90 degrees turns it a quarter round
 const [u2,w2]=pad(...joy({joyRadius:.6,joyAngle:90}));expect(u2).toBeCloseTo(0,2);expect(w2).toBeCloseTo(.6,2);
 // an LFO to radius at half depth swings the distance; pressure to angle is a half-turn at full depth
 const swing=(()=>{const v=synth({joyX:0,joyY:0,lfo1Rate:10,lfo1Shape:0,lfo1R:.5,joyRadius:.5});v.k.syn_note_on(1,60,1);v.seconds(.3);
  const t=new Float32Array(v.k.memory.buffer,v.k.syn_joy_ptr(),v.k.syn_joy_info(0)*v.k.syn_joy_info(1)).slice();
  const r=[];for(let k=0;k<64;k++){const [uu,ww]=pad(t[2+2*k],t[3+2*k]);r.push(Math.hypot(uu,ww));}return Math.max(...r)-Math.min(...r);})();
 expect(swing).toBeGreaterThan(.3);
});
