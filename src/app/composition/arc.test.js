import { describe, expect, it } from 'vitest';
import { arcEnergy, applyArc, arcTone, arcSpace } from './arc';

describe('energy arc', () => {
    it('is flat when off and follows its shape over its length', () => {
        expect(arcEnergy({ shape: 'off', minutes: 2 }, 100)).toBe(1);
        expect(arcEnergy({ shape: 'rise', minutes: 2 }, 0)).toBeCloseTo(0.15);
        expect(arcEnergy({ shape: 'rise', minutes: 2 }, 300)).toBe(1);
        expect(arcEnergy({ shape: 'winddown', minutes: 2 }, 0)).toBe(1);
        expect(arcEnergy({ shape: 'winddown', minutes: 2 }, 600)).toBeCloseTo(0.15);
        expect(arcEnergy({ shape: 'wave', minutes: 2 }, 60)).toBeCloseTo(1);
        expect(arcEnergy({ shape: 'wave', minutes: 2 }, 120)).toBeCloseTo(0);
    });
    it('calms a bar: softer, fewer drum hits but every downbeat, darker, further back', () => {
        const bar = () => [{ role: 'lead', beat: 1, velocity: 0.8 }, ...Array.from({ length: 16 }, (_, i) => ({ role: 'perc', beat: i / 4, velocity: 0.7 }))];
        const calm = applyArc(bar(), 0.15, { bar: 3, seed: 1 });
        expect(calm.find((e) => e.role === 'lead').velocity).toBeLessThan(0.8);
        expect(calm.filter((e) => e.role === 'perc').length).toBeLessThan(16);
        expect(calm.some((e) => e.role === 'perc' && e.beat === 0)).toBe(true);
        expect(applyArc(bar(), 1, { bar: 3 })).toEqual(bar());
        expect(arcTone(20000, 0.15)).toBeLessThan(5000);
        expect(arcTone(20000, 1)).toBe(20000);
        expect(arcSpace(0.15)).toBeGreaterThan(0);
    });
});
