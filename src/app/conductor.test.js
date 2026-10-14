import { nextMusic, glideTempo, scaleDistance, scalePcs, DEFAULT_DRIFT, MAX_DISTANCE, TEMPO_BOUNDS } from './conductor';
import { seeded } from './random';

const HOME = { tonic: 0, mode: 'Major-1', progression: 0, bpm: 72 };
const ALWAYS = { ...DEFAULT_DRIFT, keyChance: 1, modeChance: 1, progressionChance: 1, tempoChance: 1 };

// Runs the conductor for `cycles` cycles, returning every music state.
function walk(drift, { cycles = 400, seed = 1, home = HOME } = {}) {
    const rng = seeded(seed);
    const out = [home];
    for (let i = 0; i < cycles; i++) out.push(nextMusic(out[out.length - 1], home, drift, 10, rng));
    return out;
}

test('scaleDistance: a fifth away changes one note, the relative minor none', () => {
    expect(scaleDistance({ tonic: 7, mode: 'Major-1' }, HOME)).toBe(1);
    expect(scaleDistance({ tonic: 5, mode: 'Major-1' }, HOME)).toBe(1);
    expect(scaleDistance({ tonic: 2, mode: 'Major-1' }, HOME)).toBe(2);
    expect(scaleDistance({ tonic: 9, mode: 'Major-6' }, HOME)).toBe(0);
    // F# major shares B and E# (= F) with C major
    expect(scaleDistance({ tonic: 6, mode: 'Major-1' }, HOME)).toBe(5);
    expect(scalePcs(0, 'Major-4')).toEqual([0, 2, 4, 6, 7, 9, 11]);
});

test('off never changes anything', () => {
    walk({ ...ALWAYS, mode: 'off' }, { cycles: 50 }).forEach((m) => expect(m).toEqual(HOME));
});

test('zero chances never change anything', () => {
    const still = { ...DEFAULT_DRIFT, mode: 'wandering', keyChance: 0, modeChance: 0, progressionChance: 0, tempoChance: 0 };
    walk(still, { cycles: 50 }).forEach((m) => expect(m).toEqual(HOME));
});

test('every step is to a closely related scale (at most one note changes)', () => {
    ['centered', 'wandering'].forEach((mode) => [1, 2, 3].forEach((seed) => {
        const steps = walk({ ...ALWAYS, mode, progressionChance: 0, tempoChance: 0, modeChance: 0 }, { seed });
        steps.slice(1).forEach((m, i) => expect(scaleDistance(m, steps[i])).toBeLessThanOrEqual(1));
    }));
});

test('centered stays within reach of home, keeps coming back, and still moves', () => {
    const typical = { ...DEFAULT_DRIFT, keyChance: 0.4, modeChance: 0.3 };
    const homeShare = (mode, seed) => {
        const steps = walk({ ...typical, mode }, { seed });
        return steps.filter((m) => m.tonic === HOME.tonic && m.mode === HOME.mode).length / steps.length;
    };
    [1, 2, 3, 4].forEach((seed) => {
        walk({ ...ALWAYS, mode: 'centered' }, { seed }).forEach((m) => expect(scaleDistance(m, HOME)).toBeLessThanOrEqual(MAX_DISTANCE));
        const steps = walk({ ...typical, mode: 'centered' }, { seed });
        expect(new Set(steps.map((m) => `${m.tonic}/${m.mode}`)).size).toBeGreaterThan(3);
        expect(homeShare('centered', seed)).toBeGreaterThan(0.2);
        expect(homeShare('centered', seed)).toBeGreaterThan(homeShare('wandering', seed));
    });
});

test('wandering travels further than centered allows', () => {
    const far = [1, 2, 3].some((seed) => walk({ ...ALWAYS, mode: 'wandering' }, { seed })
        .some((m) => scaleDistance(m, HOME) > MAX_DISTANCE));
    expect(far).toBe(true);
});

test('tempo: centered stays within home ± range, wandering within bounds', () => {
    walk({ ...ALWAYS, mode: 'centered', tempoRange: 6 }).forEach((m) => {
        expect(m.bpm).toBeGreaterThanOrEqual(HOME.bpm - 6);
        expect(m.bpm).toBeLessThanOrEqual(HOME.bpm + 6);
    });
    walk({ ...ALWAYS, mode: 'wandering' }, { cycles: 1000 }).forEach((m) => {
        expect(m.bpm).toBeGreaterThanOrEqual(TEMPO_BOUNDS[0]);
        expect(m.bpm).toBeLessThanOrEqual(TEMPO_BOUNDS[1]);
    });
});

test('mode changes keep the tonic and move to a parallel mode one note away', () => {
    const steps = walk({ ...ALWAYS, mode: 'wandering', keyChance: 0, progressionChance: 0, tempoChance: 0 });
    steps.slice(1).forEach((m, i) => {
        expect(m.tonic).toBe(steps[i].tonic);
        expect(scaleDistance(m, steps[i])).toBeLessThanOrEqual(1);
    });
    expect(new Set(steps.map((m) => m.mode)).size).toBeGreaterThan(2);
});

test('mode moves work in exotic families too', () => {
    const home = { ...HOME, mode: 'Harmonic Minor-5' };
    const steps = walk({ ...ALWAYS, mode: 'wandering', keyChance: 0, progressionChance: 0, tempoChance: 0 }, { home, cycles: 50 });
    steps.forEach((m) => expect(m.mode.startsWith('Harmonic Minor-')).toBe(true));
    expect(new Set(steps.map((m) => m.mode)).size).toBeGreaterThan(1);
});

test('glideTempo moves at most maxStep per bar and lands on the target', () => {
    expect(glideTempo(72, 80)).toBe(74);
    expect(glideTempo(72, 71)).toBe(71);
    expect(glideTempo(72, 60, 3)).toBe(69);
});

test('home pull: stronger pull, more time at home; zero pull still stays within reach', () => {
    const share = (homePull) => {
        let total = 0;
        [1, 2, 3, 4].forEach((seed) => {
            const steps = walk({ ...DEFAULT_DRIFT, mode: 'centered', keyChance: 0.4, modeChance: 0.3, homePull }, { seed });
            total += steps.filter((m) => m.tonic === HOME.tonic && m.mode === HOME.mode).length / steps.length;
        });
        return total / 4;
    };
    expect(share(0.9)).toBeGreaterThan(share(0.5));
    expect(share(0.5)).toBeGreaterThan(share(0));
    walk({ ...ALWAYS, mode: 'centered', homePull: 0 }).forEach((m) => expect(scaleDistance(m, HOME)).toBeLessThanOrEqual(MAX_DISTANCE));
});

test('home pull brings tempo and progression back', () => {
    const steps = walk({ ...DEFAULT_DRIFT, mode: 'centered', keyChance: 0, modeChance: 0, progressionChance: 0.5, tempoChance: 0.5, homePull: 0.8 });
    expect(steps.filter((m) => m.bpm === HOME.bpm).length / steps.length).toBeGreaterThan(0.3);
    expect(steps.filter((m) => m.progression === HOME.progression).length / steps.length).toBeGreaterThan(0.3);
});

test('excluded keys and modes are never visited (home always allowed)', () => {
    const drift = { ...ALWAYS, mode: 'wandering', excludedTonics: [7, 2], excludedModes: ['Major-4', 'Major-7'] };
    [1, 2, 3].forEach((seed) => walk(drift, { seed }).forEach((m) => {
        if (m.tonic === HOME.tonic && m.mode === HOME.mode) return;
        expect(drift.excludedTonics).not.toContain(m.tonic);
        expect(drift.excludedModes).not.toContain(m.mode);
    }));
});

test('excluding everything but home keeps the music home', () => {
    const drift = { ...ALWAYS, mode: 'wandering', progressionChance: 0, tempoChance: 0, excludedTonics: [...Array(12).keys()].filter((pc) => pc !== 0), excludedModes: ['Major-2', 'Major-3', 'Major-4', 'Major-5', 'Major-6', 'Major-7'] };
    walk(drift, { cycles: 50 }).forEach((m) => expect(m).toEqual(HOME));
});

test('centered homeward moves respect exclusions too', () => {
    const drift = { ...ALWAYS, mode: 'centered', homePull: 0.7, excludedTonics: [5], excludedModes: ['Major-2'] };
    walk(drift, { seed: 9 }).forEach((m) => {
        if (m.tonic === HOME.tonic && m.mode === HOME.mode) return;
        expect(m.tonic).not.toBe(5);
        expect(m.mode).not.toBe('Major-2');
    });
});
