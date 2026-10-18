import {sanitizeInserts} from './insertsConfig';
import {sanitizeInstrumentEffects} from './instrumentEffectsConfig';
import {defaultDrumKit,DRUMS} from '../app/percussion';
const n=(v,lo,hi,d)=>typeof v==='number'&&Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):d;
export function sanitizeProcedural(raw={}){
 if(raw.version!==1||raw.kind!=='procedural')throw Error('Unsupported procedural patch.');
 if(!['piano','pluck','drums'].includes(raw.family))throw Error('Unknown procedural source.');
 const p=raw.piano??{},s=raw.string??{},e=raw.envelope??{},g=raw.global??{},kit=defaultDrumKit();kit.room=0;
 for(const id of DRUMS){const d=raw.kit?.[id]??{};kit[id]={on:typeof d.on==='boolean'?d.on:true,level:n(d.level,0,2,1),tone:n(d.tone,-1,1,0),decay:n(d.decay,.5,2,1)};}
 return {version:1,kind:'procedural',family:raw.family,name:typeof raw.name==='string'?raw.name.slice(0,80):'Prepared source',global:{gain:n(g.gain,0,1,.5),polyphony:Math.round(n(g.polyphony,1,32,16))},envelope:{attack:n(e.attack,.002,4,.003),decay:n(e.decay,.002,4,.12),sustain:n(e.sustain,0,1,.8),release:n(e.release,.01,4,.35)},
  piano:{type:p.type==='electric'?'electric':'felt',decay:n(p.decay,.3,5,2.8),brightness:n(p.brightness,0,1,.4),hammer:n(p.hammer,0,1,.3),unison:n(p.unison,0,1,.25),sustain:n(p.sustain,0,1,.28),resonance:n(p.resonance,0,1,.55),seed:Math.round(n(p.seed,1,0xffffffff,109)),softness:n(p.softness,0,1,0)},
  string:{decay:n(s.decay,.15,5,2),damping:n(s.damping,0,1,.5),position:n(s.position,.05,.45,.2),body:n(s.body,0,1,.4),resonance:n(s.resonance,0,1,.6),bodyType:['guitar','harp','bass','kalimba'].includes(s.bodyType)?s.bodyType:'guitar',seed:Math.round(n(s.seed,1,0xffffffff,223)),softness:n(s.softness,0,1,0)},kit,inserts:sanitizeInserts(raw.inserts),routing:sanitizeInstrumentEffects(raw.routing)};
}
export const proceduralPatch=(family,values={})=>sanitizeProcedural({version:1,kind:'procedural',family,...values});
export function proceduralTail(raw){const p=sanitizeProcedural(raw);return p.family==='drums'?8.1:p.envelope.release;}
export const PROCEDURAL_RECIPES=[
 proceduralPatch('piano',{name:'Prepared felt keys',piano:{softness:.55},inserts:{chorus:.12,highGain:-1}}),
 proceduralPatch('piano',{name:'Prepared electric keys',piano:{type:'electric',brightness:.55,hammer:.15,unison:.15,resonance:.65,seed:223,softness:.35},inserts:{chorus:.28,phaser:.12,phaserDepth:.8}}),
 proceduralPatch('pluck',{name:'Prepared guitar',string:{bodyType:'guitar',softness:.7},inserts:{highGain:-1}}),
 proceduralPatch('pluck',{name:'Prepared harp',string:{decay:3,bodyType:'harp',position:.15,damping:.35,softness:.55},inserts:{chorus:.12}}),
 proceduralPatch('pluck',{name:'Prepared upright',string:{decay:2.4,bodyType:'bass',damping:.7,position:.25,softness:.85},inserts:{lowGain:1,highGain:-2}}),
 proceduralPatch('drums',{name:'Native felt kit',global:{gain:.35},inserts:{highGain:-1}}),
 proceduralPatch('drums',{name:'Native crisp kit',global:{gain:.3},inserts:{saturation:.12,drive:5}}),
];
