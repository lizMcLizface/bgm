// Piano tuning: a temperament (how the twelve notes of an octave divide it), centred on a key,
// plus the stretch a real piano is tuned with (its stiff strings make partials sharp, so tuners
// widen the octaves) and the scatter of an instrument that has not been tuned for a while.
// Everything is a deviation in cents from twelve-tone equal temperament at the reference A,
// so the tonic keeps its equal-tempered pitch and the other notes move around it.
const PYTHAGOREAN_COMMA = 23.460010;
const SYNTONIC_COMMA = 21.506290;
const PURE_FIFTH = 701.955001;

/** A just interval in cents. */
const cents = (num, den) => 1200 * Math.log2(num / den);

// Ratios over the tonic for each semitone above it (5-limit "Ptolemaic" just intonation).
const JUST = [[1, 1], [16, 15], [9, 8], [6, 5], [5, 4], [4, 3], [45, 32], [3, 2], [8, 5], [5, 3], [9, 5], [15, 8]];

/**
 * A circle-of-fifths temperament as cents over the tonic for each semitone. `narrow` lists how
 * much each of the eleven fifths of the chain Eb-Bb-F-C-G-D-A-E-B-F#-C#-G# (tonic C) is made
 * smaller than pure; the twelfth fifth, G#-Eb, takes whatever closes the circle.
 */
function circle(narrow) {
    const fifths = Array.from({ length: 11 }, (_, i) => PURE_FIFTH - (narrow[i] ?? 0));
    const raw = new Array(12).fill(0);
    // The chain starts at Eb (3 semitones above C); each fifth lifts the pitch class by 7.
    let size = 0;
    for (let i = 0; i < 12; i++) {
        raw[(3 + 7 * i) % 12] = size;
        size += fifths[i] ?? 0;
    }
    // Measured from C, folded into the octave above it.
    return raw.map((c) => (((c - raw[0]) % 1200) + 1200) % 1200);
}
const fifthsOf = (names, amount) => {
    const chain = ['Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
    return chain.map((_, i) => (names.includes(`${chain[i]}-${['Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#'][i]}`) ? amount : 0));
};

/** Cents above the tonic of each semitone, by name. */
const TABLES = {
    equal: Array.from({ length: 12 }, (_, i) => i * 100),
    just: JUST.map(([n, d]) => cents(n, d)),
    pythagorean: circle([]),
    // Quarter-comma meantone: eight pure thirds, the fifths 1/4 syntonic comma narrow.
    meantone: circle(Array(11).fill(SYNTONIC_COMMA / 4)),
    werckmeister: circle(fifthsOf(['C-G', 'G-D', 'D-A', 'B-F#'], PYTHAGOREAN_COMMA / 4)),
    kirnberger: circle(fifthsOf(['C-G', 'G-D', 'D-A', 'A-E'], SYNTONIC_COMMA / 4)),
    vallotti: circle(fifthsOf(['F-C', 'C-G', 'G-D', 'D-A', 'A-E', 'E-B'], PYTHAGOREAN_COMMA / 6)),
    young: circle(fifthsOf(['C-G', 'G-D', 'D-A', 'A-E', 'E-B', 'B-F#'], PYTHAGOREAN_COMMA / 6)),
};

export const TEMPERAMENTS = {
    equal: 'Equal',
    vallotti: 'Vallotti',
    young: 'Young',
    werckmeister: 'Werckmeister III',
    kirnberger: 'Kirnberger III',
    meantone: 'Quarter-comma meantone',
    pythagorean: 'Pythagorean',
    just: 'Just intonation',
};
export const TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo));
const tonicIndex = (tonic) => (typeof tonic === 'number' ? ((Math.round(tonic) % 12) + 12) % 12 : Math.max(0, TONICS.indexOf(tonic)));

/** The temperament's offset from equal temperament, in cents, for each pitch class (0 = C), centred on `tonic`. */
export function temperamentOffsets(temperament = 'equal', tonic = 0) {
    const table = TABLES[Object.hasOwn(TABLES, temperament) ? temperament : 'equal'], key = tonicIndex(tonic);
    // The table is relative to its tonic; rotate it so any key can be the centre, then express as
    // deviations from equal temperament at the same semitone (so the tonic is unmoved).
    return Array.from({ length: 12 }, (_, pc) => {
        const above = (pc - key + 12) % 12;
        return table[above] - above * 100;
    });
}

/**
 * Stretch, in cents at a MIDI note, for a full stretch of 1: flat in the bass and sharp in the
 * treble, nothing between C3 and A4. The treble is cubic (about 30 cents at the top, as Railsback
 * measured); the bass falls faster, about 40 cents flat at C1, as seen in recordings of a grand and
 * a house piano.
 */
export function stretchCents(midi) {
    const x = midi - 69;
    if (x >= 0) return 30 * (x / 39) ** 3;
    return midi >= 48 ? 0 : -40 * ((48 - midi) / 24) ** 2;
}

// A hash of a note and a seed in [-1, 1], stable across runs: a mistuned note stays mistuned.
function scatter(midi, seed) {
    let h = Math.imul((midi | 0) + 1, 0x9e3779b1) ^ Math.imul((seed | 0) + 7, 0x85ebca6b);
    h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
    return ((h >>> 0) / 4294967296) * 2 - 1;
}

/** Whether a set of piano options asks for anything but plain equal temperament at 440 Hz. */
export const isTempered = ({ temperament = 'equal', stretch = 0, wear = 0, a4 = 440 } = {}) =>
    temperament !== 'equal' || stretch > 0 || wear > 0 || Math.abs(a4 - 440) > 1e-9;

/** How far a note is from equal temperament at 440 Hz, in cents, under these tuning options. */
export function tuningCents(midi, { temperament = 'equal', tonic = 0, a4 = 440, stretch = 0, wear = 0, seed = 1 } = {}) {
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    const offsets = temperamentOffsets(temperament, tonic);
    // A worn piano scatters by a few cents per note and sags a little flat overall; both are
    // properties of that note on that piano, so they follow the seed, not the performance.
    const worn = clamp(wear, 0, 1) * (scatter(midi, seed) * 9 - 3);
    return offsets[pc] + clamp(stretch, 0, 1.5) * stretchCents(midi) + worn + 1200 * Math.log2(clamp(a4, 380, 480) / 440);
}

/** The frequency this piano sounds a (possibly fractional) MIDI note at. */
export function tunedFrequency(midi, options = {}) {
    const whole = Math.round(midi), fine = midi - whole;
    return 440 * 2 ** ((whole - 69 + fine) / 12 + tuningCents(whole, options) / 1200);
}
