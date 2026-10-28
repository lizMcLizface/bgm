import { euclideanOnsets, bassCell, varyBass } from './ensembleVoices';

const meter = { units: 4, groups: [2, 2], unitsPerBeat: 1 };

test('Euclidean onsets are maximally even and start the bar', () => {
    expect(euclideanOnsets(3, 8)).toEqual([0, 3, 6]); // tresillo
    expect(euclideanOnsets(4, 8)).toEqual([0, 2, 4, 6]);
    for (const [k, n] of [[2, 5], [3, 7], [5, 8], [5, 12], [7, 16], [9, 16]]) {
        const on = euclideanOnsets(k, n), gaps = on.map((x, i) => ((on[(i + 1) % k] ?? n) - x + n) % n || n);
        expect(on).toHaveLength(k);
        expect(on[0]).toBe(0);
        expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    }
});

test('bassCell: euclid 0 draws exactly what it drew before, 1 always swaps in the even figure', () => {
    for (let seed = 1; seed < 30; seed++) {
        const base = bassCell({ style: 'drive', seed, phraseStart: 0, leadPlaying: true });
        expect(bassCell({ style: 'drive', seed, phraseStart: 0, leadPlaying: true, euclid: 0 })).toBe(base);
        expect(bassCell({ style: 'drive', seed, phraseStart: 0, leadPlaying: true, euclid: 1 })).toBe('euclid');
    }
    expect(bassCell({ style: 'walking', seed: 1, phraseStart: 0, leadPlaying: true, euclid: 1 })).toBeNull();
});

test('the even bass keeps the root, the approach note and fits inside the bar', () => {
    const events = [0, 1, 2, 3].map((beat, i) => ({ role: 'bass', midi: i === 3 ? 43 : 36, beat, length: 0.9, velocity: 0.7 }));
    for (let seed = 1; seed < 20; seed++) {
        const out = varyBass(events, { style: 'drive', cell: 'euclid', meter, range: [28, 55], seed, phraseStart: 0 });
        expect(out[0]).toMatchObject({ beat: 0, midi: 36 });
        expect(out.at(-1).midi).toBe(43);
        expect([3, 5]).toContain(out.length);
        out.forEach((e, i) => { expect(e.beat * 2 % 1).toBe(0); expect(e.beat + e.length).toBeLessThanOrEqual(meter.units + 1e-9); if (i) expect(e.beat).toBeGreaterThan(out[i - 1].beat); });
    }
});
