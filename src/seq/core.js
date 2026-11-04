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
//   lengths  { track: n } a track's own loop length in steps (polymeter): it counts from the start of playback
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

/**
 * The events a step plays. `step` is the step within the pattern (it sets swing); `count` counts steps since
 * playback began, which polymeter tracks loop on. `random` is injectable for tests.
 */
export function stepEvents(pattern, step, { time, stepSec, swing = 0.5, flam = 0.5, count = step, cycle = 0, fill = false, random = Math.random }) {
    const at = time + swingDelay(step, stepSec, swing), events = [];
    pattern.rows.forEach((row, track) => {
        const own = pattern.lengths?.[track], index = own ? count % own : step, v = row[index];
        if (!v) return;
        const lock = pattern.locks?.[track]?.[index] ?? {};
        const { velocity = 1, prob = 1, ratchet = 1, nudge = 0, cond, ...locked } = lock;
        if (!conditionHolds(cond, cycle, fill)) return;
        if (prob < 1 && random() >= prob) return;
        const accent = (pattern.accent?.[index] ?? 0) / 3, params = { ...(accent ? { accent } : {}), ...locked };
        const start = at + nudge * stepSec, repeats = Math.min(MAX_RATCHET, Math.max(1, Math.round(ratchet)));
        if (v === 2 && repeats === 1) events.push({ track, time: start - flamGap(flam), velocity: GRACE_VELOCITY, grace: true, params: {} });
        for (let k = 0; k < repeats; k++) events.push({ track, time: start + (k * stepSec) / repeats, velocity: ratchetVelocity(velocity, k), grace: false, params: k ? { ...params, accent: 0 } : params });
    });
    return events;
}
