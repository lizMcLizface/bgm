// A few plain words for what a synth preset sounds like, worked out from its
// parameters, for the voice picker's cards: how it starts and fades, how
// bright it is and what it is made of. A guess, not a measurement.

import PRESET_DEFAULTS from '../engine/presetDefaults';

const WAVES = {
    sine: 'sine', triangle: 'triangle', sawtooth: 'saw', square: 'square', pulse: 'pulse', glass: 'glassy', organ: 'organ',
};

export function voiceTraits(preset) {
    const p = { ...PRESET_DEFAULTS, ...preset };
    const decays = p.gainSustain < 0.12;
    const envelope = p.gainAttack >= 0.35 ? 'slow swell'
        : p.gainAttack >= 0.08 ? 'soft attack'
            : decays ? 'plucked'
                : 'steady';
    const cutoff = Math.min(p.filterType === 'lowpass' ? p.filterFreq + Math.max(0, p.filterEnvAmount) / 4 : 11000, p.masterFilterFreq);
    const tone = cutoff < 1300 ? 'dark' : cutoff < 4000 ? 'mellow' : 'bright';
    const space = [];
    if (p.reverbAmount >= 0.5) space.push('spacious');
    if (p.pingPongAmount > 0 || p.delayAmount > 0) space.push('echo');
    if (p.chorusAmount > 0.2) space.push('chorus');
    if (p.vibratoDepth > 0) space.push('vibrato');
    const wave = WAVES[p.vcoType] || String(p.vcoType);
    return { tone, envelope, wave, space, chips: [tone, envelope, ...space.slice(0, 1)] };
}
