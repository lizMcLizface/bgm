import { describe, expect, it } from 'vitest';
import { lfoValue, laneValue, sourceValues, modulated, evaluate, cleanMod, lanesFor, modForPattern } from './mod';

describe('modulation sources', () => {
    it('LFOs run 0..1 over a cycle', () => {
        expect(lfoValue({ shape: 'sine', rate: 1 }, 0)).toBeCloseTo(0);
        expect(lfoValue({ shape: 'sine', rate: 1 }, 0.5)).toBeCloseTo(1);
        expect(lfoValue({ shape: 'triangle', rate: 1 }, 0.25)).toBeCloseTo(0.5);
        expect(lfoValue({ shape: 'square', rate: 2 }, 0.3)).toBe(0);
        expect(lfoValue({ shape: 'ramp', rate: 1, phase: 0.5 }, 0)).toBeCloseTo(0.5);
    });
    it('a lane has its own length and division, and may glide', () => {
        const lane = { steps: [0, 1, 0.5], div: 4 };
        expect([0, 0.25, 0.5, 0.75].map((b) => laneValue(lane, b))).toEqual([0, 1, 0.5, 0]);
        const glide = { steps: [0, 1], div: 4, smooth: 1 };
        expect(laneValue(glide, 0.125)).toBeCloseTo(0.5);
        expect(laneValue(glide, 0.25 + 0.125)).toBeCloseTo(0.5);
    });
    it('the sample-and-hold holds for a beat', () => {
        const s = (b) => sourceValues({}, b).rand;
        expect(s(1.1)).toBe(s(1.9));
        expect(s(1.1)).not.toBe(s(2.1));
    });
});

describe('assignments', () => {
    const spec = { min: 0, max: 100, curve: 'lin' };
    it('sit on the stored value and stay inside the range', () => {
        expect(modulated(50, spec, { amount: 0.5 }, 0.5)).toBe(50);
        expect(modulated(50, spec, { amount: 0.5 }, 1)).toBe(75);
        expect(modulated(50, spec, { amount: 1 }, 1)).toBe(100);
        expect(modulated(50, spec, { amount: -0.5 }, 1)).toBe(25);
        expect(modulated(50, spec, { amount: 0, offset: 0.1 }, 0.5)).toBe(60);
        expect(modulated(90, spec, { amount: 1 }, 1)).toBe(100);
    });
    it('evaluates only parameters whose source exists, and cleans stored data', () => {
        const mod = cleanMod({ lanes: [{ steps: [1] }], assigns: { a: { source: 'lane1', amount: 1 }, b: { source: 'lane5', amount: 1 }, c: { source: 'nope' } } });
        expect(Object.keys(mod.assigns)).toEqual(['a', 'b']);
        expect(evaluate(mod, mod.assigns, () => 50, () => spec, 0)).toEqual({ a: 100 });
        expect(mod.lfos).toHaveLength(2);
    });
    it('lets a pattern have lanes of its own, the others playing the shared ones', () => {
        const mod = cleanMod({ lanes: [{ steps: [1] }], patterns: { 2: [{ steps: [0, 1], div: 2 }], x: [{ steps: [1] }], 3: 'no' } });
        expect(lanesFor(mod, 0)).toEqual(mod.lanes);
        expect(lanesFor(mod, 2)).toEqual([{ steps: [0, 1], div: 2, smooth: 0 }]);
        expect(Object.keys(mod.patterns)).toEqual(['2']);
        expect(sourceValues(modForPattern(mod, 2), 0).lane1).toBe(0);
        expect(sourceValues(modForPattern(mod, 0), 0).lane1).toBe(1);
    });
});
