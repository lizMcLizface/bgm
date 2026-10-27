import { soundFrom, GENERATOR_V3, normalizeSoundContext } from '../soundGenV3';
import { GENERATOR_V2 } from '../soundGenV2';
import { levelPreset } from './loudness';
import { preloadCalibratedPiano } from './calibratedPiano';

const cache = new Map();
/** Shared by live loading, links, comparisons and the offline renderer. */
export function prepareSound(info, generation = 'latest', {voiceColour=true,stringResonance=true,pianoResonance=true} = {}) {
    const normalized = info.version === GENERATOR_V3 ? { ...info, ...normalizeSoundContext(info) } : { ...info };
    const key = JSON.stringify([normalized, generation,voiceColour,stringResonance,pianoResonance]);
    if (!cache.has(key)) {
        if (cache.size >= 64) cache.delete(cache.keys().next().value);
        const promise = (async () => {
            const sound = soundFrom(normalized, generation,{voiceColour,stringResonance,pianoResonance});
            const made = [GENERATOR_V2, GENERATOR_V3].includes(info.version) && info.seed !== undefined ? { ...normalized, kind: sound.kind } : normalized;
            if (sound.preset.stringModel === 'piano') preloadCalibratedPiano(sound.preset.pianoType);   // a measured piano's table, before its first note
            return { ...sound, info: made, preset: await levelPreset(sound.preset, info.role) };
        })();
        cache.set(key, promise);
        promise.catch(() => { if (cache.get(key) === promise) cache.delete(key); });
    }
    return cache.get(key);
}
