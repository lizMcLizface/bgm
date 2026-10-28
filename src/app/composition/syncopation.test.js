import { syncopate } from './syncopation';

const meter = { units: 4, groups: [2, 2], unitsPerBeat: 1 };
const run = (notes, extra = {}) => syncopate(notes, { amount: 1, meter, seed: 3, bar: 5, index: 1, bars: 4, ...extra });
const plain = [{ beat: 0, length: 1, degree: 0 }, { beat: 1, length: 1, degree: 1 }, { beat: 2, length: 1, degree: 2 }, { beat: 3, length: 1, degree: 1 }];

test('amount 0 returns the very same notes', () => {
    expect(syncopate(plain, { amount: 0, meter })).toBe(plain);
});

test('an anticipated note starts half a beat early, keeps its end and never overlaps its predecessor', () => {
    let moved = 0;
    for (let bar = 0; bar < 40; bar++) {
        const out = run(plain, { bar });
        out.forEach((n, i) => {
            expect(n.beat + n.length).toBeLessThanOrEqual(plain[i].beat + plain[i].length + 1e-9);
            if (i) expect(out[i - 1].beat + out[i - 1].length).toBeLessThanOrEqual(n.beat + 1e-9);
            if (n.beat !== plain[i].beat) { moved++; expect(plain[i].beat - n.beat).toBe(0.5); if (!out[i + 1] || out[i + 1].beat === plain[i + 1].beat) expect(n.beat + n.length).toBe(plain[i].beat + plain[i].length); }
        });
    }
    expect(moved).toBeGreaterThan(20);
});

test('the same bar and seed always give the same result', () => {
    expect(run(plain)).toEqual(run(plain));
});

test('the cadence bar is pushed less than a middle bar, and keepLast protects the landing', () => {
    const count = index => Array.from({ length: 200 }, (_, bar) => run(plain, { bar, index })).reduce((t, out) => t + out.filter((n, i) => n.beat !== plain[i].beat).length, 0);
    expect(count(3)).toBeLessThan(count(1));
    for (let bar = 0; bar < 60; bar++) expect(run(plain, { bar, index: 1, keepLast: true }).at(-1).beat).toBe(3);
});

test('protected beats and off-beat notes are left alone', () => {
    for (let bar = 0; bar < 40; bar++) expect(run(plain, { bar, protectedBeats: [1, 2, 3] })[1].beat).toBe(1);
    const odd = [{ beat: 0, length: 0.75 }, { beat: 0.75, length: 0.75 }];
    for (let bar = 0; bar < 20; bar++) expect(run(odd, { bar })[1].beat).toBe(0.75);
});

test('compound metre moves by an eighth, and a downbeat note can arrive late only in middle bars', () => {
    const six = { units: 6, groups: [3, 3], unitsPerBeat: 3 };
    const notes = [{ beat: 0, length: 3 }, { beat: 3, length: 3 }];
    const shifted = Array.from({ length: 40 }, (_, bar) => run(notes, { bar, meter: six })[1].beat);
    expect(new Set(shifted)).toEqual(new Set([2, 3]));
    const late = idx => Array.from({ length: 100 }, (_, bar) => run([{ beat: 0, length: 4 }], { bar, index: idx, delay: true })[0].beat);
    expect(late(1).some(b => b === 0.5)).toBe(true);
    expect(late(0).every(b => b === 0)).toBe(true);
    expect(late(3).every(b => b === 0)).toBe(true);
});
