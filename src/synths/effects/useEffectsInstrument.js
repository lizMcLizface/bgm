import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {startDiySynth} from '../diy/live';
import {POLY} from '../diy/patches';
import {Performer} from '../engine/performer';
import {createPhraseRunner,phraseForCode} from '../ui/phraseRunner';
import {LabMidi,bindLabKeyboard,mapVelocity} from '../../labs/input';
import {CURVES,computerKeyVelocity} from '../ui/setup';

/** One local source/rack/output. Nothing starts while restoring the desk. */
export function useEffectsInstrument({patch,rack,instances,parallel=null,setup,context,onSetup}){
 const engine=useRef(null),pending=useRef(null),epoch=useRef(0),alive=useRef(true),fault=useRef(false),held=useRef(new Map()),intent=useRef(0),midiRef=useRef(null),pedal=useRef(false);
 const [audio,setAudio]=useState({state:'off',message:'Play a key or start an audition phrase.'}),[stats,setStats]=useState({active:0,peak:0,reduction:0}),[notes,setNotes]=useState([]),[playing,setPlaying]=useState(null),[midi,setMidi]=useState({inputs:[],status:'Connect a MIDI keyboard, or use the on-screen keys.'});
 const latest=useRef(null);latest.current={patch,rack,instances,parallel,setup,context,onSetup};
 const performer=useMemo(()=>new Performer(null,{onNotes:setNotes}),[]);
 const phrases=useMemo(()=>createPhraseRunner(performer,{context:()=>latest.current.context,onState:setPlaying}),[performer]);
 const stop=useCallback(()=>{epoch.current++;intent.current++;held.current.clear();pending.current=null;phrases.stop();performer.panic();performer.setTarget(null);const old=engine.current;engine.current=null;old?.close();if(alive.current){setAudio({state:'off',message:'Audio stopped.'});setStats({active:0,peak:0,reduction:0});}},[performer,phrases]);
 const fail=useCallback((error,mine)=>{
  if(!alive.current||epoch.current!==mine)return;
  fault.current=true;intent.current++;held.current.clear();phrases.stop();performer.panic();performer.setTarget(null);
  const old=engine.current;engine.current=null;old?.close();setAudio({state:'error',message:error.message});setStats({active:0,peak:0,reduction:0});
 },[performer,phrases]);
 const start=useCallback(()=>{
  if(engine.current){const live=engine.current,mine=epoch.current;return Promise.resolve(live.context.resume?.()).then(()=>live).catch(error=>{fail(error,mine);return null;});}
  if(pending.current)return pending.current;
  const mine=++epoch.current;fault.current=false;setAudio({state:'starting',message:'Starting DI-Poly…'});
  const options={kind:'poly',params:POLY.params.toPairs(latest.current.patch.values),rack:latest.current.rack,instances:latest.current.instances,parallel:latest.current.parallel,latency:latest.current.setup.latency,
   onStats:data=>{if(alive.current&&!fault.current&&epoch.current===mine)setStats(old=>old.active===data.active&&Math.abs(old.peak-data.peak)<.02&&Math.abs(old.reduction-data.reduction)<.1&&Math.abs((old.compressorInputDb??-100)-(data.compressorInputDb??-100))<.5&&Math.abs((old.limiterReduction??0)-(data.limiterReduction??0))<.1&&JSON.stringify(old.drivePeaks)===JSON.stringify(data.drivePeaks)&&JSON.stringify(old.busMeters)===JSON.stringify(data.busMeters)?old:data);},
   onError:error=>fail(error,mine)};
  // Call synchronously within the key/click gesture so AudioContext can resume.
  let loading;try{loading=startDiySynth(options);}catch(error){loading=Promise.reject(error);}
  const task=Promise.resolve(loading).then(live=>{
   if(!alive.current||fault.current||epoch.current!==mine){live.close();return null;}
   engine.current=live;live.setParams(POLY.params.toPairs(latest.current.patch.values));live.setRack(latest.current.rack,latest.current.instances,latest.current.parallel);performer.setTarget(live);performer.restore({sustain:pedal.current?1:0});
   setAudio({state:'on',message:`${live.context.sampleRate/1000} kHz · ${Math.round(live.latency*1000)} ms output`});return live;
  }).catch(error=>{fail(error,mine);return null;}).finally(()=>{if(pending.current===task)pending.current=null;});
  pending.current=task;return task;
 },[performer,fail]);
 const down=useCallback((key,note,velocity)=>{
  const hit={note,velocity};held.current.set(key,hit);
  if(engine.current){performer.down(key,note,velocity);return;}
  start().then(live=>{if(live&&held.current.get(key)===hit)performer.down(key,note,velocity);});
 },[performer,start]);
 const up=useCallback(key=>{held.current.delete(key);performer.up(key);},[performer]);
 const panic=useCallback(()=>{intent.current++;held.current.clear();phrases.stop();performer.panic();performer.control('sustain',0);pedal.current=false;},[performer,phrases]);
 const stopPhrase=useCallback(()=>{intent.current++;phrases.stop();},[phrases]);
 const playPhrase=useCallback(id=>{const mine=++intent.current;start().then(live=>{if(live&&mine===intent.current)phrases.play(id);});},[start,phrases]);
 useEffect(()=>{engine.current?.setParams(POLY.params.toPairs(patch.values));},[patch.values]);
 useEffect(()=>{engine.current?.setRack(rack,instances,parallel);},[rack,instances,parallel]);

 useEffect(()=>{
  alive.current=true;
  const velocity=v=>mapVelocity(v,CURVES[latest.current.setup.velocity]??CURVES.normal);
  const m=new LabMidi({on:(key,note,v)=>down(key,note,velocity(v)),off:up,sustain:on=>{pedal.current=on;performer.control('sustain',on?1:0);},control:(name,value)=>{
   if(name==='bend')performer.source('wheel',value/2*latest.current.setup.wheelRange);
   else if(name==='pressure')performer.source('aftertouch',value);
   else if(name==='motion')performer.source('wheelMod',value);
   else if(name==='level')performer.control('expression',value);
   else if(name==='brightness')performer.control('brightness',value);
  },polyPressure:(key,v)=>performer.pressure(key,v),soft:v=>performer.control('soft',v),panic,onStatus:inputs=>{if(alive.current)setMidi({inputs,status:inputs.length?`${inputs.length} MIDI input connected.`:'MIDI ready · plug in your keyboard.'});}});
  midiRef.current=m;m.selected=latest.current.setup.midiDevice;m.channel=latest.current.setup.midiChannel;
  const reconnect=()=>{if(!m.access)m.reconnect().catch(error=>{if(alive.current&&midiRef.current===m)setMidi(s=>({...s,status:error.message}));});};
  const visible=()=>{if(document.visibilityState==='visible')reconnect();};
  reconnect();window.addEventListener('focus',reconnect);document.addEventListener('visibilitychange',visible);
  const keys=bindLabKeyboard(window,{on:(key,note,v)=>down(key,note,velocity(v)),off:up,panic,octave:()=>Math.floor(latest.current.setup.keysLow/12)-1,velocity:()=>computerKeyVelocity(latest.current.setup),shift:d=>latest.current.onSetup('keysLow',Math.min(84,Math.max(24,latest.current.setup.keysLow+12*d)))});
  const shortcuts=e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target?.closest?.('input,select,textarea,[role=slider],[contenteditable=true]'))return;const id=phraseForCode(e.code);if(id){e.preventDefault();playPhrase(id);}else if(e.code==='Escape')panic();};
  const blur=()=>{for(const key of [...held.current.keys()])if(!key.startsWith('midi:'))up(key);performer.releaseLocal();};
  window.addEventListener('keydown',shortcuts);window.addEventListener('blur',blur);
  return ()=>{alive.current=false;keys();m.dispose();window.removeEventListener('focus',reconnect);document.removeEventListener('visibilitychange',visible);window.removeEventListener('keydown',shortcuts);window.removeEventListener('blur',blur);stop();};
 },[down,up,performer,panic,playPhrase,stop]);
 useEffect(()=>{const m=midiRef.current;if(!m)return;performer.releaseAll();performer.control('sustain',0);pedal.current=false;held.current.clear();m.selected=setup.midiDevice;m.channel=setup.midiChannel;},[setup.midiDevice,setup.midiChannel,performer]);
 const connectMidi=useCallback(async()=>{try{await midiRef.current?.connect();}catch(error){if(alive.current)setMidi(s=>({...s,status:error.message}));}},[]);
 return {engine,audio,stats,notes,playing,midi,performer,start,stop,down,up,panic,playPhrase,stopPhrase,connectMidi};
}
