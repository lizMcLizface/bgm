import { describe, expect, it } from 'vitest';
import { createClock } from './clock';
import { createScheduler } from './scheduler';

const anchor = (count, time, stepSec = 0.125, extra = {}) => ({ count, time, stepSec, pattern: 0, step: count % 16, length: 16, ...extra });

describe('the global clock', () => {
    it('interpolates between booked steps and follows a tempo change', () => {
        const c = createClock();
        c.record(anchor(0, 1)); c.record(anchor(1, 1.125)); c.record(anchor(2, 1.25, 0.0625)); c.record(anchor(3, 1.3125, 0.0625));
        expect(c.at(1.0625).count).toBeCloseTo(0.5);
        expect(c.at(1.1875).count).toBeCloseTo(1.5);
        expect(c.at(1.28125).count).toBeCloseTo(2.5);
        expect(c.at(1.28125).beat).toBeCloseTo(0.625);
        expect(c.at(1.28125).stepSec).toBe(0.0625);
    });
    it('is empty before a start, holds still when halted, and forgets on a stop', () => {
        const c = createClock();
        expect(c.at(0)).toBeNull();
        c.record(anchor(0, 1)); c.record(anchor(1, 1.125)); c.record(anchor(2, 1.25));
        c.halt(1.1875);
        expect(c.at(5).count).toBeCloseTo(1.5);
        expect(c.at(5).running).toBe(false);
        c.record(anchor(2, 6));
        expect(c.at(6.0625).count).toBeCloseTo(2.5);
        c.halt(6, { forget: true });
        expect(c.at(6.1)).toBeNull();
    });
    it('never runs more than a step past what was booked', () => {
        const c = createClock();
        c.record(anchor(4, 2));
        expect(c.at(100).count).toBe(5);
    });
    it('is fed by the scheduler: its position is where the booked steps are', () => {
        const t = { v: 0 }, clock = createClock(), booked = [];
        const patterns = [{ rows: [[1, ...Array(15).fill(0)]] }];
        const s = createScheduler({ now: () => t.v, bank: () => ({ patterns, lengths: [16], tempos: [0], chain: [], current: 0 }), tempo: () => 120, swing: () => 0.5, flam: () => 0.5, emit: (e) => booked.push(e), clock, lookahead: 1,
            timers: { set: () => 1, clear: () => {} } });
        s.start(0, 'pattern');
        t.v = 0.3;
        const p = clock.at(0.3);
        expect(p.count).toBeCloseTo(0.3 / 0.125);
        expect(p.step).toBeCloseTo(p.count);
        expect(p.length).toBe(16);
        s.pause();
        const held = clock.at(0.3).count;
        expect(clock.at(9).count).toBeCloseTo(held);
        s.stop();
        expect(clock.at(9)).toBeNull();
    });
});
