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
import { OCTAVE_LIMITS, OCTAVE_WANDER } from './arranger';
import { GENERATIVE_PRESETS, ROLE_PRESETS } from './presets';
import presetData from '../util/presetData';
import PROGRESSIONS from './progressions';

export const CODE_VERSION = 1;
const VERSION_BITS = 4;
const SEED_BITS = 31;

const MODES = SCALE_FAMILIES.flatMap((f) => f.modes.map((m) => m.id));
/** Presets a link can name: the generator's, then unCAGED's built-ins. */
export const SHAREABLE_PRESETS = [
    ...Object.keys(GENERATIVE_PRESETS),
    ...Object.keys(presetData).filter((name) => name !== '- INIT -'),
];
const PRESET_BITS = 8;
// Fixed role order in codes (independent of the UI's order).
export const CODE_ROLES = ['pad', 'bass', 'lead'];

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
 * @param {object} [presets] - role -> built-in preset name (others, and
 *   each role's default, are skipped)
 * @returns {string} base64url code
 */
export function encodeShareCode(settings, defaults, presets = {}) {
    const w = new BitWriter();
    w.write(CODE_VERSION, VERSION_BITS);
    w.write(settings.seed, SEED_BITS);
    GROUPS.forEach((fields) => {
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
    CODE_ROLES.forEach((role) => {
        const index = presets[role] === ROLE_PRESETS[role] ? -1 : SHAREABLE_PRESETS.indexOf(presets[role]);
        w.write(index >= 0 ? 1 : 0, 1);
        if (index >= 0) w.write(index, PRESET_BITS);
    });
    return w.toBase64Url();
}

/**
 * @returns {{ settings: object, presets: object }} settings (unsanitized:
 *   run them through sanitizeSettings) and role -> preset name, for the
 *   roles whose preset isn't their default
 * @throws on anything that isn't a code of this version
 */
export function decodeShareCode(code, defaults) {
    const r = new BitReader(code);
    if (r.read(VERSION_BITS) !== CODE_VERSION) throw new Error('Unknown share code version');
    const settings = JSON.parse(JSON.stringify(defaults));
    settings.seed = r.read(SEED_BITS);
    GROUPS.forEach((fields) => {
        if (!r.read(1)) return;
        fields.forEach(([path, codec]) => {
            if (!r.read(1)) return;
            set(settings, path, codec.read ? codec.read(r) : codec.fromIndex(r.read(codec.bits)));
        });
    });
    const presets = {};
    CODE_ROLES.forEach((role) => {
        if (!r.read(1)) return;
        const name = SHAREABLE_PRESETS[r.read(PRESET_BITS)];
        if (name) presets[role] = name;
    });
    return { settings, presets };
}
