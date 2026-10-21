import React,{useRef,useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import ProgramBrowser,{readStoredWaves} from './ProgramBrowser';
import VectorPad from './VectorPad';
import ModMatrix from './ModMatrix';
import {composeWaves,builtinWaves} from './waves';
import {BY_KEY} from './params';

// Content-sized sections: controls keep a usable size and the panel scrolls as
// needed. Envelopes and the matrix must never be squeezed into fixed-height rows.
const OSC=['A','B','C','D'];
const oscGroup=x=>({title:`Oscillator ${x}`,tone:'cream',keys:[[`wave${x}`,'Wave'],[`coarse${x}`,'Coarse'],[`fine${x}`,'Fine']]});
const RATES=['1','2','3','4','4A'];
const MIX_RATES={title:'Mix envelope rates',tone:'violet',keys:RATES.map(r=>[`mixRate${r}`,`R${r}`])};
const MIX_X={title:'Mix X (A ↔ C)',tone:'violet',keys:[0,1,2,3,4].map(i=>[`mixX${i}`,`X${i}`])};
const MIX_Y={title:'Mix Y (B ↔ D)',tone:'violet',keys:[0,1,2,3,4].map(i=>[`mixY${i}`,`Y${i}`])};
const FILTER={title:'Filter',tone:'red',keys:[['cutoff','Cutoff'],['resonance','Res'],['filterEnvAmount','Env']]};
const LFO1={title:'LFO 1',tone:'violet',keys:[['lfo1Shape','Shape'],['lfo1Rate','Rate']]};
const LFO2={title:'LFO 2',tone:'violet',keys:[['lfo2Shape','Shape'],['lfo2Rate','Rate']]};
const VOICE={title:'Voice',tone:'blue',keys:['unison','glide','volume',['raw','Waves'],'tune']};
const PANS={title:'Voice pans',tone:'teal',keys:[0,1,2,3,4,5,6,7].map(v=>[`pan${v}`,`${v+1}`])};
const REVERB={title:'Chorus · reverb',tone:'blue',keys:['chorusMix','chorusRate','chorusDepth','reverbMix','reverbDecay']};

function LoopMode({prefix,title,values,replaceValues}){
 const key=prefix+'Loop';
 return <label className="vs-loop-mode">Loop<select aria-label={title+' loop'} value={values[key]} onChange={e=>replaceValues({...values,[key]:Number(e.target.value)})}>
  {BY_KEY[key].options.map((name,i)=><option key={i} value={i}>{name}</option>)}
 </select></label>;
}

function Envelope({prefix,title,levels,control,values,replaceValues}){
 return <section className="group vs-envelope">
  <div className="vs-section-head"><h3>{title}</h3><LoopMode {...{prefix,title,values,replaceValues}}/></div>
  <div className="vs-envelope-controls">
   <div className="vs-stages"><h4>Rates <small>0 fast · 99 slow</small></h4><div>{RATES.map(r=>control([prefix+'Rate'+r,'R'+r],'amber'))}</div></div>
   <div className="vs-stages"><h4>Levels</h4><div>{Array.from({length:levels},(_,i)=>control([prefix+'Level'+i,'L'+i],'amber'))}</div></div>
   <div className="vs-stages"><h4>Loop</h4><div>{control([prefix+'Repeat','Repeat'],'amber')}</div></div>
  </div>
 </section>;
}

export default function VsPage(){
 const wavesRef=useRef(readStoredWaves()??composeWaves());
 const liveRef=useRef(null);
 const [hold,setHold]=useState(false);
 const setWaves=next=>{wavesRef.current=next;liveRef.current?.setWaves(new Float32Array(next));};
 const libraries=[{id:'programs',label:'VS programs',render:({choose,values,current})=><ProgramBrowser choose={choose} values={values} current={current} setWaves={setWaves}/>}];
 return <SynthShell synth={SYNTHS.vs} className="vs" panelClassName="vs-panel" libraries={libraries}
  engineOptions={()=>({waves:new Float32Array(wavesRef.current)})} onEngine={live=>{liveRef.current=live;live.setWaves(new Float32Array(wavesRef.current));}} onComparisonWaves={setWaves} onChoose={p=>{if(p.builtinWaves)setWaves(builtinWaves());}}>
  {({group,control,values,replaceValues})=>[
   <div className="panel-row vs-sources" key="0">
    <section className="group vector" key="pad"><h3>Vector</h3>
     <VectorPad values={values} hold={hold} onHold={setHold} onJoy={(x,y)=>replaceValues({...values,joyX:x,joyY:y})}/>
    </section>
    {OSC.map(x=>group(oscGroup(x)))}
   </div>,
   <div className="panel-row vs-mix" key="1">{group(MIX_RATES)}{group(MIX_X)}{group(MIX_Y)}
    <section className="group vs-mix-loop"><h3>Mix loop</h3><LoopMode prefix="mix" title="Mix envelope" {...{values,replaceValues}}/><div className="group-controls">{control(['mixRepeat','Repeat'],'violet')}</div></section>
   </div>,
   <div className="panel-row vs-envelopes" key="2">
    <Envelope prefix="amp" title="Amplifier envelope" levels={4} {...{control,values,replaceValues}}/>
    <Envelope prefix="filter" title="Filter envelope" levels={5} {...{control,values,replaceValues}}/>
   </div>,
   <div className="panel-row vs-settings" key="3">{group(FILTER)}{group(LFO1)}{group(LFO2)}{group(VOICE)}{group(REVERB)}</div>,
   <div className="panel-row vs-routing" key="4"><ModMatrix values={values} replaceValues={replaceValues}/>{group(PANS)}</div>,
  ]}
 </SynthShell>;
}
