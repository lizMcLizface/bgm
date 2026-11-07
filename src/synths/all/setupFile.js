import {BROWSABLE_SCENES} from '../../app/scenes';
import {SYNTHS} from '../models';
import {SEQUENCERS,drumChoices,synthChoices} from './host';
import {MIXER_PROPERTY_COUNT} from './ChannelMixer';
import {METERS} from '../../app/meter';

export const FORMAT='calmbgm-all-setup',VERSION=1,MAX_BYTES=16*1024*1024;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const integer=(x,min,max)=>Number.isInteger(x)&&x>=min&&x<=max;
const unit=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
const between=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const fail=()=>{throw new Error('This setup file is damaged or contains unsupported settings.');};
const roles=SEQUENCERS.map(s=>s.role),stripIds=[...roles,'ambience','headroom'];
const numericTree=root=>{
 const pending=[[root,0]];
 while(pending.length){
  const [x,depth]=pending.pop();
  if(depth>100)return false;
  if(typeof x==='number'){if(!Number.isFinite(x))return false;}
  else if(Array.isArray(x)||object(x))for(const value of Object.values(x))pending.push([value,depth+1]);
  else if(x!==null&&typeof x!=='string'&&typeof x!=='boolean')return false;
 }
 return true;
};
const note=n=>object(n)&&['d','o','a'].every(k=>n[k]===undefined||integer(n[k],-256,256))&&
 (n.chordSource===undefined||(object(n.chordSource)&&typeof n.chordSource.group==='string'&&integer(n.chordSource.root,0,11)));
const chord=c=>object(c)&&integer(c.bar,0,100000)&&typeof c.name==='string'&&
 ['pitchClasses','scalePcs'].every(k=>c[k]===undefined||(Array.isArray(c[k])&&c[k].every(n=>integer(n,0,11))));
const step=(s,role)=>s===null||(object(s)&&
 (s.n===undefined||(role!=='perc'&&Array.isArray(s.n)&&s.n.every(note)))&&
 (s.hits===undefined||(role==='perc'&&Array.isArray(s.hits)&&s.hits.every(h=>object(h)&&integer(h.drum,0,31)&&Number.isFinite(h.velocity)&&Number.isFinite(h.duration))))&&
 (s.chord===undefined||object(s.chord))&&
 (s.len===undefined||integer(s.len,1,1000000))&&(s.vel===undefined||unit(s.vel)));

export function encodeSetup(state){
 const text=JSON.stringify({format:FORMAT,version:VERSION,...state});
 if(new TextEncoder().encode(text).length>MAX_BYTES)throw new Error('The setup is too large to save (maximum 16 MB).');
 return text;
}

export function decodeSetup(text){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)throw new Error('This setup file is too large (maximum 16 MB).');
 let data;
 try{data=JSON.parse(text);}catch{throw new Error('This file is not valid JSON.');}
 if(!object(data)||data.format!==FORMAT)throw new Error('This is not an all-page setup file.');
 if(data.version!==VERSION)throw new Error('This setup file version is not supported.');
 if(!numericTree(data)||!BROWSABLE_SCENES.some(s=>s.name===data.scene)||!object(data.settings)||!Object.hasOwn(METERS,data.settings.meter)||!Number.isFinite(data.settings.seed)||!object(data.project)||!object(data.sounds))fail();
 const p=data.project,steps=p.bars*p.stepsPerBar;
 if(!integer(p.bars,1,100000)||!integer(p.stepsPerBar,1,64)||steps>1000000||!object(p.key)||!integer(p.key.tonic,0,11)||!Array.isArray(p.key.scale)||!p.key.scale.length||!p.key.scale.every(n=>integer(n,0,11))||!Array.isArray(p.chords)||!p.chords.every(c=>chord(c)&&c.bar<p.bars)||!object(p.patterns))fail();
 if(p.meter!==undefined&&!Object.hasOwn(METERS,p.meter))fail();
 if(p.progressions!==undefined&&(!Array.isArray(p.progressions)||!p.progressions.length||p.progressions.some((x,i,a)=>!object(x)||!integer(x.startBar,0,p.bars-1)||!integer(x.bars,1,p.bars)||x.startBar+x.bars>p.bars||(x.chords!==undefined&&(!Array.isArray(x.chords)||!x.chords.every(c=>chord(c)&&c.bar<x.bars)))||(i===0?x.startBar!==0:x.startBar!==a[i-1].startBar+a[i-1].bars))||p.progressions.at(-1).startBar+p.progressions.at(-1).bars!==p.bars))fail();
 for(const [role,pattern] of Object.entries(p.patterns)){
  if(!roles.includes(role)||!object(pattern)||!Array.isArray(pattern.steps)||pattern.steps.length!==steps||pattern.length!==steps||!pattern.steps.every(s=>step(s,role))||
   (pattern.chords!==undefined&&(!Array.isArray(pattern.chords)||!pattern.chords.every(c=>object(c)&&integer(c.start,0,steps-1)&&integer(c.len,1,1000000)&&object(c.root)))))fail();
 }
 for(const role of roles){
  const entry=data.sounds[role],selection=entry?.selection;
  if(!object(entry)||!object(selection)||typeof selection.synth!=='string'||typeof selection.name!=='string'||!object(entry.rack))fail();
  if(role==='perc'){
   if(!drumChoices().some(c=>c.id===selection.synth)||!object(entry.kit)||!object(entry.mix)||!Array.isArray(entry.mix.muted)||!Array.isArray(entry.mix.solo)||![...entry.mix.muted,...entry.mix.solo].every(x=>integer(x,0,15)))fail();
  }else if(!synthChoices().some(c=>c.id===selection.synth))fail();
  if(entry.sound&&(!object(entry.sound)||!SYNTHS[entry.sound.synth]||!object(entry.sound.values)||!object(entry.sound.rack)||(entry.sound.level!==undefined&&!Number.isFinite(entry.sound.level))))fail();
  if(entry.native&&(!object(entry.native)||!['piano','iowa'].includes(entry.native.synth)||!object(entry.native.preset)))fail();
 }
 const ui=data.ui,m=data.desk,a=data.ambience;
 if(!object(ui)||!integer(ui.selected,0,roles.length-1)||!integer(ui.progression,0,(p.progressions?.length??1)-1)||!integer(ui.bpm,50,200)||![1,2,4,8,16].includes(ui.progressionCount)||!['pattern','song','bar','chord'].includes(ui.loop)||typeof ui.continuous!=='boolean'||!object(ui.mutes)||!object(ui.solos)||!roles.every(r=>(ui.mutes[r]===undefined||typeof ui.mutes[r]==='boolean')&&(ui.solos[r]===undefined||typeof ui.solos[r]==='boolean'))||!['replace','layer'].includes(ui.chordOverlap)||!object(ui.buffer)||![1,2,4,8,16,32,64].includes(ui.buffer.ahead)||![0,1,2,3,4,8,16,32,64,'infinite'].includes(ui.buffer.history)||!object(ui.panels)||typeof ui.panels.generator!=='boolean'||typeof ui.panels.ambience!=='boolean'||typeof ui.arrangement!=='boolean'||!['scale','octave'].includes(ui.view)||typeof ui.offScale!=='boolean'||!integer(ui.insertOctave,0,8)||(ui.pitch!==null&&!integer(ui.pitch,0,11))||!['1/4','1/8','1/16','1/32'].includes(ui.resolution)||!integer(ui.drumOffset,0,32))fail();
 if(ui.continuous&&(!object(data.stream)||!integer(data.stream.count,1,100000)||!Number.isFinite(data.stream.seed)||!object(data.stream.settings)||!Object.hasOwn(METERS,data.stream.settings.meter)||(data.stream.grooveVoices!==null&&!object(data.stream.grooveVoices))))fail();
 if(!object(m)||!object(m.strips)||!stripIds.includes(m.selected)||!integer(m.property,0,MIXER_PROPERTY_COUNT-1)||!object(m.master))fail();
 for(const id of stripIds){
  const s=m.strips[id];
  if(!object(s)||!['gain','hp','lp','hi','mid','lo','pan','vol','rev','revSize','dly','dlyTime','dlyFb'].every(k=>unit(s[k]))||!['hpOn','lpOn','mute','solo'].every(k=>typeof s[k]==='boolean'))fail();
 }
 if(!['vol','width','bal','ceil'].every(k=>unit(m.master[k]))||!['limit','mono','dim'].every(k=>typeof m.master[k]==='boolean'))fail();
 if(!object(a)||typeof a.run!=='boolean'||!integer(a.selected,0,5)||!unit(a.overall)||!object(a.sources)||!['rain','thunder','wind','waves','fire','vinyl'].every(id=>object(a.sources[id])&&['level','distance','pan','width'].every(k=>unit(a.sources[id][k]))))fail();
 if(!object(data.tuning)||!Array.isArray(data.tuning.cents)||data.tuning.cents.length!==12||!data.tuning.cents.every(n=>between(n,-100,100))||!integer(data.tuning.tonic,0,11)||!between(data.tuning.octave,1.5,2.5)||!between(data.tuning.a4,400,480)||!between(data.tuning.shift,-100,100)||![0,1].includes(data.tuning.auto))fail();
 return data;
}

export const setupFileName=scene=>`${scene.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'setup'}.calmbgm-setup.json`;
