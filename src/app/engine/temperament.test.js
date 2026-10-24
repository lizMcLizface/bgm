import { TEMPERAMENTS, TONICS, temperamentOffsets, stretchCents, tuningCents, tunedFrequency, isTempered } from './temperament';

const interval = (offsets, from, to) => ((to - from + 12) % 12) * 100 + offsets[to] - offsets[from];

test('equal temperament moves nothing, at the reference pitch', () => {
    expect(temperamentOffsets('equal', 'F#').every((c) => c === 0)).toBe(true);
    expect(tunedFrequency(69)).toBeCloseTo(440, 9);
    expect(tunedFrequency(60)).toBeCloseTo(261.6256, 3);
    expect(tunedFrequency(69, { a4: 415 })).toBeCloseTo(415, 6);
    expect(isTempered({})).toBe(false);
    expect(isTempered({ temperament: 'just' })).toBe(true);
});

test('every temperament keeps its tonic still and its octave whole', () => {
    for (const name of Object.keys(TEMPERAMENTS)) for (const tonic of TONICS) {
        const offsets = temperamentOffsets(name, tonic), key = TONICS.indexOf(tonic);
        expect(offsets[key], `${name} in ${tonic}`).toBeCloseTo(0, 6);
        expect(offsets.every((c) => Math.abs(c) < 30), `${name} in ${tonic}: ${offsets}`).toBe(true);
    }
});

test('just intonation has pure thirds and fifths over its tonic', () => {
    const o = temperamentOffsets('just', 'C');
    expect(interval(o, 0, 4)).toBeCloseTo(1200 * Math.log2(5 / 4), 6);
    expect(interval(o, 0, 7)).toBeCloseTo(1200 * Math.log2(3 / 2), 6);
    expect(interval(temperamentOffsets('just', 'D'), 2, 6)).toBeCloseTo(1200 * Math.log2(5 / 4), 6);
});

test('quarter-comma meantone has pure major thirds and a tempered fifth', () => {
    const o = temperamentOffsets('meantone', 'C');
    for (const [a, b] of [[0, 4], [7, 11], [5, 9], [2, 6]]) expect(interval(o, a, b)).toBeCloseTo(1200 * Math.log2(5 / 4), 2);
    expect(interval(o, 0, 7)).toBeCloseTo(696.578, 2);
});

test('pythagorean fifths are pure except the wolf', () => {
    const o = temperamentOffsets('pythagorean', 'C');
    for (const from of [3, 10, 5, 0, 7, 2, 9, 4, 11, 6, 1]) expect(interval(o, from, (from + 7) % 12)).toBeCloseTo(701.955, 2);
    expect(interval(o, 8, 3)).toBeCloseTo(701.955 - 23.46, 1);
});

test('well temperaments differ by key, and rotate with the tonic', () => {
    for (const name of ['vallotti', 'young', 'werckmeister', 'kirnberger']) {
        const c = temperamentOffsets(name, 'C'), d = temperamentOffsets(name, 'D');
        // The third above the tonic is the same size when the table moves... no: rotation moves the tonic's colour with it.
        expect(interval(c, 0, 4)).toBeCloseTo(interval(d, 2, 6), 6);
        expect(c).not.toEqual(temperamentOffsets(name, 'F#'));
        // The circle closes: seven octaves from twelve fifths, however they are shared.
        let total = 0;
        for (let i = 0; i < 12; i++) total += interval(c, (7 * i) % 12, (7 * i + 7) % 12);
        expect(total).toBeCloseTo(8400, 4);
    }
    // Vallotti: pure fifths on the far side, 1/6 comma narrow on the near side.
    expect(interval(temperamentOffsets('vallotti', 'C'), 0, 7)).toBeCloseTo(701.955 - 23.46 / 6, 2);
    // Werckmeister III's tempered third is wider than a pure one on C, narrower on its pure side.
    expect(interval(temperamentOffsets('werckmeister', 'C'), 0, 4)).toBeCloseTo(390.225, 2);
});

test('stretch is flat in the bass, sharp in the treble and nothing mid-keyboard', () => {
    expect(stretchCents(69)).toBe(0);
    expect(stretchCents(24)).toBeCloseTo(-40, 6);
    expect(stretchCents(21)).toBeLessThan(-40);
    expect(stretchCents(55)).toBe(0);
    expect(stretchCents(108)).toBeCloseTo(30, 6);
    expect(tuningCents(96, { stretch: 1 })).toBeGreaterThan(tuningCents(96, { stretch: .5 }));
    expect(tuningCents(36, { stretch: 1 })).toBeLessThan(0);
});

test('wear scatters notes deterministically by seed, and not at all when off', () => {
    const worn = (midi, seed) => tuningCents(midi, { wear: 1, seed });
    expect(worn(60, 5)).toBe(worn(60, 5));
    expect(worn(60, 5)).not.toBe(worn(60, 6));
    const spread = Array.from({ length: 48 }, (_, i) => worn(40 + i, 3));
    expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(8);
    expect(Math.max(...spread.map(Math.abs))).toBeLessThan(13);
    expect(tuningCents(60, { wear: 0, seed: 9 })).toBe(0);
});
