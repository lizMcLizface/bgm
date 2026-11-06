import React,{useEffect,useRef,useState} from 'react';
import SynthShell from '../ui/SynthShell';
import useDraggable from '../ui/useDraggable';
import {SYNTHS} from '../models';
import {useSequencer} from '../seq/useSequencer';
import ArrangementLoader,{loadBeatInto} from './DrumLibrary';
import ArrangementFile from './ArrangementButtons';
import ArrangerDevice from './ArrangerDevice';
import {readDrumLink,clearDrumLink} from './share';
import {BEATS,KITS,foldAccent,emptyPattern,validPattern,patternCommands,voiceColour,ACCENT_COLOUR,chainToSong} from './kits';
import useRackMoves from '../../seq/useRackMoves';
import {cleanMoves} from '../../seq/moves';
import MovesPanel from '../seq/MovesPanel';
import useModulation from '../../seq/useModulation';
import {cleanMod} from '../../seq/mod';
import ModPanel from '../seq/ModPanel';
import useCoreClock from '../../seq/useCoreClock';
import {DIVISIONS,DIRECTIONS,trackWindow,directedIndex} from '../../seq/core';
import {euclid,tile,randomRow,mutateRow,seeded,kitBar} from '../../seq/generate';
import {load,save} from '../storage';
import {DrumPicker,DrumMachineTop,DrumMachineVoices,DrumVoicePanel} from './DrumMachine';
import {DEFAULTS,CONDITIONS} from './StepEditor';
import SeqScreen from '../seq/SeqScreen';
import SettingsPop from '../seq/SettingsPop';
import {toPosition,fromPosition,formatValue} from '../params';
import {LETTERS,MAX_PATTERNS,MAX_STEPS,STEPS,PER_LAYER,LAYERS,layerOf,letterOf,patternId,patternName} from '../seq/bank';
import LaneGrid from '../seq/LaneGrid';
import {stepKey,parseKey,rowKeys,columnKeys,chooseKeys,describeSelection,commonValue} from '../seq/selection';
import {LANES,drumLaneWindow,maxOffset,revealRow,windowLabel} from '../seq/lanes';

const curPatternOf=bank=>bank.patterns[bank.current];
// A short mark on a lane's name when its track plays other than the pattern does: its own length, rate or direction
const ARROW={rev:'◂',ping:'↔',rand:'?'};
function badgeOf(bank,t){
 const play=bank.trackPlay?.[bank.current]?.[t]??{},own=bank.trackLengths?.[bank.current]?.[t];
 return [own,play.div,ARROW[play.dir]].filter(Boolean).join(' ');
}

// banks saved before songs had only a chain: show it as a song, which is now the one editor for the order
const withSong=b=>b&&b.chain?.length&&!b.song?.length?{...b,song:chainToSong(b.chain),songOn:true,songLoop:true}:b;

export function DrumPage({kit}){
 const synth=SYNTHS[kit.id];
 // each device can be moved by its grip and keeps its place
 const seqDrag=useDraggable(`synths:${kit.id}:seq-pos`),machineDrag=useDraggable(`synths:${kit.id}:machine-pos`),arrDrag=useDraggable(`synths:${kit.id}:arranger-pos`);
 const n=kit.tracks.length;
 const [shared]=useState(()=>readDrumLink(kit));
 // Mute and solo leave a voice out of what the engine (or the core) plays; the stored pattern is untouched.
 const [muted,setMuted]=useState(()=>new Set()),[solo,setSolo]=useState(()=>new Set());
 const silent=t=>solo.size?!solo.has(t):muted.has(t);
 const silentRef=useRef(silent);silentRef.current=silent;
 const seq=useSequencer({
  id:kit.id,empty:emptyPattern(kit),
  valid:validPattern(kit),initialBank:withSong(shared.bank),onEdit:clearDrumLink,
  count:MAX_PATTERNS,migrate:foldAccent(kit),patternCommands:(i,p)=>patternCommands(kit,i,p,t=>silentRef.current(t)),copyPattern:p=>p.map(r=>[...r]),tempoId:synth.params.BY_KEY.tempo.id,
 });
 const {bank}=seq;
 const [selected,setSelected]=useState(0);
 // eight lanes at a time: a window the knob above the voices slides over them (a kit with more voices scrolls); picking a voice scrolls it into view
 const [offset,setOffset]=useState(0),maxOff=maxOffset(n);
 const selectVoice=t=>{setSelected(t);setOffset(o=>revealRow(n,o,t));};
 // a pattern may be up to 64 steps; the grid shows sixteen of them, a window a knob slides a beat (four steps) at a time. While it plays the window follows
 // the playhead from page to page, until the knob is turned by hand (double-click the knob to follow again).
 const [col,setCol]=useState(0),[follow,setFollow]=useState(true);
 const patLen=bank.lengths[bank.current],maxCol=Math.max(0,Math.ceil(patLen/4)*4-STEPS),colEff=Math.min(col,maxCol);
 const windowRef=useRef({colEff:0,maxCol:0,follow:true});windowRef.current={colEff,maxCol,follow};

 const [muteMode,setMuteMode]=useState(false),[perfMode,setPerfMode]=useState(false),[colMode,setColMode]=useState(false),[fillEdit,setFillEdit]=useState(false);
 const [copyArmed,setCopyArmed]=useState(false),[block,setBlock]=useState(0);
 const [encPage,setEncPage]=useState('pattern');
 // the generator page: Euclid (pulses, rotation), random (density) or mutate (amount) over a cell of `cell` steps (0: the row's own length), applied to the selected rows
 const [gen,setGen]=useState({mode:0,pulses:4,density:.3,amount:.3,rot:0,cell:0,x:.3,y:.3,chaos:.1});
 const GEN_MODES=['EUCLID','RANDOM','MUTATE','KIT'];
 // The grid has two layers. Draw (the default): a tap on a pad adds or removes a note, and a new note comes up on the display. Edit: a tap
 // selects (Shift adds to the selection), a voice's button selects its whole row and a column's head its whole column, and the encoders then
 // edit everything selected together. Properties of a step are velocity, type, chance, ratchet, nudge, tune, decay, condition; accent
 // The Column key makes a tap select the pad's whole column, for every voice. Loudness is the step's velocity; a step's brightness shows it.
 const [editLayer,setEditLayer]=useState(false),[sel,setSel]=useState(()=>new Set()),[shiftHeld,setShiftHeld]=useState(false);
 const shiftRef=useRef(false),paint=useRef(null);
 const holdShift=on=>{shiftRef.current=on;setShiftHeld(on);};
 useEffect(()=>{
  const down=e=>{if(e.key==='Shift')holdShift(true);},up=e=>{if(e.key==='Shift')holdShift(false);},blur=()=>holdShift(false);
  window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
  return ()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
 },[]);
 // a pattern of its own: the selection belongs to the pattern it was made in
 useEffect(()=>{setSel(new Set());setCol(0);},[bank.current]);
 // Pattern mode shows all sixty-four patterns in place of the steps; the same four keys then copy, clear and load. Load takes a loop
 // from the library (beats.js) through the display: Style and Beat on the encoders, the key again to put it in the lit pattern.
 const [mode,setMode]=useState('steps'),[loading,setLoading]=useState(false),[loadCat,setLoadCat]=useState(0),[loadIdx,setLoadIdx]=useState(0);
 const beatCats=['All',...new Set(BEATS.map(b=>b.category))];
 const beatList=BEATS.filter(b=>loadCat===0||b.category===beatCats[loadCat]),beat=beatList[Math.min(loadIdx,beatList.length-1)];
 const pressPattern=()=>{setMuteMode(false);setPerfMode(false);setFillEdit(false);setMode(m=>m==='pattern'?'steps':'pattern');setLoading(false);setCopyArmed(false);};
 const pressLoad=(values,choose,current)=>{
  if(!loading){setLoading(true);setCopyArmed(false);return;}
  loadBeatInto(seq,kit,beat);choose({name:current,values:{...values,tempo:beat.bpm,swing:beat.swing}});setLoading(false);
 };
 // what a lane's little display says: the voice, the note it plays, and how its track plays when that is not the plain default
 const laneInfo=t=>{
  const own=bank.trackLengths?.[bank.current]?.[t],play=bank.trackPlay?.[bank.current]?.[t]??{};
  return {top:kit.tracks[t][2].toUpperCase(),bottom:['N'+(36+t),own&&own+'ST',play.div,ARROW[play.dir]].filter(Boolean).join(' ')};
 };
 // the four displays over the pads: beat numbers, or in pattern mode the pattern being edited, its name, its length and its tempo
 const rulerWords=()=>mode==='pattern'?[[patternName(bank.current),'PATTERN',''],[bank.names?.[bank.current]||'—','NAME',''],[bank.lengths[bank.current]+' ST','LENGTH',''],[bank.tempos[bank.current]?bank.tempos[bank.current]+' BPM':'GLOBAL','TEMPO','']]:[0,1,2,3].map(i=>{
  // beats of the visible window; a pattern of more than one bar numbers them bar.beat
  const beat=colEff/4+i;
  return patLen>STEPS?[`${(beat>>2)+1}.${(beat&3)+1}`,`STEP ${beat*4+1}`,beat*4>=patLen?'PAST END':'']:[String(i+1),'',''];
 });
 // how loud a lit step is, 0 to 1, for its brightness: its velocity (full when none is set)
 const levelOf=(t,s)=>bank.locks?.[bank.current]?.[t+':'+s]?.velocity??1;
 const pickPattern=id=>{if(copyArmed){seq.copyTo(id);setCopyArmed(false);}else seq.select(id);};

 // the selection: what is lit in it, which columns it touches, what it is
 const curPattern=curPatternOf(bank);
 const selSteps=[...sel].map(parseKey).filter(([t,s])=>t<n&&s<MAX_STEPS);
 const litSel=selSteps.filter(([t,s])=>curPattern[t][s]>0),selCols=[...new Set(selSteps.map(([,s])=>s))].sort((a,b)=>a-b);
 const described=describeSelection(sel,n,patLen),stepEdit=sel.size>0&&mode!=='pattern'&&!muteMode&&!perfMode;
 const selVoice=selSteps.length?selSteps[0][0]:selected;
 // the Track page edits the rows of the selection, or every row when nothing is selected
 const trackRows=stepEdit?[...new Set(selSteps.map(([t])=>t))].sort((a,b)=>a-b):Array.from({length:n},(_,i)=>i);
 const trackLabel=stepEdit?(trackRows.length===1?kit.tracks[trackRows[0]][2].toUpperCase():`${trackRows.length} ROWS`):'ALL ROWS';
 // the display always has four pages: Pattern, Track, Groove and Voice; a selection takes the first two for Step and Step 2 and moves Track to the third place; Load takes the first while loading
 const visible=[loading?'load':stepEdit?'step':'pattern',stepEdit?'step2':'track',stepEdit?'track':'groove','voice','gen'],shownPage=visible.includes(encPage)?encPage:visible[0];
 const shownPages=(values,change,beat)=>encoderPages(values,change,beat,beatCats).filter(p=>visible.includes(p.id));
 const screenLines=(values,beat)=>{
  const cur=bank.current;
  if(loading)return [`LOAD INTO ${patternName(cur)} · ${beat.category.toUpperCase()}`,beat.name.toUpperCase(),`${beat.bpm} BPM · PRESS LOAD AGAIN TO PUT IT IN`];
  const voice=kit.tracks[Math.min(selVoice,n-1)][2].toUpperCase();
  const what={step:`${voice} · STEP ${(described.s??0)+1}`,row:`${voice} · WHOLE ROW`,column:`COLUMN ${(described.s??0)+1} · ALL VOICES`,columns:`${described.count} COLUMNS · ALL VOICES`,rows:`${described.count} ROWS`,many:`${described.count} STEPS SELECTED`,none:''}[described.kind];
  return [`PATTERN ${patternName(cur)} · ${bank.lengths[cur]} STEPS · ${bank.tempos[cur]||Math.round(values.tempo)} BPM`,
   muteMode?'MUTE · TAP A ROW':perfMode?'PERF · TAP A PAD TO PLAY ITS VOICE':fillEdit?'FILL EDIT · EMPTY PAD: FILL ONLY · NOTE: NOT IN FILL':shownPage==='track'?`TRACK · ${trackLabel}`:shownPage==='gen'?`GENERATE · ${genRows.length===1?kit.tracks[genRows[0]][2].toUpperCase():genRows.length+' ROWS'}`:mode==='pattern'?(bank.names?.[cur]||'PATTERNS').toUpperCase():stepEdit?what:`${voice}${colMode?' · COLUMN':editLayer?' · EDIT':''}`,
   copyArmed?`COPY ${patternName(cur)} TO… TAP A PATTERN`:shownPage==='gen'?'TAP GEN AGAIN TO GENERATE':mode==='pattern'?'TAP A PATTERN':stepEdit&&litSel.length<sel.size?`${litSel.length} OF ${sel.size} HAVE NOTES`:colMode?'COLUMN · TAP A PAD TO SELECT ITS COLUMN':editLayer?'EDIT · TAP TO SELECT · SHIFT ADDS':(bank.names?.[cur]||bank.title||(seq.playing?`PLAYING ${patternName(seq.playingPattern)}`:'STOPPED')).toUpperCase()];
 };
 // The encoders' pages: the pattern, the track, the groove and the voice; and the selection's own (velocity, type, chance, ratchet; nudge, tune, decay, accent; condition)
 const encoderPages=(values,change,beat,beatCats)=>{
  const cur=bank.current,len=bank.lengths[cur],tempo=bank.tempos[cur],BY=synth.params.BY_KEY;
  const voice=Math.min(selVoice,n-1),have=litSel.length>0;
  const lockOf=([t,s])=>({...DEFAULTS,...(bank.locks?.[cur]?.[t+':'+s]??{})});
  const setLocks=patch=>seq.setLocks(litSel,patch);
  const lin=(label,name,min,max,steps,format)=>{
   const {value,mixed}=commonValue(litSel.map(st=>lockOf(st)[name]),DEFAULTS[name]);
   return {label,display:have?(mixed?'MIX':format(value)):'—',position:(value-min)/(max-min),disabled:!have,step:steps?1/steps:.02,
    onPosition:p=>{const v=min+p*(max-min),r=steps?Math.round(v):Math.round(v*100)/100;setLocks({[name]:r===DEFAULTS[name]?undefined:r});},onReset:()=>setLocks({[name]:undefined})};
  };
  const pct=v=>Math.round(v*100)+'%',signed=v=>(v>0?'+':'')+Math.round(v*100)+'%';
  const param=(key,label)=>({label,display:formatValue(BY[key],values[key]),position:toPosition(BY[key],values[key]),onPosition:p=>change(key,fromPosition(BY[key],p)),onReset:()=>change(key,BY[key].default),onAssign:()=>setAssigning(key),assigned:!!mod.assigns[key]});
  const type=commonValue(litSel.map(([t,s])=>curPattern[t][s]),1),cnd=commonValue(litSel.map(st=>lockOf(st).cond??''),'');
  const cond=Math.max(0,CONDITIONS.findIndex(([v])=>v===cnd.value)),loop=bank.trackLengths?.[cur]?.[voice]??0,play=bank.trackPlay?.[cur]?.[voice]??{};
  return [
   {id:'pattern',label:'Pattern',encoders:[
    {label:'Layer',display:String(layerOf(cur)+1),position:layerOf(cur)/(LAYERS-1),step:1/(LAYERS-1),onPosition:p=>seq.select(patternId(Math.round(p*(LAYERS-1)),letterOf(cur))),onReset:()=>seq.select(patternId(0,letterOf(cur)))},
    {label:'Pattern',display:LETTERS[letterOf(cur)],position:letterOf(cur)/(PER_LAYER-1),step:1/(PER_LAYER-1),onPosition:p=>seq.select(patternId(layerOf(cur),Math.round(p*(PER_LAYER-1)))),onReset:()=>seq.select(patternId(layerOf(cur),0))},
    {label:'Steps',display:String(len),position:(len-1)/(MAX_STEPS-1),step:1/(MAX_STEPS-1),onPosition:p=>seq.setLength(Math.round(1+p*(MAX_STEPS-1))),onReset:()=>seq.setLength(16)},
    {label:'Tempo',display:tempo?String(tempo):'global',position:tempo?(tempo-30)/270:0,onPosition:p=>seq.setTempo(p<.01?0:Math.round(30+p*270)),onReset:()=>seq.setTempo(0)},
    ]},
   {id:'step',label:'Step',encoders:[lin('Velocity','velocity',.05,1,0,pct),
    {label:'Type',display:have?(type.mixed?'MIX':type.value===2?'FLAM':'HIT'):'—',position:type.value===2?1:0,disabled:!have,step:1,onPosition:p=>setCells(litSel.map(([t,s])=>[t,s,p>=.5?2:1])),onReset:()=>setCells(litSel.map(([t,s])=>[t,s,1]))},
    lin('Chance','prob',0,1,0,pct),lin('Ratchet','ratchet',1,4,3,v=>'×'+v)]},
   {id:'step2',label:'Step 2',encoders:[lin('Nudge','nudge',-.5,.5,0,signed),lin('Tune','tune',-1,1,0,signed),lin('Decay','decay',-1,1,0,signed),
    {label:'When',display:have?(cnd.mixed?'MIX':CONDITIONS[cond][1].replace('every loop','always')):'—',position:cond/(CONDITIONS.length-1),disabled:!have,step:1/(CONDITIONS.length-1),onPosition:p=>setLocks({cond:CONDITIONS[Math.round(p*(CONDITIONS.length-1))][0]||undefined}),onReset:()=>setLocks({cond:undefined})}]},
   // the Track page edits the rows of the selection, or every row when nothing is selected; rows that differ read MIX
   {id:'track',label:'Track',encoders:(()=>{
    const playOf=t=>bank.trackPlay?.[cur]?.[t]??{};
    const lenC=commonValue(trackRows.map(t=>bank.trackLengths?.[cur]?.[t]??0),0),divC=commonValue(trackRows.map(t=>playOf(t).div??'1/16'),'1/16'),dirC=commonValue(trackRows.map(t=>playOf(t).dir??'fwd'),'fwd');
    const levelKeys=trackRows.map(t=>kit.tracks[t][0]+'Level'),lvC=commonValue(levelKeys.map(k=>values[k]),BY[levelKeys[0]].default);
    return [
     {label:'Length',display:lenC.mixed?'MIX':lenC.value?lenC.value+' st':'= pat',position:lenC.value/15,step:1/15,disabled:!core,onPosition:p=>seq.setTrackLengths(trackRows,Math.round(p*15)||null),onReset:()=>seq.setTrackLengths(trackRows,null)},
     {label:'Rate',display:divC.mixed?'MIX':divC.value,position:Math.max(0,DIVISIONS.findIndex(d=>d.id===divC.value))/(DIVISIONS.length-1),step:1/(DIVISIONS.length-1),disabled:!core,
      onPosition:p=>seq.setTrackPlays(trackRows,{div:DIVISIONS[Math.round(p*(DIVISIONS.length-1))].id}),onReset:()=>seq.setTrackPlays(trackRows,{div:undefined})},
     {label:'Direction',display:dirC.mixed?'MIX':{fwd:'FWD',rev:'REV',ping:'PING',rand:'RAND'}[dirC.value],position:DIRECTIONS.indexOf(dirC.value)/(DIRECTIONS.length-1),step:1/(DIRECTIONS.length-1),disabled:!core,
      onPosition:p=>seq.setTrackPlays(trackRows,{dir:DIRECTIONS[Math.round(p*(DIRECTIONS.length-1))]}),onReset:()=>seq.setTrackPlays(trackRows,{dir:undefined})},
     {label:'Level',display:lvC.mixed?'MIX':formatValue(BY[levelKeys[0]],lvC.value),position:toPosition(BY[levelKeys[0]],lvC.value),onPosition:p=>levelKeys.forEach(k=>change(k,fromPosition(BY[k],p))),onReset:()=>levelKeys.forEach(k=>change(k,BY[k].default))},
    ];
   })()},
   {id:'groove',label:'Groove',encoders:[param('swing','Swing'),param('flam','Flam'),param('tempo','Tempo'),param('master','Master')]},
   {id:'voice',label:'Voice',encoders:['Level','Tune','Decay','Pan'].map(f=>param(kit.tracks[voice][0]+f,f))},
   // Generate: Mode, its main value, Rotate (Euclid) and Cell (how many steps one pass covers; it repeats to fill the row); the key below applies it to the selected rows
   {id:'gen',label:'Gen',encoders:(()=>{
    const cellLen=gen.cell||len,set=patch=>setGen(g=>({...g,...patch}));
    const main=gen.mode===0?{label:'Pulses',display:String(Math.min(gen.pulses,cellLen)),position:Math.min(gen.pulses,cellLen)/cellLen,step:1/cellLen,onPosition:p=>set({pulses:Math.round(p*cellLen)}),onReset:()=>set({pulses:4})}
     :gen.mode===1?{label:'Density',display:pct(gen.density),position:gen.density,step:.02,onPosition:p=>set({density:Math.round(p*100)/100}),onReset:()=>set({density:.3})}
     :{label:'Amount',display:pct(gen.amount),position:gen.amount,step:.02,onPosition:p=>set({amount:Math.round(p*100)/100}),onReset:()=>set({amount:.3})};
    return [
     {label:'Mode',display:GEN_MODES[gen.mode],position:gen.mode/3,step:1/3,onPosition:p=>set({mode:Math.round(p*3)}),onReset:()=>set({mode:0})},
     gen.mode===3?{label:'Style',display:pct(gen.x),position:gen.x,step:.02,onPosition:p=>set({x:Math.round(p*100)/100}),onReset:()=>set({x:.3})}:main,
     gen.mode===3?{label:'Busy',display:pct(gen.y),position:gen.y,step:.02,onPosition:p=>set({y:Math.round(p*100)/100}),onReset:()=>set({y:.3})}:{label:'Rotate',display:gen.mode===0?String(gen.rot%cellLen):'—',position:gen.mode===0?(gen.rot%cellLen)/Math.max(1,cellLen-1):0,step:1/Math.max(1,cellLen-1),disabled:gen.mode!==0,onPosition:p=>set({rot:Math.round(p*(cellLen-1))}),onReset:()=>set({rot:0})},
     gen.mode===3?{label:'Chaos',display:pct(gen.chaos),position:gen.chaos,step:.02,onPosition:p=>set({chaos:Math.round(p*100)/100}),onReset:()=>set({chaos:.1})}:{label:'Cell',display:gen.mode===2?'—':gen.cell?String(gen.cell):'ROW',position:gen.cell/MAX_STEPS,step:1/MAX_STEPS,disabled:gen.mode===2,onPosition:p=>set({cell:Math.round(p*MAX_STEPS)}),onReset:()=>set({cell:0})},
    ];
   })()},
   ...(loading?[{id:'load',label:'Load',encoders:[
    {label:'Style',display:beatCats[loadCat],position:loadCat/(beatCats.length-1),step:1/(beatCats.length-1),onPosition:p=>{setLoadCat(Math.round(p*(beatCats.length-1)));setLoadIdx(0);},onReset:()=>{setLoadCat(0);setLoadIdx(0);}},
    {label:'Loop',display:beat.name,position:beatList.length>1?Math.min(loadIdx,beatList.length-1)/(beatList.length-1):0,step:beatList.length>1?1/(beatList.length-1):.1,disabled:beatList.length<2,onPosition:p=>setLoadIdx(Math.round(p*(beatList.length-1))),onReset:()=>setLoadIdx(0)},
    {label:'Tempo',display:String(beat.bpm),position:(beat.bpm-60)/160,disabled:true,onPosition:()=>{}},
    {label:'Swing',display:Math.round(beat.swing*100)+'%',position:(beat.swing-.5)/.25,disabled:true,onPosition:()=>{}}]}]:[]),
  ];
 };
 const fillRef=useRef(false),[filling,setFilling]=useState(false);
 const fill=on=>{fillRef.current=on;setFilling(on);};
 const setCells=changes=>{
  const b=seq.bankRef.current,pattern=b.patterns[b.current],todo=changes.filter(([t,s,v])=>pattern[t][s]!==v);
  if(!todo.length)return;
  seq.replacePattern(b.current,pattern.map((row,t)=>row.map((x,s)=>{const c=todo.find(([ct,cs])=>ct===t&&cs===s);return c?c[2]:x;})));
  if(b.current<PER_LAYER)seq.send(todo.filter(([t,s])=>s<STEPS&&(t===n||!silent(t))).map(([t,s,v])=>[1,b.current<<10|(t===n?16:t)<<5|s,v]));
 };
 const setCell=(t,s,v)=>setCells([[t,s,v]]);
 // Generate: fills the selected rows (the selected voice's row when nothing is selected) with a Euclidean, random or mutated row, as ordinary notes.
 // Each row is generated over its own length; a note that stays keeps its type and step values, one that goes takes its step values with it.
 const kitRows=['bd',kit.tracks.some(t=>t[0]==='sd')?'sd':'cp','ch'].map(k=>kit.tracks.findIndex(t=>t[0]===k));
 const genRows=gen.mode===3?kitRows.filter(t=>t>=0):selSteps.length?[...new Set(selSteps.map(([t])=>t))].sort((a,b)=>a-b):[Math.min(selected,n-1)];
 const generate=()=>{
  const b=seq.bankRef.current,cur=b.current,pattern=b.patterns[cur],random=seeded((Date.now()^(Math.random()*4294967296))>>>0),changes=[],dropped=[];
  const bar=gen.mode===3?kitBar(gen.x,gen.y,gen.chaos,undefined,random):null;
  for(const t of genRows){
   const L=Math.min(pattern[t].length,b.trackLengths?.[cur]?.[t]||b.lengths[cur]),old=pattern[t].slice(0,L),cell=Math.min(gen.cell||L,L);
   const row=bar?tile(bar[['kick','snare','hat'][kitRows.indexOf(t)]],L):gen.mode===0?tile(euclid(Math.min(gen.pulses,cell),cell,gen.rot),L):gen.mode===1?tile(randomRow(cell,gen.density,random),L):mutateRow(old,gen.amount,random);
   for(let s=0;s<L;s++){
    if(condAt(t,s)==='fixed')continue;
    const next=row[s]?(old[s]||1):0;
    if(next!==old[s])changes.push([t,s,next]);
    if(old[s]&&!next)dropped.push([t,s]);
   }
  }
  if(!changes.length)return;
  setCells(changes);
  if(dropped.length)seq.setLocks(dropped,Object.fromEntries(LOCK_NAMES.map(k=>[k,undefined])));
 };
 const flip=(set,setter,t)=>{const next=new Set(set);if(!next.delete(t))next.add(t);setter(next);};
 // what a tap means (see the grid's two layers above)
 const showStep=()=>setEncPage(p=>['step','step2'].includes(p)?p:'step');
 const chooseSel=(keys)=>{setSel(prev=>chooseKeys(prev,keys,shiftRef.current));showStep();};
 const litAt=(t,s)=>{const b=seq.bankRef.current;return b.patterns[b.current][t][s]>0;};
 const condAt=(t,s)=>{const b=seq.bankRef.current;return b.locks?.[b.current]?.[t+':'+s]?.cond;};
 // a note taken away takes its step values with it
 const LOCK_NAMES=['velocity','prob','ratchet','nudge','tune','decay','cond'];
 const clearStep=(t,s)=>seq.setLocks([[t,s]],Object.fromEntries(LOCK_NAMES.map(k=>[k,undefined])));
 const stepDown=(t,s)=>{
  if(muteMode){flip(muted,setMuted,t);return;}
  if(perfMode){pad(t);return;}
  if(colMode){chooseSel(columnKeys(s,n));return;}
  const key=stepKey(t,s);
  selectVoice(t);
  if(editLayer){if(!shiftRef.current&&sel.size===1&&sel.has(key))setSel(new Set());else chooseSel([key]);return;}
  const lit=litAt(t,s),cond=condAt(t,s);
  if(fillEdit){
   // Fill edit: an empty pad becomes a note that plays only in a fill, a note becomes one that does not play in a fill, and a tap on one of those undoes it
   if(!lit){setCell(t,s,1);seq.setLocks([[t,s]],{cond:'fill'});}
   else if(cond==='fill'){setCell(t,s,0);clearStep(t,s);}
   else if(cond==='not-fill')seq.setLocks([[t,s]],{cond:undefined});
   else seq.setLocks([[t,s]],{cond:'not-fill'});
   return;
  }
  if(!lit){paint.current=1;setCell(t,s,1);setSel(new Set([key]));showStep();}
  // a note that was fill-only or not-in-fill becomes an ordinary one that always plays
  else if(cond==='fill'||cond==='not-fill'){seq.setLocks([[t,s]],{cond:undefined});setSel(new Set([key]));showStep();}
  else{paint.current=0;setCell(t,s,0);clearStep(t,s);setSel(prev=>{const next=new Set(prev);next.delete(key);return next;});}
 };
 const stepOver=(t,s)=>{
  if(paint.current===null||muteMode||perfMode||editLayer||colMode||fillEdit)return;
  const lit=litAt(t,s);
  if(paint.current===1&&!lit){setCell(t,s,1);setSel(new Set([stepKey(t,s)]));showStep();}
  else if(paint.current===0&&lit){setCell(t,s,0);clearStep(t,s);}
 };
 // a voice's button plays it (in the edit layer it selects the row); the display beside it selects the voice for the Voice and Track pages
 const laneDown=t=>{
  if(muteMode){flip(muted,setMuted,t);return;}
  if(editLayer||colMode){selectVoice(t);chooseSel(rowKeys(t,patLen));return;}
  pad(t);
 };
 const laneSelect=t=>{
  if(muteMode){flip(muted,setMuted,t);return;}
  selectVoice(t);
  if(editLayer||colMode)chooseSel(rowKeys(t,patLen));else setSel(new Set());
 };
 // a changed mute or solo is sent to the engine as the patterns it should play
 useEffect(()=>{const b=seq.bankRef.current;seq.send(b.patterns.slice(0,PER_LAYER).flatMap((p,i)=>patternCommands(kit,i,p,t=>silentRef.current(t))));},[muted,solo]);// eslint-disable-line react-hooks/exhaustive-deps
 // a light on each voice when it plays: read from the playhead, so it follows either clock
 const machine=useRef(null);
 useEffect(()=>{
  let raf,last=-1;
  const frame=()=>{
   raf=requestAnimationFrame(frame);
   const head=seq.head.current,root=machine.current;if(!head||!root)return;
   const step=Number(head.style.getPropertyValue('--step'));
   if(step===last)return;
   last=step;if(!(step>=0))return;
   const w=windowRef.current;
   if(w.follow&&head.dataset.running==='1'&&(step<w.colEff||step>=w.colEff+STEPS)){head.style.setProperty('--off',Math.min(w.maxCol,Math.floor(step/STEPS)*STEPS));head.dataset.out='0';setCol(Math.min(w.maxCol,Math.floor(step/STEPS)*STEPS));}
   const b=seq.bankRef.current,pattern=b.patterns[b.current],count=Number(head.dataset.count??step),own=b.trackLengths?.[b.current]??{},play=b.trackPlay?.[b.current]??{},len=b.lengths[b.current];
   for(let t=0;t<n;t++){
    // the step each voice plays now, which depends on its own length, rate and direction
    const w=trackWindow(play[t],own[t],len,count,step,b.freeRun);if(w.end<=w.first)continue;
    const idx=directedIndex(w.end-1,w.L,w.dir,()=>0);
    if(pattern[t][idx]&&!silentRef.current(t)){const pop=(el,ms)=>{if(el){el.classList.remove('hit','pop');void el.offsetWidth;el.classList.add(el.dataset.track?'hit':'pop');setTimeout(()=>el.classList.remove('hit','pop'),ms);}};pop(root.querySelector(`[data-track="${t}"]`),140);pop(head.querySelector(`[data-cell="${t}-${idx}"]`),220);}
   }
  };
  raf=requestAnimationFrame(frame);
  return ()=>cancelAnimationFrame(raf);
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 const pad=t=>seq.live.current?.noteOn(900+t,36+t,.9);
 // Experimental: the sequencer core (src/seq) books the notes instead of the engine's own sequencer.
 const [core,setCore]=useState(()=>load('synths:core-clock',true)!==false);
 const valuesRef=useRef({});
 // Modulation (src/seq/mod.js): LFOs and step lanes assigned to knobs by a long press; they sit on top of the knobs' own values while the sequencer plays
 const [mod,setModState]=useState(()=>cleanMod(load(`synths:${kit.id}:mod`,null))),[assigning,setAssigning]=useState(null);
 const setMod=next=>{setModState(next);save(`synths:${kit.id}:mod`,next);};
 const setAssign=(key,a)=>{const assigns={...mod.assigns};if(a)assigns[key]=a;else delete assigns[key];setMod(cleanMod({...mod,assigns}));};
 // Effect moves (src/seq/moves.js): rack effects that sweep across a pattern, per pattern
 const [moves,setMovesState]=useState(()=>cleanMoves(load(`synths:${kit.id}:moves`,null))),rackRef=useRef({});
 const setMoves=(pattern,entry)=>{const next={...moves};if(entry)next[pattern]=entry;else delete next[pattern];const clean=cleanMoves(next);setMovesState(clean);save(`synths:${kit.id}:moves`,clean);};
 useRackMoves({live:()=>seq.live.current,head:seq.head,rack:()=>rackRef.current,entry:()=>moves[seq.playingPattern],length:()=>seq.bankRef.current.lengths[seq.playingPattern]||16,tempo:()=>valuesRef.current.tempo,running:seq.playing});
 useModulation({live:()=>seq.live.current,mod,params:synth.params,values:()=>valuesRef.current,tempo:()=>valuesRef.current.tempo,running:seq.playing});
 const clock=useCoreClock({seq,kit,values:()=>valuesRef.current,enabled:core,silent:t=>silentRef.current(t),fill:()=>fillRef.current});
 const chooseClock=on=>{if(seq.playing)seq.togglePlay();save('synths:core-clock',on);setCore(on);};

 // Transport: the core clock plays, pauses (keeping the place), stops (forgetting it), steps one step at a time and jumps to a block or pattern;
 // the engine's own clock (core off) plays, pauses and stops.
 const [enginePaused,setEnginePaused]=useState(false);
 const engineTransport={playing:seq.playing,paused:enginePaused,
  play:()=>{if(seq.playing)return;seq.send([[0,1,0]]);setEnginePaused(false);},
  pause:()=>{if(enginePaused){seq.send([[0,1,0]]);setEnginePaused(false);}else if(seq.playing){seq.send([[0,0,0]]);setEnginePaused(true);}},
  stop:()=>{seq.send([[0,0,0],[6,0,0]]);setEnginePaused(false);},stepBy:()=>{},gotoBlock:()=>{},gotoPattern:()=>{},core:false};
 const coreTransport=sc=>({playing:seq.playing&&clock.scope===sc,paused:clock.paused&&clock.scope===sc,play:()=>clock.play(sc),pause:()=>(clock.paused?clock.resume():clock.pause()),stop:()=>clock.stop(sc),stepBy:clock.stepBy,gotoBlock:clock.gotoBlock,gotoPattern:clock.gotoPattern,core:true});
 // the sequencer plays and stops the pattern being edited (the song keeps its place); the arranger plays the song and stops it back to the start
 const transport=core?coreTransport('pattern'):engineTransport,arrTransport=core?coreTransport('song'):engineTransport;
 // previous / next: the song's block when the song is on, otherwise the pattern; the pattern being edited follows
 const jump=d=>{
  const b=seq.bankRef.current,song=b.song??[];
  if(b.songOn&&song.length){const next=(Math.min(block,song.length-1)+d+song.length)%song.length;setBlock(next);seq.select(song[next].p);transport.gotoBlock(next);}
  else{const id=(b.current+d+MAX_PATTERNS)%MAX_PATTERNS;seq.select(id);transport.gotoPattern(id);}
 };
 return <SynthShell synth={synth} compactRack keyboard={false} className={'drums '+kit.id} panelClassName="complete seq" soundsInDevice picker={DrumPicker} initialPatch={shared.patch} headerExtras={props=><ArrangementFile {...props} kit={kit} synth={synth} seq={seq}/>} onEngine={seq.onEngine} onStats={seq.onStats} onMidiRealtime={core?undefined:seq.onMidiRealtime}>
  {({values,change,choose,current,soundBar,rack})=>{
   valuesRef.current=values;rackRef.current=rack;
   // Two devices side by side, as on a desk: the sequencer sends notes, the drum machine plays them.
   return <div className="split" key="split" style={{'--rows':LANES+1}}>
    <section className="device device-seq" aria-label="Sequencer" ref={seqDrag.ref} style={seqDrag.style}>
     <div className="grip device-grip" {...seqDrag.handle} role="presentation"><i/></div>
     <header className="device-head"><h2>Sequencer</h2><span>{core?'sequencer core · timed notes':'built-in clock'}</span><span className="device-out">notes → {kit.name}</span><SettingsPop>
      <label className="inline toggle" title="Follow an external MIDI clock, start and stop (from a drum machine, DAW or keyboard)"><input type="checkbox" checked={seq.sync.on} onChange={e=>seq.setSync(e.target.checked)}/> MIDI clock{seq.sync.on&&<em>{seq.sync.bpm?` ${seq.sync.bpm} bpm`:' waiting…'}</em>}</label>
      <label className="inline toggle" title="Experimental: the sequencer core books timed notes on the audio clock instead of the engine's own sequencer. Accent is approximated."><input type="checkbox" checked={core} onChange={e=>chooseClock(e.target.checked)}/> Core clock <em>for step edits, fills, loops</em></label>
      <label className="inline toggle" title="Rows with their own length start again with the pattern, so every row meets at the bar. Switch this on to let them run past the bar and drift against each other, a polymeter."><input type="checkbox" checked={!!bank.freeRun} onChange={e=>seq.setFreeRun(e.target.checked)}/> Rows run free <em>past the bar</em></label>
      {shared.error&&<span className="drum-link-error" role="alert">{shared.error}</span>}
     </SettingsPop></header>
     <div className="s8">
      <div className="s8-left">
       <SeqScreen accent={voiceColour(kit.tracks[Math.min(selVoice,n-1)][0],kit.id)} page={shownPage} onPage={setEncPage} pages={shownPages(values,change,beat)} lines={screenLines(values,beat)} actions={{gen:{title:'Tap again: fill the selected rows (or the selected voice) with a new row from these settings; each tap is a new one for Random and Mutate',onClick:generate}}}/>
       {assigning&&synth.params.BY_KEY[assigning]&&<ModPanel paramLabel={synth.params.BY_KEY[assigning].label} assign={mod.assigns[assigning]} mod={mod} onAssign={a=>setAssign(assigning,a)} onMod={next=>setMod(cleanMod(next))} onClose={()=>setAssigning(null)}/>}
       <details className="seq-moves-box"><summary>Effect moves{moves[bank.current]?' ·  on':''}</summary><MovesPanel title={`While ${patternName(bank.current)} plays`} entry={moves[bank.current]} onChange={e=>setMoves(bank.current,e)}/></details>
       <div className="s8-transport" role="group" aria-label="Transport">
        <button type="button" className={'tp play'+(transport.playing?' on':'')} aria-pressed={transport.playing} onClick={transport.play} title="Play"><b>▶</b><small>Play</small></button>
        <button type="button" className={'tp'+(transport.paused?' on':'')} aria-pressed={transport.paused} onClick={transport.pause} title="Pause here; play goes on from this place" disabled={!transport.playing&&!transport.paused}><b>⏸</b><small>Pause</small></button>
        <button type="button" className="tp" onClick={transport.stop} title="Stop and go back to the start"><b>■</b><small>Stop</small></button>
        <button type="button" className={'tp'+(!bank.linear?' on':'')} aria-pressed={!bank.linear} disabled={!core} onClick={()=>seq.setLinear(!bank.linear)} title={bank.linear?'Playing on through the patterns that have notes. Tap to stay on this pattern.':'Staying on this pattern. Tap to go on through the patterns that have notes.'}><b>⟲</b><small>Loop</small></button>
       </div>
       <div className="s8-keys" role="group" aria-label="Sequencer keys">
        {mode==='pattern'?<>
         <button type="button" className="on" aria-pressed="true" onClick={pressPattern} title="Back to the steps"><b>Pattern</b></button>
         <button type="button" className={copyArmed?'on':''} aria-pressed={copyArmed} onClick={()=>{setCopyArmed(v=>!v);setLoading(false);}} title="Copy the lit pattern, then tap where it goes"><b>{copyArmed?'Copy to…':'Copy'}</b></button>
         <button type="button" onClick={()=>{seq.clear();setCopyArmed(false);}} title="Empty the lit pattern"><b>Clear</b></button>
         <button type="button" className={loading?'on':''} aria-pressed={loading} onClick={()=>pressLoad(values,choose,current)} title={loading?'Put the chosen loop into the lit pattern':'Choose a loop from memory for the lit pattern'}><b>{loading?'Load ✓':'Load'}</b></button>
        </>:<>
         <button type="button" onClick={pressPattern} title="Show all sixty-four patterns"><small>Show</small><b>Pattern</b></button>
         <button type="button" className={muteMode?'on':''} aria-pressed={muteMode} onClick={()=>{setMuteMode(v=>!v);setPerfMode(false);setEditLayer(false);setColMode(false);setFillEdit(false);setSel(new Set());}} title="Mute mode: tap a row to mute or unmute that voice"><small>Voices</small><b>Mute</b></button>
         <button type="button" className={perfMode?'on':''} aria-pressed={perfMode} onClick={()=>{setPerfMode(v=>!v);setMuteMode(false);setEditLayer(false);setColMode(false);setFillEdit(false);setSel(new Set());}} title="Perform: tap any pad to play its voice, to play along or to drum on the grid. A voice's button always plays it."><small>Play</small><b>Perf</b></button>
         <button type="button" className={'fill-btn'+(filling?' on':'')} aria-pressed={filling} disabled={!core} title="Hold to play the fill: the steps marked fill-only join in and the ones marked not-in-fill drop out" onPointerDown={()=>fill(true)} onPointerUp={()=>fill(false)} onPointerLeave={()=>fill(false)} onPointerCancel={()=>fill(false)} onKeyDown={e=>{if(e.key===' '||e.key==='Enter')fill(true);}} onKeyUp={()=>fill(false)}><small>Hold</small><b>Fill</b></button>
        </>}
       </div>
       <div className="s8-keys" role="group" aria-label="More sequencer keys">
        {mode==='pattern'?<><span/><span/><span/><span/></>:<>
         <button type="button" className={editLayer?'on':''} aria-pressed={editLayer} onClick={()=>{setEditLayer(v=>!v);setColMode(false);setMuteMode(false);setPerfMode(false);setFillEdit(false);setSel(new Set());}} title="Edit layer: tap pads to select them and a voice's button or display to select its row. The encoders then edit the whole selection. Tap again to go back to drawing."><small>Layer</small><b>Edit</b></button>
         <button type="button" className={colMode?'on':''} aria-pressed={colMode} onClick={()=>{setColMode(v=>!v);setEditLayer(false);setMuteMode(false);setPerfMode(false);setFillEdit(false);setSel(new Set());}} title="Column select: tap any pad to select its whole column, for every voice. Shift adds more columns."><small>Select</small><b>Column</b></button>
         <button type="button" className={shiftHeld?'on':''} aria-pressed={shiftHeld} onPointerDown={()=>holdShift(true)} onPointerUp={()=>holdShift(false)} onPointerLeave={()=>holdShift(false)} onPointerCancel={()=>holdShift(false)} title="Hold while selecting to add to the selection (the Shift key does the same)"><small>Hold</small><b>Shift</b></button>
         <button type="button" className={fillEdit?'on':''} aria-pressed={fillEdit} onClick={()=>{setFillEdit(v=>!v);setEditLayer(false);setColMode(false);setMuteMode(false);setPerfMode(false);setSel(new Set());}} title="Fill edit: tap an empty pad for a note that plays only in a fill; tap a note for one that does not play in a fill; tap either again to undo it."><small>Layer</small><b>Fill edit</b></button>
        </>}
       </div>
      </div>
      <div className="s8-right">
       <LaneGrid lanes={drumLaneWindow(kit,offset).map(l=>l&&{...l,...laneInfo(l.index)})} pattern={curPattern} length={bank.lengths[bank.current]} offset={colEff} pages={{label:'Page',display:maxCol?(follow&&seq.playing?'FOLLOW':`${colEff+1}–${colEff+STEPS}`):'1–16',position:maxCol?colEff/maxCol:0,step:maxCol?4/maxCol:.1,disabled:!maxCol,onPosition:p=>{setFollow(false);setCol(Math.round((p*maxCol)/4)*4);},onReset:()=>{setFollow(true);setCol(0);}}} selected={selected} headRef={seq.head} locks={bank.locks?.[bank.current]} trackLengths={bank.trackLengths?.[bank.current]} colour={l=>voiceColour(l.key,kit.id)} level={levelOf}
        selection={mode==='pattern'?null:sel} onStepDown={stepDown} onStepOver={stepOver} onLaneDown={laneDown} onLaneSelect={laneSelect} filling={filling} scroll={{label:'Voices',display:windowLabel(n,offset),position:maxOff?offset/maxOff:0,step:maxOff?1/maxOff:.1,disabled:!maxOff,onPosition:p=>setOffset(Math.round(p*maxOff)),onReset:()=>setOffset(0),above:offset,below:Math.max(0,n-LANES-offset)}} onPaintEnd={()=>{paint.current=null;}}
        ruler={rulerWords()} muting={muteMode&&mode!=='pattern'} silent={silent} patternMode={mode==='pattern'?{bank,playing:seq.playing,playingPattern:seq.playingPattern,armed:copyArmed,song:clock.scope==='song'&&(bank.songOn||bank.chain.length>0),onPick:pickPattern}:null}/>
      </div>
     </div>
    </section>
    <section className="device device-machine" ref={el=>{machine.current=el;machineDrag.ref.current=el;}} style={machineDrag.style} aria-label={kit.name+' drum machine'}>
     <div className="grip device-grip" {...machineDrag.handle} role="presentation"><i/></div>
     <header className="device-head"><h2>{kit.name} drum machine</h2><span>{kit.subtitle}</span><div className="device-sounds">{soundBar}</div></header>
     <DrumMachineTop kit={kit} synth={synth} values={values} change={change}/>
     <div className="dm-lower">
      <DrumMachineVoices kit={kit} synth={synth} values={values} change={change} selected={selected} onSelect={selectVoice} onPad={pad} muted={muted} solo={solo} silent={silent} onMute={t=>flip(muted,setMuted,t)} onSolo={t=>flip(solo,setSolo,t)}/>
      <DrumVoicePanel kit={kit} synth={synth} values={values} change={change} selected={selected}/>
     </div>
    </section>
    <ArrangerDevice transport={arrTransport} jump={jump} loader={<ArrangementLoader kit={kit} seq={seq} choose={choose} values={values} current={current}/>} seq={seq} core={core} block={block} onBlock={setBlock} drag={arrDrag} accent={voiceColour(kit.tracks[Math.min(selected,n-1)][0],kit.id)} file={null}/>
   </div>;
  }}
 </SynthShell>;
}
export const Tr808Page=()=><DrumPage kit={KITS.tr808}/>;
export const Tr909Page=()=><DrumPage kit={KITS.tr909}/>;
export const Tr606Page=()=><DrumPage kit={KITS.tr606}/>;
export const Tr707Page=()=><DrumPage kit={KITS.tr707}/>;
