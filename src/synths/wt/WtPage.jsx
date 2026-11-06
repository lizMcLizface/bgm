import React,{useRef,useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {Dial} from '../ui/controls';
import {OledPicker} from '../diy/DiyControls';
import {Workspace,FloatBox} from '../diy/DiyWorkspace';
import {SYNTHS} from '../models';
import {formatValue} from '../params';
import JoyPad from './JoyPad';
import WaveEditor from './WaveEditor';
import WtMatrix from './WtMatrix';
import WtPadMatrix from './WtPadMatrix';
import EnvShapeEditor from '../ui/EnvShapeEditor';
import {BY_KEY} from './params';
import {DEFAULT_WAVES,SLOT_NAMES,packWaves,readStoredWaves,storeWaves,smoothed,inverted} from './waves';

// the LFO shapes as icons: sine, triangle, saw up, saw down, square, sample and hold
const SHAPE_PATHS=['M1 7 C4 -1 8 -1 11 7 S18 15 21 7','M1 12 L6 2 L16 12 L21 2','M1 12 L11 2 V12 L21 2','M1 2 L11 12 V2 L21 12','M1 12 V2 H11 V12 H21 V2','M1 8 H5 V3 H9 V11 H13 V6 H17 V9 H21'];
const SHAPE_NAMES=['Sine','Triangle','Saw up','Saw down','Square','Sample and hold'];
const VOICE=[['uniVoices','Unison'],['uniDetune','Detune'],['uniSpread','Spread'],'glide','voiceMode',['bendRange','Bend']];
const SUB_PATHS=['M1 7 C4 -1 8 -1 11 7 S18 15 21 7','M1 12 L6 2 L16 12 L21 2','M1 12 V2 H11 V12 H21 V2'];
const SUB_NAMES=['Sine','Triangle','Pulse'];
const FILTER=[['filterType','Type'],'cutoff','res',['filterEnv','Env'],['keyFollow','Key'],'drive'];
const adsr=p=>[[p+'Attack','A'],[p+'Decay','D'],[p+'Sustain','S'],[p+'Release','R']];

// The arrangement, fixed: boxes are packed edge to edge on a grid of four columns over two rows and then two more rows with the routing matrix at the right:
//   wave A | joystick modulation | wave B | position       sub + lfo 1 + lfo 2 | vector env | modulation env | routing matrix
//   wave D | joystick            | wave C | output         voice + filter      | filter env | amp env        | routing matrix
// The waves are as wide as the two boxes under them, the four boxes of the second column are one width, the two envelopes of the third are one width, and
// the position and output boxes are one width. A box keeps its own height.
const arrange=sizes=>{
 const G=6,at={},size=id=>sizes[id]??{w:0,h:0};
 const nat=id=>size(id).w,max=(...v)=>Math.max(0,...v),h=(...ids)=>max(...ids.map(i=>size(i).h));
 const W0=Math.round(max(nat('waveA'),nat('source')+nat('lfo1')+nat('lfo2')+2*G,nat('voice')+nat('filter')+G));
 const W1=Math.round(max(nat('joy'),nat('padmod'),nat('venv'),nat('fenv')));
 const W2=Math.round(max(nat('menv'),nat('aenv'))),W3=Math.round(max(nat('output'),nat('padoffs')));
 const c1=W0+G,c2=c1+W1+G,c3=c2+W0+G;
 const put=(id,x,y,w,hh)=>{if(sizes[id])at[id]={x,y,w,h:hh};};
 const H1=h('waveA','padmod','waveB','padoffs'),H2=h('waveD','joy','waveC','output'),H3=h('source','lfo1','lfo2','venv','menv'),H4=h('voice','filter','fenv','aenv');
 const y2=H1+G,y3=y2+H2+G,y4=y3+H3+G;
 put('waveA',0,0,W0,H1);put('padmod',c1,0,W1,H1);put('waveB',c2,0,W0,H1);put('padoffs',c3,0,W3,H1);
 put('waveD',0,y2,W0,H2);put('joy',c1,y2,W1,H2);put('waveC',c2,y2,W0,H2);put('output',c3,y2,W3,H2);
 // the three boxes of the third row share the first column's width, as do the two of the fourth
 const share=(ids,y,hh)=>{const extra=(W0-ids.reduce((t,i)=>t+nat(i),0)-G*(ids.length-1))/ids.length;let x=0;for(const id of ids){const w=Math.round(nat(id)+extra);put(id,x,y,w,hh);x+=w+G;}};
 share(['source','lfo1','lfo2'],y3,H3);share(['voice','filter'],y4,H4);
 put('venv',c1,y3,W1,H3);put('menv',c2,y3,W2,H3);put('fenv',c1,y4,W1,H4);put('aenv',c2,y4,W2,H4);
 // the routing matrix takes all the room right of the envelopes, across the last two rows
 if(sizes.matrix){const x=c2+W2+G;put('matrix',x,y3,c3+W3-x,H3+G+H4);}
 return at;
};

export default function WtPage(){
 const defsRef=useRef(readStoredWaves()??DEFAULT_WAVES);
 const [defs,setDefsState]=useState(defsRef.current);
 const [modes,setModes]=useState(['draw','draw','draw','draw']);
 const liveRef=useRef(null),pending=useRef(0),joyLive=useRef(null);
 const [shapeOpen,setShapeOpen]=useState(null);
 // the kernel rebuilds a wave's tables on every commit, so edits are sent at most once per frame
 const setDefs=next=>{
  defsRef.current=next;setDefsState(next);storeWaves(next);
  if(!pending.current)pending.current=requestAnimationFrame(()=>{pending.current=0;liveRef.current?.setWaves(packWaves(defsRef.current));});
 };
 const setSlot=(i,def)=>setDefs(defsRef.current.map((d,k)=>k===i?def:d));
 return <SynthShell synth={SYNTHS.wt} className="diy wt" panelClassName="diy-panel wt-panel" picker={OledPicker} helpInBar
  engineOptions={()=>({waves:packWaves(defsRef.current)})} onEngine={live=>{liveRef.current=live;live.setWaves(packWaves(defsRef.current));}}
  onChoose={p=>{if(p.waves)setDefs(p.waves);}} onStats={d=>joyLive.current?.(d)}>
  {({control,values,change,replaceValues})=>{
   const box=(id,title,tone,keys)=><FloatBox key={id} id={id} title={title} tone={tone}>{keys.map(k=>control(k,tone))}</FloatBox>;
   const lfo=n=>{
    const key=`lfo${n}Shape`;
    return <FloatBox key={`lfo${n}`} id={`lfo${n}`} title={`LFO ${n}`} tone="violet">
     {control([`lfo${n}Rate`,'Rate'],'violet')}
     {control([`lfo${n}Beats`,'Beats'],'violet')}
     {control([`lfo${n}Fade`,'Fade'],'violet')}
     <span className="lfo-side"><button type="button" role="switch" aria-checked={values[`lfo${n}Sync`]===1} className={'lfo-sync'+(values[`lfo${n}Sync`]===1?' on':'')} title="Run at the tempo (Beats per cycle) instead of at the Rate" onClick={()=>change(`lfo${n}Sync`,values[`lfo${n}Sync`]===1?0:1)}>Sync</button>
     <span className="lfo-shapes" role="radiogroup" aria-label={`LFO ${n} shape`}>{SHAPE_PATHS.map((d,i)=><button type="button" key={i} role="radio" aria-checked={values[key]===i} title={SHAPE_NAMES[i]} aria-label={SHAPE_NAMES[i]} className={values[key]===i?'on':''} onClick={()=>change(key,i)}>
      <svg viewBox="0 0 22 14" aria-hidden="true"><path d={d}/></svg></button>)}</span></span>
    </FloatBox>;
   };
   // an envelope box: its four stages as faders and a Shape button that opens the curve editor (amplitude and filter only)
   const envBox=(id,title,tone,pre,env)=>{
    const open=shapeOpen?.id===id;
    return <FloatBox key={id} id={id} title={title} tone={tone} actions={<button type="button" className="shape-open" aria-expanded={open} title="Envelope curves" onClick={e=>{const anchor=e.currentTarget;setShapeOpen(o=>o?.id===id?null:{id,anchor});}}>Shape</button>}>
     {adsr(pre).map(k=>control(k,tone))}
     {open&&<EnvShapeEditor env={env} title={title} values={values} BY_KEY={BY_KEY} change={change} anchor={shapeOpen.anchor} onClose={()=>setShapeOpen(null)}
      times={{A:values[pre+'Attack'],D:values[pre+'Decay'],R:values[pre+'Release'],sustain:values[pre+'Sustain']}}/>}
    </FloatBox>;
   };
   const edits=i=><span className="wt-icons">
    <button type="button" title="Smooth: round off the edges" aria-label="Smooth" onClick={()=>setSlot(i,smoothed(defsRef.current[i]))}><svg viewBox="0 0 28 14" aria-hidden="true"><polyline points="1,10 4,3 7,11 10,2 13,9" className="wt-ico-faint"/><path d="M13 9 C16 9 17 3 20 3 S24 11 27 7" className="wt-ico"/></svg></button>
    <button type="button" title="Invert: flip upside down" aria-label="Invert" onClick={()=>setSlot(i,inverted(defsRef.current[i]))}><svg viewBox="0 0 28 14" aria-hidden="true"><path d="M1 7 C4 0 7 0 10 7 S14 14 17 7" className="wt-ico"/><path d="M24 2 V12 M21.5 4.5 L24 2 L26.5 4.5 M21.5 9.5 L24 12 L26.5 9.5" className="wt-ico-faint" style={{opacity:1}}/></svg></button>
   </span>;
   const modeSwitch=i=><span className="timing-radio" role="radiogroup" aria-label={`Wave ${SLOT_NAMES[i]} edit mode`}>{[['draw','Waveform'],['harm','Harmonics']].map(([m,name])=><button type="button" key={m} role="radio" aria-checked={modes[i]===m} className={modes[i]===m?'on':''} onClick={()=>setModes(a=>a.map((x,k)=>k===i?m:x))}>{name}</button>)}</span>;
   return <Workspace storeKey="synths:wt:layout6:" arrange={arrange} fixed>
    <FloatBox id="joy" title="Joystick" tone="blue"><JoyPad liveRef={joyLive} x={values.joyX} y={values.joyY} onChange={(joyX,joyY)=>replaceValues({...values,joyX,joyY})}/></FloatBox>
    {SLOT_NAMES.map((name,i)=><FloatBox key={name} id={'wave'+name} title={`Wave ${name}`} tone="cream" actions={<>{modeSwitch(i)}{edits(i)}</>}>
     <WaveEditor slot={i} def={defs[i]} mode={modes[i]} onChange={def=>setSlot(i,def)} control={control} values={values} change={change}/>
    </FloatBox>)}
    {box('voice','Voice','blue',VOICE)}
    <FloatBox id="source" title="Sub · noise" tone="blue">
     {control(['subLevel','Sub'],'blue')}
     <span className="lfo-shapes sub-shapes" role="radiogroup" aria-label="Sub wave">{SUB_PATHS.map((d,i)=><button type="button" key={i} role="radio" aria-checked={values.subWave===i} title={SUB_NAMES[i]} aria-label={SUB_NAMES[i]} className={values.subWave===i?'on':''} onClick={()=>change('subWave',i)}>
      <svg viewBox="0 0 22 14" aria-hidden="true"><path d={d}/></svg></button>)}</span>
     {control(['noiseLevel','Noise'],'blue')}{control(['noiseColor','Colour'],'blue')}
    </FloatBox>
    {box('filter','Filter','red',FILTER)}
    {envBox('fenv','Filter envelope','red','f','filter')}
    {envBox('aenv','Amplifier envelope','amber','a','amp')}
    {box('menv','Modulation envelope','violet',adsr('m'))}
    {box('venv','Vector envelope','violet',[...adsr('v'),['joySpin','Spin']])}
    {lfo(1)}{lfo(2)}
    {box('output','Output','blue',['volume','tempo'])}
    <FloatBox id="padmod" title="Joystick modulation" tone="blue"><WtPadMatrix values={values} change={change}/></FloatBox>
    <FloatBox id="padoffs" title="Position" tone="blue">
     {[['joyX','X'],['joyY','Y'],['joyRadius','Radius'],['joyAngle','Angle']].map(([k,label])=><div className="wt-padrow" key={k}><span className="wt-tag">{label}</span><div className="wt-knob">{k==='joyX'?<Dial spec={{...BY_KEY.joyX,default:0}} value={values.joyX} onChange={change} tone="blue" label="X"/>:control([k,label,'knob'],'blue')}<output className="wt-lcd" aria-label={label}>{formatValue(BY_KEY[k],values[k])}</output></div></div>)}
    </FloatBox>
    <FloatBox id="matrix" title="Routing matrix" tone="violet"><WtMatrix values={values} change={change}/></FloatBox>
   </Workspace>;
  }}
 </SynthShell>;
}
