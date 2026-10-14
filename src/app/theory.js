// Pure music-theory helpers for the generator, in MIDI numbers and semitone
// offsets. src/theory/roman.js can't be used: it resolves against the UI's
// selected scale via src/scales/'s globals (docs/DESIGN.md §2.3).
// Only the scale *data* is shared.

import { HeptatonicScales } from '../scales/scaleTables';

const STEP_SEMITONES = { H: 1, W: 2, A: 3, P: 4 };
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/**
 * Every scale family the main page offers, each with its modes, keyed by
 * the main page's own scale ids ('Major-1' = Ionian, 'Major-7' = Locrian,
 * 'Harmonic Minor-5' = Phrygian Dominant, ...). Includes the Hexatonic and
 * Pentatonic families - see diatonicChord for how chords work there.
 */
export const SCALE_FAMILIES = Object.entries(HeptatonicScales).map(([family, modes]) => ({
    family,
    modes: modes.map(({ name, intervals }, i) => ({ id: `${family}-${i + 1}`, name, intervals })),
}));

const SCALES_BY_ID = new Map(SCALE_FAMILIES.flatMap(({ modes }) => modes.map((m) => [m.id, m])));

/** 'Major-2' -> { id, name: 'Dorian', intervals } */
export function scaleById(id) {
    const scale = SCALES_BY_ID.get(id);
    if (!scale) throw new Error(`Unknown scale id: ${id}`);
    return scale;
}

/** ['W','W','H',...] -> [0, 2, 4, 5, 7, 9, 11] */
export function scaleSemitones(intervals) {
    const semis = [0];
    for (let i = 0; i < intervals.length - 1; i++) {
        semis.push(semis[i] + STEP_SEMITONES[intervals[i]]);
    }
    return semis;
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const ACCIDENTAL = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// Signed semitone distance from a letter's natural pitch to pc, in -6..5.
const letterOffset = (letter, pc) => ((pc - LETTER_PC[letter]) % 12 + 18) % 12 - 6;

/** Key-picker labels: 'C', 'C♯/D♭', ... */
export const TONIC_NAMES = SHARP_NAMES.map((sharp, pc) => (sharp === FLAT_NAMES[pc] ? sharp : `${sharp}/${FLAT_NAMES[pc]}`));

/**
 * Note names for a scale. A 7-note scale gets one letter per degree (so C
 * Locrian is C D♭ E♭ F G♭ A♭ B♭, and exotic modes get their double
 * accidentals); the tonic's spelling (C♯ vs D♭) is whichever needs fewer
 * accidentals overall. Other sizes have no letter-per-degree rule, so they
 * use all-flat or all-sharp names, whichever the tonic needs fewer of.
 * @param {number} tonic - pitch class 0..11
 * @param {number[]} scale - from scaleSemitones
 * @returns {string[]} one name per degree
 */
export function spellScale(tonic, scale) {
    if (scale.length === 7) {
        let best = null;
        LETTERS.forEach((_, tonicLetter) => {
            if (Math.abs(letterOffset(tonicLetter, tonic)) > 1) return;
            const offsets = scale.map((s, i) => letterOffset((tonicLetter + i) % 7, (tonic + s) % 12));
            if (offsets.some((o) => Math.abs(o) > 2)) return;
            const cost = offsets.reduce((sum, o) => sum + Math.abs(o), 0);
            if (!best || cost < best.cost) {
                best = { cost, names: offsets.map((o, i) => LETTERS[(tonicLetter + i) % 7] + ACCIDENTAL[o]) };
            }
        });
        if (best) return best.names;
    }
    const pcs = scale.map((s) => (tonic + s) % 12);
    const count = (names) => pcs.filter((pc) => names[pc].length > 1).length;
    const flats = count(FLAT_NAMES);
    const sharps = count(SHARP_NAMES);
    // On a tie, spell like the tonic's major key (E♭ minor pentatonic, not D♯).
    const flatKey = flats === sharps && spellScale(tonic, [0, 2, 4, 5, 7, 9, 11]).some((n) => n.includes('♭'));
    const names = flats < sharps || flatKey ? FLAT_NAMES : SHARP_NAMES;
    return pcs.map((pc) => names[pc]);
}

/**
 * The numeral as the chord actually came out in this scale: lowercase for
 * a minor third, uppercase otherwise, with ° / + for diminished /
 * augmented. Progressions are written for their home mode, so 'vi' in
 * Locrian is a major chord and displays as 'VI'.
 */
export function displayNumeral(numeral, offsets) {
    const roman = numeral.toUpperCase();
    const suffix = chordSuffix(offsets);
    // a major seventh is written out (Imaj7); a plain 7 means a minor seventh
    const size = { 4: '7', 5: '9' }[offsets.length] || '';
    const extension = size && offsets[3] - offsets[0] === 11 ? `maj${size}` : size;
    if (suffix === '°') return `${roman.toLowerCase()}${offsets.length >= 4 && offsets[3] - offsets[0] === 10 ? 'ø' : '°'}${extension}`;
    if (suffix === '+') return `${roman}+${extension}`;
    return (offsets[1] - offsets[0] === 3 ? roman.toLowerCase() : roman) + extension;
}

/** 'vi' / 'VI' / 'IV' -> 6 / 6 / 4. Quality comes from the scale, so case is cosmetic. */
export function romanDegree(token) {
    const degree = ROMAN.indexOf(token.toUpperCase()) + 1;
    if (!degree) throw new Error(`Unknown Roman numeral: ${token}`);
    return degree;
}

/**
 * Chord on a scale degree built from every other scale note (stacked
 * thirds in a 7-note scale), as semitone offsets from the tonic (ascending;
 * may exceed 12). Works for scales of any size: in a 5- or 6-note scale the
 * "thirds" are wider and degrees past the scale's length wrap around
 * (VI in a pentatonic scale is its I), so a I-V-vi-IV progression still
 * plays - it just colours differently, which is the point of picking one.
 * @param {number[]} scale - from scaleSemitones
 * @param {number} degree - 1..7
 * @param {number} [size=3] - 3 = triad, 4 = seventh
 */
export function diatonicChord(scale, degree, size = 3) {
    const n = scale.length;
    const offsets = [];
    for (let k = 0; k < size; k++) {
        const index = ((degree - 1) % n) + 2 * k;
        offsets.push(scale[index % n] + 12 * Math.floor(index / n));
    }
    return offsets;
}

const TRIAD_SUFFIX = {
    '4,7': '', '3,7': 'm', '3,6': '°', '4,8': '+',
    '2,7': 'sus2', '5,7': 'sus4', '4,6': '(♭5)', '3,8': 'm(♯5)',
    '2,6': 'sus2(♭5)', '5,8': 'sus4(♯5)', '4,9': '6(no5)', '3,9': 'm6(no5)',
    '5,9': '6sus4(no5)', '5,10': '7sus4(no5)', '2,5': 'sus2sus4(no5)',
};
const DEGREE_NAMES = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♯5', '6', '♭7', '7'];

const SEVENTH_SUFFIX = {
    '': { 10: '7', 11: 'maj7' },
    m: { 10: 'm7', 11: 'm(maj7)' },
    '°': { 9: '°7', 10: 'ø7' },
    '+': { 10: '+7', 11: '+maj7' },
};
const NINTH = { 13: '♭9', 14: '9', 15: '♯9' };

/**
 * Full chord symbol suffix: the triad's (chordSuffix), then a seventh and a
 * ninth when the chord has them - 'maj7', 'm7', '7', 'ø7', 'maj7(9)', ...
 * Unusual sevenths/ninths are spelled as intervals.
 * @param {number[]} offsets - 3 to 5 stacked notes
 */
export function chordSymbol(offsets) {
    const triad = chordSuffix(offsets);
    if (offsets.length < 4) return triad;
    const seventh = offsets[3] - offsets[0];
    const known = SEVENTH_SUFFIX[triad] && SEVENTH_SUFFIX[triad][seventh];
    let symbol = known || `${triad}(${DEGREE_NAMES[seventh % 12]})`;
    if (offsets.length >= 5) {
        const ninth = offsets[4] - offsets[0];
        symbol += `(${NINTH[ninth] || DEGREE_NAMES[ninth % 12]})`;
    }
    return symbol;
}

/**
 * Chord-symbol suffix for a triad given as offsets: '' / 'm' / '°' / '+',
 * sus and altered-fifth shapes that exotic scales produce, and an explicit
 * interval list for anything without a common name.
 */
export function chordSuffix(offsets) {
    const third = offsets[1] - offsets[0];
    const fifth = offsets[2] - offsets[0];
    const known = TRIAD_SUFFIX[`${third},${fifth}`];
    if (known !== undefined) return known;
    return `(${[third, fifth].map((s) => DEGREE_NAMES[s % 12]).join(' ')})`;
}

// Every close-position voicing (any inversion) of the pitch classes whose
// notes all lie within [low, high].
function voicingsInRange(pitchClasses, low, high) {
    const voicings = [];
    pitchClasses.forEach((_, inversion) => {
        const order = pitchClasses.slice(inversion).concat(pitchClasses.slice(0, inversion));
        let bottom = low + ((order[0] - low) % 12 + 12) % 12;
        for (; bottom <= high; bottom += 12) {
            const notes = [bottom];
            for (let i = 1; i < order.length; i++) {
                const prev = notes[i - 1];
                const step = ((order[i] - prev) % 12 + 12) % 12 || 12;
                notes.push(prev + step);
            }
            if (notes[notes.length - 1] <= high) voicings.push(notes);
        }
    });
    return voicings;
}

const movement = (a, b) => a.reduce((sum, note, i) => sum + Math.abs(note - b[i]), 0);

/**
 * Picks the voicing of a chord within [low, high] that moves least from the
 * previous one (smooth voice leading); with no previous chord, the one
 * closest to the middle of the range.
 * @param {number[]} pitchClasses - chord tones as 0..11, root first
 * @param {number} low - lowest allowed MIDI note
 * @param {number} high - highest allowed MIDI note
 * @param {number[]} [previous] - previous voicing, same size
 * @returns {number[]} MIDI notes, ascending
 */
export function voiceLead(pitchClasses, low, high, previous = null) {
    // Big chords (ninths span 13-14 semitones in close position) may not
    // fit a narrow range from every bottom note: widen it a semitone at a
    // time, alternating top and bottom, so they sit as close as possible.
    let candidates = voicingsInRange(pitchClasses, low, high);
    for (let widen = 1; !candidates.length && widen <= 24; widen++) {
        if (widen % 2) high++;
        else low--;
        candidates = voicingsInRange(pitchClasses, low, high);
    }
    if (!candidates.length) throw new Error('No voicing fits the range');

    const center = (low + high) / 2;
    const score = previous && previous.length === pitchClasses.length
        ? (v) => movement(v, previous)
        : (v) => Math.abs(v.reduce((s, n) => s + n, 0) / v.length - center);
    return candidates.reduce((best, v) => (score(v) < score(best) ? v : best));
}

/** The lowest MIDI note of pitch class `pc` at or above `low`. */
export function noteAtOrAbove(pc, low) {
    return low + ((pc - low) % 12 + 12) % 12;
}
