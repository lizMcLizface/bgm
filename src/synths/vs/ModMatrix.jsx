import React from 'react';
import {DESTINATIONS} from './sysex';
import {BY_KEY} from './params';

// The modulation matrix: one row per source, an amount (where the source has one) and a button per
// destination (Figure 10-1 of the manual; the bit order of the program's destination fields).
const SOURCES=[
 {title:'LFO 1',dest:'lfo1Dest',amount:'lfo1Amount'},
 {title:'LFO 2',dest:'lfo2Dest',amount:'lfo2Amount'},
 {title:'Pressure',dest:'pressureDest',amount:'pressureAmount'},
 {title:'Velocity',dest:'velocityDest',amount:'velocityAmount'},
 {title:'Keyboard',dest:'keyboardDest',amount:'keyboardAmount'},
 {title:'Filter env',dest:'filterEnvDest',amount:'filterEnvModAmount'},
 {title:'Mod wheel',dest:'modWheelDest',amount:null},
];

export default function ModMatrix({values,replaceValues}){
 const toggle=(key,bit)=>replaceValues({...values,[key]:values[key]^(1<<bit)});
 return <section className="group wide matrix"><h3>Modulation matrix</h3>
  <div className="matrix-rows">
   {SOURCES.map(s=><div className="matrix-row" key={s.dest}>
    <b>{s.title}</b>
    <span className="matrix-amount">{s.amount?<>
     <input type="range" aria-label={s.title+' amount'} min={BY_KEY[s.amount].min} max={BY_KEY[s.amount].max} step="1" value={values[s.amount]} onChange={e=>replaceValues({...values,[s.amount]:Number(e.target.value)})}/>
     <output>{values[s.amount]}</output>
    </>:<span className="matrix-no-amount">Routing only</span>}</span>
    <span className="matrix-dests" role="group" aria-label={`${s.title} destinations`}>
     {DESTINATIONS[s.dest].map((name,bit)=><button type="button" key={bit} className={values[s.dest]>>bit&1?'on':''} aria-pressed={!!(values[s.dest]>>bit&1)} onClick={()=>toggle(s.dest,bit)}>{name}</button>)}
    </span>
   </div>)}
  </div>
 </section>;
}
