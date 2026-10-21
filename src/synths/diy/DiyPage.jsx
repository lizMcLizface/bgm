import React,{useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import {startDiySynth} from './live';
import {applyTopology} from './patches';
import {MODELS,MOD_SOURCES,MOD_TARGETS} from '../../synth-lab/patch';
import {FM_ALGORITHMS,FM_MOD_SOURCES,FM_MOD_TARGETS} from '../../synth-lab/fmPatch';
import {BODY_TYPES} from '../../synth-lab/voiceColour';

const WAVES=['Off','Sine','Triangle','Saw','Pulse','Organ','Hollow','Choir','Glass','Reed','Band-limited triangle'];
const OPTIONS={waveA:WAVES,waveB:WAVES,filter:['12 dB low-pass','24 dB low-pass','Band-pass','High-pass'],filterFamily:['State variable','Feedback ladder (LP24)'],lfoShape:['Sine','Triangle','Square','Saw','Sample & hold'],hardSync:['Off','B resets A'],bLow:['Audio range','Low range'],bKeytrack:['Fixed','Keyboard'],envelopeTarget:['A + B','A only'],bodyType:BODY_TYPES,enabled:['Muted','On'],wave:['Sine','Half sine','Absolute sine','Squared sine'],keySync:['Free running','Reset on key'],legacyEnvelope:['Current','Legacy'],legacyAmp:['Current','Legacy'],bypass:['Active','Bypassed'],pingPong:['Stereo','Ping-pong']};
const shortLabel=label=>label.split(' · ')[0];
const TABS=['Tone','Motion','Colour','Advanced'];
const startPoly=options=>startDiySynth({...options,kind:'poly'}),startFM=options=>startDiySynth({...options,kind:'fm'});

function Editor({fm,api,tab,layer,setLayer,operator,setOperator,synth}){
 const {values,control,change,replaceValues}=api;
 const prefix=fm?`operators.${operator}.`:`layers.${layer}.`,colourPrefix=fm?'global.':prefix;
 const count=values['global.operators'];
 const select=(key,label,options)=>{
  const spec=synth.params.BY_KEY[key];
  return <label className="diy-select" key={key}>{label??shortLabel(spec.label)}<select aria-label={label??shortLabel(spec.label)} value={values[key]} onChange={e=>change(key,Number(e.target.value))}>{options.map((name,i)=><option key={i} value={i}>{name}</option>)}</select></label>;
 };
 const field=(entry,tone='cream')=>{
  const [key,label]=Array.isArray(entry)?entry:[entry,null],base=key.split('.').at(-1);
  let options=OPTIONS[base];
  if(key==='effects.quality')options=['8 lines','16 lines'];
  if(key==='global.quality')options=['1×','2×','4×'];
  if(key==='global.feedbackOp')options=Array.from({length:count},(_,i)=>`Operator ${i+1}`);
  if(base.startsWith('modSource'))options=fm?FM_MOD_SOURCES:MOD_SOURCES;
  if(base.startsWith('modTarget'))options=fm?FM_MOD_TARGETS:MOD_TARGETS;
  if(key==='performance.mode')options=['Polyphonic','Mono retrigger','Mono legato'];
  if(key==='performance.glide')options=['Overlapping notes','All mono notes'];
  return options?select(key,label,options):control([key,label??shortLabel(synth.params.BY_KEY[key].label)],tone);
 };
 const group=(title,keys,tone='cream',pre='')=><section className="group diy-group" key={title}><h3>{title}</h3><div className="group-controls">{keys.map(k=>field(Array.isArray(k)?[pre+k[0],k[1]]:pre+k,tone))}</div></section>;
 const routes=Array.from({length:4},(_,i)=>[`modSource${i+1}`,`modTarget${i+1}`,`modDepth${i+1}`]).flat();
 const motion=['lfoRate',...(fm?['vibrato','tremolo','lfoIndex','lfo2Rate']:['lfoShape','lfoDelay','lfoPitch','lfoFilter','lfoPwm','lfo2Rate','lfo2Pitch','lfo2Filter','lfo2Amp']),'wanderRate','wanderCents'];
 const modEnv=['modAttack','modDecay','modSustain','modRelease','modAttackCurve','modDecayCurve','modReleaseCurve'];
 const colour=['breath','bow','airBrightness','noiseMotion','formant','vowel','formantShift','body','bodyType','bodyTune','bodyDecay','noisePressure','noiseAttack'];
 const operatorTone=['enabled','wave','ratio','fixed','detune','level','pan'];
 const operatorEnvelope=['attack','peak','decay1','breakpoint','decay2','sustain','release'];
 const polyTone=[['waveA','Wave A'],['levelA','A level'],['waveB','Wave B'],['levelB','B level'],['coarseA','Layer tune'],['coarseB','B tune'],['fineB','B fine'],['pulse','Width'],'sub','noise'];
 const filter=['cutoff','resonance','filter','filterFamily','highpass','highResonance','filterAmount','keytrack','velocityTone','drive'];
 const amp=['attack','decay','sustain','release'],filterEnv=['filterAttack','filterDecay','filterSustain','filterRelease'];
 const tuning=['hardSync','polyPitch','polyPwm','polyFilter','envelopePitch','envelopeTarget','pulseA','pulseB','bLow','bKeytrack','ring'];
 const globalMain=fm?['polyphony','gain','index','feedback','feedbackOp','width','quality','keySync']:['polyphony','gain','unison','spread','width'];
 const advanced=fm?['velocity','keyScale','rateScale','pressure','attackCurve','decayCurve','releaseCurve','legacyEnvelope']:['ampAttackCurve','ampDecayCurve','ampReleaseCurve','filterAttackCurve','filterDecayCurve','filterReleaseCurve','drift','pressureTone','pressureAmp','pressurePitch','velocityAmp','legacyAmp'];
 return <>
  {(tab==='Tone'||!fm)&&<section className="diy-context" aria-label="Voice editing">
   {fm?<>
    <label>Operators<select aria-label="Operator count" value={count} onChange={e=>replaceValues(applyTopology(values,Number(e.target.value),values['global.algorithm']))}><option value="4">4 operators</option><option value="6">6 operators</option></select></label>
    <label>Starting topology<select aria-label="Starting topology" value={values['global.algorithm']} onChange={e=>replaceValues(applyTopology(values,count,Number(e.target.value)))}>{FM_ALGORITHMS.map((name,i)=><option key={i} value={i}>{name}</option>)}</select></label>
    <button type="button" onClick={()=>replaceValues(applyTopology(values,count,values['global.algorithm']))}>Reset routing</button>
    <span className="hint">Choosing a topology replaces custom routes.</span>
   </>:<>
    {select('global.model','Architecture',MODELS.map(m=>m.name.split(' · ')[0]+(m.name.startsWith('Dual VCO')?m.name.includes('Prophet')?' · sync / Poly-Mod':' · multimode':'')))}
    {values['global.model']===2?<div className="diy-switch" role="group" aria-label="Layer">{[0,1].map(i=><button type="button" aria-pressed={layer===i} key={i} onClick={()=>setLayer(i)}>Layer {i+1}</button>)}<button type="button" onClick={()=>{const next={...values};for(const [key,value] of Object.entries(values))if(key.startsWith(prefix))next[key.replace(prefix,`layers.${1-layer}.`)]=value;replaceValues(next);}}>Copy to {2-layer}</button></div>:<span className="hint">One layer active · choose Dual layer to edit both.</span>}
   </>}
  </section>}
  {fm&&(tab==='Tone'||tab==='Advanced')&&<>
   <label className="diy-operator-select">Edit operator<select aria-label="Edit operator" value={operator} onChange={e=>setOperator(Number(e.target.value))}>{Array.from({length:count},(_,i)=><option key={i} value={i}>Operator {i+1} · {values[`carriers.${i}`]>0?'carrier':'modulator'}</option>)}</select></label>
   <div className="diy-operators" role="group" aria-label="Edit operator">{Array.from({length:count},(_,i)=><button type="button" key={i} aria-pressed={operator===i} onClick={()=>setOperator(i)}><b>OP {i+1}</b><span>{values[`operators.${i}.fixed`]>0?`${Math.round(values[`operators.${i}.fixed`])} Hz`:`${values[`operators.${i}.ratio`]}×`}</span><small>{values[`operators.${i}.enabled`]===0?'Muted':values[`carriers.${i}`]>0?'Carrier':'Modulator'}</small></button>)}</div>
  </>}
  {tab==='Tone'&&<>
   {group('Voice & output',globalMain,'teal','global.')}
   {fm?<>
    {group(`Operator ${operator+1} · oscillator`,operatorTone,'violet',prefix)}
    {group(`Operator ${operator+1} · envelope`,operatorEnvelope,'amber',prefix)}
    {group(`Operator ${operator+1} · output`,[[`carriers.${operator}`,'Carrier level']],'teal')}
   </>:<>
    {group(`Layer ${layer+1} · oscillators`,polyTone,'cream',prefix)}
    {group('Filter',filter,'red',prefix)}
    {group('Amplifier envelope',amp,'amber',prefix)}
    {group('Filter envelope',filterEnv,'amber',prefix)}
    {group('Layer mix',['mix','pan'],'teal',prefix)}
   </>}
  </>}
  {tab==='Motion'&&<>
   {group('LFOs & moving drift',motion,'violet',fm?'global.':prefix)}
   {group('Modulation envelope',modEnv,'amber',fm?'global.':prefix)}
   {Array.from({length:4},(_,i)=>group(`Modulation route ${i+1}`,routes.slice(i*3,i*3+3),'violet',fm?'global.':prefix))}
   {fm?group('Pitch envelope',['pitchStart','pitchTime'],'amber','global.'):group('Oscillator interaction',tuning,'violet',prefix)}
  </>}
  {tab==='Colour'&&group('Air, vowel & body',colour,'teal',colourPrefix)}
  {tab==='Advanced'&&<>
   {group('Note behaviour',['mode','portamento','glide'],'teal','performance.')}
   {group(fm?`Operator ${operator+1} · response`:'Envelope curves & expression',advanced,'amber',prefix)}
   {group('Performance offsets',['bend','wheel','pressure'],'violet','global.')}
   {fm&&<section className="group diy-routing"><h3>Operator routing</h3><p className="hint">Rows modulate columns. Zero disconnects; carrier levels send operators to the output. Feedback uses the selected operator above.</p><div className="diy-routing-scroll"><table><thead><tr><th scope="col">From ↓ / To →</th>{Array.from({length:count},(_,i)=><th scope="col" key={i}>OP {i+1}</th>)}<th scope="col">Output</th></tr></thead><tbody>{Array.from({length:count},(_,i)=><tr key={i}><th scope="row">OP {i+1}</th>{Array.from({length:count},(_,j)=><td key={j}>{j>i?<input aria-label={`Operator ${i+1} to ${j+1}`} type="number" min="0" max="2" step="0.05" value={values[`routes.${i}.${j}`]} onChange={e=>change(`routes.${i}.${j}`,Math.max(0,Math.min(2,Number(e.target.value))))}/>:<span aria-label="Unavailable">—</span>}</td>)}<td><input aria-label={`Operator ${i+1} carrier level`} type="number" min="0" max="1" step="0.05" value={values[`carriers.${i}`]} onChange={e=>change(`carriers.${i}`,Math.max(0,Math.min(1,Number(e.target.value))))}/></td></tr>)}</tbody></table></div></section>}
  </>}
 </>;
}

function DiyPage({fm=false}){
 const synth=SYNTHS[fm?'fm':'poly'];
 const [tab,setTab]=useState('Tone'),[layer,setLayer]=useState(0),[operator,setOperator]=useState(0);
 return <SynthShell synth={synth} className={'diy '+(fm?'diy-fm':'diy-poly')} panelClassName="diy-panel" startEngine={fm?startFM:startPoly}
  nav={<nav className="diy-tabs" aria-label="Panel sections">{TABS.map(t=><button type="button" key={t} aria-pressed={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</nav>}>
  {api=><Editor fm={fm} api={api} tab={tab} layer={api.values['global.model']===2?layer:0} setLayer={setLayer} operator={Math.min(operator,(api.values['global.operators']??6)-1)} setOperator={setOperator} synth={synth}/>}
 </SynthShell>;
}
export function PolyPage(){return <DiyPage/>;}
export function FMPage(){return <DiyPage fm/>;}
