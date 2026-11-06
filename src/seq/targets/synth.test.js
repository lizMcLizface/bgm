import { describe, expect, it } from 'vitest';
import { synthTarget } from './synth';

const engine = () => { const calls = []; return { calls, noteOn: (...a) => calls.push(['on', ...a]), noteOff: (...a) => calls.push(['off', ...a]) }; };

describe('synth target', () => {
    it('turns a note into a timed note on and off', () => {
        const e = engine(), target = synthTarget(() => e);
        target.trigger({ note: 64, velocity: 0.7, time: 2, duration: 0.25 });
        expect(e.calls).toEqual([['on', 4000, 64, 0.7, 2], ['off', 4000, 2.25]]);
    });
    it('gives each note an id of its own, so a repeat cannot cut the note before it', () => {
        const e = engine(), target = synthTarget(() => e);
        target.trigger({ note: 60, velocity: 1, time: 0, duration: 1 });
        target.trigger({ note: 60, velocity: 1, time: 0.5, duration: 1 });
        const ids = e.calls.filter((c) => c[0] === 'on').map((c) => c[1]);
        expect(new Set(ids).size).toBe(2);
    });
    it('does nothing without an engine or a pitch', () => {
        const target = synthTarget(() => null);
        expect(() => target.trigger({ note: 60, velocity: 1, time: 0, duration: 1 })).not.toThrow();
        const e = engine();
        synthTarget(() => e).trigger({ note: NaN, velocity: 1, time: 0, duration: 1 });
        expect(e.calls).toEqual([]);
    });
});
