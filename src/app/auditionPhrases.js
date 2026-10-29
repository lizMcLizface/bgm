// Five short phrases for trying a sound out in the register it might be used in: a
// bass line with some bounce, a slow bass line, a held chord, a rhythmic arpeggio and a
// lead melody. They are built from a harmonic context - the key's scale and up to four
// chords - so they play what the music is playing: the generator's current chords
// (auditionContext.js), or the last ones it showed when a /synths page asks (rememberContext).
//
// A note is { midi, beat, beats, velocity }: where it starts and how long it lasts in
// beats of the phrase's own tempo.

import { readPref, writePref } from './prefs';

/** A minor, Am F C G: used until a context has been seen. */
export const DEFAULT_CONTEXT = {
    key: 'A Aeolian',
    scalePcs: [9, 11, 0, 2, 4, 5, 7],
    chords: [
        { name: 'Am', numeral: 'i', pitchClasses: [9, 0, 4] },
        { name: 'F', numeral: 'VI', pitchClasses: [5, 9, 0] },
        { name: 'C', numeral: 'III', pitchClasses: [0, 4, 7] },
        { name: 'G', numeral: 'VII', pitchClasses: [7, 11, 2] },
    ],
};

const CONTEXT_PREF = 'calmbgm.auditionContext';
let remembered = '';

/** Keeps the context for the /synths pages, which have no generator of their own. */
export function rememberContext(context) {
    const text = JSON.stringify(context);
    if (text === remembered) return;
    remembered = text;
    writePref(CONTEXT_PREF, context);
}

const valid = (c) => c && Array.isArray(c.scalePcs) && Array.isArray(c.chords) && c.chords.length > 0 && c.chords.every((x) => Array.isArray(x.pitchClasses) && x.pitchClasses.length);
export function recalledContext() {
    const stored = readPref(CONTEXT_PREF, null);
    return valid(stored) ? stored : DEFAULT_CONTEXT;
}

const n = (midi, beat, beats, velocity) => ({ midi, beat, beats, velocity });
const mod = (x) => ((x % 12) + 12) % 12;
/** The lowest note at or above `low` with the pitch class. */
const at = (pc, low) => low + mod(pc - low);
const rootOf = (chord) => chord.pitchClasses[0];

function bassShort({ chords, scalePcs }) {
    return chords.flatMap((chord, i) => {
        const b = i * 4, r = at(rootOf(chord), 33);
        const fifth = r + (chord.pitchClasses.includes(mod(rootOf(chord) + 6)) && !chord.pitchClasses.includes(mod(rootOf(chord) + 7)) ? 6 : 7);
        const next = at(rootOf(chords[(i + 1) % chords.length]), 33);
        // a step into the next root, from the scale below it
        const approach = next - (scalePcs.includes(mod(next - 2)) ? 2 : 1);
        return [n(r, b, 0.75, 0.95), n(r, b + 1, 0.25, 0.5), n(fifth, b + 1.5, 0.5, 0.8), n(r, b + 2, 0.5, 0.9),
            n(r + 12, b + 2.75, 0.25, 0.6), n(fifth, b + 3, 0.5, 0.75), n(approach, b + 3.5, 0.5, 0.65)];
    });
}

function bassSlow({ chords }) {
    return chords.map((chord, i) => n(at(rootOf(chord), 29), i * 4, i === chords.length - 1 ? 3.9 : 3.6, i % 2 ? 0.75 : 0.8));
}

function pad({ chords }) {
    return chords.slice(0, 2).flatMap((chord, i) => {
        const tones = [...new Set(chord.pitchClasses)].map((pc) => at(pc, 55)).sort((a, b) => a - b);
        const voicing = [at(rootOf(chord), 40), ...tones, at(rootOf(chord), 67)];
        return voicing.map((midi, j) => n(midi, i * 6 + j * 0.04, 5.6, 0.62 - i * 0.02));
    });
}

function arp({ chords }) {
    const shape = [0, 1, 2, 3, 2, 1, 2, 3];
    return chords.flatMap((chord, bar) => {
        const stack = [...new Set(chord.pitchClasses)].map((pc) => at(pc, 57)).sort((a, b) => a - b);
        // a triad goes on into the next octave
        const tones = [...stack];
        for (let i = 0; tones.length < 4; i++) tones.push(stack[i % stack.length] + 12);
        tones.sort((a, b) => a - b);
        return shape.map((i, step) => n(tones[i] + (step === 7 ? 12 : 0), bar * 4 + step * 0.5, 0.45, step % 4 === 0 ? 0.85 : step % 2 === 0 ? 0.65 : 0.5));
    });
}

function lead({ chords, scalePcs }) {
    const pool = [];
    for (let m = 64; m <= 93; m++) if (scalePcs.includes(mod(m))) pool.push(m);
    if (!pool.length) for (let m = 64; m <= 93; m++) pool.push(m);
    const nearest = (pcs, target) => pool.reduce((best, m, i) => (pcs.includes(mod(m)) && (best < 0 || Math.abs(m - target) < Math.abs(pool[best] - target)) ? i : best), -1);
    const motifs = [[0, 1, 2, 1], [0, -1, 1, 0], [0, 2, 1, -1], [0, -1, -2, 0]];
    const starts = [0, 1.5, 2, 3], lengths = [1.5, 0.5, 1, 1], velocities = [0.85, 0.7, 0.8, 0.65];
    let target = 76;
    return chords.flatMap((chord, i) => {
        const home = Math.max(0, nearest(chord.pitchClasses, target));
        const last = i === chords.length - 1;
        const notes = motifs[i % motifs.length].map((step, j) => {
            const midi = pool[Math.min(pool.length - 1, Math.max(0, home + step))];
            return n(midi, i * 4 + starts[j], j === 3 && last ? 2.5 : lengths[j], velocities[j]);
        });
        target = notes[3].midi;
        return notes;
    });
}

export const AUDITION_PHRASES = [
    { id: 'bass-short', label: 'Bass', title: 'A short bass line with some bounce', bpm: 104, make: bassShort },
    { id: 'bass-slow', label: 'Slow bass', title: 'A slow bass line, one long note per chord', bpm: 72, make: bassSlow },
    { id: 'pad', label: 'Chord', title: 'The first two chords, held', bpm: 66, make: pad },
    { id: 'arp', label: 'Arpeggio', title: 'A dynamic rhythmic arpeggio through the chords', bpm: 112, make: arp },
    { id: 'lead', label: 'Lead', title: 'A lead melody over the chords', bpm: 88, make: lead },
];

export const phraseById = (id) => AUDITION_PHRASES.find((p) => p.id === id);

/** The phrase's notes in seconds from `start`: [{ midi, time, duration, velocity }]. */
export function phraseEvents(id, context = DEFAULT_CONTEXT, start = 0) {
    const phrase = phraseById(id);
    if (!phrase) return [];
    const beat = 60 / phrase.bpm;
    return phrase.make(context).map(({ midi, beat: from, beats, velocity }) => ({ midi, time: start + from * beat, duration: beats * beat, velocity }));
}

/** How long the phrase lasts, notes' endings included, in seconds. */
export function phraseSeconds(id, context = DEFAULT_CONTEXT) {
    return phraseEvents(id, context).reduce((end, { time, duration }) => Math.max(end, time + duration), 0);
}
