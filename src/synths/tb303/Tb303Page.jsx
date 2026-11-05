import React,{useEffect,useRef,useState} from 'react';
import SynthShell from '../ui/SynthShell';
import {SYNTHS} from '../models';
import Transport from '../seq/Transport';
import {useSequencer} from '../seq/useSequencer';
import useCoreClock from '../../seq/useCoreClock';
import {BASS_KEY} from '../../seq/targets/bass';
import {load,save} from '../storage';
import SongStrip from '../drums/SongStrip';
import {BassMachineTop,BassMachineVoice,BassVoicePanel} from './BassMachine';
import '../drums/drums.css';
import {LINES,emptyPattern,validPattern,linePattern,patternCommands,stepWord} from './presets';

const NOTE_NAMES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B','C'];
const BLACK=[1,3,6,8,10];
const FLAGS=[['up','▲',4,'Octave up'],['down','▼',8,'Octave down'],['acc','ACC',1,'Accent'],['slide','SLD',2,'Slide into the next note']];
const ROWS=[12,11,10,9,8,7,6,5,4,3,2,1,0];
const col=(s,length)=>(s%4===0?' beat':'')+(s>>2&1?' alt':'')+(s>=length?' out':'');

// Twelve semitones and the top C as rows, one column per step; below, tie and the per-step switches.
function BassGrid({pattern,length,onStep,headRef}){
 const paint=useRef(null);
 const tap=(e,s,row)=>{
  if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  const st=pattern[s],on=st.kind===1&&st.note===row;
  paint.current=on?'off':'on';
  onStep(s,on?{...st,kind:0}:{...st,kind:1,note:row});
 };
 const drag=(e,s,row)=>{
  if(!paint.current||!e.buttons)return;
  const st=pattern[s];
  onStep(s,paint.current==='off'?{...st,kind:0}:{...st,kind:1,note:row});
 };
 return <section className="group wide seq-grid bass-grid" style={{'--voice':'#e0a526'}} onPointerUp={()=>{paint.current=null;}} onPointerLeave={()=>{paint.current=null;}}>
  <div className="seq-names">
   {ROWS.map((r,i)=><span key={i} className={'seq-name piano'+(BLACK.includes(r)?' black':'')}>{NOTE_NAMES[r]}</span>)}
   <span className="seq-name piano tie">TIE</span>
   {FLAGS.map(f=><span key={f[0]} className="seq-name piano flag" title={f[3]}>{f[1]}</span>)}
  </div>
  <div className="seq-cells" ref={headRef} style={{'--rows':ROWS.length+1+FLAGS.length}}>
   {ROWS.map((r,i)=>pattern.map((st,s)=><button type="button" key={i+'-'+s} aria-label={`Step ${s+1} ${NOTE_NAMES[r]}`} aria-pressed={st.kind===1&&st.note===r}
    className={'cell'+(st.kind===1&&st.note===r?' on':'')+col(s,length)+(BLACK.includes(r)?' black':'')}
    onPointerDown={e=>tap(e,s,r)} onPointerEnter={e=>drag(e,s,r)}/>))}
   {pattern.map((st,s)=><button type="button" key={'tie'+s} aria-label={`Step ${s+1} tie`} aria-pressed={st.kind===2} className={'cell tie'+(st.kind===2?' on':'')+col(s,length)} onClick={()=>onStep(s,st.kind===2?{...st,kind:0}:{...st,kind:2})}/>)}
   {FLAGS.map(([id,,bit,title])=>pattern.map((st,s)=>{
    const on=!!(st.flags&bit);
    return <button type="button" key={id+s} aria-label={`Step ${s+1} ${title}`} aria-pressed={on} className={'cell flag '+id+(on?' on':'')+col(s,length)}
     onClick={()=>{
      let flags=on?st.flags&~bit:st.flags|bit;
      if(!on&&bit===4)flags&=~8;
      if(!on&&bit===8)flags&=~4; // up and down are exclusive
      onStep(s,{...st,flags});
     }}/>;
   }))}
   <div className="playhead"/>
  </div>
 </section>;
}

export default function Tb303Page(){
 const synth=SYNTHS.tb303;
 const seq=useSequencer({id:'tb303',empty:emptyPattern,valid:validPattern,patternCommands,copyPattern:p=>p.map(s=>({...s})),tempoId:synth.params.BY_KEY.tempo.id});
 const {bank}=seq;
 const setStep=(s,step)=>{
  const b=seq.bankRef.current,pattern=b.patterns[b.current];
  const old=pattern[s];
  if(old.kind===step.kind&&old.note===step.note&&old.flags===step.flags)return;
  seq.replacePattern(b.current,pattern.map((x,i)=>i===s?step:x));
  seq.send([[1,b.current*16+s,stepWord(step)]]);
 };
 // a light on the bass voice when a note starts, read from the playhead so it follows either clock
 const machine=useRef(null);
 useEffect(()=>{
  let raf,last=-1;
  const frame=()=>{
   raf=requestAnimationFrame(frame);
   const head=seq.head.current,root=machine.current;if(!head||!root)return;
   const step=Number(head.style.getPropertyValue('--step'));
   if(step===last)return;
   last=step;if(!(step>=0))return;
   const b=seq.bankRef.current;
   if(b.patterns[b.current][step]?.kind===1){const el=root.querySelector('[data-track="0"]');if(el){el.classList.remove('hit');void el.offsetWidth;el.classList.add('hit');setTimeout(()=>el.classList.remove('hit'),140);}}
  };
  raf=requestAnimationFrame(frame);
  return ()=>cancelAnimationFrame(raf);
 },[]);// eslint-disable-line react-hooks/exhaustive-deps
 const pad=()=>{const live=seq.live.current;if(!live)return;live.noteOn(BASS_KEY+1,48,.9);setTimeout(()=>live.noteOff(BASS_KEY+1),260);};
 // The sequencer core (src/seq) books the notes on the audio clock, with slides and ties as overlapping notes; the engine's own sequencer is the fallback.
 const [core,setCore]=useState(()=>load('synths:core-clock',true)!==false);
 const valuesRef=useRef({});
 const clock=useCoreClock({seq,bass:true,values:()=>valuesRef.current,enabled:core});
 const chooseClock=on=>{if(seq.playing)seq.togglePlay();save('synths:core-clock',on);setCore(on);};
 const view=core?{...seq,togglePlay:clock.toggle}:seq;
 const libraries=[{id:'lines',label:'Lines',render:()=><>{LINES.map(l=><button type="button" key={l.name} title="Replaces the pattern you are editing" onClick={()=>seq.load(linePattern(l))}>{l.name}</button>)}</>}];
 return <SynthShell synth={synth} compactRack keyboard={false} className="drums tb303" panelClassName="complete seq" libraries={libraries} onEngine={seq.onEngine} onStats={seq.onStats} onMidiRealtime={core?undefined:seq.onMidiRealtime}>
  {({values,change})=>{
   valuesRef.current=values;
   // Two devices side by side, as on a desk: the sequencer sends notes, the bass machine plays them.
   return <div className="split" key="split" style={{'--rows':ROWS.length+1+FLAGS.length}}>
    <section className="device device-seq" aria-label="Sequencer">
     <header className="device-head"><h2>Sequencer</h2><span>{core?'sequencer core · timed notes':'built-in clock'}</span><span className="device-out">notes → {synth.name}</span></header>
     <div className="device-top"><Transport seq={view} chain={false}>
      <label className="inline toggle" title="The sequencer core books timed notes on the audio clock instead of the engine's own sequencer; slides and ties are notes that overlap."><input type="checkbox" checked={core} onChange={e=>chooseClock(e.target.checked)}/> Core clock <em>for songs and steady timing</em></label>
     </Transport><SongStrip seq={seq} core={core}/></div>
     <div className="seq-body"><BassGrid pattern={bank.patterns[bank.current]} length={bank.lengths[bank.current]} onStep={setStep} headRef={seq.head}/></div>
    </section>
    <section className="device device-machine" ref={machine} aria-label={synth.name+' bass machine'}>
     <header className="device-head"><h2>{synth.name} bass machine</h2><span>{synth.subtitle}</span></header>
     <BassMachineTop synth={synth} values={values} change={change}/>
     <div className="dm-lower">
      <BassMachineVoice synth={synth} values={values} change={change} onPad={pad}/>
      <BassVoicePanel synth={synth} values={values} change={change}/>
     </div>
    </section>
   </div>;
  }}
 </SynthShell>;
}
