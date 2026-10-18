import {sanitizeProcedural} from '../synth-lab/proceduralPatch';
import {defaultEffects,sanitizeEffects} from '../synth-lab/effectsConfig';
export function preparedPatch(raw){const p=sanitizeProcedural(raw);if(p.family==='drums')throw Error('Percussion kits use the percussion laboratory.');return {...p,effects:sanitizeEffects(raw.effects??{...defaultEffects(),reverb:.18,delay:0,decay:6})};}
