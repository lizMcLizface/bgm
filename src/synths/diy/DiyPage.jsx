import React,{useEffect,useRef,useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {Lever,Fader} from '../ui/controls';
import {PickButtons,OledPicker,FmPicker,PolyPicker,HToggle,waveIcon} from './DiyControls';
import {Workspace,FloatBox} from './DiyWorkspace';
import DiyEnvEditor from './DiyEnvEditor';
import RoutingMatrix,{OperatorGrid} from './DiyMatrix';
import LabPanels from './LabPanels';
import {load,save} from '../storage';
import {SYNTHS} from '../models';
import {startDiySynth} from './live';
import {applyTopology} from './patches';
import {MODELS,MOD_SOURCES,MOD_TARGETS} from '../../synth-lab/patch';
import {FM_ALGORITHMS,FM_MOD_SOURCES,FM_MOD_TARGETS} from '../../synth-lab/fmPatch';
import {BODY_TYPES} from '../../synth-lab/voiceColour';
import {useEnsemblePanel} from '../ui/EmbeddedShell';

const WAVES=['Off','Sine','Triangle','Saw','Pulse','Organ','Hollow','Choir','Glass','Reed','Band-limited triangle'];
const OPTIONS={waveA:WAVES,waveB:WAVES,filter:['12 dB low-pass','24 dB low-pass','Band-pass','High-pass','Notch'],noiseType:['White','Pink','Brown'],phaseLock:['Free','Restart'],filterFamily:['State variable','Feedback ladder (LP24)'],lfoShape:['Sine','Triangle','Square','Saw','Sample & hold'],hardSync:['Off','B resets A'],bLow:['Audio range','Low range'],bKeytrack:['Fixed','Keyboard'],envelopeTarget:['A + B','A only'],bodyType:BODY_TYPES,enabled:['Muted','On'],wave:['Sine','Half sine','Absolute sine','Squared sine'],keySync:['Free running','Reset on key'],legacyEnvelope:['Current','Legacy'],legacyAmp:['Current','Legacy'],bypass:['Active','Bypassed'],pingPong:['Stereo','Ping-pong']};
const shortLabel=label=>label.split(' · ')[0];
// short names for the buttons and switch ends; the full name stays as the tooltip
const SHORT={'State variable':'SVF','Feedback ladder (LP24)':'Ladder','B resets A':'Sync','Audio range':'Audio','Low range':'Low','Keyboard':'Key','A only':'A','A + B':'A+B','Free running':'Free','Reset on key':'Reset','Overlapping notes':'Overlap','All mono notes':'All','Active':'On','Bypassed':'Bypass','Muted':'Mute','Ping-pong':'Ping','Band-limited triangle':'BL tri','White':'W','Pink':'P','Brown':'B','Low strings':'Low str','High strings':'High str','Hollow pipe':'Pipe','Metallic':'Metal','Sample & hold':'S&H','Half sine':'Half','Absolute sine':'Abs','Squared sine':'Squared','Polyphonic':'Poly','Mono retrigger':'Retrig','Mono legato':'Legato','12 dB low-pass':'LP12','24 dB low-pass':'LP24','Band-pass':'BP','High-pass':'HP'};
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
  if(base==='waveA'||base==='waveB')return pick(2)({icons:options.map(waveIcon)});
  if(base==='lfoShape')return pick(1)({icons:options.map(waveIcon)});
  if(key==='performance.mode'){
   const glide=['Overlapping notes','All mono notes'];
   return <div className="pick-stack" key={key}>
    <PickButtons stack label="Voice mode" options={shorts} titles={options} value={values[key]} onChange={i=>change(key,i)} tone={tone}/>
    <PickButtons stack label="Glide" options={glide.map(short)} titles={glide} value={values['performance.glide']} onChange={i=>change('performance.glide',i)} tone={tone}/>
   </div>;
  }
  if(base==='noiseType')return <PickButtons key={key} label={text} options={shorts} titles={options} value={values[key]} onChange={i=>change(key,i)} colours={['#ece8dc','#f08fb4','#b98a5e']} narrow tone={tone}/>;
  if(options.length<=5)return pick(1)();
  return select(key,label,options);
 };
 const field=(entry,tone='cream')=>{
  const [key,label]=Array.isArray(entry)?entry:[entry,null],base=key.split('.').at(-1);
  if(key==='performance.glide')return null; // drawn under the voice mode
  let options=OPTIONS[base];
  if(key==='effects.quality')options=['8 lines','16 lines'];
  if(key==='global.quality')options=['1×','2×','4×'];
  if(base.startsWith('modSource'))options=fm?FM_MOD_SOURCES:MOD_SOURCES;
  if(base.startsWith('modTarget'))options=fm?FM_MOD_TARGETS:MOD_TARGETS;
  if(key==='performance.mode')options=['Polyphonic','Mono retrigger','Mono legato'];
  if(key==='performance.glide')options=['Overlapping notes','All mono notes'];
  // an FM operator's wave, with Off built into the picker (the operator's switch)
  if(fm&&base==='wave'&&key.startsWith('operators.')){
   const on=key.replace(/wave$/,'enabled'),names=['Off','Sine','Half sine','Rectified','Double sine'],titles=['Operator off','Sine','Half sine: the positive half of the sine','Rectified sine: both halves positive','Double sine: a sine squared, twice the rate'];
   return <PickButtons key={key} label="Wave" options={names} titles={titles} value={values[on]===0?0:values[key]+1} onChange={i=>{if(i===0)change(on,0);else{change(on,1);change(key,i-1);}}} columns={1} icons={names.map(waveIcon)} tone={tone}/>;
  }
  if(base==='bPhase')return <Fader key={key} spec={synth.params.BY_KEY[key]} value={values[key]} onChange={(k,v)=>{change(k,v);change(k.replace('bPhase','phaseLock'),v>0?1:0);}} tone={tone} label={label??'Phase'}/>;
  return options?choice(key,label,options,base,tone):control([key,label??shortLabel(synth.params.BY_KEY[key].label)],tone);
 };
 const [shapeOpen,setShapeOpen]=useState(null);
 // a small lamp that breathes at an LFO's rate, never faster than about 3 Hz
 const lamp=hz=><i className="lamp" aria-hidden="true" style={{'--period':Math.max(.33,Math.min(20,1/Math.max(.01,hz)))+'s'}}/>;
 // every section is its own floating box
 const at=(pre,key)=>/^(global|performance|carriers|layers|operators)[.]/.test(key)?key:pre+key;
 const group=(id,title,keys,tone='cream',pre='',actions,after)=><FloatBox key={id} id={id} title={title} tone={tone} actions={actions}>{keys.map(k=>k==='|'?<i className="ctl-split" key="split" aria-hidden="true"/>:field(Array.isArray(k)?[at(pre,k[0]),k[1]]:at(pre,k),tone))}{after}</FloatBox>;
 // two-way choices as horizontal switches, stacked in one column
 const switches=(pre,entries,tone)=><div className="htoggle-stack" key="switches">{entries.map(([k,label])=>{const key=at(pre,k),spec=synth.params.BY_KEY[key];return <HToggle key={key} spec={spec} options={OPTIONS[k].map(short)} titles={OPTIONS[k]} value={values[key]} onChange={change} tone={tone} label={label}/>;})}</div>;
 // an envelope box: its stages as faders and a Shape button that opens the curve editor (the three stage curves live there)
 const envBox=(id,title,keys,tone,pre,{curves,times,sustain,timing,hold,shapes})=>{
  const open=shapeOpen?.id===id,all=k=>pre+k;
  return <FloatBox key={id} id={id} title={title} tone={tone} actions={<><button type="button" className="shape-open" aria-expanded={open} title="Envelope curves" onClick={e=>{const anchor=e.currentTarget;setShapeOpen(o=>o?.id===id?null:{id,anchor});}}>Shape</button>
   {timing&&<span className="timing-radio" role="radiogroup" aria-label="Envelope timing">{['Current','Legacy'].map((name,i)=><button type="button" key={name} role="radio" aria-checked={values[pre+timing]===i} className={values[pre+timing]===i?'on':''} title={i?'The older envelope timing':'The current envelope timing'} onClick={()=>change(pre+timing,i)}>{name}</button>)}</span>}</>}>
   {keys.map(k=>field(Array.isArray(k)?[at(pre,k[0]),k[1]]:at(pre,k),tone))}
   {open&&<DiyEnvEditor title={title} anchor={shapeOpen.anchor} onClose={()=>setShapeOpen(null)} values={values} specs={synth.params.BY_KEY} change={change}
    curves={curves.map(all)} times={Object.fromEntries(Object.entries(times).map(([s,k])=>[s,all(k)]))} sustain={all(sustain)} hold={hold&&{time:all(hold.time),level:all(hold.level)}} shapes={shapes?.map(all)}/>}
  </FloatBox>;
 };
 const lfo1=fm?[['lfoRate','Rate'],['lfoShape','Shape'],['lfoDelay','Fade'],'|',['vibrato','Pitch'],['tremolo','Amp'],['lfoIndex','Index']]:[['lfoRate','Rate'],['lfoShape','Shape'],['lfoDelay','Fade'],['lfoPitch','Pitch'],['lfoFilter','Filter'],['lfoPwm','PWM']];
 const lfo2=fm?[['lfo2Rate','Rate'],'|',['lfo2Pitch','Pitch'],['lfo2Index','Index'],['lfo2Amp','Trem']]:[['lfo2Rate','Rate'],['lfo2Pitch','Pitch'],['lfo2Filter','Filter'],['lfo2Amp','Trem']];
 const adsr=(a,d,s,r)=>[[a,'A'],[d,'D'],[s,'S'],[r,'R']];
 const modEnv=adsr('modAttack','modDecay','modSustain','modRelease');
 // the per-note colour controls, in three boxes by what they do
 const excitation=[['breath','Breath'],['bow','Bow'],['airBrightness','Bright'],['noiseMotion','Rough'],['noisePressure','Pressure'],['noiseAttack','Attack']];
 const vowel=[['formant','Amount'],['vowel','Vowel'],['formantShift','Size']];
 const body=[['body','Amount'],['bodyType','Type'],['bodyTune','Tune'],['bodyDecay','Decay']];
 const operatorTone=['wave','ratio','fixed','detune','level','pan',['rateScale','Key rate']];
 const operatorEnvelope=[['attack','A'],['peak','Peak'],['decay1','D1'],['breakpoint','Break'],['decay2','D2'],['sustain','S'],['release','R']];
 const oscA=[['waveA','Wave'],['levelA','Level'],['coarseA','Tune'],['pulseA','PW offset']];
 const oscB=[['waveB','Wave'],['levelB','Level'],['coarseB','Tune'],['fineB','Fine'],['bPhase','Phase'],['pulseB','PW offset']];
 const oscCommon=[['pulse','Width'],['sub','Sub'],['noise','Noise'],['noiseType','Colour']];
 const lowpass=[['filter','Type'],['filterFamily','Topology'],['cutoff','Cutoff'],['resonance','Res'],['drive','Drive']];
 const filterMod=[['filterAmount','Env'],['keytrack','Key'],['velocityTone','Vel']];
 const amp=[['attack','A'],['ampHold','H'],['decay','D'],['sustain','S'],['release','R']],filterEnv=adsr('filterAttack','filterDecay','filterSustain','filterRelease');
 const oscRouting=[['hardSync','Sync'],['ring','Ring'],['polyPitch','B → A freq'],['polyPwm','B → A PW'],['polyFilter','B → filter']];
 // boxes group a thing by what it does: voice handling, output, drift, expression
 const voices=fm?['performance.mode','performance.glide','performance.portamento','global.polyphony']:['performance.mode','performance.glide','performance.portamento','global.polyphony','global.unison','global.spread'];
 const output=fm?['global.gain','global.width','global.quality']:['global.gain','global.width',prefix+'mix',prefix+'pan'];
 const fmCore=['global.index','global.feedback'];
 const driftKeys=fm?[['global.voiceDrift','Voice'],['global.wanderRate','Rate'],['global.wanderCents','Depth']]:[[prefix+'drift','Voice'],[prefix+'wanderRate','Rate'],[prefix+'wanderCents','Depth']];
 const layerBox=<FloatBox id="layer" title="Layer" tone="teal"><div className="arch">
    <div className="arch-layers">
     <PickButtons stack compact label="Layer" options={['I','II']} titles={['Layer 1','Layer 2']} value={layer} disabled={values['global.model']!==2} onChange={setLayer}/>
     <div className="pick row compact tone-teal"><div className="pick-grid" style={{"--cols":1}}>
      <button type="button" disabled={values['global.model']!==2} title={`Copy layer ${layer+1} onto layer ${2-layer}`} onClick={()=>{const next={...values};for(const [key,value] of Object.entries(values))if(key.startsWith(prefix))next[key.replace(prefix,`layers.${1-layer}.`)]=value;replaceValues(next);}}>{layer?'2→1':'1→2'}</button>
      <button type="button" role="switch" aria-checked={link} className={link?'on':''} disabled={values['global.model']!==2} title="Edit both layers together: a change to one is repeated on the other" onClick={()=>setLink(!link)}>1+2</button>
     </div><span className="fader-label">Link</span></div>
    </div>
   </div></FloatBox>;
 const highpassBox=fm?null:<FloatBox key="highpass" id="highpass" title="High-pass" tone="red">
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
     {layerBox}
     {group('voices','Voices',voices,'teal')}
     {frame('osc',group('osc-a',`Oscillator A${layerTag}`,oscA,'cream',prefix),group('osc-b',`Oscillator B${layerTag}`,oscB,'cream',prefix,undefined,switches(prefix,[['bLow','Range'],['bKeytrack','Tracking'],['phaseLock','Phase']],'cream')),group('osc-common',`Common${layerTag}`,oscCommon,'cream',prefix),group('interaction','Oscillator routing',oscRouting,'violet',prefix))}
    </div>
    <div className="pf-row">
     {frame('lfo',group('lfo1','LFO 1',lfo1,'violet',prefix,lamp(values[prefix+'lfoRate'])),group('lfo2','LFO 2',lfo2,'violet',prefix,lamp(values[prefix+'lfo2Rate'])),group('drift','Drift',driftKeys,'violet','',lamp(values[prefix+'wanderRate']*2)))}
     {frame('env',envBox('amp-env','Amp',amp,'amber',prefix,{curves:['ampAttackCurve','ampDecayCurve','ampReleaseCurve'],times:{A:'attack',D:'decay',R:'release'},sustain:'sustain',timing:'legacyAmp',hold:{time:'ampHold',level:'ampHoldLevel'},shapes:['ampAttackShape','ampDecayShape','ampReleaseShape']}),envBox('filter-env','Filter',filterEnv,'amber',prefix,{curves:['filterAttackCurve','filterDecayCurve','filterReleaseCurve'],times:{A:'filterAttack',D:'filterDecay',R:'filterRelease'},sustain:'filterSustain',shapes:['filterAttackShape','filterDecayShape','filterReleaseShape']}),envBox('mod-env','Mod',modEnv,'amber',prefix,{curves:['modAttackCurve','modDecayCurve','modReleaseCurve'],times:{A:'modAttack',D:'modDecay',R:'modRelease'},sustain:'modSustain',shapes:['modAttackShape','modDecayShape','modReleaseShape']}),group('pitch-env','Pitch',[['pitchEnvAmount','Amount'],['pitchEnvDecay','Decay']],'amber',prefix))}
    </div>
   </div>
   {matrixBox}
  </div>
  <div className="pf-row pf-last">
   {frame('filter',group('lowpass','Low-pass',lowpass,'red',prefix),highpassBox,group('filter-mod','Filter mod',filterMod,'red',prefix))}
   {frame('body',group('excitation','Air & bow',excitation,'teal',colourPrefix),group('body','Body',body,'teal',colourPrefix),group('vowel','Vowel',vowel,'teal',colourPrefix))}
   {frame('out',group('output','Output',output,'teal'))}
  </div>
 </div>;
 // the starting arrangement, in four rows with a column on the right: the operator and its envelope, the oscillators' modulation, the voice's controls, the colour.
 // Every row is brought to the same width by spreading the spare room over its boxes (their controls spread to suit), and every box in a row to the same height; the
 // operator routing sits beside the first two rows and the routing matrix beside the last two, one width, one left edge.
 const arrange=sizes=>{
  const G=12,at={};
  const rows=[['operators','op-osc','op-env'],['fm-core','lfo1','lfo2','drift'],['voices','mod-env','pitch-env','output'],['vowel','body','excitation']].map(r=>r.filter(id=>sizes[id]));
  const widthOf=r=>r.reduce((t,id)=>t+sizes[id].w,0)+G*Math.max(0,r.length-1);
  const W=Math.max(...rows.map(widthOf));
  const heights=rows.map(r=>Math.max(0,...r.map(id=>sizes[id].h)));
  // the column on the right needs its own height: the rows beside it make it up
  if(sizes.routing)heights[1]=Math.max(heights[1],sizes.routing.h-heights[0]-G);
  if(sizes.matrix)heights[3]=Math.max(heights[3],sizes.matrix.h-heights[2]-G);
  const tops=[];let y=0;
  rows.forEach((r,n)=>{
   tops[n]=y;const share=(W-widthOf(r))/Math.max(1,r.length);let x=0;
   for(const id of r){const w=Math.round(sizes[id].w+share);at[id]={x,y,h:heights[n],w};x+=w+G;}
   y+=heights[n]+G;
  });
  const R=Math.max(sizes.routing?.w??0,sizes.matrix?.w??0),X=W+G;
  if(sizes.routing)at.routing={x:X,y:0,h:tops[1]+heights[1],w:R};
  if(sizes.matrix)at.matrix={x:X,y:tops[2],h:tops[3]+heights[3]-tops[2],w:R};
  return at;
 };
 return <Workspace storeKey="synths:diy:fm:box:" arrange={arrange} fixed>
  <FloatBox id="operators" title="Operator" tone="violet">
   <div className="diy-operators" role="group" aria-label="Operator">{/* always eight places in one row, so the box does not change as the count does: the ones the synth has no operator for are dark */Array.from({length:8},(_,i)=>i>=count?<button type="button" key={i} disabled aria-label={`Operator ${i+1} not in use`}><b>OP{i+1}</b></button>:<button type="button" key={i} aria-pressed={operator===i} title={`Operator ${i+1}: ${values[`operators.${i}.enabled`]===0?'muted':values[`carriers.${i}`]>0?'carrier':'modulator'}, ${values[`operators.${i}.fixed`]>0?`${Math.round(values[`operators.${i}.fixed`])} Hz`:`ratio ${values[`operators.${i}.ratio`]}×`}, gain ${values[`operators.${i}.level`]}`} onClick={()=>setOperator(i)}><b>OP{i+1}</b><span>{values[`operators.${i}.enabled`]===0?'off':(Math.round(values[`operators.${i}.level`]*100)/100).toString()}</span></button>)}</div>
  </FloatBox>
  {group('voices','Voices',voices,'teal')}
  {group('fm-core','FM',fmCore,'violet')}
  {group('output','Output',output,'teal')}
  {group('op-osc',`Operator ${operator+1} · oscillator`,operatorTone,'violet',prefix,<span className="timing-radio" role="radiogroup" aria-label="Operator phase">{['Free','Reset'].map((name,i)=><button type="button" key={name} role="radio" aria-checked={values['global.keySync']===i} className={values['global.keySync']===i?'on':''} title={i?'Every operator starts each note at the start of its cycle: the same attack every time':'Operators keep running between notes: each note starts at a different point'} onClick={()=>change('global.keySync',i)}>{name}</button>)}</span>)}
  {envBox('op-env',`Operator ${operator+1} · stages`,operatorEnvelope,'amber',prefix,{curves:['attackCurve','decayCurve','releaseCurve'],times:{A:'attack',D:'decay1',R:'release'},sustain:'sustain',timing:'legacyEnvelope'})}
  {group('lfo1','LFO 1',lfo1,'violet','global.',lamp(values['global.lfoRate']))}
  {group('lfo2','LFO 2',lfo2,'violet','global.',lamp(values['global.lfo2Rate']))}
  {group('drift','Drift',driftKeys,'violet','',lamp(values['global.wanderRate']*2))}
  {envBox('mod-env','Modulation',modEnv,'amber','global.',{curves:['modAttackCurve','modDecayCurve','modReleaseCurve'],times:{A:'modAttack',D:'modDecay',R:'modRelease'},sustain:'modSustain'})}
  <FloatBox id="matrix" title="Routing matrix" tone="violet"><RoutingMatrix fm={fm} values={values} specs={synth.params.BY_KEY} prefix={prefix} sources={fm?FM_MOD_SOURCES:MOD_SOURCES} targets={fm?FM_MOD_TARGETS:MOD_TARGETS} change={change}/></FloatBox>
  {group('pitch-env','Pitch',[['pitchStart','Amount'],['pitchTime','Decay']],'amber','global.')}
  {group('excitation','Air & bow',excitation,'teal',colourPrefix)}
  {group('vowel','Vowel',vowel,'teal',colourPrefix)}
  {group('body','Body',body,'teal',colourPrefix)}
  <FloatBox id="routing" title="Operator routing" tone="violet"><OperatorGrid values={values} specs={synth.params.BY_KEY} count={count} change={change}/></FloatBox>
 </Workspace>;
}

function DiyPage({fm=false}){
 const synth=SYNTHS[fm?'fm':'poly'];
 const embedded=useEnsemblePanel();
 const [layer,setLayer]=useState(0),[link,setLink]=useState(false),[operator,setOperator]=useState(0);
 // the tuning window, open until it is closed
 // the tuning window starts open on the DI-Poly and closed on FM, and each remembers its own
 const TUNING_KEY=fm?'synths:diy:fm:tuning-open':'synths:diy:tuning-open';
 const [labOpen,setLabOpen]=useState(()=>load(TUNING_KEY,!fm));
 const toggleLab=()=>setLabOpen(o=>{save(TUNING_KEY,!o);return !o;});
 return <SynthShell synth={synth} className={'diy '+(fm?'diy-fm':'diy-poly')} panelClassName="diy-panel" picker={fm?FmPicker:PolyPicker} helpInBar
  headerExtras={<button type="button" aria-pressed={labOpen} title="The tuning window: scale, tonic, octave, A4, shift and chord auto-tune" onClick={toggleLab}>Tuning</button>} startEngine={fm?startFM:startPoly}>
  {api=><><Editor fm={fm} api={api} layer={api.values['global.model']===2?layer:0} setLayer={setLayer} link={link} setLink={setLink} operator={Math.min(operator,(api.values['global.operators']??6)-1)} setOperator={setOperator} synth={synth}/>
   {!embedded?.bound&&labOpen&&<LabPanels onClose={toggleLab}/>}</>}
 </SynthShell>;
}
export function PolyPage(){return <DiyPage/>;}
export function FMPage(){return <DiyPage fm/>;}
