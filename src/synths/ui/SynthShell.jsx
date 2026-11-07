import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Fader,Choice,Toggle,Lever,Dial,Ribbon,TouchPad} from './controls';
import {startLiveSynth} from '../engine/liveSynth';
import {Performer} from '../engine/performer';
import {createPhraseRunner,phraseForCode} from './phraseRunner';
import {AutoPlay,ChordChips} from './PhraseDock';
import {recalledContext} from '../../app/auditionPhrases';
import {buildContext,DEFAULT_HARMONY} from '../../app/harmonyContext';
import {LabMidi,bindLabKeyboard,mapVelocity} from '../../labs/input';
import {load,save} from '../storage';
import {useSaved} from '../useSaved';
import Scope from './Scope';
import {usePanelKit} from './panelKit';
import SetupPopover from './SetupPopover';
import StageKeys from './StageKeys';
import ComparisonPresets from './ComparisonPresets';
import EnvShapeEditor from './EnvShapeEditor';
import useDraggable from './useDraggable';
import SoundPicker,{soundList,nextSound} from './SoundPicker';
import {SHAPE_KEYS} from './envShape';
import RackPanel from '../effects/RackPanel';
import RackCompact from '../effects/RackCompact';
import Desk,{onSynth} from './Desk';
import {leanChain} from '../effects/rackParts';
import {maskFromUnits,chainUnits,DEFAULT_CHAIN} from '../effects/order';
import {syncedDelayMs} from '../effects/rackParts';
import {RACK_PARAMS,SPACE_KEYS,cleanRack,rackForPatch,instrumentSpecKeys,spaceUnitsUsed,rackPlayedKeys,splitRackEdits} from '../effects/params';
const MOVED={moved:true};
import {serveRack} from '../effects/connection';
import EmbeddedShell,{useEnsemblePanel} from './EmbeddedShell';

// Everything a /synths page shares: audio start, MIDI piano, computer keys,
// sounds (factory + saved), setup, the ribbon/pad/keys strip and screen wake.
// A page supplies its synth definition and draws its own panel.
import {SETUP_KEY,SETUP,CURVES,computerKeyVelocity} from './setup';
export {SETUP_KEY};
// the comparison-bank bar (Compare presets) is hidden for now; its code stays
const SHOW_COMPARISON=false;
const dirty=name=>name.endsWith(' *')?name:name+' *';
function clearComparisonLink(){
 const url=new URL(window.location.href);
 if(!url.searchParams.has('bank')&&!url.searchParams.has('program')&&!url.hash.startsWith('#drum='))return;
 if(url.hash.startsWith('#drum='))url.hash='';
 url.searchParams.delete('bank');url.searchParams.delete('program');window.history.replaceState(null,'',url.href);
}

/**
 * synth: entry from ../models. children({values,control,group,replaceValues}) draws the panel.
 * expand(key,value) may return several keys to edit together (CS-80 channel linking), or an object of keys with their own values (the 106's chorus mode).
 * libraries: extra shelves beside the sound buttons, [{id,label,render({choose,values,current})}].
 * startEngine(options): optional host for another existing engine, using the
 * same note/control/scope contract as startLiveSynth.
 * onChoose(sound): called before a sound loads (the vector synth switches waves for its own sounds).
 * engineOptions(): extra options for the engine when it starts (the vector synthesizer's waves); onEngine(live): called with the running engine; onStats(data): every engine report (the sequencer playhead); onMidiRealtime(status): MIDI clock, start, continue and stop bytes.
 */
export default function SynthShell(props){
 const embedded=useEnsemblePanel();
 return embedded?(embedded.bound?<BoundShell {...props}/>:<EmbeddedShell {...props}/>):<StandaloneShell {...props}/>;
}
// The page's own panel (its sound bar, its nav and its boxes of controls: the `.rig` of the standalone page) driven by a host that owns the values and the sound, with none of
// the page's audio, header, desk or keyboard. /synths/all draws a voice's synth this way. The host's `effects` ({open,values,onChange,instrumentSpecs,tools}) shows the effects
// rack alongside the panel, as the page's Effects button does.
function BoundShell({synth,className='',panelClassName='',expand,nav=null,libraries=[],picker:Picker=SoundPicker,soundsInDevice=false,toggles=false,compactRack=true,children}){
 const host=useEnsemblePanel(),{values,effects}=host,{params:{BY_KEY},presets}=synth;
 const replaceValues=next=>host.onChange(synth.params.sanitize(next));
 const change=(key,value)=>{const more=expand?.(key,value)??[key],edits=Array.isArray(more)?Object.fromEntries(more.map(k=>[k,value])):more;replaceValues({...values,...edits});};
 const {control,group}=usePanelKit({BY_KEY,values,change,toggles});
 const [shelf,setShelf]=useState('sounds'),library=libraries.find(l=>l.id===shelf),current=host.current;
 const open=!!effects?.open,fullRack=open&&!compactRack;
 const soundBar=(
  <nav className={'presets'+(library?' shelf-'+library.id:'')} aria-label="Sounds">
   {libraries.length>0&&<span className="shelf-switch" role="radiogroup" aria-label="Sound shelf">
    {[{id:'sounds',label:'Sounds'},...libraries].map(l=><button type="button" key={l.id} role="radio" aria-checked={shelf===l.id} onClick={()=>setShelf(l.id)}>{l.label}</button>)}
   </span>}
   {library?library.render({choose:host.choose,values,current,rack:effects?.values??{}}):<Picker synth={synth} presets={presets} mine={[]} current={current} currentCategory={host.category} choose={host.choose} remove={()=>{}} values={values} change={change} replaceValues={replaceValues} save={()=>{}}/>}
  </nav>
 );
 return <div className={'synth instrument bound '+className+(fullRack?' rack-open':'')}>
  <div className="rig">
   {!soundsInDevice&&soundBar}
   {!fullRack&&nav}
   <main className={'panel'+(fullRack?' rack-panel':' '+panelClassName)}>
    {!fullRack&&children({values,control,group,change,replaceValues,patch:{current:{name:current,values}},choose:host.choose,current,soundBar,rack:effects?.values??{}})}
    {open&&compactRack&&<RackCompact values={effects.values} onChange={effects.onChange} instrumentSpecs={effects.instrumentSpecs??[]} tools={effects.tools} onClose={effects.onClose} posKey={effects.posKey} home={effects.home}/>}
    {fullRack&&<RackPanel values={effects.values} onChange={effects.onChange} instrumentSpecs={effects.instrumentSpecs??[]} tools={effects.tools}/>}
   </main>
  </div>
 </div>;
}
function StandaloneShell({synth,className='',headerExtras=null,nav=null,panelClassName='',expand,libraries=[],picker:Picker=SoundPicker,gridKeys=false,toggles=false,startEngine=startLiveSynth,engineOptions,onEngine,onStats,onMidiRealtime,onComparisonWaves,initialPatch,onChoose,compactRack=true,keyboard=true,helpInBar=false,soundsInDevice=false,children}){
 const {params:{BY_KEY,sanitize},presets}=synth,toPairs=synth.params.toEnginePairs??synth.params.toPairs;
 const PATCH_KEY=`synths:${synth.id}:patch`,MINE_KEY=`synths:${synth.id}:mine`;
 const [patch,setPatch]=useState(()=>{
  const stored=initialPatch??load(PATCH_KEY,null);
  return stored?.values?{name:String(stored.name??'Custom'),values:sanitize(stored.values)}:{name:presets[0].name,values:{...presets[0].values}};
 });
 const [mine,setMine]=useState(()=>(load(MINE_KEY,[])||[]).filter(p=>p?.name&&p.values).map(p=>({name:String(p.name),values:sanitize(p.values),...(p.rack?{rack:RACK_PARAMS.sanitize(p.rack)}:{})})));
 const RACK_KEY=`synths:${synth.id}:rack`;
 // a rack that came with a sound (its own crusher) belongs to that sound: it is not kept for the next one, nor stored
 const ownedRack=useRef(false);
 // a rack that has not been touched holds only the effects the sound uses, not every unit with its mix at nothing
 const [outboard,setOutboard]=useState(()=>{
  const stored=initialPatch?.rack??load(RACK_KEY,null),rack=RACK_PARAMS.sanitize({...cleanRack(),...(stored??{})});
  // a sound's own crusher (divide 4, a mix of 15, 20 or 30%) was once kept in the rack for every sound after it: let it go
  if(stored&&rack['crusher.divide']===4&&[.15,.2,.3].some(m=>Math.abs(rack['crusher.mix']-m)<.001))rack['master.chain']=maskFromUnits(chainUnits(rack['master.chain']).filter(u=>u!=='crusher'));
  return stored?rack:{...rack,'master.chain':leanChain(rackForPatch(synth,patch.values,rack,MOVED))};
 });
 // the effects box stays as it was left across a refresh
 const EFFECTS_KEY=`synths:${synth.id}:effects-open`;
 const [showEffects,setShowEffectsNow]=useState(()=>!!load(EFFECTS_KEY,false));
 const setShowEffects=useCallback(next=>setShowEffectsNow(v=>{const open=typeof next==='function'?next(v):next;save(EFFECTS_KEY,open);return open;}),[EFFECTS_KEY]);
 // compactRack: the effects open as a small popover over the instrument instead of replacing its panel
 const fullRack=showEffects&&!compactRack;
 const [sessionId]=useState(()=>globalThis.crypto?.randomUUID?.()??`rack-${Date.now()}-${Math.random().toString(36).slice(2)}`);
 const rackValues=useMemo(()=>rackForPatch(synth,patch.values,outboard,MOVED),[synth,patch.values,outboard]);
 const instrumentSpecs=useMemo(()=>instrumentSpecKeys(synth).map(k=>({...BY_KEY[k],key:'instrument.'+k,label:k.includes('chorus')?k.endsWith('Rate')?'Chorus rate':k.endsWith('Depth')?'Chorus depth':'Chorus mix':k==='reverbMix'?'Reverb mix':BY_KEY[k].label})),[synth,BY_KEY]);
 const [setup,setSetup]=useState(()=>{const stored={...SETUP,...load(SETUP_KEY,{})};if(!['auto','show','hide'].includes(stored.keys))stored.keys='auto';return stored;});
 const [showSetup,setShowSetup]=useState(false);
 const SHELF_KEY=`synths:${synth.id}:shelf`;
 // the instrument's case and the keyboard box can each be moved by their grip, and are remembered
 const rigDrag=useDraggable(`synths:${synth.id}:rig-pos`),keysDrag=useDraggable('synths:keys-pos',s=>onSynth('diy-fm','wt','dx7','minimoog','prophet','jupiter','obxa')?{x:0,y:10}:onSynth('cs80','juno')?{x:0,y:73}:({x:Math.round(s.w*.222),y:Math.round(s.h*.208)}));
 const [showHelp,setShowHelp]=useState(false),helpRef=useRef(null);
 useEffect(()=>{
  if(!showHelp)return undefined;
  const away=e=>{if(!helpRef.current?.contains(e.target))setShowHelp(false);},key=e=>{if(e.key==='Escape')setShowHelp(false);};
  document.addEventListener('pointerdown',away);window.addEventListener('keydown',key);
  return ()=>{document.removeEventListener('pointerdown',away);window.removeEventListener('keydown',key);};
 },[showHelp]);
 const [shelf,setShelf]=useState(()=>{const s=load(SHELF_KEY,'sounds');return libraries.some(l=>l.id===s)?s:'sounds';});
 const pickShelf=id=>{setShelf(id);save(SHELF_KEY,id);};
 const library=libraries.find(l=>l.id===shelf);
 const [audio,setAudio]=useState({state:'off',message:''});
 const [comparisonPending,setComparisonPending]=useState(()=>SHOW_COMPARISON&&new URLSearchParams(window.location.search).has('bank'));
 const [stats,setStats]=useState({active:0,peak:0});
 const [notes,setNotes]=useState([]);
 const [pedal,setPedal]=useState(false);
 const [scope,setScope]=useState(()=>load('synths:scope:open',false)===true);
 const toggleScope=()=>setScope(v=>{save('synths:scope:open',!v);return !v;});
 const [midi,setMidi]=useState({inputs:[],status:'Not connected.'});
 const engine=useRef(null),patchRef=useRef(patch),setupRef=useRef(setup),expandRef=useRef(expand),rackRef=useRef(rackValues),relayRef=useRef(null),rackApi=useRef(null),statsRef=useRef(stats);
 const onStatsRef=useRef(onStats);onStatsRef.current=onStats;
 const realtimeRef=useRef(onMidiRealtime);realtimeRef.current=onMidiRealtime;
 patchRef.current=patch;setupRef.current=setup;expandRef.current=expand;rackRef.current=rackValues;
 const performer=useMemo(()=>new Performer(null,{onNotes:setNotes}),[]);
 const [audition,setAudition]=useState(()=>({follow:true,...DEFAULT_HARMONY,...load('synths:audition',{})}));
 const [phrasePlaying,setPhrasePlaying]=useState(null);
 const [chordPick,setChordPick]=useState(0); // 0: none, else the dock's chord (1-4) shown on the keys
 const context=useMemo(()=>audition.follow?recalledContext():buildContext(audition),[audition]);
 const contextRef=useRef(context);contextRef.current=context;
 const phrases=useMemo(()=>createPhraseRunner(performer,{context:()=>contextRef.current,onState:setPhrasePlaying}),[performer]);
 const changeAudition=next=>{setAudition(next);save('synths:audition',next);};
 const audioOn=useRef(false);audioOn.current=audio.state==='on';

 // persistence (debounced: faders change values many times a second)
 useSaved(PATCH_KEY,patch);
 useSaved(RACK_KEY,outboard,{skip:()=>ownedRack.current});
 useEffect(()=>{engine.current?.setRack(rackValues);relayRef.current?.publish();},[rackValues]);
 useEffect(()=>{save(SETUP_KEY,{...load(SETUP_KEY,{}),...setup});},[setup]);

 const change=useCallback((key,value)=>{
  clearComparisonLink();
  // expand may name more keys to edit with it (the same value), or give each its own value
  const more=expandRef.current?.(key,value)??[key],edits=Array.isArray(more)?Object.fromEntries(more.map(k=>[k,value])):more;
  setPatch(p=>({name:dirty(p.name),values:{...p.values,...edits}}));
  for(const [k,v]of Object.entries(edits))if(!(synth.params.silentKeys??rackPlayedKeys(synth)).includes(k))engine.current?.setParam(BY_KEY[k].id,v);
 },[BY_KEY,synth]);
 const replaceValues=useCallback(values=>{clearComparisonLink();engine.current?.setParams(toPairs(values));setPatch(p=>({name:dirty(p.name),values}));},[toPairs]);
 const onChooseRef=useRef(onChoose);onChooseRef.current=onChoose;
 const choose=useCallback(next=>{onChooseRef.current?.(next);if(!next.comparison)clearComparisonLink();if(next.comparison)setOutboard(cleanRack());
  else if(next.rack){const rack=RACK_PARAMS.sanitize(next.rack);ownedRack.current=!!next.rackLean;setOutboard(next.rackLean?{...rack,'master.chain':leanChain(rackForPatch(synth,next.values,rack,MOVED))}:rack);}
  // choosing a sound leaves the rack's settings and order and keeps in the chain only the effects the sound uses (and any the player has turned up)
  else{
   // the sound before it brought its own rack: start again from a clean one
   const fresh=ownedRack.current;ownedRack.current=false;
   setOutboard(o=>{
    const base=fresh?cleanRack():{...o};
    // a sound with a reverb of its own brings the rack's reverb into the chain, even if the last sound had none
    if(spaceUnitsUsed(synth,next.values).length)base['master.chain']=maskFromUnits([...new Set([...chainUnits(base['master.chain']??DEFAULT_CHAIN),...spaceUnitsUsed(synth,next.values)])]);
    return {...base,'master.chain':leanChain(rackForPatch(synth,next.values,base,MOVED))};});
  }setPatch({name:next.name,category:next.cat??next.category,values:{...next.values},...(next.comparison?{comparison:next.comparison}:{})});engine.current?.setParams(toPairs(next.values));},[toPairs,synth]);
 const changeRack=useCallback(changes=>{
  const {native,extra}=splitRackEdits(synth,changes,MOVED);
  if(!Object.keys(native).length&&!Object.keys(extra).length)return;
  clearComparisonLink();
  for(const [key,v]of Object.entries(native))if(!(synth.params.silentKeys??rackPlayedKeys(synth)).includes(key))engine.current?.setParam(BY_KEY[key].id,v);
  setPatch(p=>({name:dirty(p.name),values:{...p.values,...native}}));
  if(Object.keys(extra).length)setOutboard(p=>({...p,...extra}));
 },[synth,BY_KEY]);
  // a synced delay follows the instrument's tempo (the drum machines have one)
 const rackTempo=typeof patch.values.tempo==='number'?patch.values.tempo:0;
 useEffect(()=>{
  const division=rackValues['master.sync'];
  if(!division||!rackTempo)return;
  const ms=syncedDelayMs(division,rackTempo);
  if(ms&&Math.abs((rackValues['effects.delayMs']??0)-ms)>0.5)changeRack({'effects.delayMs':ms});
 },[rackValues,rackTempo,changeRack]);
 rackApi.current={snapshot:()=>({synth:synth.id,name:synth.name,audio:audio.state,values:rackRef.current,instrumentSpecs,peak:statsRef.current.peak,reduction:statsRef.current.reduction??0}),edit:changeRack,clear:()=>engine.current?.clearRack()};
 useEffect(()=>{
  const relay=serveRack({id:sessionId,snapshot:()=>rackApi.current.snapshot(),edit:v=>rackApi.current.edit(v),clear:()=>rackApi.current.clear()});relayRef.current=relay;
  const close=e=>{if(!e.persisted)relay.close();},visible=()=>{if(document.visibilityState==='visible')relay.publish();};window.addEventListener('pagehide',close);document.addEventListener('visibilitychange',visible);
  return()=>{window.removeEventListener('pagehide',close);document.removeEventListener('visibilitychange',visible);relay.close();relayRef.current=null;};
 },[sessionId]);
 useEffect(()=>{relayRef.current?.publish();},[audio.state]);
 const saveMine=()=>{
  const name=window.prompt('Name this sound',patch.name.replace(/ \*$/,''));if(!name)return;
  const entry={name:name.slice(0,40),values:{...patch.values},rack:{...outboard}};
  setMine(list=>{const next=[...list.filter(p=>p.name!==entry.name),entry];save(MINE_KEY,next);return next;});
  setPatch(p=>({...p,name:entry.name}));
 };
 const removeMine=name=>{if(!window.confirm(`Delete “${name}”?`))return;setMine(list=>{const next=list.filter(p=>p.name!==name);save(MINE_KEY,next);return next;});};

 // inputs
 const velocity=useCallback(v=>mapVelocity(v,CURVES[setupRef.current.velocity]??CURVES.normal),[]);
 const midiRef=useRef(null),programRef=useRef(null);
 useEffect(()=>{
  const m=new LabMidi({
   on:(key,note,v)=>performer.down(key,note,velocity(v)),
   off:key=>performer.up(key),
   sustain:down=>{setPedal(down);performer.control('sustain',down?1:0);},
   control:(name,value)=>{
    if(name==='bend')performer.source('wheel',value/2*setupRef.current.wheelRange);
    else if(name==='pressure')performer.source('aftertouch',value);
    else if(name==='motion')performer.source('wheelMod',value);
    else if(name==='level')performer.control('expression',value);
    else if(name==='brightness')performer.control('brightness',value);
   },
   polyPressure:(key,value)=>performer.pressure(key,value),
   soft:value=>performer.control('soft',value),
   realtime:status=>realtimeRef.current?.(status),
   program:number=>programRef.current?.(number),
   panic:()=>{performer.releaseAll();performer.control('sustain',0);setPedal(false);},
   onStatus:inputs=>setMidi({inputs,status:inputs.length?`${inputs.length} MIDI input${inputs.length>1?'s':''} connected.`:'MIDI ready · plug in your piano.'}),
  });
  m.selected=setupRef.current.midiDevice;m.channel=setupRef.current.midiChannel;midiRef.current=m;
  const keyboard=bindLabKeyboard(window,{on:(key,note)=>performer.down(key,note,computerKeyVelocity(setupRef.current)),off:key=>performer.up(key),panic:()=>performer.panic(),octave:()=>Math.floor(setupRef.current.keysLow/12)-1,shift:d=>setSetup(s=>({...s,keysLow:Math.min(84,Math.max(24,s.keysLow+12*d))}))});
  const blur=()=>performer.releaseLocal();window.addEventListener('blur',blur);
  return ()=>{keyboard();m.dispose();window.removeEventListener('blur',blur);performer.panic();engine.current?.close();engine.current=null;};
 },[performer,velocity]);
 const connectMidi=async()=>{try{await midiRef.current.connect();}catch(e){setMidi(m=>({...m,status:e.message}));}};

 // Sound hotkeys: ← → the previous/next sound, ↑ ↓ the first sound of the previous/next category,
 // N a new generated sound in the current category (synths with a generator), 1-5 an audition phrase
 // on the current sound (short bass, slow bass, chord, arpeggio, lead; Esc stops it). Not while typing or
 // on a slider; MIDI Program Change picks a sound by number.
 const hotkeys=useRef(null);
 hotkeys.current={list:soundList(synth,presets,mine),current:patch.name.replace(/ \*$/,''),category:patch.category,choose};
 // gridKeys: the sounds sit in a bank-by-number grid (the Juno's), so ← → move along the row and ↑ ↓ to the bank above or below
 const stepSound=(dir,jump)=>{
  const h=hotkeys.current;
  if(gridKeys){
   const sounds=h.list.sounds.filter(p=>p.cat!=='mine'),n=sounds.length,at=sounds.findIndex(p=>p.name===h.current);
   if(!n)return false;
   const step=jump?8:1,i=at<0?(dir>0?0:n-1):jump&&dir>0&&at+8>=n?at%8:jump&&dir<0&&at-8<0?Math.floor((n-1-(at%8))/8)*8+(at%8):(at+dir*step+n)%n;
   h.choose(sounds[Math.min(i,n-1)]);return true;
  }
  const next=nextSound(h.list,h.current,h.category,dir,jump);if(next)h.choose(next);return !!next;
 };
 const makeSound=()=>{
  const h=hotkeys.current;if(!synth.generate)return false;
  const here=h.list.sounds.find(p=>p.name===h.current)?.cat??h.category;
  const category=synth.generates?.includes(here)?here:synth.generates?.[0];
  if(category)h.choose(synth.generate(category,Math.floor(Math.random()*1e9)));
  return !!category;
 };
 useEffect(()=>{
  const key=e=>{
   if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target?.closest?.('input,select,textarea,[contenteditable=true],[role=slider],.sp,.env-shape'))return;
   const phrase=phraseForCode(e.code);
   if(phrase){if(!keyboard)return;if(audioOn.current){e.preventDefault();phrases.play(phrase);}return;}
   const arrow={ArrowLeft:[-1,false],ArrowRight:[1,false],ArrowUp:[-1,true],ArrowDown:[1,true]}[e.key];
   if(arrow){if(!e.target?.closest?.('.sound-grid')&&stepSound(...arrow))e.preventDefault();}
   else if(e.code==='KeyN'&&makeSound())e.preventDefault();
  };
  const escape=e=>{if(e.key==='Escape')phrases.stop();};
  window.addEventListener('keydown',key);window.addEventListener('keydown',escape);
  return ()=>{window.removeEventListener('keydown',key);window.removeEventListener('keydown',escape);phrases.stop();};
 },[synth,phrases]);
 programRef.current=number=>{const {sounds}=hotkeys.current.list;if(sounds.length)hotkeys.current.choose(sounds[number%sounds.length]);};

 // keep the screen awake while the synth is on
 useEffect(()=>{
  if(audio.state!=='on'||!navigator.wakeLock)return;
  let lock=null,alive=true;
  const request=()=>navigator.wakeLock.request('screen').then(l=>{if(alive)lock=l;else l.release();}).catch(()=>{});
  const visible=()=>{if(document.visibilityState==='visible')request();};
  request();document.addEventListener('visibilitychange',visible);
  return ()=>{alive=false;lock?.release().catch(()=>{});document.removeEventListener('visibilitychange',visible);};
 },[audio.state]);

 const start=()=>{
  if(audio.state==='starting'||comparisonPending)return;
  setAudio({state:'starting',message:'Waking the oscillators…'});
  const previous=engine.current;engine.current=null;previous?.close();
  startEngine({model:synth.model,params:toPairs(patchRef.current.values),rack:rackRef.current,...(engineOptions?.()??{}),latency:setupRef.current.latency,onStats:data=>{statsRef.current=data;onStatsRef.current?.(data);setStats(s=>Math.abs(s.peak-data.peak)<.02&&s.active===data.active&&Math.abs((s.reduction??0)-(data.reduction??0))<.1?s:data);},onError:e=>setAudio({state:'error',message:e.message})})
   .then(live=>{engine.current=live;live.setParams(toPairs(patchRef.current.values));live.setRack(rackRef.current);onEngine?.(live);performer.setTarget(live);performer.restore({sustain:pedal?1:0});setAudio({state:'on',message:`${live.context.sampleRate/1000} kHz · ${Math.round(live.latency*1000)} ms output`});})
   .catch(e=>setAudio({state:'error',message:e.message}));
  if(!midiRef.current.access)connectMidi();
 };
 const updateSetup=(key,value)=>{
  setSetup(s=>({...s,[key]:value}));
  if(key==='midiDevice'){performer.releaseAll();midiRef.current.selected=value;}
  if(key==='midiChannel'){performer.releaseAll();midiRef.current.channel=value;}
 };
 const fullscreen=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});};

 const {control,group}=usePanelKit({BY_KEY,values:patch.values,change,toggles});
 // With a MIDI piano attached the on-screen keys only take space from the panel.
  const showKeys=keyboard&&setup.keys!=='hide'; // the header's keyboard button; on unless it was switched off
 const keyLines=['1–5 · phrases','Esc · stops',...(gridKeys?['← → · patch','↑ ↓ · bank']:['← → · sound','↑ ↓ · kind']),...(synth.generate?['N · new sound']:[]),'A S D F G H J K · play notes (W E T Y U for the black keys)','Z X · octave',...(midi.inputs.length?['Your MIDI keyboard plays too']:[])];
 const current=patch.name.replace(/ \*$/,'');
 const maxVoices=patch.values.voices??patch.values['global.polyphony']??(synth.id==='vs'?8:synth.id==='minimoog'?1:null);

 const soundBar=(
  <nav className={'presets'+(library?' shelf-'+library.id:'')} aria-label="Sounds">
   {libraries.length>0&&<span className="shelf-switch" role="radiogroup" aria-label="Sound shelf">
    {[{id:'sounds',label:'Sounds'},...libraries].map(l=><button type="button" key={l.id} role="radio" aria-checked={shelf===l.id} onClick={()=>pickShelf(l.id)}>{l.label}</button>)}
   </span>}
   {library?library.render({choose,values:patch.values,current,rack:outboard}):<>
   <Picker synth={synth} presets={presets} mine={mine} current={current} currentCategory={patch.category} choose={choose} remove={removeMine} values={patch.values} change={change} replaceValues={replaceValues} save={saveMine}/>
   {!soundsInDevice&&<button type="button" className="save" onClick={saveMine}>＋ Save sound</button>}
   </>}
  </nav>
 );

 return <div className={'synth instrument '+className+(fullRack?' rack-open':'')+(showEffects&&compactRack?' rack-popover':'')}>
  <header className="synth-bar">
   <a className="back" href={import.meta.env.BASE_URL+'synths/'} aria-label="All synths">◂</a>
   <h1><span className="brand">{synth.name}</span><small>{synth.subtitle}</small></h1>
   <span className="patch-name" title={patch.name}>{patch.name}</span>
   <span className="meter" aria-label={`${stats.active} voices playing`}><span className="meter-fill" style={{width:Math.min(100,stats.peak*100)+'%'}}/><b>{stats.active}</b>{maxVoices!==null&&<>/{maxVoices}</>}</span>
   {pedal&&<span className="pill">Pedal</span>}
   {typeof headerExtras==='function'?headerExtras({values:patch.values,rack:outboard,name:patch.name,choose}):headerExtras}
   <button type="button" aria-pressed={showEffects} aria-label="Effects rack" onClick={()=>setShowEffects(v=>!v)}>Effects</button>
   <button type="button" aria-pressed={scope} onClick={toggleScope} title="Oscilloscope and spectrum">Scope</button>
   <button type="button" aria-pressed={showSetup} onClick={()=>setShowSetup(v=>!v)} aria-label="Setup">⚙</button>
   <button type="button" onClick={()=>{phrases.stop();performer.panic();}} title="Silence everything (Esc)">Panic</button>
   <button type="button" onClick={fullscreen} aria-label="Full screen">⛶</button>
   {keyboard&&helpInBar&&<span className="help-wrap" ref={helpRef}>
    <button type="button" aria-pressed={showHelp} aria-expanded={showHelp} aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={()=>setShowHelp(v=>!v)}>?</button>
    {showHelp&&<div className="help-pop" role="dialog" aria-label="Keyboard shortcuts"><b>Keys</b><ul>{keyLines.map(l=><li key={l}>{l}</li>)}</ul></div>}
   </span>}
   {keyboard&&<button type="button" className="keys-button" aria-pressed={showKeys} onClick={()=>updateSetup('keys',showKeys?'hide':'show')} aria-label="On-screen keyboard" title="Show or hide the on-screen keyboard">🎹</button>}
  </header>

  <Desk>
  {SHOW_COMPARISON&&<ComparisonPresets synth={synth} choose={choose} onWaves={onComparisonWaves} onBusy={setComparisonPending} patch={patch}/>}

  {scope&&<Scope engine={engine} audio={audio.state} onClose={toggleScope} keyHz={()=>performer.lastNote==null?0:440*2**((performer.lastNote-69)/12)}/>}

  <div className="rig" ref={rigDrag.ref} style={rigDrag.style}>
  <div className="grip rig-grip" {...rigDrag.handle} role="presentation"><i/></div>
  {!soundsInDevice&&soundBar}

  {!fullRack&&nav}

  <main className={'panel'+(fullRack?' rack-panel':' '+panelClassName)}>
   {!fullRack&&children({values:patch.values,control,group,change,replaceValues,patch:patchRef,choose,current,soundBar,rack:rackValues})}
   {showEffects&&compactRack&&<RackCompact tempo={rackTempo} values={rackValues} onChange={changeRack} instrumentSpecs={instrumentSpecs} peak={stats.peak} reduction={stats.reduction??0} onClose={()=>setShowEffects(false)}
    tools={<button type="button" onClick={()=>engine.current?.clearRack()}>Clear tails</button>}/>}
   {fullRack&&<RackPanel tempo={rackTempo} values={rackValues} onChange={changeRack} instrumentSpecs={instrumentSpecs} peak={stats.peak} reduction={stats.reduction??0}
    tools={<><button type="button" onClick={()=>engine.current?.clearRack()}>Clear rack tails</button><button type="button" onClick={()=>setShowEffects(false)}>Back to synth</button><a href={`${import.meta.env.BASE_URL}synths/effects/?target=${encodeURIComponent(sessionId)}`} target="_blank" rel="noopener noreferrer">Open in a tab ↗</a></>}/>}
  </main>
  </div>
  {showSetup&&<SetupPopover midi={midi} setup={setup} updateSetup={updateSetup} connectMidi={connectMidi} audio={audio} start={start} onClose={()=>setShowSetup(false)}/>}

  <footer className="perform">
   {showKeys&&<StageKeys drag={keysDrag} size={setup.keysSize} controls={setup.keysControls} onLayout={updateSetup} low={setup.keysLow} onLow={v=>updateSetup('keysLow',v)} notes={notes} context={context} chord={chordPick}
    onDown={(key,note,v)=>performer.down(key,note,velocity(v??.75))} onUp={key=>performer.up(key)} onMod={v=>performer.source('wheelMod',v)}
    head={<>
     <AutoPlay playing={phrasePlaying} onPlay={id=>{if(audio.state==='on')phrases.play(id);}} onStop={()=>phrases.stop()} sounds={{make:makeSound,canMake:!!synth.generate}}/>
     <ChordChips context={context} chordPick={chordPick} onChordPick={i=>setChordPick(p=>p===i?0:i)} audition={audition} onAudition={changeAudition}/>
    </>}
    left={<Ribbon vertical range={setup.ribbonRange} onBend={b=>performer.source('ribbon',b)}/>}
    right={<TouchPad onTouch={(pressure,mod)=>{performer.source('pad',pressure);performer.source('padMod',mod);}}/>}/>}
   {keyboard&&!helpInBar&&<p className="dock-keys stage-help">`Keys: 1–5 phrases · Esc stops · ${gridKeys?"← → patch · ↑ ↓ bank":"← → sound · ↑ ↓ kind"}${synth.generate?' · N new sound':''} · A S D F G H J K play notes (W E T Y U black keys) · Z X octave${midi.inputs.length?' · your MIDI keyboard plays too':''}`</p>}
  </footer>
  </Desk>

  {audio.state!=='on'&&<button type="button" className={'wake '+audio.state} onClick={start} disabled={comparisonPending}>
   <span className="wake-title">{comparisonPending?'Loading comparison…':audio.state==='starting'?'Starting…':audio.state==='error'?'Tap to try again':'Tap to start'}</span>
   <span className="wake-note">{audio.state==='error'?audio.message:'Sound and MIDI start together. Play your piano, the on-screen keys or the computer keyboard (A–K row).'}</span>
  </button>}
 </div>;
}
