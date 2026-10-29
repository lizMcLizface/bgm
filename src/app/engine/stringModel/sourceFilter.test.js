import { expect, test } from 'vitest';
import { fitLayer } from './sourceFilter.js';

// a table whose notes are exactly a body fixed in Hz times a tilted source
const body = (f) => 6 * Math.sin(f / 150) - 4 * Math.log2(f / 500);
const table = {
    pitches: Array.from({ length: 25 }, (_, i) => {
        const pitch = 40 + i, f0 = 440 * 2 ** ((pitch - 69) / 12);
        return { pitch, f0, layers: { 80: { total: 0, cells: Array.from({ length: 40 }, (_, k) => [k + 1, body((k + 1) * f0) - (6 + i / 10) * Math.log2(k + 1) - 3, -100]) } } };
    }),
};

test('a body times a tilted source is recovered, and predicts a pitch that was left out', () => {
    const fit = fitLayer(table, 80, { variant: 'tilt', skip: new Set([50, 51]) });
    const f0 = 440 * 2 ** ((50 - 69) / 12);
    // the fit has a free constant between the body and each note's level, so compare differences between harmonics
    const predicted = (h) => fit.level(50, f0, h), truth = (h) => body(h * f0) - (6 + 10 / 10) * Math.log2(h) - 3;
    for (const h of [2, 5, 9, 14, 22, 30]) expect(predicted(h) - predicted(1) - (truth(h) - truth(1))).toBeCloseTo(0, 0);
});
