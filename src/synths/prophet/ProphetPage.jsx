import React from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import BankBrowser from './BankBrowser';

// Laid out after the original front panel in three rows that fit a tablet:
// modulation (Poly-Mod, LFO/wheel-mod, glide/unison), sources (oscillators, mixer,
// touch routes), then the filter, amplifier and the additions.
const ROWS=[
 [
  {title:'Poly-Mod',tone:'violet',keys:[['pmEnv','Filt env'],['pmOscB','Osc B'],['pmFreqA','→ Freq A'],['pmPwA','→ PW A'],['pmFilter','→ Filter']]},
  {title:'LFO · wheel-mod',tone:'violet',keys:[['lfoRate','Freq'],'lfoSaw','lfoTri','lfoSquare',['lfoAmount','Initial'],['wheelMix','LFO ↔ noise'],['wmFreqA','→ Freq A'],['wmFreqB','→ Freq B'],['wmPwA','→ PW A'],['wmPwB','→ PW B'],['wmFilter','→ Filter']]},
  {title:'Glide · unison',tone:'blue',keys:['glide','unison',['unisonVoices','Voices'],['unisonDetune','Detune'],'priority','chord']},
 ],
 [
  {title:'Oscillator A',tone:'cream',keys:[['aFreq','Freq'],'aSaw','aPulse',['aPw','PW'],'sync']},
  {title:'Oscillator B',tone:'cream',keys:[['bFreq','Freq'],'bFine','bSaw','bTri','bPulse',['bPw','PW'],'bLow','bKybd']},
  {title:'Mixer',tone:'teal',keys:['mixA','mixB','mixNoise']},
  {title:'Velocity · touch',tone:'violet',keys:[['velFilter','Vel → filt'],['velAmp','Vel → amp'],['afterFilter','Touch → filt'],['afterAmp','Touch → amp'],['bendRange','Bend']]},
 ],
 [
  {title:'Filter',tone:'red',keys:['cutoff','res',['fEnv','Env amt'],['track','Kybd'],['filterRev','Rev'],['fAttack','A'],['fDecay','D'],['fSustain','S'],['fRelease','R']]},
  {title:'Amplifier',tone:'amber',keys:[['aAttack','A'],['aDecay','D'],['aSustain','S'],['aRelease','R'],'release']},
  {title:'Character',tone:'amber',keys:['vintage','volume','voices','width',['oversample','2× rate']]},
  {title:'Reverb',tone:'blue',keys:['reverbMix','reverbDecay','reverbTone','reverbSize','reverbPredelay']},
 ],
];

const LIBRARIES=[{id:'bank',label:'P5 programs',render:({choose,current})=><BankBrowser choose={choose} current={current}/>}];

export default function ProphetPage(){
 return <SynthShell synth={SYNTHS.prophet5} className="prophet" panelClassName="complete" libraries={LIBRARIES}>
  {({group})=>ROWS.map((row,i)=><div className="panel-row" key={i}>{row.map(g=>group(g))}</div>)}
 </SynthShell>;
}
