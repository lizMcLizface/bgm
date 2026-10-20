import React,{useRef,useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import ProgramBrowser,{readStoredWaves} from './ProgramBrowser';
import VectorPad from './VectorPad';
import ModMatrix from './ModMatrix';
import {composeWaves} from './waves';

// Laid out in four rows: the vector pad and the four oscillators; the mix envelope; the filter,
// amplifier and LFOs; then the modulation matrix and the voice. The panel scrolls on a short screen.
const OSC=['A','B','C','D'];
const oscGroup=x=>({title:`Oscillator ${x}`,tone:'cream',keys:[[`wave${x}`,'Wave'],[`coarse${x}`,'Coarse'],[`fine${x}`,'Fine']]});
const RATES=['1','2','3','4','4A'];
const MIX_RATES={title:'Mix envelope rates',tone:'violet',keys:RATES.map(r=>[`mixRate${r}`,`R${r}`])};
const MIX_X={title:'Mix X (A ↔ C)',tone:'violet',keys:[0,1,2,3,4].map(i=>[`mixX${i}`,`X${i}`])};
const MIX_Y={title:'Mix Y (B ↔ D)',tone:'violet',keys:[0,1,2,3,4].map(i=>[`mixY${i}`,`Y${i}`])};
const MIX_LOOP={title:'Mix loop',tone:'violet',keys:[['mixLoop','Loop'],['mixRepeat','Repeat']]};
const FILTER={title:'Filter',tone:'red',keys:[['cutoff','Cutoff'],['resonance','Res'],['filterEnvAmount','Env']]};
const FILTER_ENV={title:'Filter envelope',tone:'amber',keys:[...RATES.map(r=>[`filterRate${r}`,`R${r}`]),...[0,1,2,3,4].map(i=>[`filterLevel${i}`,`L${i}`]),['filterLoop','Loop'],['filterRepeat','Rep']]};
const AMP_ENV={title:'Amplifier envelope',tone:'amber',keys:[...RATES.map(r=>[`ampRate${r}`,`R${r}`]),...[0,1,2,3].map(i=>[`ampLevel${i}`,`L${i}`]),['ampLoop','Loop'],['ampRepeat','Rep']]};
const LFO1={title:'LFO 1',tone:'violet',keys:[['lfo1Shape','Shape'],['lfo1Rate','Rate']]};
const LFO2={title:'LFO 2',tone:'violet',keys:[['lfo2Shape','Shape'],['lfo2Rate','Rate']]};
const VOICE={title:'Voice',tone:'blue',keys:['unison','glide','volume',['raw','Waves'],'tune']};
const PANS={title:'Voice pans',tone:'teal',keys:[0,1,2,3,4,5,6,7].map(v=>[`pan${v}`,`${v+1}`])};
const REVERB={title:'Chorus · reverb',tone:'blue',keys:['chorusMix','chorusRate','chorusDepth','reverbMix','reverbDecay']};

export default function VsPage(){
 const wavesRef=useRef(readStoredWaves()??composeWaves());
 const liveRef=useRef(null);
 const [hold,setHold]=useState(false);
 const setWaves=next=>{wavesRef.current=next;liveRef.current?.setWaves(new Float32Array(next));};
 const libraries=[{id:'programs',label:'VS programs',render:({choose,values,current})=><ProgramBrowser choose={choose} values={values} current={current} setWaves={setWaves}/>}];
 return <SynthShell synth={SYNTHS.vs} className="vs" panelClassName="complete" libraries={libraries}
  engineOptions={()=>({waves:new Float32Array(wavesRef.current)})} onEngine={live=>{liveRef.current=live;}}>
  {({group,control,values,replaceValues})=>[
   <div className="panel-row" key="0">
    <section className="group vector" key="pad"><h3>Vector</h3>
     <VectorPad values={values} hold={hold} onHold={setHold} onJoy={(x,y)=>replaceValues({...values,joyX:x,joyY:y})}/>
    </section>
    {OSC.map(x=>group(oscGroup(x)))}
   </div>,
   <div className="panel-row" key="1">{group(MIX_RATES)}{group(MIX_X)}{group(MIX_Y)}{group(MIX_LOOP)}</div>,
   <div className="panel-row" key="2">{group(FILTER)}{group(AMP_ENV)}{group(FILTER_ENV)}{group(LFO1)}{group(LFO2)}</div>,
   <div className="panel-row matrix-row-panel" key="3"><ModMatrix values={values} control={control} replaceValues={replaceValues}/>{group(VOICE)}{group(PANS)}{group(REVERB)}</div>,
  ]}
 </SynthShell>;
}
