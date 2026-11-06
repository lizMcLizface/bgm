import { describe, expect, it } from 'vitest';
import { cleanMoves, moveAt, moveProgress, movedRack, RACK_MOVES } from './moves';
import { RACK_PARAMS } from '../synths/effects/params';
import { chainUnits, maskFromUnits } from '../synths/effects/order';

describe('effect moves', () => {
    it('ramps linearly, and frequencies by ratio', () => {
        const v = moveAt([{ key: 'effects.delay', from: 0, to: 0.8 }, { key: 'filter.high', from: 1000, to: 16000 }], 0.5);
        expect(v['effects.delay']).toBeCloseTo(0.4);
        expect(v['filter.high']).toBeCloseTo(4000);
        expect(moveAt([{ key: 'effects.delay', from: 0, to: 0.8 }], 2)['effects.delay']).toBeCloseTo(0.8);
    });
    it('runs over its loops from the first step, then again', () => {
        expect(moveProgress(0, 0, 16, 2)).toBe(0);
        expect(moveProgress(16, 0, 16, 2)).toBe(0.5);
        expect(moveProgress(31, 0.5, 16, 2)).toBeCloseTo(31.5 / 32);
        expect(moveProgress(32, 0, 16, 2)).toBe(0);
    });
    it('cleans stored moves', () => {
        const m = cleanMoves({ 3: { loops: 4, list: [{ key: 'effects.delay', from: 0, to: 0.5 }, { key: 'nope', from: 0, to: 1 }, { key: 'effects.reverb', from: 0, to: 9 }] }, x: {}, 4: { loops: 3, list: [] } });
        expect(m).toEqual({ 3: { loops: 4, list: [{ key: 'effects.delay', from: 0, to: 0.5 }] } });
        expect(cleanMoves({ 1: { loops: 3, list: [{ key: 'effects.delay', from: 0, to: 0.5 }] } })[1].loops).toBe(1);
    });
    it('brings the units a move needs into the chain, leaving the rack as it was', () => {
        const rack = { 'master.chain': maskFromUnits(['eq']), 'effects.delay': 0 };
        const out = movedRack(rack, { 'effects.delay': 0.3, 'filter.low': 100 });
        expect(chainUnits(out['master.chain']).sort()).toEqual(['eq', 'filter', 'space']);
        expect(out['effects.delay']).toBe(0.3);
        expect(rack['effects.delay']).toBe(0);
        expect(Object.values(RACK_MOVES).every((r) => r.unit)).toBe(true);
    });
    it('only sweeps rack parameters that exist, inside their own ranges', () => {
        for (const [key, r] of Object.entries(RACK_MOVES)) {
            const spec = RACK_PARAMS.BY_KEY[key];
            expect(spec, key).toBeTruthy();
            expect(r.min, key).toBeGreaterThanOrEqual(spec.min);
            expect(r.max, key).toBeLessThanOrEqual(spec.max);
        }
    });
});
