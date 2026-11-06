import React,{useEffect,useMemo,useRef,useState} from 'react';
import {BROWSABLE_SCENES,SCENE_CATEGORIES} from '../../app/scenes';
import {TONIC_NAMES} from '../../app/theory';
import {createScheduler} from '../../seq/scheduler';
import {projectStepEvents} from '../../seq/notes';
import {degreeToMidi} from '../../seq/harmony';
import {noteName} from '../../labs/Piano';
import SeqScreen from '../seq/SeqScreen';
import LaneGrid from '../seq/LaneGrid';
import {movePlayhead} from '../seq/playhead';
import {createHost,SEQUENCERS,synthChoices,patchesOf} from './host';
import {load} from '../storage';
import {useSaved} from '../useSaved';
import '../drums/drums.css';

// /synths/all: the sequencers and the sound generators (docs/SEQUENCER_SYSTEM_PLAN.md). The song comes from the front page's own generator (a scene's settings, its progression,
// voicings and lines), captured as patterns the sequencers hold; the sound generators are the generator's role instruments, loaded as presets (the scene's voices, or a patch of
// any classic or DIY synth). The sequencers play and edit the patterns on those instruments.
const ROWS=8,STEPS=16;
const COLOURS={lead:'#f2a33a',counter:'#e07a5f',rhythm:'#c98bdb',pad:'#5fc1c9',bass:'#7bd389'};
const BAR_CHOICES=[8,16,32];
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
// where the player left off: the scene, the song (every sequencer's pattern), the tempo, which sequencer was open, the mutes and the sound generators
const STORE='synths:all:state';
const readStored=()=>{
 const s=load(STORE,null);
 if(!s||typeof s!=='object')return {};
 const p=s.project;
 const project=p&&Number.isFinite(p.bars)&&Number.isFinite(p.stepsPerBar)&&p.key&&p.patterns&&typeof p.patterns==='object'?p:null;
 return {scene:typeof s.scene==='string'?s.scene:null,bars:BAR_CHOICES.includes(s.bars)?s.bars:null,bpm:Number.isFinite(s.bpm)?clamp(Math.round(s.bpm),50,200):null,
  selected:Number.isInteger(s.selected)&&s.selected>=0&&s.selected<SEQUENCERS.length?s.selected:null,mutes:s.mutes&&typeof s.mutes==='object'?s.mutes:null,
  sounds:s.sounds&&typeof s.sounds==='object'?s.sounds:null,project};
};

const SYNTHS_BY_ID=id=>synthChoices().some(c=>c.id===id);

export default function AllPage(){
 const sceneList=BROWSABLE_SCENES;
 const [stored]=useState(readStored);
 const [sceneName,setSceneName]=useState(()=>sceneList.find(s=>s.name===stored.scene)?.name??sceneList.find(s=>/lofi|rain/i.test(s.name))?.name??sceneList[0].name);
 const scene=useMemo(()=>sceneList.find(s=>s.name===sceneName)??sceneList[0],[sceneName,sceneList]);
 const [status,setStatus]=useState('Tap Start to wake the orchestra'),[started,setStarted]=useState(false),[busy,setBusy]=useState(false);
 const [bars,setBars]=useState(stored.bars??16),[project,setProject]=useState(null),[playing,setPlaying]=useState(false);
 const [selected,setSelected]=useState(stored.selected??3);          // the sequencer being edited (an index of SEQUENCERS)
 const [sounds,setSounds]=useState({}),[mutes,setMutes]=useState(stored.mutes??{});
 const [viewTop,setViewTop]=useState({}),[col,setCol]=useState(0),[bpm,setBpm]=useState(stored.bpm??90);
 const booked=useRef({}),host=useRef(null),scheduler=useRef(null),head=useRef(null),timers=useRef(new Set()),projectRef=useRef(null),bpmRef=useRef(90),mutesRef=useRef({});
 projectRef.current=project;bpmRef.current=bpm;mutesRef.current=mutes;

 const seqInfo=SEQUENCERS[selected],role=seqInfo.role;
 const pattern=project?.patterns[role];

 async function start(){
  if(started||busy)return;
  setBusy(true);setStatus('Waking the orchestra…');
  try{
   const h=createHost(scene);
   host.current=h;
   await h.wake();
   h.applySceneVoices(scene);
   setStarted(true);
   // the song the player left, when it was for this scene; otherwise the generator plans one
   const back=stored.project&&stored.scene===scene.name?stored.project:null;
   const song=back??h.capture({bars});
   setProject(song);setBpm(back&&stored.bpm?stored.bpm:Math.round(song.bpm));if(back)setBars(song.bars);
   setSounds(Object.fromEntries(SEQUENCERS.map(s=>[s.role,{synth:'calmbgm',name:h.loaded[s.role]?.name??''}])));
   setStatus(back?`${scene.name} · back where you left off`:`${scene.name} · ${song.chords.length} chords in ${song.bars} bars`);
   // the sound generators the player had chosen
   if(back)for(const s of SEQUENCERS){
    const want=stored.sounds?.[s.role];
    if(!want||want.synth==='calmbgm'||!SYNTHS_BY_ID(want.synth))continue;
    try{const got=await h.setSound(s.role,{synth:want.synth,name:want.name});setSounds(x=>({...x,[s.role]:{synth:want.synth,name:got.name}}));}catch(error){console.error(error);}
   }
  }catch(error){console.error(error);setStatus(error.message);}finally{setBusy(false);}
 }
 // a new song: the generator plans another one for the same settings (new seed) and the sequencers take it
 function newSong(extra={}){
  const h=host.current;if(!h)return;
  const seed=extra.seed??Math.floor(Math.random()*2**31),n=extra.bars??bars;
  const song=h.capture({bars:n,seed});
  setProject(song);setBpm(Math.round(song.bpm));setCol(0);setViewTop({});
  setStatus(`${scene.name} · seed ${seed} · ${song.chords.map(c=>c.name).slice(0,6).join(' ')}…`);
 }
 async function chooseScene(name){
  setSceneName(name);
  if(!host.current)return;
  const next=sceneList.find(s=>s.name===name);
  host.current.dispose();
  setBusy(true);
  try{
   const h=createHost(next);host.current=h;await h.wake();h.applySceneVoices(next);
   const song=h.capture({bars});setProject(song);setBpm(Math.round(song.bpm));setSounds(Object.fromEntries(SEQUENCERS.map(s=>[s.role,{synth:'calmbgm',name:h.loaded[s.role]?.name??''}])));setStatus(`${next.name}`);
  }finally{setBusy(false);}
 }
 async function chooseSound(r,synth,name){
  const h=host.current;if(!h)return;
  setSounds(s=>({...s,[r]:{synth,name:name??s[r]?.name??''}}));
  setBusy(true);setStatus(`Loading ${synth} for ${r}…`);
  try{const got=await h.setSound(r,{synth,name});setSounds(s=>({...s,[r]:{synth,name:got.name}}));setStatus(`${r}: ${synth==='calmbgm'?'calmbgm':synth} · ${got.name}`);}catch(error){console.error(error);setStatus(error.message);}finally{setBusy(false);}
 }

 useSaved(STORE,{scene:sceneName,bars,bpm,selected,mutes,sounds,project},{skip:()=>!started||!project});

 // playback: the sequencer core books every sequencer's notes on the audio clock, and they sound on the generator's role instruments
 useEffect(()=>{
  if(!started)return undefined;
  const h=host.current;
  const bank=()=>{const p=projectRef.current;return {patterns:[p],lengths:[p.bars*p.stepsPerBar],tempos:[0],chain:[],current:0};};
  const sched=createScheduler({
   now:()=>h.context.currentTime,
   bank,
   pattern:()=>({key:projectRef.current.key,leader:-1,sequencers:SEQUENCERS.map(s=>({pattern:projectRef.current.patterns[s.role],mute:mutesRef.current[s.role]}))}),
   events:(p,step,c)=>projectStepEvents(p,step,c),
   tempo:()=>bpmRef.current,swing:()=>0.5,flam:()=>0.5,
   emit:events=>events.forEach(e=>{const r=SEQUENCERS[e.track].role;h.note(r,e.note,e.time,e.duration,e.velocity);booked.current[r]=(booked.current[r]||0)+1;}),
   onStep:({step,time})=>{
    const wait=Math.max(0,(time-h.context.currentTime+(h.g.AC.outputLatency||0))*1000);
    const id=setTimeout(()=>{timers.current.delete(id);movePlayhead(head.current,{running:true,step});},wait);
    timers.current.add(id);
   },
  });
  scheduler.current=sched;
  return ()=>{sched.stop();scheduler.current=null;timers.current.forEach(clearTimeout);timers.current.clear();};
 },[started]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>()=>host.current?.dispose(),[]);
 const play=()=>{
  const s=scheduler.current;if(!s)return;
  if(playing){s.stop();timers.current.forEach(clearTimeout);timers.current.clear();movePlayhead(head.current,{running:false,step:0});Object.values(host.current.g.roles).forEach(r=>r.instrument?.silence?.());setPlaying(false);}
  else{host.current.wake().then(()=>{s.start(0.08,'pattern');setPlaying(true);});}
 };

 // the grid: eight rows of the scale, from degree `top` down; a pad is a note (degree) at a step
 const key=project?.key;
 const top=viewTop[role]??(pattern?centreDegree(pattern)+Math.floor(ROWS/2):7);
 const octave=pattern?.octave??0;
 const lanes=useMemo(()=>key?Array.from({length:ROWS},(_,slot)=>{
  const d=top-slot,midi=degreeToMidi(key,{d,o:octave});
  return {index:slot,key:'r'+slot,short:noteName(midi),long:noteName(midi),top:noteName(midi),bottom:`DEG ${((d%7)+7)%7+1}`,d};
 }):[],[key,top,octave]);
 const rows=useMemo(()=>lanes.map(l=>(pattern?.steps??[]).map(s=>{
  const hit=s?.n?.find(n=>n.d===l.d&&(n.o??0)===0);
  return hit?(hit.a?2:1):0;
 })),[lanes,pattern]);
 const length=project?project.bars*project.stepsPerBar:16,maxCol=Math.max(0,length-STEPS);
 const level=(row,s)=>pattern?.steps[s]?.vel??0.8;
 function edit(roleName,fn){setProject(p=>p&&{...p,patterns:{...p.patterns,[roleName]:fn(p.patterns[roleName]??{mode:'note',follow:'scale',length:p.bars*p.stepsPerBar,steps:Array(p.bars*p.stepsPerBar).fill(null)})}});}
 const toggle=(slot,s)=>{
  const d=top-slot;
  edit(role,p=>{
   const steps=[...p.steps],cur=steps[s],has=cur?.n?.some(n=>n.d===d&&(n.o??0)===0);
   const poly=p.mode==='poly';
   if(has){const left=cur.n.filter(n=>!(n.d===d&&(n.o??0)===0));steps[s]=left.length?{...cur,n:left}:null;}
   else if(poly&&cur)steps[s]={...cur,n:[...cur.n,{d,o:0,a:0}].sort((a,b)=>a.d-b.d)};
   else steps[s]={n:[{d,o:0,a:0}],vel:cur?.vel??0.8};
   return {...p,steps};
  });
  const midi=degreeToMidi(key,{d,o:octave});host.current?.note(role,midi,host.current.context.currentTime+0.02,0.4,0.8);
 };
 const setOctave=n=>edit(role,p=>({...p,octave:clamp(n,-3,3)}));

 const encoders=[
  {label:'Octave',display:octave>0?'+'+octave:String(octave),position:(octave+3)/6,step:1/6,disabled:!pattern,onPosition:p=>setOctave(Math.round(p*6)-3),onReset:()=>setOctave(0)},
  {label:'Gate',display:pattern?Math.round((pattern.gate??0.8)*100)+'%':'—',position:pattern?((pattern.gate??0.8)-0.1)/0.9:0,step:0.05,disabled:!pattern,onPosition:p=>edit(role,q=>({...q,gate:Math.round((0.1+p*0.9)*20)/20})),onReset:()=>edit(role,q=>({...q,gate:undefined}))},
  {label:'Tempo',display:String(bpm),position:(bpm-50)/150,step:0.01,onPosition:p=>setBpm(Math.round(50+p*150)),onReset:()=>setBpm(Math.round(project?.bpm??90))},
  {label:'Rows',display:`${noteName(degreeToMidi(key??{scale:[0,2,4,5,7,9,11],tonic:0},{d:top-ROWS+1,o:octave}))}–${noteName(degreeToMidi(key??{scale:[0,2,4,5,7,9,11],tonic:0},{d:top,o:octave}))}`,position:clamp((top+14)/42,0,1),step:1/42,onPosition:p=>setViewTop(v=>({...v,[role]:Math.round(p*42)-14})),onReset:()=>setViewTop(v=>{const n={...v};delete n[role];return n;})},
 ];
 const keyName=key?`${TONIC_NAMES[key.tonic]} ${key.scaleId.replace('-',' ')}`:'—';
 const lines=[`SEQ ${selected+1} · ${seqInfo.label.toUpperCase()} · ${(pattern?.mode??'empty').toUpperCase()}`,project?`${keyName} · ${project.bars} BARS · ${bpm} BPM`:'NO SONG YET',playing?'PLAYING':'STOPPED'];
 const bar=project?Math.floor(col/project.stepsPerBar)+1:1;

 if(typeof window!=='undefined')window.__allBooked=booked.current;// notes booked per role, for checking the page
 return <main className="all-page" style={{padding:'14px 16px',maxWidth:1500,margin:'0 auto',display:'grid',gap:12}}>
  <header style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}}>
   <h1 style={{margin:0,fontSize:20}}>All · sequencers and sound generators</h1>
   <span style={{opacity:.7,fontSize:13}}>{status}</span>
  </header>
  <section style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}} aria-label="Song">
   {!started&&<button type="button" disabled={busy} onClick={start}>Start</button>}
   <label>Scene <select value={sceneName} disabled={busy} onChange={e=>chooseScene(e.target.value)}>{SCENE_CATEGORIES.map(c=><optgroup key={c.id} label={c.label}>{sceneList.filter(s=>s.category===c.id).map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</optgroup>)}</select></label>
   <label>Bars <select value={bars} disabled={busy} onChange={e=>{const n=+e.target.value;setBars(n);if(started)newSong({bars:n});}}>{BAR_CHOICES.map(n=><option key={n} value={n}>{n}</option>)}</select></label>
   <button type="button" disabled={!started||busy} onClick={()=>newSong()} title="The generator plans another song for this scene's settings and the sequencers take it">New song</button>
   <button type="button" disabled={!started||busy} onClick={()=>newSong({seed:host.current.settings.seed})} title="The scene's own song">Scene's song</button>
  </section>
  <section aria-label="Sound generators" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:8}}>
   {SEQUENCERS.map((s,i)=>{const sound=sounds[s.role]??{synth:'calmbgm',name:''};return <div key={s.role} style={{border:`1px solid ${COLOURS[s.role]}55`,borderRadius:6,padding:8,display:'grid',gap:4,background:selected===i?'#ffffff10':'transparent'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><b style={{color:COLOURS[s.role]}}>SEQ {i+1} · {s.label}</b>
     <label><input type="checkbox" checked={!!mutes[s.role]} onChange={e=>setMutes(m=>({...m,[s.role]:e.target.checked}))}/> mute</label></div>
    <select aria-label={`${s.label} sound generator`} value={sound.synth} disabled={!started||busy} onChange={e=>chooseSound(s.role,e.target.value)}>{synthChoices().map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
    {sound.synth==='calmbgm'
     ?<small style={{opacity:.7}}>{sound.name||'the scene\'s voice'}</small>
     :<select aria-label={`${s.label} patch`} value={sound.name} disabled={!started||busy} onChange={e=>chooseSound(s.role,sound.synth,e.target.value)}>{patchesOf(sound.synth).map(p=><option key={p.name} value={p.name}>{p.name}</option>)}</select>}
   </div>;})}
  </section>
  <div className="drums"><div className="split" style={{'--rows':ROWS+1}}><section className="device device-seq" aria-label="Sequencer" style={{position:'relative'}}>
   <header className="device-head"><h2>Sequencer</h2><span>{pattern?`${seqInfo.label} · bar ${bar} of ${project.bars}`:'start the orchestra'}</span></header>
   <div className="s8">
    <div className="s8-left">
     <SeqScreen accent={COLOURS[role]} page="seq" onPage={()=>{}} pages={[{id:'seq',label:'Seq',encoders}]} lines={lines}/>
     <div className="s8-transport" role="group" aria-label="Transport">
      <button type="button" className={'tp play'+(playing?' on':'')} aria-pressed={playing} disabled={!started||!project} onClick={play}><b>{playing?'■':'▶'}</b><small>{playing?'Stop':'Play'}</small></button>
     </div>
     <div className="s8-keys" role="group" aria-label="Sequencer select" style={{gridTemplateColumns:'repeat(5,1fr)'}}>
      {SEQUENCERS.map((s,i)=><button key={s.role} type="button" className={selected===i?'on':''} aria-pressed={selected===i} onClick={()=>{setSelected(i);}} title={`Edit sequencer ${i+1}: ${s.label}`}><small>SEQ {i+1}</small><b>{s.short}</b></button>)}
     </div>
    </div>
    <div className="s8-right">
     <LaneGrid lanes={lanes} pattern={rows} length={length} offset={clamp(col,0,maxCol)} selected={0} headRef={head} colour={()=>COLOURS[role]} level={level}
      pages={{label:'Page',display:`${clamp(col,0,maxCol)+1}–${Math.min(length,clamp(col,0,maxCol)+STEPS)}`,position:maxCol?clamp(col,0,maxCol)/maxCol:0,step:maxCol?4/maxCol:0.1,disabled:!maxCol,onPosition:p=>setCol(Math.round((p*maxCol)/4)*4),onReset:()=>setCol(0)}}
      ruler={Array.from({length:4},(_,i)=>`${Math.floor((clamp(col,0,maxCol)+i*4)/(project?.stepsPerBar??16))+1}.${(Math.floor((clamp(col,0,maxCol)+i*4)/4)%4)+1}`)}
      onStepDown={toggle} onLaneSelect={()=>{}} onLaneDown={(slot)=>{const d=top-slot;host.current?.note(role,degreeToMidi(key,{d,o:octave}),host.current.context.currentTime+0.02,0.5,0.8);}}/>
    </div>
   </div>
  </section></div></div>
 </main>;
}

/** The degree the middle of a pattern's notes sits on, so the grid opens where the notes are. */
function centreDegree(pattern){
 const ds=pattern.steps.filter(Boolean).flatMap(s=>s.n.map(n=>n.d+7*(n.o??0)));
 if(!ds.length)return 0;
 ds.sort((a,b)=>a-b);
 return ds[Math.floor(ds.length/2)];
}
