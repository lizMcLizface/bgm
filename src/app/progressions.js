// Progression bank, as Roman numerals. Chord quality comes from the mode,
// so one progression works in every key and mode; numeral case only
// reflects how it reads in its "home" mode (a lowercase 'i' marks a minor
// one - randomize.js pairs those with minor modes).
//
// Links store progressions by index (shareCode.js): append new ones at the
// end, never reorder or remove. Lengths vary; drift stays at the length of
// the home progression (Generator.planBar).
const PROGRESSIONS = [
    ['I', 'V', 'vi', 'IV'],
    ['I', 'vi', 'IV', 'V'],
    ['vi', 'IV', 'I', 'V'],
    ['I', 'IV', 'vi', 'V'],
    ['IV', 'V', 'iii', 'vi'],
    ['I', 'iii', 'IV', 'IV'],
    ['i', 'VI', 'III', 'VII'],
    ['i', 'VII', 'VI', 'VII'],
    ['i', 'iv', 'VI', 'v'],
    ['I', 'II', 'I', 'II'],
    // two chords: a gentle sway
    ['I', 'IV'],
    ['I', 'vi'],
    ['i', 'VII'],
    ['i', 'iv'],
    // three
    ['I', 'IV', 'V'],
    ['I', 'vi', 'IV'],
    ['ii', 'V', 'I'],
    ['i', 'VI', 'VII'],
    // five and six
    ['I', 'V', 'vi', 'iii', 'IV'],
    ['i', 'VI', 'III', 'VII', 'iv'],
    ['I', 'iii', 'vi', 'IV', 'ii', 'V'],
    ['i', 'VII', 'VI', 'v', 'iv', 'VII'],
    // eight
    ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'],
    ['I', 'vi', 'IV', 'V', 'I', 'vi', 'ii', 'V'],
    ['i', 'VI', 'III', 'VII', 'i', 'VI', 'iv', 'V'],
    // Explicit unresolved choices: no tonic degree, including at the loop seam.
    ['ii', 'iv', 'iii', 'ii'],
    ['iv', 'ii', 'v', 'iii'],
    ['iii', 'v', 'ii', 'iv'],
    ['ii', 'iv', 'iii', 'v', 'iv', 'ii'],
    ['iv', 'iii', 'ii', 'v', 'iii', 'iv'],
    ['ii', 'iv', 'iii', 'v', 'ii', 'iii', 'iv', 'v'],
];

/** Chord counts the bank has, ascending: [2, 3, 4, 5, 6, 8]. */
export const PROGRESSION_LENGTHS = [...new Set(PROGRESSIONS.map((p) => p.length))].sort((a, b) => a - b);

/** Indices of the progressions with `length` chords. */
export const progressionsOfLength = (length) => [...PROGRESSIONS.keys()].filter((i) => PROGRESSIONS[i].length === length);

// Appended indices are stable in the existing five-bit share field.
export const isUnsettlingProgression = index => Number.isInteger(index) && index >= 25 && index < PROGRESSIONS.length;
export const normalProgressions = [...PROGRESSIONS.keys()].filter(i=>!isUnsettlingProgression(i));
export default PROGRESSIONS;
