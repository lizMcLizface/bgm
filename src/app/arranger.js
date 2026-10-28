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
// The pad also moves within its register: each phrase it may lean its
// voicings a little lower or higher (inversions, so the top voice travels),
// pick a pattern for its style (pulse: per group, per beat, pushed, or
// low note / upper notes; arpeggio: bouncing, up, down, broken, sometimes
// twice as fast) and swells gently over the phrase.
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

// The colour layer (settings panel "Colour"): everything here is off or
// neutral by default, and draws nothing from the rng while it is, so pieces
// made without it stay as they were.
export const PEDAL_MODES = { off: 'Off', tonic: 'Tonic', fifth: 'Fifth' };
export const DEFAULT_PEDAL = { mode: 'off', amount: 0.5 }; // amount: the share of phrases whose bass holds the note
export const SPREADS = { close: 'Close', open: 'Open (second note from the top drops an octave)' };
export const LEAD_SCALES = { full: 'Whole scale', pentatonic: 'Pentatonic (no 4th / 7th, or 2nd / 6th in minor)' };
export const PAD_ROOTS = { always: 'Always play the chord root', unlessBass: 'Leave it to the bass when the bass plays it', never: 'Never (third, fifth and upper tones only)' };
/** The pitch classes the pad voices: the chord, without its root where `rule` says the bass has it. A triad without its root doubles the third, so the pad keeps three notes. */
export function padPitchClasses(pitchClasses, { rule = 'always', bassPc = null } = {}) {
    if (pitchClasses.length < 3 || rule === 'always' || (rule === 'unlessBass' && bassPc !== pitchClasses[0])) return pitchClasses;
    const rest = pitchClasses.slice(1);
    return rest.length >= 3 ? rest : [...rest, rest[0]];
}
export const LEAD_ENDINGS = { settled: 'Settle on the chord', open: 'Stay open (fifth or 2nd)' };

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
const pedalOf = (settings) => settings.pedal || DEFAULT_PEDAL;
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

// 'sequence' (running eighths or sixteenths) and 'drive' (a pulsing root
// line) are for the faster, driving presets and are off by default.
// rolled (a strummed chord) and stacked (the chord's notes entering one by
// one) are other ways of playing chords, for variety over a long listen.
export const PAD_STYLES = {
    sustain: 'Sustain', pulse: 'Pulse', arpeggio: 'Slow arpeggio', sequence: 'Running sequence',
    rolled: 'Rolled chord', stacked: 'Stacked entry',
};
export const BASS_STYLES = { whole: 'Whole bar', half: 'Per beat group', walking: 'Walking', drive: 'Driving pulse' };

// Relative weights per phrase (any scale; only ratios matter).
export const DEFAULT_PAD_WEIGHTS = { sustain: 55, pulse: 25, arpeggio: 20, sequence: 0, rolled: 10, stacked: 8 };
export const DEFAULT_BASS_WEIGHTS = { whole: 35, half: 45, walking: 20, drive: 0 };

const total = (weights) => Object.values(weights).reduce((sum, w) => sum + Math.max(0, w), 0);

/** Each style's share of phrases, 0..1, for display. All-zero = equal shares. */
export function styleShares(weights) {
    const sum = total(weights);
    const keys = Object.keys(weights);
    return Object.fromEntries(keys.map((k) => [k, sum > 0 ? Math.max(0, weights[k]) / sum : 1 / keys.length]));
}

// All weights at zero means "no preference", not "nothing".
const pickStyle = (rng, weights) => weighted(rng, total(weights) > 0 ? weights : styleShares(weights));

// How each pad style is played: a pattern per phrase, in proportion to
// its weight (as the styles).
export const PULSE_PATTERNS = { groups: 'On the beat groups', beats: 'Every beat', push: 'Pushed (early)', split: 'Low note, then chord' };
export const ARP_PATTERNS = { bounce: 'Up and down', up: 'Up', down: 'Down', broken: 'Broken (low, top, mid, top)' };
// The order a rolled or stacked chord's notes come in, a direction per phrase.
export const CHORD_DIRECTIONS = { up: 'Upwards', down: 'Downwards', out: 'Middle outward', in: 'Outside inward' };
export const DEFAULT_DIRECTION_WEIGHTS = { up: 35, down: 25, out: 20, in: 20 };
export const DEFAULT_PULSE_WEIGHTS = { groups: 35, beats: 20, push: 25, split: 20 };
export const DEFAULT_ARP_WEIGHTS = { bounce: 35, up: 25, down: 15, broken: 25 };
// lean: chance per phrase the voicings move to another spot in the
// register (0: always the middle); fast: chance an arpeggio runs in half
// units while the lead rests; swell: how much the level rises over a phrase.
export const DEFAULT_PAD_MOTION = { lean: 0.6, fast: 0.3, swell: 0.06 };
// Where the pad's voicings lean within its register: -1 low .. 1 high,
// in semitones from the middle per step.
const PAD_LIFT_STEP = 4.5;
const PAD_ARC = 6; // semitones between the pad's centre at the middle of a phrase and at its ends, at full padContour
const padMotionOf = (settings) => ({ ...DEFAULT_PAD_MOTION, ...settings.padMotion });
// Pad level over the four bars of a phrase: in, up to bar 3, settling.
const padSwell = (depth, index) => [1 - depth, 1, 1 + depth, 1 - depth / 3][index % PHRASE_BARS];

// Next phrase's lean: one step at most, back from the edges more often.
function nextPadLift(previous, lean, rng) {
    if (!lean) return 0;
    if (previous == null || !chance(rng, lean)) return previous ?? 0;
    if (previous !== 0) return chance(rng, 0.7) ? 0 : previous;
    return pick(rng, [-1, 1]);
}

// The pattern for a pad style (null for sustain), and the arpeggio's step
// in units: half a unit now and then when nothing else is busy.
function decidePadPattern(style, meter, leadActive, settings, rng) {
    if (style === 'pulse') return { pattern: pickStyle(rng, settings.pulseWeights || DEFAULT_PULSE_WEIGHTS), step: 1 };
    if (style === 'arpeggio') {
        const pattern = pickStyle(rng, settings.arpWeights || DEFAULT_ARP_WEIGHTS);
        const fast = !leadActive && meter.unitsPerBeat === 1 && chance(rng, padMotionOf(settings).fast);
        return { pattern, step: fast ? 0.5 : 1 };
    }
    if (style === 'sequence') {
        // eighths (the unit of a compound meter is one already), sixteenths now and then
        const pattern = pickStyle(rng, settings.arpWeights || DEFAULT_ARP_WEIGHTS);
        const fast = meter.unitsPerBeat === 1 && chance(rng, padMotionOf(settings).fast);
        return { pattern, step: meter.unitsPerBeat === 1 ? (fast ? 0.25 : 0.5) : 1 };
    }
    if (style === 'rolled' || style === 'stacked') return { pattern: pickStyle(rng, settings.directionWeights || DEFAULT_DIRECTION_WEIGHTS), step: 1 };
    return { pattern: null, step: 1 };
}

// Lead rhythm cells per beat group, [unit, length] within the group; [] is
// a rest.
// Busier cells (eighths and sixteenths) for the lead's density setting. Not
// for compound meters, whose unit is already an eighth.
const BUSY_CELLS = {
    2: [
        [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5]],
        [[0, 1], [1, 0.5], [1.5, 0.5]],
        [[0, 0.5], [0.5, 0.5], [1, 1]],
        [[0, 0.75], [0.75, 0.75], [1.5, 0.5]],
        [[0, 0.5], [0.5, 0.25], [0.75, 0.25], [1, 1]],
    ],
    3: [
        [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1]],
        [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1]],
        [[0, 1], [1, 1], [2, 0.5], [2.5, 0.5]],
    ],
};
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

// The scale without the notes that pull hardest toward a chord: the 4th and
// 7th of a major-ish scale, the 2nd and 6th of a minor-ish one. Only for
// 7-note scales; anything else stays whole.
export function pentatonicOf(scalePcs) {
    if (scalePcs.length !== 7) return scalePcs;
    const minor = (scalePcs[2] - scalePcs[0] + 12) % 12 === 3;
    const drop = minor ? [1, 5] : [3, 6];
    return scalePcs.filter((_, i) => !drop.includes(i));
}

// An open voicing: the second note from the top drops an octave (drop-2),
// keeping the chord's notes but spreading them wider.
export function openVoicing(voicing, low) {
    if (voicing.length < 3) return voicing;
    const out = voicing.slice();
    const at = out.length - 2;
    if (out[at] - 12 >= low - 12) out[at] -= 12;
    return out.sort((a, b) => a - b);
}

// --- phrase-level decisions ---------------------------------------------

// A bar of lead rhythm: one cell per beat group. Opening bars move (the
// first group always sounds); closing bars settle - the first group's cell,
// its last note held to the bar end - so each 2-bar motif breathes out.
function leadBar(meter, rng, closing, density = 0) {
    const starts = groupStarts(meter);
    const notes = [];
    meter.groups.forEach((size, g) => {
        if (closing && g > 0) return;
        // (no draw at density 0: pieces made before it exist stay as they were)
        const busy = density > 0 && meter.unitsPerBeat === 1 && chance(rng, density);
        const cells = busy ? BUSY_CELLS[size] : GROUP_CELLS[size].filter((c) => g > 0 || c.length > 0);
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

const makeMotif = (meter, rng, density = 0) => [leadBar(meter, rng, false, density), leadBar(meter, rng, true, density)];

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
// two Full sections in a row. null while sections are off. With
// `sections.quickIntro` the opening intro lasts one phrase and goes straight to Full.
function decideSection(bar, prevSection, sections, rng) {
    if (sections.mode === 'off') return null;
    if (!prevSection) {
        const type = bar === 0 ? 'intro' : 'build';
        return { type, start: bar, fulls: 0, ...(sections.quickIntro && type === 'intro' ? { bars: PHRASE_BARS } : {}) };
    }
    if (bar - prevSection.start < (prevSection.bars || sections.phrases * PHRASE_BARS)) return prevSection;
    if (sections.quickIntro && prevSection.type === 'intro') return { type: 'full', start: bar, fulls: 1 };
    const next = prevSection.type === 'full' && prevSection.fulls >= 2 ? { breakdown: 1 } : NEXT_SECTION[prevSection.type];
    const type = weighted(rng, next);
    return { type, start: bar, fulls: type === 'full' ? prevSection.fulls + 1 : 0 };
}

// What the second lead does this phrase (null: it rests). Draws nothing
// from rng while it is off, so pieces without it stay as they were.
function decideCounter({ mode, activity }, leadActive, meter, rng, density = 0) {
    if (mode === 'off') return null;
    if (mode === 'harmony') return leadActive ? { kind: 'harmony' } : null;
    if (mode === 'line') return { kind: 'line', bars: [lineBar(meter, rng, activity), lineBar(meter, rng, activity)] };
    if (!chance(rng, activity)) return null;
    if (leadActive) return { kind: 'echo', bars: [echoBar(meter, rng), echoBar(meter, rng)] };
    const motif = makeMotif(meter, rng, density);
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
    let motif = leadActive ? makeMotif(meter, rng, settings.leadDensity || 0) : null;
    // Sometimes the last phrase's tune comes round again (only drawn when it is on).
    const repeat = leadActive && settings.leadRepeat > 0 && prevPhrase && prevPhrase.leadActive && prevPhrase.motif && chance(rng, settings.leadRepeat);
    if (repeat) motif = prevPhrase.motif;

    let padStyle = pickStyle(rng, settings.padWeights);
    // Density budget: under the lead, re-pick among the other styles -
    // unless arpeggio is the only one allowed, which then wins.
    if (leadActive && settings.thinPadUnderLead && padStyle === 'arpeggio') {
        const others = { ...settings.padWeights, arpeggio: 0 };
        if (total(others) > 0) padStyle = weighted(rng, others);
    }

    const response = repeat ? prevPhrase.response : motif ? vary(motif, meter, rng) : null;
    const bassStyle = pickStyle(rng, settings.bassWeights);
    padStyle = shape.padStyle || padStyle;
    const { pattern: padPattern, step: padStep } = decidePadPattern(padStyle, meter, leadActive, settings, rng);
    const pedal = pedalOf(settings);
    const pedalNote = pedal.mode !== 'off' && chance(rng, pedal.amount) ? pedal.mode : null;
    const padLift = nextPadLift(prevPhrase && prevPhrase.padLift, padMotionOf(settings).lean, rng);

    return {
        start: bar,
        units: meter.units,
        octaves,
        leadActive,
        motif,
        response,
        padStyle,
        padPattern,
        padStep,
        padLift,
        bassStyle: shape.bassStyle || bassStyle,
        pedal: pedalNote,
        bass: shape.bass !== false,
        section,
        counter: shape.counter === false ? null : decideCounter(counterOf(settings), leadActive, meter, rng, settings.leadDensity || 0),
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

// Alberti-style order over n voices: low, top, next, top, ... (0,2,1,2).
function brokenOrder(n) {
    if (n < 3) return [...Array(n).keys()];
    const order = [0];
    for (let i = 1; i < n - 1; i++) order.push(n - 1, i);
    order.push(n - 1);
    return order;
}

// Strike times of a pulse pattern, in units.
function pulseHits(pattern, meter) {
    const starts = groupStarts(meter);
    const beats = beatStarts(meter);
    if (pattern === 'beats' && beats.length > starts.length) return beats;
    if (pattern === 'push' || pattern === 'beats') {
        // the downbeat, then each later group anticipated (a single group:
        // a push into its middle)
        const early = meter.unitsPerBeat === 1 ? 0.5 : 1;
        return starts.length > 1 ? [0, ...starts.slice(1).map((at) => at - early)] : [0, meter.units / 2];
    }
    return starts;
}

// Indices 0..n-1 (low to high) in the order a chord's notes come in.
export function chordOrder(direction, n) {
    const all = [...Array(n).keys()];
    if (direction === 'down') return all.reverse();
    if (direction === 'out') {
        // from the middle, alternating above and below
        const mid = Math.floor((n - 1) / 2);
        const order = [mid];
        for (let k = 1; order.length < n; k++) {
            if (mid + k < n) order.push(mid + k);
            if (mid - k >= 0) order.push(mid - k);
        }
        return order;
    }
    if (direction === 'in') {
        const order = [];
        for (let lo = 0, hi = n - 1; lo <= hi; lo++, hi--) {
            order.push(lo);
            if (hi !== lo) order.push(hi);
        }
        return order;
    }
    return all;
}

function padEvents({ chordStart, barsLeftInChord, meter, voicing, style, pattern, step = 1, thin, range, swell = 1, closeFigure = false }) {
    const base = (thin ? 0.48 : 0.6) * swell;
    const ev = (midi, beat, length, velocity) => ({ role: 'pad', midi, beat, length, velocity });

    if (style === 'pulse') {
        const starts = groupStarts(meter);
        if (pattern === 'split') {
            // low note on each group start, the upper notes on the units between
            const [low, ...upper] = voicing;
            return Array.from({ length: meter.units }, (_, u) => {
                const g = starts.indexOf(u);
                if (g >= 0) return [ev(low, u, meter.groups[g] * 0.95, g === 0 ? base : base * 0.85)];
                return upper.map((m) => ev(m, u, 0.9, base * 0.72));
            }).flat();
        }
        const hits = pulseHits(pattern, meter);
        return hits.flatMap((at, i) => {
            const length = ((i + 1 < hits.length ? hits[i + 1] : meter.units) - at) * 0.95;
            const accent = i === 0 ? 1 : starts.includes(at) ? 0.8 : 0.88;
            return voicing.map((m) => ev(m, at, length, base * accent));
        });
    }
    if (style === 'arpeggio' || style === 'sequence') {
        // the bottom note an octave up as well, where the register allows
        const top = voicing[0] + 12;
        const notes = range && top <= range[1] && !voicing.includes(top) ? [...voicing, top] : voicing;
        const n = notes.length;
        const broken = brokenOrder(n);
        const order = {
            up: (i) => i % n,
            down: (i) => n - 1 - (i % n),
            broken: (i) => broken[i % broken.length],
        }[pattern] || ((i) => bounce(i, n));
        // a sequence is detached - each note plucked, not blended into the next
        const length = style === 'sequence' ? 1.05 * step : 1.6 * step;
        const figure = Array.from({ length: Math.round(meter.units / step) }, (_, i) =>
            ev(notes[order(i)], i * step, length, base * (i === 0 ? 1 : (i * step) % 1 ? 0.75 : 0.85)));
        // The last note rings on past the bar line, so one on the bottom or top note, where the next bar's figure may open
        // (a down figure ending on the bottom note, then an up one) stops at the line instead of sounding twice.
        const last = figure[figure.length - 1];
        if (closeFigure && last && (last.midi === Math.min(...notes) || last.midi === Math.max(...notes))) last.length = Math.min(last.length, (meter.units - last.beat) * 0.95);
        return figure;
    }
    if (!chordStart) return [];
    const length = barsLeftInChord * meter.units * 0.95;
    if (style === 'rolled' || style === 'stacked') {
        // `order[rank]` is the voicing note that comes in rank-th
        const order = chordOrder(pattern, voicing.length);
        const last = Math.max(1, voicing.length - 1);
        return order.map((index, rank) => {
            // rolled: a strum, a quarter unit a note (on the sixteenth grid); stacked: a unit a note, all ringing on together
            const at = style === 'rolled' ? Math.min(rank, 4) * 0.25 : Math.min(rank, meter.units - 1);
            const level = style === 'rolled' ? 0.82 + 0.18 * (rank / last) : 0.7 + 0.3 * (rank / last);
            return ev(voicing[index], at, length - at, base * level);
        });
    }
    return voicing.map((m) => ev(m, 0, length, base));
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
    } else if (style === 'drive') {
        // a pulse on the root, an octave or a fifth thrown in, the last note leaning into the next chord
        const step = meter.unitsPerBeat === 1 ? 0.5 : 1;
        const count = Math.round(meter.units / step);
        const high = rootMidi + 12 <= range[1] ? rootMidi + 12 : rootMidi;
        for (let i = 0; i < count; i++) {
            const at = i * step;
            let midi = rootMidi;
            if (approach && i === count - 1) midi = approach;
            else if (i > 0 && i % 4 === 3) midi = chance(rng, 0.6) ? high : near(fifth);
            events.push(ev(midi, at, step * 0.8, beats.includes(at) ? 0.8 : 0.6));
        }
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
function melodyEvents({ role = 'lead', notes, chord, scalePcs, prevMidi, range, level = 1, scale = 'full', leaps = 0.5, ending = 'settled' }) {
    const chordNotes = notesInRange(chord.pitchClasses, range[0], range[1]);
    const scaleNotes = notesInRange(scale === 'pentatonic' ? pentatonicOf(scalePcs) : scalePcs, range[0], range[1]);
    const reach = leaps * 2; // 0.5 (the default) plays the moves as drawn
    const center = (range[0] + range[1]) / 2;
    let midi = prevMidi;
    const events = notes.map((note, i) => {
        // Drift back toward the middle of the register near its edges.
        const pull = midi > center + 7 ? -3 : midi < center - 7 ? 3 : 0;
        if (note.kind === 'step') {
            const index = scaleNotes.indexOf(nearest(scaleNotes, midi));
            midi = scaleNotes[Math.max(0, Math.min(scaleNotes.length - 1, index + note.move + Math.sign(pull)))];
        } else if (note.kind === 'resolve') {
            const stable = notesInRange(ending === 'open' ? [chord.pitchClasses[2] ?? chord.pitchClasses[0], scalePcs[1]] : [chord.pitchClasses[0], chord.pitchClasses[1]], range[0], range[1]);
            midi = nearest(stable, midi);
        } else {
            midi = nearest(chordNotes, midi + (reach === 1 ? note.move : Math.round(note.move * reach)) + pull);
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
 * @param {object} args.settings - { leadActivity 0..1, leadDensity 0..1 (busier rhythms), padWeights, bassWeights,
 *   thinPadUnderLead, pulseWeights, arpWeights, padMotion: { lean, fast, swell },
 *   voices: { pad|bass|lead|counter: { octave, wander, chance } },
 *   counter: { mode, activity }, sections: { mode, phrases } } (counter and
 *   sections optional: off)
 * @param {function} args.rng
 * @returns {{ events: object[], state: object }} event beats/lengths in units
 */
export function arrangeBar({ bar, meter, chord, nextChord, scalePcs, chordStart, barsLeftInChord, prev, settings, rng, phraseBars = PHRASE_BARS, phraseBoundary = bar % PHRASE_BARS === 0, closeFigure = false }) {
    // a new time signature (mid-phrase, while playing) needs rhythms in it
    const phrase = !prev || phraseBoundary || bar - prev.phrase.start >= phraseBars || prev.phrase.units !== meter.units
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
    // The phrase's lean pulls the voicing a little low or high in the range
    // (not while it follows an octave move - one jump at a time).
    // padContour: the pad rises toward the middle of a phrase and settles at its end, and its top voice prefers to move against the bass.
    const contour = settings.padContour ?? 0, phrasePos = Math.min(1, Math.max(0, (bar - phrase.start + 0.5) / Math.max(1, phraseBars)));
    const padTarget = padMoved ? null : (ranges.pad[0] + ranges.pad[1]) / 2 + (phrase.padLift || 0) * PAD_LIFT_STEP + contour * PAD_ARC * (Math.sin(Math.PI * phrasePos) - 0.65);
    // The bass pedal (if any) is decided before the pad so the pad can leave a root the bass is playing. Running figures (arpeggio, sequence) keep the full chord: three notes would repeat pitches.
    const pedalPc = phrase.pedal ? scalePcs[phrase.pedal === 'fifth' ? 4 % scalePcs.length : 0] : null;
    const padPcs = padPitchClasses(chord.pitchClasses, { rule: ['arpeggio', 'sequence'].includes(phrase.padStyle) ? 'always' : settings.padRoot, bassPc: phrase.bass === false ? null : (pedalPc ?? chord.pitchClasses[0]) });
    // Voice leading across a change of chord size is only used with the new pad rules, so a preset without them voices exactly as before.
    const sizeAware = (settings.padRoot ?? 'always') !== 'always' || settings.chordSize === 'functional';
    const voicing = chordStart || !prev || padMoved || prev.padVoicing.length !== padPcs.length
        ? voiceLead(padPcs, ranges.pad[0], ranges.pad[1], prev && (sizeAware || prev.padVoicing.length === padPcs.length) ? prev.padVoicing : null, padTarget,
            { contrary: contour * 4, against: prev && prev.bassMidi ? Math.sign(nearest(notesInRange([chord.pitchClasses[0]], ranges.bass[0], ranges.bass[1]), prev.bassMidi) - prev.bassMidi) : 0 })
        : prev.padVoicing;
    const pad = padEvents({
        chordStart: chordStart || !prev || padMoved,
        barsLeftInChord,
        meter,
        voicing: settings.chordSpread === 'open' ? openVoicing(voicing, ranges.pad[0]) : voicing,
        style: phrase.padStyle,
        pattern: phrase.padPattern,
        closeFigure,
        step: phrase.padStep,
        thin: phrase.leadActive && settings.thinPadUnderLead,
        range: ranges.pad,
        swell: padSwell(padMotionOf(settings).swell, bar - phrase.start),
    });

    // A pedal: the bass holds the key's tonic (or fifth) whatever the chord does.
    const bass = bassEvents({
        chord: pedalPc === null ? chord : { ...chord, pitchClasses: [pedalPc, ...chord.pitchClasses.slice(1)] },
        nextChord: pedalPc === null ? nextChord : null,
        meter,
        scalePcs,
        prevMidi: prev ? prev.bassMidi : BASS_CENTER,
        style: pedalPc === null ? phrase.bassStyle : 'whole',
        chordEnds: barsLeftInChord === 1,
        range: ranges.bass,
        rng,
    });

    const index = bar - phrase.start;
    const melodyColour = { scale: settings.leadScale, leaps: settings.leadLeaps ?? 0.5, ending: settings.leadEnding };
    let lead = { events: [], midi: prev ? prev.leadMidi : 79 };
    if (phrase.leadActive) {
        const source = index < 2 ? phrase.motif : phrase.response;
        lead = melodyEvents({ notes: source[index % 2], chord, scalePcs, prevMidi: lead.midi, range: ranges.lead, ...melodyColour });
    }

    let counter = { events: [], midi: (prev && prev.counterMidi) || 72 };
    const part = phrase.counter;
    if (part && part.kind === 'harmony') {
        counter = { events: harmonyEvents(lead.events, scalePcs, ranges.counter), midi: counter.midi };
    } else if (part) {
        const notes = {
            melody: () => (index < 2 ? part.motif : part.response)[index % 2],
            echo: () => (index % 2 === 1 ? part.bars[((index - 1) / 2) % part.bars.length] : []),
            line: () => part.bars[index % 2],
        }[part.kind]();
        counter = melodyEvents({ role: 'counter', notes, chord, scalePcs, prevMidi: counter.midi, range: ranges.counter, level: part.kind === 'melody' ? 1 : 0.85, ...melodyColour });
    }

    return {
        events: [...pad, ...(phrase.bass === false ? [] : bass.events), ...lead.events, ...counter.events],
        state: { phrase, padVoicing: voicing, bassMidi: bass.bassMidi, leadMidi: lead.midi, counterMidi: counter.midi, ranges },
    };
}
