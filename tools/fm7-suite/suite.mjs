// Builds the FM7 suite (src/synths/dx7/suitePresets.js): voices drawn by src/synths/dx7/generate.js,
// kept only when they render cleanly, sound like their family (brightness, attack and sustain within
// the range the family's cartridge voices span) and sit far from every cartridge voice, then named and
// level-matched. The cartridges stay local; only the generated voices ship.
// Run with npx vite-node tools/fm7-suite/suite.mjs.
import fs from 'node:fs';
import {createOfflineSynth,MODELS,rms,peak,brightness} from '../../src/synths/engine/offline.js';
import {toPairs,sanitize,VOICE_KEYS,BY_KEY} from '../../src/synths/dx7/params.js';
import {engineValues} from '../../src/synths/dx7/voice.js';
import {generateVoice} from '../../src/synths/dx7/generate.js';
import {romVoices} from './model.mjs';
import {levelVolume} from '../levelMatch.mjs';
import {NAMES} from './names.mjs';

const TOTAL=128,MIN_PER_FAMILY=6;
const module=new WebAssembly.Module(fs.readFileSync('public/synths/classics.wasm'));
const MONO=new Set(['lead','bass','winds','brass']);

// Each family is judged where it plays: a bass voice that is round at middle C can be a thin buzz two
// octaves down, where the generator's bass line sits.
const REGISTER={bass:36};
const lowpass=(a,hz)=>{const c=Math.exp(-2*Math.PI*hz/48000);let y=0;return a.map(x=>y=y*c+(1-c)*x);};
/** Brightness, attack time, sustain, fundamental weight and level of one held note in the family's register, then its release. */
function describe(values,family){
 const s=createOfflineSynth(module,{model:MODELS.dx7,params:toPairs(sanitize({...values,reverbMix:0,chorusMix:0,volume:.6}))});
 s.k.syn_note_on(1,REGISTER[family]??60,.8);const [l]=s.seconds(1.4);s.k.syn_note_off(1);const [t]=s.seconds(.6);
 if(![l,t].every(a=>a.every(Number.isFinite)))return null;
 const frame=480,frames=Array.from({length:Math.floor(l.length/frame)},(_,i)=>rms(l.subarray(i*frame,(i+1)*frame)));
 const top=Math.max(...frames,1e-9),attack=frames.findIndex(x=>x>=top*.5)*frame/48000;
 // in a family's own register the whole held note counts: a bass is heard sustained under the music
 const held=REGISTER[family]?l.subarray(2400):l.subarray(2400,24000);
 return {db:20*Math.log10(Math.max(rms(l),1e-9)),peak:Math.max(peak(l),peak(t)),bright:brightness(held),
  attack,sustain:frames.slice(-12).reduce((a,b)=>a+b,0)/12/top,tail:rms(t.subarray(4800,14400))/top,
  // share of the level below 60 Hz (twice low-passed): how much of a C2 bass is its fundamental
  low:rms(lowpass(lowpass(l.subarray(2400,24000),60),60))/Math.max(rms(l.subarray(2400,24000)),1e-9)};
}

// distance in the voice's own parameter space: mean absolute difference, each value over its range
const RANGE=VOICE_KEYS.filter(k=>BY_KEY[k].id<145).map(k=>[k,BY_KEY[k].max-BY_KEY[k].min||1]);
const dist=(a,b)=>RANGE.reduce((s,[k,r])=>s+Math.abs((a[k]??0)-(b[k]??0))/r,0)/RANGE.length;

const roms=romVoices().map(v=>({...v,values:engineValues(v.raw)}));
console.log('Describing',roms.length,'cartridge voices…');
for(const v of roms)v.d=describe(v.values,v.family);
// how far apart distinct cartridge voices usually are: generated voices must sit at least this far from all of them
const nn=roms.map(a=>Math.min(...roms.filter(b=>b!==a).map(b=>dist(a.values,b.values)))).sort((x,y)=>x-y);
const FAR=nn[Math.floor(nn.length*.5)];
console.log('cartridge nearest-neighbour distance: p10',nn[Math.floor(nn.length*.1)].toFixed(3),'median',FAR.toFixed(3));

const q=(arr,p)=>{const s=[...arr].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];};
const families=[...new Set(roms.map(r=>r.family))];
const range={};
for(const f of families){
 const ds=roms.filter(r=>r.family===f&&r.d&&r.d.db>-60).map(r=>r.d);
 const span=k=>[q(ds.map(d=>d[k]),.1),q(ds.map(d=>d[k]),.9)];
 range[f]={bright:span('bright'),sustain:span('sustain'),attack:span('attack'),low:span('low')};
}
const quota=Object.fromEntries(families.map(f=>[f,Math.max(MIN_PER_FAMILY,Math.round(TOTAL*roms.filter(r=>r.family===f).length/roms.length))]));
let over=Object.values(quota).reduce((a,b)=>a+b,0)-TOTAL;
for(const f of [...families].sort((a,b)=>quota[b]-quota[a])){if(over<=0)break;const cut=Math.min(over,quota[f]-MIN_PER_FAMILY);quota[f]-=cut;over-=cut;}

const within=(x,[lo,hi],slack)=>x>=lo*(1-slack)-slack*.05&&x<=hi*(1+slack)+slack*.05;
const seedBase=f=>[...f].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261)%100000*1000;
const kept=[];
for(const f of families){
 const mine=[];let tries=0;
 for(let seed=seedBase(f);mine.length<quota[f]&&tries<4000;seed++,tries++){
  const values=generateVoice(f,seed),d=describe(values,f);
  if(!d||d.db<-48||d.peak>.98)continue;
  const R=range[f];
  // low registers are dark (brightness about 0.01 at C2): there the margin is relative only
  const near_=REGISTER[f]?(x,[lo,hi],slack)=>x>=lo*(1-slack)&&x<=hi*(1+slack):within;
  if(!near_(d.bright,R.bright,.25)||!within(d.sustain,R.sustain,.3)||!within(d.attack,R.attack,.5))continue;
  if(REGISTER[f]&&!near_(d.low,R.low,.15))continue;
  const near=Math.min(...roms.map(r=>dist(values,r.values)));
  if(near<FAR)continue;
  if(mine.some(m=>dist(values,m.values)<FAR*.8))continue;
  mine.push({family:f,seed,values,d,near});
 }
 console.log(f,mine.length,'/',quota[f],'after',tries,'tries');if(REGISTER[f])console.log('  range',JSON.stringify(range[f]),'kept',mine.map(m=>m.d.bright.toFixed(3)+'/'+m.d.low.toFixed(2)).join(' '));
 kept.push(...mine);
}

// names, styles and levels
const used=new Set();
const style=d=>[d.bright>.35?'bright':d.bright<.12?'dark':null,d.attack>.15?'slow attack':d.sustain<.15?'percussive':'sustained',d.tail>.2?'long tail':null].filter(Boolean);
const rows=kept.map((k,i)=>{
 const pool=NAMES[k.family];let name=pool[i%pool.length];
 for(let j=0;used.has(name);j++)name=pool[(i+j*7+3)%pool.length]+(j>=pool.length?' '+(j/pool.length+1|0):'');
 used.add(name);
 const values=sanitize({...k.values,reverbMix:.15});
 const volume=levelVolume(MODELS.dx7,v=>toPairs({...values,volume:v}),values.volume);
 const voice=RANGE.map(([key])=>values[key]);
 return ` {name:${JSON.stringify(name)},category:'${k.family}',styles:${JSON.stringify(style(k.d))},seed:${k.seed},volume:${volume},voice:[${voice.join(',')}]},`;
});
fs.writeFileSync('src/synths/dx7/suitePresets.js',`// Generated by tools/fm7-suite/suite.mjs; do not edit by hand.
// The FM7 suite: voices drawn by generate.js from aggregate statistics of classic FM cartridges,
// kept when they sound like their family and sit far from every cartridge voice (nearest at least
// the median distance between two cartridge voices). voice: the 145 voice values in params.js order.
export const SUITE_KEYS=${JSON.stringify(RANGE.map(([k])=>k))};
export const SUITE=[
${rows.join('\n')}
];
`);
console.log(`Wrote ${rows.length} suite voices; nearest cartridge voice: min ${Math.min(...kept.map(k=>k.near)).toFixed(3)}, threshold ${FAR.toFixed(3)}.`);
