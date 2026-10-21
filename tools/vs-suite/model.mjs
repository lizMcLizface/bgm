// Reduces the local VS program banks (banks/prophet-vs) to aggregate statistics per sound family,
// for generating VectorVS programs in their spirit: counts of each setting, envelope and vector-path
// archetypes averaged over several programs, and the character of the waves they choose (how bright,
// how odd-harmonic), never wave numbers or wave data. buildModel.mjs writes src/synths/vs/suiteModel.json.
import fs from 'node:fs';
import {parseVsSysex} from '../../src/synths/vs/sysex.js';
import {composeWaves,CYCLE} from '../../src/synths/vs/waves.js';
import {waveCharacter} from '../../src/synths/vs/generate.js';

export const FAMILIES=[
 {id:'voices',words:['CHOIR','VOCAL','VOX','TECHOIRD']},
 {id:'strings',words:['STRING','STRNG','STRG','QUARTET','NORCHTRA','FILMUSIC']},
 {id:'bells',words:['BELL','GLASS','CHINABL','BELTONE','KALIMBA','VIBE','MARIMBA','DIGIMBA','MBA','STEEL','WOODMETL','PACBELL','TINEY']},
 {id:'keys',words:['PIAN','RHOAD','RHOD','E PIANO','CLAV','KEY','WURLI','EMRSON','GGP']},
 {id:'organ',words:['ORGAN','ORGIZM','PIPE','HARMNIUM','DRAW','LESLIE']},
 {id:'brass',words:['HORN','BRS','BRASS']},
 {id:'bass',words:['BASS','BAS']},
 {id:'winds',words:['WOODWIND','FLUT','SHAKU','CHIFF','PUCKER','WOODY']},
 {id:'plucks',words:['GITAR','TWANG','JIBE','HARP','PERKY','PERKEY']},
 {id:'lead',words:['LEAD','SQUARES','MOOG','PROFET','FAMOUS','REZSYNTH','SYNTH','HEAVY','ANAGLIDE','GLIDEY']},
 {id:'percussion',words:['DRUM','DRM','TABLOID','TAKATTAK','DADADUM','CLACY','BLUNTOBJ','AFRICA']},
 {id:'pads',words:['ZENNY','PAD','AMBIENCE','SOLACE','EXODUS','MASS','SPACE','BEHIND','ELYSE','SOFTHEIM','SURELY']},
 {id:'fx',words:['FX','NITEMARE','DIVE','ALARM','RADIO','MEDSCAN','CRIKET','TOYPLANE','SAMPHOLD','S H','STARTRAK','CHOPPER','IRONFLY','VOLKANIK','FEEDBACK','PITCHENV','THING','ZARG','ACIDRAIN']},
];
// names that match nothing are the VS's own vector textures
export const family=name=>{const n=name.toUpperCase();let best='vector',at=Infinity;
 for(const f of FAMILIES)for(const w of f.words){const i=n.indexOf(w);if(i>=0&&i<at){at=i;best=f.id;}}return best;};

const MIN_MEMBERS=3;
export function programs(){
 const wavs=[{bytes:new Uint8Array(fs.readFileSync('banks/prophet-vs/waves-000-063.wav')),first:0},{bytes:new Uint8Array(fs.readFileSync('banks/prophet-vs/waves-064-127.wav')),first:64}];
 const out=[];
 for(const set of ['factory','rom-cart']){
  const waves=composeWaves({wavs,userDump:new Uint8Array(fs.readFileSync(`banks/prophet-vs/${set}-user-waves.syx`))});
  const character=n=>waveCharacter(waves.subarray(n*CYCLE,(n+1)*CYCLE));
  for(const p of parseVsSysex(new Uint8Array(fs.readFileSync(`banks/prophet-vs/${set}-programs.syx`))))
   out.push({name:p.name.trim(),family:family(p.name),raw:p.raw,set,waves,character:['A','B','C','D'].map(x=>character(p.raw['wave'+x]))});
 }
 return out;
}

const count=(o,k)=>{o[k]=(o[k]??0)+1;return o;};
const bin=(v,lo,hi,n=10)=>Math.max(0,Math.min(n-1,Math.floor((v-lo)/(hi-lo+1)*n)));
export const SCALARS={cutoff:[0,99],resonance:[0,99],filterEnvAmount:[0,99],lfo1Rate:[0,99],lfo2Rate:[0,99],lfo1Amount:[0,99],lfo2Amount:[0,99],glide:[0,99],
 chorusRate:[0,99],chorusDepth:[0,99],pressureAmount:[-99,99],velocityAmount:[-99,99],keyboardAmount:[-99,99],filterEnvModAmount:[-99,99]};
export const CHOICES=['ampLoop','ampRepeat','filterLoop','filterRepeat','mixLoop','mixRepeat','lfo1Shape','lfo2Shape','unison','chorusSides','lfo1Dest','lfo2Dest','pressureDest','velocityDest','keyboardDest','filterEnvDest','modWheelDest'];
const R=['1','2','3','4','4A'];
export const ENVELOPES={
 amp:[...R.map(r=>'ampRate'+r),...[0,1,2,3].map(i=>'ampLevel'+i)],
 filter:[...R.map(r=>'filterRate'+r),...[0,1,2,3,4].map(i=>'filterLevel'+i)],
 mix:[...R.map(r=>'mixRate'+r),...[0,1,2,3,4].map(i=>'mixX'+i),...[0,1,2,3,4].map(i=>'mixY'+i)],
};

function kmeans(points,k){
 if(points.length<MIN_MEMBERS)return [];
 k=Math.max(1,Math.min(k,Math.floor(points.length/MIN_MEMBERS)));
 let c=points.filter((_,i)=>i%Math.floor(points.length/k)===0).slice(0,k).map(p=>[...p]),assign=[];
 for(let it=0;it<30;it++){
  assign=points.map(p=>c.reduce((b,q,j)=>{const d=p.reduce((s,x,i)=>s+(x-q[i])**2,0);return d<b[0]?[d,j]:b;},[Infinity,0])[1]);
  c=c.map((q,j)=>{const m=points.filter((_,i)=>assign[i]===j);return m.length?q.map((_,i)=>m.reduce((s,p)=>s+p[i],0)/m.length):q;});
 }
 return c.map((q,j)=>{const m=points.filter((_,i)=>assign[i]===j);
  return {members:m.length,mean:q.map(x=>Math.round(x)),sd:q.map((x,i)=>Math.round(Math.sqrt(m.reduce((s,p)=>s+(p[i]-x)**2,0)/Math.max(1,m.length))))};}).filter(a=>a.members>=MIN_MEMBERS);
}

function stats(list){
 const s={programs:list.length,scalars:{},choices:{},coarse:[{},{},{},{}],fine:[{},{},{},{}],tuning:{},waves:[{},{},{},{}],envelopes:{}};
 for(const p of list){
  for(const [k,[lo,hi]] of Object.entries(SCALARS))count(s.scalars[k]??={},bin(p.raw[k]??0,lo,hi));
  for(const k of CHOICES)count(s.choices[k]??={},p.raw[k]??0);
  ['A','B','C','D'].forEach((x,i)=>{count(s.coarse[i],p.raw['coarse'+x]??0);count(s.fine[i],Math.round((p.raw['fine'+x]??0)/5)*5);count(s.waves[i],p.character[i].bin);});
  // the four oscillators' tunings as one pattern (unison, octaves, octave and fifth …): programs tune
  // their oscillators together, so the generator draws a whole pattern rather than four independent ones
  // coarse and fine together: a coarse 11 with fine 95 is the same pitch as a coarse 12
  count(s.tuning,['A','B','C','D'].map(x=>`${p.raw['coarse'+x]??0}+${Math.round((p.raw['fine'+x]??0)/5)*5}`).join(','));
 }
 for(const [k,keys] of Object.entries(ENVELOPES))s.envelopes[k]=kmeans(list.map(p=>keys.map(f=>p.raw[f]??0)),4);
 return s;
}

export function buildModel(list=programs()){
 const model={schema:1,source:'Aggregate statistics of the VS program banks (tools/vs-suite/model.mjs): counts, wave-character bins and envelope/vector archetypes averaged over at least '+MIN_MEMBERS+' programs; no program or wave is stored.',
  families:{},all:stats(list)};
 for(const f of [...FAMILIES.map(f=>f.id),'vector']){const v=list.filter(x=>x.family===f);if(v.length)model.families[f]=stats(v);}
 return model;
}
