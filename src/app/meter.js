// Time signatures. A bar is `units` pulses long (what the Transport counts),
// split into beat `groups` (where accents and chord tones fall), and
// `unitsPerBeat` units make one felt beat - 1 for simple meters, 3 for 6/8
// (counted in eighths, felt in two dotted quarters). Tempo (BPM) always
// means felt beats per minute - with `pace` (default 1) slowing the meters whose rhythms run in
// eighths (compound 0.75, uneven 0.8), so that changing meter at one tempo changes the felt
// speed somewhat, not by half again. The uneven eighth meters (5/8, 7/8) are counted in eighths with
// `unitsPerBeat` 2 (tempo in quarters) and name their felt beats, the groups' starts, in `beats`.
// Append only: links store a meter by its place in this list.

export const METERS = {
    '3/4': { label: '3/4', units: 3, groups: [3], unitsPerBeat: 1 },
    '4/4': { label: '4/4', units: 4, groups: [2, 2], unitsPerBeat: 1 },
    '5/4': { label: '5/4 (3+2)', units: 5, groups: [3, 2], unitsPerBeat: 1 },
    '6/8': { label: '6/8 (felt in 2)', units: 6, groups: [3, 3], unitsPerBeat: 3, pace: 0.75 },
    '7/4': { label: '7/4 (2+2+3)', units: 7, groups: [2, 2, 3], unitsPerBeat: 1 },
    '2/4': { label: '2/4', units: 2, groups: [2], unitsPerBeat: 1 },
    '6/4': { label: '6/4 (3+3)', units: 6, groups: [3, 3], unitsPerBeat: 1 },
    '9/8': { label: '9/8 (felt in 3)', units: 9, groups: [3, 3, 3], unitsPerBeat: 3, pace: 0.75 },
    '12/8': { label: '12/8 (felt in 4)', units: 12, groups: [3, 3, 3, 3], unitsPerBeat: 3, pace: 0.75 },
    '5/8': { label: '5/8 (3+2)', units: 5, groups: [3, 2], unitsPerBeat: 2, beats: [0, 3], pace: 0.8 },
    '7/8': { label: '7/8 (2+2+3)', units: 7, groups: [2, 2, 3], unitsPerBeat: 2, beats: [0, 2, 4], pace: 0.8 },
};

export const DEFAULT_METER = '4/4';

/** Start unit of each group: 5/4 -> [0, 3]. */
export function groupStarts(meter) {
    const starts = [];
    meter.groups.reduce((at, size) => {
        starts.push(at);
        return at + size;
    }, 0);
    return starts;
}

/** Start unit of each felt beat: 6/8 -> [0, 3]; 3/4 -> [0, 1, 2]. */
export function beatStarts(meter) {
    if (meter.beats) return [...meter.beats];
    const starts = [];
    for (let u = 0; u < meter.units; u += meter.unitsPerBeat) starts.push(u);
    return starts;
}

/**
 * Swing: in simple meters, notes on the second half of a beat move toward
 * its last third (amount 1 = triplet swing, 0 = straight), and are
 * shortened by as much so they don't run into the next. Compound meters
 * (6/8) already move in threes and are left as they are.
 */
export function swingEvents(events, meter, amount) {
    if (!amount || meter.unitsPerBeat !== 1) return;
    const delay = amount / 6;
    events.forEach((e) => {
        if (Math.abs(e.beat - Math.floor(e.beat) - 0.5) > 1e-6) return;
        e.beat += delay;
        e.length = Math.max(0.05, e.length - delay);
    });
}

/**
 * Half time: the first half of the bar's pattern stretched over the whole bar (the backbeat
 * on 2 moves to 3). Only for bars with an even number of units; others are left as they are.
 */
export function halfTime(events, meter) {
    if (meter.units % 2) return events;
    const half = meter.units / 2;
    return events.filter((e) => e.beat < half).map((e) => ({ ...e, beat: e.beat * 2, length: e.length * 2 }));
}

/** Transport pulses per minute for a felt tempo. */
export const unitsPerMinute = (meter, bpm) => bpm * meter.unitsPerBeat * (meter.pace ?? 1);
/** Seconds of one felt beat at a tempo. */
export const beatSeconds = (meter, bpm) => (60 * meter.unitsPerBeat) / unitsPerMinute(meter, bpm);
