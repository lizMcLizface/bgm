// Harmony for the sequencers (docs/SEQUENCER_SYSTEM_PLAN.md): a key, chords in it, and the way a note stored as a scale degree becomes a pitch. Pure.
//
// A key is a scale and a tonic. A stored note is { d, o, a }: `d` the scale degree (0 is the tonic, 7 in a seven-note scale is the tonic an octave up, negative goes below),
// `o` an octave offset, `a` an accidental in semitones. A chord is { d, size, colour, inv, open, spread, bass, o }: built on degree `d`, `size` notes (3 triad, 4 seventh,
// 5 ninth), a `colour` (app/theory.js CHORD_COLOURS), `inv` the inversion (0 root position, 1 first, ...), `open` the second note from the top an octave down, `spread` how many
// of the lowest notes are doubled an octave up, `bass` a root an octave below the lowest note, `o` octaves.
// Degree 0 of octave 0 sits in the octave from BASE (middle C): pitches around it, shifted by each sequencer's octave setting and range (fitToRange).
import { scaleById, scaleSemitones, diatonicChord } from '../app/theory';

export const BASE_MIDI = 60;
export const MAX_CHORD_NOTES = 8;
const mod = (a, n) => ((a % n) + n) % n;

/** A key: { scaleId, tonic (0..11), scale: semitone offsets of the degrees }. */
export function makeKey(scaleId = 'Major-1', tonic = 0) {
    return { scaleId, tonic: mod(Math.round(tonic), 12), scale: scaleSemitones(scaleById(scaleId).intervals) };
}

/** The pitch of a stored note { d, o, a } in a key. */
export function degreeToMidi(key, { d = 0, o = 0, a = 0 }, base = BASE_MIDI) {
    const n = key.scale.length, octave = Math.floor(d / n);
    return base + key.tonic + key.scale[mod(d, n)] + 12 * (octave + o) + a;
}

/** The stored note nearest a pitch: the degree below it, with the accidental that makes up the difference (or the degree above, flattened, when that is closer). */
export function midiToDegree(key, midi, base = BASE_MIDI) {
    const n = key.scale.length, rel = midi - base - key.tonic, octave = Math.floor(rel / 12), pc = rel - 12 * octave;
    let best = 0, bestDistance = Infinity;
    for (let i = 0; i <= n; i++) {
        const at = i === n ? 12 + key.scale[0] : key.scale[i], distance = Math.abs(pc - at);
        if (distance < bestDistance) { best = i; bestDistance = distance; }
    }
    const degree = octave * n + best;
    return { d: degree, o: 0, a: midi - degreeToMidi(key, { d: degree }, base) };
}

const sortedUnique = (notes) => [...new Set(notes)].sort((x, y) => x - y);

/** The chord's pitches (ascending, at most eight). */
export function chordTones(key, chord, base = BASE_MIDI) {
    const { d = 0, size = 3, colour = 'plain', inv = 0, open = false, spread = 0, bass = false, o = 0 } = chord;
    const n = key.scale.length, octave = Math.floor(d / n) + o;
    const offsets = diatonicChord(key.scale, mod(d, n) + 1, size, colour);
    const rootNote = base + key.tonic + offsets.reduce((lowest, x) => Math.min(lowest, x), Infinity) + 12 * octave;
    let notes = offsets.map((x) => base + key.tonic + x + 12 * octave).sort((x, y) => x - y);
    // inversions: the lowest note goes up an octave, once per step of inversion
    for (let i = 0; i < Math.min(Math.max(0, Math.round(inv)), notes.length - 1); i++) notes = sortedUnique([...notes.slice(1), notes[0] + 12]);
    // open voicing: the second note from the top drops an octave
    if (open && notes.length >= 3) { const at = notes.length - 2; notes = sortedUnique([...notes.slice(0, at), notes[at] - 12, ...notes.slice(at + 1)]); }
    // spread: the lowest notes doubled an octave up
    if (spread > 0) notes = sortedUnique([...notes, ...notes.slice(0, Math.round(spread)).map((x) => x + 12)]);
    if (bass) notes = sortedUnique([rootNote - 12, ...notes]);
    return notes.slice(0, MAX_CHORD_NOTES);
}

/** The notes shifted by whole octaves, together (a chord keeps its voicing), to lie inside [low, high] as far as they can; the lowest note wins when they do not all fit. */
export function fitToRange(notes, range) {
    if (!range || !notes.length) return notes;
    const [low, high] = range, lowest = Math.min(...notes), highest = Math.max(...notes);
    let shift = 0;
    while (lowest + shift < low) shift += 12;
    while (highest + shift > high && lowest + shift - 12 >= low) shift -= 12;
    return shift ? notes.map((x) => x + shift) : notes;
}

/**
 * The harmony: the chords of a progression, each held for `len` steps (the chord sequencer's steps, a chord lasting until the next one), over a loop of `total` steps.
 * `chords`: [{ len, ...chord }]. Returns { key, chords, total, tones } with the chords' pitches worked out once.
 */
export function makeHarmony(key, chords) {
    const list = chords.map((c) => ({ ...c, len: Math.max(1, Math.round(c.len ?? 16)) }));
    let at = 0;
    const spans = list.map((c) => { const start = at; at += c.len; return { start, end: at }; });
    return { key, chords: list, spans, total: at || 1, tones: list.map((c) => chordTones(key, c)) };
}

/** The chord sounding at `step` (the harmony loops): { index, chord, tones, start }. */
export function harmonyAt(harmony, step) {
    const at = mod(Math.floor(step), harmony.total);
    const index = harmony.spans.findIndex((s) => at >= s.start && at < s.end);
    return { index, chord: harmony.chords[index], tones: harmony.tones[index], start: harmony.spans[index].start };
}

/**
 * The harmony a chord sequencer's pattern makes: its chord steps (`steps[i] = { chord }`), each held until the next chord step (a rest or a tie does not end a chord),
 * the first chord also covering any steps before it. Null when the pattern has no chord.
 */
export function harmonyFromPattern(key, pattern) {
    const steps = pattern.steps ?? [], length = pattern.length ?? steps.length, starts = [];
    for (let i = 0; i < length; i++) if (steps[i]?.chord) starts.push(i);
    if (!starts.length) return null;
    const chords = starts.map((at, k) => ({ ...steps[at].chord, len: (k + 1 < starts.length ? starts[k + 1] : length) - at }));
    if (starts[0] > 0) chords[0].len += starts[0];
    return makeHarmony(key, chords);
}

/** How a follower reads its stored notes: 'scale' (degrees of the key), 'chord' (tones of the chord sounding: 0 the root, 1 the next tone up, ...), 'off' (absolute: { midi }). */
export const FOLLOW = ['scale', 'chord', 'off'];

/**
 * The pitch of a stored note for a sequencer that follows. `octave` is the sequencer's octave setting; `harmony` and `step` are needed for 'chord'.
 * (Chord tones for a follower are the chord in root position: tone k is the k-th note up the chord, wrapping into the next octave.)
 */
export function resolveNote(note, { follow = 'scale', key, harmony = null, step = 0, octave = 0 }) {
    if (follow === 'off') return (note.midi ?? BASE_MIDI) + 12 * ((note.o ?? 0) + octave) + (note.a ?? 0);
    if (follow === 'chord' && harmony) {
        const { chord } = harmonyAt(harmony, step), tones = chordTones(key, { ...chord, inv: 0, open: false, spread: 0, bass: false }), m = tones.length, d = note.d ?? 0;
        return tones[mod(d, m)] + 12 * (Math.floor(d / m) + (note.o ?? 0) + octave) + (note.a ?? 0);
    }
    return degreeToMidi(key, { d: note.d ?? 0, o: (note.o ?? 0) + octave, a: note.a ?? 0 });
}
