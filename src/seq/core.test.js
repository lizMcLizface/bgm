import { stepEvents, flamGap, swingDelay, directedIndex, GRACE_VELOCITY } from './core';
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

test('a track on a faster division plays its row twice as fast, a slower one half as fast', () => {
    const pattern = { rows: [row(0, 1, 2, 3)], play: { 0: { div: '1/32' } } };
    const at = (step) => stepEvents(pattern, step, { ...opts, length: 16, count: step }).map((e) => e.time);
    expect(at(0)).toEqual([10, 10.0625]);       // steps 0 and 1 of the row inside one grid step
    expect(at(1)).toEqual([10, 10.0625]);       // steps 2 and 3
    expect(at(2)).toEqual([]);
    const slow = { rows: [row(0, 1)], play: { 0: { div: '1/8' } } };
    expect(stepEvents(slow, 0, { ...opts, length: 16 })).toHaveLength(1);
    expect(stepEvents(slow, 1, { ...opts, length: 16, count: 1 })).toHaveLength(0);   // an eighth plays every second grid step: steps 0 and 1 of the row at grid steps 0 and 2
    expect(stepEvents(slow, 2, { ...opts, length: 16, count: 2 })).toHaveLength(1);
});

test('a triplet division fits three steps in two grid steps', () => {
    const pattern = { rows: [row(0, 1, 2, 3, 4, 5)], play: { 0: { div: '1/16T' } } };
    const all = [0, 1, 2, 3].flatMap((s) => stepEvents(pattern, s, { ...opts, length: 16, count: s }).map((e) => +(e.time - 10 + s * 0.125).toFixed(4)));
    expect(all.slice(0, 4)).toEqual([0, 0.0833, 0.1667, 0.25]);   // 1/16T: 1.5 steps per grid step, so 0.0833 s apart at 0.125 s a step
});

test('direction reads a loop backwards, forth and back, or at random', () => {
    expect([0, 1, 2, 3, 4, 5].map((k) => directedIndex(k, 4, 'fwd'))).toEqual([0, 1, 2, 3, 0, 1]);
    expect([0, 1, 2, 3, 4].map((k) => directedIndex(k, 4, 'rev'))).toEqual([3, 2, 1, 0, 3]);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((k) => directedIndex(k, 4, 'ping'))).toEqual([0, 1, 2, 3, 2, 1, 0, 1]);
    expect(directedIndex(9, 4, 'rand', () => 0.74)).toBe(2);
    expect(directedIndex(3, 1, 'rev')).toBe(0);
});

test('a reversed track plays its last step first, and a track with no settings plays as before', () => {
    const pattern = { rows: [row(15), row(0)], play: { 0: { dir: 'rev' } } };
    expect(stepEvents(pattern, 0, { ...opts, length: 16 }).map((e) => e.track)).toEqual([0, 1]);
    expect(stepEvents(pattern, 15, { ...opts, length: 16 }).map((e) => e.track)).toEqual([]);
});

test('a song plays only the blocks between its loop in and out, and starts at the loop in', () => {
    const clock = fakeClock(), played = [];
    const patterns = [0, 1, 2, 3].map(() => ({ rows: [row(0)], accent: null }));
    const b = bank({ patterns, lengths: [1, 1, 1, 1], tempos: [0, 0, 0, 0], songOn: true, songLoop: true, song: [{ p: 0, n: 1 }, { p: 1, n: 1 }, { p: 2, n: 1 }, { p: 3, n: 1 }], loopIn: 1, loopOut: 2 });
    const s = createScheduler({ now: () => clock.t, bank: () => b, tempo: () => 240, swing: () => 0.5, flam: () => 0.5, emit: (_e, info) => played.push(info.pattern), timers: clock.timers });
    s.start(0);
    clock.advance(1.2);
    s.stop();
    expect(played.slice(0, 6)).toEqual([1, 2, 1, 2, 1, 2]);
});

test('patterns past the eighth play like any other', () => {
    const clock = fakeClock(), played = [];
    const patterns = Array.from({ length: 64 }, (_, i) => ({ rows: [row(i === 40 ? 0 : 1)], accent: null }));
    const b = { patterns, lengths: Array(64).fill(1), tempos: Array(64).fill(0), chain: [], current: 40 };
    const s = createScheduler({ now: () => clock.t, bank: () => b, tempo: () => 240, swing: () => 0.5, flam: () => 0.5, emit: (events, info) => played.push([info.pattern, events.length]), timers: clock.timers });
    s.start(0);
    clock.advance(0.2);
    s.stop();
    expect(played[0]).toEqual([40, 1]);
});

const stepsOf = (booked) => booked.map((i) => i.step);
const scheduler = (clock, b, booked, extra = {}) => createScheduler({ now: () => clock.t, bank: () => b, tempo: () => 240, swing: () => 0.5, flam: () => 0.5, emit: () => {}, onStep: (info) => booked.push(info), timers: clock.timers, ...extra });

test('pause keeps the place and resume goes on from it', () => {
    const clock = fakeClock(), booked = [];
    const s = scheduler(clock, bank({ lengths: [16, 16] }), booked);
    s.start(0);
    clock.advance(0.3);
    s.pause();
    const heard = stepsOf(booked), last = heard[heard.length - 1];
    expect(s.paused).toBe(true);
    expect(s.running).toBe(false);
    clock.advance(1);
    expect(booked).toHaveLength(heard.length);               // nothing is booked while paused
    s.resume(0);
    clock.advance(0.2);
    expect(stepsOf(booked)[heard.length]).toBe((last + 1) % 16);
    s.stop();
    expect(s.paused).toBe(false);
});

test('while stopped, stepping walks the pattern a step at a time, forward and back', () => {
    const clock = fakeClock(), booked = [];
    const s = scheduler(clock, bank(), booked);
    s.stepBy(1); s.stepBy(1); s.stepBy(1);
    expect(stepsOf(booked)).toEqual([0, 1, 2]);
    s.stepBy(-1);                                           // the step before the last one played
    expect(stepsOf(booked)).toEqual([0, 1, 2, 1]);
    expect(s.paused).toBe(true);
    expect(s.running).toBe(false);
});

test('while running, stepping moves the place instead of playing', () => {
    const clock = fakeClock(), booked = [];
    const s = scheduler(clock, bank(), booked);
    s.start(0);
    clock.advance(0.01);
    const before = s.position.step;
    s.stepBy(1);
    expect(s.position.step).toBe(before + 1);
    s.stepBy(-1); s.stepBy(-1);
    expect(s.position.step).toBe(before - 1);
    s.stop();
});

test('linear playback goes on through the patterns that have notes, and loop stays on the one being edited', () => {
    const patterns = [{ rows: [row(0)], accent: null }, { rows: [row()], accent: null }, { rows: [row(0)], accent: null }];
    const play = (extra) => {
        const clock = fakeClock(), played = [];
        const s = scheduler(clock, bank({ patterns, lengths: [1, 1, 1], tempos: [0, 0, 0], ...extra }), [], { onStep: (info) => played.push(info.pattern) });
        s.start(0); clock.advance(0.7); s.stop();
        return played.slice(0, 6);
    };
    expect(play({ linear: true })).toEqual([0, 2, 0, 2, 0, 2]);        // the empty pattern is passed over
    expect(play({ linear: false })).toEqual([0, 0, 0, 0, 0, 0]);
});

test('hold block repeats the current block of the song; goto moves to another', () => {
    const patterns = [0, 1, 2].map(() => ({ rows: [row(0)], accent: null }));
    const clock = fakeClock(), played = [];
    const b = bank({ patterns, lengths: [1, 1, 1], tempos: [0, 0, 0], songOn: true, songLoop: true, song: [{ p: 0, n: 1 }, { p: 1, n: 1 }, { p: 2, n: 1 }] });
    const s = scheduler(clock, b, [], { onStep: (info) => played.push(info.pattern) });
    s.start(0); clock.advance(0.3);
    expect(played.slice(0, 3)).toEqual([0, 1, 2]);
    b.holdBlock = true; s.gotoBlock(1); played.length = 0; clock.advance(0.5);
    expect(new Set(played)).toEqual(new Set([1]));                         // it stays on block 2
    b.holdBlock = false; s.gotoBlock(2); played.length = 0; clock.advance(0.3);
    expect(played[0]).toBe(2);
    s.stop();
});

test('the sequencer plays the pattern alone, whatever song there is, and a stop from it keeps the song\'s place', () => {
    const patterns = [0, 1, 2].map(() => ({ rows: [row(0)], accent: null }));
    const mk = () => bank({ patterns, lengths: [1, 1, 1], tempos: [0, 0, 0], current: 1, songOn: true, songLoop: true, song: [{ p: 0, n: 1 }, { p: 1, n: 1 }, { p: 2, n: 1 }], chain: [0, 1, 2] });
    const clock = fakeClock(), played = [];
    const s = createScheduler({ now: () => clock.t, bank: mk, tempo: () => 240, swing: () => 0.5, flam: () => 0.5, emit: () => {}, onStep: (i) => played.push(i.pattern), timers: clock.timers });
    const b = mk();
    const sc = createScheduler({ now: () => clock.t, bank: () => b, tempo: () => 240, swing: () => 0.5, flam: () => 0.5, emit: () => {}, onStep: (i) => played.push(i.pattern), timers: clock.timers });
    sc.start(0, 'pattern');
    clock.advance(0.4);
    expect(new Set(played)).toEqual(new Set([1]));          // only the pattern being edited, not the song
    expect(sc.scope).toBe('pattern');
    sc.stop(false);
    // the arranger then goes on from where the song was, and stop() from it rewinds
    played.length = 0;
    sc.start(0, 'song');
    clock.advance(0.2);
    expect(played[0]).toBe(0);                              // the song had not begun: its first block
    sc.stop(true);
    s.stop();
});

test('loop off in pattern scope goes on through the patterns with notes even when a song exists', () => {
    const patterns = [{ rows: [row(0)], accent: null }, { rows: [row(0)], accent: null }];
    const clock = fakeClock(), played = [];
    const b = bank({ patterns, lengths: [1, 1], tempos: [0, 0], linear: true, song: [{ p: 0, n: 8 }], songOn: true, chain: [0] });
    const s = createScheduler({ now: () => clock.t, bank: () => b, tempo: () => 240, swing: () => 0.5, flam: () => 0.5, emit: () => {}, onStep: (i) => played.push(i.pattern), timers: clock.timers });
    s.start(0, 'pattern'); clock.advance(0.5); s.stop();
    expect(played.slice(0, 4)).toEqual([0, 1, 0, 1]);
});

test('rows with their own length meet at every bar, unless they are set to run free', () => {
    const pattern = { rows: [row(0), row(0)], lengths: { 1: 3 } };
    const at = (count, extra = {}) => stepEvents(pattern, count % 16, { ...opts, count, ...extra }).map((e) => e.track);
    expect(at(16)).toEqual([0, 1]);                          // the second bar starts both rows together
    expect(at(32)).toEqual([0, 1]);
    expect(at(16, { free: true })).toEqual([0]);             // run free, the three-step row is a step behind
    expect(at(48, { free: true })).toEqual([0, 1]);          // and meets the bar again after 3 x 16 steps
});

describe('long patterns', () => {
    it('plays the steps past the first page and wraps at the pattern length', () => {
        const rows = [Array(48).fill(0)];
        rows[0][37] = 1;
        const events = [];
        let t = 0;
        const sch = createScheduler({
            now: () => t, bank: () => ({ patterns: [{ rows }], lengths: [40], tempos: [0], chain: [], current: 0 }), pattern: (p) => p,
            tempo: () => 120, swing: () => 0.5, flam: () => 0.5, emit: (e, info) => events.push(info.step), lookahead: 100,
            timers: { set: () => 1, clear: () => {} },
        });
        sch.start(0, 'pattern');
        expect(events).toContain(37);
        expect(Math.max(...events)).toBeLessThan(48);
        sch.stop();
    });
});
