// The global clock: one reference for "where is the music now", for everything that follows the sequencer (modulation, effect moves, the playhead).
// The scheduler stays the authority on timing: it books each step at an audio time, and records that here as an anchor
// ({ count, time, stepSec, pattern, step, length }, count being steps since the start). Anything else asks `at(t)` for the position at an audio time:
// between two anchors it is interpolated, past the newest it carries on at that step's rate, and while stopped or paused it holds still.
// So tempo changes (a pattern's own tempo), pauses and loops are all followed exactly, and nobody keeps a counter of their own.

export function createClock({ keep = 256 } = {}) {
    let anchors = [], held = null;
    return {
        /** A booked step. Booking again after a pause or a start releases the hold. */
        record(anchor) {
            held = null;
            anchors.push(anchor);
            if (anchors.length > keep) anchors = anchors.slice(-keep);
        },
        /** The place stays where it is at audio time `t` until the next step is booked (pause), or is forgotten (stop). */
        halt(t, { forget = false } = {}) {
            held = forget ? null : this.at(t);
            if (forget) anchors = [];
            if (held) held = { ...held, running: false };
        },
        reset() { anchors = []; held = null; },
        get running() { return anchors.length > 0 && held === null; },
        /**
         * The position at audio time `t`: { count (steps, fractional), beat (count / 4), pattern, step (fractional, within the pattern), length, stepSec, running }
         * or null before anything was booked (or after a stop).
         */
        at(t) {
            if (held) return held;
            if (!anchors.length) return null;
            let i = anchors.length - 1;
            while (i > 0 && anchors[i].time > t) i--;
            const a = anchors[i], frac = Math.max(0, (t - a.time) / a.stepSec);
            // never more than a step past the anchor: before the first booking, or if booking stalls, the place does not run away
            const f = Math.min(frac, 1);
            const count = a.count + f;
            return { count, beat: count / 4, pattern: a.pattern, step: a.step + f, length: a.length, stepSec: a.stepSec, running: true };
        },
    };
}
