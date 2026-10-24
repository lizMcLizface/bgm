// Acoustic piano types fitted to recordings of six sampled pianos playing tools/makeReferenceMidi.mjs's
// piano take (tools/fitPiano.mjs); same fields as TYPES in acousticPiano.js. The recordings' own names
// are in the comments. Ambient and Intimate are the same piano.
const body = { count: 12, low: 110, high: 2200, q: [7, 16], gain: 1 };
const fitted = (v) => ({ spread: .45, thump: .3, knock: .8, aftersound: .3, ripple: 7, body, ...v });

export const MATCHED_TYPES = {
    // Ambient / Intimate
    ambient: fitted({ strike: .119, contact: .661, loss: .5, inharm: .832, stiffLow: .453, decayScale: 1.23, slow: 3.41, knee: 68, lead: .775, dark: [250, .3, 72], fund: -12.5 }),
    // Glass Grand
    glass: fitted({ strike: .128, contact: 1.09, loss: .5, inharm: 1.06, stiffLow: .839, decayScale: 1.2, slow: 4.66, knee: 90.3, lead: .8, dark: [4000, .2, 72], fund: -14.3 }),
    // Soft Drama
    drama: fitted({ strike: .119, contact: 2.83, loss: .5, inharm: 1.02, stiffLow: .357, decayScale: 1.23, slow: 4.42, knee: 57.8, lead: .375, dark: [4000, .2, 72], fund: -14.8 }),
    // Soft Piano
    soft: fitted({ strike: .136, contact: 3.77, loss: 1.75, inharm: .673, stiffLow: 1.29, decayScale: 1.89, slow: 6.06, knee: 127, lead: .55, dark: [563, 1.79, 72], fund: -10.1 }),
    // Subdued
    subdued: fitted({ strike: .12, contact: 2.95, loss: 1.75, inharm: .873, stiffLow: .514, decayScale: 1.89, slow: 6.84, knee: 78.1, lead: .6, dark: [1910, 1.44, 72], fund: -5.94 }),
    // The Grand
    concert: fitted({ strike: .128, contact: .844, loss: .5, inharm: .861, stiffLow: .744, decayScale: 1.3, slow: 7, knee: 57.8, lead: .4, dark: [4000, .2, 72], fund: -12.5 }),
};
