import {percussionFromSearch,withPercussion} from '../audio/percussionChoice';
import {mediaHelperFromSearch,withMediaHelper} from '../audio/mediaHelperChoice';
import {readPerfChoice,withPerf,perfFromSearch} from '../audio/perfMode';
import {engineFromSearch,withAudioEngine} from './audioEngineChoice';
import {simdFromSearch,withSimd,bankFromSearch,withFMBank} from '../audio/simdChoice';
// Generator settings as data: defaults, validation, and the compact form
// used in share links (?s=...). Synth presets are not
// part of the settings; a link carries each role's built-in preset name
// alongside (shareCode.js), edited or custom sounds stay local.
//
// Anything arriving from a link is untrusted: sanitizeSettings
// keeps only known keys, coerces/clamps every value to its valid range,
// and falls back to the default otherwise. Links are bit-packed
// (shareCode.js); links made before that (base64 JSON, starting 'eyJ')
// still open.

import {
    DEFAULT_PAD_WEIGHTS, DEFAULT_BASS_WEIGHTS, DEFAULT_VOICES, OCTAVE_LIMITS, OCTAVE_WANDER,
    DEFAULT_COUNTER, COUNTER_MODES, DEFAULT_SECTIONS, SECTION_MODES, SECTION_LENGTHS,
    DEFAULT_PULSE_WEIGHTS, DEFAULT_ARP_WEIGHTS, DEFAULT_DIRECTION_WEIGHTS, DEFAULT_PAD_MOTION, PEDAL_MODES, SPREADS, LEAD_SCALES, LEAD_ENDINGS,
} from './arranger';
import { AMBIENCE_LAYERS, DEFAULT_AMBIENCE, defaultAmbienceShape } from './engine/ambience';
import { LAYER_PARAMS, COMMON_PARAMS } from './engine/ambienceSynth';
import { ROLE_VOLUMES } from './presets';
import { ARC_SHAPES } from './composition/arc';
import { defaultWander, defaultAmbienceWander, WANDER_ROLES, WANDER_LIMITS, WANDER_MODES, AMBIENCE_WANDER_LIMITS } from './engine/wander';
import { DEFAULT_DRUMS, DRUM_STYLES, DRUM_KITS, DRUMS, DRUM_PARAMS, defaultDrumKit } from './percussion';
import { DEFAULT_DRIFT, DRIFT_MODES, BPM_LIMITS } from './conductor';
import { METERS, DEFAULT_METER } from './meter';
import { SCALE_FAMILIES, CHORD_COLOURS } from './theory';
import PROGRESSIONS from './progressions';
import { decodeShareCode, encodeShareParts, decodeShareParts } from './shareCode';
import { phraseToSeed } from './phrase';
import { HARMONY_SCALES } from './composition/harmonyScale';
import { generationFromSearch, withGeneration } from './generation';
import { defaultBus, BUS_RULES } from './engine/bus';
import { encodeExtras, decodeExtras } from './shareExtras';

/** Fresh default settings (a new random seed each call). */
export function defaultSettings() {
    return {
        generation: 'latest',
        tonic: 0,
        mode: 'Major-1', // scale id, as on the main page (theory.js SCALE_FAMILIES)
        bpm: 72,
        progression: 0,
        barsPerChord: 1,
        meter: DEFAULT_METER, // meter.js
        leadActivity: 0.6, // chance a 4-bar phrase has lead (arranger.js)
        leadDensity: 0, // how busy its rhythms are: 0 as always .. 1 mostly eighths and sixteenths
        padWeights: { ...DEFAULT_PAD_WEIGHTS }, // style shares per phrase
        bassWeights: { ...DEFAULT_BASS_WEIGHTS },
        thinPadUnderLead: true,
        padNotes: 3, // chord size: 3 triads, 4 sevenths, 5 ninths
        // The colour layer (the Colour panel): each off or neutral by default
        chordColour: { mode: 'plain', amount: 0.35 }, // a colour (theory.js CHORD_COLOURS) on this share of the chords
        chordBorrow: 0, // share of chords taken from the parallel mode
        chordSpread: 'close', // voicing of the pad: close or open (arranger.js SPREADS)
        pedal: { mode: 'off', amount: 0.5 }, // the bass holds the tonic or fifth for this share of phrases
        harmonyScale: 'auto',
        tonality: { mode: 'tonal', separation: 1 },
        leadScale: 'full', // full, or pentatonic
        leadLeaps: 0.5, // how far the lead jumps between chord tones: 0.5 as drawn, less is stepwise, more leapy
        leadRepeat: 0, // share of phrases that repeat the last phrase's tune
        leadEnding: 'settled', // a phrase ends on the chord, or stays open
        voices: JSON.parse(JSON.stringify(DEFAULT_VOICES)), // per-role octave + wander
        drift: { ...DEFAULT_DRIFT, excludedTonics: [], excludedModes: [] }, // conductor.js
        humanize: { timing: 12, velocity: 0.08, detune: 3 }, // ms, fraction, cents
        // how the scene plays (composition/dynamics.js): strength and spread of the velocities,
        // softer notes starting more gently, stronger notes sounding brighter; these values change nothing
        dynamics: { level: 1, range: 1, attack: 0, brightness: 0 },
        arc: { shape: 'off', minutes: 20 }, // the energy over a long stretch: rise, wind down or wave (composition/arc.js)
        feel: { busy: 0, bright: 0 }, // the feel pad's place: calmer..busier, darker..brighter (composition/feel.js)
        breakdowns: { meter: 'same', halfTime: false }, // a breakdown's own meter, and half-time drums in it
        timbreDrift: 0, // 0..1: oscillator sounds' colour moves slowly around their own (composition/timbreDrift.js)
        keyLift: 0, // 0..1: chance that a build lifts the full sections after it a whole step (Generator.planBar)
        sectionSpace: 0, // 0..1: a wide room the voices send to more in intros and breakdowns (composition/sectionSpace.js)
        evenLoudness: 0, // 0..1: busy bars turned down and sparse ones up, at most ±4 dB (composition/loudness.js)
        ducking: 0, // 0..1: the pad (and second lead) dip while a melody plays (engine/ducking.js)
        ornaments: 0, // 0..1: grace notes, mordents, turns and slow trills on the leads (composition/ornaments.js)
        rubato: 0, // 0..1: slowing into phrase ends, more into section changes and the ending (composition/rubato.js)
        // Added later (docs/DESIGN.md §9 C), off by default: links only
        // carry what differs from the defaults, so a link made before them
        // must read them as off.
        swing: 0, // 0 straight .. 0.6 (1 would be full triplet swing)
        sectionTone: false, // sections also darken / open the voices
        drums: { ...DEFAULT_DRUMS }, // percussion.js: style, activity, variation
        drumKit: defaultDrumKit(), // the kit's sound: room, per drum on / level / tone / decay
        muted: Object.fromEntries(Object.keys(ROLE_VOLUMES).map((role) => [role, false])), // per role (solo isn't kept)
        counter: { ...DEFAULT_COUNTER }, // second lead (arranger.js)
        sections: { ...DEFAULT_SECTIONS, mode: 'gentle' }, // intro / build / full / breakdown (new visits: gentle, to open with an intro)
        ambience: { ...DEFAULT_AMBIENCE }, // rain, wind, ... levels 0..1 (engine/ambience.js)
        ambienceShape: defaultAmbienceShape(), // per layer: its own params, distance, pan, width (engine/ambienceSynth.js)
        ambienceVolume: 0.8, // the whole bed against the music
        playMusic: true, // what Play starts
        playAmbience: false,
        volumes: { ...ROLE_VOLUMES }, // per role, 0..1
        pulseWeights: { ...DEFAULT_PULSE_WEIGHTS }, // how the pad pulses / arpeggiates (arranger.js)
        directionWeights: { ...DEFAULT_DIRECTION_WEIGHTS }, // which way rolled and stacked chords go
        arpWeights: { ...DEFAULT_ARP_WEIGHTS },
        padMotion: { ...DEFAULT_PAD_MOTION }, // register lean, fast arpeggios, swell
        wander: defaultWander(), // slow pan / volume / filter / pitch drift (engine/wander.js)
        ambienceWander: defaultAmbienceWander(), // the bed's own slow drift in level, in all and per layer
        bus: defaultBus(), // the shared effects bus: per-voice sends (all 0: off) and its rack (engine/bus.js)
        seed: newSeed(),
    };
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

const MODE_IDS = new Set(SCALE_FAMILIES.flatMap((f) => f.modes.map((m) => m.id)));

const clamp = (lo, hi) => (v) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
const int = (lo, hi) => (v) => (Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const oneOf = (allowed) => (v) => (allowed.includes(v) ? v : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);
const listOf = (valid) => (v) => (Array.isArray(v) ? [...new Set(v.filter(valid))] : undefined);

// Validator per key path; nested objects are walked key by key.
const RULES = {
    tonic: int(0, 11),
    generation: oneOf(['latest', 'legacy']),
    mode: (v) => (MODE_IDS.has(v) ? v : undefined),
    bpm: clamp(BPM_LIMITS[0], BPM_LIMITS[1]),
    progression: int(0, PROGRESSIONS.length - 1),
    barsPerChord: oneOf([1, 2, 4]),
    meter: oneOf(Object.keys(METERS)),
    leadActivity: clamp(0, 1),
    leadDensity: clamp(0, 1),
    padWeights: { sustain: clamp(0, 100), pulse: clamp(0, 100), arpeggio: clamp(0, 100), sequence: clamp(0, 100), rolled: clamp(0, 100), stacked: clamp(0, 100) },
    directionWeights: { up: clamp(0, 100), down: clamp(0, 100), out: clamp(0, 100), in: clamp(0, 100) },
    bassWeights: { whole: clamp(0, 100), half: clamp(0, 100), walking: clamp(0, 100), drive: clamp(0, 100) },
    thinPadUnderLead: bool,
    padNotes: oneOf([3, 4, 5]),
    chordColour: { mode: oneOf(Object.keys(CHORD_COLOURS)), amount: clamp(0, 1) },
    chordBorrow: clamp(0, 1),
    chordSpread: oneOf(Object.keys(SPREADS)),
    pedal: { mode: oneOf(Object.keys(PEDAL_MODES)), amount: clamp(0, 1) },
    harmonyScale: oneOf(Object.keys(HARMONY_SCALES)),
    tonality: { mode: oneOf(['tonal','atonal','bitonal']), separation: int(1,11) },
    leadScale: oneOf(Object.keys(LEAD_SCALES)),
    leadLeaps: clamp(0, 1),
    leadRepeat: clamp(0, 1),
    leadEnding: oneOf(Object.keys(LEAD_ENDINGS)),
    voices: Object.fromEntries(Object.entries(OCTAVE_LIMITS).map(([role, [lo, hi]]) => [role, {
        octave: int(lo, hi),
        wander: oneOf(Object.keys(OCTAVE_WANDER)),
        chance: clamp(0, 1),
    }])),
    drift: {
        mode: oneOf(Object.keys(DRIFT_MODES)),
        keyChance: clamp(0, 1),
        modeChance: clamp(0, 1),
        progressionChance: clamp(0, 1),
        tempoChance: clamp(0, 1),
        tempoRange: clamp(0, 20),
        homePull: clamp(0, 1),
        pivot: bool,
        excludedTonics: listOf((pc) => Number.isInteger(pc) && pc >= 0 && pc <= 11),
        excludedModes: listOf((id) => MODE_IDS.has(id)),
    },
    humanize: { timing: clamp(0, 40), velocity: clamp(0, 0.25), detune: clamp(0, 15) },
    dynamics: { level: clamp(0.6, 1.2), range: clamp(0, 2), attack: clamp(0, 1), brightness: clamp(0, 1) },
    rubato: clamp(0, 1),
    ornaments: clamp(0, 1),
    ducking: clamp(0, 1),
    evenLoudness: clamp(0, 1),
    sectionSpace: clamp(0, 1),
    keyLift: clamp(0, 1),
    timbreDrift: clamp(0, 1),
    breakdowns: { meter: oneOf(['same', ...Object.keys(METERS)]), halfTime: bool },
    feel: { busy: clamp(-1, 1), bright: clamp(-1, 1) },
    arc: { shape: oneOf(Object.keys(ARC_SHAPES)), minutes: clamp(2, 60) },
    swing: clamp(0, 0.6),
    sectionTone: bool,
    drums: { style: oneOf(Object.keys(DRUM_STYLES)), activity: clamp(0, 1), variation: clamp(0, 1), sprinkle: clamp(0, 1), kit: oneOf(Object.keys(DRUM_KITS)) },
    drumKit: {
        room: clamp(0, 0.5),
        ...Object.fromEntries(DRUMS.map((name) => [name, {
            on: bool,
            ...Object.fromEntries(Object.entries(DRUM_PARAMS).map(([key, { min, max }]) => [key, clamp(min, max)])),
        }])),
    },
    muted: Object.fromEntries(Object.keys(ROLE_VOLUMES).map((role) => [role, bool])),
    counter: { mode: oneOf(Object.keys(COUNTER_MODES)), activity: clamp(0, 1) },
    sections: { mode: oneOf(Object.keys(SECTION_MODES)), phrases: oneOf(SECTION_LENGTHS) },
    ambience: Object.fromEntries(Object.keys(AMBIENCE_LAYERS).map((id) => [id, clamp(0, 1)])),
    ambienceShape: Object.fromEntries(Object.keys(AMBIENCE_LAYERS).map((id) => [id, Object.fromEntries([
        ...Object.keys(LAYER_PARAMS[id]).map((key) => [key, clamp(0, 1)]),
        ...Object.entries(COMMON_PARAMS).map(([key, { min, max }]) => [key, clamp(min, max)]),
    ])])),
    ambienceVolume: clamp(0, 1),
    playMusic: bool,
    playAmbience: bool,
    volumes: Object.fromEntries(Object.keys(ROLE_VOLUMES).map((role) => [role, clamp(0, 1)])),
    pulseWeights: Object.fromEntries(Object.keys(DEFAULT_PULSE_WEIGHTS).map((id) => [id, clamp(0, 100)])),
    arpWeights: Object.fromEntries(Object.keys(DEFAULT_ARP_WEIGHTS).map((id) => [id, clamp(0, 100)])),
    padMotion: { lean: clamp(0, 1), fast: clamp(0, 1), swell: clamp(0, 0.2) },
    wander: {
        period: clamp(WANDER_LIMITS.period.min, WANDER_LIMITS.period.max),
        pan: { min: clamp(-1, 1), max: clamp(-1, 1) },
        volume: clamp(WANDER_LIMITS.volume.min, WANDER_LIMITS.volume.max),
        filter: clamp(WANDER_LIMITS.filter.min, WANDER_LIMITS.filter.max),
        pitch: clamp(WANDER_LIMITS.pitch.min, WANDER_LIMITS.pitch.max),
        voices: Object.fromEntries(WANDER_ROLES.map((role) => [role, bool])),
        mode: oneOf(Object.keys(WANDER_MODES)),
    },
    ambienceWander: {
        mode: oneOf(Object.keys(WANDER_MODES)),
        total: clamp(AMBIENCE_WANDER_LIMITS.total.min, AMBIENCE_WANDER_LIMITS.total.max),
        layers: clamp(AMBIENCE_WANDER_LIMITS.layers.min, AMBIENCE_WANDER_LIMITS.layers.max),
        period: clamp(AMBIENCE_WANDER_LIMITS.period.min, AMBIENCE_WANDER_LIMITS.period.max),
    },
    bus: BUS_RULES,
    seed: int(0, 2 ** 31),
};

function sanitize(raw, rules, defaults) {
    const out = {};
    Object.entries(rules).forEach(([key, rule]) => {
        const value = raw && typeof raw === 'object' ? raw[key] : undefined;
        if (typeof rule === 'function') {
            const valid = value === undefined ? undefined : rule(value);
            out[key] = valid === undefined ? defaults[key] : valid;
        } else {
            out[key] = sanitize(value, rule, defaults[key]);
        }
    });
    return out;
}

/** Untrusted object -> complete, valid settings (defaults fill the gaps). */
export function sanitizeSettings(raw, defaults = defaultSettings()) {
    const settings = sanitize(raw, RULES, defaults);
    // the pan range's ends in order
    const { min, max } = settings.wander.pan;
    if (min > max) settings.wander.pan = { min: max, max: min };
    return settings;
}

// Links made before shareCode.js: base64url of JSON.
const fromBase64Url = (code) => decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/'))));

// What a link's unchanged values mean. Fixed per format: when the
// defaults for new visits change, links made before must still read the
// same. s= links (version 1) predate sections being on by default; m= / v=
// / a= links (version 2) read against today's defaults - change one, and
// freeze the old value here.
function legacyBaseline() {
    return { ...defaultSettings(), sections: { ...DEFAULT_SECTIONS } };
}
const PARTS = ['m', 'v', 'a', 'x'];

/**
 * Settings (+ role -> built-in preset name) -> short URL-safe string.
 * @param {object} settings
 * @param {object} [presets] - names that aren't built-in presets are left out
 */
export function encodeSettings(settings, presets = {}, { seed = true } = {}) {
    const parts = encodeShareParts(settings, defaultSettings(), presets, { seed });
    // the bus, classic / DIY voices ({ external: ref }), edited sounds ({ edit }) and a drum machine (perc: { machine: ref }): shareExtras.js
    const sounds = Object.fromEntries(Object.entries(presets).filter(([, p]) => p?.external).map(([role, p]) => [role, p.external]));
    const edits = Object.fromEntries(Object.entries(presets).filter(([, p]) => p?.edit).map(([role, p]) => [role, p.edit]));
    const x = encodeExtras({ bus: settings.bus, sounds, machine: presets.perc?.machine ?? null, edits });
    if (x) parts.x = x;
    return PARTS.filter((key) => parts[key]).map((key) => `${key}=${parts[key]}`).join('&');
}

/**
 * URL-safe string -> { settings (valid), presets (role -> name) }, or null
 * if it can't be read at all.
 */
export function decodeShare(code) {
    try {
        if (code.includes('=')) {
            const query = new URLSearchParams(code);
            const { settings, presets } = decodeShareParts(Object.fromEntries(PARTS.map((key) => [key, query.get(key)])), defaultSettings());
            if (query.get('x')) {
                const extras = decodeExtras(query.get('x'));
                if (extras.bus) settings.bus = extras.bus;
                Object.entries(extras.sounds).forEach(([role, ref]) => { presets[role] = { external: ref }; });
                if (extras.machine) presets.perc = { machine: extras.machine };
                Object.entries(extras.edits).forEach(([role, edit]) => { presets[role] = { edit }; });
            }
            return { settings: sanitizeSettings(settings), presets };
        }
        if (code.startsWith('eyJ')) return { settings: sanitizeSettings(JSON.parse(fromBase64Url(code))), presets: {} };
        const { settings, presets } = decodeShareCode(code, legacyBaseline());
        return { settings: sanitizeSettings(settings), presets };
    } catch (e) {
        return null;
    }
}

/** URL-safe string -> valid settings, or null if it can't be read at all. */
export function decodeSettings(code) {
    const share = decodeShare(code);
    return share && share.settings;
}

// The `s` query parameter, or - for links made while this lived inside
// unCAGED - the `s` parameter of a #/generative?s= hash.
const codeFromLocation = ({ search = '', hash = '' }) => new URLSearchParams(search).get('s')
    || new URLSearchParams(hash.split('?')[1] || '').get('s');

/**
 * { settings, presets } from a share link, or null when there is none or
 * it can't be read. A `phrase=` parameter (words, e.g. ?phrase=rainy+sunday)
 * sets the seed - over a link's own, or on the defaults - and comes back
 * as `phrase`.
 */
export function shareFromLocation(location) {
    const query = new URLSearchParams(location.search || '');
    let share = null;
    if (PARTS.some((key) => query.has(key))) {
        share = decodeShare(PARTS.filter((key) => query.has(key)).map((key) => `${key}=${query.get(key)}`).join('&'));
    } else {
        const code = codeFromLocation(location);
        share = code ? decodeShare(code) : null;
    }
    if (share || query.has('generation')) {
        share = share || { settings: defaultSettings(), presets: {} };
        share = { ...share, settings: { ...share.settings, generation: generationFromSearch(location.search) } };
    }
    const phrase = query.get('phrase');
    const seed = phrase ? phraseToSeed(phrase) : null;
    if (seed === null) return share;
    const base = share || { settings: defaultSettings(), presets: {} };
    return { ...base, settings: { ...base.settings, seed }, phrase };
}

/** Settings from a share link, or null. */
export function settingsFromLocation(location) {
    const share = shareFromLocation(location);
    return share && share.settings;
}

/**
 * Path + query for the current page. For the address bar the seed is left
 * out ({ seed: false }): a reload keeps the settings but makes a new piece.
 */
export function sharePath(settings, presets, location = window.location, { seed = true } = {}) {
    return withPercussion(withMediaHelper(withPerf(withFMBank(withSimd(withAudioEngine(withGeneration(`${location.pathname}?${encodeSettings(settings, presets, { seed })}`, settings.generation),engineFromSearch(location.search)),simdFromSearch(location.search)),bankFromSearch(location.search)),perfFromSearch(location.search)??readPerfChoice()),mediaHelperFromSearch(location.search)),percussionFromSearch(location.search));
}

/** Full share URL for the current page and settings. */
export function shareUrl(settings, presets, location = window.location) {
    return `${location.origin}${sharePath(settings, presets, location)}`;
}
