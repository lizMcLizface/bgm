// The three drum machines: track lists (the order is the kernel's track order, see
// synth-engine/classics/src/drums.rs), parameter tables, factory sounds and starter beats.
import {defineParams,SPACE} from '../params';
import {MODELS} from '../engine/offline';

// [key, short name, long name]
const TRACKS_808=[['bd','BD','Bass drum'],['sd','SD','Snare drum'],['lt','LT','Low tom'],['mt','MT','Mid tom'],['ht','HT','High tom'],['lc','LC','Low conga'],['mc','MC','Mid conga'],['hc','HC','High conga'],['rs','RS','Rim shot'],['cl','CL','Claves'],['cp','CP','Hand clap'],['ma','MA','Maracas'],['cb','CB','Cowbell'],['cy','CY','Cymbal'],['oh','OH','Open hat'],['ch','CH','Closed hat']];
const TRACKS_909=[['bd','BD','Bass drum'],['sd','SD','Snare drum'],['lt','LT','Low tom'],['mt','MT','Mid tom'],['ht','HT','High tom'],['rs','RS','Rim shot'],['cp','CP','Hand clap'],['ch','CH','Closed hat'],['oh','OH','Open hat'],['cr','CR','Crash'],['rd','RD','Ride']];
const TRACKS_707=[['bd','BD','Bass drum'],['sd','SD','Snare drum'],['lt','LT','Low tom'],['mt','MT','Mid tom'],['ht','HT','High tom'],['rs','RS','Rim shot'],['cp','CP','Hand clap'],['cb','CB','Cowbell'],['tb','TB','Tambourine'],['ch','CH','Closed hat'],['oh','OH','Open hat'],['cr','CR','Crash'],['rd','RD','Ride']];
const TRACKS_606=[['bd','BD','Bass drum'],['sd','SD','Snare drum'],['lt','LT','Low tom'],['ht','HT','High tom'],['ch','CH','Closed hat'],['oh','OH','Open hat'],['cy','CY','Cymbal']];

// Each voice has a colour, shared by its step row, its fader and its panel: kicks and snares warm, toms orange, congas and
// percussion green and pink, hats and cymbals cool (the 808's own step keys came in red, orange, yellow and cream).
const VOICE_COLOURS={bd:'#ff5a36',sd:'#ffc233',lt:'#ff8a3d',mt:'#ff9d52',ht:'#ffb36b',lc:'#2fcfa4',mc:'#4fdcb4',hc:'#82e8c8',rs:'#f36fae',cl:'#e0488d',cp:'#ff7ab8',ma:'#a083ff',cb:'#ffd84a',cy:'#58b6ff',oh:'#45d3ea',ch:'#86e6f6',cr:'#6aa4ff',rd:'#8aa0ff'};
// Each machine has its own palette, so the four pages do not read as one design: the 808 warm and sunny, the 909 steel with
// orange and ice blue, the 606 pastel teal and pink, the 707 neon.
const PALETTES={
 tr808:VOICE_COLOURS,
 tr909:{bd:'#ff6a1a',sd:'#ff9d2e',lt:'#ffc247',mt:'#ffd466',ht:'#ffe38a',rs:'#c9ccd1',cp:'#ff4d5e',ch:'#6fb1ff',oh:'#4c8dff',cr:'#9cc3ff',rd:'#7fa6ff'},
 tr606:{bd:'#2fcfa4',sd:'#ff8fb3',lt:'#ffd36b',ht:'#ffb36b',ch:'#7ad7ff',oh:'#5bb8ff',cy:'#c4a3ff'},
 tr707:{bd:'#ff3d81',sd:'#ffe14a',lt:'#ff9b3d',mt:'#ff7f50',ht:'#ff6b6b',rs:'#35e0ff',cp:'#ff5de1',cb:'#7dff7a',tb:'#00ffd0',ch:'#5ad1ff',oh:'#3d8bff',cr:'#b388ff',rd:'#8f7bff'},
};
export const voiceColour=(key,kitId='tr808')=>(PALETTES[kitId]??VOICE_COLOURS)[key]??'#e0a526';
export const ACCENT_COLOUR='#ff4d6d';

export const KITS={
 tr808:{id:'tr808',name:'808',subtitle:'analog drum machine',model:MODELS.tr808,tracks:TRACKS_808,tone:{bd:'Click',sd:'Snappy',cp:'Filter',ch:'Tone',oh:'Tone',cy:'Tone',cb:'Tone',lc:'Tone',mc:'Tone',hc:'Tone',ma:'Tone'}},
 tr909:{id:'tr909',name:'909',subtitle:'hybrid drum machine',model:MODELS.tr909,tracks:TRACKS_909,tone:{bd:'Attack',sd:'Snappy',cp:'Filter',ch:'Tone',oh:'Tone',cr:'Tone',rd:'Tone'},
  // the voice knobs of the original panel (the rest are extras of ours, under More): Level is every voice's fader
  knobs:{bd:['Tune','Tone','Decay'],sd:['Tune','Tone'],lt:['Tune','Decay'],mt:['Tune','Decay'],ht:['Tune','Decay'],ch:['Decay'],oh:['Decay'],cr:['Tune'],rd:['Tune']}},
 tr707:{id:'tr707',name:'707',subtitle:'digital drum machine',model:MODELS.tr707,tracks:TRACKS_707,tone:{bd:'Attack',sd:'Snappy',cp:'Filter',cb:'Tone',tb:'Tone',ch:'Tone',oh:'Tone',cr:'Tone',rd:'Tone'},
  // The 707 was sampled, with a Level and Tune per drum and a Decay on the hats. The kernel's STYLE_707 (drums.rs) gives it the 909's
  // digital voice architecture with shorter, brighter specs, plus a cowbell and a tambourine; no recordings are played back.
  knobs:{bd:['Tune'],sd:['Tune'],lt:['Tune'],mt:['Tune'],ht:['Tune'],ch:['Decay'],oh:['Decay']}},
 tr606:{id:'tr606',name:'606',subtitle:'small analog drum machine',model:MODELS.tr606,tracks:TRACKS_606,tone:{bd:'Click',sd:'Snappy',ch:'Tone',oh:'Tone',cy:'Tone'},
  knobs:{bd:['Tune','Decay'],sd:['Tone'],lt:['Tune'],ht:['Tune'],oh:['Decay'],cy:['Tone']}},
};

const FIELDS=[['Level',0,'%','lin',0,1,.8],['Tune',1,'%','lin',0,1,.5],['Decay',2,'%','lin',0,1,.5],['Tone',3,'%','lin',0,1,.5],['Pan',4,'bi','lin',-1,1,0]];

export function drumParams(kit){
 const rows=[];
 kit.tracks.forEach(([key],t)=>{
  for(const [name,offset,unit,curve,min,max,value] of FIELDS)rows.push([key+name,t*8+offset,kit.tone[key]&&name==='Tone'?kit.tone[key]:name,min,max,value,unit,curve]);
 });
 rows.push(['master',128,'Master',0,1,.8,'%','lin'],['accent',129,'Accent',0,1,.5,'%','lin'],['tempo',130,'Tempo',40,220,120,'bpm','lin'],['swing',131,'Swing',.5,.75,.5,'swing','lin'],['flam',132,'Flam',0,1,.5,'%','lin'],
  // Missing in old patches/share links means the original deep kick. Factory
  // recipes explicitly select Classic; no existing numeric parameter is changed.
  ['kickBody',133,'Kick body',0,1,1,'n','step',['Classic','Deep']],['voices',135,'Voices',1,16,16,'n','lin']);
 rows.push(...SPACE);
 return defineParams(rows);
}

// Sounds are overrides on the defaults: {track: {field: value}}.
/** This synth's sound categories, in picker order (each sound names one). */
export const CATEGORIES=[
 {id:'dry',label:'Dry kits',blurb:'Close, short and clipped'},
 {id:'big',label:'Big kits',blurb:'Long kicks, low tunings and rooms'},
];
const SOUNDS=[
 {name:'Classic',category:'dry',styles:['reference'],colour:'#d96a3a',note:'Dry kit at centre settings, for reference comparisons.',set:{},fx:{reverbMix:0}},
 {name:'Tight',category:'dry',styles:['short'],colour:'#7fd0c8',note:'Short decays all round: dry, clipped, quick.',set:{bd:{Decay:.3},sd:{Decay:.3,Tone:.4},lt:{Decay:.3},mt:{Decay:.3},ht:{Decay:.3},oh:{Decay:.3},cy:{Decay:.3},cr:{Decay:.3},rd:{Decay:.3},cp:{Decay:.3},cb:{Decay:.3}},fx:{reverbMix:.06}},
 {name:'Boom',category:'big',styles:['long kick'],colour:'#b07a4a',note:'A long, low kick and loose toms.',set:{bd:{Decay:.85,Tune:.3,Tone:.2},lt:{Decay:.7,Tune:.4},mt:{Decay:.7,Tune:.4},ht:{Decay:.7,Tune:.4},sd:{Tune:.4,Decay:.6}},fx:{reverbMix:.2}},
 {name:'Crisp',category:'dry',styles:['bright'],colour:'#e0a526',note:'Bright hats, snappy snare and a clicky kick.',set:{ch:{Tone:.85},oh:{Tone:.85},cy:{Tone:.8},cr:{Tone:.8},rd:{Tone:.8},sd:{Tone:.85,Tune:.6},bd:{Tone:.8}},fx:{reverbMix:.1}},
 {name:'Room',category:'big',styles:['ambience'],colour:'#5b8fd9',note:'The same kit in a big room.',set:{sd:{Decay:.65},cp:{Decay:.7}},fx:{reverbMix:.45,reverbDecay:2.2}},
 {name:'Pitched Down',category:'big',styles:['low', 'slow'],colour:'#9b7fd1',note:'Everything tuned low and long, for slower, heavier beats.',set:{bd:{Tune:.25,Decay:.6},sd:{Tune:.3,Decay:.6},lt:{Tune:.25},mt:{Tune:.25},ht:{Tune:.25},lc:{Tune:.3},mc:{Tune:.3},hc:{Tune:.3}},fx:{reverbMix:.3}},
 {name:'Deep',category:'big',styles:['long kick', 'ambience'],colour:'#c28b61',note:'The original full-level, long kick with classic ambience.',set:{},global:{kickBody:1},fx:{reverbMix:.25}},
];

export function drumPresets(kit,params){
 return SOUNDS.map(({name,category,styles,colour,note,set,fx,global})=>{
  const values={};
  for(const [track,fields] of Object.entries(kit.base??{}))for(const [f,v] of Object.entries(fields))values[track+f]=v;
  for(const [track,fields] of Object.entries(set))if(kit.tracks.some(t=>t[0]===track))for(const [f,v] of Object.entries(fields))values[track+f]=v;
  return {name,category,styles,colour,note,values:params.sanitize({...values,kickBody:0,...global,...fx})};
 });
}

export {BEATS,ARRANGEMENTS} from './beats';

/** A pattern is an array of (tracks + 1) rows of sixteen values: 0 off, 1 on, 2 flam; the last row is the accent row (0–3). */
export const emptyPattern=kit=>()=>Array.from({length:kit.tracks.length+1},()=>Array(16).fill(0));
export const validPattern=kit=>p=>Array.isArray(p)&&p.length===kit.tracks.length+1&&p.every((r,t)=>Array.isArray(r)&&r.length===16&&r.every(v=>Number.isInteger(v)&&v>=0&&v<=(t===kit.tracks.length?3:2)));
// Substitute only when the source instrument is absent, merging simultaneous hits.
// This keeps percussion and clap-led recipes useful on the smaller 606/909 kits.
const FALLBACK={cp:['sd'],rs:['sd'],cl:['rs','sd'],lc:['lt'],mc:['mt','lt'],hc:['ht'],mt:['ht'],cb:['rd','cy','ht'],ma:['ch'],cy:['cr'],cr:['cy'],rd:['cy','ch']};
export function beatPattern(kit,beat){
 const pattern=emptyPattern(kit)(),keys=kit.tracks.map(t=>t[0]);
 for(const [key,row] of Object.entries(beat.rows)){
  const target=key==='A'?kit.tracks.length:keys.indexOf(keys.includes(key)?key:FALLBACK[key]?.find(k=>keys.includes(k)));
  if(target<0)continue;
  [...row].forEach((c,s)=>{if(s<16){const v=key==='A'?(c==='x'?3:Number(c)||0):c==='f'?2:c==='x'?1:0;pattern[target][s]=Math.max(pattern[target][s],v);}});
 }
 return pattern;
}
/** A chain as song blocks: runs of the same pattern become one block with a repeat count (at most 8 each). */
export function chainToSong(chain){
 const song=[];
 for(const p of chain){const last=song[song.length-1];if(last&&last.p===p&&last.n<8)last.n++;else song.push({p,n:1});}
 return song;
}
export function arrangementBank(kit,recipe){
 return {song:chainToSong(recipe.chain),songOn:true,songLoop:true,patterns:Array.from({length:8},(_,i)=>recipe.stages[i]?beatPattern(kit,recipe.stages[i]):emptyPattern(kit)()),lengths:Array(8).fill(16),tempos:Array(8).fill(0),chain:[...recipe.chain],current:0,title:recipe.name,names:Array.from({length:8},(_,i)=>recipe.stages[i]?.name??'')};
}
/** Engine commands for one pattern; `silent(track)` leaves a muted (or not soloed) voice out of what the engine plays. */
export function patternCommands(kit,index,pattern,silent=()=>false){
 const cmds=[[7,index,0]];
 pattern.forEach((row,t)=>{if(t<kit.tracks.length&&silent(t))return;row.forEach((on,s)=>{if(on)cmds.push([1,index<<10|(t===kit.tracks.length?16:t)<<5|s,on]);});});
 return cmds;
}
