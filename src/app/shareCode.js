// Compact share codes: settings (and built-in presets per role) packed
// into bits, then base64url - typically 10-45 characters instead of the
// hundreds a JSON encoding takes.
//
// A link has up to three parts, so its length follows what was changed:
// m= the music (always: it holds the seed), v= the voices (sounds,
// volumes, registers), a= the ambience. A part that is all defaults is left
// out. Links from before the split used a single s= code (version 1,
// LAYOUT below); they still open.
//
// Every value is stored as an index into what its control can show:
// sliders by their step, selects by option. Values are grouped; a group
// costs one bit when it is all defaults, and inside a changed group each
// value costs one bit when it is its default. The seed is always stored.
//
// The layout is append-only: never reorder or remove a field, an option
// list (modes, meters, presets) or change a field's bit width - links in
// the wild would decode differently. A reader that runs out of bits takes
// the defaults, so fields appended later keep old links valid.

import { SCALE_FAMILIES, CHORD_COLOURS } from './theory';
import { METERS } from './meter';
import { DRIFT_MODES, TEMPO_BOUNDS, BPM_LIMITS } from './conductor';
import {
    OCTAVE_LIMITS, OCTAVE_WANDER, COUNTER_MODES, PEDAL_MODES, SPREADS, LEAD_SCALES, LEAD_ENDINGS, SECTION_MODES, SECTION_LENGTHS, DEFAULT_PULSE_WEIGHTS, DEFAULT_ARP_WEIGHTS, DEFAULT_DIRECTION_WEIGHTS,
} from './arranger';
import { AMBIENCE_LAYERS } from './engine/ambience';
import { LAYER_PARAMS } from './engine/ambienceSynth';
import { HARMONY_SCALES } from './composition/harmonyScale';
import { ARC_SHAPES } from './composition/arc';
import { ROLE_PRESETS } from './presets';
import { SEED_BITS as SOUND_SEED_BITS } from './soundGen';
import { GENERATOR_V2, KIND_CODES } from './soundGenV2';
import { GENERATOR_V3, SOUND_PROFILES, normalizeSoundContext } from './soundGenV3';
import PROGRESSIONS from './progressions';
import { DRUM_STYLES, DRUM_KITS, DRUMS, DRUM_PARAMS } from './percussion';
import { WANDER_ROLES, WANDER_LIMITS, WANDER_MODES, AMBIENCE_WANDER_LIMITS } from './engine/wander';

export const CODE_VERSION = 1;
const VERSION_BITS = 4;
const SEED_BITS = 31;

const MODES = SCALE_FAMILIES.flatMap((f) => f.modes.map((m) => m.id));
/**
 * Built-in presets a link can name, by index. Append new presets at the
 * end - never reorder or remove (a test checks every built-in is
 * listed).
 */
export const SHAREABLE_PRESETS = [
    'Soft Pad', 'Warm Strings', 'Glass Pad', 'Dark Drone', 'Breathy Choir', 'Swelling Analog',
    'Lo-fi Tape Pad', 'Shimmer', 'Velvet Pad', 'Morning Haze', 'Hollow Air', 'Slow Sweep', 'Warm Bass',
    'Sub Bass', 'Round Pluck Bass', 'Analog Saw Bass', 'Felt Bass', 'Soft Square Bass', 'Upright Pluck',
    'Rubber Bass', 'Deep Pulse', 'Muted Pick Bass', 'Glass Lead', 'Soft Flute', 'Warm Square Lead',
    'Bell Lead', 'Ocarina', 'Sine Whistle', 'Clarinet Lead', 'Hollow Pulse', 'Soft Saw Lead', 'Celesta',
    'Soft Keys', 'Kalimba Pluck', 'Harp Pluck', 'Music Box', 'Warm Organ', 'Tine Keys', 'Pitched Rain',
    'Wind Pad', 'Bit Haze', 'Dreary', 'Happy Little Squares', 'LoFi Space', 'Growl Bass',
    'Distorted Strings', 'Rain Drops', 'Analog', 'Wavy Flute', 'Crunchy Waves', 'Chimes', 'Broken Toy',
    'Not Broken Toy', 'Breathing Pad', 'Choir Ah', 'Hollow Tremolo', 'FM Bass', 'Thump Bass', 'Reed Lead',
    'Organ Whistle', 'FM Rhodes', 'FM Bell', 'Felt Piano', 'Soft Marimba', 'Glass Mallet', 'Underwater',
    'Tremolo Organ',
    // the fast / game-style presets
    'Void Pad', 'Starlight Pad', 'Spore Haze', 'Heroic Strings', 'Drive Bass', 'Chip Bass', 'Deep Throb',
    'Racer Lead', 'Chip Lead', 'Fanfare Brass', 'Pan Flute', 'Squeezebox', 'Signal Lead', 'Arp Pluck',
    'Pixel Piano', 'Nylon Guitar', 'Soft Harp', 'Haunted Celesta',
    // film-synth presets
    'CS-80 Brass', 'Neon Saw Pad', 'Night Glass', 'Neon Pulse Bass', 'Seq Bass', 'Lament Lead', 'Ghost Sweep', 'Outrun Lead',
    // Original oscillator/FM keys, independently selectable in Latest.
    'Felt Piano (classic)', 'Soft Keys (classic)', 'Tine Keys (classic)', 'FM Rhodes (classic)',
    'Haunted Viola',
    'Neon Blues Lead',
    'Coastal FM Lead', 'Progressive Pluck',
    'Wasm Bowed Glass', 'Wasm Rosin Silk', 'Wasm Tine Keys', 'Wasm Glass Bells',
    'Wasm Air Choir', 'Wasm Drawbars', 'Wasm Soft Pipes', 'Wasm DCO Foundation', 'Wasm Round FM Bass',
    'Galaxy Arp', 'Nebula Lead',
    'Starmap Piano', 'Starmap Arp', 'Starmap Pulse', 'Starmap Void',
];
const PRESET_BITS = 8;
// Preset index meaning "a generated sound" (soundGen.js v1): followed by
// the role it was made for and its seed.
const GENERATED_V1 = 2 ** PRESET_BITS - 1;
// ... and a voice of a generated ensemble (soundGen.js, ensemble v1):
// followed by its role and the ensemble's seed.
const ENSEMBLE_V1 = 2 ** PRESET_BITS - 2;
// Version 2 (soundGenV2.js): a generated sound - role, kind, seed - and a
// voice of a v2 ensemble - role, ensemble seed.
const GENERATED_V2 = 2 ** PRESET_BITS - 3;
const ENSEMBLE_V2 = 2 ** PRESET_BITS - 4;
const GENERATED_V3 = 2 ** PRESET_BITS - 5;
const ENSEMBLE_V3 = 2 ** PRESET_BITS - 6;
const KIND_BITS = 3;
// Fixed role order in codes (independent of the UI's order); also the
// index a generated sound stores for the role it was made for.
export const CODE_ROLES = ['pad', 'bass', 'lead', 'counter'];

const bitsFor = (count) => Math.max(1, Math.ceil(Math.log2(count)));
const clampIndex = (i, count) => Math.max(0, Math.min(count - 1, i));

// Codecs: { bits, toIndex(value), fromIndex(index) }.
const options = (list, bits = bitsFor(list.length)) => ({
    bits,
    toIndex: (v) => Math.max(0, list.indexOf(v)),
    fromIndex: (i) => list[clampIndex(i, list.length)],
});
const stepped = (lo, hi, step) => {
    const count = Math.round((hi - lo) / step) + 1;
    return {
        bits: bitsFor(count),
        toIndex: (v) => clampIndex(Math.round((v - lo) / step), count),
        fromIndex: (i) => Number((lo + clampIndex(i, count) * step).toFixed(6)),
    };
};
const bool = { bits: 1, toIndex: (v) => (v ? 1 : 0), fromIndex: (i) => i === 1 };
const tonicSet = {
    bits: 12,
    toIndex: (list) => list.reduce((mask, pc) => mask | (1 << pc), 0),
    fromIndex: (mask) => [...Array(12).keys()].filter((pc) => mask & (1 << pc)),
};
// Variable length: a count, then that many mode indices.
const modeList = {
    write: (w, list) => {
        const ids = list.filter((id) => MODES.includes(id)).slice(0, 63);
        w.write(ids.length, 6);
        ids.forEach((id) => w.write(MODES.indexOf(id), 6));
    },
    read: (r) => Array.from({ length: r.read(6) }, () => MODES[r.read(6)]).filter(Boolean),
};

// A tempo above what the first tempo field holds (its top is TEMPO_BOUNDS):
// everything at or below counts as the default, so the field is only
// written when needed.
const wideTempo = {
    bits: 8,
    toIndex: (v) => (v > TEMPO_BOUNDS[1] ? clampIndex(Math.round(v) - BPM_LIMITS[0], BPM_LIMITS[1] - BPM_LIMITS[0] + 1) : 72 - BPM_LIMITS[0]),
    fromIndex: (i) => BPM_LIMITS[0] + clampIndex(i, BPM_LIMITS[1] - BPM_LIMITS[0] + 1),
};

const chance = stepped(0, 1, 0.05);
const level = chance;
const weight = stepped(0, 100, 5);
const voice = (role) => [
    [['voices', role, 'octave'], stepped(OCTAVE_LIMITS[role][0], OCTAVE_LIMITS[role][1], 1)],
    [['voices', role, 'wander'], options(Object.keys(OCTAVE_WANDER), 2)],
    [['voices', role, 'chance'], chance],
];

// [path, codec] per value, in groups. Append only (see top).
const GROUPS = [
    [
        [['tonic'], stepped(0, 11, 1)],
        [['mode'], options(MODES, 7)],
        [['bpm'], stepped(TEMPO_BOUNDS[0], TEMPO_BOUNDS[1], 1)],
        [['progression'], options([...PROGRESSIONS.keys()], 5)],
        [['barsPerChord'], options([1, 2, 4])],
        [['meter'], options(Object.keys(METERS), 4)],
    ],
    [
        [['leadActivity'], chance],
        [['padWeights', 'sustain'], weight],
        [['padWeights', 'pulse'], weight],
        [['padWeights', 'arpeggio'], weight],
        [['bassWeights', 'whole'], weight],
        [['bassWeights', 'half'], weight],
        [['bassWeights', 'walking'], weight],
        [['thinPadUnderLead'], bool],
        [['padNotes'], options([3, 4, 5])],
    ],
    [...voice('pad'), ...voice('bass'), ...voice('lead')],
    [
        [['drift', 'mode'], options(Object.keys(DRIFT_MODES), 2)],
        [['drift', 'keyChance'], chance],
        [['drift', 'modeChance'], chance],
        [['drift', 'progressionChance'], chance],
        [['drift', 'tempoChance'], chance],
        [['drift', 'tempoRange'], stepped(0, 20, 1)],
        [['drift', 'homePull'], chance],
        [['drift', 'pivot'], bool],
        [['drift', 'excludedTonics'], tonicSet],
        [['drift', 'excludedModes'], modeList],
    ],
    [
        [['humanize', 'timing'], stepped(0, 40, 1)],
        [['humanize', 'velocity'], stepped(0, 0.25, 0.01)],
        [['humanize', 'detune'], stepped(0, 15, 0.5)],
    ],
];

// Fields added later, written after the first roles' presets.
const LATER_GROUPS = [
    [
        [['counter', 'mode'], options(Object.keys(COUNTER_MODES), 2)],
        [['counter', 'activity'], chance],
        ...voice('counter'),
    ],
    [
        [['sections', 'mode'], options(Object.keys(SECTION_MODES), 2)],
        [['sections', 'phrases'], options(SECTION_LENGTHS, 2)],
    ],
    [...Object.keys(AMBIENCE_LAYERS).map((id) => [['ambience', id], level]), [['ambienceVolume'], level]],
    [[['playMusic'], bool], [['playAmbience'], bool]],
    CODE_ROLES.map((role) => [['volumes', role], stepped(0, 1, 0.01)]),
];

// The order of a version 1 (s=) code: version, seed, GROUPS, presets of the
// first three roles, LATER_GROUPS, the second lead's preset. Frozen: these
// are only read now.
const LAYOUT = [
    ['groups', GROUPS],
    ['presets', CODE_ROLES.slice(0, 3)],
    ['groups', LATER_GROUPS],
    ['presets', CODE_ROLES.slice(3)],
];

// --- version 2: m= / v= / a= ---------------------------------------------
// Each part is append-only on its own (see top). The music part starts with
// the version and the seed.

export const PARTS_VERSION = 2;
// The same, without the seed: the address bar's copy of the settings, so
// a reload keeps them but makes a new piece (only a shared link, version
// 2, pins the piece).
export const PARTS_VERSION_SEEDLESS = 3;
const field = (groups, path) => groups.flat().find(([p]) => p.join() === path.join());

const MUSIC_GROUPS = [
    GROUPS[0], // key, mode, tempo, progression, bars per chord, meter
    GROUPS[1].filter(([path]) => path[0] !== 'padNotes'), // arrangement
    GROUPS[3], // drift
    GROUPS[4], // feel
    LATER_GROUPS[0].slice(0, 2), // second lead
    LATER_GROUPS[1], // sections
    [ // feel and percussion (docs/DESIGN.md §9 C)
        [['swing'], stepped(0, 0.6, 0.05)],
        [['sectionTone'], bool],
        [['drums', 'style'], options(Object.keys(DRUM_STYLES).slice(0,8), 3)],
        [['drums', 'activity'], chance],
        [['drums', 'variation'], chance],
    ],
    [ // how the pad plays its styles
        ...Object.keys(DEFAULT_PULSE_WEIGHTS).map((id) => [['pulseWeights', id], weight]),
        ...Object.keys(DEFAULT_ARP_WEIGHTS).map((id) => [['arpWeights', id], weight]),
        [['padMotion', 'lean'], chance],
        [['padMotion', 'fast'], chance],
        [['padMotion', 'swell'], stepped(0, 0.2, 0.01)],
    ],
    [[['drums', 'sprinkle'], chance]], // colour scattered over the drums
    [ // the styles added with the faster presets
        [['padWeights', 'sequence'], weight],
        [['bassWeights', 'drive'], weight],
    ],
    [[['leadDensity'], chance]], // how busy the lead's rhythms are
    [[['drums', 'kit'], options(Object.keys(DRUM_KITS), 2)]], // append-only whole-kit voice IDs (felt, crisp, tr808, hand)
    [[['bpm'], wideTempo]], // tempos past the first field's range (a tempo inside it is left to that field)
    [[['chordColour', 'mode'], options(Object.keys(CHORD_COLOURS), 3)], [['chordColour', 'amount'], chance]], // suspended and added-note chords
    [ // the rest of the colour layer
        [['chordBorrow'], chance],
        [['chordSpread'], options(Object.keys(SPREADS), 1)],
        [['pedal', 'mode'], options(Object.keys(PEDAL_MODES), 2)],
        [['pedal', 'amount'], chance],
        [['leadScale'], options(Object.keys(LEAD_SCALES), 1)],
        [['leadLeaps'], chance],
        [['leadRepeat'], chance],
        [['leadEnding'], options(Object.keys(LEAD_ENDINGS), 1)],
    ],
    [ // the chord styles added for variety
        [['padWeights', 'rolled'], weight],
        [['padWeights', 'stacked'], weight],
        ...Object.keys(DEFAULT_DIRECTION_WEIGHTS).map((id) => [['directionWeights', id], weight]),
    ],
    [[['harmonyScale'], options(Object.keys(HARMONY_SCALES), 2)]], // append-only: independent harmonic scale
];
// Appended after every earlier music field; old links keep tonal defaults.
MUSIC_GROUPS.push([[['tonality','mode'],options(['tonal','atonal','bitonal'],2)],[['tonality','separation'],stepped(1,11,1)]]);
// The released style field is exactly three bits. Append the expanded enum
// after every existing music field; never widen or move the old field.
MUSIC_GROUPS.push([[['drums','style'],options(Object.keys(DRUM_STYLES),4)]]);
// How the scene plays (composition/dynamics.js); old links play as before.
// Rubato at cadences (composition/rubato.js).
MUSIC_GROUPS.push([[['rubato'],stepped(0,1,.05)]]);
MUSIC_GROUPS.push([[['ornaments'],stepped(0,1,.05)]]); // composition/ornaments.js
MUSIC_GROUPS.push([[['ducking'],stepped(0,1,.05)]]); // engine/ducking.js
MUSIC_GROUPS.push([[['evenLoudness'],stepped(0,1,.05)]]); // composition/loudness.js
MUSIC_GROUPS.push([[['sectionSpace'],stepped(0,1,.05)]]); // composition/sectionSpace.js
MUSIC_GROUPS.push([[['keyLift'],stepped(0,1,.05)]]); // key lifts (Generator.planBar)
MUSIC_GROUPS.push([[['arc','shape'],options(Object.keys(ARC_SHAPES),2)],[['arc','minutes'],stepped(2,60,1)]]); // composition/arc.js
MUSIC_GROUPS.push([[['timbreDrift'],stepped(0,1,.05)]]); // composition/timbreDrift.js
MUSIC_GROUPS.push([[['dynamics','level'],stepped(.6,1.2,.05)],[['dynamics','range'],stepped(0,2,.05)],[['dynamics','attack'],stepped(0,1,.05)],[['dynamics','brightness'],stepped(0,1,.05)]]);
const VOICE_GROUPS = [
    [...voice('pad'), ...voice('bass'), ...voice('lead'), ...voice('counter'), field(GROUPS, ['padNotes'])],
    LATER_GROUPS[4], // volumes
];
// The voice part goes on after the presets: groups, then each role's
// preset, then these (appended later - inserting them before the presets
// would move the presets' bits in older links).
const drumGroup = (name) => [
    [['drumKit', name, 'on'], bool],
    ...Object.entries(DRUM_PARAMS).map(([key, { min, max, step }]) => [['drumKit', name, key], stepped(min, max, step)]),
];
const VOICE_LATER_GROUPS = [
    [[['volumes', 'perc'], stepped(0, 1, 0.01)], [['drumKit', 'room'], stepped(0, 0.5, 0.05)]], // percussion
    // the kit, per drum (the first six; later drums come after the mutes)
    ...DRUMS.slice(0, 6).map(drumGroup),
    // muted voices (solo isn't kept)
    [...CODE_ROLES, 'perc'].map((role) => [['muted', role], bool]),
    ...DRUMS.slice(6, 11).map(drumGroup),
    [ // slow wander (engine/wander.js)
        [['wander', 'period'], stepped(WANDER_LIMITS.period.min, WANDER_LIMITS.period.max, WANDER_LIMITS.period.step)],
        [['wander', 'pan', 'min'], stepped(-1, 1, WANDER_LIMITS.pan.step)],
        [['wander', 'pan', 'max'], stepped(-1, 1, WANDER_LIMITS.pan.step)],
        [['wander', 'volume'], stepped(WANDER_LIMITS.volume.min, WANDER_LIMITS.volume.max, WANDER_LIMITS.volume.step)],
        [['wander', 'filter'], stepped(WANDER_LIMITS.filter.min, WANDER_LIMITS.filter.max, WANDER_LIMITS.filter.step)],
        [['wander', 'pitch'], stepped(WANDER_LIMITS.pitch.min, WANDER_LIMITS.pitch.max, WANDER_LIMITS.pitch.step)],
        ...WANDER_ROLES.map((role) => [['wander', 'voices', role], bool]),
    ],
    ...DRUMS.slice(11).map(drumGroup), // the crisp drums, added after the wander
    [[['wander', 'mode'], options(Object.keys(WANDER_MODES), 1)]], // random-walk wander, added last
];
const shapeCodec = (key, spec) => {
    if (key === 'pan') return stepped(-1, 1, 0.1);
    if (key === 'width' || spec.render) return stepped(0, 1, 0.1);
    return stepped(0, 1, 0.05);
};
const AMBIENCE_GROUPS = [
    LATER_GROUPS[2], // levels, volume
    LATER_GROUPS[3], // what Play starts
    // each layer's shape (engine/ambienceSynth.js): its own params, then distance, pan, width
    ...Object.keys(AMBIENCE_LAYERS).map((id) => [...Object.entries(LAYER_PARAMS[id]), ['distance', {}], ['pan', {}], ['width', {}]]
        .map(([key, spec]) => [['ambienceShape', id, key], shapeCodec(key, spec)])),
    [ // the bed's slow wander, added last
        [['ambienceWander', 'mode'], options(Object.keys(WANDER_MODES), 1)],
        [['ambienceWander', 'total'], stepped(AMBIENCE_WANDER_LIMITS.total.min, AMBIENCE_WANDER_LIMITS.total.max, AMBIENCE_WANDER_LIMITS.total.step)],
        [['ambienceWander', 'layers'], stepped(AMBIENCE_WANDER_LIMITS.layers.min, AMBIENCE_WANDER_LIMITS.layers.max, AMBIENCE_WANDER_LIMITS.layers.step)],
        [['ambienceWander', 'period'], stepped(AMBIENCE_WANDER_LIMITS.period.min, AMBIENCE_WANDER_LIMITS.period.max, AMBIENCE_WANDER_LIMITS.period.step)],
    ],
];

class BitWriter {
    constructor() {
        this.bits = [];
    }

    write(value, count) {
        for (let i = count - 1; i >= 0; i--) this.bits.push(Math.floor(value / 2 ** i) % 2);
    }

    toBase64Url() {
        const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        // drop trailing zeros: a reader takes missing bits as 0
        const bits = this.bits.slice(0, this.bits.lastIndexOf(1) + 1);
        let out = '';
        for (let i = 0; i < bits.length; i += 6) {
            const chunk = bits.slice(i, i + 6);
            while (chunk.length < 6) chunk.push(0);
            out += ALPHABET[chunk.reduce((n, b) => n * 2 + b, 0)];
        }
        return out;
    }
}

class BitReader {
    constructor(code) {
        const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        this.bits = [];
        [...code].forEach((ch) => {
            const v = ALPHABET.indexOf(ch);
            if (v < 0) throw new Error('Not a share code');
            for (let i = 5; i >= 0; i--) this.bits.push((v >> i) & 1);
        });
        this.pos = 0;
    }

    read(count) {
        let value = 0;
        for (let i = 0; i < count; i++) value = value * 2 + (this.bits[this.pos++] || 0);
        return value;
    }
}

const get = (obj, path) => path.reduce((o, key) => (o == null ? undefined : o[key]), obj);
const set = (obj, path, value) => {
    const last = path[path.length - 1];
    const parent = path.slice(0, -1).reduce((o, key) => {
        if (!o[key] || typeof o[key] !== 'object') o[key] = {};
        return o[key];
    }, obj);
    parent[last] = value;
};

const same = (codec, a, b) => (codec.write
    ? JSON.stringify(a) === JSON.stringify(b)
    : codec.toIndex(a) === codec.toIndex(b));

/**
 * @param {object} settings - complete, valid settings
 * @param {object} defaults - what unchanged values are compared with
 * @param {object} [presets] - role -> a built-in preset name, or
 *   { generated: { role, seed } } for a generated sound; anything else, and
 *   each role's default, is left out
 * @returns {string} base64url code
 */
export function encodeShareCode(settings, defaults, presets = {}) {
    const w = new BitWriter();
    w.write(CODE_VERSION, VERSION_BITS);
    w.write(settings.seed, SEED_BITS);
    LAYOUT.forEach(([kind, part]) => (kind === 'groups' ? writeGroups(w, part, settings, defaults) : writePresets(w, part, presets)));
    return w.toBase64Url();
}

function writeGroups(w, groups, settings, defaults) {
    groups.forEach((fields) => {
        const changed = fields.map(([path, codec]) => !same(codec, get(settings, path), get(defaults, path)));
        w.write(changed.some(Boolean) ? 1 : 0, 1);
        if (!changed.some(Boolean)) return;
        fields.forEach(([path, codec], i) => {
            w.write(changed[i] ? 1 : 0, 1);
            if (!changed[i]) return;
            if (codec.write) codec.write(w, get(settings, path));
            else w.write(codec.toIndex(get(settings, path)), codec.bits);
        });
    });
}

function writePresets(w, roles, presets) {
    roles.forEach((role) => {
        const preset = presets[role];
        const generated = preset && preset.generated;
        const index = preset === ROLE_PRESETS[role] ? -1 : SHAREABLE_PRESETS.indexOf(preset);
        w.write(index >= 0 || generated ? 1 : 0, 1);
        if (generated) {
            const ensemble = generated.ensemble !== undefined;
            const v2 = generated.version === GENERATOR_V2;
            const v3 = generated.version === GENERATOR_V3;
            w.write(v3 ? (ensemble ? ENSEMBLE_V3 : GENERATED_V3) : v2 ? (ensemble ? ENSEMBLE_V2 : GENERATED_V2) : (ensemble ? ENSEMBLE_V1 : GENERATED_V1), PRESET_BITS);
            w.write(CODE_ROLES.indexOf(generated.role), 2);
            if ((v2 || v3) && !ensemble) w.write(Math.max(0, KIND_CODES.indexOf(generated.kind)), KIND_BITS);
            w.write(ensemble ? generated.ensemble : generated.seed, SOUND_SEED_BITS);
            if (v3) {
                const context = normalizeSoundContext(generated);
                w.write(SOUND_PROFILES.indexOf(context.profile), 4);
                w.write(context.bpm, 9);
                w.write(Math.round(context.gate * 20), 8);
                w.write(context.register, 7);
            }
        } else if (index >= 0) {
            w.write(index, PRESET_BITS);
        }
    });
}

function readGroups(r, groups, settings) {
    groups.forEach((fields) => {
        if (!r.read(1)) return;
        fields.forEach(([path, codec]) => {
            if (!r.read(1)) return;
            set(settings, path, codec.read ? codec.read(r) : codec.fromIndex(r.read(codec.bits)));
        });
    });
}

function readPresets(r, roles, presets) {
    roles.forEach((role) => {
        if (!r.read(1)) return;
        const index = r.read(PRESET_BITS);
        if (index === GENERATED_V1 || index === ENSEMBLE_V1) {
            const madeFor = CODE_ROLES[r.read(2)];
            const seed = r.read(SOUND_SEED_BITS);
            if (madeFor) presets[role] = { generated: index === ENSEMBLE_V1 ? { role: madeFor, ensemble: seed } : { role: madeFor, seed } };
        } else if (index === GENERATED_V3 || index === ENSEMBLE_V3) {
            const madeFor = CODE_ROLES[r.read(2)];
            const kind = index === GENERATED_V3 ? KIND_CODES[r.read(KIND_BITS)] : undefined;
            const seed = r.read(SOUND_SEED_BITS);
            const context = normalizeSoundContext({ role: madeFor, profile: SOUND_PROFILES[r.read(4)], bpm: r.read(9), gate: r.read(8) / 20, register: r.read(7) });
            if (madeFor) presets[role] = { generated: { role: madeFor, ...(index === ENSEMBLE_V3 ? { ensemble: seed } : { seed, kind }), version: GENERATOR_V3, ...context } };
        } else if (index === GENERATED_V2 || index === ENSEMBLE_V2) {
            const madeFor = CODE_ROLES[r.read(2)];
            const kind = index === GENERATED_V2 ? KIND_CODES[r.read(KIND_BITS)] : undefined;
            const seed = r.read(SOUND_SEED_BITS);
            if (madeFor) {
                presets[role] = {
                    generated: index === ENSEMBLE_V2
                        ? { role: madeFor, ensemble: seed, version: GENERATOR_V2 }
                        : { role: madeFor, seed, kind, version: GENERATOR_V2 },
                };
            }
        } else if (SHAREABLE_PRESETS[index]) {
            presets[role] = SHAREABLE_PRESETS[index];
        }
    });
}

/**
 * @returns {{ settings: object, presets: object }} settings (unsanitized:
 *   run them through sanitizeSettings) and, for the roles whose preset
 *   isn't their default, role -> preset name or { generated: { role, seed } }
 * @throws on anything that isn't a code of this version
 */
export function decodeShareCode(code, defaults) {
    const r = new BitReader(code);
    if (r.read(VERSION_BITS) !== CODE_VERSION) throw new Error('Unknown share code version');
    const settings = JSON.parse(JSON.stringify(defaults));
    settings.seed = r.read(SEED_BITS);
    const presets = {};
    LAYOUT.forEach(([kind, part]) => (kind === 'groups' ? readGroups(r, part, settings) : readPresets(r, part, presets)));
    return { settings, presets };
}

/**
 * Settings (+ presets, as encodeShareCode) -> { m, v?, a? }: base64url
 * parts; v and a only when they hold anything but defaults.
 * @param {object} [options] - { seed: false } leaves the seed out
 */
export function encodeShareParts(settings, defaults, presets = {}, { seed = true } = {}) {
    const m = new BitWriter();
    m.write(seed ? PARTS_VERSION : PARTS_VERSION_SEEDLESS, VERSION_BITS);
    if (seed) m.write(settings.seed, SEED_BITS);
    writeGroups(m, MUSIC_GROUPS, settings, defaults);
    const v = new BitWriter();
    writeGroups(v, VOICE_GROUPS, settings, defaults);
    writePresets(v, CODE_ROLES, presets);
    writeGroups(v, VOICE_LATER_GROUPS, settings, defaults);
    const a = new BitWriter();
    writeGroups(a, AMBIENCE_GROUPS, settings, defaults);
    const parts = { m: m.toBase64Url() };
    if (v.toBase64Url()) parts.v = v.toBase64Url();
    if (a.toBase64Url()) parts.a = a.toBase64Url();
    return parts;
}

/**
 * { m, v, a } (missing parts: defaults) -> { settings, presets } as
 * decodeShareCode.
 * @throws on a music part of another version
 */
export function decodeShareParts({ m, v, a }, defaults) {
    const settings = JSON.parse(JSON.stringify(defaults));
    if (m) {
        const r = new BitReader(m);
        const version = r.read(VERSION_BITS);
        if (version !== PARTS_VERSION && version !== PARTS_VERSION_SEEDLESS) throw new Error('Unknown share code version');
        // seedless: the defaults' seed - a fresh random one
        if (version === PARTS_VERSION) settings.seed = r.read(SEED_BITS);
        readGroups(r, MUSIC_GROUPS, settings);
    }
    const presets = {};
    if (v) {
        const r = new BitReader(v);
        readGroups(r, VOICE_GROUPS, settings);
        readPresets(r, CODE_ROLES, presets);
        readGroups(r, VOICE_LATER_GROUPS, settings);
    }
    if (a) readGroups(new BitReader(a), AMBIENCE_GROUPS, settings);
    return { settings, presets };
}
