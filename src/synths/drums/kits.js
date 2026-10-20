// The three drum machines: track lists (the order is the kernel's track order, see
// synth-engine/classics/src/drums.rs), parameter tables, factory sounds and starter beats.
import {defineParams,SPACE} from '../params';
import {MODELS} from '../engine/offline';

// [key, short name, long name]
const TRACKS_808=[['bd','BD','Bass drum'],['sd','SD','Snare drum'],['lt','LT','Low tom'],['mt','MT','Mid tom'],['ht','HT','High tom'],['lc','LC','Low conga'],['mc','MC','Mid conga'],['hc','HC','High conga'],['rs','RS','Rim shot'],['cl','CL','Claves'],['cp','CP','Hand clap'],['ma','MA','Maracas'],['cb','CB','Cowbell'],['cy','CY','Cymbal'],['oh','OH','Open hat'],['ch','CH','Closed hat']];
const TRACKS_909=[['bd','BD','Bass drum'],['sd','SD','Snare drum'],['lt','LT','Low tom'],['mt','MT','Mid tom'],['ht','HT','High tom'],['rs','RS','Rim shot'],['cp','CP','Hand clap'],['ch','CH','Closed hat'],['oh','OH','Open hat'],['cr','CR','Crash'],['rd','RD','Ride']];
const TRACKS_606=[['bd','BD','Bass drum'],['sd','SD','Snare drum'],['lt','LT','Low tom'],['ht','HT','High tom'],['ch','CH','Closed hat'],['oh','OH','Open hat'],['cy','CY','Cymbal']];

export const KITS={
 tr808:{id:'tr808',name:'TR-808',subtitle:'inspired analog drum machine',model:MODELS.tr808,tracks:TRACKS_808,tone:{bd:'Click',sd:'Snappy',cp:'Filter',ch:'Tone',oh:'Tone',cy:'Tone',cb:'Tone',lc:'Tone',mc:'Tone',hc:'Tone',ma:'Tone'}},
 tr909:{id:'tr909',name:'TR-909',subtitle:'inspired drum machine',model:MODELS.tr909,tracks:TRACKS_909,tone:{bd:'Attack',sd:'Snappy',cp:'Filter',ch:'Tone',oh:'Tone',cr:'Tone',rd:'Tone'}},
 tr606:{id:'tr606',name:'TR-606',subtitle:'inspired drumatix',model:MODELS.tr606,tracks:TRACKS_606,tone:{bd:'Click',sd:'Snappy',ch:'Tone',oh:'Tone',cy:'Tone'}},
};

const FIELDS=[['Level',0,'%','lin',0,1,.8],['Tune',1,'%','lin',0,1,.5],['Decay',2,'%','lin',0,1,.5],['Tone',3,'%','lin',0,1,.5],['Pan',4,'bi','lin',-1,1,0]];

export function drumParams(kit){
 const rows=[];
 kit.tracks.forEach(([key],t)=>{
  for(const [name,offset,unit,curve,min,max,value] of FIELDS)rows.push([key+name,t*8+offset,kit.tone[key]&&name==='Tone'?kit.tone[key]:name,min,max,value,unit,curve]);
 });
 rows.push(['master',128,'Master',0,1,.8,'%','lin'],['accent',129,'Accent',0,1,.5,'%','lin'],['tempo',130,'Tempo',40,220,120,'bpm','lin'],['swing',131,'Swing',.5,.75,.5,'swing','lin'],['flam',132,'Flam',0,1,.5,'%','lin'],['voices',135,'Voices',1,16,16,'n','lin']);
 rows.push(...SPACE);
 return defineParams(rows);
}

// Sounds are overrides on the defaults: {track: {field: value}}.
const SOUNDS=[
 {name:'Classic',colour:'#d96a3a',note:'Every knob at its centre: the reference kit.',set:{}},
 {name:'Tight',colour:'#7fd0c8',note:'Short decays all round: dry, clipped, quick.',set:{bd:{Decay:.3},sd:{Decay:.3,Tone:.4},lt:{Decay:.3},mt:{Decay:.3},ht:{Decay:.3},oh:{Decay:.3},cy:{Decay:.3},cr:{Decay:.3},rd:{Decay:.3},cp:{Decay:.3},cb:{Decay:.3}},fx:{reverbMix:.06}},
 {name:'Boom',colour:'#b07a4a',note:'A long, low kick and loose toms.',set:{bd:{Decay:.85,Tune:.3,Tone:.2},lt:{Decay:.7,Tune:.4},mt:{Decay:.7,Tune:.4},ht:{Decay:.7,Tune:.4},sd:{Tune:.4,Decay:.6}},fx:{reverbMix:.2}},
 {name:'Crisp',colour:'#e0a526',note:'Bright hats, snappy snare and a clicky kick.',set:{ch:{Tone:.85},oh:{Tone:.85},cy:{Tone:.8},cr:{Tone:.8},rd:{Tone:.8},sd:{Tone:.85,Tune:.6},bd:{Tone:.8}},fx:{reverbMix:.1}},
 {name:'Room',colour:'#5b8fd9',note:'The same kit in a big room.',set:{sd:{Decay:.65},cp:{Decay:.7}},fx:{reverbMix:.45,reverbDecay:2.2}},
 {name:'Pitched Down',colour:'#9b7fd1',note:'Everything tuned low and long, for slower, heavier beats.',set:{bd:{Tune:.25,Decay:.6},sd:{Tune:.3,Decay:.6},lt:{Tune:.25},mt:{Tune:.25},ht:{Tune:.25},lc:{Tune:.3},mc:{Tune:.3},hc:{Tune:.3}},fx:{reverbMix:.3}},
];

export function drumPresets(kit,params){
 return SOUNDS.map(({name,colour,note,set,fx})=>{
  const values={};
  for(const [track,fields] of Object.entries(set))if(kit.tracks.some(t=>t[0]===track))for(const [f,v] of Object.entries(fields))values[track+f]=v;
  return {name,colour,note,values:params.sanitize({...values,...fx})};
 });
}

// Starter beats: one string of sixteen steps per track ("x" on, "." off); "A" is the accent row.
export const BEATS=[
 {name:'Four on the floor',rows:{bd:'x...x...x...x...',cp:'....x.......x...',ch:'..x...x...x...x.',oh:'......x.......x.',A:'x.......x.......'}},
 {name:'Boom bap',rows:{bd:'x.....x...x.....',sd:'....x.......x...',ch:'x.x.x.x.x.x.x.x.',oh:'..............x.',A:'....x.......x...'}},
 {name:'Electro',rows:{bd:'x.....x..x..x...',sd:'....x.......x...',cp:'....x.......x..x',ch:'x.xxx.xxx.xxx.xx',cb:'..x.....x....x..',A:'x...x...x...x...'}},
 {name:'Techno',rows:{bd:'x...x...x...x...',cp:'....x.......x...',ch:'xxxxxxxxxxxxxxxx',oh:'..x...x...x...x.',rs:'.x..x..x.x..x...',A:'..x...x...x...x.'}},
 {name:'Clave',rows:{bd:'x.....x...x.....',cl:'x..x..x...x.x...',mc:'..x...x...x...x.',hc:'.x.....x..x.....',lc:'x...x...x...x...',cb:'x.......x.......',ma:'x.x.x.x.x.x.x.x.'}},
 {name:'Slow house',rows:{bd:'x.......x.....x.',sd:'............x...',cp:'....x.......x...',ch:'x.x.x.x.x.x.x.x.',rd:'..x...x...x...x.',cr:'x...............',A:'x.......x.......'}},
];

/** A pattern is an array of (tracks + 1) rows of sixteen values: 0 off, 1 on, 2 flam; the last row is the accent row (0–3). */
export const emptyPattern=kit=>()=>Array.from({length:kit.tracks.length+1},()=>Array(16).fill(0));
export const validPattern=kit=>p=>Array.isArray(p)&&p.length===kit.tracks.length+1&&p.every(r=>Array.isArray(r)&&r.length===16);
export function beatPattern(kit,beat){
 const pattern=emptyPattern(kit)();
 kit.tracks.forEach(([key],t)=>{const row=beat.rows[key];if(row)pattern[t]=[...row].map(c=>c==='x'?1:0);});
 if(beat.rows.A)pattern[kit.tracks.length]=[...beat.rows.A].map(c=>c==='x'?1:0);
 return pattern;
}
/** Engine commands for one pattern. */
export function patternCommands(kit,index,pattern){
 const cmds=[[7,index,0]];
 pattern.forEach((row,t)=>row.forEach((on,s)=>{if(on)cmds.push([1,index<<10|(t===kit.tracks.length?16:t)<<5|s,on]);}));
 return cmds;
}
