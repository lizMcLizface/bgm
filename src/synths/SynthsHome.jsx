import React from 'react';

const BASE=import.meta.env.BASE_URL;
const SYNTHS=[
 {id:'cs80',name:'CS-80',maker:'after Yamaha, 1977',ready:true,colour:'#c8452b',line:'Two channels per voice, IL/AL filter envelope, polyphonic touch, ribbon and ring modulator.'},
 {id:'juno',name:'Juno-106',maker:'after Roland, 1984',ready:true,colour:'#7fd0c8',line:'One DCO with sub and noise, a self-oscillating 4-pole filter, one envelope and the BBD chorus.'},
 {id:'prophet5',name:'Prophet-5',maker:'after Sequential, 1978',ready:true,colour:'#e0a526',line:"Two VCOs with hard sync and Poly-Mod into a 4-pole low-pass, unison, and Sequential's factory programs on import."},
 {id:'jupiter8',name:'Jupiter-8',maker:'after Roland, 1981',colour:'#5b8fd9',ready:true,line:'Cross-mod and sync into a 2- or 4-pole filter, four assign modes, an arpeggiator, and factory patches from a tape recording.'},
 {id:'obxa',name:'OB-Xa',maker:'after Oberheim, 1981',colour:'#c8c8c8',ready:true,line:'Two VCOs with sync into a 12/24 dB filter, split and double, brassy envelopes, and the factory patch book on import.'},
 {id:'minimoog',name:'Minimoog Model D',maker:'after Moog, 1970',colour:'#b07a4a',ready:true,line:'Three oscillators, an overdriven ladder filter that sings, and one voice: the classic mono lead and bass.'},
 {id:'dx7',name:'DX7',maker:'after Yamaha, 1983',colour:'#6fb6a0',ready:true,line:"Six-operator FM with the DX7's own envelopes and scaling, 32 algorithms, and cartridge SysEx import."},
 {id:'vs',name:'Prophet VS',maker:'after Sequential, 1986',colour:'#9b7fd1',ready:true,line:'Four single-cycle waves mixed by a joystick and a looping vector envelope, into a resonant filter, with the factory programs and waves on import.'},

 {id:'tr808',name:'TR-808',maker:'after Roland, 1980',colour:'#d96a3a',ready:true,line:'Sixteen analog voices: the long sine kick, snare, toms, congas, clap, cowbell and the six-oscillator hats, on a 16-step sequencer with swing, accent and a pattern chain.'},
 {id:'tr909',name:'TR-909',maker:'after Roland, 1983',colour:'#8a8f96',ready:true,line:'Punchier kick and snare, the 909 toms and clap, with synthesised stand-ins for its sampled hats, crash and ride.'},
 {id:'tr606',name:'TR-606',maker:'after Roland, 1981',colour:'#6fb6a0',ready:true,line:'The small Drumatix: seven quick, dry voices on the same sequencer.'},
 {id:'tb303',name:'TB-303',maker:'after Roland, 1981',colour:'#e0a526',ready:true,line:'One oscillator into a squelching resonant filter, with accent, slide and tie on a 16-step pattern.'},
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
