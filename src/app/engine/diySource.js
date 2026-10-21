// A DIY Poly / DIY FM patch as a generator source: the preset is {diy: {synth: 'poly' | 'fm',
// name, values, rack, level}, ...}, played by WasmInstrument with the patch as its spec. The
// patch keeps its own reverb, delay and inserts; the rack's on/off switches fold into them.
import {POLY,FM} from '../../synths/diy/patches';
import {rackForPatch,rackPackets} from '../../synths/effects/params';

const schemaOf=diy=>diy.synth==='fm'?FM:POLY;
/** The WasmInstrument spec ({kind, patch}) for a DIY sound. */
export function diySpec(diy,polyphony=8){
 const schema=schemaOf(diy),patch=schema.inflate(diy.values);
 const {inserts,effects}=rackPackets(rackForPatch({id:diy.synth,params:schema.params},diy.values,diy.rack));
 patch.inserts={...patch.inserts,...inserts};patch.effects={...patch.effects,...effects};
 patch.global.polyphony=polyphony;if(diy.synth==='fm')patch.global.quality=1;
 patch.global.gain*=diy.level??1;
 return {kind:diy.synth==='fm'?'fm':'subtractive',patch};
}
/** Live edits: the instrument keeps playing; a change to its effects rebuilds the voice. */
export function updateDiy(instrument,diy){
 instrument.preset={...instrument.preset,diy};
 instrument.setSpec(diySpec(diy,instrument.polyphony));
}
