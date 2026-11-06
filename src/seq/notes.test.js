import { describe, expect, it } from 'vitest';
import { noteStepEvents, heldSteps, projectStepEvents } from './notes';
import { makeKey } from './harmony';
import { createScheduler } from './scheduler';

const key = makeKey('Major-1', 0);
const ctx = { time: 10, stepSec: 0.5, key };
const pattern = (steps, extra = {}) => ({ mode: 'note', follow: 'scale', length: steps.length, steps, ...extra });
const rest = (n) => Array(n).fill(null);

describe('note steps', () => {
    it('play a scale degree at the step\'s time for a share of the step', () => {
        const p = pattern([{ n: [{ d: 2 }], vel: 0.5 }, ...rest(3)], { gate: 0.5 });
        expect(noteStepEvents(p, 0, ctx)).toEqual([{ track: 0, time: 10, note: 64, duration: 0.25, velocity: 0.5, params: {} }]);
        expect(noteStepEvents(p, 1, ctx)).toEqual([]);
    });
    it('hold a tie until the next step', () => {
        const p = pattern([{ n: [{ d: 0 }], len: 3 }, null, null, { n: [{ d: 1 }] }], { gate: 1 });
        expect(heldSteps(p, 0)).toBe(3);
        expect(noteStepEvents(p, 0, ctx)[0].duration).toBeCloseTo(1.5);
        const cut = pattern([{ n: [{ d: 0 }], len: 4 }, null, { n: [{ d: 1 }] }, null], { gate: 1 });
        expect(heldSteps(cut, 0)).toBe(2);
    });
    it('holds individual notes independently across other onsets', () => {
        const p = pattern([{ n: [{ d: 0, len: 4 }, { d: 2, len: 2 }] }, { n: [{ d: 4 }] }, null, null], { gate: 1 });
        expect(noteStepEvents(p, 0, ctx).map(e => [e.note, e.duration])).toEqual([[60, 2], [64, 1]]);
        expect(noteStepEvents(p, 1, ctx)[0].note).toBe(67);
    });
    it('are shifted by the pattern\'s octave and fitted into its range, notes together', () => {
        const p = pattern([{ n: [{ d: 0 }, { d: 2 }, { d: 4 }] }], { octave: -2, range: [48, 72] });
        expect(noteStepEvents(p, 0, ctx).map((e) => e.note)).toEqual([48, 52, 55]);
        const up = pattern([{ n: [{ d: 0 }] }], { octave: 2, range: [48, 72] });
        expect(noteStepEvents(up, 0, ctx)[0].note).toBe(72);
    });
    it('strum a chord, upward or downward', () => {
        const chord = { chord: { d: 0 }, strum: 1 };
        const p = pattern([chord], { mode: 'chord', gate: 1 });
        const up = noteStepEvents(p, 0, ctx);
        expect(up.map((e) => e.note)).toEqual([60, 64, 67]);
        up.map((e) => e.time - 10).forEach((t, i) => expect(t).toBeCloseTo([0, 0.225, 0.45][i]));
        const down = noteStepEvents(pattern([{ ...chord, strum: -1 }], { mode: 'chord' }), 0, ctx);
        expect(down.map((e) => e.note)).toEqual([67, 64, 60]);
    });
    it('repeat within the step', () => {
        const events = noteStepEvents(pattern([{ n: [{ d: 0 }], rept: 4 }], { gate: 0.5 }), 0, ctx);
        expect(events.map((e) => e.time)).toEqual([10, 10.125, 10.25, 10.375]);
        expect(events[0].duration).toBeCloseTo(0.0625);
    });
    it('nudge and swing move them; chance and conditions drop them', () => {
        const p = pattern([null, { n: [{ d: 0 }], nudge: 0.5 }]);
        expect(noteStepEvents(p, 1, { ...ctx, swing: 0.75 })[0].time).toBeCloseTo(10 + 0.25 + 0.25); // swing delays an odd step by half a step, the nudge by a quarter of it
        const chance = pattern([{ n: [{ d: 0 }], prob: 0.3 }]);
        expect(noteStepEvents(chance, 0, { ...ctx, random: () => 0.2 })).toHaveLength(1);
        expect(noteStepEvents(chance, 0, { ...ctx, random: () => 0.9 })).toHaveLength(0);
        const cond = pattern([{ n: [{ d: 0 }], cond: '2:2' }]);
        expect([0, 1].map((cycle) => noteStepEvents(cond, 0, { ...ctx, cycle }).length)).toEqual([0, 1]);
    });
});

describe('a project: the chord sequencer leads, the others follow', () => {
    const chords = pattern([{ chord: { d: 0 } }, ...rest(7), { chord: { d: 5 } }, ...rest(7)], { mode: 'chord' });
    const bass = pattern([{ n: [{ d: 0 }] }, ...rest(15)], { follow: 'chord', octave: -2 });
    const lead = pattern([{ n: [{ d: 0 }] }, ...rest(15)], { follow: 'scale' });
    const project = { key, leader: 0, sequencers: [{ pattern: chords }, { pattern: bass }, { pattern: lead }] };
    it('plays every sequencer\'s notes for the step, the bass on the chord sounding', () => {
        const at = (step) => projectStepEvents(project, step, ctx).map((e) => [e.track, e.note]);
        expect(at(0)).toEqual([[0, 60], [0, 64], [0, 67], [1, 36], [2, 60]]);
        const second = pattern([{ n: [{ d: 0 }] }, ...rest(15)], { follow: 'chord', octave: -2, length: 16 });
        const p2 = { ...project, sequencers: [{ pattern: chords }, { pattern: { ...second, steps: [...rest(8), { n: [{ d: 0 }] }, ...rest(7)] } }] };
        expect(projectStepEvents(p2, 8, ctx).filter((e) => e.track === 1).map((e) => e.note)).toEqual([45]); // A, the vi chord's root, two octaves down
    });
    it('leaves out muted sequencers and repeats a short pattern across the loop', () => {
        const short = pattern([{ n: [{ d: 0 }] }, null, null, null], { follow: 'scale' });
        const p = { ...project, sequencers: [{ pattern: chords }, { pattern: short }, { pattern: lead, mute: true }] };
        expect(projectStepEvents(p, 4, ctx).filter((e) => e.track === 1)).toHaveLength(1);
        expect(projectStepEvents(p, 0, ctx).filter((e) => e.track === 2)).toHaveLength(0);
    });
    it('is booked by the sequencer core like any other pattern', () => {
        const booked = [], b = { patterns: [project], lengths: [16], tempos: [0], chain: [], current: 0 };
        const s = createScheduler({ now: () => 0, bank: () => b, tempo: () => 120, swing: () => 0.5, flam: () => 0.5, lookahead: 0.3, emit: (events) => booked.push(...events), timers: { set: () => 1, clear: () => {} },
            events: (p, step, c) => projectStepEvents(p, step, { ...c, stepSec: c.stepSec }) });
        s.start(0, 'pattern');
        expect(booked.slice(0, 5).map((e) => e.note)).toEqual([60, 64, 67, 36, 60]);
        expect(booked[0].time).toBe(0);
    });
});
