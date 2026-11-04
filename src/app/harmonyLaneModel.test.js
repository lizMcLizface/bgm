import { harmonyLane, laneWindow, barOfSlot } from './harmonyLaneModel';

const chord = (name, numeral) => ({ name, numeral });
const bar = (n, c, extra = {}) => ({ bar: n, chord: c, chordStart: extra.chordStart ?? false, ...extra });

test('bars of one chord join into a slot measured in beats', () => {
    const C = chord('C', 'I'), G = chord('G7', 'V7');
    const slots = harmonyLane([bar(0, C, { chordStart: true }), bar(1, C), bar(2, C), bar(3, G, { chordStart: true })], 4);
    expect(slots.map((s) => [s.name, s.startBeat, s.endBeat])).toEqual([['C', 0, 12], ['G7', 12, 16]]);
    expect(slots[0].bars).toHaveLength(3);
});

test('a chord that changes mid-bar makes a second slot', () => {
    const C = chord('C', 'I'), F = chord('F', 'IV');
    const slots = harmonyLane([bar(0, C, { chordStart: true, split: { beat: 2, chord: F } }), bar(1, F)], 4);
    expect(slots.map((s) => [s.name, s.startBeat, s.endBeat, s.split])).toEqual([['C', 0, 2, false], ['F', 2, 8, true]]);
});

test('the played stage and unresolved chords are carried', () => {
    const slots = harmonyLane([bar(0, { name: 'Dm', numeral: 'ii', unresolved: true }, { chordStart: true, seqPlayed: { chosen: 2, fill: true } })], 4);
    expect(slots[0]).toMatchObject({ unresolved: true, bars: [{ stage: 2, fill: true }] });
});

test('a window cuts slots and the bar of a slot is counted', () => {
    const C = chord('C', 'I');
    const slots = harmonyLane([bar(0, C, { chordStart: true }), bar(1, C), bar(2, C)], 4);
    const cut = laneWindow(slots, 1, 1, 4);
    expect(cut[0]).toMatchObject({ from: 4, to: 8 });
    expect(barOfSlot(slots[0], 5, 4)).toEqual({ index: 2, of: 3 });
});
