import { describe, expect, test } from 'vitest';
import { chordFit, describePart, directionOf, voicingParams, writtenChord } from './generatorSurveyParams';

const C = { pitchClasses: [0, 4, 7] }, Cmaj7 = { pitchClasses: [0, 4, 7, 11] };
const ev = (beat, midi, length = 1) => ({ beat, midi, length });
const voice = (midis, chord = C) => voicingParams(midis, chord, 'Major-1', 0);

describe('written chords', () => {
    test('names tones by role and the chord by its family', () => {
        expect(writtenChord(C)).toMatchObject({ family: 'triad', roles: ['root', 'third', 'fifth'] });
        expect(writtenChord({ pitchClasses: [0, 2, 7, 10] })).toMatchObject({ family: 'sus2 + 7th' });
        expect(writtenChord({ pitchClasses: [7, 11, 2, 5, 9] }).family).toBe('triad + 7th + 9th');
        expect(writtenChord({ pitchClasses: [0, 3, 6, 9] }).roles).toEqual(['root', 'third', 'fifth', 'seventh']);
    });
    test('finds the sequencer complexity and colour, or none for chords outside its set', () => {
        expect(chordFit(C, 'Major-1', 0)).toEqual({ complexity: 'triad', colour: 'plain' });
        expect(chordFit(Cmaj7, 'Major-1', 0)).toEqual({ complexity: 'seven', colour: 'plain' });
        expect(chordFit({ pitchClasses: [0, 2, 7] }, 'Major-1', 0)).toEqual({ complexity: 'triad', colour: 'sus2' });
        expect(chordFit({ pitchClasses: [10, 2, 5] }, 'Major-1', 0)).toBeNull(); // bVII is not a diatonic chord of C major
    });
});

describe('voicing parameters', () => {
    test('reads inversions from the lowest tone and fits the sequencer exactly', () => {
        expect(voice([60, 64, 67])).toMatchObject({ bassTone: 'root', inversion: 0, fit: 'Exact', params: { inversion: 0 } });
        expect(voice([64, 67, 72])).toMatchObject({ bassTone: 'third', inversion: 1, fit: 'Exact', params: { inversion: 1 } });
        expect(voice([67, 72, 76])).toMatchObject({ bassTone: 'fifth', inversion: 2, params: { inversion: 2 } });
    });
    test('names omitted tones and what the sequencer can do about them', () => {
        const rootless = voice([64, 67, 71], Cmaj7);
        expect(rootless).toMatchObject({ omitted: ['root'], fit: 'Exact', params: { rootVoicing: 'off' } });
        expect(voice([60, 64, 67], Cmaj7)).toMatchObject({ omitted: ['seventh'], params: { complexity: 'triad' } });
        expect(voice([60, 67, 71], Cmaj7)).toMatchObject({ omitted: ['third'] });
        expect(voice([60, 64, 71], Cmaj7)).toMatchObject({ omitted: ['fifth'], fit: 'No fit', reason: 'Omits fifth (not available)' });
    });
    test('separates open spacing and doubled tones from omissions', () => {
        expect(voice([60, 67, 76])).toMatchObject({ fit: 'Right tones, different spacing', reason: 'Open / wide spacing', omitted: [] });
        expect(voice([48, 64, 67])).toMatchObject({ fit: 'Exact', params: { rootVoicing: '-1' } });
        expect(voice([64, 67, 76])).toMatchObject({ doubled: true, omitted: ['root'] });
        expect(voice([60, 64, 67, 72])).toMatchObject({ doubled: true, fit: 'No fit', reason: 'Doubled root' });
        expect(voice([60, 63, 67])).toMatchObject({ fit: 'No fit', reason: 'Notes outside the written chord' });
    });
    test('an arpeggio figure drops its octave-up bottom note before fitting', () => {
        expect(voicingParams([60, 64, 67, 72], C, 'Major-1', 0, { arpeggiated: true })).toMatchObject({ octaveDouble: true, fit: 'Exact', size: 3 });
    });
});

describe('play parameters', () => {
    const play = (events, units = 4, slot = 1) => describePart(events, { chord: C, mode: 'Major-1', tonic: 0, units, slotBars: slot }).play;
    test('a held chord, a roll and a stack', () => {
        expect(play([ev(0, 60, 3.8), ev(0, 64, 3.8), ev(0, 67, 3.8)])).toMatchObject({ mode: 'chord', hold: 'sustain', lengthShare: 95 });
        expect(play([ev(0, 60, 3.8), ev(0.25, 64, 3.55), ev(0.5, 67, 3.3)])).toMatchObject({ mode: 'roll', direction: 'up', rate: 1, hold: 'end' });
        expect(play([ev(0, 67, 3.8), ev(0.25, 64, 3.55), ev(0.5, 60, 3.3)])).toMatchObject({ mode: 'roll', direction: 'down' });
        expect(play([ev(0, 60, 3.8), ev(1, 64, 2.8), ev(2, 67, 1.8)])).toMatchObject({ mode: 'stack' });
    });
    test('arpeggios report direction, rate and hold', () => {
        const up = [60, 64, 67, 72, 60, 64, 67, 72].map((m, i) => ev(i * 0.5, m, 0.8));
        expect(play(up)).toMatchObject({ mode: 'arp', direction: 'up', rate: 2, hold: 2 });
        const bounce = [60, 64, 67, 64, 60, 64, 67, 64].map((m, i) => ev(i * 0.5, m, 0.525));
        expect(play(bounce)).toMatchObject({ mode: 'arp', direction: 'upDown', hold: 1 });
        const rotated = [64, 67, 60, 64, 67, 60, 64, 67].map((m, i) => ev(i * 0.5, m, 0.8));
        expect(play(rotated).direction).toBe('up');
    });
    test('pulses and the split pulse', () => {
        expect(play([0, 1, 2, 3].flatMap(at => [60, 64, 67].map(m => ev(at, m, 0.95))))).toMatchObject({ mode: 'pulse', hold: 'tied to next hit', rate: 4 });
        const split = [ev(0, 48, 1.9), ev(1, 64, 0.9), ev(1, 67, 0.9), ev(2, 48, 1.9), ev(3, 64, 0.9), ev(3, 67, 0.9)];
        expect(play(split)).toMatchObject({ mode: 'split pulse' });
    });
    test('directions on small figures', () => {
        expect(directionOf([0, 1, 2], 3)).toBe('up');
        expect(directionOf([0, 2, 1, 2, 0, 2], 3)).toBe('broken');
        expect(directionOf([1, 2, 0], 3)).toBe('up');
    });
});

describe('sequencer gaps', () => {
    test('lists what a chord track cannot say', async () => {
        const { sequencerGaps } = await import('./generatorSurveyParams');
        const part = (events, chord = C) => describePart(events, { chord, mode: 'Major-1', tonic: 0, units: 4 });
        expect(sequencerGaps(part([ev(0, 60, 3.8), ev(0, 64, 3.8), ev(0, 67, 3.8)]))).toEqual([]);
        expect(sequencerGaps(part([ev(0, 60, 3.8), ev(0.25, 64, 3.55), ev(0.5, 67, 3.3)]))).toEqual(['play mode: roll']);
        expect(sequencerGaps(part([ev(0, 60, 3.8), ev(0, 64, 3.8), ev(0, 71, 3.8)], Cmaj7))).toEqual(['voicing: Omits fifth (not available)']);
    });
});

describe('figure variations', () => {
    test('names how a later bar plays the first bar figure', async () => {
        const { figureVariation } = await import('./generatorSurveyParams');
        const base = [60, 64, 67, 72];
        expect(figureVariation(base, base)).toBe('same');
        expect(figureVariation(base, [72, 67, 64, 60])).toBe('reverse');
        expect(figureVariation(base, [67, 72, 60, 64])).toBe('rotate');
        expect(figureVariation(base, [60, 64, 79, 84])).toBe('lift');
        expect(figureVariation(base, [60, 67, 72])).toBe('thin');
        expect(figureVariation(base, [60, 61, 62, 63])).toBe('other');
    });
});
