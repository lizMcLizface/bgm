import React,{useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import AlgorithmDiagram from './AlgorithmDiagram';
import CartBrowser from './CartBrowser';

// Laid out like the DX7's edit sections, three rows that fit a tablet: the algorithm, LFO and
// pitch EG; the operator being edited; then the voice-wide controls.
const ENVELOPE={tone:'amber',keys:['r1','r2','r3','r4','l1','l2','l3','l4']};
const OUTPUT={tone:'red',keys:['level','velocity','ams','rateScale']};
const FREQUENCY={tone:'cream',keys:['mode','coarse','fine','detune']};
const SCALING={tone:'teal',keys:['breakPoint','leftDepth','leftCurve','rightDepth','rightCurve']};
const PITCH_EG={title:'Pitch EG',tone:'violet',keys:['pitchR1','pitchR2','pitchR3','pitchR4','pitchL1','pitchL2','pitchL3','pitchL4']};
const LFO={title:'LFO',tone:'violet',keys:['lfoWave','lfoSpeed','lfoDelay','pitchModDepth','ampModDepth','pitchModSens','lfoSync']};
const VOICE={title:'Voice',tone:'blue',keys:['transpose','mono','portamento',['modWheel','Wheel → pitch'],['pressure','Touch → pitch'],'tune','volume']};
const REVERB={title:'Reverb',tone:'blue',keys:['reverbMix','reverbDecay','reverbTone','reverbSize','reverbPredelay']};
const SWITCHES={title:'Operators',tone:'green',keys:['op1.on','op2.on','op3.on','op4.on','op5.on','op6.on']};

const LIBRARIES=[{id:'cart',label:'Cartridge',render:({choose,values,current})=><CartBrowser choose={choose} values={values} current={current}/>}];

export default function Dx7Page(){
 const [op,setOp]=useState(1);
 return <SynthShell synth={SYNTHS.dx7} className="dx7" panelClassName="complete" libraries={LIBRARIES}>
  {({group,values})=>{
   const prefix=`op${op}.`;
   const algorithm=<section className="group algorithm" key="algorithm"><h3>Algorithm {values.algorithm+1}</h3>
    <AlgorithmDiagram algorithm={values.algorithm} selected={op} onSelect={setOp}/>
   </section>;
   const picker=<section className="group channel-pick op-pick" key="op"><h3>Operator</h3>
    <div className="channel-buttons op-buttons" role="radiogroup" aria-label="Operator to edit">
     {[1,2,3,4,5,6].map(n=><button type="button" key={n} role="radio" aria-checked={op===n} className={(op===n?'on ':'')+(values[`op${n}.on`]?'':'off')} onClick={()=>setOp(n)}>{n}</button>)}
    </div>
   </section>;
   return [
    <div className="panel-row" key="0">{algorithm}{group({title:'Algorithm',tone:'green',keys:['algorithm','feedback']})}{group(LFO)}{group(PITCH_EG)}</div>,
    <div className="panel-row" key="1">{picker}{group({...ENVELOPE,title:`OP${op} envelope`},prefix)}{group({...OUTPUT,title:`OP${op} output`},prefix)}{group({...FREQUENCY,title:`OP${op} frequency`},prefix)}{group({...SCALING,title:`OP${op} scaling`},prefix)}</div>,
    <div className="panel-row" key="2">{group(SWITCHES)}{group(VOICE)}{group(REVERB)}</div>,
   ];
  }}
 </SynthShell>;
}
