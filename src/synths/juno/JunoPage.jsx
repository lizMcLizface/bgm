import React from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import PatchGrid from './PatchGrid';
import {chorusMode} from './params';

// Laid out like the original front panel. On the left, in one framed block like the 106's own left-hand panel: volume and
// portamento, the bender sensitivities, and the additions for playing from a piano (velocity and touch, stereo width). To
// its right, the voice as the signal flows: LFO, DCO, HPF; VCF, VCA, ENV; chorus and the voice mode.
const PERFORMANCE=[
 [{title:'Volume · Portamento · Tune',tone:'amber',keys:[['volume','Volume','knob'],['portaTime','Portamento','knob'],['tune','Tune','knob']]}],
 [{title:'Bender',tone:'violet',keys:[['porta','Porta','switch'],['bendDco','DCO'],['bendVcf','VCF'],['modDepth','LFO']]}],
 [{title:'Touch · Stereo',tone:'violet',keys:[['velVcf','Vel → VCF'],['velVca','Vel → VCA'],['afterVcf','Touch → VCF'],'width']}],
];
const VOICE=[
 [
  {title:'LFO',tone:'violet',keys:['lfoRate','lfoDelay']},
  {title:'DCO',tone:'cream',keys:['range',['lfoDco','LFO'],'pwm','sub','noise',['pwmSource','PWM','switch'],'pulse','saw']},
  {title:'HPF',tone:'teal',keys:[['hpf','Freq']]},
  {title:'VCF',tone:'red',keys:[['cutoff','Freq'],'res','env',['lfoVcf','LFO'],'kybd',['envPolarity','Env','switch']]},
 ],
 [
  {title:'VCA',tone:'blue',keys:['level',['vcaMode','VCA','switch']]},
  {title:'ENV',tone:'amber',keys:['attack','decay','sustain','release'],shape:{env:'amp',a:'attack',d:'decay',s:'sustain',r:'release'}},
  {title:'Chorus',tone:'green',keys:[['chorus','Mode'],'chorusNoise',['chorusMix','Mix'],['chorusRate','Rate'],['chorusDepth','Depth']]},
  {title:'Voices',tone:'cream',keys:[['unison','Mode','switch'],'hold',['unisonDetune','Detune'],'voices',['spread','Spread']]},
 ],
];

export default function JunoPage(){
 return <SynthShell synth={SYNTHS.juno} expand={(key,value)=>key==='chorus'?chorusMode(value):[key]} className="juno" helpInBar panelClassName="complete" picker={PatchGrid} gridKeys toggles>
  {({group})=><div className="jn-layout">
   <div className="jn-perf" role="group" aria-label="Performance">{PERFORMANCE.map((row,i)=><div className="jn-row" key={i}>{row.map(g=>group(g))}</div>)}</div>
   <div className="jn-main">{VOICE.map((row,i)=><div className="jn-row" key={i}>{row.map(g=>group(g))}</div>)}</div>
  </div>}
 </SynthShell>;
}
