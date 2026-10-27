import { varyPad, variesBar } from './padVariation';
const figure = (midis = [60, 64, 67, 72]) => Array.from({ length: 8 }, (_, i) => ({ role: 'pad', midi: midis[i % midis.length], beat: i * .5, length: .8, velocity: .6 }));
const pitches = (events) => events.map((e) => e.midi).join(',');
const base = { style: 'arpeggio', seed: 5, phraseStart: 8, range: [48, 84] };

test('the first bar of a chord and the even bars of a phrase are left as they were', () => {
    expect(variesBar({ index: 0, chordBar: 0 })).toBe(false);
    expect(variesBar({ index: 2, chordBar: 0 })).toBe(false);
    const events = figure();
    expect(varyPad(events, { ...base, index: 0, chordBar: 0 })).toBe(events);
});

test('a later bar of the same chord does not play the figure the same way, and successive bars differ from each other', () => {
    const original = pitches(figure()), seen = new Set();
    for (const chordBar of [1, 2, 3, 4]) {
        const out = varyPad(figure(), { ...base, index: chordBar, chordBar });
        expect(pitches(out)).not.toBe(original);
        seen.add(pitches(out));
        expect(out.every((e) => e.beat >= 0 && e.beat + e.length <= 5 && e.velocity > 0)).toBe(true);
    }
    expect(seen.size).toBeGreaterThan(2);
});

test('the choice depends only on the seed and the bar, and stays inside the register', () => {
    const a = varyPad(figure(), { ...base, index: 1, chordBar: 1 }), b = varyPad(figure(), { ...base, index: 1, chordBar: 1 });
    expect(a).toEqual(b);
    for (const chordBar of [1, 2, 3, 4]) for (const e of varyPad(figure(), { ...base, range: [48, 72], index: chordBar, chordBar })) expect(e.midi).toBeLessThanOrEqual(84);
});

test('chord figures (pulse) are not rearranged', () => {
    const pulse = [60, 64, 67].flatMap((midi) => [0, 2].map((beat) => ({ role: 'pad', midi, beat, length: 1.9, velocity: .6 })));
    expect(varyPad(pulse, { ...base, style: 'pulse', index: 1, chordBar: 1 })).toBe(pulse);
});
