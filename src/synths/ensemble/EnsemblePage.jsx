import React,{lazy,memo,Suspense,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Generator from '../../app/Generator';
import {BROWSABLE_SCENES,sceneSettings} from '../../app/scenes';
import {findPreset} from '../../app/editor/presetStore';
import {masterBus} from '../../audio/bus';
import {SCALE_FAMILIES,TONIC_NAMES,scaleById,scaleSemitones} from '../../app/theory';
import PROGRESSIONS from '../../app/progressions';
import {METERS} from '../../app/meter';
import {GENERATIVE_PRESETS} from '../../app/presets';
import {referenceLoudness,measureLoudness} from '../../app/engine/loudness';
import ChordTimeline from '../../app/ChordTimeline';
import {TrackStrip,useLivePlay} from '../../app/Tracks';
import {applyTheme,storedTheme} from '../../app/theme';
import Piano,{noteName} from '../../labs/Piano';
import Slider from '../../labs/Slider';
import {SYNTHS} from '../models';
import SoundPicker from '../ui/SoundPicker';
import {EnsemblePanelContext} from '../ui/EmbeddedShell';
import RackPanel from '../effects/RackPanel';
import {rackForPatch,instrumentSpaceKeys,splitRackEdits} from '../effects/params';
import {load,save} from '../storage';
import {CLASSICS,ROLES,ENSEMBLES,DRUM_MACHINES,roleSound,percussionSound,engineRoles,cleanEnsemble,encodeEnsemble,decodeEnsemble} from './state';
import '../../app/generative.css';
import '../../labs/labs.css';
import './ensemble.css';

const PANELS={cs80:lazy(()=>import('../cs80/Cs80Page')),juno:lazy(()=>import('../juno/JunoPage')),prophet5:lazy(()=>import('../prophet/ProphetPage')),jupiter8:lazy(()=>import('../jupiter/JupiterPage')),minimoog:lazy(()=>import('../minimoog/MinimoogPage')),dx7:lazy(()=>import('../dx7/Dx7Page')),obxa:lazy(()=>import('../obxa/ObxaPage')),vs:lazy(()=>import('../vs/VsPage'))};
const LABELS={lead:'Lead',counter:'2nd lead',pad:'Pad',bass:'Bass',perc:'Percussion'};
const PLAYERS=[...ROLES,'perc'],TRACKS=Object.fromEntries(PLAYERS.map(id=>[id,{label:LABELS[id]}]));
const settingsForScene=sceneSettings;
const voicesForScene=scene=>Object.fromEntries(ROLES.map(id=>{const spec=scene.voices[id],fallback=roleSound('calmbgm',id);return [id,typeof spec==='string'?{name:spec,synth:findPreset(spec)??fallback.values}:spec??{name:fallback.name,synth:fallback.values}];}));
const levels=new Map();
async function matchedLevel(sound,id){
 const key=JSON.stringify([id,sound.synth,sound.values]);
 if(levels.size>=64&&!levels.has(key))levels.delete(levels.keys().next().value);
 if(!levels.has(key))levels.set(key,Promise.all([referenceLoudness(id),measureLoudness({classics:{synth:sound.synth,values:sound.values}},id)]).then(([target,measured])=>Math.max(.01,Math.min(4,10**((target-measured)/20)))).catch(error=>{levels.delete(key);throw error;}));
 return levels.get(key);
}
function initial(){try{const hash=location.hash.slice(1);return {setup:hash.startsWith('ensemble=')?decodeEnsemble(hash.slice(9)):cleanEnsemble(load('synths:ensemble',ENSEMBLES[0]))};}catch(error){return {setup:cleanEnsemble(ENSEMBLES[0]),error:error.message};}}
const soundName=(id,role)=>role.synth==='calmbgm'?role.name:SYNTHS[role.synth].name+' · '+role.name;
const playerSound=(setup,id)=>id==='perc'?setup.percussion:setup.roles[id];
const sameMusic=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function ScaledPanel({children,full}){
 const ref=useRef(null),[width,setWidth]=useState(1000);
 useEffect(()=>{const el=ref.current,observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(el);return()=>observer.disconnect();},[]);
 return <div ref={ref} className="ensemble-panel-viewport"><div style={{zoom:full?1:Math.min(1,width/1150),minWidth:full?undefined:1150}}>{children}</div></div>;
}
const VoicePanel=memo(function VoicePanel({id,role,values,onChange,choose,current,full}){
 const Panel=PANELS[id],context=useMemo(()=>({values,onChange,choose,current}),[values,onChange,choose,current]);
 return <ScaledPanel full={full}><EnsemblePanelContext.Provider value={context}><Suspense fallback={<p>Loading panel…</p>}><Panel key={role+id}/></Suspense></EnsemblePanelContext.Provider></ScaledPanel>;
});
// What the players' and chords' minis show: the notes sounding now, the chord
// under the playhead and the next distinct chords, in the bar's key.
function readView(g,visual){
 const now=g.AC.currentTime,bar=Math.floor(g.position()/g.beatsPerBar),plan=g.getPlan(),record=g.plan.get(bar)??plan[0];
 const upcoming=[];for(const r of plan.filter(r=>r.bar>=bar)){if(!upcoming.length||upcoming.at(-1).chord.name!==r.chord.name)upcoming.push(r);if(upcoming.length===4)break;}
 const root=record?.music?.tonic??g.settings.tonic,scale=scaleSemitones(scaleById(record?.music?.mode??g.settings.mode).intervals);
 return {active:Object.fromEntries(PLAYERS.map(r=>[r,visual.filter(e=>e.role===r&&e.time<=now).map(e=>e.midi)])),upcoming,root,scale:scale.map(n=>(n+root)%12)};
}
export default function EnsemblePage(){
 const [boot]=useState(initial),[setup,setSetup]=useState(boot.setup),[selected,setSelected]=useState('lead'),[editor,setEditor]=useState('synth'),[full,setFull]=useState(false),[running,setRunning]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(boot.error??''),[mine,setMine]=useState(()=>load('synths:ensembles',[])??[]),[view,setView]=useState({active:{},upcoming:[],root:0,scale:[]}),[solos,setSolos]=useState({}),[armed,setArmed]=useState(null),[master,setMaster]=useState(.7);
 const current=useRef(setup),operation=useRef(0),visual=useRef([]),prepared=useRef(false),soundRef=useRef(null);current.current=setup;
 // The generator exists from the start so the timeline can show the plan; its
 // classic voices are only built on Play (or when a part is armed).
 const [g]=useState(()=>{const g=new Generator(structuredClone(boot.setup.settings));g.replan([]);g.onRunningChange(()=>setRunning(g.isRunning));g.onVisualNote(e=>{if(e.type==='on')visual.current.push(e);});return g;});
 const live=useLivePlay(g,armed);
 const role=setup.roles[selected],synth=role&&SYNTHS[role.synth],Panel=PANELS[role?.synth];
 const update=patch=>setSetup(s=>({...s,...patch}));
 useEffect(()=>{const t=setTimeout(()=>{save('synths:ensemble',setup);if(location.hash.startsWith('#ensemble='))history.replaceState(null,'','#ensemble='+encodeEnsemble(setup));},300);return()=>clearTimeout(t);},[setup]);
 useEffect(()=>{
  applyTheme(storedTheme());masterBus.gain.value=.7;
  const timer=setInterval(()=>{const now=g.AC.currentTime;visual.current=visual.current.filter(e=>e.time+e.length>now);setView(readView(g,visual.current));},80);
  return()=>{clearInterval(timer);operation.current++;g.stopAll();Object.values(g.roles).forEach(r=>{r.instrument.dispose();r.ensembleRack?.dispose();r.wander.dispose();r.gain.disconnect();r.tone?.disconnect();});g.ambience.dispose?.();g.output.disconnect();g.ambienceOut.disconnect();};
 },[g]);
 const editSettings=patch=>{const next=cleanEnsemble({...current.current,settings:{...current.current.settings,...patch}});setSetup(next);g.setMany(patch);};
 const updateRole=(id,patch)=>setSetup(s=>({...s,roles:{...s.roles,[id]:{...s.roles[id],...patch}}}));
 async function assign(id,sound,light=current.current.light){
  let preset;
  if(sound.synth==='calmbgm')preset=sound.values;
  else{
   if(!sound.matched){const level=await matchedLevel(sound,id);sound={...sound,level,matched:true};setSetup(s=>s.roles[id].synth===sound.synth&&s.roles[id].name===sound.name?{...s,roles:{...s.roles,[id]:{...s.roles[id],level,matched:true}}}:s);}
   const values={...sound.values};
   if(light){if('oversample'in values)values.oversample=0;if('voices'in values)values.voices=Math.min(values.voices,id==='pad'?4:2);}
   preset={classics:{synth:sound.synth,name:sound.name,values,rack:sound.rack,light},masterVolume:sound.level??1};
  }
  g.roles[id].ensembleRack?.dispose();g.roles[id].ensembleRack=null;
  await g.setRoleSource(id,preset);
  if(sound.synth==='calmbgm')await nativeRack(id,sound.rack);
 }
 async function nativeRack(id,values){
  const r=g.roles[id];
  if(!r.ensembleRack){const {createRack}=await import('../effects/graph');const rack=await createRack(g.AC,values);r.instrument.output.disconnect();if(r.instrument.destinations)r.instrument.destinations=[];r.instrument.connect(rack.input);rack.connect(r.tone??r.gain);r.ensembleRack=rack;}else r.ensembleRack.patch(values);
 }
 async function percussion(state){
  const p=state.percussion,r=g.roles.perc;
  r.ensembleRack?.dispose();r.ensembleRack=null;
  if(p.synth==='calmbgm'){await g.setPercussionSource(null);if(g.percussionReady)await g.percussionReady;await nativeRack('perc',state.percussionRack);}
  else await g.setPercussionSource({classics:{synth:p.synth,name:SYNTHS[p.synth].name+' · '+p.name,values:p.values,rack:state.percussionRack,light:state.light},masterVolume:1});
 }
 async function prepare(state=current.current){
  await Promise.all([...ROLES.map(id=>assign(id,state.roles[id],state.light)),percussion(state)]);for(const id of PLAYERS)g.setRoleMix(id,{solo:!!solos[id]});prepared.current=true;
 }
 async function ready(){if(prepared.current)return;setBusy(true);setMessage('Preparing ensemble…');try{await prepare();setMessage('');}finally{setBusy(false);}}
 async function play(){if(busy)return;if(g.isRunning){g.stop();visual.current=[];return;}try{void g.AC.resume();await ready();await g.AC.resume();await g.start();}catch(e){setMessage(e.message);}}
 function arm(id){setArmed(id);if(id)ready().catch(e=>setMessage(e.message));}
 async function chooseSound(id,sound){
  if(busy)return;const previous=current.current.roles[id],revision=++operation.current;updateRole(id,sound);setMessage('');
  if(!prepared.current)return;
  setBusy(true);
  try{await assign(id,sound);}catch(e){if(revision===operation.current)updateRole(id,previous);setMessage(e.message);}finally{if(revision===operation.current)setBusy(false);}
 }
 async function apply(next){
  next=cleanEnsemble(next);
  if(sameMusic(next.settings,current.current.settings))return resound(next);operation.current++;setSetup(next);setSolos({});setMessage('');visual.current=[];
  const resume=g.isRunning;g.stop();g.endStopFade();g.setMany(structuredClone(next.settings));Object.values(g.roles).forEach(r=>{r.solo=false;});g.applyMix();
  if(!prepared.current){await g.rewind();return;}
  Object.values(g.roles).forEach(r=>{r.ensembleRack?.dispose();r.ensembleRack=null;});setBusy(true);
  try{await Promise.all([...ROLES.map(id=>assign(id,next.roles[id],next.light)),percussion(next)]);await g.rewind();if(resume)await g.start();}catch(e){prepared.current=false;setMessage(e.message);}finally{setBusy(false);}
 }
 // New sounds for the same piece: the plan, the playhead and playback carry on.
 async function resound(next){
  const revision=++operation.current,before=current.current;setSetup(next);setMessage('');
  if(!prepared.current)return;
  setBusy(true);
  const key=sound=>JSON.stringify([sound.synth,sound.name,sound.values,sound.rack]);
  const roles=ROLES.filter(id=>next.light!==before.light||key(next.roles[id])!==key(before.roles[id]));
  const drums=next.light!==before.light||JSON.stringify([next.percussion,next.percussionRack])!==JSON.stringify([before.percussion,before.percussionRack]);
  try{await Promise.all([...roles.map(id=>assign(id,next.roles[id],next.light)),drums&&percussion(next)]);}catch(e){setMessage(e.message);}finally{if(revision===operation.current)setBusy(false);}
 }
 const swapEngine=synth=>resound(cleanEnsemble({...current.current,name:synth==='calmbgm'?'calmbgm voices':'All '+SYNTHS[synth].name,roles:synth==='calmbgm'?Object.fromEntries(ROLES.map(id=>[id,roleSound('calmbgm',id)])):engineRoles(synth)}));
 const chooseDrums=(synth,name)=>{if(busy)return;resound(cleanEnsemble({...current.current,percussion:percussionSound(synth,name)}));};
 const engine=ROLES.every(id=>setup.roles[id].synth===setup.roles.lead.synth)?setup.roles.lead.synth:null;
 // A patch from the synth's own libraries (on this machine: its factory banks), for comparison.
 const chooseLibrary=useCallback(p=>{chooseSound(selected,{...current.current.roles[selected],name:p.name,category:'library',values:p.values,level:1,matched:false});},[selected,busy]);// eslint-disable-line react-hooks/exhaustive-deps
 const editValues=useCallback(values=>{if(busy)return;setSetup(s=>({...s,roles:{...s.roles,[selected]:{...s.roles[selected],values}}}));if(prepared.current)g.roles[selected].instrument.setValues?.(values);},[busy,selected,g]);
 const editRack=changes=>{
  if(selected==='perc'){const rack={...setup.percussionRack,...changes};update({percussionRack:rack});if(prepared.current){if(setup.percussion.synth==='calmbgm')nativeRack('perc',rack).catch(e=>setMessage(e.message));else g.roles.perc.instrument.setRack?.(rack);}return;}
  if(synth){const {native,extra}=splitRackEdits(synth,changes),values={...role.values,...native},rack={...role.rack,...extra};updateRole(selected,{values,rack});if(prepared.current){const inst=g.roles[selected].instrument;inst.setValues?.(values);inst.setRack?.(rackForPatch(synth,values,rack));}}
  else{const rack={...role.rack,...changes};updateRole(selected,{rack});if(prepared.current)nativeRack(selected,rack).catch(e=>setMessage(e.message));}
 };
 async function balance(){setBusy(true);setMessage('Matching this sound to the role…');try{const source={classics:{synth:role.synth,values:role.values}},[target,measured]=await Promise.all([referenceLoudness(selected),measureLoudness(source,selected)]);const level=Math.max(.01,Math.min(4,10**((target-measured)/20)));updateRole(selected,{level,matched:true});const inst=prepared.current&&g.roles[selected].instrument;if(inst?.preset?.classics){inst.preset.masterVolume=level;inst.output.gain.setTargetAtTime(level,inst.AC.currentTime,.03);}setMessage('Sound level matched.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 async function share(){try{const url=new URL(location.href);url.hash='ensemble='+encodeEnsemble(current.current);await navigator.clipboard.writeText(url.href);history.replaceState(null,'',url);setMessage('Ensemble link copied.');}catch(e){setMessage(e.message);}}
 function saveCurrent(){const name=window.prompt('Name this ensemble',setup.name);if(!name)return;const entry=cleanEnsemble({...setup,name}),next=[...mine.filter(p=>p.name!==name),entry];save('synths:ensembles',next);setMine(next);setSetup(entry);}
 // Side by side the sound is already in view; stacked, scroll down to it.
 const shape=id=>{setSelected(id);if(!matchMedia('(min-width:1280px)').matches)requestAnimationFrame(()=>soundRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));};
 const mix=id=>({mute:!!setup.settings.muted[id],solo:!!solos[id]});
 const changeMix=(id,patch)=>{
  if('mute'in patch)editSettings({muted:{...setup.settings.muted,[id]:patch.mute}});
  if('solo'in patch){setSolos(s=>({...s,[id]:patch.solo}));g.setRoleMix(id,{solo:patch.solo});}
 };
 const chord=view.upcoming[0]?.chord.pitchClasses??[];
 const rackValues=selected==='perc'?setup.percussionRack:synth?rackForPatch(synth,role.values,role.rack):role.rack;
 return <div className="ensemble">
  <main className="labs-shell ensemble-shell">
   <header><nav><a href="../">← Synths</a><a href="/labs/">Instrument labs</a><a href="/">calmbgm</a></nav><span className="lab-eyebrow">Synths ensemble</span><h1>Ensemble</h1><p>Hear the classic synths inside the generator’s music. Choose a progression, give each part a sound, and shape its synth and effects while it plays.</p></header>
   <section className="lab-section ensemble-music" aria-label="The music">
    <div className="lab-section-heading"><div><small>Hear it together / the music</small><h2>{setup.name}</h2></div><button className="lab-primary ensemble-play" disabled={busy} onClick={play}>{busy?'Preparing…':running?'Pause':'Play'}</button><button disabled={busy} onClick={()=>g.rewind().catch(e=>setMessage(e.message))}>Back to start</button></div>
    <div className="lab-toolbar"><label>Ensemble preset<select aria-label="Ensemble preset" value="" disabled={busy} onChange={e=>apply(e.target.value.startsWith('mine:')?mine[Number(e.target.value.slice(5))]:ENSEMBLES[Number(e.target.value)])}><option value="">Choose ensemble…</option><optgroup label="Ensembles">{ENSEMBLES.map((p,i)=><option key={p.name} value={i}>{p.name}</option>)}</optgroup>{mine.length>0&&<optgroup label="Mine">{mine.map((p,i)=><option key={i} value={'mine:'+i}>{p.name}</option>)}</optgroup>}</select></label><label>General preset<select aria-label="General preset" value="" disabled={busy} onChange={e=>{const scene=BROWSABLE_SCENES[Number(e.target.value)];apply({...setup,name:scene.name,settings:settingsForScene(scene),roles:Object.fromEntries(ROLES.map(id=>{const v=voicesForScene(scene)[id];return [id,{...roleSound('calmbgm',id),name:v.name,values:v.synth}];}))});}}><option value="">Browse scenes…</option>{BROWSABLE_SCENES.map((s,i)=><option key={i} value={i}>{s.name}</option>)}</select></label>
     <div className="ensemble-master"><Slider label="Master volume" value={master} onChange={v=>{masterBus.gain.value=v;setMaster(v);}}/></div></div>
    <div className="lab-toolbar"><label>Key<select aria-label="Key" value={setup.settings.tonic} onChange={e=>editSettings({tonic:Number(e.target.value)})}>{TONIC_NAMES.map((n,i)=><option key={n} value={i}>{n}</option>)}</select></label><label>Scale<select aria-label="Scale" value={setup.settings.mode} onChange={e=>editSettings({mode:e.target.value})}>{SCALE_FAMILIES.map(f=><optgroup key={f.family} label={f.family}>{f.modes.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>)}</select></label><label>Tempo<input aria-label="Tempo" type="number" min="30" max="180" value={setup.settings.bpm} onChange={e=>{if(e.target.value)editSettings({bpm:Math.min(180,Math.max(30,Number(e.target.value)))});}}/></label><label>Meter<select aria-label="Meter" value={setup.settings.meter} onChange={e=>editSettings({meter:e.target.value})}>{Object.entries(METERS).map(([id,m])=><option key={id} value={id}>{m.label}</option>)}</select></label><label className="ensemble-progression">Progression<select aria-label="Progression" value={setup.settings.progression} onChange={e=>editSettings({progression:Number(e.target.value)})}>{PROGRESSIONS.map((p,i)=><option key={i} value={i}>{p.join(' · ')}</option>)}</select></label></div>
    <div className="lab-toolbar"><label className="lab-check"><input type="checkbox" checked={setup.settings.counter.mode!=='off'} onChange={e=>editSettings({counter:{...setup.settings.counter,mode:e.target.checked?'answer':'off'}})}/>Second lead</label><label className="lab-check"><input type="checkbox" disabled={busy} checked={setup.light} onChange={e=>apply({...setup,light:e.target.checked})}/>Light mode</label><span className="lab-hint">Light mode reduces pad voices and oversampling; four classics can be demanding on a phone.</span></div>
    <div className="ensemble-engines" role="group" aria-label="One synth for every line"><span>Every line on</span>{['calmbgm',...CLASSICS].map(id=><button key={id} aria-pressed={engine===id} disabled={busy} onClick={()=>swapEngine(id)}>{id==='calmbgm'?'calmbgm':SYNTHS[id].name}</button>)}<label>Drums<select aria-label="Drums" disabled={busy} value={setup.percussion.synth} onChange={e=>chooseDrums(e.target.value)}><option value="calmbgm">calmbgm kit</option>{DRUM_MACHINES.map(s=><option key={s} value={s}>{SYNTHS[s].name}</option>)}</select></label></div>
    <div className="gen ensemble-gen"><ChordTimeline generator={g} tracks={<TrackStrip roles={TRACKS} presets={Object.fromEntries(PLAYERS.map(id=>[id,{name:soundName(id,playerSound(setup,id))}]))} mix={Object.fromEntries(PLAYERS.map(id=>[id,mix(id)]))} armed={armed} onMix={changeMix} onArm={arm} onEdit={shape} onPick={shape} onPickPercussion={()=>shape('perc')} onEditPercussion={()=>shape('perc')} generating={{}} live={live}/>}/></div>
    <div className="lab-chords"><article><small>Selected key</small><h3>{noteName(60+view.root).replace('4','')} · {scaleById(setup.settings.mode).name}</h3><Piano mini low={60} high={71} scale={view.scale} root={view.root} label="Notes of the selected scale"/></article>{view.upcoming.map((r,i)=><article key={r.bar}><small>{i===0?'Now':'Next · bar '+(r.bar+1)}</small><h3>{r.chord.name}</h3><Piano mini low={60} high={71} scale={view.scale} chord={r.chord.pitchClasses} root={r.chord.pitchClasses[0]??view.root} label={'Chord '+r.chord.name}/></article>)}</div>
    <p className="lab-status" role="status">{message||'Choose an ensemble, press Play, and shape each part.'}</p>
   </section>
   <section className="lab-section ensemble-players-section" aria-label="The players">
    <div className="lab-section-heading"><div><small>The players / sources</small><h2>Who plays what</h2></div></div>
    <div className="lab-tracks ensemble-players">{PLAYERS.map(id=><article key={id} className={'lab-track ensemble-player role-'+id+(selected===id?' selected':'')}>
     <div><label className="lab-check"><input aria-label={'Hear '+LABELS[id]} type="checkbox" checked={!setup.settings.muted[id]} onChange={e=>changeMix(id,{mute:!e.target.checked})}/>{LABELS[id]}</label><button aria-pressed={selected===id} onClick={()=>shape(id)}>Shape</button></div>
     <small className="lab-part-source" title={soundName(id,playerSound(setup,id))}>{soundName(id,playerSound(setup,id))}</small>
     {id==='perc'?<><select aria-label="Percussion source" disabled={busy} value={setup.percussion.synth} onChange={e=>chooseDrums(e.target.value)}><option value="calmbgm">calmbgm kit</option>{DRUM_MACHINES.map(s=><option key={s} value={s}>{SYNTHS[s].name}</option>)}</select><select aria-label="Percussion groove" value={setup.settings.drums.style} onChange={e=>editSettings({drums:{...setup.settings.drums,style:e.target.value}})}>{['off','heartbeat','brushes','lofi','shaker'].map(s=><option key={s} value={s}>{s}</option>)}</select></>:<select aria-label={LABELS[id]+' source'} disabled={busy} value={setup.roles[id].synth} onChange={e=>chooseSound(id,roleSound(e.target.value,id))}><option value="calmbgm">calmbgm</option>{CLASSICS.map(s=><option key={s} value={s}>{SYNTHS[s].name}</option>)}</select>}
     <Piano mini low={60} high={71} active={(view.active[id]??[]).map(n=>60+n%12)} root={view.root} chord={id==='perc'?[]:chord} label={LABELS[id]+' notes'}/>
     <Slider label="Volume" value={setup.settings.volumes[id]} onChange={v=>editSettings({volumes:{...setup.settings.volumes,[id]:v}})}/>
    </article>)}</div>
    <div className="lab-toolbar ensemble-keep"><button onClick={saveCurrent}>Save current</button><button onClick={share}>Copy link</button><label className="ensemble-import">Open JSON<input type="file" accept="application/json,.json" onChange={async e=>{try{const raw=JSON.parse(await e.target.files[0].text());if(raw.format!=='bgm-ensemble')throw Error('Choose an ensemble setup.');await apply(raw);}catch(error){setMessage(error.message);}e.target.value='';}}/></label><button onClick={()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(setup,null,2)],{type:'application/json'}));a.href=url;a.download='ensemble.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Export</button></div>
   </section>
  </main>
  {/* Outside .labs-shell: the synth panels and rack keep their own control styling. */}
  <section ref={soundRef} className={'ensemble-sound '+(full?'expanded':'')} aria-label="Selected voice sound">
   <div className="ensemble-sound-head"><div><small>Shape the sound / {LABELS[selected]}</small><h2>{synth?.name??(selected==='perc'?'Percussion':role.name)}</h2></div>
    <nav className="ensemble-role-tabs" aria-label="Role">{PLAYERS.map(id=><button key={id} className={'role-'+id} aria-pressed={selected===id} onClick={()=>setSelected(id)}>{LABELS[id]}</button>)}</nav></div>
   <div className="ensemble-sound-tools"><button aria-pressed={editor==='synth'} onClick={()=>setEditor('synth')}>Instrument</button><button aria-pressed={editor==='effects'} onClick={()=>setEditor('effects')}>Effects</button>{Panel&&<><button disabled={busy} onClick={balance}>Match level</button><button aria-pressed={full} onClick={()=>setFull(!full)}>{full?'Fit panel':'Full size'}</button></>}</div>
   {selected!=='perc'&&<div className="ensemble-sounds"><label>Instrument<select aria-label="Selected voice source" disabled={busy} value={role.synth} onChange={e=>chooseSound(selected,roleSound(e.target.value,selected))}><option value="calmbgm">calmbgm</option>{CLASSICS.map(id=><option key={id} value={id}>{SYNTHS[id].name}</option>)}</select></label>{synth?<SoundPicker synth={synth} presets={synth.presets} mine={[]} current={role.name} currentCategory={role.category} choose={p=>chooseSound(selected,{...role,...p,values:p.values,level:1,matched:false})}/>:<label>calmbgm sound<select value={role.name} disabled={busy} onChange={e=>chooseSound(selected,{...role,name:e.target.value,values:GENERATIVE_PRESETS[e.target.value]})}>{!GENERATIVE_PRESETS[role.name]&&<option>{role.name}</option>}{Object.keys(GENERATIVE_PRESETS).filter(n=>!GENERATIVE_PRESETS[n].wasmVoice).map(n=><option key={n}>{n}</option>)}</select></label>}</div>}
   {editor==='effects'?<RackPanel values={rackValues} onChange={editRack} instrumentSpecs={synth?instrumentSpaceKeys(synth).map(k=>({...synth.params.BY_KEY[k],key:'instrument.'+k})):[]} tools={<button onClick={()=>g.roles[selected].instrument.flushTails?.()}>Clear tails</button>}/>:Panel?<VoicePanel id={role.synth} role={selected} values={role.values} onChange={editValues} choose={chooseLibrary} current={role.name} full={full}/>:selected==='perc'?<div className="ensemble-native"><h3>{setup.percussion.synth==='calmbgm'?'The generator’s percussion':SYNTHS[setup.percussion.synth].name}</h3><p>The percussion follows the generator’s arrangement and tempo{setup.percussion.synth==='calmbgm'?'':', each drum on one of the machine’s pads'}. Choose the source and groove with the players, or shape its effects here.</p>{setup.percussion.synth!=='calmbgm'&&<label>Kit<select aria-label="Drum machine kit" disabled={busy} value={setup.percussion.name} onChange={e=>chooseDrums(setup.percussion.synth,e.target.value)}>{SYNTHS[setup.percussion.synth].presets.map(p=><option key={p.name}>{p.name}</option>)}</select></label>}</div>:<div className="ensemble-native"><h3>{role.name}</h3><p>This part plays through the generator’s own instrument. Choose a classic as its instrument to open the synth’s full panel here.</p><button disabled={busy} onClick={async()=>{try{await ready();await g.audition(selected);}catch(e){setMessage(e.message);}}}>Audition this part</button></div>}
  </section>
 </div>;
}
