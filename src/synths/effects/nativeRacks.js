import {cleanRack} from './params';
import {leanChain} from './rackParts';

const defaults = {
 piano: { 'effects.reverb': .2, 'effects.decay': 3.2, 'effects.size': .6, 'effects.delay': .12, 'effects.delayMs': 420, 'effects.feedback': .32, 'effects.tone': 3800, 'effects.pingPong': 1 },
 iowa: { 'effects.reverb': .18, 'effects.decay': 2.8, 'effects.size': .6 },
};

export const nativeRackBase = id => ({ ...cleanRack(), ...defaults[id] });

export function nativeRackDefaults(id) {
 const rack = nativeRackBase(id);
 return { ...rack, 'master.chain': leanChain(rack) };
}
