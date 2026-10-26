import { describe, expect, it } from 'vitest';
import { keepWithin, swing } from './SceneryBackdrop';

describe('scenery time windows', () => {
    it('passes freely without a window', () => {
        expect(swing(25, null, 24)).toBe(1);
    });

    it('swings back and forth across a window that wraps past midnight', () => {
        const night = [20, 5];
        expect(swing(22, night, 24)).toBeCloseTo(22);
        expect(swing(29, night, 24)).toBeCloseTo(5);   // 05:00, the far edge
        expect(swing(31, night, 24)).toBeCloseTo(3);   // and back toward the evening
        expect(swing(38, night, 24)).toBeCloseTo(20);
        for (let t = 0; t < 100; t += 0.7) {
            const h = swing(t, night, 24);
            expect(h >= 20 || h <= 5).toBe(true);
        }
    });

    it('holds a clock time outside the window to the nearer edge', () => {
        expect(keepWithin(23, [20, 5], 24)).toBe(23);
        expect(keepWithin(7, [20, 5], 24)).toBe(5);
        expect(keepWithin(16, [20, 5], 24)).toBe(20);
        expect(keepWithin(2.2, [2.85, 3.85], 4)).toBe(2.85);
        expect(keepWithin(1.2, [2.85, 3.85], 4)).toBe(3.85);   // summer is nearer late winter, round the year
    });
});
