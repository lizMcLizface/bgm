import React from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import BankBrowser from './BankBrowser';

// Laid out like the original front panel: one row of sound controls, left to
// right as the signal flows, then the additions for playing it from a piano.
const ROWS=[
 [
  {title:'LFO',tone:'violet',keys:['lfoRate','lfoDelay']},
  {title:'DCO',tone:'cream',keys:['range',['lfoDco','LFO'],'pwm','pwmSource','pulse','saw','sub','noise']},
  {title:'HPF',tone:'teal',keys:[['hpf','Freq']]},
  {title:'VCF',tone:'red',keys:[['cutoff','Freq'],'res',['envPolarity','Env ±'],'env',['lfoVcf','LFO'],'kybd']},
  {title:'VCA',tone:'blue',keys:[['vcaMode','Env/Gate'],'level']},
  {title:'ENV',tone:'amber',keys:['attack','decay','sustain','release'],shape:{env:'amp',a:'attack',d:'decay',s:'sustain',r:'release'}},
  {title:'Chorus',tone:'green',keys:[['chorus','Mode'],'chorusNoise']},
 ],
 [
  {title:'Bender · touch (additions)',tone:'violet',keys:[['bendDco','Bend → DCO'],['bendVcf','Bend → VCF'],['modDepth','Mod → vib'],['velVcf','Vel → VCF'],['velVca','Vel → VCA'],['afterVcf','Touch → VCF']]},
  {title:'Character',tone:'amber',keys:['volume','voices',['spread','Spread'],'width']},
  {title:'Reverb',tone:'blue',keys:['reverbMix','reverbDecay','reverbTone','reverbSize','reverbPredelay']},
 ],
];

const LIBRARIES=[{id:'bank',label:'Bank',render:({choose,current})=><BankBrowser choose={choose} current={current}/>}];

export default function JunoPage(){
 return <SynthShell synth={SYNTHS.juno} className="juno" panelClassName="complete" libraries={LIBRARIES}>
  {({group})=>ROWS.map((row,i)=><div className="panel-row" key={i}>{row.map(g=>group(g))}</div>)}
 </SynthShell>;
}
