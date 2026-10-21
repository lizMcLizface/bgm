import React from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';

// Laid out after the original panel: controllers, the oscillator bank, the mixer, then
// the modifiers (filter, contours); the additions for playing it from a piano come last.
const ROWS=[
 [
  {title:'Controllers',tone:'violet',keys:['tune',['glide','Glide'],['glideOn','Glide on'],'priority','trigger']},
  {title:'Oscillator 1',tone:'cream',keys:[['osc1Range','Range'],['osc1Wave','Wave']]},
  {title:'Oscillator 2',tone:'cream',keys:[['osc2Range','Range'],['osc2Tune','Tune'],['osc2Wave','Wave']]},
  {title:'Oscillator 3',tone:'cream',keys:[['osc3Range','Range'],['osc3Tune','Tune'],['osc3Wave','Wave'],['osc3Kbd','Keyboard']]},
  {title:'Modulation',tone:'violet',keys:[['modMix','Osc 3 ↔ noise'],['modAmount','Wheel'],['modOsc','→ Osc'],['modFilter','→ Filter']]},
 ],
 [
  {title:'Mixer',tone:'teal',keys:[['mix1','Osc 1'],['mix1On','On'],['mix2','Osc 2'],['mix2On','On'],['mix3','Osc 3'],['mix3On','On'],['noise','Noise'],['noiseOn','On'],['noisePink','Colour'],'feedback','drive']},
  {title:'Filter',tone:'red',keys:['cutoff','emphasis','contour',['kbdThird','Kbd ⅓'],['kbdTwoThirds','Kbd ⅔']]},
 ],
 [
  {title:'Filter contour',tone:'amber',keys:[['fAttack','A'],['fDecay','D'],['fSustain','S']],shape:{env:'filter',a:'fAttack',d:'fDecay',s:'fSustain',r:v=>v.decayOn>=.5?v.fDecay:.012}},
  {title:'Loudness contour',tone:'amber',keys:[['aAttack','A'],['aDecay','D'],['aSustain','S'],['decayOn','Decay']],shape:{env:'amp',a:'aAttack',d:'aDecay',s:'aSustain',r:v=>v.decayOn>=.5?v.aDecay:.012}},
  {title:'Touch (additions)',tone:'violet',keys:[['velContour','Vel → contour'],['velLevel','Vel → level'],['afterFilter','Touch → filter']]},
  {title:'Output',tone:'blue',keys:['volume',['oversample','2× rate']]},
  {title:'Reverb',tone:'blue',keys:['reverbMix','reverbDecay','reverbTone','reverbSize','reverbPredelay']},
 ],
];

export default function MinimoogPage(){
 return <SynthShell synth={SYNTHS.minimoog} className="minimoog" panelClassName="complete">
  {({group})=>ROWS.map((row,i)=><div className="panel-row" key={i}>{row.map(g=>group(g))}</div>)}
 </SynthShell>;
}
