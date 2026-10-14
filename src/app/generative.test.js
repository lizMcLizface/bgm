import { gainStages, gainEnvelopePoints, filterEnvelopeEvents } from './engine/envelope';
import { SCALE_FAMILIES, scaleById, spellScale, displayNumeral, chordSymbol, scaleSemitones, romanDegree, diatonicChord, chordSuffix, voiceLead, noteAtOrAbove } from './theory';
import { minTime } from '../util/util';

const ENV = {
    attack: 1, hold: 0, holdLevel: 0, decay: 1, sustain: 0.5, release: 2,
    attackShape: 'linear', decayShape: 'linear', releaseShape: 'linear',
    attackExponent: 2, decayExponent: 2, releaseExponent: 2,
};

const last = (arr) => arr[arr.length - 1];
const valueAt = (points, t) => points.find(([pt]) => Math.abs(pt - t) < 1e-9)[1];

describe('gainStages', () => {
    test('attack starts from 0 and peaks at velocity', () => {
        const { initial, stages } = gainStages(ENV, 0.8);
        expect(initial).toBe(0);
        expect(stages[0]).toMatchObject({ from: 0, to: 0.8, duration: 1 });
        expect(stages[1]).toMatchObject({ from: 0.8, to: 0.4, duration: 1 });
    });

    test('hold inserts a flat stage at holdLevel', () => {
        const { stages } = gainStages({ ...ENV, hold: 0.5, holdLevel: 0.9 }, 1);
        expect(stages.map((s) => s.to)).toEqual([0.9, 0.9, 0.5]);
        expect(stages[1].duration).toBe(0.5);
    });

    test('no attack: decay starts at peak; neither: starts at sustain', () => {
        expect(gainStages({ ...ENV, attack: 0 }, 1).initial).toBe(1);
        expect(gainStages({ ...ENV, attack: 0, decay: 0 }, 1)).toEqual({ initial: 0.5, stages: [] });
    });

    test('velocity scales levels, never times', () => {
        const loud = gainStages(ENV, 1).stages.map((s) => s.duration);
        const soft = gainStages(ENV, 0.3).stages.map((s) => s.duration);
        expect(soft).toEqual(loud);
    });
});

describe('gainEnvelopePoints', () => {
    test('full note: attack, decay, sustain, release to 0', () => {
        const { points, releaseEnd } = gainEnvelopePoints(ENV, 1, 4);
        expect(points[0]).toEqual([0, 0]);
        expect(valueAt(points, 1)).toBeCloseTo(1);
        expect(valueAt(points, 2)).toBeCloseTo(0.5);
        expect(valueAt(points, 4)).toBeCloseTo(0.5);
        expect(last(points)).toEqual([6, 0]);
        expect(releaseEnd).toBe(6);
    });

    test('a note ending mid-attack releases from the level it reached', () => {
        const { points, releaseEnd } = gainEnvelopePoints(ENV, 1, 0.5);
        expect(valueAt(points, 0.5)).toBeCloseTo(0.5);
        expect(points.every(([t]) => t <= 2.5)).toBe(true);
        expect(last(points)[1]).toBe(0);
        expect(releaseEnd).toBe(2.5);
    });

    test('times are strictly increasing (valid AudioParam ramps)', () => {
        const shaped = { ...ENV, attackShape: 'exponential', decayShape: 'sine', releaseShape: 'logarithmic' };
        [0.3, 1.5, 5].forEach((duration) => {
            const { points } = gainEnvelopePoints(shaped, 0.7, duration);
            for (let i = 1; i < points.length; i++) expect(points[i][0]).toBeGreaterThan(points[i - 1][0]);
        });
    });

    test('zero release still fades over minTime', () => {
        const { releaseEnd } = gainEnvelopePoints({ ...ENV, release: 0 }, 1, 3);
        expect(releaseEnd).toBeCloseTo(3 + minTime);
    });
});

describe('filterEnvelopeEvents', () => {
    test('no amount pins detune to 0', () => {
        expect(filterEnvelopeEvents({ attack: 1, decay: 1, release: 1, amount: 0 }, 2)).toEqual([{ type: 'set', time: 0, value: 0 }]);
    });

    test('attack rises toward amount, decays at attack end, releases at note end', () => {
        const events = filterEnvelopeEvents({ attack: 0.2, decay: 0.5, release: 1, amount: 3000 }, 2);
        expect(events).toContainEqual({ type: 'target', time: 0, value: 3000, timeConstant: 0.2 });
        expect(events).toContainEqual({ type: 'target', time: 0.2, value: 0, timeConstant: 0.5 });
        expect(last(events)).toEqual({ type: 'target', time: 2, value: 0, timeConstant: 1 });
    });
});

describe('theory', () => {
    const ionian = scaleSemitones(scaleById('Major-1').intervals);
    const aeolian = scaleSemitones(scaleById('Major-6').intervals);

    test('scaleSemitones', () => {
        expect(ionian).toEqual([0, 2, 4, 5, 7, 9, 11]);
        expect(aeolian).toEqual([0, 2, 3, 5, 7, 8, 10]);
    });

    test('every family and mode from the main page, with its scale ids', () => {
        const families = SCALE_FAMILIES.map((f) => f.family);
        expect(families).toEqual(expect.arrayContaining(['Major', 'Harmonic Minor', 'Melodic Minor', 'Pentatonic']));
        expect(scaleById('Major-7').name).toBe('Locrian');
        expect(scaleById('Harmonic Minor-5').name).toBe('Phrygian Dominant');
        expect(() => scaleById('Major-9')).toThrow();
        SCALE_FAMILIES.forEach(({ modes }) => modes.forEach(({ id, intervals }) => {
            // every scale's steps sum to an octave, so chord building is sound
            const semis = scaleSemitones(intervals);
            expect(semis).toHaveLength(intervals.length);
            expect(last(semis) + { H: 1, W: 2, A: 3, P: 4 }[last(intervals)]).toBe(12);
        }));
    });

    test('romanDegree ignores case and rejects junk', () => {
        expect(romanDegree('vi')).toBe(6);
        expect(romanDegree('IV')).toBe(4);
        expect(() => romanDegree('VIII')).toThrow();
    });

    test('diatonic triads get their quality from the mode', () => {
        expect(diatonicChord(ionian, 1)).toEqual([0, 4, 7]);
        expect(diatonicChord(ionian, 6)).toEqual([9, 12, 16]);
        expect(chordSuffix(diatonicChord(ionian, 5))).toBe('');
        expect(chordSuffix(diatonicChord(ionian, 2))).toBe('m');
        expect(chordSuffix(diatonicChord(ionian, 7))).toBe('°');
        expect(chordSuffix(diatonicChord(aeolian, 7))).toBe('');
        const harmonicMinor = scaleSemitones(scaleById('Harmonic Minor-1').intervals);
        expect(chordSuffix(diatonicChord(harmonicMinor, 3))).toBe('+');
        expect(diatonicChord(ionian, 5, 4)).toEqual([7, 11, 14, 17]);
    });

    test('pentatonic: every-other-note chords, degrees past the scale wrap', () => {
        const pent = scaleSemitones(scaleById('Pentatonic-1').intervals); // 0 2 4 7 9
        expect(pent).toEqual([0, 2, 4, 7, 9]);
        expect(diatonicChord(pent, 1)).toEqual([0, 4, 9]);
        expect(chordSuffix(diatonicChord(pent, 1))).toBe('6(no5)');
        expect(diatonicChord(pent, 6)).toEqual(diatonicChord(pent, 1));
    });

    test('spellScale: one letter per degree, fewest accidentals', () => {
        const spell = (tonic, id) => spellScale(tonic, scaleSemitones(scaleById(id).intervals)).join(' ');
        expect(spell(0, 'Major-1')).toBe('C D E F G A B');
        expect(spell(0, 'Major-7')).toBe('C D♭ E♭ F G♭ A♭ B♭');
        expect(spell(1, 'Major-1')).toBe('D♭ E♭ F G♭ A♭ B♭ C');
        expect(spell(6, 'Major-1')).toBe('F♯ G♯ A♯ B C♯ D♯ E♯');
        expect(spell(9, 'Harmonic Minor-1')).toBe('A B C D E F G♯');
        expect(spell(0, 'Pentatonic-1')).toBe('C D E G A');
        expect(spell(3, 'Pentatonic-5')).toBe('E♭ G♭ A♭ B♭ D♭');
    });

    test('displayNumeral follows the chord the mode produced', () => {
        const locrian = scaleSemitones(scaleById('Major-7').intervals);
        expect(displayNumeral('vi', diatonicChord(locrian, 6))).toBe('VI');
        expect(displayNumeral('I', diatonicChord(locrian, 1))).toBe('i°');
        expect(displayNumeral('IV', diatonicChord(locrian, 4))).toBe('iv');
    });

    test('chordSuffix names unusual shapes by interval', () => {
        expect(chordSuffix([0, 1, 7])).toBe('(♭2 5)');
    });

    test('voiceLead stays in range and moves minimally', () => {
        const c = voiceLead([0, 4, 7], 55, 74);
        expect(c.every((n) => n >= 55 && n <= 74)).toBe(true);
        // C major -> F major from G3-C4-E4 should keep C and move to A3-C4-F4
        const f = voiceLead([5, 9, 0], 55, 74, [55, 60, 64]);
        expect(f).toEqual([57, 60, 65]);
    });

    test('noteAtOrAbove', () => {
        expect(noteAtOrAbove(0, 36)).toBe(36);
        expect(noteAtOrAbove(11, 36)).toBe(47);
        expect(noteAtOrAbove(2, 40)).toBe(50);
    });
});

test('chordSymbol names sevenths and ninths', () => {
    const ionian = scaleSemitones(scaleById('Major-1').intervals);
    const sym = (degree, size) => chordSymbol(diatonicChord(ionian, degree, size));
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => sym(d, 4))).toEqual(['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'ø7']);
    expect(sym(1, 5)).toBe('maj7(9)');
    expect(sym(3, 5)).toBe('m7(♭9)');
    expect(sym(1, 3)).toBe('');
    expect(displayNumeral('V', diatonicChord(ionian, 5, 4))).toBe('V7');
    expect(displayNumeral('I', diatonicChord(ionian, 1, 4))).toBe('Imaj7');
    expect(displayNumeral('ii', diatonicChord(ionian, 2, 4))).toBe('ii7');
    expect(displayNumeral('IV', diatonicChord(ionian, 4, 5))).toBe('IVmaj9');
    expect(displayNumeral('vii', diatonicChord(ionian, 7, 4))).toBe('viiø7');
    const harmonicMinor = scaleSemitones(scaleById('Harmonic Minor-1').intervals);
    expect(chordSymbol(diatonicChord(harmonicMinor, 7, 4))).toBe('°7');
});

test('voiceLead fits big chords by widening the range minimally', () => {
    const ionian = scaleSemitones(scaleById('Major-1').intervals);
    [1, 2, 3, 4, 5, 6, 7].forEach((degree) => {
        const pcs = diatonicChord(ionian, degree, 5).map((o) => o % 12);
        const v = voiceLead(pcs, 55, 74);
        expect(new Set(v.map((m) => m % 12))).toEqual(new Set(pcs));
        expect(v[0]).toBeGreaterThanOrEqual(55 - 6);
        expect(v[v.length - 1]).toBeLessThanOrEqual(74 + 6);
    });
});
