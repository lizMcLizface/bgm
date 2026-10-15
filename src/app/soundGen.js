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

// --- ensembles: every voice at once, with a shared character -------------
// One seed makes a palette - a family of waveforms, how bright, which
// reverb and how much, a shared modulation effect, how soft the attacks
// are, echoes and vibrato for the melodic voices. Each role's recipe then
// runs as usual (with a seed derived from the ensemble's) and takes on the
// palette, within what suits the role. The voices sound like one band;
// a single voice's generate (generateSound) is unchanged.
//
// As with the recipes: changing what an ensemble seed makes changes every
// shared ensemble - only together with a new ENSEMBLE_VERSION.

export const ENSEMBLE_VERSION = 1;
const ENSEMBLE_ROLES = ['pad', 'bass', 'lead', 'counter'];

/** The shared character of an ensemble seed. */
export function ensemblePalette(seed) {
    const { range, maybe, pick, weighted } = tools(seeded(seed ^ 0x2545f491));
    return {
        family: weighted({ smooth: 3, warm: 3, bright: 2 }),
        brightness: range(0.6, 1.5),
        reverbType: pick(['reverb1', 'reverb3', 'reverb4', 'reverb6']),
        space: range(0.5, 1.6),
        motion: weighted({ chorus: 3, phaser: 2, none: 2 }),
        motionRate: range(0.15, 0.7),
        softness: range(0.7, 1.6),
        echo: maybe(0.5) ? { time: pick([0.25, 0.33, 0.375, 0.5]), feedback: range(0.2, 0.4) } : null,
        vibrato: maybe(0.5) ? range(3, 8, 1) : 0,
    };
}

const FAMILIES = {
    smooth: { sine: 3, triangle: 2 },
    warm: { triangle: 3, square_dc: 2, sine: 1 },
    bright: { sawtooth: 3, square_dc: 2, triangle: 1 },
};
// The recipes' filter ranges per role, [lo, hi] at brightness 0 and their
// slopes - to re-aim a filter when the waveform changes.
const FILTER_AIM = { pad: [5000, 3350], bass: [1200, 675], lead: [7500, 4500], counter: [7500, 4500] };
const aim = (role, wave) => FILTER_AIM[role][0] - FILTER_AIM[role][1] * BRIGHT[wave];
const MOTION_AMOUNT = { pad: 0.3, bass: 0.08, lead: 0.2, counter: 0.2 };
const clampTo = (lo, hi) => (v) => Math.min(hi, Math.max(lo, v));

function applyPalette(role, p, pal, { range, weighted }) {
    const wave = p.vcoType;
    p.vcoType = weighted(FAMILIES[pal.family]);
    if (p.vcoType === 'square_dc' && p.vcoDutyCycle === undefined) p.vcoDutyCycle = range(0.25, 0.45);
    if (p.vcoType !== 'square_dc') delete p.vcoDutyCycle;
    const top = role === 'bass' ? 1450 : 11000;
    p.filterFreq = round(clampTo(250, top)(p.filterFreq * (aim(role, p.vcoType) / aim(role, wave)) * pal.brightness), 0);

    if (role !== 'bass' || p.reverbAmount) {
        p.reverbType = role === 'bass' ? 'reverb1' : pal.reverbType;
        p.reverbAmount = round(clampTo(0.02, role === 'bass' ? 0.1 : 0.6)((p.reverbAmount || 0.05) * pal.space));
    }

    ['chorus', 'phaser'].forEach((fx) => Object.keys(p).filter((k) => k.startsWith(fx)).forEach((k) => delete p[k]));
    if (pal.motion === 'chorus') Object.assign(p, { chorusAmount: MOTION_AMOUNT[role], chorusRate: round(pal.motionRate) });
    if (pal.motion === 'phaser') Object.assign(p, { phaserAmount: MOTION_AMOUNT[role], phaserRate: round(pal.motionRate * 0.5), phaserDepth: 600 });

    if (role === 'bass') {
        p.gainRelease = round(clampTo(0.08, 0.5)(p.gainRelease * Math.min(pal.softness, 1.2)));
    } else {
        p.gainAttack = round(clampTo(role === 'pad' ? 0.6 : 0.005, role === 'pad' ? 4 : 0.3)(p.gainAttack * pal.softness), 3);
        p.gainRelease = round(clampTo(0.2, 5)(p.gainRelease * pal.softness));
    }

    if (role === 'lead' || role === 'counter') {
        ['delayTime', 'delayFeedback', 'delayAmount'].forEach((k) => delete p[k]);
        if (pal.echo) Object.assign(p, { delayTime: pal.echo.time, delayFeedback: round(pal.echo.feedback), delayAmount: role === 'lead' ? 0.18 : 0.12 });
        delete p.vibratoDepth;
        delete p.vibratoRate;
        if (pal.vibrato) Object.assign(p, { vibratoDepth: pal.vibrato, vibratoRate: 4.6 });
    }
    return p;
}

// Each voice's own seed in an ensemble.
const memberSeed = (ensemble, role) => (Math.imul(ensemble ^ 0x9e3779b9, 2654435761) + (ENSEMBLE_ROLES.indexOf(role) + 1) * 0x632be5ab) >>> 8;

/** An ensemble's name for one voice: a shared word and the ensemble's id, the voice's own noun. */
export function ensembleName(role, ensemble) {
    const shared = seeded(ensemble ^ 0x5bd1e995);
    const own = seeded(memberSeed(ensemble, role));
    const hex = ensemble.toString(16).padStart(6, '0');
    return `${pick(shared, ADJECTIVES)} ${pick(own, NOUNS)} #${hex.slice(0, 4)}`;
}

/**
 * One voice of an ensemble (masterVolume not yet levelled).
 * @returns {{ name: string, preset: object }}
 */
export function generateEnsembleSound(role, ensemble) {
    const seed = memberSeed(ensemble, role);
    const preset = applyPalette(role, RECIPES[role](tools(seeded(seed))), ensemblePalette(ensemble), tools(seeded(seed ^ 0x68e31da4)));
    preset.masterVolume = 0.6;
    return { name: ensembleName(role, ensemble), preset };
}

// Shared with version 2 (soundGenV2.js, which also has soundFrom for
// every version). Exported only: nothing here changes for it.
export { tools, RECIPES as RECIPES_V1, ADJECTIVES, NOUNS, BRIGHT, round };
