import React,{useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import {LAYER_KEYS,LOWER} from './params';
import TapeBrowser from './TapeBrowser';

// Laid out after the original front panel in three rows that fit a tablet: the
// sources (LFO, VCO modulation, pulse width, both VCOs, mix), the shaping (HPF,
// VCF, VCA, both envelopes), then key mode, assign/arpeggio and the additions.
// The layer buttons choose which patch (upper or lower) the panel edits.
const ROWS=[
 [
  {title:'LFO',tone:'violet',keys:[['lfoRate','Rate'],['lfoDelay','Delay'],['lfoWave','Wave']]},
  {title:'VCO modulator',tone:'violet',keys:[['vcoModLfo','LFO'],['vcoModEnv','Env-1'],['vcoModDest','→']]},
  {title:'Pulse width',tone:'cream',keys:['pw',['pwSource','By']]},
  {title:'VCO-1',tone:'cream',keys:[['crossMod','Cross mod'],['vco1Range','Range'],['vco1Wave','Wave']]},
  {title:'VCO-2',tone:'cream',keys:['sync',['vco2Range','Range'],['vco2Fine','Fine'],['vco2Wave','Wave'],['vco2Low','Low freq']]},
  {title:'Source mix',tone:'teal',keys:[['sourceMix','1 ↔ 2']]},
 ],
 [
  {title:'HPF',tone:'teal',keys:[['hpf','Freq']]},
  {title:'VCF',tone:'red',keys:[['cutoff','Freq'],'res',['slope','Slope'],['envMod','Env'],['envSource','Env'],['vcfLfo','LFO'],['keyFollow','Key']]},
  {title:'VCA',tone:'blue',keys:[['vcaLfo','LFO'],'level']},
  {title:'ENV-1',tone:'amber',keys:[['e1Attack','A'],['e1Decay','D'],['e1Sustain','S'],['e1Release','R'],['e1Key','Key'],['e1Invert','Polarity']],shape:{env:'filter',a:'e1Attack',d:'e1Decay',s:'e1Sustain',r:'e1Release'}},
  {title:'ENV-2',tone:'amber',keys:[['e2Attack','A'],['e2Decay','D'],['e2Sustain','S'],['e2Release','R'],['e2Key','Key']],shape:{env:'amp',a:'e2Attack',d:'e2Decay',s:'e2Sustain',r:'e2Release'}},
 ],
 [
  {title:'Assign',tone:'blue',keys:['assign',['portamento','Porta'],['unisonDetune','Detune']]},
  {title:'Arpeggio',tone:'green',keys:[['arp','On'],['arpMode','Mode'],['arpRange','Oct'],['arpRate','Rate'],['arpHold','Hold']]},
  {title:'Bender · touch (additions)',tone:'violet',keys:[['bendRange','Bend'],['bendVcf','Bend → VCF'],['modDepth','Mod → vib'],['velVcf','Vel → VCF'],['velVca','Vel → VCA'],['afterVcf','Touch → VCF']]},
  {title:'Character',tone:'amber',keys:['volume','voices',['spread','Spread'],'width',['oversample','2× rate']]},
 ],
];
const KEY_MODE={title:'Key mode',tone:'green',keys:[['keyMode','Mode'],['splitPoint','Split'],['balance','Balance']]};
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

export default function JupiterPage(){
 const [layer,setLayer]=useState('upper');
 const libraries=[{id:'tape',label:'Tape',render:({choose,values,current})=><TapeBrowser choose={choose} values={values} current={current} layer={layer}/>}];
 return <SynthShell synth={SYNTHS.jupiter8} className="jupiter" panelClassName="complete" libraries={libraries}>
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
    {i===2&&group(KEY_MODE)}
    {row.map(g=>group(g,prefix))}
    {i===0&&group(REVERB)}
   </div>);
  }}
 </SynthShell>;
}
