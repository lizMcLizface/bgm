import { stepEvents, flamGap, swingDelay, GRACE_VELOCITY } from './core';
import { createScheduler } from './scheduler';
import { drumTarget, drumPattern } from './targets/drum';

const row = (...on) => Array.from({ length: 16 }, (_, i) => (on.includes(i) ? 1 : 0));
const opts = { time: 10, stepSec: 0.125, swing: 0.5, flam: 0.5 };

test('a step makes one event per hit, with the accent row as a fraction', () => {
    const pattern = { rows: [row(0), row(0, 4)], accent: [3, ...Array(15).fill(0)] };
    const events = stepEvents(pattern, 0, opts);
    expect(events.map((e) => [e.track, e.time, e.params.accent])).toEqual([[0, 10, 1], [1, 10, 1]]);
    expect(stepEvents(pattern, 4, opts).map((e) => e.track)).toEqual([1]);
});

test('a flam puts a quiet grace note ahead of the hit', () => {
    const pattern = { rows: [[2, ...Array(15).fill(0)]], accent: null };
    const [grace, hit] = stepEvents(pattern, 0, opts);
    expect(grace).toMatchObject({ grace: true, velocity: GRACE_VELOCITY, params: {} });
    expect(hit.time - grace.time).toBeCloseTo(flamGap(0.5), 6);
    expect(hit.grace).toBe(false);
});

test('swing delays only the odd steps', () => {
    expect(swingDelay(0, 0.125, 0.75)).toBe(0);
    expect(swingDelay(1, 0.125, 0.75)).toBeCloseTo(0.0625, 6);
    expect(swingDelay(1, 0.125, 0.5)).toBe(0);
    expect(swingDelay(2, 0.125, 0.75)).toBe(0);
});

const fakeClock = () => {
    const clock = { t: 0, fns: [] };
    clock.timers = { set: (fn) => { clock.fns.push(fn); return clock.fns.length; }, clear: () => { clock.fns = []; } };
    clock.advance = (s) => { for (let i = 0; i < Math.round(s / 0.025); i++) { clock.t += 0.025; clock.fns.forEach((f) => f()); } };
    return clock;
};
const bank = (overrides = {}) => ({ patterns: [{ rows: [row(0, 4, 8, 12)], accent: null }, { rows: [row(2)], accent: null }], lengths: [16, 16], tempos: [0, 0], chain: [], current: 0, ...overrides });

test('the scheduler books quarter notes at the tempo, ahead of the clock', () => {
    const clock = fakeClock(), booked = [];
    const s = createScheduler({ now: () => clock.t, bank: () => bank(), tempo: () => 120, swing: () => 0.5, flam: () => 0.5, emit: (events) => booked.push(...events), timers: clock.timers });
    s.start(0);
    clock.advance(2.1);
    s.stop();
    expect(booked.slice(0, 5).map((e) => +e.time.toFixed(4))).toEqual([0, 0.5, 1, 1.5, 2]);
});

test('a chain plays its patterns in turn and a pattern length shortens the loop', () => {
    const clock = fakeClock(), played = [];
    const b = bank({ chain: [0, 1], lengths: [4, 4], patterns: [{ rows: [row(0)], accent: null }, { rows: [row(2)], accent: null }] });
    const s = createScheduler({ now: () => clock.t, bank: () => b, tempo: () => 240, swing: () => 0.5, flam: () => 0.5, emit: (_e, info) => played.push(info.pattern), timers: clock.timers });
    s.start(0);
    clock.advance(2.2);
    s.stop();
    expect(played.slice(0, 6)).toEqual([0, 1, 0, 1, 0, 1]);
});

test('the drum target plays tracks by note and sends the accent as a per-hit override', () => {
    const kit = { id: 'tr808', tracks: [['bd', 'BD', 'Bass drum'], ['sd', 'SD', 'Snare drum']] };
    const noteOn = vi.fn(), pressure = vi.fn(), target = drumTarget(kit, () => ({ noteOn, pressure }), () => 0.5);
    target.trigger({ track: 1, time: 3.25, velocity: 1, params: { accent: 1, tune: -0.5 } });
    expect(pressure.mock.calls).toEqual([[1 * 4 + 1, 1, 3.25], [1 * 4 + 2, -0.5, 3.25]]);
    expect(noteOn).toHaveBeenCalledWith(801, 37, 1, 3.25);
    target.trigger({ track: 1, time: 4, velocity: 1, params: {} });
    expect(pressure).toHaveBeenCalledTimes(2);
    target.trigger({ track: 5, time: 1, velocity: 1, params: {} });
    expect(noteOn).toHaveBeenCalledTimes(2);
    expect(drumPattern(kit)([row(0), row(1), row(2)])).toEqual({ rows: [row(0), row(1)], accent: row(2), locks: undefined });
});

test('a step lock replaces the velocity and rides along as a parameter', () => {
    const pattern = { rows: [row(0, 4)], accent: null, locks: { 0: { 4: { velocity: 0.6, tune: 0.3 } } } };
    expect(stepEvents(pattern, 0, opts)[0]).toMatchObject({ velocity: 1, params: {} });
    expect(stepEvents(pattern, 4, opts)[0]).toMatchObject({ velocity: 0.6, params: { tune: 0.3 } });
});

test('the drum target reports the parameters it cannot realize and plays the hit anyway', () => {
    const kit = { id: 'tr808', tracks: [['bd', 'BD', 'Bass drum']] };
    const noteOn = vi.fn(), ignored = vi.fn(), target = drumTarget(kit, () => ({ noteOn }), () => 0.5, ignored);
    const event = { track: 0, time: 1, velocity: 1, params: { accent: 0.5, pan: 0.3 } };
    expect(target.unsupported(event)).toEqual(['pan']);
    target.trigger(event);
    expect(ignored).toHaveBeenCalledWith(event, ['pan']);
    expect(noteOn).toHaveBeenCalledTimes(1);
});

test('probability gates a hit, ratchet repeats it inside the step, nudge moves it', () => {
    const pattern = { rows: [row(0)], locks: { 0: { 0: { prob: 0.5, ratchet: 3, nudge: 0.25 } } } };
    expect(stepEvents(pattern, 0, { ...opts, random: () => 0.9 })).toEqual([]);
    const events = stepEvents(pattern, 0, { ...opts, random: () => 0.1 });
    expect(events.map((e) => +e.time.toFixed(5))).toEqual([10.03125, 10.07292, 10.11458]);
    expect(events[1].velocity).toBeLessThan(events[0].velocity);
    expect(events.map((e) => e.params.accent ?? 0)).toEqual([0, 0, 0]);
});

test('a track with its own length loops independently of the pattern (polymeter)', () => {
    const pattern = { rows: [row(0), row(0)], lengths: { 1: 3 } };
    const hits = (count) => stepEvents(pattern, count % 16, { ...opts, count }).map((e) => e.track);
    expect(hits(0)).toEqual([0, 1]);
    expect(hits(1)).toEqual([]);
    expect(hits(3)).toEqual([1]);
    expect(hits(6)).toEqual([1]);
});

test('the drum pattern reads the bank step values and track lengths', () => {
    const kit = { tracks: [['bd', 'BD', 'Bass drum']] };
    const bank = { locks: [{ '0:4': { prob: 0.5 } }], trackLengths: [{ 0: 12 }] };
    expect(drumPattern(kit)([row(4), row()], { bank, index: 0 })).toMatchObject({ locks: { 0: { 4: { prob: 0.5 } } }, lengths: { 0: 12 } });
});

test('conditions pick which loops a step plays on, and a held fill', () => {
    const base = { rows: [row(0)] };
    const plays = (cond, cycle, fill = false) => stepEvents({ ...base, locks: { 0: { 0: { cond } } } }, 0, { ...opts, cycle, fill }).length === 1;
    expect([0, 1, 2, 3].map((c) => plays('1:2', c))).toEqual([true, false, true, false]);
    expect([0, 1, 2, 3, 4, 5].map((c) => plays('3:3', c))).toEqual([false, false, true, false, false, true]);
    expect([plays('fill', 0), plays('fill', 0, true), plays('not-fill', 0), plays('not-fill', 0, true)]).toEqual([false, true, true, false]);
    expect(plays(undefined, 7)).toBe(true);
});

test('a song plays its blocks for their repeats, loops, or ends', () => {
    const run = (extra, seconds) => {
        const clock = fakeClock(), played = [], ended = vi.fn();
        const b = bank({ lengths: [2, 2], patterns: [{ rows: [row(0)], accent: null }, { rows: [row(1)], accent: null }], song: [{ p: 0, n: 2 }, { p: 1, n: 1 }], songOn: true, ...extra });
        const s = createScheduler({ now: () => clock.t, bank: () => b, tempo: () => 240, swing: () => 0.5, flam: () => 0.5, emit: (_e, info) => played.push(info.pattern), onEnd: ended, timers: clock.timers });
        s.start(0);
        clock.advance(seconds);
        return { played, ended, running: s.running };
    };
    // a step is 62.5 ms at 240 bpm, two steps a loop; pattern A hits on its first step and B on its second
    const looped = run({}, 1.6);
    expect(looped.played.slice(0, 6)).toEqual([0, 0, 1, 0, 0, 1]);
    expect(looped.ended).not.toHaveBeenCalled();
    const once = run({ songLoop: false }, 1.6);
    expect(once.played).toEqual([0, 0, 1]);
    expect(once.ended).toHaveBeenCalledTimes(1);
    expect(once.running).toBe(false);
});
