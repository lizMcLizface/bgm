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

test('Longuet-Higgins & Lee syncopation: straight is 0, an off-beat note held over a heavier beat scores the weight gap', () => {
    expect(M.lhlSyncopation([0, 1, 2, 3], 4, [2, 2])).toBe(0);
    expect(M.lhlSyncopation([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], 4, [2, 2])).toBe(0);
    // an eighth-note onset at 1.5 held across beat 2 (a group start, weight -1): -1 - (-3) = 2
    expect(M.lhlSyncopation([0, 1.5], 4, [2, 2])).toBe(2);
    // the same push on a beat (1) held across the group start: beat -2, group start -1 -> 1
    expect(M.lhlSyncopation([0, 1], 4, [2, 2])).toBe(1);
    // son clave 3-3-4-2-4 on 16 pulses: onsets 0, 3, 6, 10, 12 (in quarters: 0, .75, 1.5, 2.5, 3)
    expect(M.lhlSyncopation([0, 0.75, 1.5, 2.5, 3], 4, [2, 2])).toBeGreaterThan(M.lhlSyncopation([0, 1, 2, 3], 4, [2, 2]));
    // the heavier the rest, the larger the score: a sixteenth at 0.25 held to beat 1 versus an eighth at 0.5
    expect(M.lhlSyncopation([0, 0.25], 4, [2, 2])).toBe(3); // quarter-beat -4 held across the group start -1
    expect(M.lhlSyncopation([0, 0.5], 4, [2, 2])).toBe(2); // half-beat -3 held across it
});

test('lhlByBar skips compound metres and reads the chosen roles', () => {
    const compound = { bar: 0, events: [], meter: { units: 6, groups: [3, 3], unitsPerBeat: 3 } };
    const simple = bar(1, [note('lead', 60, 0), note('lead', 60, 1.5), note('bass', 40, 1)]);
    const rows = M.lhlByBar([compound, simple], ['lead']);
    expect(rows[0].score).toBeNull();
    expect(rows[1].score).toBe(2);
});

test('seam scores: identical material across a section change is smooth, a new key, metre and tempo is not', () => {
    const upm = (m, bpm) => bpm * m.unitsPerBeat;
    const mk = (n, type, midis, meter = { units: 4, groups: [2, 2], unitsPerBeat: 1 }, bpm = 120, velocity = 0.6) => ({
        bar: n, meter, bpm, state: { phrase: { section: { type } } },
        events: midis.map((midi, i) => ({ role: i ? 'bass' : 'lead', midi, beat: i * 0.5, length: 0.5, velocity })) });
    const same = M.seamScores([mk(0, 'full', [60, 36]), mk(1, 'full', [60, 36]), mk(2, 'breakdown', [60, 36])], upm);
    expect(same).toHaveLength(1);
    expect(same[0]).toMatchObject({ bar: 2, from: 'full', to: 'breakdown', meter: 1, timbre: 1, pitch: 1, dynamics: 1, tempo: 1, smooth: 1 });
    const jarring = M.seamScores([mk(0, 'full', [60, 36]), mk(1, 'breakdown', [61], { units: 6, groups: [3, 3], unitsPerBeat: 3 }, 90, 0.2)], upm);
    expect(jarring[0].meter).toBe(0);
    expect(jarring[0].pitch).toBe(0);
    expect(jarring[0].smooth).toBeLessThan(0.4);
});

test('tendency resolution counts held leading tones that rise to the tonic and fourths that fall', () => {
    const n = (midi, i, bar = 0, length = 1) => ({ bar, beat: i, midi, length });
    const r = M.tendencyResolution([n(71, 0), n(72, 1), n(77, 2), n(76, 3), n(71, 0, 1), n(67, 1, 1)], () => 0, 0.75);
    expect(r).toMatchObject({ leading: 2, leadingToTonic: 0.5, fourth: 1, fourthToThird: 1 });
});

test('euclideanShare recognises evenly spread onsets in any rotation', () => {
    const m = { units: 4, groups: [2, 2], unitsPerBeat: 1 };
    const ev = (beats) => beats.map((beat) => ({ role: 'bass', midi: 36, beat, length: 0.5, velocity: 0.6 }));
    const r = M.euclideanShare([{ bar: 0, meter: m, events: ev([0, 1.5, 3]) }, { bar: 1, meter: m, events: ev([0.5, 2, 3.5]) }, { bar: 2, meter: m, events: ev([0, 0.5, 1]) }, { bar: 3, meter: m, events: ev([0, 1]) }]);
    expect(r).toEqual({ bars: 3, share: 0.667 }); // tresillo and its rotation are even, a cluster is not, two onsets are skipped
});
