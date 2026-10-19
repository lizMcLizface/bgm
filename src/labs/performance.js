import {readPerformance} from '../audio/performance';

// Device preference changes room density, never its decay, send, stereo width,
// individual echoes, source patch or FM oversampling. Keep exported patches intact.
export function roomPerformance(effects, preference=readPerformance()) {
 return {...effects,quality:preference.reverb==='light'?0:effects.quality};
}
