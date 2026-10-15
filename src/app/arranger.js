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
// A second lead (the counter role, settings.counter) can answer the lead in
// its held closing bars and take the melody when the lead rests, harmonise
// it a third below, or play its own slow line throughout.
//
// Sections (settings.sections) shape the energy over minutes: every few
// phrases the piece moves between Intro, Build, Full and Breakdown, which
// bring roles in and out and scale the lead's activity.
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
// The second lead sits between the pad and the lead.
export const COUNTER_RANGE = [62, 84];

// Octave offsets each role may use (keeps bass audible, lead not shrill).
export const OCTAVE_LIMITS = { pad: [-2, 1], bass: [-1, 1], lead: [-2, 1], counter: [-1, 1] };
export const OCTAVE_WANDER = { off: 'Off', centered: 'Centered on its octave', wandering: 'Wandering' };
export const DEFAULT_VOICES = {
    pad: { octave: 0, wander: 'off', chance: 0.3 },
    bass: { octave: 0, wander: 'off', chance: 0.3 },
    lead: { octave: 0, wander: 'off', chance: 0.3 },
    counter: { octave: 0, wander: 'off', chance: 0.3 },
};

export const COUNTER_MODES = { off: 'Off', answer: 'Answers the lead', harmony: 'Harmony with the lead', line: 'Own line, always' };
// activity: how often it answers / takes the melody, or how busy its line is
export const DEFAULT_COUNTER = { mode: 'off', activity: 0.5 };

export const SECTION_MODES = { off: 'Off', gentle: 'Gentle', strong: 'Strong' };
// Section length, in phrases.
export const SECTION_LENGTHS = [2, 4, 8];
export const DEFAULT_SECTIONS = { mode: 'off', phrases: 4 };

// What each section changes, per mode: a role set to false sits out, `lead`
// scales the lead's activity, padStyle / bassStyle replace the picked style.
export const SECTIONS = {
    intro: { label: 'Intro', gentle: { lead: 0.3, counter: false, bassStyle: 'whole' }, strong: { lead: 0, bass: false, counter: false } },
    build: { label: 'Build', gentle: { lead: 0.7 }, strong: { lead: 0.5, counter: false } },
    full: { label: 'Full', gentle: {}, strong: {} },
    breakdown: { label: 'Breakdown', gentle: { lead: 0.5, bassStyle: 'whole' }, strong: { lead: 0.6, bass: false, padStyle: 'sustain' } },
};
const NEXT_SECTION = {
    intro: { build: 1 },
    build: { full: 1 },
    full: { breakdown: 45, full: 35, build: 20 },
    breakdown: { build: 60, full: 40 },
};
const shift = ([lo, hi], octave) => [lo + 12 * octave, hi + 12 * octave];
// Settings made before a role or option existed fall back to its defaults.
const voiceOf = (settings, role) => (settings.voices && settings.voices[role]) || DEFAULT_VOICES[role];
const counterOf = (settings) => settings.counter || DEFAULT_COUNTER;
const sectionsOf = (settings) => settings.sections || DEFAULT_SECTIONS;
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

// The second lead's answer in a bar where the lead holds its last note:
// a few notes after the first beat group (after the first unit in 3/4).
function echoBar(meter, rng) {
    const starts = groupStarts(meter);
    const step = () => (chance(rng, 0.5) ? 1 : -1);
    if (meter.groups.length === 1) {
        return pick(rng, [[[1, 1], [2, 1]], [[1, 2]], [[2, 1]]]).map(([beat, length], i) =>
            ({ beat, length, kind: i === 0 ? 'chord' : 'step', move: i === 0 ? pick(rng, [-3, -2, 2, 3]) : step() }));
    }
    const notes = [];
    meter.groups.forEach((size, g) => {
        if (g === 0) return;
        const cells = GROUP_CELLS[size].filter((c) => g > 1 || c.length > 0);
        pick(rng, cells).forEach(([at, length]) => notes.push({ beat: starts[g] + at, length }));
    });
    return notes.map((note, i) => ({ ...note, kind: i === 0 ? 'chord' : 'step', move: i === 0 ? pick(rng, [-3, -2, 2, 3]) : step() }));
}

// A bar of the second lead's own line: long notes on beat-group starts,
// more of them the higher its activity.
function lineBar(meter, rng, activity) {
    const starts = groupStarts(meter).filter((at, g) => g === 0 || chance(rng, 0.25 + 0.5 * activity));
    return starts.map((beat, i) => ({
        beat,
        length: (i + 1 < starts.length ? starts[i + 1] : meter.units) - beat,
        kind: i === 0 ? 'chord' : 'step',
        move: i === 0 ? pick(rng, [-2, 0, 0, 2]) : (chance(rng, 0.5) ? 1 : -1),
    }));
}

// The section a phrase starting at `bar` belongs to: kept until it has
// lasted its length, then the next one by NEXT_SECTION - never more than
// two Full sections in a row. null while sections are off.
function decideSection(bar, prevSection, sections, rng) {
    if (sections.mode === 'off') return null;
    if (!prevSection) return { type: bar === 0 ? 'intro' : 'build', start: bar, fulls: 0 };
    if (bar - prevSection.start < sections.phrases * PHRASE_BARS) return prevSection;
    const next = prevSection.type === 'full' && prevSection.fulls >= 2 ? { breakdown: 1 } : NEXT_SECTION[prevSection.type];
    const type = weighted(rng, next);
    return { type, start: bar, fulls: type === 'full' ? prevSection.fulls + 1 : 0 };
}

// What the second lead does this phrase (null: it rests). Draws nothing
// from rng while it is off, so pieces without it stay as they were.
function decideCounter({ mode, activity }, leadActive, meter, rng) {
    if (mode === 'off') return null;
    if (mode === 'harmony') return leadActive ? { kind: 'harmony' } : null;
    if (mode === 'line') return { kind: 'line', bars: [lineBar(meter, rng, activity), lineBar(meter, rng, activity)] };
    if (!chance(rng, activity)) return null;
    if (leadActive) return { kind: 'echo', bars: [echoBar(meter, rng), echoBar(meter, rng)] };
    const motif = makeMotif(meter, rng);
    return { kind: 'melody', motif, response: vary(motif, meter, rng) };
}

function decidePhrase(bar, prevPhrase, meter, settings, rng) {
    const prevOctaves = (prevPhrase && prevPhrase.octaves) || {};
    const octaves = Object.fromEntries(Object.keys(OCTAVE_LIMITS).map((role) =>
        [role, nextOctave(role, prevOctaves[role], voiceOf(settings, role), rng)]));
    const sections = sectionsOf(settings);
    const section = decideSection(bar, prevPhrase && prevPhrase.section, sections, rng);
    const shape = section ? SECTIONS[section.type][sections.mode] : {};
    const activity = settings.leadActivity * (shape.lead ?? 1);
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

    const response = motif ? vary(motif, meter, rng) : null;
    const bassStyle = pickStyle(rng, settings.bassWeights);

    return {
        start: bar,
        octaves,
        leadActive,
        motif,
        response,
        padStyle: shape.padStyle || padStyle,
        bassStyle: shape.bassStyle || bassStyle,
        bass: shape.bass !== false,
        section,
        counter: shape.counter === false ? null : decideCounter(counterOf(settings), leadActive, meter, rng),
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

// A melodic line - the lead, or the second lead's own parts - over this
// bar's rhythm: chord tones on strong notes, scale steps between.
function melodyEvents({ role = 'lead', notes, chord, scalePcs, prevMidi, range, level = 1 }) {
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
            role,
            midi,
            beat: note.beat,
            length: Math.min(note.length, gap) * 0.95,
            velocity: (note.kind === 'step' ? 0.58 : 0.66) * level,
        };
    });
    return { events, midi };
}

// The lead's notes a diatonic third below (above, where below would leave
// the second lead's register), same rhythm, a little softer.
function harmonyEvents(leadNotes, scalePcs, range) {
    const scale = notesInRange(scalePcs, range[0] - 12, range[1] + 12);
    return leadNotes.map((e) => {
        const index = scale.indexOf(nearest(scale, e.midi));
        let midi = scale[Math.max(0, index - 2)];
        if (midi < range[0]) midi = scale[Math.min(scale.length - 1, index + 2)];
        while (midi > range[1]) midi -= 12;
        while (midi < range[0]) midi += 12;
        return { ...e, role: 'counter', midi, velocity: e.velocity * 0.8 };
    });
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
 *   thinPadUnderLead, voices: { pad|bass|lead|counter: { octave, wander, chance } },
 *   counter: { mode, activity }, sections: { mode, phrases } } (counter and
 *   sections optional: off)
 * @param {function} args.rng
 * @returns {{ events: object[], state: object }} event beats/lengths in units
 */
export function arrangeBar({ bar, meter, chord, nextChord, scalePcs, chordStart, barsLeftInChord, prev, settings, rng }) {
    const phrase = !prev || bar % PHRASE_BARS === 0 || bar - prev.phrase.start >= PHRASE_BARS
        ? decidePhrase(bar, prev && prev.phrase, meter, settings, rng)
        : prev.phrase;

    // With wander off a role sits at its home octave right away (a changed
    // setting doesn't wait for the next phrase); otherwise the phrase decides.
    const octave = (role) => (voiceOf(settings, role).wander === 'off' || phrase.octaves[role] === undefined
        ? clampOctave(role, voiceOf(settings, role).octave)
        : phrase.octaves[role]);
    const ranges = {
        pad: shift(PAD_RANGE, octave('pad')),
        bass: shift(BASS_RANGE, octave('bass')),
        lead: shift(LEAD_RANGE, octave('lead')),
        counter: shift(COUNTER_RANGE, octave('counter')),
    };

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

    const index = bar - phrase.start;
    let lead = { events: [], midi: prev ? prev.leadMidi : 79 };
    if (phrase.leadActive) {
        const source = index < 2 ? phrase.motif : phrase.response;
        lead = melodyEvents({ notes: source[index % 2], chord, scalePcs, prevMidi: lead.midi, range: ranges.lead });
    }

    let counter = { events: [], midi: (prev && prev.counterMidi) || 72 };
    const part = phrase.counter;
    if (part && part.kind === 'harmony') {
        counter = { events: harmonyEvents(lead.events, scalePcs, ranges.counter), midi: counter.midi };
    } else if (part) {
        const notes = {
            melody: () => (index < 2 ? part.motif : part.response)[index % 2],
            echo: () => (index % 2 === 1 ? part.bars[(index - 1) / 2] : []),
            line: () => part.bars[index % 2],
        }[part.kind]();
        counter = melodyEvents({ role: 'counter', notes, chord, scalePcs, prevMidi: counter.midi, range: ranges.counter, level: part.kind === 'melody' ? 1 : 0.85 });
    }

    return {
        events: [...pad, ...(phrase.bass === false ? [] : bass.events), ...lead.events, ...counter.events],
        state: { phrase, padVoicing: voicing, bassMidi: bass.bassMidi, leadMidi: lead.midi, counterMidi: counter.midi, ranges },
    };
}
