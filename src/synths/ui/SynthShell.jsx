import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Fader,Choice,Ribbon,TouchPad,Keys} from './controls';
import {startLiveSynth} from '../engine/liveSynth';
import {Performer} from '../engine/performer';
import {LabMidi,bindLabKeyboard,mapVelocity} from '../../labs/input';
import {load,save} from '../storage';
import Scope from './Scope';

// Everything a /synths page shares: audio start, MIDI piano, computer keys,
// sounds (factory + saved), setup, the ribbon/pad/keys strip and screen wake.
// A page supplies its synth definition and draws its own panel.
export const SETUP_KEY='synths:setup';
const SETUP={midiDevice:'all',midiChannel:'all',velocity:'normal',ribbonRange:12,wheelRange:2,latency:'interactive',keys:'auto',keysLow:48,keysCount:25};
const CURVES={light:{curve:.6,floor:.08},normal:{curve:1,floor:.06},firm:{curve:1.6,floor:.04}};
const dirty=name=>name.endsWith(' *')?name:name+' *';

/**
 * synth: entry from ../models. children({values,control,group,replaceValues}) draws the panel.
 * expand(key) may return several keys to edit together (CS-80 channel linking).
 * libraries: extra shelves beside the sound buttons, [{id,label,render({choose,values,current})}].
 * engineOptions(): extra options for the engine when it starts (the vector synthesizer's waves); onEngine(live): called with the running engine; onStats(data): every engine report (the sequencer playhead); onMidiRealtime(status): MIDI clock, start, continue and stop bytes.
 */
export default function SynthShell({synth,className='',headerExtras=null,nav=null,panelClassName='',expand,libraries=[],engineOptions,onEngine,onStats,onMidiRealtime,children}){
 const {params:{BY_KEY,sanitize,toPairs},presets}=synth;
 const PATCH_KEY=`synths:${synth.id}:patch`,MINE_KEY=`synths:${synth.id}:mine`;
 const [patch,setPatch]=useState(()=>{
  const stored=load(PATCH_KEY,null);
  return stored?.values?{name:String(stored.name??'Custom'),values:sanitize(stored.values)}:{name:presets[0].name,values:{...presets[0].values}};
 });
 const [mine,setMine]=useState(()=>(load(MINE_KEY,[])||[]).filter(p=>p?.name&&p.values).map(p=>({name:String(p.name),values:sanitize(p.values)})));
 const [setup,setSetup]=useState(()=>{const stored={...SETUP,...load(SETUP_KEY,{})};if(!['auto','show','hide'].includes(stored.keys))stored.keys='auto';return stored;});
 const [showSetup,setShowSetup]=useState(false);
 const SHELF_KEY=`synths:${synth.id}:shelf`;
 const [shelf,setShelf]=useState(()=>{const s=load(SHELF_KEY,'sounds');return libraries.some(l=>l.id===s)?s:'sounds';});
 const pickShelf=id=>{setShelf(id);save(SHELF_KEY,id);};
 const library=libraries.find(l=>l.id===shelf);
 const [audio,setAudio]=useState({state:'off',message:''});
 const [stats,setStats]=useState({active:0,peak:0});
 const [notes,setNotes]=useState([]);
 const [pedal,setPedal]=useState(false);
 const [scope,setScope]=useState(()=>load('synths:scope:open',false)===true);
 const toggleScope=()=>setScope(v=>{save('synths:scope:open',!v);return !v;});
 const [midi,setMidi]=useState({inputs:[],status:'Not connected.'});
 const engine=useRef(null),patchRef=useRef(patch),setupRef=useRef(setup),expandRef=useRef(expand);
 const onStatsRef=useRef(onStats);onStatsRef.current=onStats;
 const realtimeRef=useRef(onMidiRealtime);realtimeRef.current=onMidiRealtime;
 patchRef.current=patch;setupRef.current=setup;expandRef.current=expand;
 const performer=useMemo(()=>new Performer(null,{onNotes:setNotes}),[]);

 // persistence (debounced: faders change values many times a second)
 useEffect(()=>{const t=setTimeout(()=>save(PATCH_KEY,patch),300);return ()=>clearTimeout(t);},[patch,PATCH_KEY]);
 useEffect(()=>{save(SETUP_KEY,{...load(SETUP_KEY,{}),...setup});},[setup]);

 const change=useCallback((key,value)=>{
  const keys=expandRef.current?.(key)??[key];
  setPatch(p=>{const values={...p.values};for(const k of keys)values[k]=value;return {name:dirty(p.name),values};});
  for(const k of keys)engine.current?.setParam(BY_KEY[k].id,value);
 },[BY_KEY]);
 const replaceValues=useCallback(values=>{engine.current?.setParams(toPairs(values));setPatch(p=>({name:dirty(p.name),values}));},[toPairs]);
 const choose=useCallback(next=>{setPatch({name:next.name,values:{...next.values}});engine.current?.setParams(toPairs(next.values));},[toPairs]);
 const saveMine=()=>{
  const name=window.prompt('Name this sound',patch.name.replace(/ \*$/,''));if(!name)return;
  const entry={name:name.slice(0,40),values:{...patch.values}};
  setMine(list=>{const next=[...list.filter(p=>p.name!==entry.name),entry];save(MINE_KEY,next);return next;});
  setPatch(p=>({...p,name:entry.name}));
 };
 const removeMine=name=>{if(!window.confirm(`Delete “${name}”?`))return;setMine(list=>{const next=list.filter(p=>p.name!==name);save(MINE_KEY,next);return next;});};

 // inputs
 const velocity=useCallback(v=>mapVelocity(v,CURVES[setupRef.current.velocity]??CURVES.normal),[]);
 const midiRef=useRef(null);
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
   panic:()=>{performer.releaseAll();performer.control('sustain',0);setPedal(false);},
   onStatus:inputs=>setMidi({inputs,status:inputs.length?`${inputs.length} MIDI input${inputs.length>1?'s':''} connected.`:'MIDI ready · plug in your piano.'}),
  });
  m.selected=setupRef.current.midiDevice;m.channel=setupRef.current.midiChannel;midiRef.current=m;
  const keyboard=bindLabKeyboard(window,{on:(key,note)=>performer.down(key,note,.75),off:key=>performer.up(key),panic:()=>performer.panic(),octave:()=>Math.floor(setupRef.current.keysLow/12)-1,shift:d=>setSetup(s=>({...s,keysLow:Math.min(84,Math.max(24,s.keysLow+12*d))}))});
  const blur=()=>performer.releaseAll();window.addEventListener('blur',blur);
  return ()=>{keyboard();m.dispose();window.removeEventListener('blur',blur);performer.panic();engine.current?.close();engine.current=null;};
 },[performer,velocity]);
 const connectMidi=async()=>{try{await midiRef.current.connect();}catch(e){setMidi(m=>({...m,status:e.message}));}};

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
  if(audio.state==='starting')return;
  setAudio({state:'starting',message:'Waking the oscillators…'});
  const previous=engine.current;engine.current=null;previous?.close();
  startLiveSynth({model:synth.model,params:toPairs(patchRef.current.values),...(engineOptions?.()??{}),latency:setupRef.current.latency,onStats:data=>{onStatsRef.current?.(data);setStats(s=>Math.abs(s.peak-data.peak)<.02&&s.active===data.active?s:data);},onError:e=>setAudio({state:'error',message:e.message})})
   .then(live=>{engine.current=live;onEngine?.(live);performer.setTarget(live);performer.restore({sustain:pedal?1:0});setAudio({state:'on',message:`${live.context.sampleRate/1000} kHz · ${Math.round(live.latency*1000)} ms output`});})
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
 const group=({title,tone,keys},prefix='')=><section className="group" key={title} style={{'--n':keys.length}}><h3>{title}</h3><div className="group-controls">{keys.map(k=>control(k,tone,prefix))}</div></section>;
 // With a MIDI piano attached the on-screen keys only take space from the panel.
 const showKeys=setup.keys==='show'||setup.keys==='auto'&&midi.inputs.length===0;
 const current=patch.name.replace(/ \*$/,'');

 return <div className={'synth instrument '+className}>
  <header className="synth-bar">
   <a className="back" href={import.meta.env.BASE_URL+'synths/'} aria-label="All synths">◂</a>
   <h1><span className="brand">{synth.name}</span><small>{synth.subtitle}</small></h1>
   <span className="patch-name" title={patch.name}>{patch.name}</span>
   <span className="meter" aria-label={`${stats.active} voices playing`}><span className="meter-fill" style={{width:Math.min(100,stats.peak*100)+'%'}}/><b>{stats.active}</b>/{patch.values.voices}</span>
   {pedal&&<span className="pill">Pedal</span>}
   {headerExtras}
   <button type="button" aria-pressed={scope} onClick={toggleScope} title="Oscilloscope and spectrum">Scope</button>
   <button type="button" aria-pressed={showSetup} onClick={()=>setShowSetup(v=>!v)} aria-label="Setup">⚙</button>
   <button type="button" onClick={()=>performer.panic()} title="Silence everything (Esc)">Panic</button>
   <button type="button" onClick={fullscreen} aria-label="Full screen">⛶</button>
  </header>

  <nav className={'presets'+(library?' shelf-'+library.id:'')} aria-label="Sounds">
   {libraries.length>0&&<span className="shelf-switch" role="radiogroup" aria-label="Sound shelf">
    {[{id:'sounds',label:'Sounds'},...libraries].map(l=><button type="button" key={l.id} role="radio" aria-checked={shelf===l.id} onClick={()=>pickShelf(l.id)}>{l.label}</button>)}
   </span>}
   {library?library.render({choose,values:patch.values,current}):<>
   {presets.map(p=><button type="button" key={p.name} style={{'--chip':p.colour}} className={current===p.name?'on':''} onClick={()=>choose(p)} title={p.note}>{p.name}</button>)}
   {mine.map(p=><span className="mine" key={'mine:'+p.name}><button type="button" className={current===p.name?'on':''} onClick={()=>choose(p)}>{p.name}</button><button type="button" className="remove" aria-label={`Delete ${p.name}`} onClick={()=>removeMine(p.name)}>×</button></span>)}
   <button type="button" className="save" onClick={saveMine}>＋ Save sound</button>
   </>}
  </nav>

  {scope&&<Scope engine={engine} audio={audio.state} onClose={toggleScope}/>}
  {!showSetup&&nav}

  <main className={'panel'+(showSetup?'':' '+panelClassName)}>
   {!showSetup&&children({values:patch.values,control,group,replaceValues,patch:patchRef})}
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

  {audio.state!=='on'&&<button type="button" className={'wake '+audio.state} onClick={start}>
   <span className="wake-title">{audio.state==='starting'?'Starting…':audio.state==='error'?'Tap to try again':'Tap to start'}</span>
   <span className="wake-note">{audio.state==='error'?audio.message:'Sound and MIDI start together. Play your piano, the on-screen keys or the computer keyboard (A–K row).'}</span>
  </button>}
 </div>;
}
