// Level trims, in dB, for voices whose loudness lives in a recipe instead of a preset (the synth-lab and prepared voices).
// Presets in voices.json / presetData.js carry their level in masterVolume and are edited there. The trims come from the
// level pass: measure on /labs/levels/ (npm run levels:measure), adjust, measure again.
import trims from './levelTrims.json';
export const trimDb=id=>trims[id]??0;
// The engine clamps output gain at 0.8. Anything a trim asks for beyond that goes to the insert output trim (up to +6 dB).
export const KERNEL_GAIN_MAX=.8,INSERT_TRIM_MAX=6;
export function applyGain(patch,gain,max=KERNEL_GAIN_MAX){
 const kernel=Math.min(max,gain),extra=gain>kernel?20*Math.log10(gain/kernel):0;
 patch.global.gain=kernel;
 if(extra>.05)patch.inserts={...patch.inserts,gain:Math.min(INSERT_TRIM_MAX,(patch.inserts?.gain??0)+extra)};
}
export const applyTrim=(id,patch,max)=>applyGain(patch,patch.global.gain*10**(trimDb(id)/20),max);
