import {renderPiano,renderPianoBody} from '../app/engine/piano';
import {renderString} from '../app/engine/pluckedString';
export const midiHz=midi=>440*2**((midi-69)/12);
export function bufferDescriptors(p,note,rate){
 if(p.family==='drums')return [];
 const frequency=Math.round(midiHz(note.midi)*100)/100;
 if(p.family==='pluck')return [{key:['string',frequency,p.string],family:'string',frequency,rate,settings:p.string}];
 const settings={...p.piano,velocity:Math.round(Math.max(0,Math.min(1,note.velocity??.7))*7)/7},rows=[{key:['piano',frequency,settings],family:'piano',frequency,rate,settings}];
 if(settings.sustain>0){const body={type:settings.type,brightness:settings.brightness,sustain:settings.sustain,resonance:settings.resonance,velocity:settings.velocity},highest=Math.max(frequency,midiHz(note.highestMidi??note.midi));rows.push({key:['piano-body',Math.min(body.resonance>0?8:4,Math.floor(rate*.45/highest)),body],family:'body',frequency:highest,rate,settings:body});}
 return rows;
}
export function renderDescriptor(d){if(d.family==='piano')return renderPiano(d.rate,d.frequency,d.settings);if(d.family==='body')return renderPianoBody(d.rate,d.frequency,d.settings);if(d.family==='string')return renderString(d.rate,d.frequency,d.settings);throw Error('Unknown procedural buffer.');}
