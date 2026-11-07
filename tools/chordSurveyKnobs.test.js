import { describe, expect, test } from 'vitest';
import { describePart } from './generatorSurveyParams';
import { KNOBS, borrowedStatus, doublings, flavourOf, knobValues, lengthLabel } from './chordSurveyKnobs';
import { writtenChord } from './generatorSurveyParams';

const C = { pitchClasses: [0, 4, 7] };
const ev = (beat, midi, length = 1, velocity = 0.6) => ({ role: 'pad', beat, midi, length, velocity });
const knobs = (events, { chord = C, slot = 1, midis = events.map(e => e.midi) } = {}) => {
    const part = describePart(events, { chord, mode: 'Major-1', tonic: 0, units: 4, slotBars: slot });
    return knobValues({ part, events, slotMidis: midis, chord, mode: 'Major-1', tonic: 0, units: 4, slotBars: slot });
};

describe('knob values', () => {
    test('a held chord', () => {
        const { values, line } = knobs([ev(0, 60, 3.8), ev(0, 64, 3.8), ev(0, 67, 3.8)]);
        expect(line).toBeNull();
        expect(values).toMatchObject({ tones: '3 tones', voices: '3 voices', borrowed: 'diatonic', flavour: 'natural', inversion: '0', style: 'sustain',
            noteLength: 'to slot end', omit: 'none', add: 'none', offset: 'simultaneous', duration: 'equal', velocity: 'flat', direction: null, rate: null });
    });
    test('a root-less chord with a doubled third records the omission and the doubling', () => {
        const { values } = knobs([ev(0, 64, 3.8), ev(0, 67, 3.8), ev(0, 76, 3.8)]);
        expect(values).toMatchObject({ omit: 'root', add: 'third', addOctave: '+1', inversion: '1' });
    });
    test('a roll has an offset, ends together and rises in velocity', () => {
        const { values } = knobs([ev(0, 60, 3.8, 0.5), ev(0.25, 64, 3.55, 0.6), ev(0.5, 67, 3.3, 0.7)]);
        expect(values).toMatchObject({ style: 'roll', direction: 'up', offset: '1 step apart', duration: 'end together', velocity: 'rising', rate: '1 step', rateFlavour: 'straight' });
    });
    test('an even arpeggio is a chord, a composed figure is a note line', () => {
        const up = [60, 64, 67, 72].map((m, i) => ev(i, m, 0.9));
        expect(knobs(up).values).toMatchObject({ style: 'arpeggio', direction: 'up', rate: '4 steps', rateFlavour: 'straight', add: 'root (arpeggio octave copy)' });
        const composed = knobs([67, 60, 60, 64].map((m, i) => ev(i * 0.75, m, 0.7)));
        expect(composed.line).toBe('composed figure (no standard direction)');
        expect(composed.values.style).toBe('note line');
    });
    test('a syncopated arpeggio with a standard direction stays a chord but is flagged', () => {
        const result = knobs([[0, 60], [1.5, 64], [2, 67], [3.5, 72]].map(([at, m]) => ev(at, m, 0.9)));
        expect(result.line).toBeNull();
        expect(result.sensitivity).toBe(true);
        expect(result.values).toMatchObject({ rateFlavour: 'syncopated', rate: 'uneven', hitPattern: '0 1.5 2 3.5' });
    });
    test('a pulse reports hits per bar and a straight rate', () => {
        const pulse = [0, 1, 2, 3].flatMap(at => [60, 64, 67].map(m => ev(at, m, 0.95)));
        expect(knobs(pulse).values).toMatchObject({ style: 'pulse (repeated chords)', hits: '4', rate: '4 steps', rateFlavour: 'straight', noteLength: '1 beat' });
    });
    test('notes outside the chord make a line', () => {
        expect(knobs([ev(0, 60), ev(0, 63), ev(0, 67)]).line).toBe('notes outside the written chord');
    });
});

describe('helpers', () => {
    test('borrowed status and flavour', () => {
        expect(borrowedStatus(C, { complexity: 'triad', colour: 'plain' }, 0)).toBe('diatonic');
        expect(borrowedStatus(C, { complexity: 'triad', colour: 'plain' }, -1)).toBe('root moved −1 semitone');
        expect(borrowedStatus({ ...C, provenance: { borrowed: true } }, null, 0)).toBe('other quality (borrowed)');
        expect(flavourOf(writtenChord({ pitchClasses: [0, 4, 7, 9] }), null)).toBe('altered: add6');
        expect(flavourOf(writtenChord(C), { complexity: 'triad', colour: 'sus2' })).toBe('sus2');
    });
    test('note lengths name the nearest usual value', () => {
        expect(lengthLabel(3.8, 4)).toBe('to slot end');
        expect(lengthLabel(0.52, 4)).toBe('½ beat');
        expect(lengthLabel(1.4, 8)).toBe('1½ beats');
    });
    test('doublings give the octave offset', () => {
        expect(doublings([64, 67, 76], writtenChord(C), false)).toEqual([{ role: 'third', octaves: 1 }]);
    });
    test('every knob has a support rule and a unique id', () => {
        expect(new Set(KNOBS.map(k => k.id)).size).toBe(KNOBS.length);
        for (const knob of KNOBS) expect(['yes', 'no', 'new knob']).toContain(knob.support('anything'));
    });
});
