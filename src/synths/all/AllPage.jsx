import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BROWSABLE_SCENES,SCENE_CATEGORIES,sceneSettings} from '../../app/scenes';
import {TONIC_NAMES} from '../../app/theory';
import {createScheduler} from '../../seq/scheduler';
import {projectStepEvents} from '../../seq/notes';
import {gridResolutions,editPitch,editDrum} from './gridTiming';
import {chordSpan,chordBoundaries,rootDegree,transposeChord,resizeChord} from './chordEditing';
import {repeatRange,repeatNoteEvents} from './repeat';
import {followPlayback} from './followPlayback';
import {COMPLEXITIES,DIRECTIONS,FLAVOURS,NOTE_LENGTHS,RATES,STYLES,chordStack,chordStrikes,deleteItems,generatedChords,insertChord,itemsAt,materializeGeneratedChord,newPlacedChord,nextChordId,omitOptions,placedChordEvents,placedChordTones,stackNames} from './placedChords';
import {RATE_PATTERNS} from './ratePatterns';
import SeqScreen from '../seq/SeqScreen';
import GeneratorBox from './GeneratorBox';
import ChannelMixer from './ChannelMixer';
import AmbienceBox from './AmbienceBox';
import FloatBox from './FloatBox';
import {VoiceWindow} from './VoiceWindows';
import Scope from '../ui/Scope';
import {PRESET_CATEGORIES} from '../../app/presets';
import useDraggable from '../ui/useDraggable';
import Desk from '../ui/Desk';
import StageKeys from '../ui/StageKeys';
import SetupPopover from '../ui/SetupPopover';
import {SETUP,SETUP_KEY,CURVES,computerKeyVelocity} from '../ui/setup';
import {LabMidi,bindLabKeyboard,mapVelocity} from '../../labs/input';
import {buildContext,DEFAULT_HARMONY} from '../../app/harmonyContext';
import {Performer} from '../engine/performer';
import {createPhraseRunner,phraseForCode} from '../ui/phraseRunner';
import {AutoPlay,ChordChips} from '../ui/PhraseDock';
import {Ribbon,TouchPad} from '../ui/controls';
import {recalledContext} from '../../app/auditionPhrases';
import ProgressionGrid,{pitchClasses} from './ProgressionGrid';
import ArrangementGrid from './ArrangementGrid';
import {movePlayhead} from '../seq/playhead';
import {createHost,SEQUENCERS,synthChoices,patchesOf,isNative,synthForPreset} from './host';
import {SYNTHS} from '../models';
import {load,save} from '../storage';
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
 const [chordMode,setChordMode]=useState(false),[deleteMode,setDeleteMode]=useState(false),[chordOverlap,setChordOverlap]=useState(stored.chordOverlap??'replace'),[placedId,setPlacedId]=useState(null),[deleteStack,setDeleteStack]=useState(null),[strikeIndex,setStrikeIndex]=useState(0);
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
 async function chooseSound(r,synth,name,values){
  const h=host.current;if(!h)return;
  if(restoreSounds.current){const next={...restoreSounds.current};delete next[r];restoreSounds.current=next;}
  setSounds(s=>({...s,[r]:{synth,name:name??s[r]?.name??''}}));
  setBusy(true);setStatus(`Loading ${synth} for ${r}…`);
  try{const got=await h.setSound(r,{synth,name,values});setSounds(s=>({...s,[r]:{synth,name:got.name}}));setStatus(`${r}: ${synth==='calmbgm'?'calmbgm':synth} · ${got.name}`);}catch(error){console.error(error);setStatus(error.message);}finally{setBusy(false);setVoiceVersion(v=>v+1);}
 }
 // the floating windows of the voices (their synth and their effects) and the scope
 const [wins,setWins]=useState({}),[voiceVersion,setVoiceVersion]=useState(0);
 const toggleWin=id=>setWins(w=>({...w,[id]:!w[id]}));
 const editVoice=(r,values)=>{host.current?.editValues(r,values);setVoiceVersion(v=>v+1);};
 const editNativeVoice=(r,changes)=>{host.current?.editNative(r,changes);setVoiceVersion(v=>v+1);};
 const editVoiceFx=(r,changes)=>{Promise.resolve(host.current?.editRack(r,changes)).finally(()=>setVoiceVersion(v=>v+1));};
 const [scopeOn,setScopeOn]=useState(()=>load('synths:scope:open',false)===true),scopeEngine=useRef(null);
 const toggleScope=()=>setScopeOn(v=>{save('synths:scope:open',!v);return !v;});
 useEffect(()=>{
  if(!scopeOn||!started||!host.current)return undefined;
  let alive=true,made=null;
  host.current.openMonitor().then(m=>{if(alive){made=m;scopeEngine.current=m;}else m.dispose();}).catch(e=>console.error(e));
  return ()=>{alive=false;scopeEngine.current=null;made?.dispose();};
 },[scopeOn,started,sceneName,hostVersion]);

 const keysDrag=useDraggable('synths:all:keys-pos',{x:417,y:-278});
 // the desk's setup (MIDI, keybed, computer keys) and the keyboard's lit keys, as on every /synths page
 const [setup,setSetup]=useState(()=>{const s={...SETUP,...load(SETUP_KEY,{})};if(!['auto','show','hide'].includes(s.keys))s.keys='auto';return s;});
 const [showSetup,setShowSetup]=useState(false),[midi,setMidi]=useState({inputs:[],status:'Not connected.'}),[awake,setAwake]=useState(false),[litNotes,setLitNotes]=useState([]);
 const setupRef=useRef(setup),midiRef=useRef(null),lit=useRef(new Map());setupRef.current=setup;
 useEffect(()=>{save(SETUP_KEY,{...load(SETUP_KEY,{}),...setup});},[setup]);

 // The keyboard is the other pages' keyboard, connected to one of the voices: the connected voice is a preview of its sound, so any phrase or key plays through it.
 const [voice,setVoice]=useState(()=>{const r=SEQUENCERS[stored.selected??3]?.role;return r&&r!=='perc'?r:'lead';});
 const [held,setHeld]=useState([]),[phrasePlaying,setPhrasePlaying]=useState(null),[chordPick,setChordPick]=useState(0);
 const [audition,setAudition]=useState(()=>({follow:true,...DEFAULT_HARMONY,...load('synths:audition',{})}));
 const changeAudition=next=>{setAudition(next);save('synths:audition',next);};
 const voiceRef=useRef(voice);voiceRef.current=voice;
 const contextRef=useRef(null);
 // what the Performer plays on: the connected voice's instrument, a note held for as long as the key is down where the instrument can hold one
 const performer=useMemo(()=>{
  const ids=new Map();
  const target={
   noteOn(id,note,velocity){
    const h=host.current,r=voiceRef.current,instrument=h?.g.roles[r]?.instrument;if(!instrument)return;
    if(typeof instrument.startNote==='function')ids.set(id,{instrument,note:instrument.startNote(note,velocity)});
    else h.note(r,note,h.context.currentTime+.01,1.2,velocity);
   },
   noteOff(id){const e=ids.get(id);if(e){e.instrument.stopNote(e.note);ids.delete(id);}},
   pressure(){},control(){},
   panic(){for(const e of ids.values())e.instrument.stopNote(e.note);ids.clear();},
  };
  return new Performer(target,{onNotes:setHeld});
 },[]);
 const phrases=useMemo(()=>createPhraseRunner(performer,{context:()=>contextRef.current,onState:setPhrasePlaying}),[performer]);
 // the sequencers' notes light the keys too, in time with the sound
 function light(midi,delay,dur){
  const on=setTimeout(()=>{
   timers.current.delete(on);lit.current.set(midi,(lit.current.get(midi)||0)+1);setLitNotes([...lit.current.keys()]);
   const off=setTimeout(()=>{timers.current.delete(off);const n=(lit.current.get(midi)||1)-1;if(n>0)lit.current.set(midi,n);else lit.current.delete(midi);setLitNotes([...lit.current.keys()]);},dur);
   timers.current.add(off);
  },Math.max(0,delay));
  timers.current.add(on);
 }
 function dark(){if(lit.current.size){lit.current.clear();setLitNotes([]);}}
 // audio starts with the first key or phrase
 const wake=()=>{const h=host.current;return h?h.wake().then(()=>setAwake(true)):Promise.resolve();};
 const playPhrase=id=>{wake().then(()=>phrases.play(id));};
 const down=(k,n,v)=>{wake().then(()=>performer.down(k,n,v));};
 const downRef=useRef(down);downRef.current=down;
 function panic(){phrases.stop();performer.panic();Object.values(host.current?.g.roles??{}).forEach(r=>r.instrument?.silence?.());dark();}
 const connectMidi=async()=>{try{await midiRef.current.connect();}catch(e){setMidi(m=>({...m,status:e.message}));}};
 const updateSetup=(k,v)=>{setSetup(x=>({...x,[k]:v}));if(k==='midiDevice'){performer.releaseAll();midiRef.current.selected=v;}if(k==='midiChannel'){performer.releaseAll();midiRef.current.channel=v;}};
 useEffect(()=>{
  const m=new LabMidi({on:(k,n,v)=>downRef.current(k,n,mapVelocity(v,CURVES[setupRef.current.velocity]??CURVES.normal)),off:k=>performer.up(k),sustain:()=>{},control:()=>{},panic:()=>performer.panic(),
   onStatus:inputs=>setMidi({inputs,status:inputs.length?`${inputs.length} MIDI input${inputs.length>1?'s':''} connected.`:'MIDI ready · plug in your piano.'})});
  m.selected=setupRef.current.midiDevice;m.channel=setupRef.current.midiChannel;midiRef.current=m;
  const kb=bindLabKeyboard(window,{on:(k,n)=>downRef.current(k,n,computerKeyVelocity(setupRef.current)),off:k=>performer.up(k),panic:()=>performer.panic(),octave:()=>Math.floor(setupRef.current.keysLow/12)-1,
   shift:d=>setSetup(x=>({...x,keysLow:Math.min(84,Math.max(24,x.keysLow+12*d))}))});
  // 1-5 play the audition phrases on the connected voice, Escape stops them
  const phraseKey=e=>{
   if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target?.closest?.('input,select,textarea,[contenteditable=true],[role=slider]'))return;
   const id=phraseForCode(e.code);
   if(id){e.preventDefault();playPhrase(id);}else if(e.key==='Escape')phrases.stop();
  };
  window.addEventListener('keydown',phraseKey);
  return ()=>{kb();m.dispose();window.removeEventListener('keydown',phraseKey);phrases.stop();performer.panic();};
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
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
   emit:events=>events.forEach(e=>{const r=SEQUENCERS[e.track].role;if(r==='perc')h.drum(e.hit,e.time,e.stepSec);else{h.note(r,e.note,e.time,e.duration,e.velocity);light(e.note,(e.time-h.context.currentTime+(h.g.AC.outputLatency||0))*1000,Math.max(60,e.duration*1000));}booked.current[r]=(booked.current[r]||0)+1;}),
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
  return ()=>{sched.stop();scheduler.current=null;timers.current.forEach(clearTimeout);timers.current.clear();dark();};
 },[started,hostVersion]);// eslint-disable-line react-hooks/exhaustive-deps
 const stop=()=>{
  const s=scheduler.current;if(!s)return;
  temporaryChord.current=false;
  s.stop();timers.current.forEach(clearTimeout);timers.current.clear();dark();playingRef.current=false;movePlayhead(head.current,{running:false,step:0});Object.values(host.current.g.roles).forEach(r=>r.instrument?.silence?.());setPlaying(false);setPaused(false);
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
 const pause=()=>{if(!playing)return;scheduler.current?.pause();timers.current.forEach(clearTimeout);timers.current.clear();dark();playingRef.current=false;setPlaying(false);setPaused(true);};
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
  s.stop();timers.current.forEach(clearTimeout);timers.current.clear();dark();Object.values(host.current.g.roles).forEach(r=>r.instrument?.silence?.());
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
 const placedChord=pattern?.chords?.find(c=>c.id===placedId)??generatedChords(pattern,key,project?.stepsPerBar).find(c=>c.id===placedId);
 // The chord menu's fields. A generated chord kept as an exact voicing (grey chord fields) or exact strikes (grey play fields) turns into plain settings
 // for the fields that are touched; the rest of what it plays is unchanged until then.
 const VOICING_FIELDS=['complexity','colour','quality','omit','inversion','add','root'],TIMING_FIELDS=['playMode','direction','rate','mask','noteLen','spill','hold','endAsOne','phase'];
 const patchPlaced=(patch)=>{
  try{
   const next={...placedChord,...patch};
   if(Object.keys(patch).some(k=>VOICING_FIELDS.includes(k)))delete next.voicing;
   if(Object.keys(patch).some(k=>TIMING_FIELDS.includes(k)))delete next.strikes;
   const count=chordStack(key,{...next,voicing:undefined}).stack.length-(next.omit?.length??0);
   next.inversion=Math.min(next.inversion??0,Math.max(0,count-1));
   if(next.mask&&next.mask.length!==Math.round(project.stepsPerBar/(next.rate??1)))delete next.mask;
   placedChordTones(key,next);
   if(placedChord.sourceGroup){
    const converted=materializeGeneratedChord(pattern,key,next);
    setProject(p=>({...p,patterns:{...p.patterns,[role]:converted.pattern}}));
    setPlacedId(converted.id);
    setEditSelection(selection=>selection.map(item=>item.id===placedId?{...item,type:'chord',id:converted.id}:item));
    setStatus('Generated chord converted to editable settings');
   }else edit(role,p=>({...p,chords:p.chords.map(c=>c.id===placedId?next:c)}));
  }catch(error){console.error(error);setStatus(error.message);}
 };
 const setPlacedOption=(name,value)=>patchPlaced({[name]:value});
 const gridItems=(start,end,row)=> {
  const pcs=pitchClasses(key,offScale);
  return itemsAt(pattern,key,start,end,{view:chordMode?'octave':view,rowPc:pcs[pcs.length-1-row],octave:8-row,octaveFilter:chordMode?null:octaveFilter,chordRootsOnly:chordMode,stepsPerBar:project.stepsPerBar});
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
 const selectedData=editSelection.map(item=>item.type==='generated'?generatedChords(pattern,key,project?.stepsPerBar).find(c=>c.id===item.id):item.type==='chord'?pattern?.chords?.find(c=>c.id===item.id):pattern?.steps[item.start]?.n?.[item.index]).filter(Boolean);
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
    const group=generatedChords(pattern,key,project?.stepsPerBar).find(c=>c.id===item.id);
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
 const greyChord=!!placedChord?.voicing,greyPlay=!!placedChord?.strikes;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const pick=(label,values,value,display,patchOf,{grey=false,disabled=false}={})=>{
  const index=values.findIndex(v=>same(v,value)),last=Math.max(1,values.length-1);
  return {label,display:grey?'custom':display(value),grey,disabled,position:Math.max(0,index)/last,step:1/last,
   onPosition:p=>patchPlaced(patchOf(values[Math.round(p*(values.length-1))])),onReset:()=>patchPlaced(patchOf(values[0]))};
 };
 const toneNames=placedChord?stackNames(key,{...placedChord,voicing:undefined}):[];
 const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
 const BORROW=[{label:'In key'},{label:'−2 st',shift:-2},{label:'−1 st',shift:-1},{label:'+1 st',shift:1},{label:'+2 st',shift:2},{label:'Major',quality:'major'},{label:'Minor',quality:'minor'},{label:'Dim',quality:'dim'},{label:'Aug',quality:'aug'}];
 const borrowNow=placedChord?(BORROW.find(b=>(b.quality??undefined)===(placedChord.quality??undefined)&&(b.quality?true:(b.shift??0)===(placedChord.root.a??0)))??{label:`${placedChord.root.a>0?'+':''}${placedChord.root.a} st${placedChord.quality?' · '+cap(placedChord.quality):''}`}):null;
 const stackSize=placedChord?chordStack(key,{...placedChord,voicing:undefined}).stack.length:0;
 const placedEncoders=placedChord?[
  pick('Length',COMPLEXITIES,placedChord.complexity??'triad',x=>({power:'Diad',triad:'Triad',seven:'Seventh'}[x]),v=>({complexity:v}),{grey:greyChord}),
  pick('Borrow',BORROW,borrowNow,b=>b.label,b=>b.quality?{quality:b.quality}:{quality:undefined,root:{...placedChord.root,a:b.shift??0}},{grey:greyChord}),
  pick('Flavour',FLAVOURS,placedChord.colour??'plain',x=>({plain:'Natural',sus2:'Sus2',sus4:'Sus4',add6:'Add6',add9:'Add9',flat2:'♭9',add7:'Add7'}[x]??x),v=>({colour:v}),{grey:greyChord}),
  pick('Inversion',Array.from({length:Math.max(1,stackSize-(placedChord.omit?.length??0))},(_,i)=>i),placedChord.inversion??0,x=>String(x),v=>({inversion:v}),{grey:greyChord}),
 ]:[];
 const styleOf=placedChord?.strikes?'custom':placedChord?.playMode??'chord',running=['arp','roll','pulse'].includes(placedChord?.playMode??'chord');
 const cycle=placedChord&&project?Math.round(project.stepsPerBar/(placedChord.rate??1)):0;
 const patterns=['straight',...(RATE_PATTERNS[cycle]??[])],maskNow=placedChord?.mask??'straight';
 if(placedChord&&!patterns.includes(maskNow))patterns.push(maskNow);
 const maskText=m=>m==='straight'?'Straight':m.replace(/\./g,'·');
 const playEncoders=placedChord?[
  pick('Style',STYLES,placedChord.playMode??'chord',x=>({chord:'Sustain',arp:'Arpeggio',roll:'Roll',pulse:'Pulse'}[x]),v=>({playMode:v}),{grey:greyPlay}),
  pick('Direction',DIRECTIONS,placedChord.direction??'up',x=>({up:'Up',down:'Down',random:'Random',upDown:'Up/down',downUp:'Down/up',broken:'Broken',out:'Out',in:'In'}[x]),v=>({direction:v}),{grey:greyPlay,disabled:!['arp','roll'].includes(placedChord.playMode??'chord')}),
  pick('Note length',['auto',...NOTE_LENGTHS],placedChord.noteLen??'auto',x=>x==='auto'?'Auto':x==='tie'?'To next':x==='end'?'To end':`${x} step${x===1?'':'s'}`,v=>({noteLen:v==='auto'?undefined:v}),{grey:greyPlay}),
  pick('Rate',RATES,placedChord.rate??1,x=>`${x} step${x===1?'':'s'}`,v=>({rate:v}),{grey:greyPlay,disabled:!running}),
 ]:[];
 const omits=omitOptions(stackSize,3);
 const addNow=placedChord?.add?.[0];
 const rhythmEncoders=placedChord?[
  pick('Pattern',patterns,maskNow,maskText,v=>({mask:v==='straight'?undefined:v}),{grey:greyPlay,disabled:!['arp','pulse'].includes(placedChord.playMode??'chord')}),
  pick('Omit',omits,placedChord.omit??(placedChord.rootVoicing==='off'?[0]:[]),x=>x.length?x.map(n=>cap(toneNames[n]??`#${n+1}`)).join(' + '):'None',v=>({omit:v}),{grey:greyChord}),
  pick('Add',[null,...toneNames.map((_,i)=>i)],addNow?addNow.tone:null,x=>x===null?'None':cap(toneNames[x]??`#${x+1}`),v=>({omit:placedChord.omit??[],add:v===null?[]:[{tone:v,oct:addNow?.oct??1}]}),{grey:greyChord}),
  pick('Added octave',[-2,-1,1,2],addNow?.oct??1,x=>(x>0?'+':'')+x,v=>({omit:placedChord.omit??[],add:addNow?[{...addNow,oct:v}]:[]}),{grey:greyChord,disabled:!addNow}),
 ]:[];
 // custom strikes: every note the chord plays, as it plays it; touching one freezes the chord's playing as exactly these strikes
 const chordTones=placedChord?placedChordTones(key,placedChord):[];
 const strikeList=placedChord?chordStrikes(key,placedChord).map(s=>({at:s.at,tone:chordTones.indexOf(s.note),len:Math.max(1,Math.round(Math.min(s.len,placedChord.len-s.at))),...(s.vel!==undefined?{vel:s.vel}:{})})):[];
 if(!placedChord?.strikes)strikeList.sort((a,b)=>a.at-b.at||a.tone-b.tone);
 const strikeAt=Math.min(strikeIndex,Math.max(0,strikeList.length-1)),strike=strikeList[strikeAt];
 const editStrike=change=>patchPlaced({strikes:strikeList.map((s,i)=>i===strikeAt?{...s,...change}:s)});
 const customEncoders=placedChord&&strike?[
  {label:'Strike',display:`${strikeAt+1}/${strikeList.length} ${noteName(chordTones[strike.tone])}`,position:strikeList.length>1?strikeAt/(strikeList.length-1):0,step:1/Math.max(1,strikeList.length-1),disabled:strikeList.length<2,
   onPosition:p=>setStrikeIndex(Math.round(p*(strikeList.length-1))),onReset:()=>setStrikeIndex(0)},
  {label:'Offset',display:`${strike.at} step${strike.at===1?'':'s'}`,position:strike.at/Math.max(1,placedChord.len-1),step:1/Math.max(1,placedChord.len-1),onPosition:p=>editStrike({at:Math.round(p*(placedChord.len-1))}),onReset:()=>editStrike({at:0})},
  {label:'Length',display:`${strike.len} step${strike.len===1?'':'s'}`,position:(strike.len-1)/15,step:1/15,onPosition:p=>editStrike({len:1+Math.round(p*15)}),onReset:()=>editStrike({len:1})},
  {label:'Velocity',display:`${Math.round((strike.vel??placedChord.vel??.8)*100)}%`,position:((strike.vel??placedChord.vel??.8)-.05)/.95,step:.05,onPosition:p=>editStrike({vel:Math.round((.05+p*.95)*20)/20}),onReset:()=>editStrike({vel:undefined})},
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
 // The tab buttons keep a fixed count; what they open depends on what is being edited: a chord's five pages, a note's level page, a bar's chord, or the pattern.
 const SCREEN_SLOTS=5;
 const contextPages=placedChord?[
  {id:'placed',label:'Chord',encoders:placedEncoders},
  {id:'play',label:'Play',encoders:playEncoders},
  {id:'rhythm',label:'Rhythm',encoders:rhythmEncoders},
  {id:'custom',label:'Custom',encoders:customEncoders,disabled:!strike},
  {id:'meta',label:'Level',encoders:metaEncoders,disabled:!firstData},
 ]:selectedChord?[{id:'timeline',label:'Bars',encoders:chordEncoders}]
  :firstData?[{id:'meta',label:'Note',encoders:metaEncoders}]
  :[{id:'seq',label:'Seq',encoders:[encoders[1],encoders[2],encoders[0]]}];
 const screenPages=[...contextPages,...Array.from({length:SCREEN_SLOTS-contextPages.length},(_,i)=>({id:'unused'+i,label:'',blank:true,disabled:true,encoders:[]}))];
 const stackChoice=deleteStack&&(deleteStack.index===deleteStack.items.length?'ALL':deleteStack.items[deleteStack.index].type!=='note'?`CHORD ${noteName(deleteStack.items[deleteStack.index].midi)}`:`NOTE ${noteName(deleteStack.items[deleteStack.index].midi)}`);
 const keyName=key?`${TONIC_NAMES[key.tonic]} ${key.scaleId.replace('-',' ')}`:'—';
 // The window names what is selected (its chord, when in the sequence it plays, what it does), not the song: the song is shown only when nothing is selected.
 const spb=project?.stepsPerBar??16;
 const when=step=>`BAR ${Math.floor(step/spb)+1} · BEAT ${Math.floor((step%spb)/4)+1}${step%4?`.${step%4+1}`:''}`;
 const howLong=len=>len%spb===0?`${len/spb} BAR${len===spb?'':'S'}`:`${len} STEP${len===1?'':'S'}`;
 const progressionAt=step=>project?[...project.chords].reverse().find(c=>c.bar*spb<=step):null;
 const chordSummary=c=>{
  if(!c)return '';
  const parts=[];
  const mode=c.strikes?'EXACT STRIKES':({chord:'SUSTAIN',arp:`ARPEGGIO ${(c.direction??'up').toUpperCase()}`,roll:`ROLL ${(c.direction??'up').toUpperCase()}`,pulse:'PULSE'}[c.playMode??'chord']);
  parts.push(mode);
  if(!c.strikes&&['arp','roll','pulse'].includes(c.playMode))parts.push(`EVERY ${c.rate??1} STEP${(c.rate??1)===1?'':'S'}${c.mask?' · '+c.mask.replace(/./g,'·'):''}`);
  if(c.voicing)parts.push('EXACT VOICING');
  else{
   parts.push({power:'DIAD',triad:'TRIAD',seven:'SEVENTH'}[c.complexity??'triad']);
   if(c.colour&&c.colour!=='plain')parts.push(c.colour.replace('flat2','♭9').toUpperCase());
   if(c.quality)parts.push(c.quality.toUpperCase());
   if(c.inversion)parts.push(`INVERSION ${c.inversion}`);
   if(c.omit?.length)parts.push('NO '+c.omit.map(i=>(toneNames[i]??'tone').toUpperCase()).join(' + '));
   if(c.add?.length)parts.push('+ '+c.add.map(x=>(toneNames[x.tone]??'tone').toUpperCase()+(x.oct>0?' ↑':' ↓')).join(' '));
  }
  return parts.join(' · ');
 };
 const owner=`SEQ ${selected+1} · ${seqInfo.label.toUpperCase()}`;
 const placedName=placedChord?(progressionAt(placedChord.start)?.name??noteName(degreeToMidi(key,placedChord.root))):'';
 const lines=arrangement
  ?['ARRANGEMENT · SEQUENCERS × PROGRESSIONS',project?`${keyName} · ${project.bars} BARS · ${bpm} BPM`:'NO SONG YET',`ROW BUTTONS: ${(rowAction??'select').toUpperCase()} · TAP A PAD TO SELECT`]
  :deleteStack?[`${owner} · DELETE MODE`,`DELETE ${stackChoice} (${deleteStack.index+1}/${deleteStack.items.length+1})`,'PRESS DELETE TO CONFIRM · TAP THE PAD AGAIN FOR THE NEXT']
  :copyMode?[`${owner} · COPY`,copySource?'TAP DESTINATIONS':'SELECT A SOURCE','']
  :editSelection.length>1?[`${owner} · SELECTION`,`${editSelection.length} ITEMS`,'EDIT THEM TOGETHER ON THE LEVEL PAGE']
  :placedChord?[`${owner} · ${placedChord.sourceGroup?'GENERATED':'PLACED'} CHORD`,`${placedName} · ${when(placedChord.start)} · ${howLong(placedChord.len)}`,chordSummary(placedChord)]
  :firstItem?[`${owner} · NOTE`,`${noteName(firstItem.midi)} · ${when(firstItem.start)} · ${howLong(firstLen)}`,`VELOCITY ${Math.round((firstMeta?.vel??firstStep?.vel??.8)*100)}%`]
  :selectedChord?[`${owner} · PROGRESSION CHORD`,`${selectedChord.name} · BARS ${selectedSpan.start+1}–${selectedSpan.end}`,`${selectedChord.numeral?selectedChord.numeral+' · ':''}${keyName}`]
  :[`${owner} · ${chordMode?'CHORD':(pattern?.mode??'empty').toUpperCase()}`,project?`${keyName} · ${project.bars} BARS · ${bpm} BPM`:'NO SONG YET',editMode?'EDIT · TAP TO SELECT':playing?'PLAYING':'STOPPED'];
 const bar=project?Math.floor(col/project.stepsPerBar)+1:1;

 if(typeof window!=='undefined')window.__allBooked=booked.current;// notes booked per role, for checking the page
 const voices=<section className="gbox voicebox" aria-label="Sound generators"><header className="gb-head"><h2>Voices</h2><span className="gb-hint">which sound plays each sequencer</span></header>
  <div className="voice-grid">
   {SEQUENCERS.map((s,i)=>{const sound=sounds[s.role]??{synth:'calmbgm',name:''};return <div key={s.role} style={{border:`1px solid ${COLOURS[s.role]}55`,borderRadius:6,padding:8,display:'grid',gap:4,background:selected===i?'#ffffff10':'transparent'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b style={{color:COLOURS[s.role]}}>SEQ {i+1} · {s.label}</b>
     <span><label><input type="checkbox" checked={!!mutes[s.role]} onChange={e=>setMutes(m=>({...m,[s.role]:e.target.checked}))}/> mute</label>{' '}
     <label><input type="checkbox" checked={!!solos[s.role]} onChange={e=>setSolos(m=>({...m,[s.role]:e.target.checked}))}/> solo</label></span></div>
    {s.role==='perc'?<small>Scene drum kit</small>:<><select aria-label={`${s.label} sound generator`} value={sound.synth} disabled={!started||busy} onChange={e=>chooseSound(s.role,e.target.value)}>{synthChoices().map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
    {sound.synth==='calmbgm'
     ?<select aria-label={`${s.label} preset`} value={sound.name} disabled={!started||busy} onChange={e=>chooseSound(s.role,synthForPreset(e.target.value)??'calmbgm',e.target.value)}>
       {!Object.values(PRESET_CATEGORIES).some(c=>sound.name in c)&&<option value={sound.name}>{sound.name||'the scene\'s voice'}</option>}
       {Object.entries(PRESET_CATEGORIES).map(([cat,list])=><optgroup key={cat} label={cat}>{Object.keys(list).filter(n=>!list[n].wasmVoice).map(n=><option key={n} value={n}>{n}</option>)}</optgroup>)}
      </select>
     :<select aria-label={`${s.label} patch`} value={sound.name} disabled={!started||busy} onChange={e=>chooseSound(s.role,sound.synth,e.target.value)}>
       {!patchesOf(sound.synth).some(p=>p.name===sound.name)&&<option value={sound.name}>{sound.name}</option>}
       {patchesOf(sound.synth).map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select>}
    <span className="voice-tools">
     <button type="button" aria-pressed={!!wins['synth:'+s.role]} disabled={sound.synth==='calmbgm'&&!synthForPreset(sound.name)} title={sound.synth==='calmbgm'?(synthForPreset(sound.name)?'Play this sound through its synth, to edit it':'Choose a synth to open its panel'):'Open this synth in a window'} onClick={()=>{if(sound.synth==='calmbgm'){chooseSound(s.role,synthForPreset(sound.name),sound.name).then(()=>setWins(w=>({...w,['synth:'+s.role]:true})));}else toggleWin('synth:'+s.role);}}>Synth</button>
     <button type="button" aria-pressed={!!wins['fx:'+s.role]} disabled={!started} title="This voice's effects chain" onClick={()=>toggleWin('fx:'+s.role)}>Effects</button>
    </span>
    </>}
   </div>;})}
  </div>
  </section>;
 const showKeys=setup.keys!=='hide';
 // the keyboard's scale and chords are this page's song (its key and scale, the chords of the progression open) unless "My own" is chosen
 const songContext=useMemo(()=>{
  try{
   const base=key?buildContext({tonic:key.tonic,mode:key.scaleId,progression:0}):recalledContext();
   if(!project)return base;
   const part=progressionsOf(project)[progression]??progressionsOf(project)[0];
   const chords=project.chords.filter(c=>c.bar>=part.startBar&&c.bar<part.startBar+part.bars&&Array.isArray(c.pitchClasses)).slice(0,4).map(c=>({name:c.name,numeral:c.numeral,pitchClasses:c.pitchClasses}));
   return chords.length?{...base,chords}:base;
  }catch{return recalledContext();}
 },[key,project,progression]);
 const context=useMemo(()=>audition.follow?songContext:buildContext(audition),[audition,songContext]);
 contextRef.current=context;
 // the generator box shows and sets the sequencers' song: its key and scale, the chords of the progression open, the tempo and meter
 const generatorSettings=host.current?.g.settings;
 const seqState=useMemo(()=>{
  if(!project||!key||!generatorSettings)return undefined;
  const part=progressionsOf(project)[progression]??progressionsOf(project)[0],list=project.chords.filter(c=>c.bar>=part.startBar&&c.bar<part.startBar+part.bars);
  return {tonic:key.tonic,mode:key.scaleId,progression:generatorSettings.progression,barsPerChord:generatorSettings.barsPerChord,bpm,meter:project.meter??generatorSettings.meter,
   generated:generatorSettings.progressionMode==='generated',
   chords:list.map((c,i)=>({name:c.name,numeral:c.numeral,bars:(list[i+1]?.bar??part.startBar+part.bars)-c.bar}))};
 },[project,key,progression,bpm,hostVersion]);// eslint-disable-line react-hooks/exhaustive-deps
 // a tempo change is only the tempo; anything else (the key, the scale, the progression, the meter) is a different plan, so the generator plans the song again with the same seed
 const changeGenerator=patch=>{
  const h=host.current;if(!h)return;
  if('bpm' in patch){setBpm(patch.bpm);return;}
  h.g.setMany(patch);newSong({seed:project?.seed});
 };
 return <div className="synth instrument all-instrument">
  <header className="synth-bar">
   <a className="back" href={import.meta.env.BASE_URL+'synths/'} aria-label="All synths">◂</a>
   <h1><span className="brand">All</span><small>sequencers and sound generators</small></h1>
   <label className="bar-scene">Scene <select value={sceneName} disabled={busy} onChange={e=>chooseScene(e.target.value)}>{SCENE_CATEGORIES.map(c=><optgroup key={c.id} label={c.label}>{sceneList.filter(s=>s.category===c.id).map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</optgroup>)}</select></label>
   <span className="patch-name" title={status}>{status}</span>
   {chordMode&&role!=='perc'&&<label>Chord overlap <select aria-label="Chord overlap" value={chordOverlap} onChange={e=>setChordOverlap(e.target.value)}><option value="replace">Replace in octave</option><option value="layer">Layer</option></select></label>}
   <span className="meter" aria-label={`${litNotes.length} notes sounding`}><b>{litNotes.length}</b></span>
   <button type="button" aria-pressed={scopeOn} onClick={toggleScope} title="Oscilloscope and spectrum of the mix">Scope</button>
   <button type="button" aria-pressed={showSetup} onClick={()=>setShowSetup(v=>!v)} aria-label="Setup" title="Setup: MIDI, the keybed and the computer keys">⚙</button>
   <button type="button" onClick={panic} title="Silence everything">Panic</button>
   <button type="button" onClick={()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});}} aria-label="Full screen">⛶</button>
   <button type="button" className="keys-button" aria-pressed={showKeys} onClick={()=>updateSetup('keys',showKeys?'hide':'show')} aria-label="On-screen keyboard" title="Show or hide the on-screen keyboard">🎹</button>
  </header>
  <Desk>
   <FloatBox id="generator" label="Generator" className="box-generator" home={{x:0,y:0}}><GeneratorBox seq={seqState} onSeq={changeGenerator} info={{status:playing?'PLAYING':'STOPPED'}} song={{count:progressionCount,choices:PROGRESSION_CHOICES,disabled:!started||busy,onCount:n=>{setProgressionCount(n);newSong({progressions:n});},onNew:()=>newSong(),onScene:()=>newSong({seed:host.current.settings.seed})}}/></FloatBox>
   <FloatBox id="voices" label="Voices" className="box-voices" home={{x:1840,y:1070}}>{voices}</FloatBox>
   <FloatBox id="ambience" label="Ambience" className="box-ambience" home={{x:834,y:0}}><AmbienceBox/></FloatBox>
   <FloatBox id="mixer" label="Mixer" className="box-mixer" home={{x:1420,y:0}}><ChannelMixer channels={SEQUENCERS} colours={COLOURS}/></FloatBox>
   <FloatBox id="sequencer" label="Sequencer" className="all-page box-sequencer" home={{x:0,y:557}}>
  <div className="drums"><div className="split" style={{'--rows':ROWS+1}}><section className="device device-seq" aria-label="Sequencer" style={{position:'relative'}}>
   <header className="device-head"><h2>Sequencer</h2><span>{project?`${seqInfo.label} · bar ${bar} of ${project.bars}${pattern?'':' · empty'}`:'start the orchestra'}</span></header>
   <div className="s8">
    <div className="s8-left">
     <SeqScreen accent={COLOURS[role]} page={screenPage} onPage={setScreenPage} pages={screenPages} lines={lines}/>
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
   </FloatBox>
   <div className="all-stage" aria-hidden="true"/>
   {SEQUENCERS.filter(x=>x.role!=='perc').map((x,i)=>(wins['synth:'+x.role]||wins['fx:'+x.role])&&<VoiceWindow key={x.role} role={x.role} index={i} host={host.current} version={voiceVersion} fx={!!wins['fx:'+x.role]}
    onChoose={chooseSound} onEdit={editVoice} onEditNative={editNativeVoice} onEditFx={editVoiceFx} onCloseFx={()=>setWins(w=>({...w,['fx:'+x.role]:false,['synth:'+x.role]:true}))}/>)}
   {scopeOn&&<Scope engine={scopeEngine} audio={awake?'on':'off'} onClose={toggleScope} keyHz={()=>litNotes.length?440*2**((litNotes[litNotes.length-1]-69)/12):0}/>}
   {showSetup&&<SetupPopover midi={midi} setup={setup} updateSetup={updateSetup} connectMidi={connectMidi} audio={{state:awake?'on':'off',message:'Audio runs when the song plays or a key is pressed.'}} start={()=>host.current?.wake().then(()=>setAwake(true))} onClose={()=>setShowSetup(false)}/>}
   <footer className="perform">
    {showKeys&&<StageKeys drag={keysDrag} size={setup.keysSize} controls={setup.keysControls} low={setup.keysLow} onLow={v=>updateSetup('keysLow',v)} onLayout={updateSetup} notes={[...new Set([...litNotes,...held])]} context={context} chord={chordPick}
     onDown={(k,n,v)=>down(k,n,mapVelocity(v??.75,CURVES[setup.velocity]??CURVES.normal))} onUp={k=>performer.up(k)}
     onMod={v=>performer.source('wheelMod',v)} left={<Ribbon vertical range={setup.ribbonRange} onBend={b=>performer.source('ribbon',b)}/>}
     right={<TouchPad onTouch={(pressure,mod)=>{performer.source('pad',pressure);performer.source('padMod',mod);}}/>}
     head={<>
      <span className="shelf-switch" role="radiogroup" aria-label="Voice the keyboard plays">
       {SEQUENCERS.filter(x=>x.role!=='perc').map(x=><button type="button" key={x.role} role="radio" aria-checked={voice===x.role} onClick={()=>{performer.releaseAll();setVoice(x.role);}}>{x.label}</button>)}
      </span>
      <AutoPlay playing={phrasePlaying} onPlay={playPhrase} onStop={()=>phrases.stop()}/>
      <ChordChips context={context} chordPick={chordPick} onChordPick={i=>setChordPick(p=>p===i?0:i)} audition={audition} onAudition={changeAudition} followLabel="This page’s song"/>
     </>}/>}
   </footer>
  </Desk>
 </div>;
}

function progressionsOf(project){
 return project.progressions?.length?project.progressions:[{startBar:0,bars:project.bars}];
}
