import { inertiaCost } from './phraseMelody';

const short = { length: 0.5 }, long = { length: 2 };

test('no cost at amount 0', () => {
    expect(inertiaCost({ amount: 0, previous: -2, motion: 2, leap: 2 })).toBe(0);
    expect(inertiaCost({ amount: 0, previous: 0, motion: 7, leap: 7, from: short, to: short })).toBe(0);
});

test('turning back after a step costs more after a descending step than after an ascending one', () => {
    const afterDown = inertiaCost({ amount: 1, previous: -2, motion: 2, leap: 2 });
    const afterUp = inertiaCost({ amount: 1, previous: 2, motion: -2, leap: 2 });
    expect(afterDown).toBeGreaterThan(afterUp);
    expect(afterUp).toBeGreaterThan(0);
    expect(inertiaCost({ amount: 1, previous: -2, motion: -2, leap: 2 })).toBe(0); // carrying on is free
});

test('stalling on the note after a step is not free, but after a leap it is', () => {
    expect(inertiaCost({ amount: 1, previous: -1, motion: 0, leap: 0 })).toBeGreaterThan(0);
    expect(inertiaCost({ amount: 1, previous: -7, motion: 0, leap: 0 })).toBe(0);
});

test('a big leap between two short notes is charged, a long note at either end is not', () => {
    expect(inertiaCost({ amount: 1, previous: 0, motion: 7, leap: 7, from: short, to: short })).toBeGreaterThan(0);
    expect(inertiaCost({ amount: 1, previous: 0, motion: 7, leap: 7, from: long, to: short })).toBe(0);
    expect(inertiaCost({ amount: 1, previous: 0, motion: 7, leap: 7, from: short, to: long })).toBe(0);
    expect(inertiaCost({ amount: 1, previous: 0, motion: 3, leap: 3, from: short, to: short })).toBe(0);
});

test('the cost scales with the amount', () => {
    const half = inertiaCost({ amount: 0.5, previous: -2, motion: 2, leap: 2 });
    expect(inertiaCost({ amount: 1, previous: -2, motion: 2, leap: 2 })).toBeCloseTo(2 * half, 10);
});
