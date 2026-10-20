import React from 'react';

const BASE=import.meta.env.BASE_URL;
const SYNTHS=[
 {id:'cs80',name:'CS-80',maker:'after Yamaha, 1977',ready:true,colour:'#c8452b',line:'Two channels per voice, IL/AL filter envelope, polyphonic touch, ribbon and ring modulator.'},
 {id:'juno',name:'Juno-106',maker:'after Roland, 1984',ready:true,colour:'#7fd0c8',line:'One DCO with sub and noise, a self-oscillating 4-pole filter, one envelope and the BBD chorus.'},
 {id:'prophet5',name:'Prophet-5',maker:'after Sequential, 1978',colour:'#e0a526',line:'Two VCOs with hard sync and Poly-Mod into a 4-pole low-pass. Planned.'},
 {id:'jupiter8',name:'Jupiter-8',maker:'after Roland, 1981',colour:'#5b8fd9',line:'Cross-mod and sync, 2- or 4-pole filter, split/dual layers and an arpeggiator. Planned.'},
 {id:'obxa',name:'OB-Xa',maker:'after Oberheim, 1981',colour:'#c8c8c8',line:'Two VCOs with sync into a 12/24 dB filter, split and double, brassy envelopes. Planned.'},
 {id:'minimoog',name:'Minimoog Model D',maker:'after Moog, 1970',colour:'#b07a4a',line:'Three VCOs, an overdriven ladder filter and one voice: the classic mono lead and bass. Planned.'},
 {id:'dx7',name:'DX7',maker:'after Yamaha, 1983',colour:'#6fb6a0',line:'Six-operator FM, 32 algorithms, cartridge SysEx import. Planned.'},
 {id:'vs',name:'Prophet VS',maker:'after Sequential, 1986',colour:'#9b7fd1',line:'Four single-cycle waves mixed by a joystick and a looping vector envelope, into a Curtis filter. Planned.'},
];

export default function SynthsHome(){
 return <div className="synth home">
  <header className="home-head">
   <h1>Synths</h1>
   <p>Playable tributes to classic polysynths, built from scratch in Rust/WebAssembly for a tablet next to a piano. Inspired by the originals' architecture and feel; not circuit models or sample libraries.</p>
  </header>
  <ul className="home-grid">
   {SYNTHS.map(s=><li key={s.id} style={{'--chip':s.colour}} className={s.ready?'ready':'planned'}>
    {s.ready?<a href={`${BASE}synths/${s.id}/`}><b>{s.name}</b><small>{s.maker}</small><span>{s.line}</span><em>Play ▸</em></a>
     :<div><b>{s.name}</b><small>{s.maker}</small><span>{s.line}</span><em>Coming later</em></div>}
   </li>)}
  </ul>
  <p className="home-foot"><a href={BASE+'labs/'}>Instrument labs</a> · <a href={BASE}>calmbgm</a></p>
 </div>;
}
