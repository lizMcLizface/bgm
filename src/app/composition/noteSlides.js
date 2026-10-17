/** Optional, deterministic pitch trajectories; destination notes stay written as-is. */
export function slideNotes(events,{previous=[],units=4,secondsPerBeat=1,bar=0,noteSlides=false,padMotion=false,bassMotion=false,chordSlides=false}={}) {
 const source=role=>[...previous.filter(e=>e.role===role).map(e=>({...e,beat:e.beat-units,old:true})),...events.filter(e=>e.role===role)].sort((a,b)=>a.beat-b.beat||a.midi-b.midi);
 const set=(note,from,seconds)=>{note.expression={...note.expression,slideFromMidi:from,slideSeconds:seconds,connected:true,gateScale:1};};
 // A voice-wide musical clock, sampled per note, carries both phase and slope
 // through new attacks, rests and bar boundaries. Chord tones share the motion.
 for(const [role,enabled,phase] of [['lead',noteSlides,.4],['counter',noteSlides,2.1],['pad',padMotion,4],['bass',bassMotion,5.3]]) {
  if(!enabled)continue;
  for(const note of events.filter(e=>e.role===role))note.expression={...note.expression,
   pitchMotion:{phase:(bar*units+note.beat)*Math.PI/8+phase,rate:Math.PI/(8*secondsPerBeat),depth:35}};
 }
 if(chordSlides) {
  const groups=[];for(const n of source('pad')){let g=groups.at(-1);if(!g||Math.abs(g[0].beat-n.beat)>1e-5)groups.push(g=[]);g.push(n);}
  for(let i=1;i<groups.length;i++) {
   const now=groups[i],before=groups[i-1];if(now[0].old||now.length<2||before.length<2)continue;
   const gap=(now[0].beat-Math.max(...before.map(n=>n.beat+n.length)))*secondsPerBeat;if(gap<-.025||gap>.25)continue;
   const fixed=new Set(now.filter(n=>before.some(p=>p.midi===n.midi)).map(n=>n.midi));
   const pairs=now.filter(n=>!fixed.has(n.midi)&&n.length*secondsPerBeat>=.45).flatMap(note=>before.filter(p=>!fixed.has(p.midi)).map(p=>({note,from:p.midi,step:Math.abs(note.midi-p.midi)}))).filter(p=>p.step>0&&p.step<=12);
   pairs.sort((a,b)=>a.step-b.step||b.note.midi-a.note.midi||a.from-b.from);const chosen=pairs[0];
   if(chosen)set(chosen.note,chosen.from,Math.min(.9,chosen.note.length*secondsPerBeat*.45));
  }
 }
 return events;
}
