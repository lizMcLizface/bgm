import { describe, expect, test } from 'vitest';
import { beatDistance, crossedBoundaries, chordGestures } from './generatorSurveyMetrics';

describe('generator survey measurements', () => {
    test('uses felt beats for compound and uneven meters, including neighboring bars', () => {
        expect(beatDistance(3, { units: 6, unitsPerBeat: 3 })).toBe(0);
        expect(beatDistance(1, { units: 6, unitsPerBeat: 3 })).toBe(1);
        expect(beatDistance(3, { units: 5, unitsPerBeat: 2, beats: [0, 3] })).toBe(0);
        expect(beatDistance(-0.1, { units: 4, unitsPerBeat: 1 })).toBeCloseTo(0.1);
    });
    test('counts genuine gate crossings, not boundary touches', () => {
        const boundaries = [{ time: 4 }, { time: 8 }];
        expect(crossedBoundaries(3, 9, boundaries)).toHaveLength(2);
        expect(crossedBoundaries(3, 4, boundaries)).toHaveLength(0);
        expect(crossedBoundaries(4, 5, boundaries)).toHaveLength(0);
    });
    test('counts each chord-attack pair once, including the repeated-chord subset', () => {
        const events = [
            { start: 0, end: 1.5, midi: 48 },
            ...[60, 64, 67].map(midi => ({ start: 1, end: 1.5, midi })),
            ...[60, 64, 67].map(midi => ({ start: 2, end: 2.5, midi })),
        ];
        expect(chordGestures(events)).toEqual({ heldSingleIntoChord: 1, chordPauseChord: 1, sameChordPauseSameChord: 1 });
    });
});
