import { describe, expect, test } from 'vitest';
import { chordReferenceDiagnostics, compareChordConversion, pitchClassDifference } from './generatorSurveyChords';
import { capturePattern } from '../src/seq/capture';
import { makeKey, degreeToMidi } from '../src/seq/harmony';
import { generatedChords, placedChordTones } from '../src/synths/all/placedChords';

const chord = { pitchClasses: [0, 4, 7] };
const voicing = notes => chordVoicing(notes.map(midi => ({ midi })), chord);
const bar = (style, notes) => ({
    meter: { units: 4 }, music: { mode: 'Major-1', tonic: 0 },
    events: notes.map(([beat, midi]) => ({ role: 'pad', beat, midi, length: 1, velocity: .8,
        chordSource: { root: 0, style, pattern: null, step: 1 } })),
});

describe('survey chord comparisons', () => {
    test('compares actual pitches and quantized attacks to the existing converter', () => {
        const exact = compareChordConversion(bar('sustain', [[0, 60], [0, 64], [0, 67]]), 'pad');
        expect(exact).toMatchObject({ matches: true, captureMatches: true, samePitches: true, sameAttackSteps: true });
        const pulse = compareChordConversion(bar('pulse', [[0, 60], [0, 64], [0, 67], [1, 60], [1, 64], [1, 67]]), 'pad');
        expect(pulse).toMatchObject({ matches: true, captureMatches: true, samePitches: true, sameAttackSteps: true }); // the chord menu reads a pulse as one chord with a rate
        expect(compareChordConversion(bar('sustain', [[0, 60], [0, 63], [0, 67]]), 'pad').matches).toBe(true); // read with a minor quality
        expect(compareChordConversion(bar('sustain', [[0, 60], [0, 60], [0, 64], [0, 67]]), 'pad').captureMatches).toBe(false);
        expect(compareChordConversion(bar('sustain', [[0, 60]]), 'rhythm')).toBeNull();
    });
    test('distinguishes adding or removing only a root from other pitch-class changes', () => {
        expect(pitchClassDifference([60, 64, 67], [64, 67], 0)).toBe('Root removed only');
        expect(pitchClassDifference([64, 67], [48, 64, 67], 0)).toBe('Root added only');
        expect(pitchClassDifference([60, 64, 67], [60, 63, 67], 0)).toBe('Other pitch-class changes');
        expect(pitchClassDifference([60, 64, 67], [72, 76, 79], 0)).toBe('Same pitch classes');
        expect(pitchClassDifference([64, 67], [60, 64, 67], null)).toBe('Other pitch-class changes');
    });
    test('checks each bar reference separately from chord structure and emitted notes', () => {
        const c = { pitchClasses: [2, 5, 9, 0] };
        expect(chordReferenceDiagnostics([62, 65, 69, 72], [2], [{ root: 62, pitches: [62, 65, 69] }], c, null))
            .toEqual({ reference: 'Roots agree', structure: 'Default triad omits written tones', captured: 'Captured pitch classes equal written chord' });
        expect(chordReferenceDiagnostics([65, 69], [2], [{ root: 62, pitches: [62, 65, 69] }], c, null).captured).toBe('Captured pitch classes are a subset');
        expect(chordReferenceDiagnostics([62, 66, 69], [2], [{ root: 62, pitches: [62, 65, 69] }], c, null).captured).toBe('Some captured notes outside written chord');
        expect(chordReferenceDiagnostics([62], [7], [{ root: 67, pitches: [67, 71, 74] }], c, null).reference).toBe('Source root differs from bar chord');
        expect(chordReferenceDiagnostics([62], [2], [{ root: 67, pitches: [67, 71, 74] }], c, null).reference).toBe('Converted root differs from source');
        expect(chordReferenceDiagnostics([62], [2], [], c, null).reference).toBe('Missing or mixed reference');
        expect(chordReferenceDiagnostics([62], [2], [], c, {}).reference).toBe('Split bar · not compared');
    });
    test('a captured four-chord progression retains a separate root per bar', () => {
        const key = makeKey('Major-1', 0);
        const records = [[60, 64, 67], [65, 69, 72], [67, 71, 74], [69, 72, 76]].map(notes => ({
            events: notes.map(midi => ({ role: 'pad', midi, beat: 0, length: 1, velocity: .8,
                chordSource: { root: notes[0] % 12, style: 'sustain', pattern: null, step: 1 } })),
        }));
        const groups = generatedChords(capturePattern(records, 'pad', { key, stepsPerBar: 16 }), key);
        expect(groups.map(group => degreeToMidi(key, group.root) % 12)).toEqual([0, 5, 7, 9]);
        expect(groups.map(group => placedChordTones(key, group).map(note => note % 12))).toEqual([[0, 4, 7], [5, 9, 0], [7, 11, 2], [9, 0, 4]]);
    });
});
