// What a sound is built on, for the picker's top-right tag: one of the page's own synths
// (Calm poly, Calm FM, the piano and string models, the original Web Audio synth) or one of
// the classic synths (V 80, Pluto 8, ...). Worked out the way the engine chooses
// (engine/wasmPreset.js), so it names the base the sound was made for.

import { needsNativeSource } from '../engine/wasmPreset';
import { wasmVoiceById } from '../../synth-lab/voiceLibrary';

export const BASES = {
    poly: { label: 'Calm poly', colour: '#c0a060' },
    fm: { label: 'Calm FM', colour: '#5fb0c8' },
    piano: { label: 'Calm piano', colour: '#7f94d8' },
    string: { label: 'Calm string', colour: '#d98070' },
    legacy: { label: 'Web Audio', colour: '#98a0a8' },
    classic: { label: 'Classic', colour: '#d07ab0' },
};

/** @returns {{ id: string, label: string, colour: string }} */
export function soundBase(preset = {}) {
    // the picker lists a classic's sound as a reference, which names its synth; the page itself never loads the synths
    if (preset.classicRef) return { ...BASES.classic, id: 'classic', label: preset.classicRef.synthName };
    if (preset.classics) return { ...BASES.classic, id: 'classic' };
    const voice = preset.wasmVoice && wasmVoiceById(preset.wasmVoice);
    let id;
    if (voice) id = voice.kind === 'fm' ? 'fm' : 'poly';
    else if (preset.stringModel === 'piano') id = 'piano';
    else if (preset.stringModel === 'plucked') id = 'string';
    else if (needsNativeSource(preset)) id = 'legacy';
    else id = preset.fmIndex > 0 || preset.fmEnvAmount > 0 ? 'fm' : 'poly';
    return { id, ...BASES[id] };
}
