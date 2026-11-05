import React,{useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import AlgorithmDiagram from './AlgorithmDiagram';
import {OledPicker,PresetKnob,PickButtons} from '../diy/DiyControls';
import {Fader,Choice} from '../ui/controls';
import {BY_KEY} from './params';

// Laid out like the DX7's edit sections, three rows that fit a tablet: the algorithm, LFO and
// pitch EG; the operator being edited; then the voice-wide controls.
const ENVELOPE={tone:'amber',keys:['r1','r2','r3','r4','l1','l2','l3','l4']};
const OUTPUT={tone:'red',keys:['level','velocity','ams','rateScale']};
const FREQUENCY={tone:'cream',keys:['mode','coarse','fine','detune']};
const SCALING={tone:'teal',keys:['breakPoint','leftDepth','leftCurve','rightDepth','rightCurve']};
const PITCH_EG={title:'Pitch EG',tone:'violet',keys:['pitchR1','pitchR2','pitchR3','pitchR4','pitchL1','pitchL2','pitchL3','pitchL4']};
const PITCH_LFO=['lfoWave','lfoSpeed','lfoDelay','pitchModDepth','ampModDepth','pitchModSens','lfoSync'];
const VOICE={title:'Voice',tone:'blue',keys:['transpose','mono','portamento',['modWheel','Wheel → pitch'],['pressure','Touch → pitch'],'tune','volume']};

const CHORUS=[['chorusMix','Mix'],['chorusRate','Rate'],['chorusDepth','Depth']];

// The top row, as on the DIY synths: a knob and display for the algorithm, then a knob and display for the sound (with the grid and a fresh generated sound).
function Dx7Picker(props){
 const {synth,values,change,currentCategory,choose}=props,algorithm=values?.algorithm??0;
 const step=dir=>change('algorithm',(algorithm+dir+32)%32);
 const canMake=synth.generate&&synth.generates?.includes(currentCategory);
 return <>
  <div className="oled-picker">
   <PresetKnob onStep={step} label="Step through the 32 algorithms"/>
   <div className="oled oled-fixed" role="status" title="The algorithm: turn the knob to change it"><span className="oled-cat">Algorithm</span><span className="oled-name" key={algorithm} style={{'--n':2}}>{algorithm+1} of 32</span></div>
  </div>
  <OledPicker {...props}/>
  {canMake&&<button type="button" className="sp-new" onClick={()=>choose(synth.generate(currentCategory,Math.floor(Math.random()*1e9)))} title="A fresh sound in this category, generated now">✦ New</button>}
 </>;
}

// A stepped parameter in the form the DIY synths use: two-way on/off as a lit hold-style key, any other two-way as a switch, longer lists as a grid of buttons.
function OnOffKey({spec,value,onChange,tone='green',label=spec.label}){
 const on=value===1;
 return <button type="button" className={'onoff-key tone-'+tone} aria-pressed={on} aria-label={label} title={label+': '+(on?'On':'Off')} onClick={()=>onChange(spec.key,on?0:1)}><b>{label}</b><span>{on?'On':'Off'}</span></button>;
}

export default function Dx7Page(){
 const [op,setOp]=useState(1);
 return <SynthShell synth={SYNTHS.dx7} className="dx7" panelClassName="complete" helpInBar picker={Dx7Picker}>
  {({values,change})=>{
   const prefix=`op${op}.`;
   const field=(entry,tone,pre='')=>{
    const [name,label]=Array.isArray(entry)?entry:[entry],key=pre+name,spec=BY_KEY[key],text=label??spec.label;
    if(!spec.options)return <Fader key={key} spec={spec} value={values[key]} onChange={change} tone={tone} label={text}/>;
    const onOff=spec.options[0]==='Off'&&spec.options[1]==='On';
    if(onOff)return <OnOffKey key={key} spec={spec} value={values[key]} onChange={change} tone={tone} label={text}/>;
    // a two-way choice stays a vertical pair of buttons (Ratio / Fixed)
    if(spec.options.length===2)return <Choice key={key} spec={spec} value={values[key]} options={spec.options} onChange={change} tone={tone} label={text}/>;
    const curve=name.endsWith('Curve');
    return <PickButtons key={key} label={text} options={spec.options} titles={spec.options} value={values[key]} onChange={i=>change(key,i)} columns={curve?1:2} square={curve} tone={tone}/>;
   };
   const box=(title,tone,keys,pre='',className='')=><section className={'group '+className} key={title} style={{'--n':keys.length}}><h3>{title}</h3><div className="group-controls">{keys.map(k=>field(k,tone,pre))}</div></section>;
   const algorithm=<section className="group algorithm" key="algorithm"><h3>Algorithm {values.algorithm+1}</h3>
    <AlgorithmDiagram algorithm={values.algorithm} selected={op} onSelect={setOp}/>
   </section>;
   // the operator being edited: six small square keys
   const picker=<section className="group op-pick" key="op"><h3>Operator</h3><div className="group-controls">
    <PickButtons label="Edit" options={['1','2','3','4','5','6']} titles={[1,2,3,4,5,6].map(n=>'Edit operator '+n)} value={op-1} onChange={i=>setOp(i+1)} columns={2} compact tone="teal"/>
   </div></section>;
   return [
    <div className="panel-row" key="0">{algorithm}{box('Algorithm','green',['algorithm','feedback'])}{box('LFO','violet',PITCH_LFO)}{box('Pitch EG','violet',PITCH_EG.keys)}</div>,
    <div className="panel-row" key="1">{picker}{box('OP'+op+' envelope','amber',ENVELOPE.keys,prefix)}{box('OP'+op+' output','red',OUTPUT.keys,prefix)}{box('OP'+op+' frequency','cream',FREQUENCY.keys,prefix)}{box('OP'+op+' scaling','teal',SCALING.keys,prefix)}</div>,
    <div className="panel-row" key="2">{box('Operators','green',[1,2,3,4,5,6].map(n=>['op'+n+'.on','OP'+n]),'','op-switches')}{box('Voice','blue',VOICE.keys)}{box('Chorus','blue',CHORUS)}</div>,
   ];
  }}
 </SynthShell>;
}
