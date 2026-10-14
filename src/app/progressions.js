// Progression bank, as Roman numerals. Chord quality comes from the mode,
// so one progression works in every key and mode; numeral case only
// reflects how it reads in its "home" mode. The Harmony layer
// (docs/DESIGN.md step 4) will weight and chain these, and skip
// chords that come out diminished in the current mode.
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
];

export default PROGRESSIONS;
