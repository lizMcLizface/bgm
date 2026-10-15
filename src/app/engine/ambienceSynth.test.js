import { renderLayer, renderParams, LAYERS } from './ambienceSynth';

// a low rate keeps this quick; the sounds scale with the rate
const RATE = 8000;

test.each(Object.keys(LAYERS))('%s loops without a seam and stays in range', (id) => {
    const [left, right] = renderLayer(id, RATE);
    expect(left.length).toBe(LAYERS[id].seconds * RATE);
    expect(right.length).toBe(left.length);
    const diffs = (a, from, to) => { let m = 0; for (let i = from; i < to; i++) m = Math.max(m, Math.abs(a[i] - a[i - 1])); return m; };
    // the jump across the loop point is no bigger than ones inside it
    const seam = Math.abs(left[0] - left[left.length - 1]);
    expect(seam).toBeLessThanOrEqual(diffs(left, 1, left.length) + 1e-6);
    left.forEach((x) => expect(Math.abs(x)).toBeLessThanOrEqual(0.95));
});

test('thunder: a few variants, quiet at the end', () => {
    const variants = renderLayer('thunder', RATE);
    expect(variants.length).toBe(3);
    variants.forEach(([left]) => expect(Math.abs(left[left.length - 1])).toBeLessThan(0.01));
});

test('render params: steps of 0.1, defaults filled in; intensity plays louder, the defaults as before', () => {
    expect(renderParams('rain', { intensity: 0.83, distance: 0.5 })).toEqual({ intensity: 0.8, drops: 0.4 });
    const level = (params) => { const [l] = renderLayer('rain', RATE, params); return Math.sqrt(l.reduce((s, x) => s + x * x, 0) / l.length); };
    const soft = level({ intensity: 0.1 });
    const usual = level({});
    const heavy = level({ intensity: 0.9 });
    expect(soft).toBeLessThan(usual);
    expect(heavy).toBeGreaterThan(usual);
    expect(usual).toBeCloseTo(LAYERS.rain.level, 2);
});
