import { padPitchClasses } from './arranger';
import { voiceLead, diatonicChord } from './theory';

const triad = [0, 4, 7], seventh = [7, 11, 2, 5];

test('the pad keeps the root unless the rule says the bass has it', () => {
    expect(padPitchClasses(triad)).toBe(triad);
    expect(padPitchClasses(triad, { rule: 'unlessBass', bassPc: 5 })).toBe(triad); // the bass is on another note
    expect(padPitchClasses(triad, { rule: 'unlessBass', bassPc: null })).toBe(triad); // no bass playing
    expect(padPitchClasses(triad, { rule: 'unlessBass', bassPc: 0 })).toEqual([4, 7, 4]); // third doubled so three notes remain
    expect(padPitchClasses(seventh, { rule: 'unlessBass', bassPc: 7 })).toEqual([11, 2, 5]);
    expect(padPitchClasses(triad, { rule: 'never', bassPc: 5 })).toEqual([4, 7, 4]);
});

test('a rootless triad voices as third, fifth and third an octave up, inside the range', () => {
    const v = voiceLead(padPitchClasses(triad, { rule: 'never' }), 55, 79);
    expect(v).toHaveLength(3);
    expect(v.map((m) => m % 12).sort((a, b) => a - b)).toEqual([4, 4, 7]);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(55);
    expect(Math.max(...v)).toBeLessThanOrEqual(79);
});

test('voice leading across a change of chord size stays close', () => {
    const major = [0, 2, 4, 5, 7, 9, 11];
    const dom = diatonicChord(major, 5, 4).map((o) => o % 12), tonic = diatonicChord(major, 1, 3).map((o) => o % 12);
    const first = voiceLead(dom, 55, 79), second = voiceLead(tonic, 55, 79, first);
    const reference = voiceLead(tonic, 55, 79);
    const drift = (v) => Math.abs(v.reduce((a, b) => a + b, 0) / v.length - first.reduce((a, b) => a + b, 0) / first.length);
    expect(second).toHaveLength(3);
    expect(drift(second)).toBeLessThanOrEqual(drift(reference) + 1e-9);
});

test('chord size by function: dominant chords keep the full size, the rest are triads', () => {
    const major = [0, 2, 4, 5, 7, 9, 11];
    const size = (functional, degree) => (functional && ![5, 7].includes(degree) ? 3 : 4);
    expect([1, 2, 4, 5, 6, 7].map((d) => diatonicChord(major, d, size(true, d)).length)).toEqual([3, 3, 3, 4, 3, 4]);
    expect([1, 5].map((d) => diatonicChord(major, d, size(false, d)).length)).toEqual([4, 4]);
});

test('contrary option charges a top voice that moves the way the bass moves', () => {
    const first = voiceLead([0, 4, 7], 55, 79); // some voicing of C
    const next = [5, 9, 0]; // F
    const topMove = (v) => v.at(-1) - first.at(-1);
    const plain = voiceLead(next, 55, 79, first);
    const up = voiceLead(next, 55, 79, first, null, { contrary: 6, against: 1 }); // bass going up: the top should not rise
    const down = voiceLead(next, 55, 79, first, null, { contrary: 6, against: -1 });
    expect(topMove(up)).toBeLessThanOrEqual(Math.max(0, topMove(plain)));
    expect(topMove(down)).toBeGreaterThanOrEqual(Math.min(0, topMove(plain)));
    expect(voiceLead(next, 55, 79, first, null, { contrary: 0, against: 1 })).toEqual(plain);
    expect(voiceLead(next, 55, 79, first, null, { contrary: 6, against: 0 })).toEqual(plain); // unknown direction changes nothing
});
