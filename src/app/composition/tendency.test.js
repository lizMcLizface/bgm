import { resolveMelody } from './resolution';

const meter = { units: 4, groups: [2, 2], unitsPerBeat: 1 };
const scalePcs = [0, 2, 4, 5, 7, 9, 11];
const bar = (events, chordPcs = [7, 11, 2]) => ({
    plan: { bars: [{ bar: 0, events }], destination: { closing: false } },
    args: { bars: [{ bar: 0, bpm: 100, chord: { pitchClasses: chordPcs }, scalePcs, notes: events.map((e, i) => ({ beat: e.beat, accent: i === 0 })) }],
        meter, range: [60, 90], settings: { leadScale: 'full' }, seed: 5, chance: 0 },
});
const run = (events, leadTendency, chordPcs) => {
    const { plan, args } = bar(events, chordPcs);
    return resolveMelody(plan, { ...args, settings: { ...args.settings, leadTendency } });
};
const ev = (midi, beat, length = 1) => ({ role: 'lead', midi, beat, length, velocity: 0.6 });

test('amount 0 changes nothing', () => {
    const events = [ev(83, 0, 2), ev(79, 2), ev(74, 3)];
    expect(run(events, 0).bars[0].events.map((e) => e.midi)).toEqual([83, 79, 74]);
    expect(run(events, 0).resolutions).toEqual([]);
});

test('a held leading tone rises to the tonic on the next note', () => {
    const out = run([ev(83, 0, 2), ev(79, 2), ev(74, 3)], 1);
    expect(out.bars[0].events.map((e) => e.midi)).toEqual([83, 84, 74]);
    expect(out.resolutions).toEqual([expect.objectContaining({ kind: 'tendency' })]);
});

test('a held fourth steps down to the third', () => {
    const out = run([ev(77, 0, 2), ev(72, 2), ev(67, 3)], 1, [5, 9, 0]);
    expect(out.bars[0].events.map((e) => e.midi)).toEqual([77, 76, 67]);
});

test('an accented landing that would lose its chord tone is left alone', () => {
    const { plan, args } = bar([ev(83, 0, 2), ev(79, 2), ev(74, 3)]);
    args.bars[0].notes[1].accent = true; // the C would not be a chord tone of G
    const out = resolveMelody(plan, { ...args, settings: { ...args.settings, leadTendency: 1 } });
    expect(out.bars[0].events.map((e) => e.midi)).toEqual([83, 79, 74]);
});

test('the closing note of a phrase is never moved', () => {
    const { plan, args } = bar([ev(83, 0, 2), ev(79, 2)]);
    plan.destination = { closing: true, bar: 0 };
    const out = resolveMelody(plan, { ...args, settings: { ...args.settings, leadTendency: 1 } });
    expect(out.bars[0].events.map((e) => e.midi)).toEqual([83, 79]);
});
