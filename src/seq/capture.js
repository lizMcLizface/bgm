// Capture: the front page generator's plan (Generator.plan, bar by bar: chord, and the events of every role) turned into sequencer patterns
// (docs/SEQUENCER_SYSTEM_PLAN.md, phase 6 started early so that what the sequencers play comes from the generator's own progression, voicings and lines).
// Pure: it takes plan records, not the generator. A record is { bar, chord: { numeral, name, ... }, events: [{ role, midi, beat, length, velocity }], music: { tonic, mode } };
// beats and lengths are in the meter's units (a unit is a beat), and a step is a quarter of a unit (sixteenths in a bar of quarter notes).
import { makeKey, midiToDegree } from './harmony';

export const STEPS_PER_UNIT = 4;
/** The parts the generator plays with notes (the percussion is the drum sequencer's). */
export const NOTE_ROLES = ['pad', 'bass', 'lead', 'counter', 'rhythm'];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * The pattern of one role over `records` (consecutive bars from 0): { mode, follow: 'scale', length, steps }. A step holds the notes that begin on it ({ n: [{ d, o, a }] }) with the
 * longest of their lengths in steps (`len`, a tie) and the loudest velocity. Several notes on a step make it a poly step; a role that never has more than one is a note pattern.
 */
export function capturePattern(records, role, { key, stepsPerBar }) {
    const length = records.length * stepsPerBar, steps = Array(length).fill(null);
    records.forEach((record, bar) => {
        for (const e of record.events ?? []) {
            if (e.role !== role || !Number.isFinite(e.midi)) continue;
            const at = bar * stepsPerBar + clamp(Math.round(e.beat * STEPS_PER_UNIT), 0, stepsPerBar - 1);
            const len = clamp(Math.round(e.length * STEPS_PER_UNIT), 1, length - at);
            const note = midiToDegree(key, e.midi), step = steps[at] ??= { n: [], vel: 0, len: 1 };
            if (step.n.some((x) => x.d === note.d && x.a === note.a)) continue;
            step.n.push({ d: note.d, o: 0, a: note.a });
            step.vel = Math.max(step.vel, clamp(e.velocity ?? 0.8, 0.05, 1));
            step.len = Math.max(step.len, len);
        }
    });
    const poly = steps.some((s) => s && s.n.length > 1);
    // a note that holds into the next step's start is cut there (heldSteps); a rest after it is the tie
    for (const s of steps) if (s) { s.n.sort((a, b) => a.d * 12 + a.a - (b.d * 12 + b.a)); s.vel = Math.round(s.vel * 100) / 100; if (s.len === 1) delete s.len; }
    return { mode: poly ? 'poly' : 'note', follow: 'scale', length, steps };
}

/** The chords by bar, for the display: [{ bar, name, numeral }] (a bar is listed when the chord changes). */
export function captureChords(records) {
    const out = [];
    records.forEach((record, bar) => {
        const name = record.chord?.name;
        if (name && out.at(-1)?.name !== name) out.push({ bar, name, numeral: record.chord.numeral });
    });
    return out;
}

/**
 * A project from the generator's plan records: { key, bars, stepsPerBar, chords, patterns: { role: pattern } }. The key is the first bar's tonic and mode (a later key lift
 * shows up as accidentals). Roles with no notes are left out.
 */
export function captureProject(records, { stepsPerBar = 16 } = {}) {
    if (!records.length) return null;
    const { tonic, mode } = records[0].music, key = makeKey(mode, tonic);
    const patterns = {};
    for (const role of NOTE_ROLES) {
        const p = capturePattern(records, role, { key, stepsPerBar });
        if (p.steps.some(Boolean)) patterns[role] = p;
    }
    return { key, bars: records.length, stepsPerBar, chords: captureChords(records), patterns };
}
