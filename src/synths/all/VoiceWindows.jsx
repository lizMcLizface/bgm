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
import NativePanel from '../../app/editor/NativePanel';

// A voice's synth on /synths/all is its own page's panel, the `.rig` of that page (its sound bar and its boxes of controls) and nothing else, floated on the desk by a grip
// on its top edge like the panels of the other pages. It reads and writes the host's sound of the voice (host.soundOf / nativeOf / editValues / editNative), so a sound
// picked here shows on the voice's card and one picked on the card shows here. The Effects button shows the voice's effects in it the way the page's own Effects button does.
// `version` changes whenever the host's sound did, to draw again.
const GAP=32,SEQUENCER='#all-panel-sequencer';
const bounds=(selector,desk)=>{
 const el=desk.el?.querySelector(selector);
 if(!el)return null;
 const rect=el.getBoundingClientRect(),origin=desk.origin(),zoom=desk.zoom;
 return {x:(rect.left-origin.left)/zoom,y:(rect.top-origin.top)/zoom,w:el.offsetWidth,h:el.offsetHeight};
};
export const panelHome=(kind,anchor,size)=>{
 if(!anchor||!size.w||!size.h)return null;
 if(kind==='synth')return {x:Math.round(anchor.x+(size.w<anchor.w?(anchor.w-size.w)/2:anchor.w-size.w)),y:Math.round(anchor.y-size.h-GAP)};
 if(kind==='effects')return {x:Math.round(anchor.x-size.w-GAP),y:Math.round(anchor.y+(anchor.h-size.h)/2)};
 return {x:Math.round(anchor.x+(anchor.w-size.w)/2),y:Math.round(anchor.y+anchor.h+GAP)};
};
const homeFor=(kind,selector)=>(s,el,desk)=>panelHome(kind,bounds(selector,desk),{w:el?.offsetWidth??0,h:el?.offsetHeight??0});

function Rig({id,children}){
 const float=useFloating('synths:all:win-'+id,homeFor('synth',SEQUENCER),{anchor:[SEQUENCER],spawnOnly:true,rotatable:true});
 // Both the explicit chrome and blank parts of an instrument's title bar move
 // its window. Actual controls retain their own pointer gestures.
 const titleDown=e=>{if(e.target.closest('.synth-bar,.synth-title,.presets,.all-native-voice>h2'))float.handle.onPointerDown(e);};
 return <div className="all-win" ref={float.ref} style={{position:'absolute',...float.style}} onPointerDownCapture={float.raise} onPointerDown={titleDown} onContextMenu={e=>{if(e.target.closest('.synth-bar,.synth-title,.presets,.all-native-voice>h2'))float.handle.onContextMenu(e);}} onPointerMove={float.handle.onPointerMove} onPointerUp={float.handle.onPointerUp} onPointerCancel={float.handle.onPointerCancel} onLostPointerCapture={float.handle.onLostPointerCapture}>
  <div className="grip rig-grip" {...float.handle} role="group"><span>{{lead:'Lead',counter:'Second lead',rhythm:'Rhythm',pad:'Pad',bass:'Bass',perc:'Drums'}[id]} synth</span><i/><small>Drag to move · right-drag to rotate</small></div>
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
 const rackId='all-rack-'+role,rackSelector='#'+rackId;
 const rack=(fx||tuning)&&<RackCompact tempo={0} values={host.rackValues(role)} onChange={changes=>onEditFx(role,changes)} instrumentSpecs={[]} excludedUnits={['space']} onClose={onCloseFx} posKey={'synths:all:rack-'+role} home={homeFor('effects',SEQUENCER)} anchor={[SEQUENCER]} physical layoutId={rackId} hidden={!fx} tools={tools}/>;
 const tuningHome=homeFor('tuning',rackSelector),tuningAnchor=[rackSelector];
 if(sound){
  const synth=SYNTHS[sound.synth];
  if(role==='perc')return <>{showSynth&&<Rig id={role} index={index}><DrumRig key={sound.synth} sound={sound} host={host} onEdit={onEdit}/></Rig>}{rack}</>;
  const choose=p=>onChoose(role,sound.synth,p.name,p.values&&!synth.presets.some(x=>x.name===p.name)?p.values:undefined,p);
  return <>
   {showSynth&&<Rig id={role} index={index}>
    <VoicePanel id={sound.synth} role={role} values={sound.values} onChange={values=>onEdit(role,values)} choose={choose} current={sound.name} full bound={{category:sound.category}}/>
   </Rig>}
   {rack}
   {tuning&&['poly','fm'].includes(sound.synth)&&<LabPanels id={'all-tuning-'+role} home={tuningHome} anchor={tuningAnchor} onClose={onCloseTuning}/>}
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
   {rack}{tuning&&<PianoTuning id={'all-piano-tuning-'+role} settings={settings} home={tuningHome} anchor={tuningAnchor} onChange={(key,value)=>onEditNative(role,{[key]:value})} onClose={onCloseTuning}/>}</>;
  }
  const names=Object.entries(NATIVE.iowa.presets);
  return <>{showSynth&&<Rig id={role} index={index}><div className="piano iowa"><div className="rig">
   <IowaRig voice={{vibrato:p.vibrato??1,tune:p.tune??0,room:host.rackValues(role)['effects.reverb'],volume:p.masterVolume??1}} current={PATCHES.find(x=>x.id===p.iowa)}
    onChoose={s=>{const hit=names.find(([,v])=>v.iowa===s.id);if(hit)choose(hit[0]);}}
    onVoice={(key,value)=>onEditNative(role,key==='room'?{reverbAmount:value}:key==='volume'?{masterVolume:value}:{[key]:value})}/>
  </div></div></Rig>}{rack}</>;
 }
 if(role==='perc')return <>{showSynth&&<Rig id={role} index={index}><div className="all-drum-kit" aria-label="Drum kit controls"><DrumKitPads voice={host.g.settings.drums.kit} kit={host.g.settings.drumKit} onKit={onEditDrum}/></div></Rig>}{rack}</>;
 return <>{showSynth&&<Rig id={role}><div className="all-native-voice"><h2>{host.loaded?.[role]?.name??'Generator synth'}</h2><NativePanel preset={host.g.getRolePreset(role)} part="instrument" polyphony={host.g.getRolePolyphony?.(role)??8} engine={host.g.getRoleEngine?.(role)??'native'} onChange={changes=>onEditNative(role,Object.fromEntries(changes))}/></div></Rig>}{rack}</>;
}
