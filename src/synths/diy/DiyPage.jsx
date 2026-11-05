import React,{useEffect,useRef,useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {Lever} from '../ui/controls';
import {PickButtons,OledPicker} from './DiyControls';
import {Workspace,FloatBox} from './DiyWorkspace';
import DiyEnvEditor from './DiyEnvEditor';
import RoutingMatrix from './DiyMatrix';
import {SYNTHS} from '../models';
import {startDiySynth} from './live';
import {applyTopology} from './patches';
import {MODELS,MOD_SOURCES,MOD_TARGETS} from '../../synth-lab/patch';
import {FM_ALGORITHMS,FM_MOD_SOURCES,FM_MOD_TARGETS} from '../../synth-lab/fmPatch';
import {BODY_TYPES} from '../../synth-lab/voiceColour';

const WAVES=['Off','Sine','Triangle','Saw','Pulse','Organ','Hollow','Choir','Glass','Reed','Band-limited triangle'];
const OPTIONS={waveA:WAVES,waveB:WAVES,filter:['12 dB low-pass','24 dB low-pass','Band-pass','High-pass'],filterFamily:['State variable','Feedback ladder (LP24)'],lfoShape:['Sine','Triangle','Square','Saw','Sample & hold'],hardSync:['Off','B resets A'],bLow:['Audio range','Low range'],bKeytrack:['Fixed','Keyboard'],envelopeTarget:['A + B','A only'],bodyType:BODY_TYPES,enabled:['Muted','On'],wave:['Sine','Half sine','Absolute sine','Squared sine'],keySync:['Free running','Reset on key'],legacyEnvelope:['Current','Legacy'],legacyAmp:['Current','Legacy'],bypass:['Active','Bypassed'],pingPong:['Stereo','Ping-pong']};
const shortLabel=label=>label.split(' · ')[0];
// short names for the buttons and switch ends; the full name stays as the tooltip
const SHORT={'State variable':'SVF','Feedback ladder (LP24)':'Ladder','B resets A':'Sync','Audio range':'Audio','Low range':'Low','Keyboard':'Key','A only':'A','A + B':'A+B','Free running':'Free','Reset on key':'Reset','Overlapping notes':'Overlap','All mono notes':'All','Active':'On','Bypassed':'Bypass','Muted':'Mute','Ping-pong':'Ping','Band-limited triangle':'BL tri','Low strings':'Low str','High strings':'High str','Hollow pipe':'Pipe','Metallic':'Metal','Sample & hold':'S&H','Half sine':'Half','Absolute sine':'Abs','Squared sine':'Squared','Polyphonic':'Poly','Mono retrigger':'Retrig','Mono legato':'Legato','12 dB low-pass':'LP12','24 dB low-pass':'LP24','Band-pass':'BP','High-pass':'HP'};
const short=o=>SHORT[o]??o;
const startPoly=options=>startDiySynth({...options,kind:'poly'}),startFM=options=>startDiySynth({...options,kind:'fm'});

function Editor({fm,api,layer,setLayer,link,setLink,operator,setOperator,synth}){
 const {values,control,change,replaceValues}=api;
 // with the layers linked, an edit to the layer being shown is repeated on the other one (a sound being loaded changes both, so is left alone)
 const before=useRef(values);
 useEffect(()=>{
  const old=before.current;before.current=values;
  if(fm||!link||values['global.model']!==2)return;
  const own=`layers.${layer}.`,other=`layers.${1-layer}.`,mine=[];let theirs=false;
  for(const key of Object.keys(values)){
   if(values[key]===old[key])continue;
   if(key.startsWith(own))mine.push(key);else if(key.startsWith(other))theirs=true;
  }
  if(theirs)return;
  for(const key of mine){const to=other+key.slice(own.length);if(values[to]!==values[key])change(to,values[key]);}
 },[values]);// eslint-disable-line react-hooks/exhaustive-deps

 const prefix=fm?`operators.${operator}.`:`layers.${layer}.`,colourPrefix=fm?'global.':prefix;
 const count=values['global.operators'];
 const layerTag=values['global.model']===2?` · layer ${layer+1}`:'';
 // Follow LP: the high-pass cutoff keeps its ratio to the low-pass cutoff, so the two move together even though the
 // high-pass runs much lower (10 Hz to 5 kHz against 20 Hz to 18 kHz). Moving the high-pass itself sets a new ratio.
 const [hpLink,setHpLink]=useState({on:false,ratio:1}),hpBefore=useRef(values);
 const lowKey=`${prefix}cutoff`,highKey=`${prefix}highpass`;
 const linkHighpass=on=>setHpLink({on,ratio:values[highKey]/values[lowKey]});
 useEffect(()=>{
  const old=hpBefore.current;hpBefore.current=values;
  if(fm||!hpLink.on)return;
  if(values[highKey]!==old[highKey]&&values[lowKey]===old[lowKey]){setHpLink(l=>({...l,ratio:values[highKey]/values[lowKey]}));return;}
  if(values[lowKey]!==old[lowKey]&&values[highKey]===old[highKey]){
   const spec=synth.params.BY_KEY[highKey],next=Math.min(spec.max,Math.max(spec.min,Math.round(values[lowKey]*hpLink.ratio)));
   if(next!==values[highKey])change(highKey,next);
  }
 },[values]);// eslint-disable-line react-hooks/exhaustive-deps
 const select=(key,label,options)=>{
  const spec=synth.params.BY_KEY[key];
  return <label className="diy-select" key={key}>{label??shortLabel(spec.label)}<select aria-label={label??shortLabel(spec.label)} value={values[key]} onChange={e=>change(key,Number(e.target.value))}>{options.map((name,i)=><option key={i} value={i}>{name}</option>)}</select></label>;
 };
 // a stepped parameter in its natural form: two ways is a toggle lever, waves are a grid of buttons, the filter response four
 // square keys, any other short list a column of buttons; only long lists (routing, bodies) stay a menu
 const choice=(key,label,options,base,tone)=>{
  const spec=synth.params.BY_KEY[key],text=label??shortLabel(spec.label),shorts=options.map(short);
  const pick=columns=>(extra={})=><PickButtons key={key} label={text} options={shorts} titles={options} value={values[key]} onChange={i=>change(key,i)} columns={columns} tone={tone} {...extra}/>;
  if(options.length===2)return <Lever key={key} spec={{key,options:shorts}} value={values[key]} onChange={change} tone={tone} label={text}/>;
  if(base==='filter')return pick(1)({square:true});
  if(base==='waveA'||base==='waveB')return pick(2)();
  if(options.length<=5)return pick(1)();
  return select(key,label,options);
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
  return options?choice(key,label,options,base,tone):control([key,label??shortLabel(synth.params.BY_KEY[key].label)],tone);
 };
 const [shapeOpen,setShapeOpen]=useState(null);
 // a small lamp that breathes at an LFO's rate, never faster than about 3 Hz
 const lamp=hz=><i className="lamp" aria-hidden="true" style={{'--period':Math.max(.33,Math.min(20,1/Math.max(.01,hz)))+'s'}}/>;
 // every section is its own floating box
 const at=(pre,key)=>/^(global|performance|carriers|layers|operators)[.]/.test(key)?key:pre+key;
 const group=(id,title,keys,tone='cream',pre='',actions)=><FloatBox key={id} id={id} title={title} tone={tone} actions={actions}>{keys.map(k=>field(Array.isArray(k)?[at(pre,k[0]),k[1]]:at(pre,k),tone))}</FloatBox>;
 // an envelope box: its stages as faders and a Shape button that opens the curve editor (the three stage curves live there)
 const envBox=(id,title,keys,tone,pre,{curves,times,sustain})=>{
  const open=shapeOpen?.id===id,all=k=>pre+k;
  return <FloatBox key={id} id={id} title={title} tone={tone} actions={<button type="button" className="shape-open" aria-expanded={open} title="Envelope curves" onClick={e=>{const anchor=e.currentTarget;setShapeOpen(o=>o?.id===id?null:{id,anchor});}}>Shape</button>}>
   {keys.map(k=>field(Array.isArray(k)?[at(pre,k[0]),k[1]]:at(pre,k),tone))}
   {open&&<DiyEnvEditor title={title} anchor={shapeOpen.anchor} onClose={()=>setShapeOpen(null)} values={values} specs={synth.params.BY_KEY} change={change}
    curves={curves.map(all)} times={Object.fromEntries(Object.entries(times).map(([s,k])=>[s,all(k)]))} sustain={all(sustain)}/>}
  </FloatBox>;
 };
 const lfo1=fm?[['lfoRate','Rate'],['vibrato','Vibrato'],['tremolo','Tremolo'],['lfoIndex','Index']]:[['lfoRate','Rate'],['lfoShape','Shape'],['lfoDelay','Fade'],['lfoPitch','Pitch'],['lfoFilter','Filter'],['lfoPwm','PWM']];
 const lfo2=fm?[['lfo2Rate','Rate']]:[['lfo2Rate','Rate'],['lfo2Pitch','Pitch'],['lfo2Filter','Filter'],['lfo2Amp','Trem']];
 const adsr=(a,d,s,r)=>[[a,'A'],[d,'D'],[s,'S'],[r,'R']];
 const modEnv=adsr('modAttack','modDecay','modSustain','modRelease');
 // the per-note colour controls, in three boxes by what they do
 const excitation=[['breath','Breath'],['bow','Bow'],['airBrightness','Bright'],['noiseMotion','Rough'],['noisePressure','Pressure'],['noiseAttack','Attack']];
 const vowel=[['formant','Amount'],['vowel','Vowel'],['formantShift','Size']];
 const body=[['body','Amount'],['bodyType','Type'],['bodyTune','Tune'],['bodyDecay','Decay']];
 const operatorTone=['enabled','wave','ratio','fixed','detune','level','pan',[`carriers.${operator}`,'Carrier']];
 const operatorEnvelope=[['attack','A'],['peak','Peak'],['decay1','D1'],['breakpoint','Break'],['decay2','D2'],['sustain','S'],['release','R'],['legacyEnvelope','Timing']];
 const oscA=[['waveA','Wave'],['levelA','Level'],['coarseA','Tune'],['pulseA','PW offset']];
 const oscB=[['waveB','Wave'],['levelB','Level'],['coarseB','Tune'],['fineB','Fine'],['pulseB','PW offset'],['bLow','Range'],['bKeytrack','Tracking']];
 const oscCommon=[['pulse','Width'],['sub','Sub'],['noise','Noise']];
 const lowpass=[['filter','Type'],['filterFamily','Topology'],['cutoff','Cutoff'],['resonance','Res'],['drive','Drive']];
 const filterMod=[['filterAmount','Env'],['keytrack','Key'],['velocityTone','Vel']];
 const amp=[...adsr('attack','decay','sustain','release'),['legacyAmp','Timing']],filterEnv=adsr('filterAttack','filterDecay','filterSustain','filterRelease');
 const oscRouting=[['hardSync','Sync'],['ring','Ring'],['polyPitch','B → A freq'],['polyPwm','B → A PW'],['polyFilter','B → filter'],['envelopePitch','Env → pitch'],['envelopeTarget','Env to']];
 // boxes group a thing by what it does: voice handling, output, drift, expression
 const voices=fm?['performance.mode','performance.glide','performance.portamento','global.polyphony','global.keySync']:['performance.mode','performance.glide','performance.portamento','global.polyphony','global.unison','global.spread'];
 const output=fm?['global.gain','global.width','global.quality']:['global.gain','global.width',prefix+'mix',prefix+'pan'];
 const fmCore=['global.index','global.feedback','global.feedbackOp'];
 const driftKeys=fm?[['global.wanderRate','Rate'],['global.wanderCents','Depth']]:[[prefix+'drift','Voice'],[prefix+'wanderRate','Rate'],[prefix+'wanderCents','Depth']];
 const sensitivity=['velocity','keyScale','rateScale','pressure'];
 const archBox=<FloatBox id="architecture" title="Architecture" tone="teal"><div className="arch">
    <PickButtons row tall label="Architecture" options={['Prophet','Jupiter','Dual','Juno']} titles={MODELS.map(m=>m.name)} value={values['global.model']} onChange={i=>change('global.model',i)}/>
    <div className="arch-layers">
     <PickButtons row tall label="Layer" options={['I','II']} titles={['Layer 1','Layer 2']} value={layer} disabled={values['global.model']!==2} onChange={setLayer}/>
     <div className="pick row tall tone-teal"><div className="pick-grid" style={{"--cols":2}}>
      <button type="button" disabled={values['global.model']!==2} title={`Copy layer ${layer+1} onto layer ${2-layer}`} onClick={()=>{const next={...values};for(const [key,value] of Object.entries(values))if(key.startsWith(prefix))next[key.replace(prefix,`layers.${1-layer}.`)]=value;replaceValues(next);}}>{layer?'II → I':'I → II'}</button>
      <button type="button" role="switch" aria-checked={link} className={link?'on':''} disabled={values['global.model']!==2} title="Edit both layers together: a change to one is repeated on the other" onClick={()=>setLink(!link)}>I + II</button>
     </div><span className="fader-label">Copy · link</span></div>
    </div>
   </div></FloatBox>;
 const highpassBox=fm?null:<FloatBox id="highpass" title="High-pass" tone="red">
    {field([prefix+'highpass','Cutoff'],'red')}{field([prefix+'highResonance','Res'],'red')}
    <Lever spec={{key:'hpLink',options:['Free','Link']}} value={hpLink.on?1:0} onChange={(_,v)=>linkHighpass(v===1)} tone="red" label="Follow LP"/>
   </FloatBox>;
 const matrixBox=<FloatBox id="matrix" title="Routing matrix" tone="violet"><RoutingMatrix fm={fm} values={values} specs={synth.params.BY_KEY} prefix={prefix} sources={fm?FM_MOD_SOURCES:MOD_SOURCES} targets={fm?FM_MOD_TARGETS:MOD_TARGETS} change={change}/></FloatBox>;
 const frame=(name,...boxes)=><div className={'pf-frame pf-'+name}>{boxes}</div>;
 // Poly: a fixed front-panel layout, rows 8 px apart as on the CS-80. The oscillators, LFOs, envelopes, filter and body each sit in
 // a frame; the routing matrix stands at the right of the first two rows.
 if(!fm)return <div className="poly-fixed">
  <div className="pf-top">
   <div className="pf-left">
    <div className="pf-row">
     {archBox}
     {frame('osc',group('osc-a',`Oscillator A${layerTag}`,oscA,'cream',prefix),group('osc-b',`Oscillator B${layerTag}`,oscB,'cream',prefix),group('osc-common',`Common${layerTag}`,oscCommon,'cream',prefix),group('interaction','Oscillator routing',oscRouting,'violet',prefix))}
    </div>
    <div className="pf-row">
     {frame('lfo',group('lfo1','LFO 1',lfo1,'violet',prefix,lamp(values[prefix+'lfoRate'])),group('lfo2','LFO 2',lfo2,'violet',prefix,lamp(values[prefix+'lfo2Rate'])),group('drift','Drift',driftKeys,'violet','',lamp(values[prefix+'wanderRate']*2)))}
     {frame('env',envBox('amp-env','Amp envelope',amp,'amber',prefix,{curves:['ampAttackCurve','ampDecayCurve','ampReleaseCurve'],times:{A:'attack',D:'decay',R:'release'},sustain:'sustain'}),envBox('filter-env','Filter envelope',filterEnv,'amber',prefix,{curves:['filterAttackCurve','filterDecayCurve','filterReleaseCurve'],times:{A:'filterAttack',D:'filterDecay',R:'filterRelease'},sustain:'filterSustain'}),envBox('mod-env','Modulation envelope',modEnv,'amber',prefix,{curves:['modAttackCurve','modDecayCurve','modReleaseCurve'],times:{A:'modAttack',D:'modDecay',R:'modRelease'},sustain:'modSustain'}))}
    </div>
   </div>
   {matrixBox}
  </div>
  <div className="pf-row">
   {frame('filter',group('lowpass','Low-pass',lowpass,'red',prefix),highpassBox,group('filter-mod','Filter mod',filterMod,'red',prefix))}
   {frame('body',group('excitation','Air & bow',excitation,'teal',colourPrefix),group('body','Body',body,'teal',colourPrefix),group('vowel','Vowel',vowel,'teal',colourPrefix))}
   {group('output','Output',output,'teal')}
   {group('voices','Voices',voices,'teal')}
  </div>
 </div>;
 return <Workspace storeKey="synths:diy:fm:box:">
  <FloatBox id="topology" title="Topology" tone="teal">
    <PickButtons row label="Operators" options={['4','6']} titles={['4 operators','6 operators']} value={count===4?0:1} onChange={i=>replaceValues(applyTopology(values,i?6:4,values['global.algorithm']))}/>
    <label className="diy-select wide">Starting topology<select aria-label="Starting topology" value={values['global.algorithm']} onChange={e=>replaceValues(applyTopology(values,count,Number(e.target.value)))}>{FM_ALGORITHMS.map((name,i)=><option key={i} value={i}>{name}</option>)}</select></label>
    <button type="button" onClick={()=>replaceValues(applyTopology(values,count,values['global.algorithm']))}>Reset routing</button>
    <span className="hint">Choosing a topology replaces custom routes.</span>
   </FloatBox>
  <FloatBox id="operators" title="Edit operator" tone="violet">
   <div className="diy-operators" role="group" aria-label="Edit operator">{Array.from({length:count},(_,i)=><button type="button" key={i} aria-pressed={operator===i} onClick={()=>setOperator(i)}><b>OP {i+1}</b><span>{values[`operators.${i}.fixed`]>0?`${Math.round(values[`operators.${i}.fixed`])} Hz`:`${values[`operators.${i}.ratio`]}×`}</span><small>{values[`operators.${i}.enabled`]===0?'Muted':values[`carriers.${i}`]>0?'Carrier':'Modulator'}</small></button>)}</div>
  </FloatBox>
  {group('voices','Voices',voices,'teal')}
  {group('fm-core','FM',fmCore,'violet')}
  {group('output','Output',output,'teal')}
  {group('op-osc',`Operator ${operator+1} · oscillator`,operatorTone,'violet',prefix)}
  {envBox('op-env',`Operator ${operator+1} · envelope`,operatorEnvelope,'amber',prefix,{curves:['attackCurve','decayCurve','releaseCurve'],times:{A:'attack',D:'decay1',R:'release'},sustain:'sustain'})}
  {group('op-response',`Operator ${operator+1} · sensitivity`,sensitivity,'amber',prefix)}
  {group('lfo1','LFO 1',lfo1,'violet','global.')}
  {group('lfo2','LFO 2',lfo2,'violet','global.')}
  {group('drift','Drift',driftKeys,'violet')}
  {envBox('mod-env','Modulation envelope',modEnv,'amber','global.',{curves:['modAttackCurve','modDecayCurve','modReleaseCurve'],times:{A:'modAttack',D:'modDecay',R:'modRelease'},sustain:'modSustain'})}
  <FloatBox id="matrix" title="Routing matrix" tone="violet"><RoutingMatrix fm={fm} values={values} specs={synth.params.BY_KEY} prefix={prefix} sources={fm?FM_MOD_SOURCES:MOD_SOURCES} targets={fm?FM_MOD_TARGETS:MOD_TARGETS} change={change}/></FloatBox>
  {group('pitch-env','Pitch envelope',['pitchStart','pitchTime'],'amber','global.')}
  {group('excitation','Air & bow',excitation,'teal',colourPrefix)}
  {group('vowel','Vowel',vowel,'teal',colourPrefix)}
  {group('body','Body',body,'teal',colourPrefix)}
  <FloatBox id="routing" title="Operator routing" tone="violet"><div className="diy-routing"><p className="hint">Rows modulate columns. Zero disconnects; carrier levels send operators to the output. Feedback uses the selected operator.</p><div className="diy-routing-scroll"><table><thead><tr><th scope="col">From ↓ / To →</th>{Array.from({length:count},(_,i)=><th scope="col" key={i}>OP {i+1}</th>)}<th scope="col">Output</th></tr></thead><tbody>{Array.from({length:count},(_,i)=><tr key={i}><th scope="row">OP {i+1}</th>{Array.from({length:count},(_,j)=><td key={j}>{j>i?<input aria-label={`Operator ${i+1} to ${j+1}`} type="number" min="0" max="2" step="0.05" value={values[`routes.${i}.${j}`]} onChange={e=>change(`routes.${i}.${j}`,Math.max(0,Math.min(2,Number(e.target.value))))}/>:<span aria-label="Unavailable">—</span>}</td>)}<td><input aria-label={`Operator ${i+1} carrier level`} type="number" min="0" max="1" step="0.05" value={values[`carriers.${i}`]} onChange={e=>change(`carriers.${i}`,Math.max(0,Math.min(1,Number(e.target.value))))}/></td></tr>)}</tbody></table></div></div></FloatBox>
 </Workspace>;
}

function DiyPage({fm=false}){
 const synth=SYNTHS[fm?'fm':'poly'];
 const [layer,setLayer]=useState(0),[link,setLink]=useState(false),[operator,setOperator]=useState(0);
 return <SynthShell synth={synth} className={'diy '+(fm?'diy-fm':'diy-poly')} panelClassName="diy-panel" picker={OledPicker} helpInBar startEngine={fm?startFM:startPoly}>
  {api=><Editor fm={fm} api={api} layer={api.values['global.model']===2?layer:0} setLayer={setLayer} link={link} setLink={setLink} operator={Math.min(operator,(api.values['global.operators']??6)-1)} setOperator={setOperator} synth={synth}/>}
 </SynthShell>;
}
export function PolyPage(){return <DiyPage/>;}
export function FMPage(){return <DiyPage fm/>;}
