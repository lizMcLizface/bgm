import { diatonicChord, scaleSemitones, scaleById, chordSymbol } from './theory';

const aeolian = scaleSemitones(scaleById('Major-6').intervals);
const name = (degree, colour) => chordSymbol(diatonicChord(aeolian, degree, 3, colour));

test('plain chords are as before; sus2 and sus4 replace the third', () => {
    expect(name(1, 'plain')).toBe('m');
    expect(name(1, 'sus2')).toBe('sus2');
    expect(name(1, 'sus4')).toBe('sus4');
    expect(diatonicChord(aeolian, 3, 3)).toEqual(diatonicChord(aeolian, 3, 3, 'plain'));
});

test('floating: sus4 over a minor chord, sus2 over a major one', () => {
    expect(name(1, 'floating')).toBe('sus4');
    expect(name(6, 'floating')).toBe('sus2');
    expect(name(7, 'floating')).toBe('sus2');
});

test('the root and fifth stay, and a seventh still stacks on top', () => {
    const [root, , fifth, seventh] = diatonicChord(aeolian, 1, 4, 'sus2');
    expect([root, fifth, seventh]).toEqual(diatonicChord(aeolian, 1, 4).filter((_, i) => i !== 1));
});

test('added notes: add9 and add6 keep the third and stay in order', () => {
    expect(diatonicChord(aeolian, 1, 3, 'add9')).toEqual([0, 3, 7, 14]);
    expect(diatonicChord(aeolian, 1, 3, 'add6')).toEqual([0, 3, 7, 8]);
    expect(diatonicChord(aeolian, 1, 5, 'add9')).toEqual(diatonicChord(aeolian, 1, 5));
});
