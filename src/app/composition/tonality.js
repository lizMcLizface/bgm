import {seeded} from '../random';
import {TONIC_NAMES,scaleById} from '../theory';
const pc=x=>((x%12)+12)%12,name=x=>TONIC_NAMES[pc(x)].split('/')[0];
/** A chromatic row, not a diatonic scale: transposition, inversion and retrograde preserve all twelve classes. */
export function atonalRow(seed,transpose=0){
 const rng=seeded(seed^0x6a09e667),row=[0,1,6,11,4,5,10,3,2,8,9,7],shift=Math.floor(rng()*12),sign=rng()<.5?-1:1;
 if(rng()<.5)row.reverse();return row.map(n=>pc(transpose+shift+sign*n));
}
export function atonalChord({seed,tonic=0,slot=0,size=4,colour='plain'}){
 const row=atonalRow(seed,tonic),start=pc(slot*3),root=row[start],pcs=Array.from({length:size},(_,i)=>row[(start+i)%12]);
 if(colour==='flat2')pcs.push(pc(root+1));
 if(colour==='major7'){if(pcs.length>=4)pcs[3]=pc(root+11);else pcs.push(pc(root+11));}
 const pitchClasses=[...new Set(pcs)].sort((a,b)=>pc(a-root)-pc(b-root));return {root:name(root),name:'Set {'+pitchClasses.map(name).join(' · ')+'}',numeral:'set '+(slot%4+1),pitchClasses,
 scalePcs:Array.from({length:12},(_,i)=>i),keyName:'Atonal pitch sets',tonality:{mode:'atonal',row,slot},
 provenance:{tonality:'atonal',colour,borrowed:false,baseMode:'chromatic',harmonicMode:'chromatic',sourceMode:'chromatic'}};
}
export function describeBitonality(chord,music,separation){
 const second=pc(music.tonic+separation),quality=scaleById(music.mode).name;
 return {...chord,tonality:{mode:'bitonal',separation,backing:name(music.tonic)+' '+quality,melody:name(second)+' '+quality},
 keyName:name(music.tonic)+' / '+name(second)+' '+quality};
}
/** Arrangement memory stays in its own reference key; only the sounded foreground is transposed.
 * Run before expression/connection planning, so trajectories use the actual sounding notes. */
export function applyBitonality(events,tonality){
 if(tonality?.mode!=='bitonal')return events;
 for(const note of events)if(note.role==='lead'||note.role==='counter')note.midi+=tonality.separation;
 return events;
}
