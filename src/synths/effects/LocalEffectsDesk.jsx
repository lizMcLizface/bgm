import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Desk from '../ui/Desk';
import useFloating from '../ui/useFloating';
import {DeskObjectsProvider} from '../ui/WorkbenchObjects';
import {VoicePanel} from '../ui/VoicePanel';
import StageKeys from '../ui/StageKeys';
import MonitorPedal from './MonitorPedal';
import SetupPopover from '../ui/SetupPopover';
import {AutoPlay,ChordChips} from '../ui/PhraseDock';
import {Ribbon,TouchPad} from '../ui/controls';
import {CURVES} from '../ui/setup';
import {mapVelocity} from '../../labs/input';
import {buildContext} from '../../app/harmonyContext';
import {recalledContext} from '../../app/auditionPhrases';
import {AUDITION_PHRASES} from '../../app/auditionPhrases';
import {load,save} from '../storage';
import {useSaved} from '../useSaved';
import RackPanel from './RackPanel';
import {RackControl,useRackModel,syncedDelayMs} from './rackParts';
import EffectBox from './EffectBox';
import DrivePedal from './DrivePedal';
import {DRIVE_PEDALS} from './driveModel';
import {syncInstances,projectInstances,migrateInstances,normalizeInstances} from './instances';
import {instanceRackModel} from './instanceRackModel';
import {EFFECT_FACES,effectBinding,rackFaceIds} from './effectBoxes';
import {RACK_PARAMS} from './params';
import {useEffectsInstrument} from './useEffectsInstrument';
import {DESK_STATE_KEY,DESK_CAMERA_KEY,cleanEffectsState,defaultEffectsState,createEffectsObjects,drySourceValues,positionKey,positions,encodeEffectsSetup,decodeEffectsSetup,MAX_SETUP_BYTES,cleanDeskRack} from './deskState';
import './effectsDesk.css';
import './benchSurfaces.css';
import Surface from './BenchSurface';
import ParallelBench from './ParallelBench';
import {BUS_IDS,parallelPreset,busBinding,busPositionKey,viewKey} from './parallelModel';
import {placeWetDryRig} from './wetDryLayout';
import {BENCH_SOUNDS} from './benchSounds';

export default function LocalEffectsDesk(props){
 const [{initial,fresh}]=useState(()=>{const saved=load(DESK_STATE_KEY,null);return {initial:saved?cleanEffectsState(saved):defaultEffectsState(),fresh:!saved};});
 const [objects]=useState(()=>{const store=createEffectsObjects(initial);if(fresh)placeWetDryRig(store);return store;});
 return <DeskObjectsProvider store={objects}><EffectsDesk initial={initial} objects={objects} fresh={fresh} {...props}/></DeskObjectsProvider>;
}
function DeskKeyboard(props){
 const floating=useFloating(positionKey('keyboard'),positions.keyboard,{spawnOnly:true,rotatable:true});
 return <StageKeys {...props} drag={{...floating,style:{...floating.style,position:'absolute'}}}/>;
}
function EffectsDesk({initial,objects,onRemote,fresh}){
 const [state,setState]=useState(initial),[notice,setNotice]=useState(''),[arrangeRequest,setArrangeRequest]=useState(fresh?1:0),[arrangement,setArrangement]=useState('preset'),[setupEpoch,setSetupEpoch]=useState(0),input=useRef(null),setupAnchor=useRef(null),latest=useRef(state),importToken=useRef(0);latest.current=state;
 const arrange=()=>{setArrangement('spread');setArrangeRequest(n=>n+1);};
 const patch=state.patch,rack=state.rack,setup=state.setup;
 const onSetup=useCallback((key,value)=>setState(s=>({...s,setup:{...s.setup,[key]:value}})),[]);
 const closeSetup=useCallback(()=>setState(s=>({...s,panels:{...s.panels,setup:false}})),[]);
 const editMonitor=useCallback((kind,patch)=>setState(s=>({...s,monitors:{...s.monitors,[kind]:{...s.monitors[kind],...patch}}})),[]);
 const context=useMemo(()=>state.audition.follow?recalledContext():buildContext(state.audition),[state.audition]);
 const live=useEffectsInstrument({patch,rack,instances:state.instances,parallel:state.parallel,setup,context,onSetup});
 const editParallel=useCallback(update=>setState(s=>!s.parallel&&typeof update==='function'?s:{...s,parallel:typeof update==='function'?update(s.parallel):update}),[]);
 const activeFaces=state.instances.chain,clock=AUDITION_PHRASES.find(p=>p.id===live.playing)?.bpm??state.tempo;
 const peakDb=Math.min(6,Math.max(-60,20*Math.log10(Math.max(1e-3,live.stats.peak))));
 useEffect(()=>{const phrase=AUDITION_PHRASES.find(p=>p.id===live.playing);if(phrase)setState(s=>s.tempo===phrase.bpm?s:{...s,tempo:phrase.bpm});},[live.playing]);
 useSaved(DESK_STATE_KEY,state);
 useEffect(()=>()=>{importToken.current++;save(DESK_STATE_KEY,latest.current);},[]);
 useEffect(()=>{
  objects.update('keyboard',{visible:setup.keys!=='hide'});objects.update('scope',{visible:state.panels.scope});objects.update('spectrum',{visible:state.panels.spectrum});objects.update('setup',{visible:false});
  objects.update('rack',{visible:state.panels.rack});objects.update('output',{visible:state.panels.output});objects.update('mixer',{visible:!!state.parallel&&state.panels.mixer});
  for(const face of EFFECT_FACES){objects.update(effectBinding(face.id),{visible:!state.parallel&&(activeFaces.includes(face.id)||state.panels.catalog)&&state.panels.effects[face.id]===true});for(const bus of BUS_IDS)objects.update(busBinding(bus,face.id),{visible:!!state.parallel?.views[viewKey(bus,face.id)]});}
 },[objects,setup.keys,state.panels,state.parallel?.views,!!state.parallel,activeFaces.join('|')]);// eslint-disable-line react-hooks/exhaustive-deps
 const editVoice=useCallback(values=>setState(s=>({...s,patch:{...s.patch,name:s.patch.name.replace(/ \*$/,'')+' *',values:drySourceValues(values)}})),[]);
 const choose=useCallback(next=>{if(next?.values)setState(s=>({...s,patch:{name:next.name,values:drySourceValues(next.values),...(next.category?{category:next.category}:{})}}));},[]);
 const editRack=useCallback(changes=>setState(s=>{const rack=RACK_PARAMS.sanitize({...s.rack,...changes});return {...s,rack,instances:syncInstances(s.instances,rack)};}),[]);
 const editGraph=useCallback(next=>setState(s=>{const instances=normalizeInstances(next,s.rack);return {...s,instances,rack:instances.compatibility==='serial'?projectInstances(instances,s.rack):s.rack};}),[]);
 const editInstance=useCallback((id,changes)=>setState(s=>({...s,instances:{...s.instances,instances:s.instances.instances.map(i=>i.id===id?{...i,...changes}:i)}})),[]);
 const legacyModel=useRackModel({values:rack,onChange:editRack,tempo:clock,independentSpace:true}),model=instanceRackModel(legacyModel,state.instances,editGraph);
 useEffect(()=>{
  if(state.parallel||!rack['master.sync'])return;
  const ms=RACK_PARAMS.clampValue('effects.delayMs',Math.round(syncedDelayMs(rack['master.sync'],clock)));
  if(ms!==rack['effects.delayMs'])editRack({'effects.delayMs':ms});
 },[clock,rack['master.sync'],rack['effects.delayMs'],editRack,!!state.parallel]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  if(!state.parallel)return;
  const edits=BUS_IDS.filter(id=>state.parallel.buses[id].rack['master.sync']).map(id=>[id,Math.round(syncedDelayMs(state.parallel.buses[id].rack['master.sync'],clock))]).filter(([id,ms])=>ms!==state.parallel.buses[id].rack['effects.delayMs']);
  if(edits.length)editParallel(p=>({...p,buses:{...p.buses,...Object.fromEntries(edits.map(([id,ms])=>[id,{...p.buses[id],rack:{...p.buses[id].rack,'effects.delayMs':RACK_PARAMS.clampValue('effects.delayMs',ms)}}]))}}));
 },[clock,state.parallel,editParallel]);
 const openEffect=useCallback(id=>{
  if(!EFFECT_FACES.some(f=>f.id===id))return;
  setState(s=>({...s,panels:{...s.panels,effects:{...s.panels.effects,[id]:true}}}));objects.focus(effectBinding(id));
 },[objects]);
 const closeEffect=id=>setState(s=>({...s,panels:{...s.panels,effects:{...s.panels.effects,[id]:false}}}));
 const showEffects=show=>setState(s=>({...s,panels:{...s.panels,catalog:false,effects:show?Object.fromEntries(activeFaces.map(id=>[id,true])):{}}}));
 const showEveryEffect=()=>{
  if(state.parallel){const bus=state.parallel.selected;editParallel(p=>({...p,views:{...p.views,...Object.fromEntries(EFFECT_FACES.map(f=>[viewKey(bus,f.id),true]))}}));arrange();setNotice('One of every effect shown on the selected bus; disconnected pedals stay silent until added.');return;}
  setState(s=>({...s,panels:{...s.panels,scope:true,spectrum:true,catalog:true,effects:Object.fromEntries(EFFECT_FACES.map(f=>[f.id,true]))}}));
  arrange();
  setNotice(`All ${EFFECT_FACES.length} effect boxes and both monitors arranged. Effects outside the rack stay disconnected until added.`);
 };
 const layoutRig=()=>{setState(s=>({...s,setup:{...s.setup,keys:'show',keysSize:88},panels:{...s.panels,rack:false,output:false,mixer:true,scope:true,spectrum:true}}));setArrangement('preset');setArrangeRequest(n=>n+1);setNotice('Wet/dry rig layout · sound and routing preserved.');};
 const loadParallel=()=>{choose(BENCH_SOUNDS[0]);setState(s=>({...s,parallel:parallelPreset()}));setSetupEpoch(n=>n+1);layoutRig();setNotice('Starmap Void · Dark Z-plane, chorus, vibrato and wet delay.');};
 const visibleBlocks=[...model.tiles.filter(b=>activeFaces.includes(b.id)),...model.blocks.filter(b=>EFFECT_FACES.some(f=>f.id===b.id)&&!activeFaces.includes(b.id))];
 const bound=useMemo(()=>({category:patch.category,caseObject:{key:positionKey('source'),home:positions.source,className:'effects-source-box',label:'DI-Poly'}}),[patch.category]);
 const panel=name=>setState(s=>({...s,panels:{...s.panels,[name]:!s.panels[name]}}));
 const [chord,setChord]=useState(0);
 const setAudition=next=>{live.stopPhrase();setChord(0);setState(s=>({...s,audition:next}));};
 const saveDesk=()=>{
  try{
   const text=encodeEffectsSetup(latest.current,objects.snapshot());decodeEffectsSetup(text);
   const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');
   a.href=url;a.download='effects-desk.calmbgm.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Saved effects desk.');
  }catch(error){setNotice(error.message);}
 };
 const openDesk=async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  const token=++importToken.current;
  try{
   if(file.size>MAX_SETUP_BYTES)throw new Error('Effects desk file is too large');
   const data=decodeEffectsSetup(await file.text());if(token!==importToken.current)return;live.stop();objects.restore(data.workbench);
   const {workbench,...next}=data;setState(next);setSetupEpoch(n=>n+1);setChord(0);setNotice(`Opened ${file.name} · audio stopped.`);
  }catch(error){if(token===importToken.current)setNotice(`Could not open desk: ${error.message}`);}
 };
 const toggleAudio=()=>{setNotice('');if(live.audio.state==='on'||live.audio.state==='starting')live.stop();else live.start();};
 const velocity=v=>mapVelocity(v,CURVES[setup.velocity]??CURVES.normal);
 return <div className="synth instrument effects-workbench">
  <header className="synth-bar effects-desk-bar">
   <a className="back" href={import.meta.env.BASE_URL+'synths/'} aria-label="All synths">◂</a>
   <h1><span className="brand">Effects</span><small>DI-Poly workbench</small></h1>
   <button type="button" onClick={toggleAudio}>{live.audio.state==='on'||live.audio.state==='starting'?'Stop audio':'Start audio'}</button>
   <span className="effects-audio-status" role="status">{live.audio.state==='error'?live.audio.message:notice||live.audio.message}</span>
   <button type="button" onClick={saveDesk}>Save desk</button><button type="button" onClick={()=>input.current?.click()}>Open desk…</button>
   <input ref={input} type="file" hidden accept=".json,application/json" onChange={openDesk}/>
   <button type="button" aria-pressed={state.panels.rack} onClick={()=>panel('rack')}>Rack</button>
   <button type="button" aria-pressed={state.panels.output} onClick={()=>panel('output')}>Output</button>
   {state.parallel&&<button type="button" aria-pressed={state.panels.mixer} onClick={()=>panel('mixer')}>Mixer</button>}
   {state.parallel&&<button type="button" onClick={layoutRig} title="Restore the physical rig arrangement without changing sound or routing">Rig layout</button>}
   <button type="button" onClick={loadParallel}>Parallel wet/dry preset</button>
   {state.parallel&&<button type="button" aria-label="Return to saved serial rack" title="Return to the serial rack without replacing its saved effects" onClick={()=>setState(s=>({...s,parallel:null}))}>Serial rack</button>}
   <button type="button" aria-pressed={state.panels.scope} onClick={()=>panel('scope')}>Scope</button>
   <button type="button" aria-pressed={state.panels.spectrum} onClick={()=>panel('spectrum')}>Spectrum</button>
   <button type="button" ref={setupAnchor} aria-haspopup="dialog" aria-expanded={state.panels.setup} aria-controls="effects-midi-setup" aria-pressed={state.panels.setup} onClick={()=>panel('setup')}>MIDI / Setup</button>
   <button type="button" aria-pressed={setup.keys!=='hide'} onClick={()=>onSetup('keys',setup.keys==='hide'?'show':'hide')}>Keyboard</button>
   <button type="button" title="Arrange one of every effect without changing the audio chain" onClick={showEveryEffect}>Show every effect</button>
   <button type="button" title="Spread visible boxes into aligned rows and fit the view" onClick={arrange}>Arrange bench</button>
   <button type="button" onClick={live.panic}>Panic</button><button type="button" onClick={onRemote}>Remote rack…</button>
  </header>
  {state.panels.setup&&<SetupPopover id="effects-midi-setup" anchorRef={setupAnchor} midi={live.midi} setup={setup} updateSetup={onSetup} connectMidi={live.connectMidi} audio={live.audio} start={live.start} onClose={closeSetup} shared={false}/>}
  <Desk includeHomeInFit={false} objects={objects} storageKey={DESK_CAMERA_KEY} arrangeRequest={arrangeRequest} arrangeWidth="auto" arrangeObjects={state.parallel&&arrangement==='preset'?placeWetDryRig:null} resetObjects={state.parallel?placeWetDryRig:null} minZoom={.1}>
   <VoicePanel id="poly" role="effects-reference" values={patch.values} onChange={editVoice} choose={choose} current={patch.name.replace(/ \*$/,'')} full bound={bound}/>
   <Surface id="sounds" title="Sounds" className="effects-sounds-box">
    <div role="radiogroup" aria-label="Quick synth presets">{BENCH_SOUNDS.map(sound=><button key={sound.name} type="button" role="radio" aria-checked={patch.name.replace(/ \*$/,'')===sound.name} style={{'--sound-colour':sound.colour}} onClick={()=>choose(sound)}><i aria-hidden="true"/>{sound.name}</button>)}</div>
   </Surface>
   {!state.parallel&&state.panels.rack&&<Surface id="rack" title="Effects rack" className="effects-rack-box">
    <RackPanel onReset={()=>setState(s=>{const rack=cleanDeskRack();return {...s,rack,instances:migrateInstances(rack)};})} instanceModel={model} resetValues={cleanDeskRack} values={rack} onChange={editRack} peak={live.stats.peak} reduction={live.stats.reduction??0} connected tempo={clock} independentSpace externalEditors onOpenEffect={openEffect} tools={<><button type="button" onClick={()=>live.engine.current?.clearRack()}>Clear rack tails</button><div className="effects-box-tools"><button type="button" onClick={()=>showEffects(true)}>Show all boxes</button><button type="button" onClick={()=>showEffects(false)}>Hide boxes</button></div></>}/>
   </Surface>}
   {state.parallel&&<ParallelBench parallel={state.parallel} onChange={editParallel} objects={objects} engine={live.engine} audio={live.audio.state} stats={live.stats} tempo={clock} showRack={state.panels.rack} showMixer={state.panels.mixer} epoch={setupEpoch}/>}
   {!state.parallel&&visibleBlocks.filter(block=>(activeFaces.includes(block.id)||state.panels.catalog)&&state.panels.effects[block.id]).map(block=>DRIVE_PEDALS[block.id]?<DrivePedal key={block.id} instance={state.instances.instances.find(i=>i.id===block.id)} connected={activeFaces.includes(block.id)} model={model} onEdit={editInstance} onClose={()=>closeEffect(block.id)} peak={live.stats.drivePeaks?.[block.id]??0} rackEnabled={!!rack["master.enabled"]}/>:<EffectBox key={block.id} block={block} connected={activeFaces.includes(block.id)} values={rack} onChange={editRack} model={model} reduction={live.stats.reduction??0} inputDb={live.stats.compressorInputDb??-100} limiterReduction={live.stats.limiterReduction??0} sampleRate={live.engine.current?.context.sampleRate??48000}
    onClose={()=>closeEffect(block.id)}/>)}
   {state.panels.output&&<Surface id="output" title="Stereo output" className="effects-output-box">
    <div className="effects-output-body">
     <div className="effects-output-route"><span>DI-Poly</span><i aria-hidden="true">→</i><span>{state.parallel?'Parallel mixer + master insert':'Effects rack'}</span><i aria-hidden="true">→</i><strong>Stereo out</strong></div>
     <div className={'effects-output-display'+(live.stats.peak>=1?' is-clipping':'')}>
      <div className="effects-output-display-head"><span>Sample peak</span><strong>{live.stats.peak>0?(20*Math.log10(live.stats.peak)).toFixed(1):'−∞'} <small>dBFS</small></strong></div>
      <div className="effects-output-meter" role="meter" aria-label="Output peak" aria-valuemin={-60} aria-valuemax={6} aria-valuenow={peakDb}><i style={{clipPath:`inset(0 ${100-(peakDb+60)/66*100}% 0 0)`}}/></div>
      <div className="effects-output-scale" aria-hidden="true">{[-60,-48,-36,-24,-12,0,6].map(db=><span key={db} style={{left:(db+60)/66*100+'%'}}>{db>0?'+':''}{db}</span>)}</div>
      <div className="effects-output-readout"><span><b>{live.stats.active}</b> voices</span><span className={live.audio.state==='on'?'is-live':''}>{live.audio.state==='on'?live.audio.message:'Audio stopped'}</span></div>
     </div>
     <div className="effects-output-controls">
      <RackControl spec={RACK_PARAMS.BY_KEY['master.output']} value={rack['master.output']} label="Output" block="master" onChange={editRack}/>
      <label className="effects-clock">{live.playing?'Audition clock':'Rack clock'}<input type="number" aria-label="Rack tempo" key={clock} defaultValue={clock} min={40} max={240} disabled={!!live.playing} onBlur={e=>{const n=Number(e.target.value);if(Number.isFinite(n)&&n>=40&&n<=240)setState(s=>({...s,tempo:n}));else e.target.value=String(state.tempo);}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/> BPM</label>
     </div>
    </div>
   </Surface>}
   {setup.keys!=='hide'&&<DeskKeyboard size={setup.keysSize} controls={setup.keysControls} onLayout={onSetup} low={setup.keysLow} onLow={value=>onSetup('keysLow',value)} notes={live.notes} context={context} chord={chord}
    onDown={(key,note,value)=>live.down(key,note,velocity(value??.75))} onUp={live.up} onMod={value=>live.performer.source('wheelMod',value)}
    left={<Ribbon vertical range={setup.ribbonRange} onBend={value=>live.performer.source('ribbon',value)}/>}
    right={<TouchPad onTouch={(pressure,mod)=>{live.performer.source('pad',pressure);live.performer.source('padMod',mod);}}/>}
    head={<><AutoPlay playing={live.playing} onPlay={live.playPhrase} onStop={live.stopPhrase}/><ChordChips context={context} chordPick={chord} onChordPick={i=>setChord(c=>c===i?0:i)} audition={state.audition} onAudition={setAudition}/></>}/>}
   {['scope','spectrum'].filter(kind=>state.panels[kind]).map(kind=><MonitorPedal key={kind} kind={kind} engine={live.engine} audio={live.audio.state} config={state.monitors[kind]} onChange={editMonitor} onClose={()=>panel(kind)} positionKey={positionKey(kind)} home={positions[kind]}/>)}
   <div className="effects-desk-space" aria-hidden="true"/>
  </Desk>
 </div>;
}
