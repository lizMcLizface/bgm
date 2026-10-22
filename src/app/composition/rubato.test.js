import { describe, expect, it } from 'vitest';
import { planRubato, rubatoTime } from './rubato';

const meter = { units: 4 };
const state = (start, bars, section = null) => ({ phrase: { start, section }, composition: { phrase: { start, bars } } });

describe('rubato', () => {
    it('keeps strict time when off or away from a cadence', () => {
        expect(planRubato({ bar: 3, state: state(0, 4), meter, amount: 0 })).toBeNull();
        expect(planRubato({ bar: 2, state: state(0, 4), meter, amount: 1 })).toBeNull();
    });
    it('slows the last beats of a phrase, more before a section change and the ending', () => {
        const phrase = planRubato({ bar: 3, state: state(0, 4), meter, amount: 1 });
        expect(phrase.slice(0, 2)).toEqual([1, 1]);
        expect(phrase[3]).toBeCloseTo(0.93);
        const section = planRubato({ bar: 7, state: state(4, 4, { start: 0, bars: 8 }), meter, amount: 1 });
        const ending = planRubato({ bar: 9, state: state(8, 4), meter, endBar: 10, amount: 1 });
        expect(section[3]).toBeLessThan(phrase[3]);
        expect(ending[3]).toBeLessThan(section[3]);
    });
    it('times beats from the scales and is exact without them', () => {
        expect(rubatoTime(null, 0.5, 3)).toBe(1.5);
        const scales = [1, 1, 0.8, 0.5];
        expect(rubatoTime(scales, 0.5, 2)).toBeCloseTo(1);
        expect(rubatoTime(scales, 0.5, 2.5)).toBeCloseTo(1 + 0.25 / 0.8);
        expect(rubatoTime(scales, 0.5, 4)).toBeCloseTo(1 + 0.625 + 1);
        expect(rubatoTime(scales, 0.5, -0.1)).toBeCloseTo(-0.05);
    });
});
