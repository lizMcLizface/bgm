// Reading a generated chord part (the notes of one voice over one bar of a captured song) back into the chord menu's settings,
// or deciding it is a note line instead. The result always replays exactly the notes it was read from: it is checked by rendering
// it with chordStrikes and comparing; a part the settings cannot reproduce is kept as an exact voicing and/or explicit strikes
// (those fields show grey in the menu), and a part that is a figure rather than a chord is a line.
import {degreeToMidi,midiToDegree} from '../../seq/harmony';
import {heldSteps} from '../../seq/notes';
import {FLAVOURS,chordStack,chordStrikes,omitOptions,placedChordTones} from './placedChords';

const mod=(n,m)=>((n%m)+m)%m;
const gcd=(a,b)=>b?gcd(b,a%b):Math.abs(a);
const median=list=>[...list].sort((a,b)=>a-b)[Math.floor(list.length/2)];
const MAX_ADDS=2;
const COMPLEXITY_ORDER=['triad','seven','power'];

const candidateCache=new Map();
/** Every chord-menu setting (length, flavour, omissions, inversion) on this root, with its notes, grouped by pitch classes, cheapest first. */
function candidates(key,root,quality=null) {
 const id=`${key.scaleId}|${key.tonic}|${root.d}|${root.a}|${quality}`;
 if(candidateCache.has(id))return candidateCache.get(id);
 const byClasses=new Map(),seen=new Map();
 for(const complexity of COMPLEXITY_ORDER)for(const colour of FLAVOURS){
  const {stack}=chordStack(key,{root,complexity,colour,quality:quality??undefined});
  for(const omit of omitOptions(stack.length,3))for(let inversion=0;inversion<Math.max(1,stack.length-omit.length);inversion++){
   let notes;
   try{notes=placedChordTones(key,{root,complexity,colour,omit,inversion,add:[],quality:quality??undefined});}catch{continue;}
   const score=(complexity!=='triad'?1:0)+(colour!=='plain'?1:0)+omit.length+(inversion?1:0)+(quality?1:0);
   const signature=`${complexity==='power'?'p':''}${notes.join(',')}`;
   const known=seen.get(signature);
   if(known&&known.score<=score)continue;
   const entry={params:{complexity,colour,omit,inversion,...(quality?{quality}:{})},notes,score,stack};
   seen.set(signature,entry);
  }
 }
 for(const entry of seen.values()){
  const classes=[...new Set(entry.notes.map(n=>mod(n,12)))].sort((a,b)=>a-b).join(',');
  if(!byClasses.has(classes))byClasses.set(classes,[]);
  byClasses.get(classes).push(entry);
 }
 for(const list of byClasses.values())list.sort((a,b)=>a.score-b.score);
 candidateCache.set(id,byClasses);
 return byClasses;
}

/** Settings that sound exactly these pitches (up to the chord's octave), or null. A tone may sit an octave or more away from its place in the stack (added), and a chord outside the key takes a quality. */
export function fitVoicing(key,rootPc,pitches) {
 const notes=[...new Set(pitches)].sort((a,b)=>a-b);
 const base=midiToDegree(key,60+mod(rootPc,12));
 const wanted=new Set(notes.map(n=>mod(n,12)));
 const search=quality=>{
  let best=null;
  for(const [classes,list] of candidates(key,base,quality)){
   const own=classes.split(',').map(Number);
   if(!own.every(pc=>wanted.has(pc))||wanted.size-own.length>MAX_ADDS)continue;
   for(const entry of list){
    if(best&&entry.score>=best.score)break;
    for(const a of notes){
     if(mod(a-entry.notes[0],12)!==0)continue;
     const k=(a-entry.notes[0])/12,shifted=entry.notes.map(n=>n+12*k);
     if(!shifted.every(n=>notes.includes(n)))continue;
     const extras=notes.filter(n=>!shifted.includes(n)),add=[];
     let ok=extras.length<=MAX_ADDS;
     for(const extra of extras){
      const tone=entry.stack.findIndex(s=>mod(s,12)===mod(extra,12));
      if(tone<0){ok=false;break;}
      const sounding=shifted.find(n=>mod(n,12)===mod(extra,12))??entry.stack[tone]+12*k;
      add.push({tone,oct:(extra-sounding)/12});
     }
     if(!ok)continue;
     const score=entry.score+add.length*1.2;
     if(!best||score<best.score)best={score,params:{...entry.params,add},root:{...base,o:base.o+k}};
    }
   }
  }
  return best;
 };
 return search(null)??['major','minor','dim','aug'].map(search).filter(Boolean).sort((x,y)=>x.score-y.score)[0]??null;
}

const rootAtOrBelow=(rootPc,lowest)=>lowest-mod(lowest-rootPc,12);

const strikeSignature=list=>list.map(s=>`${Math.round(s.at*1000)/1000}:${s.note}:${Math.round(s.len)}`).sort().join(' ');

/** Does this chord replay exactly the group's notes (attack step, pitch and length in steps)? */
function replays(key,chord,notes,tolerance=0) {
 try{
  const rendered=chordStrikes(key,chord).map(s=>({at:s.at,note:s.note,len:Math.min(s.len,s.spill?Infinity:chord.len-s.at)}));
  const wanted=notes.map(n=>({at:n.start-chord.start,note:n.midi,len:n.len}));
  if(!tolerance)return strikeSignature(rendered)===strikeSignature(wanted);
  // the generator's lengths wobble by a step when they are rounded to the grid: the same attacks and pitches, lengths within the tolerance
  if(rendered.length!==wanted.length)return false;
  const order=list=>[...list].sort((x,y)=>x.at-y.at||x.note-y.note);
  const r=order(rendered),w=order(wanted);
  return r.every((s,i)=>s.at===w[i].at&&s.note===w[i].note&&Math.abs(Math.round(s.len)-w[i].len)<=tolerance);
 }catch{return false;}
}

const notesMatch=(key,chord,notes)=>{
 try{
  const sig=list=>list.map(s=>`${Math.round(s.at*1000)/1000}:${s.note}`).sort().join(' ');
  return sig(chordStrikes(key,chord))===sig(notes.map(n=>({at:n.start-chord.start,note:n.midi})));
 }catch{return false;}
};

const hitMask=(positions,stepsPerBar)=>{
 for(let rate=Math.min(12,stepsPerBar);rate>=1;rate--){
  if(stepsPerBar%rate||positions.some(p=>p%rate))continue;
  const slots=stepsPerBar/rate,mask=Array.from({length:slots},(_,i)=>positions.includes(i*rate)?'x':'.').join('');
  return {rate,mask:mask.includes('.')?mask:undefined};
 }
 return null;
};

/**
 * Read one group. \`notes\`: [{ start (pattern step), midi, len (steps), vel }]; \`rootPc\`: the chord's root; \`barStart\`: the step its bar began;
 * returns { kind: 'chord'|'line', chord?, reason, style } where chord is the placed-chord settings (no id).
 */
export function parseChordGroup({notes,key,rootPc,barStart,stepsPerBar=16}) {
 const sorted=[...notes].sort((a,b)=>a.start-b.start||a.midi-b.midi);
 const pitches=[...new Set(sorted.map(n=>n.midi))].sort((a,b)=>a-b);
 if(pitches.length<2)return {kind:'line',reason:'a single pitch'};
 const attacks=[...new Set(sorted.map(n=>n.start))].sort((a,b)=>a-b);
 const sizes=attacks.map(at=>sorted.filter(n=>n.start===at).length);
 const vel=sorted[0].vel??.8;
 // the pitches: the arpeggio's octave copy of its bottom note is a doubling, so the whole set is fitted
 const fit=fitVoicing(key,rootPc,pitches);
 const base=midiToDegree(key,60+mod(rootPc,12));
 const lowestRoot=rootAtOrBelow(mod(rootPc,12),pitches[0]);
 const pitchPart=fit
  ?{root:fit.root,...fit.params}
  :{root:{...base,o:base.o+Math.round((lowestRoot-degreeToMidi(key,base))/12)},voicing:pitches.map(p=>p-lowestRoot)};
 const make=timing=>({...pitchPart,...timing,vel:Math.round(vel*100)/100});
 const end=Math.max(...sorted.map(n=>n.start+n.len));
 const finish=(chord,style,{fallback=true,tolerance=0}={})=>{
  if(replays(key,chord,sorted,tolerance))return {kind:'chord',chord,style,exact:!tolerance};
  if(!fallback)return null;
  // the settings do not reproduce it: keep the exact strikes
  const tones=placedChordTones(key,chord);
  const strikes=sorted.map(n=>({at:n.start-chord.start,tone:tones.indexOf(n.midi),len:n.len,...(n.vel!==undefined?{vel:n.vel}:{})}));
  if(strikes.some(s=>s.tone<0))return null;
  const custom={...chord,strikes};
  delete custom.playMode;
  return replays(key,custom,sorted)?{kind:'chord',chord:custom,style:`${style} (exact strikes)`,exact:false}:null;
 };

 if(attacks.length===1){
  const lens=sorted.map(n=>n.len);
  const chord=make({start:attacks[0],len:Math.max(...lens),playMode:'chord'});
  return finish(chord,'chord')??{kind:'line',reason:'could not be replayed'};
 }
 // a roll: one note at a time, each pitch once, all ringing to the same end
 const singles=sizes.every(s=>s===1);
 const ends=sorted.map(n=>n.start+n.len);
 if(singles&&new Set(sorted.map(n=>n.midi)).size===sorted.length&&Math.max(...ends)-Math.min(...ends)<=1){
  const gaps=attacks.slice(1).map((a,i)=>a-attacks[i]);
  if(new Set(gaps).size===1&&gaps[0]>=1&&gaps[0]<=12){
   for(const direction of ['up','down','out','in']){
    const chord=make({start:attacks[0],len:end-attacks[0],playMode:'roll',direction,rate:gaps[0]});
    const done=finish(chord,'roll',{fallback:false});
    if(done)return done;
   }
  }
 }
 // running or repeated hits on a grid of their own: an arpeggio, a pulse
 const positions=attacks.map(a=>a-barStart);
 const grid=hitMask(positions,stepsPerBar);
 const barEnd=barStart+stepsPerBar;
 const spans=sorted.map(n=>n.len);
 if(grid&&positions[0]>=0&&end>barStart){
  const lenChoices=['tie','end',median(spans),undefined];
  const mode=singles?'arp':new Set(attacks.map(at=>sorted.filter(n=>n.start===at).map(n=>n.midi).join(','))).size===1?'pulse':null;
  if(mode){
   const directions=mode==='arp'?['up','down','upDown','downUp','broken','out','in']:['up'];
   const phases=mode==='arp'?2*pitches.length:1;
   const shape=extra=>make({start:barStart,len:stepsPerBar,playMode:mode,rate:grid.rate,...(grid.mask?{mask:grid.mask}:{}),...extra});
   let found=null;
   // the order of the notes first (length does not change it), then how long they last
   for(const direction of directions){
    for(let phase=0;phase<phases&&!found;phase++){
     const chord=shape({direction,noteLen:'end',...(phase?{phase}:{})});
     if(notesMatch(key,chord,sorted))found=chord;
    }
    if(found)break;
   }
   if(found){
    const middle=median(sorted.filter(n=>n.start!==attacks.at(-1)).map(n=>n.len));
    const choices=[];
    for(const tolerance of [0,1])for(const endAsOne of [false,true])for(const noteLen of [...lenChoices,middle])for(const spill of [false,true])choices.push({tolerance,endAsOne,noteLen,spill});
    for(const {tolerance,endAsOne,noteLen,spill} of choices){
     const {noteLen:_,spill:__,...rest}=found;
     const chord={...rest,...(noteLen!==undefined?{noteLen}:{}),...(spill?{spill:true}:{}),...(endAsOne?{endAsOne:true}:{})};
     const done=finish(chord,mode,{fallback:false,tolerance});
     if(done)return done;
    }
    const done=finish({...found,noteLen:'end'},mode);
    if(done)return done;
   }
   if(mode==='arp')return {kind:'line',reason:'composed figure (no standard direction)'};
  }
 }
 if(singles)return {kind:'line',reason:'uneven single notes'};
 // different chords on different hits: exact strikes on one voicing
 const chord=make({start:attacks[0],len:Math.max(1,end-attacks[0])});
 const done=finish({...chord,playMode:'pulse'},'varying hits');
 return done??{kind:'line',reason:'could not be replayed'};
}

/** The per-bar group of a captured note: its tag is \`role:bar\`, with a suffix once the song has been edited. */
export const groupBar=group=>{const m=/:(\d+)/.exec(String(group));return m?Number(m[1]):0;};

const parsed=new WeakMap();
/**
 * Every generated chord part in a captured pattern (notes tagged with chordSource.group): [{ group, source, items, start, ...parse }].
 * \`items\` are the pattern's own notes the part is made of, as itemsAt reports them. Cached per pattern.
 */
export function parsePattern(pattern,key,stepsPerBar=16) {
 if(!pattern?.steps)return [];
 const cached=parsed.get(pattern);
 if(cached&&cached.key===key&&cached.stepsPerBar===stepsPerBar)return cached.groups;
 const groups=new Map();
 pattern?.steps.forEach((step,start)=>step?.n?.forEach((note,index)=>{
  const source=note.chordSource;
  if(!source?.group||!Number.isInteger(source.root))return;
  const midi=degreeToMidi(key,note)+12*(pattern.octave??0);
  let group=groups.get(source.group);
  if(!group)groups.set(source.group,group={group:source.group,source,notes:[],items:[]});
  group.notes.push({start,midi,len:note.len??heldSteps(pattern,start),vel:note.vel??step.vel??.8});
  group.items.push({type:'note',start,index,midi});
 }));
 const result=[...groups.values()].map(g=>({...g,...parseChordGroup({notes:g.notes,key,rootPc:g.source.root,barStart:groupBar(g.group)*stepsPerBar,stepsPerBar})}));
 parsed.set(pattern,{key,stepsPerBar,groups:result});
 return result;
}
