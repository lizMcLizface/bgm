// @vitest-environment node
import fs from 'node:fs';
import {initialPatch,parameterTriples} from './patch';

// The subtractive voice's later additions, on both builds (the scalar kernel and the SIMD kernel the acoustic voices use):
// noise colour, an amp hold stage, a pitch envelope, restarting the oscillator phase, and a notch filter response.
for(const kernel of ['core','core-acoustic']){
 describe(kernel,()=>{
  const wasmModule=new WebAssembly.Module(fs.readFileSync(`public/synth-lab/${kernel}.wasm`));
  const engine=(patch,sr=48000)=>{const e=new WebAssembly.Instance(wasmModule,{}).exports;e.engine_init(sr);for(const t of parameterTriples(patch))e.engine_param(...t);return e;};
  const render=(e,frames,chunk=128)=>{const d=new Float32Array(frames);for(let at=0;at<frames;at+=chunk){const n=Math.min(chunk,frames-at);e.engine_render(n);d.set(new Float32Array(e.memory.buffer,e.engine_left(),n),at);}return d;};
  const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/Math.max(1,a.length));
  const base=(layer={})=>{
   const p=initialPatch();Object.assign(p.global,{model:0,polyphony:4,unison:1,gain:.3,chorus:0});
   Object.assign(p.layers[0],{waveA:1,waveB:0,levelA:1,levelB:0,sub:0,noise:0,cutoff:18000,resonance:0,filter:0,filterAmount:0,keytrack:0,velocityTone:0,attack:0,decay:0,sustain:1,release:.1,highpass:10,drive:0,drift:0,lfoPitch:0,...layer});
   return p;
  };
  const play=(patch,seconds,note=69,id=1)=>{const e=engine(patch);e.engine_event(0,id,0,note,.8);return render(e,Math.round(seconds*48000));};
  // the frequency of a mostly sinusoidal signal from its rising zero crossings
  const hz=(d,from,to)=>{let first=-1,last=-1,n=0;for(let i=Math.max(1,from);i<Math.min(to,d.length);i++)if(d[i-1]<0&&d[i]>=0){if(first<0)first=i;last=i;n++;}return n>1?(n-1)*48000/(last-first):0;};

  it('colours the noise without changing its level',()=>{
   const measure=type=>{const d=play(base({levelA:0,noise:1,noiseType:type}),1).slice(12000);let diff=0;for(let i=1;i<d.length;i++)diff+=(d[i]-d[i-1])**2;return {level:rms(d),roughness:Math.sqrt(diff/d.length)/rms(d)};};
   const [white,pink,brown]=[0,1,2].map(measure);
   // each colour is duller than the last, and they are about as loud
   expect(pink.roughness).toBeLessThan(white.roughness*.6);expect(brown.roughness).toBeLessThan(pink.roughness*.5);
   for(const x of [pink,brown])expect(x.level/white.level).toBeGreaterThan(.9),expect(x.level/white.level).toBeLessThan(1.1);
  });

  it('holds the amp envelope at its peak before the decay',()=>{
   const shape={attack:.01,decay:.05,sustain:0,release:.1};
   const plain=play(base(shape),.5),held=play(base({...shape,ampHold:.2}),.5);
   const window=d=>rms(d.slice(Math.round(.1*48000),Math.round(.18*48000)));
   expect(window(held)).toBeGreaterThan(window(plain)*20);       // still at the peak while the plain one has died away
   expect(rms(held.slice(Math.round(.4*48000)))).toBeLessThan(window(held)*.05); // and it does decay afterwards
   // zero hold leaves the envelope as it was
   expect(play(base({...shape,ampHold:0}),.5)).toEqual(plain);
  });

  it('holds below the sustain and then swells to it when the hold has a level',()=>{
   const shape={attack:.01,decay:.1,sustain:1,release:.1,ampHold:.2,ampHoldLevel:.3};
   const d=play(base(shape),.7),at=(from,to)=>rms(d.slice(Math.round(from*48000),Math.round(to*48000)));
   const held=at(.08,.18),after=at(.5,.65);
   expect(held/after).toBeGreaterThan(.22);expect(held/after).toBeLessThan(.4); // held near 0.3 of the sustained level
   // a full hold level is the old behaviour
   expect(play(base({...shape,ampHoldLevel:1}),.5)).toEqual(play(base({...shape,ampHoldLevel:1,sustain:1}),.5));
  });

  it('bends a decay along a mirrored or sine curve when the stage has a shape',()=>{
   // decay from 1 to 0 over .4 s; at the middle (f=.5) the power curve c=2 is at 1-f^2 = .75, the mirrored one at (1-f)^2 = .25, a sine at 1-sin(pi/4) = .29
   const shape={attack:.001,decay:.4,sustain:0,release:.1,ampDecayCurve:2};
   const at=d=>rms(d.slice(Math.round(.19*48000),Math.round(.21*48000)));
   const power=at(play(base(shape),.5)),mirrored=at(play(base({...shape,ampDecayShape:1}),.5)),sine=at(play(base({...shape,ampDecayCurve:1,ampDecayShape:2}),.5));
   expect(mirrored/power).toBeGreaterThan(.28);expect(mirrored/power).toBeLessThan(.4);
   expect(sine/power).toBeGreaterThan(.3);expect(sine/power).toBeLessThan(.46);
   // shape 0 is the curve the engine always had
   expect(play(base({...shape,ampDecayShape:0}),.5)).toEqual(play(base(shape),.5));
  });

  it('plays up to eight unison voices per note',()=>{
   const unison=n=>{const p=base();p.global.unison=n;p.global.spread=12;return play(p,.4);};
   const four=unison(4),eight=unison(8);
   expect(eight.every(Number.isFinite)).toBe(true);
   expect(eight).not.toEqual(four);
   // the sum is levelled by the number of voices, so more of them does not mean louder
   expect(rms(eight.slice(4800))/rms(four.slice(4800))).toBeGreaterThan(.6);expect(rms(eight.slice(4800))/rms(four.slice(4800))).toBeLessThan(1.6);
  });

  it('sweeps the pitch with the pitch envelope and settles on the note',()=>{
   const d=play(base({pitchEnvAmount:12,pitchEnvDecay:.1}),1);
   const start=hz(d,0,1500),end=hz(d,40000,48000);
   expect(end).toBeGreaterThan(430);expect(end).toBeLessThan(450);
   expect(start).toBeGreaterThan(end*1.5);
   const down=play(base({pitchEnvAmount:-12,pitchEnvDecay:.1}),1);
   expect(hz(down,0,3000)).toBeLessThan(end*.8);
  });

  it('starts every note at the same phases when restart is on',()=>{
   const free=id=>play(base({waveB:1,levelB:1,phaseLock:0}),.02,69,id),locked=(id,bPhase=0)=>play(base({waveB:1,levelB:1,phaseLock:1,bPhase}),.02,69,id);
   expect(free(1)).not.toEqual(free(2));       // phases are random per note by default
   expect(locked(1)).toEqual(locked(2));       // and identical per note when restarted
   // two equal sines in phase add to twice one; a quarter-cycle apart they add to about 1.41 times
   expect(rms(locked(1,0))).toBeGreaterThan(rms(locked(1,.25))*1.25);
  });

  it('notches out the cutoff frequency when the filter is a notch',()=>{
   const through=rms(play(base({filter:0,cutoff:18000}),.6).slice(12000));
   const notched=rms(play(base({filter:4,cutoff:440,resonance:.9}),.6).slice(12000));
   const lowpassed=rms(play(base({filter:0,cutoff:440,resonance:.9}),.6).slice(12000));
   expect(notched).toBeLessThan(through*.3);
   expect(lowpassed).toBeGreaterThan(notched*1.5); // the low-pass at the same setting keeps the tone
  });

  it('takes a notch through the ladder family without turning it into a low-pass',()=>{
   const p=base({filter:4,cutoff:440,resonance:.5,filterFamily:1});
   const notched=rms(play(p,.6).slice(12000)),ladderLow=rms(play(base({filter:0,cutoff:440,resonance:.5,filterFamily:1}),.6).slice(12000));
   expect(notched).not.toBeCloseTo(ladderLow,3);
  });
 });
}
