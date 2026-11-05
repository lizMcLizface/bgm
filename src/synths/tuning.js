import {load,save} from './storage';

// Microtonal tuning as a translation of key to pitch, so it belongs to no synth: a key's MIDI note goes in, a fractional note comes
// out (the engines take fractional notes). One tuning for the whole /synths site, remembered on the device.
//   cents      an offset for each degree of the scale counted from the tonic (so a just-intonation tuning follows the key)
//   tonic      the pitch class the degrees count from (0 = C)
//   octave     the size of an octave as a frequency ratio (2 is a true octave; 2.01 stretches, 1.99 squeezes)
//   a4         the reference pitch of A4 in Hz
//   shift      a transposition in cents for everything
//   auto       tune whatever is held as a just chord above its own root (see chordOffsets), over the scale's offsets
export const NAMES=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const zeros=()=>Array(12).fill(0);
// each is the tuning's offset from equal temperament, in cents, for the degrees C C♯ D E♭ E F F♯ G A♭ A B♭ B above the tonic
export const PRESETS={
 'Equal temperament':zeros(),
 'Just intonation':[0,11.73,3.91,15.64,-13.69,-1.96,-9.78,1.96,13.69,-15.64,17.6,-11.73],
 'Pythagorean':[0,13.69,3.91,-5.87,7.82,-1.96,11.73,1.96,15.64,5.87,-3.91,9.78],
 'Quarter-comma meantone':[0,-23.95,-6.84,10.26,-13.69,3.42,-20.53,-3.42,-27.37,-10.26,6.84,-17.11],
};
export const DEFAULT={cents:zeros(),tonic:0,octave:2,a4:440,shift:0,auto:0};
const num=(v,lo,hi,d)=>Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):d;
export function sanitize(t){
 return {
  cents:Array.from({length:12},(_,i)=>num(t?.cents?.[i],-100,100,0)),
  auto:t?.auto?1:0,tonic:Math.round(num(t?.tonic,0,11,0)),octave:num(t?.octave,1.5,2.5,2),a4:num(t?.a4,400,480,440),shift:num(t?.shift,-100,100,0),
 };
}
/** A key's fractional MIDI note under a tuning. */
export function tunedNote(midi,t=DEFAULT,cents=null){
 const degree=(((midi-t.tonic)%12)+12)%12;
 return midi+(cents??t.cents[degree])/100+(midi-60)/12*(12*Math.log2(t.octave)-12)+12*Math.log2(t.a4/440)+t.shift/100;
}

// The chord shapes a set of held keys is read against, as semitones above the root.
const SHAPES=[[0,4,7],[0,3,7],[0,3,6],[0,4,8],[0,2,7],[0,5,7],[0,4,7,10],[0,4,7,11],[0,3,7,10],[0,3,7,11],[0,3,6,10],[0,3,6,9],[0,4,7,9],[0,3,7,9],[0,2,4,7],[0,2,4,7,10],[0,2,4,7,11],[0,2,3,7,10]];
/** The root of what is held: the key whose intervals above it fit a chord shape most tightly; the lowest key breaks a tie. */
export function chordRoot(keys){
 const low=Math.min(...keys),classes=[...new Set(keys.map(k=>((k%12)+12)%12))];
 let best=low,top=-Infinity;
 for(const root of classes){
  const have=new Set(classes.map(c=>(c-root+12)%12));
  for(const shape of SHAPES){
   if(![...have].every(i=>shape.includes(i)))continue;
   const score=have.size*10-shape.length+(root===((low%12)+12)%12?1.5:0);
   if(score>top){top=score;best=root;}
  }
 }
 // a pitch class back to the lowest held key that has it
 return top===-Infinity?low:keys.filter(k=>((k%12)+12)%12===best).reduce((a,b)=>Math.min(a,b),Infinity);
}
const JUST=PRESETS['Just intonation'];
/** For a set of held keys, each key's offset in cents from equal temperament when the chord is tuned just above its root: the root keeps
 *  its own scale offset and every other key sits at its just interval above it (a 5-limit ratio: 5/4, 6/5, 3/2, 9/5, 15/8...). A single
 *  pitch class has no chord, so it is left to the scale. Returns a Map of key → cents, or null. */
export function chordOffsets(keys,t=DEFAULT){
 if(new Set(keys.map(k=>((k%12)+12)%12)).size<2)return null;
 const root=chordRoot(keys),base=t.cents[(((root-t.tonic)%12)+12)%12],out=new Map();
 for(const k of keys)out.set(k,base+JUST[(((k-root)%12)+12)%12]);
 return out;
}

const KEY='synths:tuning';
let state=sanitize(load(KEY,null));
const listeners=new Set(),liveListeners=new Set();
let held=[],liveOffsets=null;
function refreshLive(){
 const o=state.auto&&held.length?chordOffsets(held,state):null,next=o?new Map([...o].map(([k,c])=>[((k%12)+12)%12,c])):null;
 const same=(!next&&!liveOffsets)||(next&&liveOffsets&&next.size===liveOffsets.size&&[...next].every(([k,c])=>liveOffsets.get(k)===c));
 if(same)return;
 liveOffsets=next;liveListeners.forEach(f=>f(next));
}
/** The site's tuning. `note(midi)` is what every engine's note-on should be given. */
export const tuning={
 get:()=>state,
 set(patch){state=sanitize({...state,...patch});save(KEY,state);refreshLive();listeners.forEach(f=>f(state));},
 /** a named tuning's offsets, keeping the tonic, octave, A4 and shift */
 preset(name){if(PRESETS[name])this.set({cents:PRESETS[name]});},
 reset(){this.set(DEFAULT);},
 /** `held` are all the keys sounding, the one being played included: with auto-tune on they set the chord this key is tuned within. */
 note:(midi,held=null)=>tunedNote(midi,state,state.auto&&held?.length?chordOffsets(held,state)?.get(midi)??null:null),
 subscribe(f){listeners.add(f);return ()=>listeners.delete(f);},
 /** The keys sounding now, from the page's engine: with auto-tune on they decide the chord, and the offsets it is applying are shown. */
 setHeld(keys){held=[...keys];refreshLive();},
 /** The offset in cents each sounding pitch class is being given by the chord (a Map of pitch class → cents), or null when no chord is tuned. */
 liveCents:()=>liveOffsets,
 /** Called when the chord offsets change (not when the scale does: the engine listens to `subscribe` for that). */
 subscribeLive(f){liveListeners.add(f);return ()=>liveListeners.delete(f);},
 /** the name of the preset the offsets match, if any */
 named:()=>Object.keys(PRESETS).find(n=>PRESETS[n].every((c,i)=>Math.abs(c-state.cents[i])<.005))??null,
};
