// The sequencer core: device-agnostic (docs/SEQUENCER_DEVICE_PLAN.md, stage 2). It turns a pattern step
// into timed events and knows nothing about drums or chords; a target (./targets) decides what an event
// means. A pattern is { rows, accent?, locks?, lengths? }:
//   rows     one row of step values per track (0 off, 1 hit, 2 flam)
//   accent   an optional row of accent levels (0..3), the drum machines' accent row
//   locks    { track: { step: { velocity, prob, ratchet, nudge, ...parameters } } }, per-step values (the OXI's
//            parameter locks). velocity replaces the hit's velocity; prob (0..1) is the chance it plays; ratchet
//            (1..4) repeats it within the step; nudge (-0.5..0.5 of a step) moves it in time; the rest ride along
//            as the event's params
//            cond is a condition on the loop count: 'a:b' plays on the a-th of every b loops of the pattern, 'fill' only while
//            a fill is held, 'not-fill' only while it is not
//   lengths  { track: n } a track's own loop length in steps: it loops inside the pattern (or, when the caller says `free`, counts from the start of playback)
//   play     { track: { div, dir } } how a track plays (the OXI's Track page): div is a step division (DIVISIONS, against the
//            sixteenth-note grid), dir is the direction it reads its steps in (DIRECTIONS)
// An event is { track, time, velocity, grace, params }; time is in seconds on the caller's clock.

export const GRACE_VELOCITY = 0.45;
export const MAX_RATCHET = 4;
/** Whether a step's condition lets it play on loop `cycle` (counted from 0), with a fill held or not. */
export function conditionHolds(cond, cycle, fill) {
    if (!cond) return true;
    if (cond === 'fill') return !!fill;
    if (cond === 'not-fill') return !fill;
    const [a, b] = String(cond).split(':').map(Number);
    return !(b >= 1 && a >= 1) || cycle % b === a - 1;
}
/** The gap between a flam's grace note and its hit: 10 ms at flam 0 up to 45 ms at flam 1. */
export const flamGap = (flam) => 0.01 + 0.035 * Math.min(1, Math.max(0, flam));
/** The delay swing puts on an odd step: swing 0.5 is straight, 0.75 (triplet feel) delays by a full half step. */
export const swingDelay = (step, stepSec, swing) => (step % 2 === 1 ? (Math.min(0.75, Math.max(0.5, swing)) - 0.5) * 2 * stepSec : 0);

/** A ratchet's repeats are a little quieter each time, like a roll that decays. */
export const ratchetVelocity = (velocity, k) => velocity * (1 - 0.14 * k);

/** A track's step division as steps per grid step (n / d), slowest first. The grid is sixteenths, so a quarter is 1/4. */
export const DIVISIONS = [
    { id: '1/4', n: 1, d: 4 }, { id: '1/8', n: 1, d: 2 }, { id: '1/8T', n: 3, d: 4 }, { id: '1/16', n: 1, d: 1 }, { id: '1/16T', n: 3, d: 2 }, { id: '1/32', n: 2, d: 1 },
];
export const DIRECTIONS = ['fwd', 'rev', 'ping', 'rand'];
export const divisionOf = (id) => DIVISIONS.find((x) => x.id === id) ?? DIVISIONS[3];
/** The place of a track's k-th own step in a loop of `length` steps, read in direction `dir`. */
export function directedIndex(k, length, dir, random = Math.random) {
    if (length <= 1) return 0;
    if (dir === 'rev') return length - 1 - (k % length);
    if (dir === 'ping') { const m = k % (2 * length - 2); return m < length ? m : 2 * length - 2 - m; }
    if (dir === 'rand') return Math.floor(random() * length);
    return k % length;
}
/**
 * The own steps of a track that begin during one grid step: k from `first` up to (not including) `end`, each at a
 * `stepSec * d / n` pace, and `base`, the grid position they are counted from. A track with its own length loops inside the pattern and starts again
 * with it, so the rows meet at every bar; with `free` it counts from the start of playback instead and runs past the bar (a polymeter). Ping-pong
 * tracks, which need more than one pass, count from the start of playback.
 */
export function trackWindow(play, own, length, count, step, free = false) {
    const { n, d } = divisionOf(play?.div), dir = play?.dir ?? 'fwd', base = (own && free) || dir === 'ping' ? count : step;
    return { n, d, dir, base, L: own || length, first: Math.floor((base * n + d - 1) / d), end: Math.floor(((base + 1) * n + d - 1) / d) };
}

/**
 * The events a step plays. `step` is the step within the pattern (it sets swing); `count` counts steps since
 * playback began, which polymeter tracks loop on. `random` is injectable for tests.
 */
export function stepEvents(pattern, step, { time, stepSec, swing = 0.5, flam = 0.5, count = step, cycle = 0, fill = false, length = 16, free = false, random = Math.random }) {
    const events = [];
    pattern.rows.forEach((row, track) => {
        const w = trackWindow(pattern.play?.[track], pattern.lengths?.[track], length, count, step, free), straight = w.n === w.d;
        for (let k = w.first; k < w.end; k++) {
            const index = directedIndex(k, w.L, w.dir, random), v = row[index];
            if (!v) continue;
            const lock = pattern.locks?.[track]?.[index] ?? {};
            const { velocity = 1, prob = 1, ratchet = 1, nudge = 0, cond, ...locked } = lock;
            if (!conditionHolds(cond, cycle, fill)) continue;
            if (prob < 1 && random() >= prob) continue;
            const own = (stepSec * w.d) / w.n, at = time + ((k * w.d) / w.n - w.base) * stepSec + swingDelay(straight ? step : k, own, swing);
            const accent = (pattern.accent?.[index] ?? 0) / 3, params = { ...(accent ? { accent } : {}), ...locked };
            const start = at + nudge * own, repeats = Math.min(MAX_RATCHET, Math.max(1, Math.round(ratchet)));
            if (v === 2 && repeats === 1) events.push({ track, time: start - flamGap(flam), velocity: GRACE_VELOCITY, grace: true, params: {} });
            for (let r = 0; r < repeats; r++) events.push({ track, time: start + (r * own) / repeats, velocity: ratchetVelocity(velocity, r), grace: false, params: r ? { ...params, accent: 0 } : params });
        }
    });
    return events;
}
