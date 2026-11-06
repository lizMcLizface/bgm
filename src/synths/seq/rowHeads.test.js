import { describe, expect, it } from 'vitest';
import { trackStepAt, playsOwnWay } from './rowHeads';

const at = (step, length = 16, count = step) => ({ count, step, length });

describe('per-track playhead', () => {
    it('a row with its own length loops inside the pattern', () => {
        expect([0, 4, 5, 7, 15].map((s) => trackStepAt(at(s), { own: 5 }))).toEqual([0, 4, 0, 2, 0]);
    });
    it('a row with a slower division moves at its own pace', () => {
        const half = { div: '1/8' };
        expect([0, 1, 2, 3, 4, 5].map((s) => trackStepAt(at(s), { play: half }))).toEqual([0, 0, 1, 1, 2, 2]);
        expect(trackStepAt(at(2.5), { play: half })).toBe(1);
    });
    it('reads backwards and bounces', () => {
        expect([0, 1, 2, 3].map((s) => trackStepAt(at(s), { own: 4, play: { dir: 'rev' } }))).toEqual([3, 2, 1, 0]);
        expect([0, 1, 2, 3, 4, 5, 6].map((s) => trackStepAt(at(s), { own: 4, play: { dir: 'ping' } }))).toEqual([0, 1, 2, 3, 2, 1, 0]);
        expect(trackStepAt(at(3), { play: { dir: 'rand' } })).toBeNull();
    });
    it('a free-running row counts from the start of playback, past the bar', () => {
        expect(trackStepAt(at(0, 16, 16), { own: 5, free: true })).toBe(1);
        expect(trackStepAt(at(0, 16, 16), { own: 5 })).toBe(0);
    });
    it('knows which rows play their own way', () => {
        expect(playsOwnWay(undefined, undefined)).toBe(false);
        expect(playsOwnWay({}, 5)).toBe(true);
        expect(playsOwnWay({ dir: 'rev' }, undefined)).toBe(true);
    });
});
