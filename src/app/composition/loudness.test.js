import { describe, expect, it } from 'vitest';
import { barEnergy, planLoudness } from './loudness';

const sparse = [{ role: 'pad', beat: 0, length: 4, velocity: 0.5 }];
const busy = [...sparse, ...Array.from({ length: 8 }, (_, i) => ({ role: 'pad', beat: i / 2, length: 0.5, velocity: 0.6 })), ...Array.from({ length: 4 }, (_, i) => ({ role: 'perc', beat: i, length: 0.25, velocity: 0.8 }))];

describe('even loudness', () => {
    it('measures a busy bar as louder than a sparse one', () => {
        expect(barEnergy(busy, 4)).toBeGreaterThan(barEnergy(sparse, 4) * 2);
    });
    it('turns a busy bar down and a sparse one up against the running average, within 4 dB', () => {
        const average = (barEnergy(busy, 4) + barEnergy(sparse, 4)) / 2;
        expect(planLoudness(busy, 4, average, 1).trim).toBeLessThan(1);
        expect(planLoudness(sparse, 4, average, 1).trim).toBeGreaterThan(1);
        expect(planLoudness(sparse, 4, average * 100, 1).trim).toBeCloseTo(10 ** (4 / 20));
    });
    it('changes nothing when off, but keeps the average running', () => {
        const off = planLoudness(busy, 4, 0.1, 0);
        expect(off.trim).toBe(1);
        expect(off.average).toBeGreaterThan(0.1);
    });
});
