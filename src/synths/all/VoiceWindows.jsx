import React from 'react';
import useFloating from '../ui/useFloating';
import {VoicePanel} from '../ui/VoicePanel';
import RackCompact from '../effects/RackCompact';
import LabPanels from '../diy/LabPanels';
import {PianoRig,PianoTuning,DEFAULTS as PIANO_DEFAULTS,categoryOf} from '../piano/PianoPage';
import {IowaRig} from '../iowa/IowaPage';
import {PATCHES} from '../../app/engine/iowaModel/patches';
import {SYNTHS} from '../models';
import {NATIVE} from './host';
import {DrumMachineVoices,DrumVoicePanel} from '../drums/DrumMachine';
import DrumKitPads from '../../app/DrumKitPads';

// A voice's synth on /synths/all is its own page's panel, the `.rig` of that page (its sound bar and its boxes of controls) and nothing else, floated on the desk by a grip
// on its top edge like the panels of the other pages. It reads and writes the host's sound of the voice (host.soundOf / nativeOf / editValues / editNative), so a sound
// picked here shows on the voice's card and one picked on the card shows here. The Effects button shows the voice's effects in it the way the page's own Effects button does.
// `version` changes whenever the host's sound did, to draw again.
const at=index=>({x:120+index*36,y:160+index*36});

function Rig({id,index,children}){
 const float=useFloating('synths:all:win-'+id,at(index));
 return <div className="all-win" ref={float.ref} style={{position:'absolute',...float.style}} onPointerDownCapture={float.raise}>
  <div className="grip rig-grip" {...float.handle} role="presentation"><i/></div>
  {children}
 </div>;
}

function DrumRig({sound,host,onEdit}) {
 const [selected,setSelected]=React.useState(0),[muted,setMuted]=React.useState(()=>new Set(host.getDrumMix().muted)),[solo,setSolo]=React.useState(()=>new Set(host.getDrumMix().solo));
 const synth=SYNTHS[sound.synth],kit=synth.kit;
 const silent=t=>solo.size?!solo.has(t):muted.has(t);
 React.useEffect(()=>{
  host.setDrumMix(muted,solo);
 },[host,kit,muted,solo]);
 const toggle=(set,t)=>set(current=>{const next=new Set(current);if(next.has(t))next.delete(t);else next.add(t);return next;});
 const change=(key,value)=>onEdit('perc',{...sound.values,[key]:value});
 return <div className={'drums '+kit.id}><section className="device device-machine">
  <DrumMachineVoices kit={kit} synth={synth} values={sound.values} change={change} selected={selected} onSelect={setSelected} onPad={t=>host.drumTrack(kit.tracks[t][0])} muted={muted} solo={solo} silent={silent} onMute={t=>toggle(setMuted,t)} onSolo={t=>toggle(setSolo,t)}/>
  <DrumVoicePanel kit={kit} synth={synth} values={sound.values} change={change} selected={selected}/>
 </section></div>;
}

/** The window of a voice: the page of the synth it plays, or just its effects when it plays the generator's own voice. */
export function VoiceWindow({role,index,host,showSynth,fx,tuning,onChoose,onEdit,onEditNative,onEditDrum,onEditFx,onCloseFx,onCloseTuning}){
 if(!host)return null;
 const sound=host.soundOf(role),entry=host.nativeOf(role);
 const tools=<button type="button" onClick={()=>host.g.roles[role].instrument.flushTails?.()}>Clear tails</button>;
 const rack=fx&&<RackCompact tempo={0} values={host.rackValues(role)} onChange={changes=>onEditFx(role,changes)} instrumentSpecs={[]} excludedUnits={['space']} onClose={onCloseFx} posKey={'synths:all:rack-'+role} home={at(index+2)} tools={tools}/>;
 if(sound){
  const synth=SYNTHS[sound.synth];
  if(role==='perc')return <>{showSynth&&<Rig id={role} index={index}><DrumRig key={sound.synth} sound={sound} host={host} onEdit={onEdit}/></Rig>}{rack}</>;
  const choose=p=>onChoose(role,sound.synth,p.name,p.values&&!synth.presets.some(x=>x.name===p.name)?p.values:undefined,p);
  return <>
   {showSynth&&<Rig id={role} index={index}>
    <VoicePanel id={sound.synth} role={role} values={sound.values} onChange={values=>onEdit(role,values)} choose={choose} current={sound.name} full bound={{category:sound.category}}/>
   </Rig>}
   {rack}
   {tuning&&['poly','fm'].includes(sound.synth)&&<LabPanels id={'all-tuning-'+role} onClose={onCloseTuning}/>}
  </>;
 }
 if(entry){
  const p=entry.preset,choose=name=>onChoose(role,entry.synth,name);
  if(entry.synth==='piano'){
   const settings=Object.fromEntries(Object.keys(PIANO_DEFAULTS).map(k=>[k,p[k]??PIANO_DEFAULTS[k]]));
   return <>{showSynth&&<Rig id={role} index={index}><div className="piano"><div className="rig">
    <PianoRig settings={settings} room={host.rackValues(role)['effects.reverb']} current={entry.name} category={categoryOf(settings.pianoType)} onChoose={s=>choose(s.name)} onChange={(key,value)=>onEditNative(role,{[key]:value})}
     onRoom={v=>onEditNative(role,{reverbAmount:v})} rackValues={host.rackValues(role)} onRack={changes=>onEditFx(role,changes)}/>
   </div></div></Rig>}
   {rack}{tuning&&<PianoTuning id={'all-piano-tuning-'+role} settings={settings} onChange={(key,value)=>onEditNative(role,{[key]:value})} onClose={onCloseTuning}/>}</>;
  }
  const names=Object.entries(NATIVE.iowa.presets);
  return <>{showSynth&&<Rig id={role} index={index}><div className="piano iowa"><div className="rig">
   <IowaRig voice={{vibrato:p.vibrato??1,tune:p.tune??0,room:host.rackValues(role)['effects.reverb'],volume:p.masterVolume??1}} current={PATCHES.find(x=>x.id===p.iowa)}
    onChoose={s=>{const hit=names.find(([,v])=>v.iowa===s.id);if(hit)choose(hit[0]);}}
    onVoice={(key,value)=>onEditNative(role,key==='room'?{reverbAmount:value}:key==='volume'?{masterVolume:value}:{[key]:value})}/>
  </div></div></Rig>}{rack}</>;
 }
 if(role==='perc')return <>{showSynth&&<Rig id={role} index={index}><div className="all-drum-kit" aria-label="Drum kit controls"><DrumKitPads voice={host.g.settings.drums.kit} kit={host.g.settings.drumKit} onKit={onEditDrum}/></div></Rig>}{rack}</>;
 return rack;
}
