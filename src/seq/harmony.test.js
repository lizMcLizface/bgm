import { describe, expect, it } from 'vitest';
import { makeKey, degreeToMidi, midiToDegree, chordTones, fitToRange, makeHarmony, harmonyAt, harmonyFromPattern, resolveNote } from './harmony';

const C = makeKey('Major-1', 0);

describe('degrees and pitches', () => {
    it('puts degree 0 on the tonic in the octave from middle C, and carries into octaves', () => {
        expect([0, 1, 2, 6, 7, 8, -1, -7].map((d) => degreeToMidi(C, { d }))).toEqual([60, 62, 64, 71, 72, 74, 59, 48]);
        expect(degreeToMidi(makeKey('Major-1', 2), { d: 0 })).toBe(62);
        expect(degreeToMidi(C, { d: 2, o: 1, a: -1 })).toBe(75);
    });
    it('works in a scale of another size', () => {
        const penta = makeKey('Pentatonic-1', 0);
        expect(penta.scale).toHaveLength(5);
        expect(degreeToMidi(penta, { d: 5 })).toBe(72);
    });
    it('finds the degree nearest a pitch, with the accidental that is left', () => {
        expect(midiToDegree(C, 64)).toEqual({ d: 2, o: 0, a: 0 });
        expect(midiToDegree(C, 61)).toEqual({ d: 0, o: 0, a: 1 });
        expect(midiToDegree(C, 70)).toEqual({ d: 5, o: 0, a: 1 }); // halfway between two degrees: the lower, sharpened
        for (const midi of [40, 59, 61, 66, 73, 90]) expect(degreeToMidi(C, midiToDegree(C, midi))).toBe(midi);
    });
});

describe('chords', () => {
    it('builds triads, sevenths and the vi chord of the key', () => {
        expect(chordTones(C, { d: 0 })).toEqual([60, 64, 67]);
        expect(chordTones(C, { d: 0, size: 4 })).toEqual([60, 64, 67, 71]);
        expect(chordTones(C, { d: 5 })).toEqual([69, 72, 76]);
        expect(chordTones(C, { d: 7 })).toEqual([72, 76, 79]);
    });
    it('inverts a chord by hand', () => {
        expect(chordTones(C, { d: 0, inv: 1 })).toEqual([64, 67, 72]);
        expect(chordTones(C, { d: 0, inv: 2 })).toEqual([67, 72, 76]);
        expect(chordTones(C, { d: 0, inv: 9 })).toEqual([67, 72, 76]); // as far as the chord has notes
    });
    it('opens, spreads and adds a bass note', () => {
        expect(chordTones(C, { d: 0, open: true })).toEqual([52, 60, 67]);
        expect(chordTones(C, { d: 0, spread: 1 })).toEqual([60, 64, 67, 72]);
        expect(chordTones(C, { d: 0, bass: true })).toEqual([48, 60, 64, 67]);
        expect(chordTones(C, { d: 5, inv: 1, bass: true })[0]).toBe(57); // the root, an octave below where it was
        expect(chordTones(C, { d: 0, size: 5, spread: 5, bass: true }).length).toBeLessThanOrEqual(8);
    });
    it('shifts a whole chord by octaves into a range, keeping its voicing', () => {
        expect(fitToRange([36, 40, 43], [48, 72])).toEqual([48, 52, 55]);
        expect(fitToRange([72, 76, 79], [48, 72])).toEqual([60, 64, 67]);
        expect(fitToRange([60, 64, 67], [48, 72])).toEqual([60, 64, 67]);
        expect(fitToRange([60, 64], null)).toEqual([60, 64]);
    });
});

describe('the harmony and its followers', () => {
    const harmony = makeHarmony(C, [{ d: 0, len: 8 }, { d: 5, len: 8 }]);
    it('holds each chord for its length and loops', () => {
        expect([0, 7, 8, 15, 16, 23, 24].map((s) => harmonyAt(harmony, s).index)).toEqual([0, 0, 1, 1, 0, 0, 1]);
        expect(harmonyAt(harmony, 9).tones).toEqual([69, 72, 76]);
    });
    it('is made from a chord sequencer pattern: a chord lasts until the next one', () => {
        const steps = Array(16).fill(null);
        steps[0] = { chord: { d: 0 } }; steps[8] = { chord: { d: 3 } };
        const h = harmonyFromPattern(C, { steps, length: 16 });
        expect(h.chords.map((c) => c.len)).toEqual([8, 8]);
        steps[0] = null; steps[4] = { chord: { d: 0 } };
        expect(harmonyFromPattern(C, { steps, length: 16 }).chords.map((c) => c.len)).toEqual([8, 8]); // the first chord also covers the steps before it
        expect(harmonyFromPattern(C, { steps: Array(16).fill(null), length: 16 })).toBeNull();
    });
    it('resolves a follower\'s note by scale, by chord tone, or not at all', () => {
        const at = (step, note, follow, extra = {}) => resolveNote(note, { follow, key: C, harmony, step, ...extra });
        expect(at(0, { d: 2 }, 'scale')).toBe(64);
        expect(at(9, { d: 2 }, 'scale')).toBe(64);                  // a scale follower ignores the chord
        expect([0, 1, 2, 3, 4, -1].map((d) => at(0, { d }, 'chord'))).toEqual([60, 64, 67, 72, 76, 55]);
        expect(at(9, { d: 0 }, 'chord')).toBe(69);                   // the root of the chord sounding at step 9 (vi)
        expect(at(0, { d: 0 }, 'chord', { octave: -2 })).toBe(36);
        expect(at(0, { midi: 50, a: 1 }, 'off')).toBe(51);
        expect(at(0, { d: 0 }, 'chord', { harmony: null })).toBe(60); // without a leader it reads the scale
    });
});
