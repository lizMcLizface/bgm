// Time signatures. A bar is `units` pulses long (what the Transport counts),
// split into beat `groups` (where accents and chord tones fall), and
// `unitsPerBeat` units make one felt beat - 1 for simple meters, 3 for 6/8
// (counted in eighths, felt in two dotted quarters). Tempo (BPM) always
// means felt beats per minute.

export const METERS = {
    '3/4': { label: '3/4', units: 3, groups: [3], unitsPerBeat: 1 },
    '4/4': { label: '4/4', units: 4, groups: [2, 2], unitsPerBeat: 1 },
    '5/4': { label: '5/4 (3+2)', units: 5, groups: [3, 2], unitsPerBeat: 1 },
    '6/8': { label: '6/8 (felt in 2)', units: 6, groups: [3, 3], unitsPerBeat: 3 },
    '7/4': { label: '7/4 (2+2+3)', units: 7, groups: [2, 2, 3], unitsPerBeat: 1 },
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

/** Transport pulses per minute for a felt tempo. */
export const unitsPerMinute = (meter, bpm) => bpm * meter.unitsPerBeat;
