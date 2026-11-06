// Effect moves for a sequenced device (after the front page's "Effect moves while Build plays", app/sequencer.js): effects of the device's rack
// that open, close or sweep across a pattern. Each move runs from its start value to its end value over `loops` loops of the pattern, then starts again.
// Pure: the caller (useRackMoves) turns the values into a rack patch, which the rack's own Web Audio glides to.
import { maskFromUnits, chainUnits, DEFAULT_CHAIN } from '../synths/effects/order';

/** Rack parameters a move may sweep: their ranges, and the rack unit each one needs in the chain to be heard. */
export const RACK_MOVES = {
    'inserts.phaser': { label: 'Phaser mix', min: 0, max: 1, unit: 'phaser' },
    'inserts.chorus': { label: 'Chorus mix', min: 0, max: 0.8, unit: 'chorus' },
    'inserts.flanger': { label: 'Flanger mix', min: 0, max: 1, unit: 'flanger' },
    'inserts.saturation': { label: 'Saturation', min: 0, max: 1, unit: 'saturation' },
    'effects.delay': { label: 'Delay', min: 0, max: 0.8, unit: 'space' },
    'effects.delayMs': { label: 'Delay spacing ms', min: 40, max: 2000, unit: 'space', log: true },
    'effects.feedback': { label: 'Delay feedback', min: 0, max: 0.85, unit: 'space' },
    'effects.reverb': { label: 'Reverb', min: 0, max: 0.8, unit: 'space' },
    'filter.low': { label: 'High-pass filter (Hz)', min: 20, max: 600, unit: 'filter', log: true },
    'filter.high': { label: 'Low-pass filter (Hz)', min: 1000, max: 20000, unit: 'filter', log: true },
};
export const MOVE_MAX = 6, MOVE_LOOPS = [1, 2, 4, 8];
const inRange = (key, v) => Number.isFinite(v) && v >= RACK_MOVES[key].min && v <= RACK_MOVES[key].max;

/** Stored moves from anything: { pattern: { loops, list: [{ key, from, to }] } }; bad parts are dropped. */
export function cleanMoves(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [p, entry] of Object.entries(raw)) {
        const i = Number(p);
        if (!Number.isInteger(i) || i < 0 || i > 255 || !Array.isArray(entry?.list)) continue;
        const list = entry.list.filter((m) => m && RACK_MOVES[m.key] && inRange(m.key, m.from) && inRange(m.key, m.to)).slice(0, MOVE_MAX).map(({ key, from, to }) => ({ key, from, to }));
        if (list.length) out[i] = { loops: MOVE_LOOPS.includes(entry.loops) ? entry.loops : 1, list };
    }
    return out;
}

/** The moves' values { key: value } at `progress` (0..1 through the span); frequencies and times move by ratio. */
export function moveAt(list, progress) {
    const p = Math.min(1, Math.max(0, progress));
    return Object.fromEntries(list.map(({ key, from, to }) => [key, RACK_MOVES[key].log ? from * (to / from) ** p : from + (to - from) * p]));
}

/** Where a pattern is in its move span: step `count` steps since the start (plus the part of a step gone), a pattern of `length` steps, over `loops` loops. */
export const moveProgress = (count, frac, length, loops) => {
    const span = Math.max(1, length) * loops;
    return (((count + Math.min(1, Math.max(0, frac))) % span) + span) % span / span;
};

/** The rack patch that plays the moves: the rack's own values, the moved ones over them, and the chain widened by the units the moves need. */
export function movedRack(rack, values) {
    const need = [...new Set(Object.keys(values).map((k) => RACK_MOVES[k]?.unit).filter(Boolean))];
    const chain = chainUnits(rack['master.chain'] ?? DEFAULT_CHAIN);
    return { ...rack, ...values, 'master.chain': maskFromUnits([...new Set([...chain, ...need])]) };
}
