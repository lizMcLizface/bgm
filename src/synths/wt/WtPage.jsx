import React,{useRef,useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import JoyPad from './JoyPad';
import WaveEditor from './WaveEditor';
import {DEFAULT_WAVES,SLOT_NAMES,packWaves,readStoredWaves,storeWaves} from './waves';

const lfoGroup=n=>({title:`LFO ${n}`,tone:'violet',keys:[[`lfo${n}Rate`,'Rate'],[`lfo${n}Shape`,'Shape'],[`lfo${n}Pitch`,'→ Pitch'],[`lfo${n}Cut`,'→ Filter'],[`lfo${n}X`,'→ X'],[`lfo${n}Y`,'→ Y'],[`lfo${n}Amp`,'→ Amp']]});
const VOICE={title:'Voice',tone:'blue',keys:[['uniVoices','Unison'],['uniDetune','Detune'],['uniSpread','Spread'],'glide']};
const FILTER={title:'Filter',tone:'red',keys:[['filterType','Type'],'cutoff','res',['filterEnv','Env'],['keyFollow','Key'],'drive']};
const FENV={title:'Filter envelope',tone:'red',keys:[['fAttack','A'],['fDecay','D'],['fSustain','S'],['fRelease','R']]};
const AENV={title:'Amplifier envelope',tone:'amber',keys:[['aAttack','A'],['aDecay','D'],['aSustain','S'],['aRelease','R']]};
const VENV={title:'Vector envelope',tone:'violet',keys:[['vAttack','A'],['vDecay','D'],['vSustain','S'],['vRelease','R'],['vecX','→ X'],['vecY','→ Y']]};
const OUT={title:'Output',tone:'blue',keys:[['velAmp','Vel → amp'],['velFilter','Vel → filter'],'volume']};
const FX={title:'Chorus · reverb',tone:'blue',keys:['chorusMix','chorusRate','chorusDepth','reverbMix','reverbDecay']};

export default function WtPage(){
 const defsRef=useRef(readStoredWaves()??DEFAULT_WAVES);
 const [defs,setDefsState]=useState(defsRef.current);
 const liveRef=useRef(null),pending=useRef(0);
 // the kernel rebuilds a wave's tables on every commit, so edits are sent at most once per frame
 const setDefs=next=>{
  defsRef.current=next;setDefsState(next);storeWaves(next);
  if(!pending.current)pending.current=requestAnimationFrame(()=>{pending.current=0;liveRef.current?.setWaves(packWaves(defsRef.current));});
 };
 const setSlot=(i,def)=>setDefs(defsRef.current.map((d,k)=>k===i?def:d));
 return <SynthShell synth={SYNTHS.wt} className="wt" panelClassName="wt-panel"
  engineOptions={()=>({waves:packWaves(defsRef.current)})} onEngine={live=>{liveRef.current=live;live.setWaves(packWaves(defsRef.current));}}
  onChoose={p=>{if(p.waves)setDefs(p.waves);}}>
  {({group,control,values,replaceValues})=>[
   <div className="panel-row wt-sources" key="0">
    <section className="group vector"><h3>Joystick</h3>
     <JoyPad x={values.joyX} y={values.joyY} onChange={(joyX,joyY)=>replaceValues({...values,joyX,joyY})}/>
    </section>
    {SLOT_NAMES.map((name,i)=><section className="group wt-wave-group" key={name}><h3>Wave {name}</h3>
     <WaveEditor slot={i} def={defs[i]} onChange={def=>setSlot(i,def)}/>
     <div className="group-controls">{control([`coarse${i+1}`,'Coarse'],'cream')}{control([`fine${i+1}`,'Fine'],'cream')}</div>
    </section>)}
   </div>,
   <div className="panel-row" key="1">{group(VOICE)}{group(FILTER)}{group(FENV)}{group(AENV)}</div>,
   <div className="panel-row" key="2">{group(VENV)}{group(lfoGroup(1))}{group(lfoGroup(2))}</div>,
   <div className="panel-row" key="3">{group(OUT)}{group(FX)}</div>,
  ]}
 </SynthShell>;
}
