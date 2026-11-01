import { describe, it, expect } from 'vitest';
import { bassOnsets, songBass, songRhythm, songPartCan, isRunning } from './songParts';
import { METERS } from '../meter';

const meter = METERS['4/4'], chord = { pitchClasses: [9, 0, 4, 7] }, range = [33, 57]; // A minor seventh
const note = (beat, degree, length = 1, accent = false) => ({ beat, degree, length, accent });
const tune = [note(0, 2, 1.5, true), note(1.5, 6, .5), note(2, 3, 1, true), note(3, 1)];
const bassBar = [{ role: 'bass', midi: 45, beat: 0, length: 3.8, velocity: .8 }];

describe('songPartCan', () => {
    it('says when a switch has nothing to change', () => {
        expect(songPartCan({ bassWeights: { whole: 0, half: 0, walking: 100, drive: 0 } }, 'bass')).toBe(false);
        expect(songPartCan({ bassWeights: { half: 50, walking: 50 } }, 'bass')).toBe(true);
        expect(songPartCan({ padWeights: { sustain: 100, rolled: 20 } }, 'rhythm')).toBe(false);
        expect(songPartCan({ padWeights: { sustain: 60, arpeggio: 10 } }, 'rhythm')).toBe(true);
        expect(songPartCan({ padWeights: { sustain: 100 }, layers: 'split' }, 'rhythm')).toBe(true);
        expect(songPartCan({ padWeights: { pulse: 100 }, sequencer: { on: true, arrangement: [1], lanes: true } }, 'rhythm')).toBe(false);
    });
});

describe('songBass', () => {
    it('starts on the root and plays only chord tones, in range, on the rhythm of the tune', () => {
        const out = songBass(bassBar, { notes: tune, style: 'half', chord, range, meter });
        expect(out[0]).toMatchObject({ role: 'bass', beat: 0, midi: 45 });
        expect(out.length).toBe(3);
        for (const e of out) {
            expect(chord.pitchClasses).toContain(e.midi % 12);
            expect(e.midi).toBeGreaterThanOrEqual(range[0]);
            expect(e.midi).toBeLessThanOrEqual(range[1]);
            expect(e.beat === 0 || tune.some((n) => n.beat === e.beat)).toBe(true);
            expect(e.beat + e.length).toBeLessThanOrEqual(meter.units);
        }
    });

    it('rises with the tune, and a whole-note bass stays sparse', () => {
        const up = songBass(bassBar, { notes: [note(0, 0, 2, true), note(2, 4, 2, true)], style: 'half', chord, range, meter });
        expect(up.map((e) => e.midi)).toEqual([45, 57]);
        expect(songBass(bassBar, { notes: tune, style: 'whole', chord, range, meter })).toHaveLength(2);
    });

    it('keeps a driving pulse and colours only the notes that fall with the tune', () => {
        const pulse = [0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat) => ({ role: 'bass', midi: 45, beat, length: .4, velocity: .7 }));
        const out = songBass(pulse, { notes: tune, style: 'drive', chord, range, meter });
        expect(out.map((e) => e.beat)).toEqual(pulse.map((e) => e.beat));
        expect(out.find((e) => e.beat === .5).midi).toBe(45);
        expect(out.find((e) => e.beat === 1.5).midi).not.toBe(45);
    });

    it('does not fall far for a nearby note of the tune', () => {
        const out = songBass(bassBar, { notes: [note(0, 2, 2, true), note(2, 1, 2, true)], style: 'half', chord, range, meter });
        expect(out[1].midi).toBe(48); // C above the A, not the C a sixth below
    });

    it('leaves a resting bar alone', () => {
        expect(songBass([], { notes: tune, style: 'half', chord, range, meter })).toEqual([]);
    });

    it('never crowds the notes, in any metre', () => {
        for (const m of Object.values(METERS)) {
            const beats = bassOnsets([note(0, 0), note(.25, 1), note(.5, 2), note(m.units - .5, 3)], { meter: m });
            beats.slice(1).forEach((b, i) => expect(b - beats[i]).toBeGreaterThanOrEqual(m.unitsPerBeat * .5));
        }
    });
});

describe('songRhythm', () => {
    // stabs with gaps of their own, not a running part
    const chords = [0, .5, 1.5, 2, 3, 3.5].flatMap((beat) => [60, 64, 67].map((midi) => ({ role: 'rhythm', midi, beat, length: .3, velocity: .6 })));
    const running = [0, .5, 1, 1.5, 2, 2.5, 3, 3.5].map((beat, i) => ({ role: 'pad', midi: [60, 64, 67, 72][i % 4], beat, length: .4, velocity: .6 }));

    it('stabs the chord on the theme rhythm, about as busy as the part was', () => {
        const out = songRhythm(chords, { notes: tune, style: 'pulse', meter });
        expect([...new Set(out.map((e) => e.beat))]).toEqual([0, .75, 1, 1.5, 2, 2.75, 3, 3.5]); // the cell twice, to stay about as busy
        expect(out.filter((e) => e.beat === 0).map((e) => e.midi)).toEqual([60, 64, 67]);
        expect(out.every((e) => e.role === 'rhythm' && e.length <= .3 + 1e-9)).toBe(true);
    });

    it('follows the shape of the tune as single notes when it is an arpeggio', () => {
        const out = songRhythm(chords, { notes: tune, style: 'arpeggio', meter });
        expect(out.find((e) => e.beat === .75).midi).toBe(67); // the tune's peak: the top of the chord
        expect(out.find((e) => e.beat === 0).midi).toBe(60);
        expect(new Set(out.map((e) => e.midi)).size).toBeGreaterThan(1);
    });

    it('does not turn an arpeggio into one repeated note under a tune that holds still', () => {
        const slow = [0, 1, 2, 3].map((beat, i) => ({ role: 'rhythm', midi: [60, 64, 67, 72][i], beat, length: .9, velocity: .6 }));
        const out = songRhythm(slow, { notes: [note(0, 3, 4, true)], style: 'arpeggio', meter });
        expect(out.map((e) => e.beat)).toEqual([0, 1, 2, 3]);
        expect(new Set(out.map((e) => e.midi)).size).toBe(4);
    });

    it('tells a running part from one that has its own gaps', () => {
        expect(isRunning(running, meter)).toBe(true);
        expect(isRunning(chords, meter)).toBe(false);
    });

    it('keeps every attack of a running arpeggio and shows the tune in it', () => {
        const out = songRhythm(running, { notes: tune, style: 'arpeggio', meter });
        expect(out.map((e) => e.beat)).toEqual(running.map((e) => e.beat));
        expect(out.map((e) => e.length)).toEqual(running.map((e) => e.length));
        expect(out.find((e) => e.beat === 1.5).midi).toBe(72); // the tune's peak: the top of the chord
        expect(out.find((e) => e.beat === .5).velocity).toBeLessThan(out.find((e) => e.beat === 0).velocity);
    });

    it('keeps a running pulse as it is, the tune only in its accents', () => {
        const pulse = running.flatMap((e) => [60, 64, 67].map((midi) => ({ ...e, midi })));
        const out = songRhythm(pulse, { notes: tune, style: 'pulse', meter });
        expect(out.map((e) => [e.beat, e.midi])).toEqual(pulse.map((e) => [e.beat, e.midi]));
        expect(out.find((e) => e.beat === .5).velocity).toBeLessThan(out.find((e) => e.beat === 1.5).velocity);
    });

    it('keeps a busy part busy under a sparse tune', () => {
        const out = songRhythm(chords, { notes: [note(0, 0, 2, true), note(2, 2, 2, true)], style: 'pulse', meter });
        expect(new Set(out.map((e) => e.beat)).size).toBeGreaterThanOrEqual(4);
    });

    it('leaves a resting part alone, and stays inside the bar in any metre', () => {
        expect(songRhythm([], { notes: tune, style: 'pulse', meter })).toEqual([]);
        for (const m of Object.values(METERS)) {
            const events = [0, 1].map((beat) => ({ role: 'pad', midi: 60, beat, length: .5, velocity: .6 }));
            for (const e of songRhythm(events, { notes: [note(0, 0), note(m.units / 2, 2)], style: 'sequence', meter: m })) {
                expect(e.beat).toBeLessThan(m.units);
                expect(e.length).toBeGreaterThan(0);
            }
        }
    });
});
