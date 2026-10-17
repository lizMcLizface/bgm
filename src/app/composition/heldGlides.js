/** Performance-only connections. Written events and arranger RNG remain untouched. */
export function sustainingVoice(voice) {
 const p=voice?.preset??voice??{};
 return !['piano','plucked'].includes(p.stringModel) && Number.isFinite(p.gainSustain) && p.gainSustain>=.2;
}
export function joinHeldNotes(notes,{pad=false,bass=false,voices={},legacy=false}={}) {
 if(legacy||(!pad&&!bass))return notes;
 const edges=new Map();
 for(const role of ['pad','bass']) {
  if(!(role==='pad'?pad:bass)||!sustainingVoice(voices[role]))continue;
  const line=notes.filter(n=>n.role===role).sort((a,b)=>a.time-b.time||a.midi-b.midi),groups=[];
  for(const n of line){let group=groups.at(-1);if(!group||n.time-group[0].time>.08)groups.push(group=[]);group.push(n);}
  for(let i=1;i<groups.length;i++) {
   const before=groups[i-1],now=groups[i],pairs=[];
   for(const a of before)for(const b of now) {
    const spacing=b.time-a.time,gap=b.time-a.time-a.duration,step=Math.abs(b.midi-a.midi);
    if(a.duration<1.2||b.duration<1.2||spacing<.75||a.duration<spacing*.75||gap<-.2||gap>Math.max(.24,Math.min(.8,spacing*.08))||step>7||a.expression?.pitchTargets||b.expression?.pitchTargets)continue;
    if(a.section!==undefined&&b.section!==undefined&&a.section!==b.section)continue;
    if(a.ending||b.ending)continue;
    pairs.push({a,b,step});
   }
   // Common tones first, then nearby tones; one outgoing/incoming voice each.
   pairs.sort((a,b)=>a.step-b.step||a.a.midi-b.a.midi||a.b.midi-b.b.midi);
   const outgoing=new Set(),incoming=new Set();
   for(const {a,b}of pairs)if(!outgoing.has(a)&&!incoming.has(b)){edges.set(a,b);outgoing.add(a);incoming.add(b);}
  }
 }
 const used=new Set(),result=[];
 for(const first of [...notes].sort((a,b)=>a.time-b.time||a.midi-b.midi)) {
  if(used.has(first))continue;
  const members=[first],targets=[{time:0,midi:first.midi}];let current=first;
  while(edges.has(current)) {
   const next=edges.get(current),duration=next.time+next.duration-first.time;
   if(used.has(next)||duration>24||((next.bar??0)-(first.bar??0))>=4)break;
   const half=Math.min(.8,(next.time-current.time)*.25,next.duration*.25);
   targets.push({time:next.time-first.time-half,midi:current.midi},{time:next.time-first.time+half,midi:next.midi});
   used.add(next);members.push(next);current=next;
  }
  if(members.length===1){result.push(first);continue;}
  const duration=current.time+current.duration-first.time;
  targets.push({time:duration,midi:current.midi});
  result.push({...first,duration,heldMembers:members,expression:{...first.expression,slideFromMidi:null,pitchTargets:targets,gateScale:1,gateAware:false}});
 }
 return result;
}
