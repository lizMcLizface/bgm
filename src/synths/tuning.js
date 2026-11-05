import {load,save} from './storage';

// Microtonal tuning as a translation of key to pitch, so it belongs to no synth: a key's MIDI note goes in, a fractional note comes
// out (the engines take fractional notes). One tuning for the whole /synths site, remembered on the device.
//   cents      an offset for each degree of the scale counted from the tonic (so a just-intonation tuning follows the key)
//   tonic      the pitch class the degrees count from (0 = C)
//   octave     the size of an octave as a frequency ratio (2 is a true octave; 2.01 stretches, 1.99 squeezes)
//   a4         the reference pitch of A4 in Hz
//   shift      a transposition in cents for everything
export const NAMES=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const zeros=()=>Array(12).fill(0);
// each is the tuning's offset from equal temperament, in cents, for the degrees C C♯ D E♭ E F F♯ G A♭ A B♭ B above the tonic
export const PRESETS={
 'Equal temperament':zeros(),
 'Just intonation':[0,11.73,3.91,15.64,-13.69,-1.96,-9.78,1.96,13.69,-15.64,17.6,-11.73],
 'Pythagorean':[0,13.69,3.91,-5.87,7.82,-1.96,11.73,1.96,15.64,5.87,-3.91,9.78],
 'Quarter-comma meantone':[0,-23.95,-6.84,10.26,-13.69,3.42,-20.53,-3.42,-27.37,-10.26,6.84,-17.11],
};
export const DEFAULT={cents:zeros(),tonic:0,octave:2,a4:440,shift:0};
const num=(v,lo,hi,d)=>Number.isFinite(v)?Math.min(hi,Math.max(lo,v)):d;
export function sanitize(t){
 return {
  cents:Array.from({length:12},(_,i)=>num(t?.cents?.[i],-100,100,0)),
  tonic:Math.round(num(t?.tonic,0,11,0)),octave:num(t?.octave,1.5,2.5,2),a4:num(t?.a4,400,480,440),shift:num(t?.shift,-100,100,0),
 };
}
/** A key's fractional MIDI note under a tuning. */
export function tunedNote(midi,t=DEFAULT){
 const degree=(((midi-t.tonic)%12)+12)%12;
 return midi+t.cents[degree]/100+(midi-60)/12*(12*Math.log2(t.octave)-12)+12*Math.log2(t.a4/440)+t.shift/100;
}

const KEY='synths:tuning';
let state=sanitize(load(KEY,null));
const listeners=new Set();
/** The site's tuning. `note(midi)` is what every engine's note-on should be given. */
export const tuning={
 get:()=>state,
 set(patch){state=sanitize({...state,...patch});save(KEY,state);listeners.forEach(f=>f(state));},
 /** a named tuning's offsets, keeping the tonic, octave, A4 and shift */
 preset(name){if(PRESETS[name])this.set({cents:PRESETS[name]});},
 reset(){this.set(DEFAULT);},
 note:midi=>tunedNote(midi,state),
 subscribe(f){listeners.add(f);return ()=>listeners.delete(f);},
 /** the name of the preset the offsets match, if any */
 named:()=>Object.keys(PRESETS).find(n=>PRESETS[n].every((c,i)=>Math.abs(c-state.cents[i])<.005))??null,
};
