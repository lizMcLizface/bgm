import { borrowWeight } from './theory';

test('in a major key the borrowed VII is taken most, then VI, then the minor iv; other chords are unweighted', () => {
    const w = (n) => borrowWeight(n, 'Major-1');
    expect(w('VII')).toBeGreaterThan(w('VI'));
    expect(w('VI')).toBeGreaterThan(w('IV'));
    expect(w('VII') / w('VI')).toBeCloseTo(2, 5); // the corpus ratio .081 : .040
    expect(w('I')).toBe(1);
    expect(w('V')).toBe(1);
});

test('in a minor key the major IV is taken a little more than the major V', () => {
    expect(borrowWeight('IV', 'Major-6')).toBeGreaterThan(borrowWeight('V', 'Major-6'));
    expect(borrowWeight('i', 'Major-6')).toBe(1);
});
