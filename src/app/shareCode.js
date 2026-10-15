// Compact share codes: settings (and built-in presets per role) packed
// into bits, then base64url - typically 10-45 characters instead of the
// hundreds a JSON encoding takes.
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

import { SCALE_FAMILIES } from './theory';
import { METERS } from './meter';
import { DRIFT_MODES, TEMPO_BOUNDS } from './conductor';
import { OCTAVE_LIMITS, OCTAVE_WANDER, COUNTER_MODES, SECTION_MODES, SECTION_LENGTHS } from './arranger';
import { AMBIENCE_LAYERS } from './engine/ambience';
import { ROLE_PRESETS } from './presets';
import { SEED_BITS as SOUND_SEED_BITS } from './soundGen';
import PROGRESSIONS from './progressions';

export const CODE_VERSION = 1;
const VERSION_BITS = 4;
const SEED_BITS = 31;

const MODES = SCALE_FAMILIES.flatMap((f) => f.modes.map((m) => m.id));
/**
 * Built-in presets a link can name, by index. Append new presets at the
 * end - never reorder, rename or remove (a test checks every built-in is
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
    'Not Broken Toy',
];
const PRESET_BITS = 8;
// Preset index meaning "a generated sound" (soundGen.js v1): followed by
// the role it was made for and its seed.
const GENERATED_V1 = 2 ** PRESET_BITS - 1;
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
];

// The order of a code (append only): version, seed, GROUPS, presets of the
// first three roles, LATER_GROUPS, the second lead's preset.
const LAYOUT = [
    ['groups', GROUPS],
    ['presets', CODE_ROLES.slice(0, 3)],
    ['groups', LATER_GROUPS],
    ['presets', CODE_ROLES.slice(3)],
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
            w.write(GENERATED_V1, PRESET_BITS);
            w.write(CODE_ROLES.indexOf(generated.role), 2);
            w.write(generated.seed, SOUND_SEED_BITS);
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
        if (index === GENERATED_V1) {
            const madeFor = CODE_ROLES[r.read(2)];
            const seed = r.read(SOUND_SEED_BITS);
            if (madeFor) presets[role] = { generated: { role: madeFor, seed } };
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
