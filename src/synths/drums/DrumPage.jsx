import React,{useEffect,useRef,useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import Transport from '../seq/Transport';
import {useSequencer} from '../seq/useSequencer';
import DrumLibrary,{ShareDrums} from './DrumLibrary';
import {readDrumLink,clearDrumLink} from './share';
import {KITS,emptyPattern,validPattern,patternCommands,voiceColour,ACCENT_COLOUR} from './kits';
import useCoreClock from '../../seq/useCoreClock';
import {load,save} from '../storage';
import {DrumMachineTop,DrumMachineVoices,DrumVoicePanel} from './DrumMachine';
import StepEditor from './StepEditor';
import SongStrip from './SongStrip';

// The sequencer grid: an accent row (three strengths), then one row per drum. Tap or drag across
// cells to paint; with the Flam tool a cell becomes a flam. The name buttons play the pad and pick
// which drum the knobs below edit. Steps past the pattern's length are dimmed.
function StepGrid({kit,pattern,length,tool,selected,onSelect,onPad,onCell,headRef,locks={},trackLengths={},picked,onPick}){
 const paint=useRef(null);
 const n=kit.tracks.length;
 const rows=[{label:'AC',title:'Accent',index:n},...kit.tracks.map(([key,short,long],t)=>({label:short,title:long,index:t,key}))];
 const down=(e,t,s)=>{
  if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(t===n){onCell(t,s,(pattern[t][s]+3)%4);return;}
  if(tool==='edit'){onSelect(t);onPick(pattern[t][s]?{t,s}:{t,s:-1});return;}        // the accent row cycles 0 → 3 → 2 → 1 → 0
  const target=tool==='flam'?2:1;
  paint.current=pattern[t][s]===target?0:target;onCell(t,s,paint.current);
 };
 const over=(e,t,s)=>{if(t!==n&&paint.current!==null&&e.buttons)onCell(t,s,paint.current);};
 return <section className="group wide seq-grid" onPointerUp={()=>{paint.current=null;}} onPointerLeave={()=>{paint.current=null;}}>
  <div className="seq-names">
   {rows.map(r=><button type="button" key={r.label} style={{'--voice':r.index===n?ACCENT_COLOUR:voiceColour(r.key,kit.id)}} className={'seq-name'+(r.index===selected?' on':'')+(r.index===n?' accent':'')} title={r.title} onPointerDown={()=>r.index===n?null:(onSelect(r.index),onPick?.({t:r.index,s:-1}),onPad(r.index))}>{r.label}</button>)}
  </div>
  <div className="seq-cells" ref={headRef} style={{'--rows':rows.length}}>
   {rows.map(r=>pattern[r.index].map((v,s)=><button type="button" key={r.label+s} data-cell={r.index+'-'+s} style={{'--voice':r.index===n?ACCENT_COLOUR:voiceColour(r.key,kit.id)}} aria-label={`${r.title} step ${s+1}`} aria-pressed={!!v}
    className={'cell'+(v?' on':'')+(v===2&&r.index!==n?' flam':'')+(r.index===n&&v?' lvl'+v:'')+(locks[r.index+':'+s]?' locked':'')+(picked&&picked.t===r.index&&picked.s===s?' picked':'')+(s%4===0?' beat':'')+(s>>2&1?' alt':'')+(r.index===n?' accent':'')+(s>=(trackLengths[r.index]??length)?' out':'')}
    onPointerDown={e=>down(e,r.index,s)} onPointerEnter={e=>over(e,r.index,s)}/>))}
   <div className="playhead"/>
  </div>
 </section>;
}

export function DrumPage({kit}){
 const synth=SYNTHS[kit.id];
 const n=kit.tracks.length;
 const [shared]=useState(()=>readDrumLink(kit));
 // Mute and solo leave a voice out of what the engine (or the core) plays; the stored pattern is untouched.
 const [muted,setMuted]=useState(()=>new Set()),[solo,setSolo]=useState(()=>new Set());
 const silent=t=>solo.size?!solo.has(t):muted.has(t);
 const silentRef=useRef(silent);silentRef.current=silent;
 const seq=useSequencer({
  id:kit.id,empty:emptyPattern(kit),
  valid:validPattern(kit),initialBank:shared.bank,onEdit:clearDrumLink,
  patternCommands:(i,p)=>patternCommands(kit,i,p,t=>silentRef.current(t)),copyPattern:p=>p.map(r=>[...r]),tempoId:synth.params.BY_KEY.tempo.id,
 });
 const {bank}=seq;
 const [selected,setSelected]=useState(0);
 const [tool,setTool]=useState('hit');
 const [picked,setPicked]=useState({t:0,s:-1});
 const fillRef=useRef(false),[filling,setFilling]=useState(false);
 const fill=on=>{fillRef.current=on;setFilling(on);};
 const setCell=(t,s,v)=>{
  const b=seq.bankRef.current,pattern=b.patterns[b.current];
  if(pattern[t][s]===v)return;
  seq.replacePattern(b.current,pattern.map((row,j)=>j===t?row.map((x,k)=>k===s?v:x):row));
  if(t===n||!silent(t))seq.send([[1,b.current<<10|(t===n?16:t)<<5|s,v]]);
 };
 const flip=(set,setter,t)=>{const next=new Set(set);if(!next.delete(t))next.add(t);setter(next);};
 // a changed mute or solo is sent to the engine as the patterns it should play
 useEffect(()=>{const b=seq.bankRef.current;seq.send(b.patterns.flatMap((p,i)=>patternCommands(kit,i,p,t=>silentRef.current(t))));},[muted,solo]);// eslint-disable-line react-hooks/exhaustive-deps
 // a light on each voice when it plays: read from the playhead, so it follows either clock
 const machine=useRef(null);
 useEffect(()=>{
  let raf,last=-1;
  const frame=()=>{
   raf=requestAnimationFrame(frame);
   const head=seq.head.current,root=machine.current;if(!head||!root)return;
   const step=Number(head.style.getPropertyValue('--step'));
   if(step===last)return;
   last=step;if(!(step>=0))return;
   const b=seq.bankRef.current,pattern=b.patterns[b.current],count=Number(head.dataset.count??step),own=b.trackLengths?.[b.current]??{};
   for(let t=0;t<n;t++)if(pattern[t][own[t]?count%own[t]:step]&&!silentRef.current(t)){const idx=own[t]?count%own[t]:step,pop=(el,ms)=>{if(el){el.classList.remove('hit','pop');void el.offsetWidth;el.classList.add(el.dataset.track?'hit':'pop');setTimeout(()=>el.classList.remove('hit','pop'),ms);}};pop(root.querySelector(`[data-track="${t}"]`),140);pop(head.querySelector(`[data-cell="${t}-${idx}"]`),220);}
  };
  raf=requestAnimationFrame(frame);
  return ()=>cancelAnimationFrame(raf);
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 const pad=t=>seq.live.current?.noteOn(900+t,36+t,.9);
 const libraries=[{id:'beats',label:'Beats',render:props=><DrumLibrary key="beats" {...props} kit={kit} seq={seq}/>},
  {id:'arrangements',label:'Arrangements',render:props=><DrumLibrary key="arrangements" {...props} kit={kit} seq={seq} arrangements/>}];
 // Experimental: the sequencer core (src/seq) books the notes instead of the engine's own sequencer.
 const [core,setCore]=useState(()=>load('synths:core-clock',true)!==false);
 const valuesRef=useRef({});
 const clock=useCoreClock({seq,kit,values:()=>valuesRef.current,enabled:core,silent:t=>silentRef.current(t),fill:()=>fillRef.current});
 const chooseClock=on=>{if(seq.playing)seq.togglePlay();save('synths:core-clock',on);setCore(on);};
 const view=core?{...seq,togglePlay:clock.toggle}:seq;
 return <SynthShell synth={synth} compactRack className={'drums '+kit.id} panelClassName="complete seq" libraries={libraries} initialPatch={shared.patch} headerExtras={props=><ShareDrums {...props} kit={kit} bank={bank}/>} onEngine={seq.onEngine} onStats={seq.onStats} onMidiRealtime={core?undefined:seq.onMidiRealtime}>
  {({values,change})=>{
   valuesRef.current=values;
   // Two devices side by side, as on a desk: the sequencer sends notes, the drum machine plays them.
   return <div className="split" key="split">
    <section className="device device-seq" aria-label="Sequencer">
     <header className="device-head"><h2>Sequencer</h2><span>{core?'sequencer core · timed notes':'built-in clock'}</span><span className="device-out">notes → {kit.name}</span></header>
     <div className="device-top"><Transport seq={view}>
      <span className="tool" role="radiogroup" aria-label="Step tool">
       <button type="button" role="radio" aria-checked={tool==='hit'} className={tool==='hit'?'on':''} onClick={()=>setTool('hit')}>Hit</button>
       <button type="button" role="radio" aria-checked={tool==='flam'} className={tool==='flam'?'on':''} onClick={()=>setTool('flam')} title="Paint flams: a quiet grace note before the beat">Flam</button>
       <button type="button" role="radio" aria-checked={tool==='edit'} className={tool==='edit'?'on':''} onClick={()=>setTool('edit')} title="Edit a lit step: velocity, chance, ratchet, nudge; and a voice's own loop length">Edit</button>
      </span>
      <button type="button" className={'fill-btn'+(filling?' on':'')} aria-pressed={filling} disabled={!core} title="Hold to play the steps conditioned 'only in a fill' and drop those 'not in a fill'" onPointerDown={()=>fill(true)} onPointerUp={()=>fill(false)} onPointerLeave={()=>fill(false)} onPointerCancel={()=>fill(false)} onKeyDown={e=>{if(e.key===' '||e.key==='Enter')fill(true);}} onKeyUp={()=>fill(false)}>Fill</button>
      <label className="inline toggle" title="Experimental: the sequencer core books timed notes on the audio clock instead of the engine's own sequencer. Accent is approximated."><input type="checkbox" checked={core} onChange={e=>chooseClock(e.target.checked)}/> Core clock <em>for step edits, fills, loops</em></label>
      {bank.title&&<p className="drum-stage"><strong>{bank.title}</strong> · {seq.playing&&bank.chain.length?'Playing':'Editing'} {'ABCDEFGH'[bank.current]}{bank.names?.[bank.current]?`: ${bank.names[bank.current]}`:''}{seq.playing&&!bank.chain.length&&<> · Playing {'ABCDEFGH'[seq.playingPattern]}</>}</p>}
      {shared.error&&<span className="drum-link-error" role="alert">{shared.error}</span>}
     </Transport><SongStrip seq={seq} core={core}/></div>
     <div className="seq-body"><StepGrid kit={kit} pattern={bank.patterns[bank.current]} length={bank.lengths[bank.current]} tool={tool} selected={selected} onSelect={setSelected} onPad={pad} onCell={setCell} headRef={seq.head} locks={bank.locks?.[bank.current]} trackLengths={bank.trackLengths?.[bank.current]} picked={tool==='edit'?picked:null} onPick={setPicked}/>
     {tool==='edit'&&<StepEditor kit={kit} picked={{t:Math.min(selected,n-1),s:picked.t===selected?picked.s:-1}} lock={bank.locks?.[bank.current]?.[selected+':'+picked.s]} trackLength={bank.trackLengths?.[bank.current]?.[selected]} patternLength={bank.lengths[bank.current]} coreOn={core} onLock={seq.setLock} onTrackLength={seq.setTrackLength}/>}</div>
    </section>
    <section className="device device-machine" ref={machine} aria-label={kit.name+' drum machine'}>
     <header className="device-head"><h2>{kit.name} drum machine</h2><span>{kit.subtitle}</span></header>
     <DrumMachineTop kit={kit} synth={synth} values={values} change={change}/>
     <div className="dm-lower">
      <DrumMachineVoices kit={kit} synth={synth} values={values} change={change} selected={selected} onSelect={setSelected} onPad={pad} muted={muted} solo={solo} silent={silent} onMute={t=>flip(muted,setMuted,t)} onSolo={t=>flip(solo,setSolo,t)}/>
      <DrumVoicePanel kit={kit} synth={synth} values={values} change={change} selected={selected}/>
     </div>
    </section>
   </div>;
  }}
 </SynthShell>;
}
export const Tr808Page=()=><DrumPage kit={KITS.tr808}/>;
export const Tr909Page=()=><DrumPage kit={KITS.tr909}/>;
export const Tr606Page=()=><DrumPage kit={KITS.tr606}/>;
export const Tr707Page=()=><DrumPage kit={KITS.tr707}/>;
