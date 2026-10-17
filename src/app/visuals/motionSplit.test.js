import { motionSplit } from './musicForces';

test('source and jet share a fixed budget even with per-voice drift', () => {
    for (const speed of [0.2, 1, 3]) for (const balance of [0, 0.2, 0.5, 0.8, 1]) for (const time of [0, 20, 100]) {
        const split = motionSplit(speed, balance, 1, time, 'lead', 42);
        expect(split.source + split.jet).toBeCloseTo(speed * 2);
        expect(split.share).toBeGreaterThanOrEqual(0); expect(split.share).toBeLessThanOrEqual(1);
        if (balance === 0 || balance === 1) expect(split.share).toBe(balance);
        const next = motionSplit(speed, balance, 1, time + 1/60, 'lead', 42);
        expect(Math.abs(next.share - split.share)).toBeLessThan(0.001);
    }
    expect(motionSplit(1, .5, 1, 20, 'lead', 42).share).not.toBe(motionSplit(1, .5, 1, 20, 'pad', 42).share);
});
