import React from 'react';
import {LETTERS,STEPS} from './bank';

// Play/stop, pattern letters, the chain, pattern length and tempo, and MIDI clock follow. Tempo and
// swing for the whole machine are ordinary faders in the panel. `children` adds page tools.
export default function Transport({seq,children}){
 const {bank,playing,sync}=seq,cur=bank.current;
 return <section className="group wide transport"><h3>Sequencer</h3>
  <div className="transport-row">
   <button type="button" className={'play'+(playing?' on':'')} aria-pressed={playing} onClick={seq.togglePlay}>{playing?'■ Stop':'▶ Play'}</button>
   <span className="patterns" role="radiogroup" aria-label="Pattern">
    {[...LETTERS].map((l,i)=><button type="button" key={l} role="radio" aria-checked={cur===i} className={cur===i?'on':''} onClick={()=>seq.select(i)}>{l}</button>)}
   </span>
   <button type="button" onClick={seq.copy} title="Copy this pattern into the next letter">Copy →</button>
   <button type="button" onClick={seq.clear}>Clear</button>
   {children}
  </div>
  <div className="transport-row">
   <label className="inline">Steps<select value={bank.lengths[cur]} onChange={e=>seq.setLength(Number(e.target.value))}>{Array.from({length:STEPS},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>
   <label className="inline" title="Give this pattern its own tempo; 0 follows the Tempo fader">Tempo<input type="number" min="0" max="300" step="1" value={bank.tempos[cur]||''} placeholder="global" onChange={e=>{const n=Number(e.target.value);seq.setTempo(n>=30&&n<=300?n:0);}}/></label>
   <label className="inline toggle" title="Follow an external MIDI clock, start and stop (from a drum machine, DAW or keyboard)"><input type="checkbox" checked={sync.on} onChange={e=>seq.setSync(e.target.checked)}/> MIDI clock{sync.on&&<em>{sync.bpm?` ${sync.bpm} bpm`:' waiting…'}</em>}</label>
   <span className="chain" aria-label="Chain">
    <b>Chain</b>
    {bank.chain.length===0&&<em>off · tap ＋ to build a song</em>}
    {bank.chain.map((p,i)=><button type="button" key={i} className="link" title="Remove from chain" onClick={()=>seq.chain(bank.chain.filter((_,j)=>j!==i))}>{LETTERS[p]}</button>)}
    {bank.chain.length<16&&<button type="button" onClick={()=>seq.chain([...bank.chain,cur])} aria-label="Add the current pattern to the chain">＋</button>}
    {bank.chain.length>0&&<button type="button" onClick={()=>seq.chain([])} aria-label="Clear the chain">×</button>}
   </span>
  </div>
 </section>;
}
