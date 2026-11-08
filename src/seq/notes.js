// Pitched steps for the sequencers (docs/SEQUENCER_SYSTEM_PLAN.md): note, chord and poly patterns turned into timed note events. Pure; the sequencer core's scheduler books them.
//
// A pitched pattern: { mode: 'note' | 'chord' | 'poly', follow: 'scale' | 'chord' | 'off', octave, range: [low, high] | null, gate, length, steps }.
// A step is null (rest) or { n: [note, ...] } (note: one note; poly: up to seven; a note is { d, o, a }, or { midi } when following nothing) or { chord } (chord mode: a chord
// of harmony.js), with
//   vel 0..1, gate 0..1 (of the step; the pattern's by default), len (steps held: a tie, ended by the next step), nudge (-0.5..0.5 of a step), strum (-1..1: the notes begin one
//   after the other, low to high when positive, high to low when negative, over that share of the step), rept (1..8 repeats within the step), prob (0..1), cond (core.js conditions).
// Individual notes may also have `len`, an independent duration that is not cut by other steps.
// An event is { track, time, note, duration, velocity, params }, one per sounding note; times are seconds on the caller's clock.
import { conditionHolds, swingDelay } from './core';
import { chordTones, fitToRange, harmonyFromPattern, resolveNote } from './harmony';

export const MAX_REPT = 8;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** How many steps a step lasts: its `len`, cut short by the next step. */
export function heldSteps(pattern, step) {
    const length = pattern.length ?? pattern.steps.length, want = Math.max(1, Math.round(pattern.steps[step]?.len ?? 1));
    let held = 1;
    while (held < want && held < length && !pattern.steps[(step + held) % length]) held++;
    return held;
}

/** The pitches of a step (ascending for a chord), shifted by the pattern's octave and fitted into its range. */
export function stepPitches(pattern, step, { key, harmony = null, harmonyStep = step }) {
    const s = pattern.steps[step];
    if (!s) return [];
    const octave = pattern.octave ?? 0;
    const notes = s.chord
        ? chordTones(key, s.chord).map((x) => x + 12 * octave)
        : (s.n ?? []).map((note) => resolveNote(note, { follow: pattern.follow ?? 'scale', key, harmony, step: harmonyStep, octave }));
    return fitToRange(notes, s.range??pattern.range);
}

/** The events a step plays. `step` is the step within the pattern; `count` the steps since the start (the repeats of a step use `cycle` for conditions). */
export function noteStepEvents(pattern, step, { time, stepSec, swing = 0.5, cycle = 0, fill = false, key, harmony = null, harmonyStep = step, track = 0, random = Math.random }) {
    const s = pattern.steps[step];
    if (!s) return [];
    const individualChance = !!s.n?.some(note => note.prob !== undefined);
    if (!individualChance && s.prob !== undefined && random() >= s.prob) return [];
    if (!conditionHolds(s.cond, cycle, fill)) return [];
    const pitches = stepPitches(pattern, step, { key, harmony, harmonyStep });
    if (!pitches.length) return [];
    const rept = clamp(Math.round(s.rept ?? 1), 1, MAX_REPT), held = rept > 1 ? 1 : heldSteps(pattern, step);
    const gate = clamp(s.gate ?? pattern.gate ?? 0.8, 0.05, 1), velocity = clamp(s.vel ?? 0.8, 0.02, 1);
    const start = time + swingDelay(step, stepSec, swing) + (s.nudge ?? 0) * stepSec;
    const sub = stepSec / rept;
    const strum = clamp(s.strum ?? 0, -1, 1), spread = Math.abs(strum) * stepSec * 0.9;
    const ordered = pitches.map((note, i) => ({ note, data: s.chord ? null : s.n?.[i], len: s.chord ? held : Math.max(1, Math.round(s.n?.[i]?.len ?? held)) }));
    if (strum < 0) ordered.reverse();
    const events = [];
    for (let r = 0; r < rept; r++) {
        ordered.forEach(({ note, len, data }, i) => {
            const chance = individualChance ? (data?.prob ?? s.prob) : undefined;
            if (chance !== undefined && random() >= chance) return;
            const offset = ordered.length > 1 ? (spread * i) / (ordered.length - 1) : 0;
            const noteGate = clamp(data?.gate ?? gate, 0.05, 1), noteVelocity = clamp(data?.vel ?? velocity, 0.02, 1);
            const duration = rept > 1 ? noteGate * sub : (len - 1) * stepSec + noteGate * stepSec;
            events.push({ track, time: start + r * sub + offset, note, duration: Math.max(0.01, duration - offset), velocity: noteVelocity, params: {} });
        });
    }
    return events;
}

/**
 * A project's events for one step: every sequencer's. `project` is { key, leader (the index of the chord sequencer the others follow), sequencers: [{ pattern, mute }] }.
 * All sequencers are read at the same step (their patterns share the project's loop); a sequencer shorter than the loop repeats.
 */
const harmonies = new WeakMap();
export function projectStepEvents(project, step, ctx) {
    const leader = project.sequencers[project.leader]?.pattern;
    let harmony = null;
    if (leader) {
        const cached = harmonies.get(leader);
        harmony = cached && cached.key === project.key ? cached.harmony : harmonyFromPattern(project.key, leader);
        harmonies.set(leader, { key: project.key, harmony });
    }
    return project.sequencers.flatMap(({ pattern, mute }, track) => {
        if (mute || !pattern) return [];
        const own = pattern.length ?? pattern.steps.length;
        return noteStepEvents(pattern, step % own, { ...ctx, key: project.key, harmony, harmonyStep: step, track });
    });
}
