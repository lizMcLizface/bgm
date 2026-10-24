import React from 'react';
import SynthGraphic from './SynthGraphic';

const BASE=import.meta.env.BASE_URL;
const SYNTHS=[
 {id:'poly',name:'DIY Poly',maker:'calmbgm · subtractive',colour:'#63c5b6',ready:true,line:'Four polyphonic architectures, dual oscillators, optional two-layer voices, modulation routes, air and body colour, inserts and room effects.'},
 {id:'fm',name:'DIY FM',maker:'calmbgm · FM',colour:'#9b86e5',ready:true,line:'Four or six operators with editable routing, operator envelopes, feedback, expressive modulation and the original FM recipes.'},
 {id:'piano',name:'Grand & Upright',maker:'calmbgm · modelled strings',colour:'#d9b98a',ready:true,line:'A concert grand, a felted piano for cosy sounds and an old upright, modelled from stiff strings, felt hammers and a soundboard, with a choice of temperament, key and stretch.'},
 {id:'strings',name:'Strings',maker:'calmbgm · measured strings',colour:'#c9a15f',ready:false,line:'Violin, cello, string sections and a plucked cello, tuned against recordings: the bow swell, vibrato, ensemble and release you hear in a sampled orchestra.'},
 {id:'cs80',name:'V 80',maker:'two-tier analog poly · 1977',ready:true,colour:'#c8452b',line:'Two channels per voice, IL/AL filter envelope, polyphonic touch, ribbon and ring modulator.'},
 {id:'juno',name:'Analog 106',maker:'DCO poly · 1984',ready:true,colour:'#7fd0c8',line:'One DCO with sub and noise, a self-oscillating 4-pole filter, one envelope and the BBD chorus.'},
 {id:'prophet5',name:'Oracle 5',maker:'analog poly · 1978',ready:true,colour:'#e0a526',line:"Two VCOs with hard sync and Poly-Mod into a 4-pole low-pass, unison, and factory programs on import."},
 {id:'jupiter8',name:'Pluto 8',maker:'analog poly · 1981',colour:'#5b8fd9',ready:true,line:'Cross-mod and sync into a 2- or 4-pole filter, four assign modes, an arpeggiator, and factory patches from a tape recording.'},
 {id:'obxa',name:'Oberon Xa',maker:'analog poly · 1981',colour:'#c8c8c8',ready:true,line:'Two VCOs with sync into a 12/24 dB filter, split and double, brassy envelopes, and the factory patch book on import.'},
 {id:'minimoog',name:'Mercury D',maker:'analog mono · 1970',colour:'#b07a4a',ready:true,line:'Three oscillators, an overdriven ladder filter that sings, and one voice: the classic mono lead and bass.'},
 {id:'dx7',name:'FM7',maker:'six-operator FM · 1983',colour:'#6fb6a0',ready:true,line:"Six-operator FM with the original's own envelopes and scaling, 32 algorithms, and cartridge SysEx import."},
 {id:'vs',name:'VectorVS',maker:'vector synth · 1986',colour:'#9b7fd1',ready:true,line:'Four single-cycle waves mixed by a joystick and a looping vector envelope, into a resonant filter, with the factory programs and waves on import.'},

 {id:'tr808',name:'808',maker:'analog drum machine · 1980',colour:'#d96a3a',ready:true,line:'Sixteen analog voices: the long sine kick, snare, toms, congas, clap, cowbell and the six-oscillator hats, on a 16-step sequencer with swing, accent and a pattern chain.'},
 {id:'tr909',name:'909',maker:'hybrid drum machine · 1983',colour:'#8a8f96',ready:true,line:'Punchier kick and snare, the 909 toms and clap, with synthesised stand-ins for its sampled hats, crash and ride.'},
 {id:'tr606',name:'606',maker:'analog drum machine · 1981',colour:'#6fb6a0',ready:true,line:'The small one: seven quick, dry voices on the same sequencer.'},
 {id:'tb303',name:'Silverbox',maker:'bass line · 1981',colour:'#e0a526',ready:true,line:'One oscillator into a squelching resonant filter, with accent, slide and tie on a 16-step pattern.'},
];
const CATEGORIES=[
 {id:'vintage',name:'Vintage',description:'Experimental models for comparison with the original hardware. Sound and calibration are still being checked.',ids:['cs80','juno','prophet5','jupiter8','obxa','minimoog','dx7','vs','tb303']},
 {id:'diy',name:'DIY',description:'Our own synth engines, with their original recipes and a playable panel for exploring new sounds.',ids:['poly','fm','piano','strings']},
 {id:'drums',name:'Drums',description:'Drum machines with hands-on voice controls and step sequencing.',ids:['tr808','tr909','tr606']},
];

export default function SynthsHome(){
 return <div className="synth home">
  <header className="home-head">
   <h1>Synths</h1>
   <p>Play with a MIDI keyboard, computer keys or touch. Explore vintage models, our own synth engines and drum machines. Choose a preset bank to share a program link or download its YAML settings.</p>
  </header>
  <a className="home-rack" href={BASE+'synths/ensemble/'}><b>Ensemble ↗</b><span>Hear the synths in context. Choose a progression, swap the players, and shape every part.</span></a>
  <a className="home-rack" href={BASE+'synths/effects/'}><b>Effects rack ↗</b><span>A little outboard for any synth · saturation, EQ, compressor, modulation, echo and room.</span></a>
  <nav className="home-categories" aria-label="Synth categories">{CATEGORIES.map(c=><a key={c.id} href={'#'+c.id}>{c.name}<small>{c.ids.length}</small></a>)}</nav>
  {CATEGORIES.map(category=><section key={category.id} className="home-category" id={category.id} aria-labelledby={category.id+'-title'}>
   <h2 id={category.id+'-title'}>{category.name}</h2><p>{category.description}</p>
   <ul className="home-grid">
   {category.ids.map(id=>SYNTHS.find(s=>s.id===id)).map(s=><li key={s.id} style={{'--chip':s.colour}} className={s.ready?'ready':'planned'}>
    {s.ready?<a href={`${BASE}synths/${s.id}/`}><div className="home-card-top"><SynthGraphic id={s.id}/><div><b>{s.name}</b><small>{s.maker}</small></div></div><span>{s.line}</span><em>Play ▸</em></a>
     :<div><div className="home-card-top"><SynthGraphic id={s.id}/><div><b>{s.name}</b><small>{s.maker}</small></div></div><span>{s.line}</span><em>Coming later</em></div>}
   </li>)}
   </ul>
  </section>)}
  <p className="home-foot"><a href={BASE+'labs/'}>Instrument labs</a> · <a href={BASE}>calmbgm</a></p>
 </div>;
}
