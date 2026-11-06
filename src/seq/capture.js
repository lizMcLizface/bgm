// Capture: the front page generator's plan (Generator.plan, bar by bar: chord, and the events of every role) turned into sequencer patterns
// (docs/SEQUENCER_SYSTEM_PLAN.md, phase 6 started early so that what the sequencers play comes from the generator's own progression, voicings and lines).
// Pure: it takes plan records, not the generator. A record is { bar, chord: { numeral, name, ... }, events: [{ role, midi, beat, length, velocity }], music: { tonic, mode } };
// beats and lengths are in the meter's units (a unit is a beat), and a step is a quarter of a unit (sixteenths in a bar of quarter notes).
import { makeKey, midiToDegree } from './harmony';
import { DRUMS } from '../app/percussion';

export const STEPS_PER_UNIT = 4;
/** The parts the generator plays with notes (the percussion is the drum sequencer's). */
export const NOTE_ROLES = ['pad', 'bass', 'lead', 'counter', 'rhythm'];

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Plan at least the requested bars, finishing the generator's last progression. */
export function planCompleteProgressions(plan, bars) {
    for (let bar = 0; bar < bars; bar++) plan.planBar(bar);
    let end = bars;
    const cycle = plan.plan.get(end - 1).music.cycleStart;
    while (plan.plan.get(end - 1).nextMusic.cycleStart === cycle) {
        if (end - bars >= 512) throw new Error('Could not complete the final progression');
        plan.planBar(end++);
    }
    return Array.from({ length: end }, (_, bar) => plan.plan.get(bar));
}

/** Plan exactly the requested number of complete generator cycles. */
export function planProgressions(plan, count) {
    if (!Number.isInteger(count) || count < 1) throw new Error('Progression count must be a positive integer');
    let bar = 0, cycles = 0;
    while (cycles < count) {
        if (bar >= 8192) throw new Error('Could not complete the requested progressions');
        plan.planBar(bar);
        const record = plan.plan.get(bar);
        if (record.nextMusic.cycleStart !== record.music.cycleStart) cycles++;
        bar++;
    }
    return Array.from({ length: bar }, (_, i) => plan.plan.get(i));
}

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
            const source=e.chordSource;
            step.n.push({ d: note.d, o: 0, a: note.a, ...(source&&Number.isInteger(source.root)?{chordSource:{...source,group:`${role}:${bar}`}}:{}) });
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
        const previous = out.at(-1);
        const changed = previous?.name !== name ||
            JSON.stringify(previous?.pitchClasses) !== JSON.stringify(record.chord?.pitchClasses) ||
            JSON.stringify(previous?.scalePcs) !== JSON.stringify(record.chord?.scalePcs);
        if (name && changed) {
            const chord = { bar, name, numeral: record.chord.numeral };
            if (Array.isArray(record.chord.pitchClasses)) chord.pitchClasses = [...record.chord.pitchClasses];
            if (Array.isArray(record.chord.scalePcs)) chord.scalePcs = [...record.chord.scalePcs];
            out.push(chord);
        }
    });
    return out;
}

/** Capture simultaneous drum hits without converting their voice indices to pitches. */
export function captureDrums(records, { stepsPerBar }) {
    const length = records.length * stepsPerBar, steps = Array(length).fill(null);
    records.forEach((record, bar) => {
        for (const e of record.events ?? []) {
            if (e.role !== 'perc' || !Number.isInteger(e.midi) || e.midi < 0 || e.midi >= DRUMS.length) continue;
            const at = bar * stepsPerBar + clamp(Math.round(e.beat * STEPS_PER_UNIT), 0, stepsPerBar - 1);
            const hit = { drum: e.midi, velocity: clamp(e.velocity ?? 0.8, 0.05, 1), duration: Math.max(1, Math.round((e.length ?? 0.25) * STEPS_PER_UNIT)) };
            if (typeof e.track === 'string') hit.track = e.track;
            if (Number.isFinite(e.detune)) hit.vary = e.detune;
            const step = steps[at] ??= { hits: [] };
            step.hits.push(hit);
        }
    });
    return { mode: 'drums', length, steps };
}

/** Consecutive generator cycles, expressed as bar ranges in the captured song. */
export function captureProgressions(records) {
    const progressions = [];
    records.forEach((record, bar) => {
        const cycle = record.music?.cycleStart;
        const current = progressions[progressions.length - 1];
        if (!current || (cycle !== undefined && cycle !== current.cycle)) {
            progressions.push({ startBar: bar, bars: 1, cycle });
        } else {
            current.bars++;
        }
    });
    return progressions.map(({ startBar, bars }) => ({
        startBar, bars, chords: captureChords(records.slice(startBar, startBar + bars)),
    }));
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
    const drums = captureDrums(records, { stepsPerBar });
    if (drums.steps.some(Boolean)) patterns.perc = drums;
    return { key, bars: records.length, stepsPerBar, chords: captureChords(records), progressions: captureProgressions(records), patterns };
}
