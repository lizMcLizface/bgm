// Panel values read off the original patch sheets (sheetPresets.js) → engine values, through the
// same mapping as an imported program (sysex.js engineValues). The sheets show the 1978 panel, so
// what it lacks is filled in: no velocity or aftertouch, Rev 3 filter, low-note priority.
import {engineValues} from './sysex';

const PANEL_DEFAULTS={
 velFilter:false,velAmp:false,afterFilter:false,afterAmp:false,velocityAmount:1,aftertouchAmount:1,
 filterRev:'rev3',vintage:.25,unisonVoices:5,unisonChord:false,chord:[],unisonDetune:.3,bendRange:2,keyPriority:'low',
};

/** Sheet panel values (decodeProgram's shape, plus oscBFreqRaw for the low-frequency rate) → engine values. */
export function sheetEngineValues(panel){
 const v={...PANEL_DEFAULTS,...panel};
 return engineValues(v,[0,v.oscBFreqRaw??48]);
}
