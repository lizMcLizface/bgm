// Procedural sounds: a synth preset made from a seed, shaped for the role
// it is made for - slow, wide pads; short, low basses; clear leads with
// vibrato and echoes. The same (role, seed) always makes the same sound,
// so a share link only has to carry the two (shareCode.js).
//
// Changing what a seed makes changes every shared generated sound: alter
// the recipes only together with a new GENERATOR_VERSION (and a share-code
// escape for it).
//
// Loudness isn't set here: generated presets go through levelPreset
// (engine/loudness.js) before they are played.

import { seeded, chance, pick, weighted } from './random';

export const GENERATOR_VERSION = 1;
export const SEED_BITS = 24;

export const newSoundSeed = () => Math.floor(Math.random() * 2 ** SEED_BITS);

// rounding keeps presets readable when saved or exported
const round = (value, places = 2) => Number(value.toFixed(places));

function tools(rng) {
    const range = (lo, hi, places = 2) => round(lo + rng() * (hi - lo), places);
    // log-uniform, for frequencies and times
    const logRange = (lo, hi, places = 0) => round(Math.exp(Math.log(lo) + rng() * (Math.log(hi) - Math.log(lo))), places);
    return { range, logRange, maybe: (p) => chance(rng, p), pick: (list) => pick(rng, list), weighted: (w) => weighted(rng, w) };
}

// Brightness of each waveform: darker filters for buzzier waves.
const BRIGHT = { sine: 0, triangle: 0.3, square_dc: 0.8, sawtooth: 1 };

const RECIPES = {
    pad({ range, logRange, maybe, pick, weighted }) {
        const vcoType = weighted({ sawtooth: 4, triangle: 3, sine: 1, square_dc: 1 });
        const p = {
            vcoType,
            voiceCount: pick([2, 3, 3, 4, 5]),
            detuneSpread: range(6, 20, 0),
            stereoSpread: range(40, 100, 0),
            gainAttack: range(0.6, 2.5),
            gainDecay: range(0.6, 2),
            gainSustain: range(0.5, 0.8),
            gainRelease: range(1.5, 3.5),
            envelopeAttackShape: 'sine',
            envelopeAttackExponent: 1,
            filterType: 'lowpass',
            filterFreq: logRange(4000 - 3200 * BRIGHT[vcoType], 6000 - 3500 * BRIGHT[vcoType]),
            filterQ: range(0.5, 2, 1),
            reverbType: pick(['reverb4', 'reverb4', 'reverb3', 'reverb1']),
            reverbAmount: range(0.3, 0.5),
            eqHighGain: range(-5, 0, 0),
        };
        if (vcoType === 'square_dc') p.vcoDutyCycle = range(0.2, 0.45);
        if (maybe(0.35)) Object.assign(p, { osc2Type: pick(['sine', 'triangle']), osc2OctaveOffset: pick([-1, 1, 1]), osc2Amount: range(0.2, 0.45) });
        if (maybe(0.3)) Object.assign(p, { filterEnvAmount: range(300, 1200, 0), filterAttack: range(1, 3), filterDecay: range(1, 3), filterRelease: range(1, 3) });
        if (maybe(0.55)) Object.assign(p, { chorusAmount: range(0.2, 0.4), chorusRate: range(0.3, 0.8) });
        else if (maybe(0.3)) Object.assign(p, { phaserAmount: range(0.2, 0.4), phaserRate: range(0.1, 0.4), phaserDepth: range(400, 900, 0) });
        if (maybe(0.15)) Object.assign(p, { noiseType: pick(['pink', 'brown']), noiseMix: range(0.03, 0.1), noiseFilterEnabled: true, noiseFilterQ: range(2, 8, 1) });
        if (maybe(0.2)) Object.assign(p, { vibratoDepth: range(3, 8, 1), vibratoRate: range(0.2, 0.6) });
        return p;
    },

    bass({ range, logRange, maybe, pick, weighted }) {
        const vcoType = weighted({ triangle: 4, sine: 3, sawtooth: 2, square_dc: 2 });
        const p = {
            vcoType,
            gainAttack: range(0.005, 0.04, 3),
            gainDecay: range(0.2, 0.8),
            gainSustain: range(0.3, 0.8),
            gainRelease: range(0.1, 0.4),
            filterType: 'lowpass',
            filterFreq: logRange(1000 - 650 * BRIGHT[vcoType], 1400 - 700 * BRIGHT[vcoType]),
            filterQ: range(0.5, 3, 1),
        };
        if (vcoType === 'square_dc') p.vcoDutyCycle = range(0.25, 0.5);
        if (vcoType === 'sawtooth' && maybe(0.5)) Object.assign(p, { voiceCount: 2, detuneSpread: range(4, 10, 0) });
        if (maybe(0.5)) Object.assign(p, { subOscOctaveOffset: -1, subOscType: 'sine' });
        if (maybe(0.45)) Object.assign(p, { filterEnvAmount: range(600, 2400, 0), filterDecay: range(0.15, 0.45) });
        if (maybe(0.25)) Object.assign(p, { osc2Type: pick(['sine', 'triangle']), osc2Amount: range(0.15, 0.35) });
        if (maybe(0.15)) Object.assign(p, { distortionDist: range(2, 6, 0), distortionAmount: range(0.05, 0.15) });
        if (maybe(0.5)) Object.assign(p, { reverbType: 'reverb1', reverbAmount: range(0.03, 0.08) });
        return p;
    },

    lead({ range, logRange, maybe, pick, weighted }) {
        const vcoType = weighted({ sine: 3, triangle: 3, square_dc: 2, sawtooth: 1 });
        const p = {
            vcoType,
            gainAttack: range(0.01, 0.15),
            gainDecay: range(0.2, 0.8),
            gainSustain: range(0.3, 0.7),
            gainRelease: range(0.3, 1),
            filterType: 'lowpass',
            filterFreq: logRange(6000 - 4000 * BRIGHT[vcoType], 9000 - 5000 * BRIGHT[vcoType]),
            filterQ: range(0.5, 1.5, 1),
            reverbType: pick(['reverb4', 'reverb3', 'reverb6']),
            reverbAmount: range(0.2, 0.4),
        };
        if (vcoType === 'square_dc') p.vcoDutyCycle = range(0.15, 0.45);
        if (maybe(0.5)) Object.assign(p, { osc2Type: pick(['sine', 'triangle']), osc2OctaveOffset: pick([0, 1, 1]), osc2Amount: range(0.15, 0.4), osc2Detune: range(0, 8, 1) });
        if (maybe(0.55)) Object.assign(p, { vibratoDepth: range(3, 10, 1), vibratoRate: range(4, 5.5, 1) });
        if (maybe(0.5)) Object.assign(p, { delayTime: range(0.3, 0.5), delayFeedback: range(0.2, 0.4), delayAmount: range(0.1, 0.25) });
        if (maybe(0.15)) Object.assign(p, { noiseType: 'white', noiseMix: range(0.03, 0.08), noiseFilterEnabled: true, noiseFilterQ: range(4, 8, 1) });
        if (maybe(0.2)) Object.assign(p, { filterEnvAmount: range(400, 1500, 0), filterDecay: range(0.1, 0.4) });
        return p;
    },
};

// The second lead: lead sounds.
RECIPES.counter = RECIPES.lead;

const ADJECTIVES = ['Amber', 'Ashen', 'Blue', 'Bright', 'Calm', 'Copper', 'Dusky', 'Faded', 'Felt', 'Glass', 'Golden', 'Hazy', 'Hollow',
    'Ivory', 'Lunar', 'Misty', 'Mossy', 'Opal', 'Pale', 'Paper', 'Quiet', 'Rusty', 'Silver', 'Slow', 'Soft', 'Still', 'Velvet', 'Warm',
    'Willow', 'Winter', 'Wooden', 'Woolen'];
const NOUNS = ['Bloom', 'Breath', 'Choir', 'Cloud', 'Coast', 'Drift', 'Dune', 'Echo', 'Ember', 'Fern', 'Field', 'Glow', 'Harbor', 'Hum',
    'Lantern', 'Meadow', 'Mist', 'Moth', 'Orbit', 'Pebble', 'Reed', 'Ripple', 'River', 'Shore', 'Signal', 'Spire', 'Tide', 'Thread',
    'Tone', 'Veil', 'Wave', 'Wren'];

/** The display name of a generated sound: two words and part of the seed. */
export function soundName(role, seed) {
    const rng = seeded(seed ^ 0x5bd1e995);
    const hex = seed.toString(16).padStart(6, '0');
    return `${pick(rng, ADJECTIVES)} ${pick(rng, NOUNS)} #${hex.slice(0, 4)}`;
}

/**
 * A preset for `role` from `seed` (masterVolume not yet levelled).
 * @returns {{ name: string, preset: object }}
 */
export function generateSound(role, seed) {
    const preset = RECIPES[role](tools(seeded(seed)));
    preset.masterVolume = 0.6;
    return { name: soundName(role, seed), preset };
}

export const SOUND_ROLES = Object.keys(RECIPES);
