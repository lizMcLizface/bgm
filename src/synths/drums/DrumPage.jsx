import React,{useRef,useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import Transport from '../seq/Transport';
import {useSequencer} from '../seq/useSequencer';
import DrumLibrary,{ShareDrums} from './DrumLibrary';
import {readDrumLink,clearDrumLink} from './share';
import {KITS,emptyPattern,validPattern,patternCommands} from './kits';

// The sequencer grid: an accent row (three strengths), then one row per drum. Tap or drag across
// cells to paint; with the Flam tool a cell becomes a flam. The name buttons play the pad and pick
// which drum the knobs below edit. Steps past the pattern's length are dimmed.
function StepGrid({kit,pattern,length,tool,selected,onSelect,onPad,onCell,headRef}){
 const paint=useRef(null);
 const n=kit.tracks.length;
 const rows=[{label:'AC',title:'Accent',index:n},...kit.tracks.map(([key,short,long],t)=>({label:short,title:long,index:t,key}))];
 const down=(e,t,s)=>{
  if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(t===n){onCell(t,s,(pattern[t][s]+3)%4);return;}        // the accent row cycles 0 → 3 → 2 → 1 → 0
  const target=tool==='flam'?2:1;
  paint.current=pattern[t][s]===target?0:target;onCell(t,s,paint.current);
 };
 const over=(e,t,s)=>{if(t!==n&&paint.current!==null&&e.buttons)onCell(t,s,paint.current);};
 return <section className="group wide seq-grid" onPointerUp={()=>{paint.current=null;}} onPointerLeave={()=>{paint.current=null;}}>
  <div className="seq-names">
   {rows.map(r=><button type="button" key={r.label} className={'seq-name'+(r.index===selected?' on':'')+(r.index===n?' accent':'')} title={r.title} onPointerDown={()=>r.index===n?null:(onSelect(r.index),onPad(r.index))}>{r.label}</button>)}
  </div>
  <div className="seq-cells" ref={headRef} style={{'--rows':rows.length}}>
   {rows.map(r=>pattern[r.index].map((v,s)=><button type="button" key={r.label+s} aria-label={`${r.title} step ${s+1}`} aria-pressed={!!v}
    className={'cell'+(v?' on':'')+(v===2&&r.index!==n?' flam':'')+(r.index===n&&v?' lvl'+v:'')+(s%4===0?' beat':'')+(s>>2&1?' alt':'')+(r.index===n?' accent':'')+(s>=length?' out':'')}
    onPointerDown={e=>down(e,r.index,s)} onPointerEnter={e=>over(e,r.index,s)}/>))}
   <div className="playhead"/>
  </div>
 </section>;
}

export function DrumPage({kit}){
 const synth=SYNTHS[kit.id];
 const n=kit.tracks.length;
 const [shared]=useState(()=>readDrumLink(kit));
 const seq=useSequencer({
  id:kit.id,empty:emptyPattern(kit),
  valid:validPattern(kit),initialBank:shared.bank,onEdit:clearDrumLink,
  patternCommands:(i,p)=>patternCommands(kit,i,p),copyPattern:p=>p.map(r=>[...r]),tempoId:synth.params.BY_KEY.tempo.id,
 });
 const {bank}=seq;
 const [selected,setSelected]=useState(0);
 const [tool,setTool]=useState('hit');
 const setCell=(t,s,v)=>{
  const b=seq.bankRef.current,pattern=b.patterns[b.current];
  if(pattern[t][s]===v)return;
  seq.replacePattern(b.current,pattern.map((row,j)=>j===t?row.map((x,k)=>k===s?v:x):row));
  seq.send([[1,b.current<<10|(t===n?16:t)<<5|s,v]]);
 };
 const pad=t=>seq.live.current?.noteOn(900+t,36+t,.9);
 const libraries=[{id:'beats',label:'Beats',render:props=><DrumLibrary key="beats" {...props} kit={kit} seq={seq}/>},
  {id:'arrangements',label:'Arrangements',render:props=><DrumLibrary key="arrangements" {...props} kit={kit} seq={seq} arrangements/>}];
 const track=kit.tracks[selected]??kit.tracks[0];
 return <SynthShell synth={synth} className={'drums '+kit.id} panelClassName="complete seq" libraries={libraries} initialPatch={shared.patch} headerExtras={props=><ShareDrums {...props} kit={kit} bank={bank}/>} onEngine={seq.onEngine} onStats={seq.onStats} onMidiRealtime={seq.onMidiRealtime}>
  {({group})=>[
   <div className="panel-row knobs" key="0">
    <Transport seq={seq}>
     <span className="tool" role="radiogroup" aria-label="Step tool">
      <button type="button" role="radio" aria-checked={tool==='hit'} className={tool==='hit'?'on':''} onClick={()=>setTool('hit')}>Hit</button>
      <button type="button" role="radio" aria-checked={tool==='flam'} className={tool==='flam'?'on':''} onClick={()=>setTool('flam')} title="Paint flams: a quiet grace note before the beat">Flam</button>
     </span>
     {bank.title&&<p className="drum-stage"><strong>{bank.title}</strong> · {seq.playing&&bank.chain.length?'Playing':'Editing'} {'ABCDEFGH'[bank.current]}{bank.names?.[bank.current]?`: ${bank.names[bank.current]}`:''}{seq.playing&&!bank.chain.length&&<> · Playing {'ABCDEFGH'[seq.playingPattern]}</>}</p>}
     {shared.error&&<span className="drum-link-error" role="alert">{shared.error}</span>}
    </Transport>
    {group({title:'Tempo',tone:'amber',keys:['tempo','swing','flam','master','accent','kickBody']})}
   </div>,
   <div className="panel-row" key="1"><StepGrid kit={kit} pattern={bank.patterns[bank.current]} length={bank.lengths[bank.current]} tool={tool} selected={selected} onSelect={setSelected} onPad={pad} onCell={setCell} headRef={seq.head}/></div>,
   <div className="panel-row knobs" key="2">
    {group({title:track[2],tone:'red',keys:['Level','Tune','Decay','Tone','Pan'].map(f=>[track[0]+f,f==='Tone'?kit.tone[track[0]]??'Tone':f])})}
    {group({title:'Levels',tone:'teal',keys:kit.tracks.map(([key,short])=>[key+'Level',short])})}
    {group({title:'Reverb',tone:'blue',keys:['reverbMix','reverbDecay','reverbTone']})}
   </div>,
  ]}
 </SynthShell>;
}
export const Tr808Page=()=><DrumPage kit={KITS.tr808}/>;
export const Tr909Page=()=><DrumPage kit={KITS.tr909}/>;
export const Tr606Page=()=><DrumPage kit={KITS.tr606}/>;
