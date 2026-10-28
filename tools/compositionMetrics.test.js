import * as M from './compositionMetrics';

const bar = (n, events, chord = { pitchClasses: [0, 4, 7] }, meter = { units: 4, groups: [2, 2], unitsPerBeat: 1 }) => ({ bar: n, events, chord, meter, bpm: 120, music: { tonic: 0 } });
const note = (role, midi, beat, length = 0.5, velocity = 0.6) => ({ role, midi, beat, length, velocity });

test('Keith syncopation reproduces Toussaint\'s worked examples (16 pulses)', () => {
    // classical ostinato: onsets 0, 4, 8, 10, 12 -> 0; clave son 3-3-4-2-4: onsets 0, 3, 6, 10, 12 -> 2
    expect(M.keithSyncopation([0, 1, 2, 2.5, 3], 4)).toBe(0);
    expect(M.keithSyncopation([0, 0.75, 1.5, 2.5, 3], 4)).toBe(2);
});

test('interval statistics count steps, direction and reversal after a leap', () => {
    const notes = [60, 62, 60, 67, 64, 64].map((midi, i) => ({ bar: 0, beat: i, midi, length: 1 }));
    const s = M.intervalStats(notes);
    expect(s.count).toBe(5);
    expect(s.unison).toBeCloseTo(0.2, 3);
    expect(s.step).toBeCloseTo(0.4, 3);
    expect(s.reverseAfterLeap5plus).toBe(1); // 60 -> 67 (up a fifth+) then down
});

test('chord roots collapse repeats and measure circle-of-fifths distance', () => {
    const chords = [0, 0, 7, 0, 5].map((root, i) => bar(i, [], { pitchClasses: [root, (root + 4) % 12, (root + 7) % 12] }));
    const r = M.chordRoots(chords, () => 0);
    expect(r.chords).toBe(4); // I V I IV
    expect(r.fifthsDistanceShare[1]).toBeCloseTo(1, 3); // every motion is a fourth or fifth
});

test('seventh detection needs a minor or major seventh above the root', () => {
    const r = M.chordRoots([bar(0, [], { pitchClasses: [0, 4, 7, 11] }), bar(1, [], { pitchClasses: [5, 9, 0, 2] })], () => 0);
    expect(r.roots.map((x) => x.seventh)).toEqual([true, false]); // Cmaj7, then F add9
});

test('V to I arrivals report whether the dominant carried a seventh', () => {
    const roots = M.chordRoots([bar(0, [], { pitchClasses: [7, 11, 2, 5] }), bar(1, [], { pitchClasses: [0, 4, 7] })], () => 0).roots;
    expect(M.dominantSeventhAtCadence(roots)).toMatchObject({ arrivals: 1, withSeventh: 1 });
});

test('exact repeat ratio compares notes, onsets and lengths per bar', () => {
    const a = [note('lead', 60, 0), note('bass', 36, 0)];
    const bars = [bar(0, a), bar(1, [...a]), bar(2, [note('lead', 62, 0), note('bass', 36, 0)]), bar(3, [...a])];
    expect(M.exactRepeatRatio(bars)).toBeCloseTo(0.5, 3);
    expect(M.exactRepeatByRole(bars, ['bass']).bass).toBeCloseTo(0.75, 3);
});

test('pitch-class circulation grows with window size and is capped at the pitch classes used', () => {
    const events = [0, 2, 4, 5, 7, 9, 11].flatMap((pc) => [note('lead', 60 + pc, 0)]);
    const bars = Array.from({ length: 40 }, (_, i) => bar(i, [events[i % 7]]));
    const c = M.pitchClassCirculation(bars, [2, 4, 8, 16]);
    expect(c[2]).toBeLessThan(c[8]);
    expect(c[16]).toBeLessThanOrEqual(7);
});

test('roughness is larger for a close low second than a wide low interval', () => {
    expect(M.roughness([40, 41])).toBeGreaterThan(M.roughness([40, 52]));
    expect(M.roughness([40, 43])).toBeGreaterThan(M.roughness([64, 67])); // the same third is rougher low than high
});

test('lead notes are classified against the sounding chord', () => {
    const bars = [bar(0, [note('lead', 60, 0), note('lead', 64, 1), note('lead', 67, 2), note('lead', 62, 3)])];
    const s = M.chordRelativeShare(bars);
    expect(s).toMatchObject({ count: 4, root: 0.25, third: 0.25, fifth: 0.25, nonChord: 0.25 });
});
