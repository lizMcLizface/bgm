import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Fader,Choice,Ribbon,TouchPad,Keys} from './controls';
import {startLiveSynth} from '../engine/liveSynth';
import {Performer} from '../engine/performer';
import {LabMidi,bindLabKeyboard,mapVelocity} from '../../labs/input';
import {load,save} from '../storage';
import Scope from './Scope';
import ComparisonPresets from './ComparisonPresets';
import EnvShapeEditor from './EnvShapeEditor';
import SoundPicker,{soundList,nextSound} from './SoundPicker';
import {SHAPE_KEYS} from './envShape';
import RackPanel from '../effects/RackPanel';
import {RACK_PARAMS,SPACE_KEYS,cleanRack,rackForPatch,instrumentSpaceKeys,splitRackEdits} from '../effects/params';
import {serveRack} from '../effects/connection';
import EmbeddedShell,{useEnsemblePanel} from './EmbeddedShell';

// Everything a /synths page shares: audio start, MIDI piano, computer keys,
// sounds (factory + saved), setup, the ribbon/pad/keys strip and screen wake.
// A page supplies its synth definition and draws its own panel.
export const SETUP_KEY='synths:setup';
const SETUP={midiDevice:'all',midiChannel:'all',velocity:'normal',ribbonRange:12,wheelRange:2,latency:'interactive',keys:'auto',keysLow:48,keysCount:25};
const CURVES={light:{curve:.6,floor:.08},normal:{curve:1,floor:.06},firm:{curve:1.6,floor:.04}};
const dirty=name=>name.endsWith(' *')?name:name+' *';
function clearComparisonLink(){
 const url=new URL(window.location.href);
 if(!url.searchParams.has('bank')&&!url.searchParams.has('program')&&!url.hash.startsWith('#drum='))return;
 if(url.hash.startsWith('#drum='))url.hash='';
 url.searchParams.delete('bank');url.searchParams.delete('program');window.history.replaceState(null,'',url.href);
}

/**
 * synth: entry from ../models. children({values,control,group,replaceValues}) draws the panel.
 * expand(key) may return several keys to edit together (CS-80 channel linking).
 * libraries: extra shelves beside the sound buttons, [{id,label,render({choose,values,current})}].
 * startEngine(options): optional host for another existing engine, using the
 * same note/control/scope contract as startLiveSynth.
 * onChoose(sound): called before a sound loads (the vector synth switches waves for its own sounds).
 * engineOptions(): extra options for the engine when it starts (the vector synthesizer's waves); onEngine(live): called with the running engine; onStats(data): every engine report (the sequencer playhead); onMidiRealtime(status): MIDI clock, start, continue and stop bytes.
 */
export default function SynthShell(props){
 const embedded=useEnsemblePanel();
 return embedded?<EmbeddedShell {...props}/>:<StandaloneShell {...props}/>;
}
function StandaloneShell({synth,className='',headerExtras=null,nav=null,panelClassName='',expand,libraries=[],startEngine=startLiveSynth,engineOptions,onEngine,onStats,onMidiRealtime,onComparisonWaves,initialPatch,onChoose,children}){
 const {params:{BY_KEY,sanitize,toPairs},presets}=synth;
 const PATCH_KEY=`synths:${synth.id}:patch`,MINE_KEY=`synths:${synth.id}:mine`;
 const [patch,setPatch]=useState(()=>{
  const stored=initialPatch??load(PATCH_KEY,null);
  return stored?.values?{name:String(stored.name??'Custom'),values:sanitize(stored.values)}:{name:presets[0].name,values:{...presets[0].values}};
 });
 const [mine,setMine]=useState(()=>(load(MINE_KEY,[])||[]).filter(p=>p?.name&&p.values).map(p=>({name:String(p.name),values:sanitize(p.values),...(p.rack?{rack:RACK_PARAMS.sanitize(p.rack)}:{})})));
 const RACK_KEY=`synths:${synth.id}:rack`;
 const [outboard,setOutboard]=useState(()=>RACK_PARAMS.sanitize({...cleanRack(),...(initialPatch?.rack??load(RACK_KEY,{}))}));
 const [showEffects,setShowEffects]=useState(false);
 const [sessionId]=useState(()=>globalThis.crypto?.randomUUID?.()??`rack-${Date.now()}-${Math.random().toString(36).slice(2)}`);
 const rackValues=useMemo(()=>rackForPatch(synth,patch.values,outboard),[synth,patch.values,outboard]);
 const instrumentSpecs=useMemo(()=>instrumentSpaceKeys(synth).map(k=>({...BY_KEY[k],key:'instrument.'+k,label:k.includes('chorus')?k.endsWith('Rate')?'Chorus rate':k.endsWith('Depth')?'Chorus depth':'Chorus mix':k==='reverbMix'?'Reverb mix':BY_KEY[k].label})),[synth,BY_KEY]);
 const [setup,setSetup]=useState(()=>{const stored={...SETUP,...load(SETUP_KEY,{})};if(!['auto','show','hide'].includes(stored.keys))stored.keys='auto';return stored;});
 const [showSetup,setShowSetup]=useState(false);
 const [shapeOpen,setShapeOpen]=useState(null);
 const closeShape=useCallback(()=>setShapeOpen(null),[]);
 const SHELF_KEY=`synths:${synth.id}:shelf`;
 const [shelf,setShelf]=useState(()=>{const s=load(SHELF_KEY,'sounds');return libraries.some(l=>l.id===s)?s:'sounds';});
 const pickShelf=id=>{setShelf(id);save(SHELF_KEY,id);};
 const library=libraries.find(l=>l.id===shelf);
 const [audio,setAudio]=useState({state:'off',message:''});
 const [comparisonPending,setComparisonPending]=useState(()=>new URLSearchParams(window.location.search).has('bank'));
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

 // persistence (debounced: faders change values many times a second)
 useEffect(()=>{const t=setTimeout(()=>save(PATCH_KEY,patch),300);return ()=>clearTimeout(t);},[patch,PATCH_KEY]);
 useEffect(()=>{const t=setTimeout(()=>save(RACK_KEY,outboard),300);return ()=>clearTimeout(t);},[outboard,RACK_KEY]);
 useEffect(()=>{engine.current?.setRack(rackValues);relayRef.current?.publish();},[rackValues]);
 useEffect(()=>{save(SETUP_KEY,{...load(SETUP_KEY,{}),...setup});},[setup]);

 const change=useCallback((key,value)=>{
  clearComparisonLink();
  const keys=expandRef.current?.(key)??[key];
  setPatch(p=>{const values={...p.values};for(const k of keys)values[k]=value;return {name:dirty(p.name),values};});
  for(const k of keys)engine.current?.setParam(BY_KEY[k].id,value);
 },[BY_KEY]);
 const replaceValues=useCallback(values=>{clearComparisonLink();engine.current?.setParams(toPairs(values));setPatch(p=>({name:dirty(p.name),values}));},[toPairs]);
 const onChooseRef=useRef(onChoose);onChooseRef.current=onChoose;
 const choose=useCallback(next=>{onChooseRef.current?.(next);if(!next.comparison)clearComparisonLink();if(next.comparison)setOutboard(cleanRack());else if(next.rack)setOutboard(RACK_PARAMS.sanitize(next.rack));setPatch({name:next.name,category:next.cat??next.category,values:{...next.values},...(next.comparison?{comparison:next.comparison}:{})});engine.current?.setParams(toPairs(next.values));},[toPairs]);
 const changeRack=useCallback(changes=>{
  const {native,extra}=splitRackEdits(synth,changes);
  if(!Object.keys(native).length&&!Object.keys(extra).length)return;
  clearComparisonLink();
  for(const [key,v]of Object.entries(native))engine.current?.setParam(BY_KEY[key].id,v);
  setPatch(p=>({name:dirty(p.name),values:{...p.values,...native}}));
  if(Object.keys(extra).length)setOutboard(p=>({...p,...extra}));
 },[synth,BY_KEY]);
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
  const keyboard=bindLabKeyboard(window,{on:(key,note)=>performer.down(key,note,.75),off:key=>performer.up(key),panic:()=>performer.panic(),octave:()=>Math.floor(setupRef.current.keysLow/12)-1,shift:d=>setSetup(s=>({...s,keysLow:Math.min(84,Math.max(24,s.keysLow+12*d))}))});
  const blur=()=>performer.releaseLocal();window.addEventListener('blur',blur);
  return ()=>{keyboard();m.dispose();window.removeEventListener('blur',blur);performer.panic();engine.current?.close();engine.current=null;};
 },[performer,velocity]);
 const connectMidi=async()=>{try{await midiRef.current.connect();}catch(e){setMidi(m=>({...m,status:e.message}));}};

 // Sound hotkeys: ← → the previous/next sound, ↑ ↓ the first sound of the previous/next category,
 // N a new generated sound in the current category (synths with a generator). Not while typing or
 // on a slider; MIDI Program Change picks a sound by number.
 const hotkeys=useRef(null);
 hotkeys.current={list:soundList(synth,presets,mine),current:patch.name.replace(/ \*$/,''),category:patch.category,choose};
 useEffect(()=>{
  const key=e=>{
   if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target?.closest?.('input,select,textarea,[contenteditable=true],[role=slider],.sp,.env-shape'))return;
   const h=hotkeys.current,arrow={ArrowLeft:[-1,false],ArrowRight:[1,false],ArrowUp:[-1,true],ArrowDown:[1,true]}[e.key];
   if(arrow){const next=nextSound(h.list,h.current,h.category,...arrow);if(next){e.preventDefault();h.choose(next);}}
   else if(e.code==='KeyN'&&synth.generate){
    const here=h.list.sounds.find(p=>p.name===h.current)?.cat??h.category;
    const category=synth.generates?.includes(here)?here:synth.generates?.[0];
    if(category){e.preventDefault();h.choose(synth.generate(category,Math.floor(Math.random()*1e9)));}
   }
  };
  window.addEventListener('keydown',key);
  return ()=>window.removeEventListener('keydown',key);
 },[synth]);
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

 // Keys are parameter keys, or [key, label] where the table's label is ambiguous.
 const control=(entry,tone,prefix='')=>{
  const [key,label]=Array.isArray(entry)?[prefix+entry[0],entry[1]]:[prefix+entry];
  const spec=BY_KEY[key],short=label??spec.label;
  return spec.options
   ?<Choice key={key} spec={spec} value={patch.values[key]} options={spec.options} onChange={change} tone={tone} label={short}/>
   :<Fader key={key} spec={spec} value={patch.values[key]} onChange={change} tone={tone} label={short}/>;
 };
 // shape: {env:'amp'|'filter', a, d, s, r} adds the envelope curve editor; stage
 // entries are keys (prefixed like the group's) or functions of (values, prefix).
 const group=({title,tone,keys,shape},prefix='')=>{
  if(keys.every(k=>SPACE_KEYS.includes(prefix+(Array.isArray(k)?k[0]:k))))return null;
  const shaped=shape&&BY_KEY[SHAPE_KEYS[shape.env].mode],id=title+'|'+prefix,open=shaped&&shapeOpen?.id===id;
  const stage=key=>typeof key==='function'?key(patch.values,prefix):patch.values[prefix+key];
  return <section className="group" key={title} style={{'--n':keys.length}}>
   <h3>{title}{shaped&&<button type="button" className="shape-open" aria-expanded={!!open} title="Envelope curves" onClick={e=>{const anchor=e.currentTarget;setShapeOpen(o=>o?.id===id?null:{id,anchor});}}>Shape</button>}</h3>
   <div className="group-controls">{keys.map(k=>control(k,tone,prefix))}</div>
   {open&&<EnvShapeEditor env={shape.env} title={title} values={patch.values} BY_KEY={BY_KEY} change={change} anchor={shapeOpen.anchor} onClose={closeShape}
    times={{A:stage(shape.a),D:stage(shape.d),R:stage(shape.r),sustain:stage(shape.s)}}/>}
  </section>;
 };
 // With a MIDI piano attached the on-screen keys only take space from the panel.
 const showKeys=setup.keys==='show'||setup.keys==='auto'&&midi.inputs.length===0;
 const current=patch.name.replace(/ \*$/,'');
 const maxVoices=patch.values.voices??patch.values['global.polyphony']??(synth.id==='vs'?8:synth.id==='minimoog'?1:null);

 return <div className={'synth instrument '+className+(showEffects?' rack-open':'')}>
  <header className="synth-bar">
   <a className="back" href={import.meta.env.BASE_URL+'synths/'} aria-label="All synths">◂</a>
   <h1><span className="brand">{synth.name}</span><small>{synth.subtitle}</small></h1>
   <span className="patch-name" title={patch.name}>{patch.name}</span>
   <span className="meter" aria-label={`${stats.active} voices playing`}><span className="meter-fill" style={{width:Math.min(100,stats.peak*100)+'%'}}/><b>{stats.active}</b>{maxVoices!==null&&<>/{maxVoices}</>}</span>
   {pedal&&<span className="pill">Pedal</span>}
   {typeof headerExtras==='function'?headerExtras({values:patch.values,rack:outboard,name:patch.name}):headerExtras}
   <button type="button" aria-pressed={showEffects} aria-label="Effects rack" onClick={()=>{setShowSetup(false);setShowEffects(v=>!v);}}>Effects</button>
   <button type="button" aria-pressed={scope} onClick={toggleScope} title="Oscilloscope and spectrum">Scope</button>
   <button type="button" aria-pressed={showSetup} onClick={()=>setShowSetup(v=>!v)} aria-label="Setup">⚙</button>
   <button type="button" onClick={()=>performer.panic()} title="Silence everything (Esc)">Panic</button>
   <button type="button" onClick={fullscreen} aria-label="Full screen">⛶</button>
  </header>

  <ComparisonPresets synth={synth} choose={choose} onWaves={onComparisonWaves} onBusy={setComparisonPending} patch={patch}/>

  <nav className={'presets'+(library?' shelf-'+library.id:'')} aria-label="Sounds">
   {libraries.length>0&&<span className="shelf-switch" role="radiogroup" aria-label="Sound shelf">
    {[{id:'sounds',label:'Sounds'},...libraries].map(l=><button type="button" key={l.id} role="radio" aria-checked={shelf===l.id} onClick={()=>pickShelf(l.id)}>{l.label}</button>)}
   </span>}
   {library?library.render({choose,values:patch.values,current,rack:outboard}):<>
   <SoundPicker synth={synth} presets={presets} mine={mine} current={current} currentCategory={patch.category} choose={choose} remove={removeMine}/>
   <button type="button" className="save" onClick={saveMine}>＋ Save sound</button>
   </>}
  </nav>

  {scope&&<Scope engine={engine} audio={audio.state} onClose={toggleScope}/>}
  {!showSetup&&!showEffects&&nav}

  <main className={'panel'+(showSetup?'':showEffects?' rack-panel':' '+panelClassName)}>
   {!showSetup&&!showEffects&&children({values:patch.values,control,group,change,replaceValues,patch:patchRef})}
   {!showSetup&&showEffects&&<RackPanel values={rackValues} onChange={changeRack} instrumentSpecs={instrumentSpecs} peak={stats.peak} reduction={stats.reduction??0}
    tools={<><button type="button" onClick={()=>engine.current?.clearRack()}>Clear rack tails</button><button type="button" onClick={()=>setShowEffects(false)}>Back to synth</button><a href={`${import.meta.env.BASE_URL}synths/effects/?target=${encodeURIComponent(sessionId)}`} target="_blank" rel="noopener noreferrer">Open in a tab ↗</a></>}/>}
   {showSetup&&<div className="setup">
    <section className="group wide setup-done"><h3>Setup</h3><button type="button" onClick={()=>setShowSetup(false)}>Done · back to the panel</button></section>
    <section className="group wide"><h3>MIDI piano</h3>
     <p>{midi.status}</p>
     <div className="row">
      <button type="button" onClick={connectMidi}>Connect MIDI</button>
      <label>Input<select value={setup.midiDevice} onChange={e=>updateSetup('midiDevice',e.target.value)}><option value="all">All inputs</option>{setup.midiDevice!=='all'&&!midi.inputs.some(i=>i.id===setup.midiDevice)&&<option value={setup.midiDevice}>Saved input</option>}{midi.inputs.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
      <label>Channel<select value={setup.midiChannel} onChange={e=>updateSetup('midiChannel',e.target.value)}><option value="all">All</option>{Array.from({length:16},(_,i)=><option key={i} value={String(i+1)}>{i+1}</option>)}</select></label>
     </div>
     <div className="row">
      <label>Touch<select value={setup.velocity} onChange={e=>updateSetup('velocity',e.target.value)}><option value="light">Light (quiet playing speaks)</option><option value="normal">Normal</option><option value="firm">Firm (needs a strong touch)</option></select></label>
      <label>Pitch wheel<select value={setup.wheelRange} onChange={e=>updateSetup('wheelRange',Number(e.target.value))}>{[1,2,5,7,12].map(n=><option key={n} value={n}>±{n} st</option>)}</select></label>
     </div>
     <p className="hint">Sustain pedal holds notes; the soft pedal darkens and softens. Channel or polyphonic aftertouch, mod wheel (vibrato), expression (CC11) and CC74 brightness work if your keyboard sends them.</p>
    </section>
    <section className="group wide"><h3>Touch screen</h3>
     <div className="row">
      <label>Ribbon range<select value={setup.ribbonRange} onChange={e=>updateSetup('ribbonRange',Number(e.target.value))}>{[1,2,5,7,12,24].map(n=><option key={n} value={n}>±{n} st</option>)}</select></label>
      <label>On-screen keys<select value={setup.keys} onChange={e=>updateSetup('keys',e.target.value)}><option value="auto">Auto (hidden while MIDI is connected)</option><option value="show">Always show</option><option value="hide">Hide</option></select></label>
      <label>Keys from<select value={setup.keysLow} onChange={e=>updateSetup('keysLow',Number(e.target.value))}>{[24,36,48,60,72].map(n=><option key={n} value={n}>C{n/12-1}</option>)}</select></label>
     </div>
    </section>
    <section className="group wide"><h3>Audio</h3>
     <p>{audio.state==='on'?audio.message:'Audio is off.'}</p>
     <div className="row">
      <label>Latency<select value={setup.latency} onChange={e=>updateSetup('latency',e.target.value)}><option value="interactive">Lowest (best for playing)</option><option value="balanced">Safer (if you hear crackles)</option></select></label>
      <button type="button" onClick={start}>Restart audio</button>
     </div>
     <p className="hint">Changing latency takes effect when audio restarts. The engine runs in Rust/WebAssembly on the browser's audio thread. Settings here are shared by every synth on this device.</p>
    </section>
   </div>}
  </main>

  <footer className="perform">
   <div className="perform-row">
    <TouchPad onTouch={(pressure,mod)=>{performer.source('pad',pressure);performer.source('padMod',mod);}}/>
    <Ribbon range={setup.ribbonRange} onBend={b=>performer.source('ribbon',b)}/>
    <button type="button" className="keys-toggle" aria-pressed={showKeys} onClick={()=>updateSetup('keys',showKeys?'hide':'show')} aria-label={showKeys?'Hide on-screen keys':'Show on-screen keys'}>🎹</button>
   </div>
   {showKeys&&<div className="keys-row">
    <button type="button" className="octave" aria-label="Keys down an octave" onClick={()=>updateSetup('keysLow',Math.max(24,setup.keysLow-12))}>−</button>
    <Keys low={setup.keysLow} count={setup.keysCount} active={notes} onDown={(key,note,v)=>performer.down(key,note,velocity(v))} onUp={key=>performer.up(key)}/>
    <button type="button" className="octave" aria-label="Keys up an octave" onClick={()=>updateSetup('keysLow',Math.min(84,setup.keysLow+12))}>+</button>
   </div>}
  </footer>

  {audio.state!=='on'&&<button type="button" className={'wake '+audio.state} onClick={start} disabled={comparisonPending}>
   <span className="wake-title">{comparisonPending?'Loading comparison…':audio.state==='starting'?'Starting…':audio.state==='error'?'Tap to try again':'Tap to start'}</span>
   <span className="wake-note">{audio.state==='error'?audio.message:'Sound and MIDI start together. Play your piano, the on-screen keys or the computer keyboard (A–K row).'}</span>
  </button>}
 </div>;
}
