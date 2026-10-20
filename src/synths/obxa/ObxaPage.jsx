import React,{useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import {LAYER_KEYS,LOWER} from './params';
import BookBrowser from './BookBrowser';

// Laid out after the original panel in three rows that fit a tablet: oscillators and mixer,
// filter and envelopes, then LFO, wheel, key mode and the additions. The layer buttons choose
// which patch (upper or lower) the panel edits.
const ROWS=[
 [
  {title:'Oscillator 1',tone:'cream',keys:[['osc1Pitch','Pitch'],['osc1Saw','Saw'],['osc1Pulse','Pulse'],['osc1On','Mix']]},
  {title:'Oscillator 2',tone:'cream',keys:[['osc2Pitch','Pitch'],['osc2Detune','Detune'],['osc2Saw','Saw'],['osc2Pulse','Pulse'],['osc2Mix','Mix'],['sync','Sync'],['fenvOsc2','Env → pitch']]},
  {title:'Pulse width · noise',tone:'teal',keys:['pw','noiseOn']},
 ],
 [
  {title:'Filter',tone:'red',keys:['cutoff','res',['envAmount','Env'],['poles','Poles'],['track','Track']]},
  {title:'Filter envelope',tone:'amber',keys:[['fAttack','A'],['fDecay','D'],['fSustain','S'],['fRelease','R']]},
  {title:'Amp envelope',tone:'amber',keys:[['aAttack','A'],['aDecay','D'],['aSustain','S'],['aRelease','R']]},
 ],
 [
  {title:'LFO',tone:'violet',keys:['lfoRate',['lfoSine','Sine'],['lfoSquare','Square'],['lfoSh','S&H'],['lfoFreqDepth','Freq mod'],['lfoToOsc1','→ Osc 1'],['lfoToOsc2','→ Osc 2'],['lfoToFilter','→ Filter'],['lfoPwDepth','PW mod'],['lfoPwOsc1','→ PW 1'],['lfoPwOsc2','→ PW 2']]},
  {title:'Voice',tone:'blue',keys:[['portamento','Porta'],'unison',['unisonDetune','Detune'],['voices','Voices']]},
  {title:'Wheel · bend',tone:'violet',keys:['wheelRate','wheelDepth',['wheelOsc1','→ Osc 1'],['wheelOsc2','→ Osc 2'],['bendOsc2Only','Bend 2 only'],'transpose']},
  {title:'Touch (additions)',tone:'violet',keys:[['velFilter','Vel → filter'],['velAmp','Vel → amp'],['afterFilter','Touch → filter']]},
 ],
];
const KEY_MODE={title:'Key mode',tone:'green',keys:[['keyMode','Mode'],['splitPoint','Split'],['balance','Balance']]};
const CHARACTER={title:'Character',tone:'amber',keys:['volume','width','spread',['oversample','2× rate'],'tune']};
const REVERB={title:'Reverb',tone:'blue',keys:['reverbMix','reverbDecay','reverbTone','reverbSize','reverbPredelay']};
const NAMES={upper:'Upper',lower:'Lower'};

/** Copies one layer's patch onto the other. */
function copyLayer(values,from){
 const next={...values};
 for(const key of LAYER_KEYS){
  if(from==='upper')next[LOWER+key]=values[key];else next[key]=values[LOWER+key];
 }
 return next;
}

export default function ObxaPage(){
 const [layer,setLayer]=useState('upper');
 const libraries=[{id:'book',label:'Patch book',render:({choose,values,current})=><BookBrowser choose={choose} values={values} current={current} layer={layer}/>}];
 return <SynthShell synth={SYNTHS.obxa} className="obxa" panelClassName="complete" libraries={libraries}>
  {({group,values,replaceValues})=>{
   const prefix=layer==='lower'?LOWER:'';
   const silent=values.keyMode===0&&layer==='lower';
   const other=layer==='upper'?'lower':'upper';
   const picker=<section className="group channel-pick" key="layer"><h3>Layer</h3>
    <div className="channel-buttons" role="radiogroup" aria-label="Layer to edit">
     {['upper','lower'].map(l=><button type="button" key={l} role="radio" aria-checked={layer===l} className={(l==='upper'?'channel-i':'channel-ii')+(layer===l?' on':'')} onClick={()=>setLayer(l)}>{NAMES[l]}</button>)}
    </div>
    <div className="channel-tools">
     <button type="button" onClick={()=>replaceValues(copyLayer(values,layer))}>Copy to {NAMES[other].toLowerCase()}</button>
     {silent&&<span className="layer-note">Not playing in Whole</span>}
    </div>
   </section>;
   return ROWS.map((row,i)=><div className="panel-row" key={i}>
    {i===0&&picker}
    {row.map(g=>group(g,prefix))}
    {i===0&&group(KEY_MODE)}
    {i===1&&group(CHARACTER)}
    {i===1&&group(REVERB)}
   </div>);
  }}
 </SynthShell>;
}
