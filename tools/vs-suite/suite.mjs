// Builds the VectorVS suite (src/synths/vs/suitePresets.js): programs drawn by src/synths/vs/generate.js,
// kept when they render cleanly, sound like their family (brightness, attack and sustain within the
// range the family's bank programs span, those heard with their own waves) and sit far from every bank
// program; then named and level-matched. Played on this synth's built-in waves. The banks stay local.
// Run with npx vite-node tools/vs-suite/suite.mjs.
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms,peak,brightness} from '../../src/synths/engine/offline.js';
import {toPairs,sanitize,engineValues} from '../../src/synths/vs/params.js';
import {builtinWaves} from '../../src/synths/vs/waves.js';
import {generateProgram} from '../../src/synths/vs/generate.js';
import {programs,SCALARS,CHOICES,ENVELOPES} from './model.mjs';
import {levelVolume,measure} from '../levelMatch.mjs';
import {NAMES} from './names.mjs';

const TOTAL=100,MIN_PER_FAMILY=4;
const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const BUILTIN=builtinWaves();

// Each family is judged where it plays (as in the FM7 suite): a bass is heard at C2, held under the music.
const REGISTER={bass:36};
const lowpass=(a,hz)=>{const c=Math.exp(-2*Math.PI*hz/48000);let y=0;return a.map(x=>y=y*c+(1-c)*x);};
function describe(values,waves,family){
 const s=createOfflineSynth(module,{model:MODELS.vs,waves,params:toPairs(sanitize({...values,reverbMix:0,chorusMix:0}))});
 s.k.syn_note_on(1,REGISTER[family]??60,.8);const [l]=s.seconds(1.4);s.k.syn_note_off(1);const [t]=s.seconds(.6);
 if(![l,t].every(a=>a.every(Number.isFinite)))return null;
 const frame=480,frames=Array.from({length:Math.floor(l.length/frame)},(_,i)=>rms(l.subarray(i*frame,(i+1)*frame)));
 const top=Math.max(...frames,1e-9),attack=frames.findIndex(x=>x>=top*.5)*frame/48000;
 const held=REGISTER[family]?l.subarray(2400):l.subarray(2400,24000);
 return {db:20*Math.log10(Math.max(rms(l),1e-9)),peak:Math.max(peak(l),peak(t)),bright:brightness(held),
  attack,sustain:frames.slice(-12).reduce((a,b)=>a+b,0)/12/top,
  // share of the level below 60 Hz: how much of a C2 bass is its fundamental
  low:rms(lowpass(lowpass(held,60),60))/Math.max(rms(held),1e-9)};
}

// distance over the program's settings (waves left out: the suite plays its own), each over its range
const KEYS=[...Object.entries(SCALARS).map(([k,[lo,hi]])=>[k,hi-lo]),...CHOICES.map(k=>[k,k.endsWith('Dest')?1000:7]),
 ...Object.values(ENVELOPES).flat().map(k=>[k,/^mix[XY]/.test(k)?127:99]),...['A','B','C','D'].flatMap(x=>[['coarse'+x,24],['fine'+x,99]])];
const dist=(a,b)=>KEYS.reduce((s,[k,r])=>s+Math.min(1,Math.abs((a[k]??0)-(b[k]??0))/r),0)/KEYS.length;

const bank=programs();
console.log('Describing',bank.length,'bank programs…');
for(const p of bank)p.d=describe(engineValues(p.raw),p.waves,p.family);
const nn=bank.map(a=>Math.min(...bank.filter(b=>b!==a).map(b=>dist(a.raw,b.raw)))).sort((x,y)=>x-y);
const FAR=nn[Math.floor(nn.length*.5)];
console.log('bank nearest-neighbour distance: p10',nn[Math.floor(nn.length*.1)].toFixed(3),'median',FAR.toFixed(3));

const q=(arr,p)=>{const s=[...arr].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];};
const families=[...new Set(bank.map(p=>p.family))];
const range={};
for(const f of families){
 const ds=bank.filter(p=>p.family===f&&p.d&&p.d.db>-60).map(p=>p.d);
 const span=k=>[q(ds.map(d=>d[k]),.1),q(ds.map(d=>d[k]),.9)];
 range[f]={bright:span('bright'),sustain:span('sustain'),attack:span('attack'),low:span('low')};
}
const quota=Object.fromEntries(families.map(f=>[f,Math.max(MIN_PER_FAMILY,Math.round(TOTAL*bank.filter(p=>p.family===f).length/bank.length))]));
let over=Object.values(quota).reduce((a,b)=>a+b,0)-TOTAL;
for(const f of [...families].sort((a,b)=>quota[b]-quota[a])){if(over<=0)break;const cut=Math.min(over,quota[f]-MIN_PER_FAMILY);quota[f]-=cut;over-=cut;}

const within=(x,[lo,hi],slack)=>x>=lo*(1-slack)-slack*.05&&x<=hi*(1+slack)+slack*.05;
const seedBase=f=>[...f].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261)%100000*1000;
const kept=[];
for(const f of families){
 const mine=[];let tries=0;
 for(let seed=seedBase(f);mine.length<quota[f]&&tries<3000;seed++,tries++){
  const raw=generateProgram(f,seed),d=describe(engineValues(raw),BUILTIN,f);
  if(!d||d.db<-50||d.peak>.98)continue;
  const R=range[f];
  // low registers are dark: there the margin is relative only
  const near_=REGISTER[f]?(x,[lo,hi],slack)=>x>=lo*(1-slack)&&x<=hi*(1+slack):within;
  if(!near_(d.bright,R.bright,.3)||!within(d.sustain,R.sustain,.3)||!within(d.attack,R.attack,.6))continue;
  if(REGISTER[f]&&!near_(d.low,R.low,.15))continue;
  const near=Math.min(...bank.map(p=>dist(raw,p.raw)));
  if(near<FAR)continue;
  if(mine.some(m=>dist(raw,m.raw)<FAR*.8))continue;
  mine.push({family:f,seed,raw,d,near});
 }
 console.log(f,mine.length,'/',quota[f],'after',tries,'tries');if(REGISTER[f])console.log('  range',JSON.stringify(range[f]),'kept',mine.map(m=>m.d.bright.toFixed(3)+'/'+m.d.low.toFixed(2)).join(' '));
 kept.push(...mine);
}

const used=new Set();
const style=d=>[d.bright>.35?'bright':d.bright<.12?'dark':null,d.attack>.15?'slow attack':d.sustain<.15?'percussive':'sustained'].filter(Boolean);
const FIELDS=Object.keys(kept[0].raw);
const rows=kept.map((k,i)=>{
 const pool=NAMES[k.family];let name=pool[i%pool.length];
 for(let j=0;used.has(name);j++)name=pool[(i+j*7+3)%pool.length]+(j>=pool.length?' '+(j/pool.length+1|0):'');
 used.add(name);
 const values=sanitize({...engineValues(k.raw),reverbMix:.15});
 let volume=Math.round(levelVolume(MODELS.vs,v=>toPairs({...values,volume:Math.round(v)}),values.volume,-23,99,BUILTIN));
 // the stored volume is a whole step: step down until a chord stays clear of full scale
 while(volume>1&&measure(MODELS.vs,toPairs({...values,volume}),undefined,BUILTIN).peak>=.95)volume-=2;
 return ` {name:${JSON.stringify(name)},category:'${k.family}',styles:${JSON.stringify(style(k.d))},seed:${k.seed},volume:${volume},program:[${FIELDS.map(f=>k.raw[f]).join(',')}]},`;
});
fs.writeFileSync('src/synths/vs/suitePresets.js',`// Generated by tools/vs-suite/suite.mjs; do not edit by hand.
// The VectorVS suite: programs drawn by generate.js from aggregate statistics of classic vector-synth
// banks, played on this synth's own waves, kept when they sound like their family and sit far from
// every bank program. program: the values of SUITE_FIELDS, in order.
export const SUITE_FIELDS=${JSON.stringify(FIELDS)};
export const SUITE=[
${rows.join('\n')}
];
`);
console.log(`Wrote ${rows.length} suite programs; nearest bank program: min ${Math.min(...kept.map(k=>k.near)).toFixed(3)}, threshold ${FAR.toFixed(3)}.`);
