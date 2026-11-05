// The setup every /synths page shares (kept in the browser under SETUP_KEY): MIDI, touch, the keybed and the computer keys.
export const SETUP_KEY='synths:setup';
export const SETUP={midiDevice:'all',midiChannel:'all',velocity:'normal',ribbonRange:12,wheelRange:2,latency:'interactive',keys:'auto',keysLow:48,keysCount:25,
 // the keybed: 'fit' fills the box as before; 49, 61, 76 and 88 are whole keybeds. Controls are the mod wheel, ribbon and touch pad beside the keys.
 keysSize:'fit',keysControls:true,
 // what the computer keys send: a velocity (1-127) and how far it wanders from it each time
 keyVelocity:95,keyVariation:0};
export const CURVES={light:{curve:.6,floor:.08},normal:{curve:1,floor:.06},firm:{curve:1.6,floor:.04}};
export const KEY_SIZES=[['fit','Fit the window'],[49,'49 keys'],[61,'61 keys'],[76,'76 keys'],[88,'88 keys']];
/** The velocity (0-1) one computer key press sends, with the variation applied. */
export const computerKeyVelocity=(setup,random=Math.random)=>Math.min(127,Math.max(1,(setup.keyVelocity??95)+(random()*2-1)*(setup.keyVariation??0)))/127;
