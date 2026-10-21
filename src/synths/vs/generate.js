// VectorVS program generator: samples a new program for a sound family from aggregate statistics
// of classic vector-synth banks (suiteModel.json: counts of each setting, envelope and vector-path
// archetypes averaged over several programs, and the character of the waves they pick). Waves come
// from this synth's own built-in set, chosen by character. Seeded: a seed always gives the same program.
import MODEL from './suiteModel.json';
import {builtinWaves,CYCLE,WAVE_COUNT} from './waves';

export function rng(seed){
 let a=seed>>>0;
 return ()=>{a=a+0x6d2b79f5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
const gauss=r=>{const u=Math.max(1e-9,r()),v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(v)));

/** A wave's character: harmonic centroid (brightness) and odd-harmonic share, and its bin "c:o". */
export function waveCharacter(cycle){
 const a=[];
 for(let h=1;h<=32;h++){let re=0,im=0;for(let n=0;n<CYCLE;n++){const t=2*Math.PI*h*n/CYCLE;re+=cycle[n]*Math.cos(t);im+=cycle[n]*Math.sin(t);}a[h]=Math.hypot(re,im);}
 const sum=a.reduce((s,x)=>s+(x||0),0)||1;
 const centroid=a.reduce((s,x,h)=>s+(x||0)*h,0)/sum,odd=a.reduce((s,x,h)=>s+(h%2?x||0:0),0)/sum;
 const c=[1.3,1.8,2.6,3.6,5,7,10].findIndex(t=>centroid<t),o=odd<.6?0:odd<.85?1:2;
 return {centroid,odd,bin:`${c<0?7:c}:${o}`};
}
let builtin=null;
const builtinBins=()=>builtin??=Array.from({length:WAVE_COUNT},(_,n)=>waveCharacter(builtinWaves().subarray(n*CYCLE,(n+1)*CYCLE)));

function draw(r,own,all,weight){
 const keys=Object.keys(all);
 const w=keys.map(k=>(own?.[k]??0)*weight+(all[k]??0)+.02);
 let x=r()*w.reduce((a,b)=>a+b,0);
 for(let i=0;i<keys.length;i++){x-=w[i];if(x<=0)return keys[i];}
 return keys.at(-1);
}
const SCALARS={cutoff:[0,99],resonance:[0,99],filterEnvAmount:[0,99],lfo1Rate:[0,99],lfo2Rate:[0,99],lfo1Amount:[0,99],lfo2Amount:[0,99],glide:[0,99],
 chorusRate:[0,99],chorusDepth:[0,99],pressureAmount:[-99,99],velocityAmount:[-99,99],keyboardAmount:[-99,99],filterEnvModAmount:[-99,99]};
const R=['1','2','3','4','4A'];
const ENVELOPES={amp:[...R.map(r=>'ampRate'+r),...[0,1,2,3].map(i=>'ampLevel'+i)],
 filter:[...R.map(r=>'filterRate'+r),...[0,1,2,3,4].map(i=>'filterLevel'+i)],
 mix:[...R.map(r=>'mixRate'+r),...[0,1,2,3,4].map(i=>'mixX'+i),...[0,1,2,3,4].map(i=>'mixY'+i)]};

export const FAMILIES=Object.keys(MODEL.families);

/** A new program for a family: the program's fields (raw names, as params.js keys). */
export function generateProgram(familyId,seed){
 const r=rng(seed),fam=MODEL.families[familyId]??MODEL.all,all=MODEL.all;
 const w=Math.min(4,30/Math.max(1,fam.programs));
 const p={};
 for(const [k,[lo,hi]] of Object.entries(SCALARS)){const b=+draw(r,fam.scalars[k],all.scalars[k],w),width=(hi-lo+1)/10;p[k]=clamp(lo+(b+r())*width,lo,hi);}
 for(const k of Object.keys(all.choices))p[k]=+draw(r,fam.choices[k],all.choices[k],w);
 // envelopes and the vector path: an archetype (an average of several programs) with jitter
 for(const [k,keys] of Object.entries(ENVELOPES)){
  const a=(fam.envelopes[k]?.length?fam.envelopes[k]:all.envelopes[k]),arch=a[Math.floor(r()*a.length)];
  keys.forEach((f,i)=>{const xy=/^mix[XY]/.test(f);p[f]=clamp(arch.mean[i]+gauss(r)*arch.sd[i]*.5,xy?-64:0,xy?63:99);});
 }
 // oscillators: tuning patterns, and a built-in wave with the character the family tends to pick
 const bins=builtinBins();
 // The oscillators are tuned as a set: one pattern (coarse + fine for all four) is drawn, then moved so
 // its lowest oscillator sounds on the played note or an octave of it - the intervals between the
 // oscillators stay, a whole-program offset (a semitone, a fifth) would play out of key.
 let tuning=null;
 if(all.tuning){
  tuning=draw(r,fam.tuning,all.tuning,w).split(',').map(t=>t.split('+').map(Number));
  const low=Math.min(...tuning.map(([c,f])=>c+f/99)),shift=Math.round(low)%12;
  tuning=tuning.map(([c,f])=>[c-shift<0?c-shift+12:c-shift,f]);
 }
 ['A','B','C','D'].forEach((x,i)=>{
  p['coarse'+x]=tuning?tuning[i][0]:+draw(r,fam.coarse[i],all.coarse[i],w);
  p['fine'+x]=tuning?clamp(tuning[i][1]+r()*2,0,99):clamp(+draw(r,fam.fine[i],all.fine[i],w)+r()*4,0,99);
  const want=draw(r,fam.waves[i],all.waves[i],w),[wc,wo]=want.split(':').map(Number);
  const score=n=>{const [c,o]=bins[n].bin.split(':').map(Number);return Math.abs(c-wc)*2+Math.abs(o-wo);};
  const best=Math.min(...bins.map((_,n)=>score(n)));
  const pool=bins.map((_,n)=>n).filter(n=>score(n)===best);
  p['wave'+x]=pool[Math.floor(r()*pool.length)];
 });
 p.volume=75;
 // a key press starts from silence (a non-zero start level pops), and the program must reach some level
 p.ampLevel0=Math.min(p.ampLevel0,4);
 if(Math.max(p.ampLevel1,p.ampLevel2,p.ampLevel3)<40)p.ampLevel1=p.ampLevel2=90;
 return p;
}
