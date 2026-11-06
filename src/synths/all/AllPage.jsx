import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BROWSABLE_SCENES,SCENE_CATEGORIES,sceneSettings} from '../../app/scenes';
import {TONIC_NAMES} from '../../app/theory';
import {createScheduler} from '../../seq/scheduler';
import {projectStepEvents} from '../../seq/notes';
import {gridResolutions,editPitch,editDrum} from './gridTiming';
import {chordSpan,chordBoundaries,rootDegree,transposeChord,resizeChord} from './chordEditing';
import {repeatRange,repeatNoteEvents} from './repeat';
import {followPlayback} from './followPlayback';
import {COLOURS as CHORD_COLOURS,COMPLEXITIES,DIRECTIONS,HOLDS,RATES,ROOTS,deleteItems,generatedChords,insertChord,itemsAt,materializeGeneratedChord,newPlacedChord,nextChordId,placedChordEvents,placedChordTones} from './placedChords';
import SeqScreen from '../seq/SeqScreen';
import ProgressionGrid,{pitchClasses} from './ProgressionGrid';
import ArrangementGrid from './ArrangementGrid';
import {movePlayhead} from '../seq/playhead';
import {createHost,SEQUENCERS,synthChoices,patchesOf} from './host';
import {load} from '../storage';
import {useSaved} from '../useSaved';
import {noteName} from '../../labs/Piano';
import {degreeToMidi,midiToDegree} from '../../seq/harmony';
import {heldSteps} from '../../seq/notes';
import '../drums/drums.css';
import './all.css';

// /synths/all: the sequencers and the sound generators (docs/SEQUENCER_SYSTEM_PLAN.md). The song comes from the front page's own generator (a scene's settings, its progression,
// voicings and lines), captured as patterns the sequencers hold; the sound generators are the generator's role instruments, loaded as presets (the scene's voices, or a patch of
// any classic or DIY synth). The sequencers play and edit the patterns on those instruments.
const ROWS=8;
const COLOURS={lead:'#f2a33a',counter:'#e07a5f',rhythm:'#c98bdb',pad:'#5fc1c9',bass:'#7bd389',perc:'#e0a526'};
const PROGRESSION_CHOICES=[1,2,4,8,16];
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
// where the player left off: the scene, the song (every sequencer's pattern), the tempo, which sequencer was open, the mutes and the sound generators
const STORE='synths:all:state';
const readStored=()=>{
 const s=load(STORE,null);
 if(!s||typeof s!=='object')return {};
 const p=s.project;
 const project=p&&Number.isFinite(p.bars)&&Number.isFinite(p.stepsPerBar)&&p.key&&p.patterns&&typeof p.patterns==='object'?p:null;
 return {scene:typeof s.scene==='string'?s.scene:null,progressionCount:PROGRESSION_CHOICES.includes(s.progressionCount)?s.progressionCount:null,bpm:Number.isFinite(s.bpm)?clamp(Math.round(s.bpm),50,200):null,
  selected:Number.isInteger(s.selected)&&s.selected>=0&&s.selected<SEQUENCERS.length?s.selected:null,mutes:s.mutes&&typeof s.mutes==='object'?s.mutes:null,solos:s.solos&&typeof s.solos==='object'?s.solos:null,
  sounds:s.sounds&&typeof s.sounds==='object'?s.sounds:null,chordOverlap:s.chordOverlap==='layer'?'layer':'replace',project};
};

const SYNTHS_BY_ID=id=>synthChoices().some(c=>c.id===id);

export default function AllPage(){
 const sceneList=BROWSABLE_SCENES;
 const [stored]=useState(readStored);
 const [sceneName,setSceneName]=useState(()=>sceneList.find(s=>s.name===stored.scene)?.name??sceneList.find(s=>/lofi|rain/i.test(s.name))?.name??sceneList[0].name);
 const scene=useMemo(()=>sceneList.find(s=>s.name===sceneName)??sceneList[0],[sceneName,sceneList]);
 const [status,setStatus]=useState('Preparing song…'),[started,setStarted]=useState(false),[busy,setBusy]=useState(false),[hostVersion,setHostVersion]=useState(0);
 const [progressionCount,setProgressionCount]=useState(stored.progressionCount??4),[project,setProject]=useState(null),[playing,setPlaying]=useState(false);
 const [selected,setSelected]=useState(stored.selected??3);          // the sequencer being edited (an index of SEQUENCERS)
 const [sounds,setSounds]=useState({}),[mutes,setMutes]=useState(stored.mutes??{});
 const [solos,setSolos]=useState(stored.solos??{}),[progression,setProgression]=useState(0),[arrangement,setArrangement]=useState(false),[arrOffset,setArrOffset]=useState(0),[rowAction,setRowAction]=useState(null),[loop,setLoop]=useState('pattern'),[paused,setPaused]=useState(false);
 const [col,setCol]=useState(0),[bpm,setBpm]=useState(stored.bpm??90);
 const [view,setView]=useState('scale'),[offScale,setOffScale]=useState(false),[insertOctave,setInsertOctave]=useState(4),[pitch,setPitch]=useState(null),[screenPage,setScreenPage]=useState('seq'),[drumOffset,setDrumOffset]=useState(0);
 const [resolution,setResolution]=useState('1/16');
 const [shiftHeld,setShiftHeld]=useState(false),[octaveFilter,setOctaveFilter]=useState(null);
 const [chordMode,setChordMode]=useState(false),[deleteMode,setDeleteMode]=useState(false),[chordOverlap,setChordOverlap]=useState(stored.chordOverlap??'replace'),[placedId,setPlacedId]=useState(null),[deleteStack,setDeleteStack]=useState(null);
 const [editMode,setEditMode]=useState(false),[copyMode,setCopyMode]=useState(false),[editSelection,setEditSelection]=useState([]),[copySource,setCopySource]=useState(null);
 const shiftPointer=useRef(null),keyboardShift=useRef(false);
 const [focusChord,setFocusChord]=useState(null);
 const booked=useRef({}),host=useRef(null),scheduler=useRef(null),head=useRef(null),timers=useRef(new Set()),projectRef=useRef(null),bpmRef=useRef(90),mutesRef=useRef({}),solosRef=useRef({}),progressionRef=useRef(0),restoreSounds=useRef(null);
 const repeatRef=useRef(null),playheadRef=useRef(0);
 const gridSizeRef=useRef(1),playingRef=useRef(false);
 const temporaryChord=useRef(false),releaseChord=useRef(()=>{});
 projectRef.current=project;bpmRef.current=bpm;mutesRef.current=mutes;solosRef.current=solos;progressionRef.current=progression;

 const seqInfo=SEQUENCERS[selected],role=seqInfo.role;
 const pattern=project?.patterns[role];
 useEffect(()=>{
  const release=()=>{shiftPointer.current=null;keyboardShift.current=false;setShiftHeld(false);setOctaveFilter(null);releaseChord.current();};
  const down=e=>{if(e.key==='Shift'){keyboardShift.current=true;setShiftHeld(true);}};
  const up=e=>{if(e.key==='Shift'){keyboardShift.current=false;if(shiftPointer.current===null){setShiftHeld(false);setOctaveFilter(null);releaseChord.current();}}};
  const pointerUp=e=>{if(shiftPointer.current===e.pointerId){shiftPointer.current=null;if(!keyboardShift.current){setShiftHeld(false);setOctaveFilter(null);releaseChord.current();}}};
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerUp);window.addEventListener('blur',release);
  return ()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',pointerUp);window.removeEventListener('blur',release);};
 },[]);

 useEffect(()=>{
  try{
   const h=createHost(scene);
   host.current=h;
   h.applySceneVoices(scene);
   const back=stored.project&&stored.scene===scene.name?stored.project:null;
   const song=back?{...back,meter:back.meter??sceneSettings(scene).meter}:h.capture({progressions:progressionCount});
   setProject(song);setBpm(back&&stored.bpm?stored.bpm:Math.round(song.bpm));
   setSounds(Object.fromEntries(SEQUENCERS.filter(s=>s.role!=='perc').map(s=>{
    const saved=back&&stored.sounds?.[s.role];
    return [s.role,saved&&SYNTHS_BY_ID(saved.synth)?saved:{synth:'calmbgm',name:h.loaded[s.role]?.name??''}];
   })));
   restoreSounds.current=back?stored.sounds:null;
   setStatus(back?`${scene.name} · back where you left off`:`${scene.name} · ${progressionsOf(song).length} progressions`);setStarted(true);setHostVersion(v=>v+1);
  }catch(error){console.error(error);setStatus(error.message);}
  return ()=>{host.current?.dispose();host.current=null;};
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 // a new song: the generator plans another one for the same settings (new seed) and the sequencers take it
 function newSong(extra={}){
  const h=host.current;if(!h)return;
  stop();
  const seed=extra.seed??Math.floor(Math.random()*2**31),n=extra.progressions??progressionCount;
  const song=h.capture({progressions:n,seed});
  setPlacedId(null);setDeleteStack(null);
  setProject(song);setBpm(Math.round(song.bpm));setCol(0);setProgression(0);setArrOffset(0);setFocusChord(null);setScreenPage('seq');playheadRef.current=0;repeatRef.current=null;
  setStatus(`${scene.name} · seed ${seed} · ${song.chords.map(c=>c.name).slice(0,6).join(' ')}…`);
 }
 function chooseScene(name){
  setSceneName(name);
  setPlacedId(null);setDeleteStack(null);
  setFocusChord(null);setScreenPage('seq');playheadRef.current=0;repeatRef.current=null;
  if(!host.current)return;
  stop();
  const next=sceneList.find(s=>s.name===name);
  host.current.dispose();
  try{
   const h=createHost(next);host.current=h;h.applySceneVoices(next);
   const song=h.capture({progressions:progressionCount});setProject(song);setBpm(Math.round(song.bpm));setProgression(0);setArrOffset(0);setCol(0);setSounds(Object.fromEntries(SEQUENCERS.filter(s=>s.role!=='perc').map(s=>[s.role,{synth:'calmbgm',name:h.loaded[s.role]?.name??''}])));restoreSounds.current=null;setStatus(`${next.name}`);setHostVersion(v=>v+1);
  }catch(error){console.error(error);setStatus(error.message);}
 }
 async function chooseSound(r,synth,name){
  const h=host.current;if(!h)return;
  if(restoreSounds.current){const next={...restoreSounds.current};delete next[r];restoreSounds.current=next;}
  setSounds(s=>({...s,[r]:{synth,name:name??s[r]?.name??''}}));
  setBusy(true);setStatus(`Loading ${synth} for ${r}…`);
  try{const got=await h.setSound(r,{synth,name});setSounds(s=>({...s,[r]:{synth,name:got.name}}));setStatus(`${r}: ${synth==='calmbgm'?'calmbgm':synth} · ${got.name}`);}catch(error){console.error(error);setStatus(error.message);}finally{setBusy(false);}
 }

 useSaved(STORE,{scene:sceneName,progressionCount,bpm,selected,mutes,solos,sounds,chordOverlap,project},{skip:()=>!project});

 // playback: the sequencer core books every sequencer's notes on the audio clock, and they sound on the generator's role instruments
 useEffect(()=>{
  if(!started)return undefined;
  const h=host.current;
  const bank=()=>{const p=projectRef.current,parts=repeatRef.current?[repeatRef.current]:progressionsOf(p);return {patterns:parts,lengths:parts.map(x=>x.bars*p.stepsPerBar),tempos:[],chain:parts.map((_,i)=>i),current:repeatRef.current?0:Math.min(progressionRef.current,parts.length-1)};};
  const sched=createScheduler({
   now:()=>h.context.currentTime,
   bank,
   pattern:(part)=>({start:part.startBar*projectRef.current.stepsPerBar,key:projectRef.current.key,leader:-1,sequencers:SEQUENCERS.map(s=>({pattern:s.role==='perc'?null:projectRef.current.patterns[s.role],mute:mutesRef.current[s.role]||(Object.values(solosRef.current).some(Boolean)&&!solosRef.current[s.role])})),drums:projectRef.current.patterns.perc}),
   events:(p,step,c)=>{
    const absolute=step+p.start,drumIndex=SEQUENCERS.findIndex(s=>s.role==='perc');
    const hits=p.sequencers[drumIndex]&&!p.sequencers[drumIndex].mute?(p.drums?.steps[absolute]?.hits??[]):[];
    const notes=repeatRef.current?repeatNoteEvents(p,step,c,repeatRef.current.bars*projectRef.current.stepsPerBar):[
     ...projectStepEvents(p,absolute,c),
     ...p.sequencers.flatMap(({pattern,mute},track)=>mute||!pattern?[]:placedChordEvents(pattern,absolute,{...c,key:p.key,track})),
    ];
    return [...notes,...hits.map(hit=>({track:drumIndex,hit,time:c.time,stepSec:c.stepSec}))];
   },
   tempo:()=>bpmRef.current,swing:()=>0.5,flam:()=>0.5,
   emit:events=>events.forEach(e=>{const r=SEQUENCERS[e.track].role;if(r==='perc')h.drum(e.hit,e.time,e.stepSec);else h.note(r,e.note,e.time,e.duration,e.velocity);booked.current[r]=(booked.current[r]||0)+1;}),
   onStep:({pattern:part,step,time})=>{
    const wait=Math.max(0,(time-h.context.currentTime+(h.g.AC.outputLatency||0))*1000);
    const absolute=bank().patterns[part].startBar*projectRef.current.stepsPerBar+step;
    const id=setTimeout(()=>{
     timers.current.delete(id);playheadRef.current=absolute;
     const project=projectRef.current,parts=progressionsOf(project),index=parts.findIndex(p=>absolute>=p.startBar*project.stepsPerBar&&absolute<(p.startBar+p.bars)*project.stepsPerBar);
     if(index>=0){
      if(index!==progressionRef.current){progressionRef.current=index;setProgression(index);setFocusChord(null);setScreenPage('seq');}
      setCol(previous=>followPlayback(previous,absolute,parts[index],project.stepsPerBar,gridSizeRef.current));
     }
     movePlayhead(head.current,{running:true,step:absolute});
    },wait);
    timers.current.add(id);
   },
  });
  scheduler.current=sched;
  return ()=>{sched.stop();scheduler.current=null;timers.current.forEach(clearTimeout);timers.current.clear();};
 },[started,hostVersion]);// eslint-disable-line react-hooks/exhaustive-deps
 const stop=()=>{
  const s=scheduler.current;if(!s)return;
  temporaryChord.current=false;
  s.stop();timers.current.forEach(clearTimeout);timers.current.clear();playingRef.current=false;movePlayhead(head.current,{running:false,step:0});Object.values(host.current.g.roles).forEach(r=>r.instrument?.silence?.());setPlaying(false);setPaused(false);
 };
 const play=async(mode=loop)=>{
  const s=scheduler.current;if(!s||playing)return;
  const h=host.current;setBusy(true);
  try{
   await h.wake();
   if(restoreSounds.current){
    const saved=restoreSounds.current;
    for(const entry of SEQUENCERS){
     const want=saved[entry.role];
     if(!want||want.synth==='calmbgm'||!SYNTHS_BY_ID(want.synth))continue;
     const got=await h.setSound(entry.role,{synth:want.synth,name:want.name});
     setSounds(x=>({...x,[entry.role]:{synth:want.synth,name:got.name}}));
    }
    restoreSounds.current=null;
   }
   if(paused)s.resume(0.08);else {
    repeatRef.current=mode==='bar'||mode==='chord'?repeatRange(projectRef.current,playheadRef.current,mode):null;
    s.start(0.08,mode==='song'?'song':'pattern');
   }
   playingRef.current=true;setPlaying(true);setPaused(false);
  }catch(error){console.error(error);setStatus(error.message);}finally{setBusy(false);}
 };
 const pause=()=>{if(!playing)return;scheduler.current?.pause();timers.current.forEach(clearTimeout);timers.current.clear();playingRef.current=false;setPlaying(false);setPaused(true);};
 const chooseProgression=i=>{setProgression(i);setCol(progressionsOf(project)[i].startBar*project.stepsPerBar);if(!playing){playheadRef.current=progressionsOf(project)[i].startBar*project.stepsPerBar;repeatRef.current=null;}setFocusChord(null);setScreenPage('seq');};
 const changeRepeat=()=>{
  const modes=['pattern','song','bar','chord'],next=modes[(modes.indexOf(loop)+1)%modes.length];
  try{
   if(!temporaryChord.current&&(playingRef.current||paused))continueAtNextStep(next);
   else if(!temporaryChord.current)repeatRef.current=null;
   setLoop(next);
  }catch(error){console.error(error);setStatus(error.message);}
 };
 const restartAt=(mode,step)=>{
  const s=scheduler.current,p=projectRef.current,parts=progressionsOf(p);
  const index=parts.findIndex(part=>step>=part.startBar*p.stepsPerBar&&step<(part.startBar+part.bars)*p.stepsPerBar);
  if(index<0)throw new Error('Playhead is outside the song');
  s.stop();timers.current.forEach(clearTimeout);timers.current.clear();Object.values(host.current.g.roles).forEach(r=>r.instrument?.silence?.());
  progressionRef.current=index;setProgression(index);playheadRef.current=step;
  repeatRef.current=mode==='bar'||mode==='chord'?repeatRange(p,step,mode):null;
  const start=repeatRef.current?repeatRef.current.startBar*p.stepsPerBar:parts[index].startBar*p.stepsPerBar;
  s.start(.08,mode==='song'?'song':'pattern',{pattern:repeatRef.current?0:index,step:step-start});
 };
 const jumpChord=bar=>{
  if(!playingRef.current)return;
  try{
   const step=Math.max(bar,part.startBar)*project.stepsPerBar;
   restartAt('chord',step);temporaryChord.current=true;
  }catch(error){console.error(error);setStatus(error.message);}
 };
 const continueAtNextStep=mode=>{
  const s=scheduler.current,p=projectRef.current,previous=repeatRef.current;
  try{
   const parts=progressionsOf(p),index=parts.findIndex(part=>playheadRef.current>=part.startBar*p.stepsPerBar&&playheadRef.current<(part.startBar+part.bars)*p.stepsPerBar);
   if(index<0)throw new Error('Playhead is outside the song');
   const position=s.position,source=previous??parts[position.pattern];
   if(!source)throw new Error('Scheduler position is outside the song');
   const next=source.startBar*p.stepsPerBar+(s.scope==='pattern'&&position.wrapped?source.bars*p.stepsPerBar:position.step);
   const range=mode==='bar'||mode==='chord'?repeatRange(p,playheadRef.current,mode):null;
   const target=range??(mode==='song'?null:parts[index]);
   const absolute=target?target.startBar*p.stepsPerBar+((next-target.startBar*p.stepsPerBar)%(target.bars*p.stepsPerBar)+target.bars*p.stepsPerBar)%(target.bars*p.stepsPerBar):next%(p.bars*p.stepsPerBar);
   const targetIndex=range?0:parts.findIndex(part=>absolute>=part.startBar*p.stepsPerBar&&absolute<(part.startBar+part.bars)*p.stepsPerBar);
   if(targetIndex<0)throw new Error('Next step is outside the song');
   const start=(range??parts[targetIndex]).startBar*p.stepsPerBar;
   repeatRef.current=range;
   s.reposition({pattern:targetIndex,step:absolute-start},mode==='song'?'song':'pattern');
  }catch(error){repeatRef.current=previous;throw error;}
 };
 releaseChord.current=()=>{
  if(!temporaryChord.current)return;
  if(!playingRef.current&&!paused){temporaryChord.current=false;return;}
  try{continueAtNextStep(loop);temporaryChord.current=false;}catch(error){console.error(error);setStatus(error.message);}
 };

 const key=project?.key;
 function edit(roleName,fn){setProject(p=>p&&{...p,patterns:{...p.patterns,[roleName]:fn(p.patterns[roleName]??{mode:'note',follow:'scale',length:p.bars*p.stepsPerBar,steps:Array(p.bars*p.stepsPerBar).fill(null)})}});}
 const resolutions=gridResolutions(project?.meter),foundResolution=resolutions.findIndex(r=>r.label===resolution),resolutionIndex=foundResolution<0?resolutions.length-1:foundResolution,gridSize=resolutions[resolutionIndex].steps;
 gridSizeRef.current=gridSize;
 useEffect(()=>{if(playingRef.current)movePlayhead(head.current,{running:true,step:playheadRef.current});},[col,gridSize,progression,arrangement]);
 const part=project?progressionsOf(project)[progression]:null;
 const selectedSpan=project&&part&&focusChord!==null?chordSpan(project,part,focusChord):null;
 const selectedChord=selectedSpan?project.chords[selectedSpan.index]:null;
 const degree=selectedChord?rootDegree(key,selectedChord):-1;
 const boundaries=selectedSpan?chordBoundaries(project,part,focusChord):null;
 const startMin=boundaries?part.startBar+boundaries.selected:0,startMax=selectedSpan?selectedSpan.end-1:0;
 const endMin=selectedSpan?selectedSpan.start+1:0,endMax=boundaries?boundaries.limit-(boundaries.entries.length-boundaries.selected-1):0;
 const changeChord=(fn)=>{
  try{
   const next=fn(project);
   for(const pattern of Object.values(next.patterns))for(const chord of pattern?.chords??[])placedChordTones(next.key,chord);
   if(playing||paused)stop();
   setProject(next);return true;
  }catch(error){console.error(error);setStatus(error.message);return false;}
 };
 const selectChord=bar=>{setPlacedId(null);setEditSelection([]);setDeleteStack(null);setFocusChord(bar);setScreenPage(bar===null?'seq':'timeline');};
 useEffect(()=>{setPlacedId(null);setEditSelection([]);setCopySource(null);setDeleteStack(null);setScreenPage('seq');},[selected,progression]);
 const placedChord=pattern?.chords?.find(c=>c.id===placedId)??generatedChords(pattern,key).find(c=>c.id===placedId);
 const setPlacedOption=(name,value)=>{
  try{
   const next={...placedChord,[name]:value};
   const count=placedChordTones(key,{...next,rootVoicing:'on',inversion:0}).length;
   next.inversion=Math.min(next.inversion??0,count-1);
   placedChordTones(key,next);
   if(placedChord.sourceGroup){
    const converted=materializeGeneratedChord(pattern,key,next);
    setProject(p=>({...p,patterns:{...p.patterns,[role]:converted.pattern}}));
    setPlacedId(converted.id);
    setEditSelection(selection=>selection.map(item=>item.id===placedId?{...item,type:'chord',id:converted.id}:item));
    setStatus('Generated chord converted to editable voicing');
   }else edit(role,p=>({...p,chords:p.chords.map(c=>c.id===placedId?next:c)}));
  }catch(error){console.error(error);setStatus(error.message);}
 };
 const gridItems=(start,end,row)=> {
  const pcs=pitchClasses(key,offScale);
  return itemsAt(pattern,key,start,end,{view:chordMode?'octave':view,rowPc:pcs[pcs.length-1-row],octave:8-row,octaveFilter:chordMode?null:octaveFilter,chordRootsOnly:chordMode});
 };
 const chordPad=(start,end,row,dragged)=>{
  const found=gridItems(start,end,row).filter(item=>item.type==='chord'||item.type==='generated');
  if(!dragged&&found.length){
   const next=found[(found.findIndex(x=>x.id===placedId)+1)%found.length];
   setPlacedId(next.id);setEditSelection([{...next,row,step:start}]);setFocusChord(null);setScreenPage('placed');return;
  }
  try{
   const current=pattern??{mode:'poly',follow:'scale',length:project.bars*project.stepsPerBar,steps:Array(project.bars*project.stepsPerBar).fill(null)};
   const id=nextChordId(current);
   const chord=newPlacedChord(project,start,end,8-row,id);
   const tones=placedChordTones(key,chord);
   const updated=insertChord(current,key,chord,chordOverlap==='replace');
   setProject(p=>({...p,patterns:{...p.patterns,[role]:updated}}));
   setPlacedId(id);setEditSelection([{type:'chord',id,start,midi:degreeToMidi(key,chord.root),row,step:start}]);setFocusChord(null);setScreenPage('placed');setDeleteStack(null);
   const h=host.current;tones.forEach(midi=>h?.note(role,midi,h.context.currentTime+.02,.4,.8));
  }catch(error){console.error(error);setStatus(error.message);}
 };
 const deletePad=(start,end,row,all)=>{
  const items=gridItems(start,end,row);
  if(!items.length){setDeleteStack(null);return;}
  if(all||items.length===1){edit(role,p=>deleteItems(p,items));setDeleteStack(null);setEditSelection([]);setPlacedId(null);if(placedId!==null)setScreenPage('seq');return;}
  setDeleteStack(previous=>{
   const index=previous?.start===start&&previous?.end===end&&previous?.row===row?(previous.index+1)%(items.length+1):0;
   return {start,end,row,items,index};
  });
 };
 const confirmDelete=()=>{
  if(!deleteStack)return;
  const items=deleteStack.index===deleteStack.items.length?deleteStack.items:[deleteStack.items[deleteStack.index]];
  edit(role,p=>deleteItems(p,items));setDeleteStack(null);setEditSelection([]);setPlacedId(null);if(placedId!==null)setScreenPage('seq');
 };
 const selectPad=(start,end,row,add=false)=>{
  const items=gridItems(start,end,row);
  if(!items.length){if(!add){setEditSelection([]);setPlacedId(null);setScreenPage('seq');}return;}
  const existing=editSelection.find(x=>x.row===row&&x.step===start);
  const next=items[(items.findIndex(x=>existing&&(x.type!=='note'?x.id===existing.id:x.type===existing.type&&x.start===existing.start&&x.index===existing.index))+1)%items.length];
  const chosen={...next,row,step:start};
  setEditSelection(add?[...editSelection.filter(x=>!(x.row===row&&x.step===start)),chosen]:[chosen]);
  setPlacedId(next.type!=='note'?next.id:null);setFocusChord(null);setScreenPage(next.type!=='note'?'placed':'meta');
 };
 const selectedData=editSelection.map(item=>item.type==='generated'?generatedChords(pattern,key).find(c=>c.id===item.id):item.type==='chord'?pattern?.chords?.find(c=>c.id===item.id):pattern?.steps[item.start]?.n?.[item.index]).filter(Boolean);
 const setMetadata=(field,value)=>{
  edit(role,p=>{
   const steps=p.steps.map((s,i)=>{
    const matches=editSelection.flatMap(x=>x.type==='generated'?x.items:x.type==='note'?[x]:[]).filter(x=>x.start===i);
    if(!s?.n||!matches.length)return s;
    return {...s,n:s.n.map((n,j)=>matches.some(x=>x.index===j)?{...n,[field]:field==='len'?Math.min(value,part.startBar*project.stepsPerBar+part.bars*project.stepsPerBar-i):value}:n)};
   });
   const chords=(p.chords??[]).map(c=>editSelection.some(x=>x.type==='chord'&&x.id===c.id)?{...c,[field]:field==='len'?Math.min(value,part.startBar*project.stepsPerBar+part.bars*project.stepsPerBar-c.start):value}:c);
   return {...p,steps,chords};
  });
 };
 const copyPad=(start,end,row,midi)=>{
  if(!copySource){
   const item=gridItems(start,end,row)[0];
   if(!item){setStatus('Select a note or chord to copy');return;}
   if(item.type==='generated'){
    const group=generatedChords(pattern,key).find(c=>c.id===item.id);
    const notes=group.items.map(x=>({offset:x.start-group.start,data:{...pattern.steps[x.start].n[x.index],len:pattern.steps[x.start].n[x.index].len??heldSteps(pattern,x.start),vel:pattern.steps[x.start].n[x.index].vel??pattern.steps[x.start].vel??.8,gate:pattern.steps[x.start].n[x.index].gate??pattern.steps[x.start].gate??pattern.gate??.8,prob:pattern.steps[x.start].n[x.index].prob??pattern.steps[x.start].prob??1}}));
    setCopySource({type:'generated',midi:item.midi,notes});setStatus('Copy source selected · tap destinations');return;
   }
   const data=item.type==='chord'?pattern.chords.find(c=>c.id===item.id):pattern.steps[item.start].n[item.index];
   const sourceStep=pattern.steps[item.start];
   setCopySource({type:item.type,data:{...data},midi:item.midi,len:item.type==='chord'?data.len:data.len??heldSteps(pattern,item.start),vel:data.vel??sourceStep?.vel??.8,gate:data.gate??sourceStep?.gate??pattern.gate??.8,prob:data.prob??sourceStep?.prob??1});
   setStatus('Copy source selected · tap destinations');return;
  }
  const limit=(part.startBar+part.bars)*project.stepsPerBar, len=Math.min(copySource.len??1,limit-start);
  if(copySource.type==='generated'){
   edit(role,p=>{
    const steps=[...p.steps],used=new Set(steps.flatMap(s=>(s?.n??[]).map(n=>n.chordSource?.group)));
    let serial=1,group=`copy:${start}:${serial}`;while(used.has(group))group=`copy:${start}:${++serial}`;
    const shift=12*((8-row)-(Math.floor(copySource.midi/12)-1));
    for(const entry of copySource.notes){
     const at=start+entry.offset;if(at>=limit)continue;
     const original=entry.data,source=original.chordSource;
     const midi=degreeToMidi(key,original)+shift;
     const note={...original,...midiToDegree(key,midi),len:Math.min(original.len,limit-at),chordSource:{...source,group}};
     const step=steps[at]??{n:[]};steps[at]={...step,n:[...(step.n??[]),note]};
    }
    return {...p,steps};
   });
  }else if(copySource.type==='chord'){
   try{
    const current=pattern??{mode:'poly',follow:'scale',length:project.bars*project.stepsPerBar,steps:Array(project.bars*project.stepsPerBar).fill(null)};
    const sourceMidi=copySource.midi,targetMidi=12*(9-row)+(sourceMidi%12),root=midiToDegree(key,targetMidi);
    const chord={...copySource.data,id:nextChordId(current),start,len,root};
    placedChordTones(key,chord);
    edit(role,p=>insertChord(p,key,chord,chordOverlap==='replace'));
   }catch(error){console.error(error);setStatus(error.message);}
  }else{
   const target=chordMode||view==='octave'?12*(9-row)+(copySource.midi%12):midi;
   edit(role,p=>{
    const steps=[...p.steps],s=steps[start]??{n:[]};
    const {chordSource,...source}=copySource.data;
    const note={...source,...midiToDegree(key,target-12*(p.octave??0)),len,vel:copySource.vel,gate:copySource.gate,prob:copySource.prob};
    steps[start]={...s,n:[...(s.n??[]),note]};return {...p,steps};
   });
  }
 };
 const toggleNote=(s,midi,end=s+1,replace=false)=>{
  if(pattern?.steps.some(step=>step?.chord)){setStatus('Chord patterns cannot be edited in the note grid');return;}
  edit(role,p=>editPitch(p,key,s,end,midi,{replace}));
  host.current?.note(role,midi,host.current.context.currentTime+0.02,0.4,0.8);
 };
 const toggleDrum=(s,drum,end=s+1)=>{
  if(s===null){host.current?.drum({drum,velocity:0.8,duration:1},host.current.context.currentTime+0.02,0.125);return;}
  setProject(p=>{
   const current=p.patterns.perc??{mode:'drums',length:p.bars*p.stepsPerBar,steps:Array(p.bars*p.stepsPerBar).fill(null)};
   return {...p,patterns:{...p.patterns,perc:editDrum(current,s,end,drum)}};
  });
  host.current?.drum({drum,velocity:0.8,duration:1},host.current.context.currentTime+0.02,0.125);
 };

 const encoders=[
  {label:'Gate',display:pattern&&role!=='perc'?Math.round((pattern.gate??0.8)*100)+'%':'—',position:pattern?((pattern.gate??0.8)-0.1)/0.9:0,step:0.05,disabled:!pattern||role==='perc',onPosition:p=>edit(role,q=>({...q,gate:Math.round((0.1+p*0.9)*20)/20})),onReset:()=>edit(role,q=>({...q,gate:undefined}))},
  {label:'Tempo',display:String(bpm),position:(bpm-50)/150,step:0.01,onPosition:p=>setBpm(Math.round(50+p*150)),onReset:()=>setBpm(Math.round(project?.bpm??90))},
  {label:'Resolution',display:resolutions[resolutionIndex].label,position:resolutionIndex/(resolutions.length-1),step:1/(resolutions.length-1),onPosition:p=>setResolution(resolutions[Math.round(p*(resolutions.length-1))].label),onReset:()=>setResolution('1/16')},
 ];
 const chordEncoders=selectedChord?[
  {label:'Octave',display:`${selectedChord.octaveShift??0}`,position:((selectedChord.octaveShift??0)+4)/8,step:1/8,onPosition:p=>{const target=Math.round(p*8)-4,delta=target-(selectedChord.octaveShift??0);if(delta&&changeChord(x=>transposeChord(x,part,focusChord,0,delta))&&selectedSpan.start!==focusChord)setFocusChord(selectedSpan.start);}},
  {label:'Degree',display:degree<0?'—':String(degree+1),position:degree<0?0:degree/(key.scale.length-1),step:1/(key.scale.length-1),disabled:degree<0,onPosition:p=>{const target=Math.round(p*(key.scale.length-1)),delta=target-degree;if(delta&&changeChord(x=>transposeChord(x,part,focusChord,delta,0))&&selectedSpan.start!==focusChord)setFocusChord(selectedSpan.start);}},
  {label:'Start',display:`bar ${selectedSpan.start-part.startBar+1}`,position:startMax>startMin?(selectedSpan.start-startMin)/(startMax-startMin):0,step:startMax>startMin?1/(startMax-startMin):1,disabled:!boundaries.selected||startMax<=startMin,onPosition:p=>{const target=startMin+Math.round(p*(startMax-startMin));if(target!==selectedSpan.start){let bar;const changed=changeChord(x=>{const result=resizeChord(x,part,focusChord,'start',target);bar=result.bar;return result.project;});if(changed)setFocusChord(bar);}}},
  {label:'End',display:`bar ${selectedSpan.end-part.startBar}`,position:endMax>endMin?(selectedSpan.end-endMin)/(endMax-endMin):0,step:endMax>endMin?1/(endMax-endMin):1,disabled:boundaries.selected===boundaries.entries.length-1||endMax<=endMin,onPosition:p=>{const target=endMin+Math.round(p*(endMax-endMin));if(target!==selectedSpan.end)changeChord(x=>resizeChord(x,part,focusChord,'end',target).project);}},
 ]:[];
 const optionEncoder=(label,values,value,display,name)=>({
  label,display:display(value),position:Math.max(0,values.indexOf(value))/(values.length-1),step:1/(values.length-1),
  onPosition:p=>setPlacedOption(name,values[Math.round(p*(values.length-1))]),
  onReset:()=>setPlacedOption(name,values[0]),
 });
 const placedEncoders=placedChord?[
  optionEncoder('Root',ROOTS,placedChord.rootVoicing??'on',x=>({'on':'On','-1':'−1 oct','-2':'−2 oct','off':'Off'}[x]),'rootVoicing'),
  optionEncoder('Colour',CHORD_COLOURS,placedChord.colour??'plain',x=>({'plain':'Normal','sus2':'Sus2','sus4':'Sus4','add7':'Add7','add9':'Add9'}[x]),'colour'),
  optionEncoder('Complexity',COMPLEXITIES,placedChord.complexity??'triad',x=>({power:'Power',triad:'Triad',seven:'Seventh'}[x]),'complexity'),
  optionEncoder('Inversion',placedChordTones(key,{...placedChord,rootVoicing:'on',inversion:0}).map((_,i)=>i),placedChord.inversion??0,x=>String(x),'inversion'),
 ]:[];
 const playEncoders=placedChord?[
  optionEncoder('Play mode',['chord','arp'],placedChord.playMode??'chord',x=>x==='chord'?'At once':'Arpeggio','playMode'),
  optionEncoder('Direction',DIRECTIONS,placedChord.direction??'up',x=>({up:'Up',down:'Down',random:'Random',upDown:'Up/down',downUp:'Down/up',broken:'Broken'}[x]),'direction'),
  optionEncoder('Arp hold',HOLDS,placedChord.hold??1,x=>x==='end'?'To end':`${x} note${x===1?'':'s'}`,'hold'),
  optionEncoder('Arp rate',RATES,placedChord.rate??1,x=>`${x} step${x===1?'':'s'}`,'rate'),
 ]:[];
 const firstItem=editSelection[0],firstData=selectedData[0],firstNote=firstItem?.type==='generated'?firstItem.items[0]:firstItem,firstStep=firstNote?.type==='note'?pattern?.steps[firstNote.start]:null;
 const firstMeta=firstItem?.type==='generated'?firstStep?.n?.[firstNote.index]:firstData;
 const firstLen=firstItem?.type==='note'?(firstData?.len??(firstStep?heldSteps(pattern,firstItem.start):1)):firstData?.len??1;
 const maxLength=editSelection.length?Math.min(...editSelection.map(x=>(part.startBar+part.bars)*project.stepsPerBar-x.start)):1;
 const metaEncoder=(label,field,value,min,max,display,increment)=>({
  label,display:display(value),position:max>min?(value-min)/(max-min):0,step:max>min?increment/(max-min):1,disabled:max<=min,
  onPosition:p=>setMetadata(field,Math.round((min+p*(max-min))/increment)*increment),
  onReset:()=>setMetadata(field,field==='len'?1:field==='vel'?.8:1),
 });
 const metaEncoders=firstData?[
  metaEncoder('Velocity','vel',firstMeta?.vel??firstStep?.vel??.8,.02,1,x=>`${Math.round(x*100)}%`,.01),
  metaEncoder('Length','len',firstLen,1,maxLength,x=>`${x} steps`,1),
  metaEncoder('Note gate','gate',firstMeta?.gate??firstStep?.gate??(firstItem.type==='chord'?1:pattern.gate??.8),.05,1,x=>`${Math.round(x*100)}%`,.05),
  metaEncoder('Chance','prob',firstMeta?.prob??firstStep?.prob??1,0,1,x=>`${Math.round(x*100)}%`,.05),
 ]:[];
 const stackChoice=deleteStack&&(deleteStack.index===deleteStack.items.length?'ALL':deleteStack.items[deleteStack.index].type!=='note'?`CHORD ${noteName(deleteStack.items[deleteStack.index].midi)}`:`NOTE ${noteName(deleteStack.items[deleteStack.index].midi)}`);
 const keyName=key?`${TONIC_NAMES[key.tonic]} ${key.scaleId.replace('-',' ')}`:'—';
 const lines=arrangement
  ?['ARRANGEMENT · SEQUENCERS × PROGRESSIONS',project?`${keyName} · ${project.bars} BARS · ${bpm} BPM`:'NO SONG YET',`ROW BUTTONS: ${(rowAction??'select').toUpperCase()} · TAP A PAD TO SELECT`]
  :[`SEQ ${selected+1} · ${seqInfo.label.toUpperCase()} · ${chordMode?'CHORD':(pattern?.mode??'empty').toUpperCase()}`,project?`${keyName} · ${project.bars} BARS · ${bpm} BPM`:'NO SONG YET',deleteStack?`DELETE ${stackChoice} (${deleteStack.index+1}/${deleteStack.items.length+1})`:copyMode?copySource?'COPY · TAP DESTINATIONS':'COPY · SELECT SOURCE':editSelection.length>1?`${editSelection.length} ITEMS SELECTED`:placedChord?`${placedChord.sourceGroup?'GENERATED':'PLACED'} CHORD ${noteName(degreeToMidi(key,placedChord.root))} · ${placedChord.len} STEPS`:firstItem?`NOTE ${noteName(firstItem.midi)} · ${firstLen} STEPS`:selectedChord?`CHORD ${selectedChord.name} · BARS ${selectedSpan.start+1}–${selectedSpan.end}`:editMode?'EDIT · TAP TO SELECT':playing?'PLAYING':'STOPPED'];
 const bar=project?Math.floor(col/project.stepsPerBar)+1:1;

 if(typeof window!=='undefined')window.__allBooked=booked.current;// notes booked per role, for checking the page
 return <main className="all-page" style={{padding:'14px 16px',maxWidth:1500,margin:'0 auto',display:'grid',gap:12}}>
  <header style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}}>
   <h1 style={{margin:0,fontSize:20}}>All · sequencers and sound generators</h1>
   <span style={{opacity:.7,fontSize:13}}>{status}</span>
  </header>
  <section style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}} aria-label="Song">
   <label>Scene <select value={sceneName} disabled={busy} onChange={e=>chooseScene(e.target.value)}>{SCENE_CATEGORIES.map(c=><optgroup key={c.id} label={c.label}>{sceneList.filter(s=>s.category===c.id).map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</optgroup>)}</select></label>
   <label>Progressions <select value={progressionCount} disabled={busy||!started} onChange={e=>{const n=+e.target.value;setProgressionCount(n);newSong({progressions:n});}}>{PROGRESSION_CHOICES.map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <button type="button" disabled={!started||busy} onClick={()=>newSong()} title="The generator plans another song for this scene's settings and the sequencers take it">New song</button>
   <button type="button" disabled={!started||busy} onClick={()=>newSong({seed:host.current.settings.seed})} title="The scene's own song">Scene's song</button>
   {chordMode&&role!=='perc'&&<label>Chord overlap <select aria-label="Chord overlap" value={chordOverlap} onChange={e=>setChordOverlap(e.target.value)}><option value="replace">Replace in octave</option><option value="layer">Layer</option></select></label>}
  </section>
  <section aria-label="Sound generators" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:8}}>
   {SEQUENCERS.map((s,i)=>{const sound=sounds[s.role]??{synth:'calmbgm',name:''};return <div key={s.role} style={{border:`1px solid ${COLOURS[s.role]}55`,borderRadius:6,padding:8,display:'grid',gap:4,background:selected===i?'#ffffff10':'transparent'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b style={{color:COLOURS[s.role]}}>SEQ {i+1} · {s.label}</b>
     <span><label><input type="checkbox" checked={!!mutes[s.role]} onChange={e=>setMutes(m=>({...m,[s.role]:e.target.checked}))}/> mute</label>{' '}
     <label><input type="checkbox" checked={!!solos[s.role]} onChange={e=>setSolos(m=>({...m,[s.role]:e.target.checked}))}/> solo</label></span></div>
    {s.role==='perc'?<small>Scene drum kit</small>:<><select aria-label={`${s.label} sound generator`} value={sound.synth} disabled={!started||busy} onChange={e=>chooseSound(s.role,e.target.value)}>{synthChoices().map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
    {sound.synth==='calmbgm'
     ?<small style={{opacity:.7}}>{sound.name||'the scene\'s voice'}</small>
     :<select aria-label={`${s.label} patch`} value={sound.name} disabled={!started||busy} onChange={e=>chooseSound(s.role,sound.synth,e.target.value)}>{patchesOf(sound.synth).map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select>}
    </>}
   </div>;})}
  </section>
  <div className="drums"><div className="split" style={{'--rows':ROWS+1}}><section className="device device-seq" aria-label="Sequencer" style={{position:'relative'}}>
   <header className="device-head"><h2>Sequencer</h2><span>{project?`${seqInfo.label} · bar ${bar} of ${project.bars}${pattern?'':' · empty'}`:'start the orchestra'}</span></header>
   <div className="s8">
    <div className="s8-left">
     <SeqScreen accent={COLOURS[role]} page={screenPage} onPage={setScreenPage} pages={[
      {id:'seq',label:'Seq',encoders:[encoders[1],encoders[2]]},
      {id:'sound',label:'Gate',encoders:[encoders[0]]},
      {id:selectedChord?'timeline':'placed',label:selectedChord?'Bars':'Chord',encoders:selectedChord?chordEncoders:placedEncoders,disabled:!selectedChord&&!placedChord},
      {id:'arp',label:'Arp',encoders:playEncoders,disabled:!placedChord},
      {id:'meta',label:'Note',encoders:metaEncoders,disabled:!firstData},
     ]} lines={lines}/>
     <div className="s8-transport" role="group" aria-label="Transport">
      <button type="button" className={'tp play'+(playing?' on':'')} aria-pressed={playing} disabled={!started||!project} onClick={()=>play()}><b>▶</b><small>Play</small></button>
      <button type="button" className={'tp'+(paused?' on':'')} aria-pressed={paused} disabled={!playing} onClick={pause}><b>⏸</b><small>Pause</small></button>
      <button type="button" className="tp" disabled={!started} onClick={stop}><b>■</b><small>Stop</small></button>
      <button type="button" className={'tp'+(loop!=='song'?' on':'')} aria-label={`Repeat ${loop}`} disabled={!started} onClick={changeRepeat}><b>⟲</b><small>{loop==='pattern'?'Pattern':loop==='song'?'Song':loop==='bar'?'Bar':'Chord'}</small></button>
     </div>
     <div className="s8-keys" role="group" aria-label="Sequencer controls">
      <button type="button" className={arrangement?'on':''} aria-pressed={arrangement} disabled={!project} onClick={()=>setArrangement(v=>!v)}><small>View</small><b>Arrange</b></button>
      {arrangement?<button type="button" className={rowAction==='mute'?'on':''} aria-pressed={rowAction==='mute'} onClick={()=>setRowAction(v=>v==='mute'?null:'mute')}><small>Rows</small><b>Mute</b></button>
       :<button type="button" disabled={role==='perc'||chordMode} aria-label={`Grid view: ${view}`} onClick={()=>{setDeleteStack(null);setView(v=>v==='scale'?'octave':'scale');}}><small>View</small><b>{chordMode?'Octave':view==='scale'?'Scale':'Octave'}</b></button>}
      {arrangement?<button type="button" className={rowAction==='solo'?'on':''} aria-pressed={rowAction==='solo'} onClick={()=>setRowAction(v=>v==='solo'?null:'solo')}><small>Rows</small><b>Solo</b></button>
       :<button type="button" disabled={role==='perc'} className={editMode?'on':''} aria-pressed={editMode} onClick={()=>{setEditMode(v=>!v);setDeleteMode(false);setCopyMode(false);setCopySource(null);setEditSelection([]);setPlacedId(null);setScreenPage('seq');}} title="Select pads for editing; Shift adds to the selection"><small>Layer</small><b>Edit</b></button>}
      <button type="button" className={shiftHeld?'on':''} aria-pressed={shiftHeld} title="Hold Shift and select an octave to show only that octave"
       onPointerDown={e=>{if(e.button!==0)return;shiftPointer.current=e.pointerId;setShiftHeld(true);e.currentTarget.setPointerCapture?.(e.pointerId);}}
       onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();keyboardShift.current=true;setShiftHeld(true);}}}
       onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){keyboardShift.current=false;if(shiftPointer.current===null){setShiftHeld(false);setOctaveFilter(null);releaseChord.current();}}}}><small>Hold</small><b>Shift</b></button>
      <button type="button" disabled={role==='perc'||arrangement} aria-pressed={chordMode} title="Switch between note and chord insertion" onClick={()=>{setChordMode(v=>!v);setPlacedId(null);setEditSelection([]);setCopySource(null);setDeleteStack(null);setScreenPage('seq');}}><small>Insert</small><b>{chordMode?'Chord':'Note'}</b></button>
      <button type="button" disabled={role==='perc'||arrangement} className={deleteMode?'on':''} aria-pressed={deleteMode} title="Tap a pad to delete; tap a stack to cycle, or hold to delete all" onClick={()=>{setDeleteMode(v=>!v);setEditMode(false);setCopyMode(false);setCopySource(null);setDeleteStack(null);setEditSelection([]);}}><small>Mode</small><b>Delete</b></button>
      <button type="button" disabled={!deleteMode||!deleteStack||arrangement} onClick={confirmDelete}><small>Confirm</small><b>Delete</b></button>
      <button type="button" disabled={role==='perc'||arrangement} className={copyMode?'on':''} aria-pressed={copyMode} onClick={()=>{setCopyMode(v=>!v);setCopySource(null);setDeleteMode(false);setEditMode(false);setEditSelection([]);setPlacedId(null);setScreenPage('seq');}} title="Select a source, then tap destinations to paste"><small>Mode</small><b>Copy</b></button>
     </div>
    </div>
    <div className="s8-right">
     {arrangement&&project?<ArrangementGrid project={project} sequencers={SEQUENCERS} colours={COLOURS} selected={selected} progression={progression} offset={arrOffset} onOffset={setArrOffset} rowAction={rowAction} mutes={mutes} solos={solos}
      onMute={r=>setMutes(m=>({...m,[r]:!m[r]}))} onSolo={r=>setSolos(m=>({...m,[r]:!m[r]}))} onSelectRow={setSelected} onSelect={(i,j)=>{setSelected(i);chooseProgression(j);}}/>
     :project?<ProgressionGrid key={progression} project={project} pattern={pattern} part={part} colour={COLOURS[role]} offset={col} onOffset={setCol} headRef={head} focus={focusChord} onFocus={selectChord} onShiftChord={jumpChord}
      view={view} offScale={offScale} onOffScale={setOffScale} octave={insertOctave} onOctave={setInsertOctave} octaveFilter={octaveFilter} shiftHeld={shiftHeld} onFilterOctave={setOctaveFilter} pitch={pitch} onPitch={setPitch} stepSize={gridSize}
      onToggleNote={toggleNote} chordMode={chordMode&&role!=='perc'} deleteMode={deleteMode&&role!=='perc'} editMode={editMode&&role!=='perc'} copyMode={copyMode&&role!=='perc'} onEditPad={selectPad} onCopyPad={copyPad} onChordPad={chordPad} onDeletePad={deletePad} selectedPlaced={placedId} selectedDelete={deleteStack} selectedEdit={editSelection}
      drumMode={role==='perc'} drumOffset={drumOffset} onDrumOffset={setDrumOffset} onToggleDrum={toggleDrum}/>
     :<div className="progression-empty">Start the orchestra to open the progression editor.</div>}
    </div>
   </div>
  </section></div></div>
 </main>;
}

function progressionsOf(project){
 return project.progressions?.length?project.progressions:[{startBar:0,bars:project.bars}];
}
