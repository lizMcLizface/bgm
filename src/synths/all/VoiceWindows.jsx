import React from 'react';
import useFloating from '../ui/useFloating';
import {VoicePanel} from '../ui/VoicePanel';
import RackPanel from '../effects/RackPanel';
import RackCompact from '../effects/RackCompact';
import {instrumentSpecKeys} from '../effects/params';
import {PianoRig,DEFAULTS as PIANO_DEFAULTS,categoryOf} from '../piano/PianoPage';
import {IowaRig} from '../iowa/IowaPage';
import {PATCHES} from '../../app/engine/iowaModel/patches';
import {SYNTHS} from '../models';
import {NATIVE} from './host';

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

/** The window of a voice: the page of the synth it plays, or just its effects when it plays the generator's own voice. */
export function VoiceWindow({role,index,host,fx,onChoose,onEdit,onEditNative,onEditFx,onCloseFx}){
 if(!host)return null;
 const sound=host.soundOf(role),entry=host.nativeOf(role);
 const tools=<><button type="button" onClick={()=>host.g.roles[role].instrument.flushTails?.()}>Clear tails</button>{onCloseFx&&<button type="button" onClick={onCloseFx}>Back to synth</button>}</>;
 if(sound){
  const synth=SYNTHS[sound.synth];
  const choose=p=>onChoose(role,sound.synth,p.name,p.values&&!synth.presets.some(x=>x.name===p.name)?p.values:undefined);
  const effects={open:fx,values:host.rackValues(role),onChange:changes=>onEditFx(role,changes),tools,
   instrumentSpecs:instrumentSpecKeys(synth).map(k=>({...synth.params.BY_KEY[k],key:'instrument.'+k,label:k.includes('chorus')?k.endsWith('Rate')?'Chorus rate':k.endsWith('Depth')?'Chorus depth':'Chorus mix':k==='reverbMix'?'Reverb mix':synth.params.BY_KEY[k].label}))};
  return <Rig id={role} index={index}>
   <VoicePanel id={sound.synth} role={role} values={sound.values} onChange={values=>onEdit(role,values)} choose={choose} current={sound.name} full bound={{category:sound.category,effects}}/>
  </Rig>;
 }
 if(entry){
  const p=entry.preset,choose=name=>onChoose(role,entry.synth,name);
  const rack=fx&&<RackCompact tempo={0} values={host.rackValues(role)} onChange={changes=>onEditFx(role,changes)} instrumentSpecs={[]} onClose={onCloseFx} posKey={'synths:all:rack-'+role} home={at(index+2)}
   tools={<button type="button" onClick={()=>host.g.roles[role].instrument.flushTails?.()}>Clear tails</button>}/>;
  if(entry.synth==='piano'){
   const settings=Object.fromEntries(Object.keys(PIANO_DEFAULTS).map(k=>[k,p[k]??PIANO_DEFAULTS[k]]));
   return <Rig id={role} index={index}><div className="piano"><div className="rig">
    <PianoRig settings={settings} room={p.reverbAmount??.2} current={entry.name} category={categoryOf(settings.pianoType)} onChoose={s=>choose(s.name)} onChange={(key,value)=>onEditNative(role,{[key]:value})}
     onRoom={v=>onEditNative(role,{reverbAmount:v})} rackValues={host.rackValues(role)} onRack={changes=>onEditFx(role,changes)}>{rack}</PianoRig>
   </div></div></Rig>;
  }
  const names=Object.entries(NATIVE.iowa.presets);
  return <Rig id={role} index={index}><div className="piano iowa"><div className="rig">
   <IowaRig voice={{vibrato:p.vibrato??1,tune:p.tune??0,room:p.reverbAmount??.25,volume:p.masterVolume??1}} current={PATCHES.find(x=>x.id===p.iowa)}
    onChoose={s=>{const hit=names.find(([,v])=>v.iowa===s.id);if(hit)choose(hit[0]);}}
    onVoice={(key,value)=>onEditNative(role,key==='room'?{reverbAmount:value}:key==='volume'?{masterVolume:value}:{[key]:value})}>{rack}</IowaRig>
  </div></div></Rig>;
 }
 // the generator's own voice: its effects, in the rack panel of the other pages (nothing else to show)
 if(!fx)return null;
 return <Rig id={role} index={index}><div className="synth instrument bound rack-open"><div className="rig"><main className="panel rack-panel">
  <RackPanel values={host.rackValues(role)} onChange={changes=>onEditFx(role,changes)} instrumentSpecs={[]} tools={<button type="button" onClick={()=>host.g.roles[role].instrument.flushTails?.()}>Clear tails</button>}/>
 </main></div></div></Rig>;
}
