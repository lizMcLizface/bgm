// Shapes for the rack's z-plane filter (extras.js, and the 'rack-zplane' worklet in public/rack-fx-processor.js).
//
// A shape is six sections; each section is one pole pair with one zero pair at the same angle on the z-plane, written in Hz so it
// does not depend on the sample rate: [centre Hz, pole bandwidth Hz, boost dB]. The zeros sit wider than the poles for a boost (a
// peak) and narrower for a cut (a notch), so a section with 0 dB does nothing. The filter morphs by sliding every section's
// frequency, bandwidth and boost from one shape to another.
//
// The five vowels come from the tenor formant table in the Csound manual ("Formant Values" appendix: centre frequency, level in dB
// below the first formant, and bandwidth), also found in Perry Cook's STK Phonemes and the Faust physical-modelling formant tables.
// Those levels are for formants added side by side; here the formants are cascaded boosts, so a level is turned into a boost with
// BOOST (the first formant 18 dB, a formant 30 dB down 4.5 dB).

const BOOST = (level) => Math.max(2, Math.min(18, 18 + level * 0.45));
const NEUTRAL = [5500, 1000, 0];
const SECTIONS = 6;
const fill = (rows) => [...rows, ...Array(SECTIONS - rows.length).fill(NEUTRAL)];
// a vowel from Csound-style rows: [frequency, level in dB, bandwidth]
const vowel = (rows) => fill(rows.map(([f, level, bw]) => [f, bw, BOOST(level)]));

export const ZPLANE_SHAPES = [
    { name: 'Ah', sections: vowel([[650, 0, 80], [1080, -6, 90], [2650, -7, 120], [2900, -8, 130], [3250, -22, 140]]) },
    { name: 'Eh', sections: vowel([[400, 0, 70], [1700, -14, 80], [2600, -12, 100], [3200, -14, 120], [3580, -20, 120]]) },
    { name: 'Ee', sections: vowel([[290, 0, 40], [1870, -15, 90], [2800, -18, 100], [3250, -20, 120], [3540, -30, 120]]) },
    { name: 'Oh', sections: vowel([[400, 0, 40], [800, -10, 80], [2600, -12, 100], [2800, -12, 120], [3000, -26, 120]]) },
    { name: 'Oo', sections: vowel([[350, 0, 40], [600, -20, 60], [2700, -17, 100], [2900, -14, 120], [3300, -26, 120]]) },
    { name: 'Nasal', sections: fill([[270, 80, 10], [1000, 300, -14], [2200, 200, 10], [3000, 300, 8], [4500, 500, -8]]) },
    { name: 'Hollow', sections: fill([[450, 140, -16], [1100, 250, -18], [1800, 300, -14], [2800, 400, -12], [3900, 500, -10], [5200, 600, -8]]) },
    { name: 'Dark', sections: fill([[150, 150, 6], [3000, 3000, -10], [6000, 4000, -16], [1500, 1500, -3]]) },
    { name: 'Bright', sections: fill([[200, 200, -8], [500, 500, -4], [5000, 4000, 10], [9000, 6000, 8]]) },
    { name: 'Telephone', sections: fill([[150, 200, -18], [400, 300, -8], [1800, 900, 8], [3400, 1000, 2], [6000, 3000, -18], [9000, 4000, -20]]) },
    { name: 'Wah low', sections: fill([[450, 130, 18], [1200, 500, 6], [2800, 1800, -4], [6000, 4000, -8]]) },
    { name: 'Wah high', sections: fill([[1800, 300, 18], [3200, 800, 8], [600, 500, -6], [7000, 4000, -6]]) },
];
export const ZPLANE_SHAPE_NAMES = ZPLANE_SHAPES.map((s) => s.name);
