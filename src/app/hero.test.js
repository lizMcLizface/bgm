import { describe, expect, it } from 'vitest';
import { NECKS, foldIntoNeck, shapesFor, fingerMoments } from './heroFingering';
import { upcomingNotes } from './heroNotes';

describe('hero fingering', () => {
    const guitar = NECKS.guitar;
    it('folds pitches the neck cannot sound by octaves', () => {
        expect(foldIntoNeck(28, guitar)).toBe(40);
        expect(foldIntoNeck(100, guitar)).toBeLessThanOrEqual(guitar.strings.at(-1) + guitar.frets);
        expect(foldIntoNeck(60, guitar)).toBe(60);
        expect(foldIntoNeck(70, NECKS.bass)).toBeLessThanOrEqual(63);
    });

    it('gives a chord distinct strings within reach', () => {
        const [best] = shapesFor([48, 52, 55], guitar);
        expect(new Set(best.shape.map((p) => p.string)).size).toBe(3);
        best.shape.forEach((p) => expect(guitar.strings[p.string] + p.fret).toBe(p.midi));
        const frets = best.shape.filter((p) => p.fret > 0).map((p) => p.fret);
        expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(4);
    });

    it('keeps the hand close through a run of notes and sounds the right pitches', () => {
        const run = [64, 66, 67, 69, 71, 72, 71, 69].map((midi, i) => ({ time: i * 0.4, end: i * 0.4 + 0.3, pitches: [midi] }));
        const shapes = fingerMoments(run, guitar);
        shapes.forEach((shape, i) => expect(guitar.strings[shape[0].string] + shape[0].fret).toBe(run[i].pitches[0]));
        const frets = shapes.map((s) => s[0].fret);
        expect(Math.max(...frets) - Math.min(...frets)).toBeLessThanOrEqual(9);
    });

    it('does not put a new note on a string still ringing', () => {
        const [a, b] = fingerMoments([{ time: 0, end: 2, pitches: [64] }, { time: 0.5, end: 1, pitches: [59] }], guitar);
        expect(a[0].string).not.toBe(b[0].string);
    });

    it('works on the bass', () => {
        const shapes = fingerMoments([{ time: 0, end: 1, pitches: [foldIntoNeck(36, NECKS.bass)] }, { time: 1, end: 2, pitches: [43] }], NECKS.bass);
        expect(shapes).toHaveLength(2);
    });
});

describe('upcoming notes', () => {
    const meter = { units: 4, unitsPerBeat: 1, pace: 1 };
    const plan = [0, 1, 2].map((bar) => ({ bar, bpm: 120, meter, events: [{ role: 'lead', midi: 60 + bar, beat: 0, length: 2 }, { role: 'bass', midi: 40, beat: 2, length: 1 }] }));
    const generator = { getPlan: () => plan, beatsPerBar: 4, position: () => 4.5, meter };

    it('places notes in seconds from now using each bar tempo', () => {
        const { notes } = upcomingNotes(generator, ['lead'], 3);
        // bar 1 began half a beat (0.25 s at 120 bpm) ago and lasts 2 s
        expect(notes.map((n) => [n.midi, +n.t.toFixed(2), +n.dur.toFixed(2)])).toEqual([[61, -0.25, 1], [62, 1.75, 1]]);
    });

    it('filters by voice and look-ahead', () => {
        expect(upcomingNotes(generator, ['bass'], 1.8).notes.map((n) => n.midi)).toEqual([40]);
        expect(upcomingNotes(generator, ['lead'], 1).notes.map((n) => n.midi)).toEqual([61]);
    });
});
