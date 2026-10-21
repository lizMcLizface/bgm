// Reduces the local DX7 ROM cartridges (banks/dx7/rom*.syx) to aggregate statistics per sound
// family and operator role, for generating FM7 voices in their spirit: how often each algorithm,
// ratio, level and feedback occurs, and envelope archetypes that are averages of several voices.
// No single voice survives the reduction. buildModel.mjs writes it to src/synths/dx7/suiteModel.json.
import fs from 'node:fs';
import {parseDx7Sysex} from '../../src/synths/dx7/sysex.js';
import {algorithmGraph} from '../../src/synths/dx7/algorithms.js';
import {FAMILIES,family} from './families.mjs';

const CARTS=['rom1a','rom1b','rom2a','rom2b','rom3a','rom3b','rom4a','rom4b'];
const MIN_MEMBERS=3;   // an envelope archetype averages at least this many voices

export function romVoices(){
 const seen=new Set(),out=[];
 for(const cart of CARTS)for(const v of parseDx7Sysex(new Uint8Array(fs.readFileSync(`banks/dx7/${cart}.syx`)))){
  const key=Array.from(v.raw.subarray(0,145)).join(',');
  if(seen.has(key))continue;seen.add(key);
  out.push({raw:v.raw,name:v.name.trim(),family:family(v.name)});
 }
 return out;
}

// raw layout: operator n at (6-n)*21: r1-4, l1-4, break, ldepth, rdepth, lcurve, rcurve, rs, ams, vel, level, mode, coarse, fine, detune
export const op=(raw,n)=>{const b=(6-n)*21,g=i=>raw[b+i];return {eg:[0,1,2,3,4,5,6,7].map(g),bp:g(8),ld:g(9),rd:g(10),lc:g(11),rc:g(12),rs:g(13),ams:g(14),vel:g(15),level:g(16),mode:g(17),coarse:g(18),fine:g(19),detune:g(20)};};
export const roleOf=(depth,n)=>depth[n]===0?'carrier':depth[n]===1?'mod':'deep';

const count=(arr,v)=>{arr[v]=(arr[v]??0)+1;return arr;};
const hist=n=>Array(n).fill(0);
function kmeans(points,k,iters=30){
 if(points.length<MIN_MEMBERS)return [];
 k=Math.max(1,Math.min(k,Math.floor(points.length/MIN_MEMBERS)));
 let c=points.filter((_,i)=>i%Math.floor(points.length/k)===0).slice(0,k).map(p=>[...p]);
 let assign=[];
 for(let it=0;it<iters;it++){
  assign=points.map(p=>c.reduce((b,q,j)=>{const d=p.reduce((s,x,i)=>s+(x-q[i])**2,0);return d<b[0]?[d,j]:b;},[Infinity,0])[1]);
  c=c.map((q,j)=>{const m=points.filter((_,i)=>assign[i]===j);return m.length?q.map((_,i)=>m.reduce((s,p)=>s+p[i],0)/m.length):q;});
 }
 return c.map((q,j)=>{const m=points.filter((_,i)=>assign[i]===j);
  return {members:m.length,mean:q.map(x=>Math.round(x)),sd:q.map((x,i)=>Math.round(Math.sqrt(m.reduce((s,p)=>s+(p[i]-x)**2,0)/Math.max(1,m.length))))};})
  .filter(a=>a.members>=MIN_MEMBERS);
}

function stats(voices){
 const s={voices:voices.length,algorithm:hist(32),feedback:hist(8),lfoSpeed:hist(10),lfoDelay:hist(10),pitchModDepth:hist(10),ampModDepth:hist(10),lfoWave:hist(6),pitchModSens:hist(8),lfoSync:hist(2),oscKeySync:hist(2),transpose:{},roles:{}};
 const eg={carrier:[],mod:[],deep:[]},pitch=[];
 for(const {raw} of voices){
  count(s.algorithm,raw[134]);count(s.feedback,raw[135]);count(s.lfoSpeed,Math.min(9,raw[137]/10|0));count(s.lfoDelay,Math.min(9,raw[138]/10|0));
  count(s.pitchModDepth,Math.min(9,raw[139]/10|0));count(s.ampModDepth,Math.min(9,raw[140]/10|0));count(s.lfoSync,raw[141]);count(s.lfoWave,raw[142]);
  count(s.pitchModSens,raw[143]);count(s.oscKeySync,raw[136]);count(s.transpose,raw[144]);
  pitch.push([126,127,128,129,130,131,132,133].map(i=>raw[i]));
  const {depth}=algorithmGraph(raw[134]);
  for(let n=1;n<=6;n++){
   const o=op(raw,n),role=roleOf(depth,n);
   const r=s.roles[role]??={n:0,ratio:{},fixed:0,level:hist(34),detune:hist(15),velocity:hist(8),rateScale:hist(8),ams:hist(4),leftDepth:hist(10),rightDepth:hist(10),leftCurve:hist(4),rightCurve:hist(4),breakPoint:hist(10)};
   r.n++;if(o.mode)r.fixed++;
   count(r.ratio,`${o.mode}:${o.coarse}:${o.fine}`);count(r.level,Math.min(33,o.level/3|0));count(r.detune,o.detune);count(r.velocity,o.vel);
   count(r.rateScale,o.rs);count(r.ams,o.ams);count(r.leftDepth,Math.min(9,o.ld/10|0));count(r.rightDepth,Math.min(9,o.rd/10|0));
   count(r.leftCurve,o.lc);count(r.rightCurve,o.rc);count(r.breakPoint,Math.min(9,o.bp/10|0));
   eg[role].push(o.eg);
  }
 }
 for(const role of Object.keys(s.roles))s.roles[role].eg=kmeans(eg[role],4);
 s.pitchEg=kmeans(pitch,2);
 return s;
}

/** The model: statistics per family and for all voices together. */
export function buildModel(voices=romVoices()){
 const model={schema:1,source:'Aggregate statistics of the DX7 ROM cartridges (tools/fm7-suite/model.mjs): counts and envelope averages of at least '+MIN_MEMBERS+' voices; no voice is stored.',
  families:{},all:stats(voices)};
 for(const f of FAMILIES){const v=voices.filter(x=>x.family===f.id);if(v.length)model.families[f.id]=stats(v);}
 return model;
}
