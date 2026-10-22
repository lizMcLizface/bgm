import { describe, expect, it } from 'vitest';
import { Ducker, duckFloor, automateDuck } from './ducking';

// records the automation and evaluates it the way an AudioParam would, roughly
function param() {
    const events = [];
    return { events, cancelScheduledValues(t) { for (let i = events.length - 1; i >= 0; i--) if (events[i].time >= t) events.splice(i, 1); },
        setTargetAtTime(value, time) { events.push({ value, time }); events.sort((a, b) => a.time - b.time); },
        setValueAtTime(value, time) { events.push({ value, time }); events.sort((a, b) => a.time - b.time); },
        target(t) { let v = 1; for (const e of events) if (e.time <= t) v = e.value; return v; } };
}

describe('ducking', () => {
    it('dips the pad more than the second lead, and not at all when off', () => {
        expect(duckFloor('pad', 'lead', 1)).toBeCloseTo(10 ** (-6 / 20));
        expect(duckFloor('counter', 'lead', 1)).toBeCloseTo(10 ** (-3 / 20));
        expect(duckFloor('pad', 'lead', 0)).toBe(1);
        expect(duckFloor('bass', 'lead', 1)).toBe(1);
    });
    it('holds through legato notes and returns in the rests', () => {
        const p = param(), d = new Ducker(p), floor = 0.5;
        d.note(1, 2, floor);
        d.note(1.9, 3, floor); // overlapping: no return between
        d.note(5, 6, floor);
        expect(p.target(1.5)).toBe(floor);
        expect(p.target(2.5)).toBe(floor);
        expect(p.target(4)).toBe(1);
        expect(p.target(5.5)).toBe(floor);
        expect(p.target(7)).toBe(1);
    });
    it('renders from the notes, relative to the chunk', () => {
        const p = param();
        automateDuck(p, 'pad', [{ role: 'lead', time: 10, duration: 1 }, { role: 'bass', time: 12, duration: 1 }], 1, 9);
        expect(p.target(1.5)).toBeLessThan(1);
        expect(p.target(3.5)).toBe(1);
    });
});
