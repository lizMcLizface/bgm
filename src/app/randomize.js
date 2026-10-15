// "Randomize" buttons: new values for one group of settings at a time -
// key & scale, progression, conductor (drift), voices. Each comes in two
// levels: "within reason" stays near the defaults and keeps the parts
// musically compatible (a minor progression gets a minor mode, a lead
// gets a lead sound); "full random" takes anything the controls allow.
//
// Pure: each returns a patch for settings (and, for voices, preset names
// per role), with randomness via `rng` - Math.random in the UI, since a
// randomize press is meant to be different every time.

import { SCALE_FAMILIES, TONIC_NAMES, scaleById, scaleSemitones } from './theory';
import PROGRESSIONS from './progressions';
import { METERS } from './meter';
import { DEFAULT_DRIFT, DRIFT_MODES, TEMPO_BOUNDS } from './conductor';
import { OCTAVE_LIMITS, OCTAVE_WANDER } from './arranger';
import { PRESET_CATEGORIES, ROLE_CATEGORY } from './presets';
import { presetGroups } from './editor/presetStore';
import { chance, pick, weighted } from './random';

export const RANDOM_LEVELS = { reason: 'Within reason', wild: 'Full random' };

const ALL_MODES = SCALE_FAMILIES.flatMap((f) => f.modes.map((m) => m.id));

// Within reason: the familiar modes, the common ones more often. Locrian
// (a diminished tonic) and the exotic families only come up in full random.
const REASONABLE_MODES = {
    'Major-1': 3, // Ionian
    'Major-6': 3, // Aeolian
    'Major-2': 2, // Dorian
    'Major-4': 2, // Lydian
    'Major-5': 2, // Mixolydian
    'Major-3': 1, // Phrygian
    'Harmonic Minor-1': 1,
    'Melodic Minor-1': 1,
    'Pentatonic-1': 1, // Major Pentatonic
    'Pentatonic-5': 1, // Minor Pentatonic
};

const REASONABLE_METERS = { '4/4': 6, '3/4': 2, '6/8': 2 };
const REASONABLE_TEMPO = [62, 84];

const between = (rng, lo, hi) => lo + rng() * (hi - lo);
const intBetween = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
// rounded to the slider step (and to clean decimals, for short share links)
const step = (value, size) => Number((Math.round(value / size) * size).toFixed(4));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Picks from `list`, avoiding `current` when there is anything else.
const pickOther = (rng, list, current) => {
    const others = list.filter((x) => x !== current);
    return pick(rng, others.length ? others : list);
};

/** 'major' / 'minor' by the scale's third above the tonic, else null. */
export function modeQuality(modeId) {
    const semis = scaleSemitones(scaleById(modeId).intervals);
    if (semis.includes(4) && !semis.includes(3)) return 'major';
    if (semis.includes(3) && !semis.includes(4)) return 'minor';
    return null;
}

/** 'minor' when the progression is written from a minor tonic (has 'i'), else 'major'. */
export const progressionQuality = (index) => (PROGRESSIONS[index].includes('i') ? 'minor' : 'major');

// One value per Music field, different from the current one where
// possible (a dice button that does nothing would look broken). Within
// reason, mode and progression suit each other (see modeQuality).
const others = (list, current) => (list.length > 1 ? list.filter((x) => x !== current) : list);
const FIELDS = {
    tonic: (settings, level, rng) => pick(rng, others([...TONIC_NAMES.keys()], settings.tonic)),
    mode: (settings, level, rng, { matchProgression = true } = {}) => {
        if (level === 'wild') return pick(rng, others(ALL_MODES, settings.mode));
        const wanted = matchProgression ? progressionQuality(settings.progression) : null;
        const fits = Object.entries(REASONABLE_MODES)
            .filter(([id]) => id !== settings.mode && (!wanted || [wanted, null].includes(modeQuality(id))));
        return fits.length ? weighted(rng, Object.fromEntries(fits)) : settings.mode;
    },
    progression: (settings, level, rng) => {
        const indices = [...PROGRESSIONS.keys()];
        if (level === 'wild') return pick(rng, others(indices, settings.progression));
        const quality = modeQuality(settings.mode);
        const fitting = indices.filter((i) => !quality || progressionQuality(i) === quality);
        return pickOther(rng, fitting.length ? fitting : indices, settings.progression);
    },
    barsPerChord: (settings, level, rng) => (level === 'wild'
        ? pick(rng, others([1, 2, 4], settings.barsPerChord))
        : pickOther(rng, [1, 2], settings.barsPerChord)),
    meter: (settings, level, rng) => {
        if (level === 'wild') return pick(rng, others(Object.keys(METERS), settings.meter));
        const choices = Object.entries(REASONABLE_METERS).filter(([id]) => id !== settings.meter);
        return weighted(rng, Object.fromEntries(choices));
    },
    bpm: (settings, level, rng) => {
        const [lo, hi] = level === 'wild' ? TEMPO_BOUNDS : REASONABLE_TEMPO;
        return pickOther(rng, Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), settings.bpm);
    },
};

/** Music fields that have a single-field randomizer. */
export const RANDOM_FIELDS = Object.keys(FIELDS);

/** A new value for one Music field: { [key]: value }. */
export function randomField(key, settings, level, rng = Math.random) {
    return { [key]: FIELDS[key](settings, level, rng) };
}

/**
 * Key and scale. Within reason, the mode suits the current progression
 * (pass matchProgression: false to ignore it, e.g. when the progression is
 * being randomized too).
 */
export function randomKey(settings, level, rng = Math.random, { matchProgression = true } = {}) {
    const tonic = FIELDS.tonic(settings, level, rng);
    return { tonic, mode: FIELDS.mode(settings, level, rng, { matchProgression }) };
}

/** Progression, bars per chord, time signature and tempo. */
export function randomProgression(settings, level, rng = Math.random) {
    return Object.fromEntries(['progression', 'barsPerChord', 'meter', 'bpm']
        .map((key) => [key, FIELDS[key](settings, level, rng)]));
}

const CHANCE_KEYS = ['keyChance', 'modeChance', 'progressionChance', 'tempoChance'];

/** The conductor (drift). Exclusion lists are the user's and are kept. */
export function randomConductor(settings, level, rng = Math.random) {
    const { excludedTonics, excludedModes } = settings.drift;
    if (level === 'wild') {
        return {
            drift: {
                mode: pick(rng, Object.keys(DRIFT_MODES)),
                ...Object.fromEntries(CHANCE_KEYS.map((key) => [key, step(rng(), 0.05)])),
                tempoRange: intBetween(rng, 0, 20),
                homePull: step(rng(), 0.05),
                pivot: chance(rng, 0.5),
                excludedTonics,
                excludedModes,
            },
        };
    }
    // Moving, mostly centered; each chance 50-150% of its default.
    return {
        drift: {
            mode: chance(rng, 0.7) ? 'centered' : 'wandering',
            ...Object.fromEntries(CHANCE_KEYS.map((key) => [key, clamp01(step(DEFAULT_DRIFT[key] * between(rng, 0.5, 1.5), 0.05))])),
            tempoRange: intBetween(rng, 4, 12),
            homePull: step(between(rng, 0.35, 0.7), 0.05),
            pivot: chance(rng, 0.85),
            excludedTonics,
            excludedModes,
        },
    };
}

/**
 * Preset names a role may get: within reason its own category (Leads for
 * the lead, ...), in full random every preset there is.
 */
export function presetPool(role, level, groups = presetGroups()) {
    if (level === 'wild') return [...new Set(groups.flatMap(({ presets }) => Object.keys(presets)))];
    return Object.keys(PRESET_CATEGORIES[ROLE_CATEGORY[role]]);
}

/** A different preset for one role (from presetPool). */
export function randomPreset(role, current, level, rng = Math.random, groups = presetGroups()) {
    return pickOther(rng, presetPool(role, level, groups), current);
}

/**
 * A sound per role plus register (octave, wander) and pad chord size.
 * @param {object} settings
 * @param {object} current - { role: current preset name }
 * @returns {{ settings: object, presets: object }} settings patch, preset name per role
 */
export function randomVoices(settings, current, level, rng = Math.random, groups = presetGroups()) {
    const roles = Object.keys(current);
    const presets = Object.fromEntries(roles.map((role) => [role, randomPreset(role, current[role], level, rng, groups)]));
    const wild = level === 'wild';
    const voices = Object.fromEntries(roles.map((role) => {
        const [lo, hi] = OCTAVE_LIMITS[role];
        if (wild) {
            return [role, { octave: intBetween(rng, lo, hi), wander: pick(rng, Object.keys(OCTAVE_WANDER)), chance: step(rng(), 0.05) }];
        }
        // home register, sometimes moving around it
        return [role, { octave: 0, wander: chance(rng, 0.6) ? 'off' : 'centered', chance: step(between(rng, 0.15, 0.4), 0.05) }];
    }));
    const padNotes = wild ? pick(rng, [3, 4, 5]) : weighted(rng, { 3: 5, 4: 4, 5: 1 });
    return { settings: { voices: { ...settings.voices, ...voices }, padNotes: Number(padNotes) }, presets };
}
