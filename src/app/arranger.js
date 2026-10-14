// Arrangement rules (docs/DESIGN.md §3): turns one bar's harmony
// into note events for bass, pad and lead. Pure - all randomness comes
// from `rng`, and everything carried between bars travels in `state`, which
// the Generator stores with each planned bar. Re-planning from any bar
// therefore continues exactly from the bar before it.
//
// Musical shape: 4-bar phrases. At each phrase start the lead decides
// whether to play (a 2-bar motif as "call", a varied repeat as "response"
// that resolves onto a chord tone), and the pad and bass each pick a style
// in proportion to the user's style weights (0 = never; the only non-zero
// weight = always). The bass approaches each new chord stepwise; the pad
// thins while the lead plays (density budget).
//
// Each role plays in its register shifted by a per-role octave offset. With
// octave wander on, the offset may move one octave at a phrase start -
// centered around the role's home octave (and drifting back to it), or
// wandering within the role's audible limits.
//
// Rhythm is meter-aware (meter.js): event times are in the bar's units,
// accents and chord tones fall on beat-group starts, and lead rhythms are
// built per group. Output is exact - timing/velocity/pitch looseness is the
// Generator's humanize pass, so 0 there means truly mechanical.

import { voiceLead } from './theory';
import { chance, pick, weighted } from './random';
import { groupStarts, beatStarts } from './meter';

export const PHRASE_BARS = 4;

// Registers (MIDI). Pad G3..D5 (nothing muddy below C3), bass G1..D3
// (picked near the previous bass note), lead above the pad.
export const PAD_RANGE = [55, 74];
export const BASS_RANGE = [31, 50];
const BASS_CENTER = 40;
export const LEAD_RANGE = [69, 91];

// Octave offsets each role may use (keeps bass audible, lead not shrill).
export const OCTAVE_LIMITS = { pad: [-2, 1], bass: [-1, 1], lead: [-2, 1] };
export const OCTAVE_WANDER = { off: 'Off', centered: 'Centered on its octave', wandering: 'Wandering' };
export const DEFAULT_VOICES = {
    pad: { octave: 0, wander: 'off', chance: 0.3 },
    bass: { octave: 0, wander: 'off', chance: 0.3 },
    lead: { octave: 0, wander: 'off', chance: 0.3 },
};

const shift = ([lo, hi], octave) => [lo + 12 * octave, hi + 12 * octave];
const clampOctave = (role, o) => Math.max(OCTAVE_LIMITS[role][0], Math.min(OCTAVE_LIMITS[role][1], o));

// A role's octave for the next phrase: at most one octave from the last.
function nextOctave(role, previous, voice, rng) {
    const home = clampOctave(role, voice.octave);
    if (voice.wander === 'off' || previous === undefined) return home;
    if (voice.wander === 'centered') {
        if (previous !== home && chance(rng, 0.5)) return previous + Math.sign(home - previous);
        if (!chance(rng, voice.chance)) return previous;
        const options = [previous - 1, previous + 1].filter((o) => Math.abs(o - home) <= 1 && o === clampOctave(role, o));
        return options.length ? pick(rng, options) : previous;
    }
    if (!chance(rng, voice.chance)) return previous;
    const options = [previous - 1, previous + 1].filter((o) => o === clampOctave(role, o));
    return options.length ? pick(rng, options) : previous;
}

export const PAD_STYLES = { sustain: 'Sustain', pulse: 'Pulse', arpeggio: 'Slow arpeggio' };
export const BASS_STYLES = { whole: 'Whole bar', half: 'Per beat group', walking: 'Walking' };

// Relative weights per phrase (any scale; only ratios matter).
export const DEFAULT_PAD_WEIGHTS = { sustain: 55, pulse: 25, arpeggio: 20 };
export const DEFAULT_BASS_WEIGHTS = { whole: 35, half: 45, walking: 20 };

const total = (weights) => Object.values(weights).reduce((sum, w) => sum + Math.max(0, w), 0);

/** Each style's share of phrases, 0..1, for display. All-zero = equal shares. */
export function styleShares(weights) {
    const sum = total(weights);
    const keys = Object.keys(weights);
    return Object.fromEntries(keys.map((k) => [k, sum > 0 ? Math.max(0, weights[k]) / sum : 1 / keys.length]));
}

// All weights at zero means "no preference", not "nothing".
const pickStyle = (rng, weights) => weighted(rng, total(weights) > 0 ? weights : styleShares(weights));

// Lead rhythm cells per beat group, [unit, length] within the group; [] is
// a rest.
const GROUP_CELLS = {
    2: [[[0, 2]], [[0, 1], [1, 1]], [[0, 1.5], [1.5, 0.5]], [[0, 1]], []],
    3: [[[0, 3]], [[0, 2], [2, 1]], [[0, 1], [1, 2]], [[0, 1], [1, 1], [2, 1]], [[0, 2]], []],
};

/** All MIDI notes of the given pitch classes within [low, high], ascending. */
export function notesInRange(pitchClasses, low, high) {
    const notes = [];
    for (let m = low; m <= high; m++) {
        if (pitchClasses.includes(((m % 12) + 12) % 12)) notes.push(m);
    }
    return notes;
}

const nearest = (notes, target) =>
    notes.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best));

// --- phrase-level decisions ---------------------------------------------

// A bar of lead rhythm: one cell per beat group. Opening bars move (the
// first group always sounds); closing bars settle - the first group's cell,
// its last note held to the bar end - so each 2-bar motif breathes out.
function leadBar(meter, rng, closing) {
    const starts = groupStarts(meter);
    const notes = [];
    meter.groups.forEach((size, g) => {
        if (closing && g > 0) return;
        const cells = GROUP_CELLS[size].filter((c) => g > 0 || c.length > 0);
        pick(rng, cells).forEach(([at, length]) => notes.push({ beat: starts[g] + at, length }));
    });
    if (closing) {
        const last = notes[notes.length - 1];
        last.length = meter.units - last.beat;
    }
    return notes.map((note) => {
        const strong = starts.includes(note.beat);
        return {
            ...note,
            kind: strong ? 'chord' : 'step',
            // chord tones: preferred motion in semitones; steps: scale steps
            move: strong ? pick(rng, [-4, -2, 0, 2, 3, 5]) : (chance(rng, 0.5) ? 1 : -1) * (chance(rng, 0.8) ? 1 : 2),
        };
    });
}

const makeMotif = (meter, rng) => [leadBar(meter, rng, false), leadBar(meter, rng, true)];

// The response: same rhythm, contour nudged, a weak note sometimes dropped,
// and the phrase's last note resolving onto the chord and held to the bar end.
function vary(motif, meter, rng) {
    const response = motif.map((bar) => bar
        .filter((note, i) => i === 0 || note.kind === 'chord' || !chance(rng, 0.3))
        .map((note) => ({ ...note, move: chance(rng, 0.25) ? -note.move : note.move })));
    const lastBar = response[response.length - 1];
    const last = lastBar[lastBar.length - 1];
    lastBar[lastBar.length - 1] = { ...last, kind: 'resolve', length: meter.units - last.beat };
    return response;
}

function decidePhrase(bar, prevPhrase, meter, settings, rng) {
    const prevOctaves = (prevPhrase && prevPhrase.octaves) || {};
    const octaves = Object.fromEntries(Object.keys(OCTAVE_LIMITS).map((role) =>
        [role, nextOctave(role, prevOctaves[role], settings.voices[role], rng)]));
    const activity = settings.leadActivity;
    // After a phrase with lead, rest more often - room to breathe.
    const p = activity >= 1 ? 1 : prevPhrase && prevPhrase.leadActive ? activity * 0.7 : activity;
    const leadActive = chance(rng, p);
    const motif = leadActive ? makeMotif(meter, rng) : null;

    let padStyle = pickStyle(rng, settings.padWeights);
    // Density budget: under the lead, re-pick among the other styles -
    // unless arpeggio is the only one allowed, which then wins.
    if (leadActive && settings.thinPadUnderLead && padStyle === 'arpeggio') {
        const others = { ...settings.padWeights, arpeggio: 0 };
        if (total(others) > 0) padStyle = weighted(rng, others);
    }

    return {
        start: bar,
        octaves,
        leadActive,
        motif,
        response: motif ? vary(motif, meter, rng) : null,
        padStyle,
        bassStyle: pickStyle(rng, settings.bassWeights),
    };
}

// --- per-role bar realisation -------------------------------------------

// 0,1,2,1,0,1,2,... over n voices (bouncing arpeggio).
const bounce = (i, n) => {
    if (n < 2) return 0;
    const period = 2 * (n - 1);
    const k = i % period;
    return k < n ? k : period - k;
};

function padEvents({ chordStart, barsLeftInChord, meter, voicing, style, thin }) {
    const base = thin ? 0.48 : 0.6;
    const ev = (midi, beat, length, velocity) => ({ role: 'pad', midi, beat, length, velocity });

    if (style === 'pulse') {
        const starts = groupStarts(meter);
        return starts.flatMap((at, g) => voicing.map((m) => ev(m, at, meter.groups[g] * 0.95, g === 0 ? base : base * 0.8)));
    }
    if (style === 'arpeggio') {
        return Array.from({ length: meter.units }, (_, u) =>
            ev(voicing[bounce(u, voicing.length)], u, 1.6, base * (u === 0 ? 1 : 0.85)));
    }
    if (!chordStart) return [];
    return voicing.map((m) => ev(m, 0, barsLeftInChord * meter.units * 0.95, base));
}

// A scale note a step from `target`, on the side `from` comes from (so the
// line keeps travelling), or a chromatic lower neighbour now and then.
function approachNote(from, target, scalePcs, rng) {
    if (chance(rng, 0.25)) return target - 1;
    const scale = notesInRange(scalePcs, target - 3, target + 3);
    const below = scale.filter((n) => n < target).pop();
    const above = scale.find((n) => n > target);
    if (from > target && above !== undefined) return above;
    return below !== undefined ? below : target - 1;
}

function bassEvents({ chord, nextChord, meter, scalePcs, prevMidi, style, chordEnds, range, rng }) {
    const [root, third, fifth] = chord.pitchClasses;
    // Near the previous note, pulled a little toward the middle of the
    // range so the line doesn't drift to an edge (where the only in-range
    // root can be a big leap away). After an octave change, the pull is
    // what carries the line into the new register over a few bars.
    const center = BASS_CENTER + (range[0] - BASS_RANGE[0]);
    const target = prevMidi + (center - prevMidi) * 0.3;
    const rootMidi = nearest(notesInRange([root], range[0], range[1]), target);
    const near = (pc) => nearest(notesInRange([pc], range[0], range[1]), rootMidi);
    const ev = (midi, beat, length, velocity) => ({ role: 'bass', midi, beat, length, velocity });

    // Approach into the next chord on the last felt beat, when it changes.
    const approach = chordEnds && nextChord && nextChord.pitchClasses[0] !== root
        ? approachNote(rootMidi, near(nextChord.pitchClasses[0]), scalePcs, rng)
        : null;
    const beats = beatStarts(meter);
    const lastBeat = beats[beats.length - 1];
    const events = [];

    if (style === 'walking') {
        beats.forEach((at, i) => {
            let midi;
            if (i === 0) midi = rootMidi;
            else if (i === beats.length - 1) midi = approach || near(chance(rng, 0.5) ? root : third);
            else midi = near(pick(rng, [third, fifth, fifth]));
            events.push(ev(midi, at, meter.unitsPerBeat * 0.9, i === 0 ? 0.8 : 0.66));
        });
    } else if (style === 'half') {
        const starts = groupStarts(meter);
        starts.forEach((at, g) => {
            const midi = g === 0 ? rootMidi : near(chance(rng, 0.3) ? fifth : root);
            const end = approach && at < lastBeat ? Math.min(at + meter.groups[g], lastBeat) : at + meter.groups[g];
            if (approach && at >= lastBeat) return;
            events.push(ev(midi, at, (end - at) * 0.9, g === 0 ? 0.8 : 0.66));
        });
        if (approach && lastBeat > 0) events.push(ev(approach, lastBeat, meter.unitsPerBeat * 0.9, 0.62));
    } else if (approach && lastBeat > 0 && chance(rng, 0.5)) {
        events.push(ev(rootMidi, 0, lastBeat - 0.1, 0.8));
        events.push(ev(approach, lastBeat, meter.unitsPerBeat * 0.9, 0.62));
    } else {
        events.push(ev(rootMidi, 0, meter.units * 0.95, 0.8));
    }
    return { events, bassMidi: rootMidi };
}

function leadEvents({ notes, chord, scalePcs, prevMidi, range }) {
    const chordNotes = notesInRange(chord.pitchClasses, range[0], range[1]);
    const scaleNotes = notesInRange(scalePcs, range[0], range[1]);
    const center = (range[0] + range[1]) / 2;
    let midi = prevMidi;
    const events = notes.map((note, i) => {
        // Drift back toward the middle of the register near its edges.
        const pull = midi > center + 7 ? -3 : midi < center - 7 ? 3 : 0;
        if (note.kind === 'step') {
            const index = scaleNotes.indexOf(nearest(scaleNotes, midi));
            midi = scaleNotes[Math.max(0, Math.min(scaleNotes.length - 1, index + note.move + Math.sign(pull)))];
        } else if (note.kind === 'resolve') {
            const stable = notesInRange([chord.pitchClasses[0], chord.pitchClasses[1]], range[0], range[1]);
            midi = nearest(stable, midi);
        } else {
            midi = nearest(chordNotes, midi + note.move + pull);
        }
        // Legato up to the next note, never overlapping it.
        const gap = i + 1 < notes.length ? notes[i + 1].beat - note.beat : note.length;
        return {
            role: 'lead',
            midi,
            beat: note.beat,
            length: Math.min(note.length, gap) * 0.95,
            velocity: note.kind === 'step' ? 0.58 : 0.66,
        };
    });
    return { events, leadMidi: midi };
}

/**
 * Arranges one bar.
 * @param {object} args
 * @param {number} args.bar
 * @param {object} args.meter - from meter.js METERS
 * @param {object} args.chord - { pitchClasses } (root first)
 * @param {object|null} args.nextChord - the following bar's chord
 * @param {number[]} args.scalePcs - pitch classes of the current scale
 * @param {boolean} args.chordStart - this bar starts a chord
 * @param {number} args.barsLeftInChord - including this one
 * @param {object|null} args.prev - the previous bar's returned state
 * @param {object} args.settings - { leadActivity 0..1, padWeights, bassWeights,
 *   thinPadUnderLead, voices: { pad|bass|lead: { octave, wander, chance } } }
 * @param {function} args.rng
 * @returns {{ events: object[], state: object }} event beats/lengths in units
 */
export function arrangeBar({ bar, meter, chord, nextChord, scalePcs, chordStart, barsLeftInChord, prev, settings, rng }) {
    const phrase = !prev || bar % PHRASE_BARS === 0 || bar - prev.phrase.start >= PHRASE_BARS
        ? decidePhrase(bar, prev && prev.phrase, meter, settings, rng)
        : prev.phrase;

    // With wander off a role sits at its home octave right away (a changed
    // setting doesn't wait for the next phrase); otherwise the phrase decides.
    const octave = (role) => (settings.voices[role].wander === 'off'
        ? clampOctave(role, settings.voices[role].octave)
        : phrase.octaves[role]);
    const ranges = { pad: shift(PAD_RANGE, octave('pad')), bass: shift(BASS_RANGE, octave('bass')), lead: shift(LEAD_RANGE, octave('lead')) };

    // Re-voice on a new chord, or when the pad's register moved (voice
    // leading from the old voicing keeps that move as small as possible).
    const padMoved = prev && prev.padVoicing && prev.padVoicing.some((m) => m < ranges.pad[0] || m > ranges.pad[1]);
    const voicing = chordStart || !prev || padMoved || prev.padVoicing.length !== chord.pitchClasses.length
        ? voiceLead(chord.pitchClasses, ranges.pad[0], ranges.pad[1], prev && prev.padVoicing.length === chord.pitchClasses.length ? prev.padVoicing : null)
        : prev.padVoicing;
    const pad = padEvents({ chordStart: chordStart || !prev || padMoved, barsLeftInChord, meter, voicing, style: phrase.padStyle, thin: phrase.leadActive && settings.thinPadUnderLead });

    const bass = bassEvents({
        chord,
        nextChord,
        meter,
        scalePcs,
        prevMidi: prev ? prev.bassMidi : BASS_CENTER,
        style: phrase.bassStyle,
        chordEnds: barsLeftInChord === 1,
        range: ranges.bass,
        rng,
    });

    let lead = { events: [], leadMidi: prev ? prev.leadMidi : 79 };
    if (phrase.leadActive) {
        const index = bar - phrase.start;
        const source = index < 2 ? phrase.motif : phrase.response;
        lead = leadEvents({ notes: source[index % 2], chord, scalePcs, prevMidi: lead.leadMidi, range: ranges.lead });
    }

    return {
        events: [...pad, ...bass.events, ...lead.events],
        state: { phrase, padVoicing: voicing, bassMidi: bass.bassMidi, leadMidi: lead.leadMidi, ranges },
    };
}
