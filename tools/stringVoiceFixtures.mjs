import fs from'node:fs';
import{measuredStringPreparationSpec}from'../src/modular-audio/ownedStringPreparation.js';
import{stringVoiceSpec}from'../src/modular-audio/stringVoiceConfig.js';
export function stringVoiceFixture(patch,rate,profile){const raw=JSON.parse(fs.readFileSync(`src/library/stringTables/${patch==='live'?'celloLive':'celloLong'}.json`)),at=seconds=>Math.round(seconds*rate/128)*128,on=(frame,id,bank,phase=id%8)=>({frame,kind:'on',id,bank,lfo:phase/8*(2*Math.PI)}),off=(frame,id)=>({frame,kind:'off',id});let tuning={wakeDb:-40},notes,events,seconds;
 if(profile==='duet'){notes=[[48,40],[60,80],[74.25,127]];events=[on(0,1,1),on(at(.125),2,2),on(at(.375),3,3),off(at(.75),1),off(at(1),2),off(at(1.25),3)];seconds=3;}
 else if(profile==='pad'){tuning={...tuning,rtAttack:1.1,rtOpen:1.8,rtHiss:0,rtNoise:-44,rtRelease:3.5,vibrato:1};notes=[[36,63],[48.5,80],[67,100]];events=[on(0,1,1),on(at(.25),2,2),on(at(.5),3,3),off(at(1),1),off(at(1.25),2),off(at(1.5),3)];seconds=6.5;}
 else if(profile==='steal'){tuning={...tuning,rtRelease:.5,rtNoise:-24,rtHiss:1.2,vibrato:2,rtOpen:.05,rtAttack:.01};notes=[[36,40],[48,80],[60,100],[74,127]];events=[...Array.from({length:28},(_,i)=>on(0,i+1,i%4+1)),on(128,28,4),on(256,29,1),on(384,30,2),...Array.from({length:24},(_,i)=>off(6144,i+7)),{frame:8192,kind:'panic'},on(8448,31,4),off(8576,31)];seconds=2;}
 else throw Error('Unknown measured-string fixture profile');
 const preparation=measuredStringPreparationSpec(raw,rate,tuning,notes.map(([midi,velocity],i)=>({id:i+1,midi,velocity}))),spec=stringVoiceSpec(preparation,events);return{patch,rate,profile,spec,frames:Math.ceil(rate*seconds)};}
