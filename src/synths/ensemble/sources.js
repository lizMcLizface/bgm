// A classic synth or DIY patch as a generator source (Generator.setRoleSource), shared by the
// ensemble page and the main page's sound window.
import {referenceLoudness,measureLoudness} from '../../app/engine/loudness';

// Measured levels, so a sound chosen again is not measured again.
const levels=new Map();
export const DIY_SYNTHS=['poly','fm'];
const isDiy=sound=>DIY_SYNTHS.includes(sound.synth);
// The sound alone at level 1, as measureLoudness takes it.
const probe=sound=>isDiy(sound)?{diy:{...sound,level:1}}:{classics:{synth:sound.synth,values:sound.values}};
/** The gain that brings `sound` (a classic or DIY patch) to the loudness of the role's reference voice. */
export async function matchedLevel(sound,id){
 const key=JSON.stringify([id,sound.synth,sound.values]);
 if(levels.size>=64&&!levels.has(key))levels.delete(levels.keys().next().value);
 if(!levels.has(key))levels.set(key,Promise.all([referenceLoudness(id),measureLoudness(probe(sound),id)]).then(([target,measured])=>Math.max(.01,Math.min(4,10**((target-measured)/20)))).catch(error=>{levels.delete(key);throw error;}));
 return levels.get(key);
}
/** The generator preset for a classic or DIY sound; light mode trims a classic's oversampling and voices for phones. */
export function soundSource(sound,id,light){
 if(isDiy(sound))return {diy:{synth:sound.synth,name:sound.name,values:sound.values,rack:sound.rack,level:sound.level??1},masterVolume:1};
 return classicsSource(sound,id,light);
}
export function classicsSource(sound,id,light){
 const values={...sound.values};
 if(light){if('oversample'in values)values.oversample=0;if('voices'in values)values.voices=Math.min(values.voices,id==='pad'?4:2);}
 return {classics:{synth:sound.synth,name:sound.name,values,rack:sound.rack,light},masterVolume:sound.level??1};
}
