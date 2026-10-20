// Turns every input (MIDI piano, on-screen keys, computer keys, ribbon, touch pad)
// into engine events. Inputs name their notes with string keys; the engine gets
// fresh numeric ids, so a stale release can never stop a newer note.
import {CONTROLS} from './liveSynth';

export class Performer {
 constructor(target,{onNotes=()=>{}}={}){
  this.target=target;this.onNotes=onNotes;this.keys=new Map();this.next=0;
  this.sources={ribbon:0,wheel:0,pad:0,aftertouch:0,padMod:0,wheelMod:0};
  this.sent={};
 }
 setTarget(target){this.target=target;this.sent={};this.sync();}
 down(key,note,velocity){
  if(this.keys.has(key))this.up(key);
  const id=++this.next;this.keys.set(key,{id,note});
  this.target?.noteOn(id,note,velocity);this.onNotes(this.notes());
 }
 up(key){
  const held=this.keys.get(key);if(!held)return;
  this.keys.delete(key);this.target?.noteOff(held.id);this.onNotes(this.notes());
 }
 /** Polyphonic aftertouch for one held key. */
 pressure(key,value){const held=this.keys.get(key);if(held)this.target?.pressure(held.id,value);}
 releaseAll(){for(const key of [...this.keys.keys()])this.up(key);}
 notes(){return [...this.keys.values()].map(k=>k.note);}
 control(name,value){this.send(name,value);}
 /** Continuous sources combine: bends add, pressure and modulation take the larger. */
 source(name,value){this.sources[name]=value;this.sync();}
 sync(){
  const s=this.sources;
  this.send('bend',s.ribbon+s.wheel);
  this.send('pressure',Math.max(s.pad,s.aftertouch));
  this.send('mod',Math.max(s.padMod,s.wheelMod));
 }
 send(name,value){
  if(this.sent[name]===value)return;this.sent[name]=value;
  this.target?.control(CONTROLS[name],value);
 }
 /** Resends sustain/expression and friends to a freshly started engine. */
 restore(extra){for(const [name,value] of Object.entries(extra))this.send(name,value);this.sync();}
 panic(){this.keys.clear();this.onNotes([]);this.target?.panic();}
}
