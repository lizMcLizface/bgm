import { renderAcousticPiano, ACOUSTIC_TYPES, inharmonicity, stringCount } from './acousticPiano';
import { renderPiano } from './piano';

const SR = 24000;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const rms = (data, from, to) => { let s = 0; for (let i = from; i < to; i++) s += data[i] ** 2; return Math.sqrt(s / (to - from)); };
// Power of the sinusoid at f over a window, by direct correlation.
const power = (data, f, from, size) => {
    let re = 0, im = 0;
    for (let i = 0; i < size; i++) { const x = data[from + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / (size - 1))); re += x * Math.cos(2 * Math.PI * f * i / SR); im += x * Math.sin(2 * Math.PI * f * i / SR); }
    return Math.hypot(re, im);
};
// The frequency of the strongest component within 4% of a target, by golden-section search on the spectrum.
function peakNear(data, target, from = Math.round(SR * .05), size = Math.round(SR * .5)) {
    let lo = target * .96, hi = target * 1.04;
    for (let i = 0; i < 40; i++) { const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3; if (power(data, a, from, size) > power(data, b, from, size)) hi = b; else lo = a; }
    return (lo + hi) / 2;
}

test('every acoustic type keeps its pitch across the keyboard', () => {
    for (const type of ACOUSTIC_TYPES) for (const midi of [28, 40, 52, 60, 69, 81, 93]) {
        const f = hz(midi), data = renderAcousticPiano(SR, f, { type, unison: 0, resonance: 0, decay: 1.5 });
        const cents = 1200 * Math.log2(peakNear(data, f) / f);
        expect(Math.abs(cents), `${type}/${midi}: ${cents} cents`).toBeLessThan(8);
    }
});

test('output is finite, bounded, deterministic and DC-free', () => {
    for (const type of ACOUSTIC_TYPES) for (const midi of [24, 48, 72, 100]) {
        const options = { type, velocity: 1, brightness: 1, hammer: 1, wear: 1, seed: 11 }, data = renderAcousticPiano(SR, hz(midi), options);
        const again = renderAcousticPiano(SR, hz(midi), options);
        expect(again.every((x, i) => x === data[i])).toBe(true);
        let peak = 0, mean = 0;
        for (const x of data) { if (!Number.isFinite(x)) throw Error('Non-finite sample'); peak = Math.max(peak, Math.abs(x)); mean += x; }
        expect(peak).toBeLessThanOrEqual(.851);
        expect(Math.abs(mean / data.length)).toBeLessThan(.003);
    }
});

test('partials are stretched sharp by string stiffness, more in the treble and in an upright', () => {
    expect(inharmonicity(96)).toBeGreaterThan(inharmonicity(60) * 5);
    const partial = (type, n) => { const f = hz(60), d = renderAcousticPiano(SR, f, { type, unison: 0, resonance: 0, decay: 4, brightness: 1, hammer: 1 }); return peakNear(d, f * n, Math.round(SR * .02), Math.round(SR * .3)) / (f * n); };
    // A harmonic 8th partial would sit at exactly 8 x f0; stiffness lifts it.
    expect(partial('grand', 6)).toBeGreaterThan(1.0005);
    expect(partial('upright', 6)).toBeGreaterThan(partial('grand', 6));
});

test('the sound has a fast prompt decay and a slower aftersound', () => {
    const f = hz(57), data = renderAcousticPiano(SR, f, { type: 'grand', decay: 2, resonance: 0, unison: 0 });
    const level = (t) => power(data, peakNear(data, f * 2, Math.round(SR * .02), Math.round(SR * .2)), Math.round(SR * t), Math.round(SR * .25));
    const [early, mid, late] = [level(.05), level(1), level(3)];
    // In dB per second: the first second falls faster than the following two.
    const fast = 20 * Math.log10(early / mid), slow = 20 * Math.log10(mid / late) / 2;
    expect(fast).toBeGreaterThan(slow * 1.3);
    expect(late).toBeGreaterThan(0);
});

test('harder blows and harder hammers are brighter', () => {
    const bright = (d) => { let high = 0, total = 0; for (let i = 1; i < SR * .3; i++) { high += (d[i] - d[i - 1]) ** 2; total += d[i] ** 2; } return high / total; };
    expect(bright(renderAcousticPiano(SR, hz(60), { velocity: 1 }))).toBeGreaterThan(bright(renderAcousticPiano(SR, hz(60), { velocity: .2 })) * 1.3);
    expect(bright(renderAcousticPiano(SR, hz(60), { hammer: 1 }))).toBeGreaterThan(bright(renderAcousticPiano(SR, hz(60), { hammer: 0 })) * 1.1);
});

test('the felted piano is duller and shorter than the grand', () => {
    const f = hz(64), grand = renderAcousticPiano(SR, f, { type: 'grand' }), felted = renderAcousticPiano(SR, f, { type: 'felted' });
    // The 2nd to 4th partials against the fundamental, early in the note.
    const upper = (d) => [2, 3, 4].reduce((sum, n) => sum + power(d, peakNear(d, f * n, Math.round(SR * .03), Math.round(SR * .2)), Math.round(SR * .03), Math.round(SR * .2)) ** 2, 0) /
        power(d, peakNear(d, f, Math.round(SR * .03), Math.round(SR * .2)), Math.round(SR * .03), Math.round(SR * .2)) ** 2;
    expect(upper(felted)).toBeLessThan(upper(grand) * .5);
    expect(rms(felted, Math.round(SR * 1.5), Math.round(SR * 2))).toBeLessThan(rms(grand, Math.round(SR * 1.5), Math.round(SR * 2)));
});

test('an old piano has looser unisons: more beating between its strings', () => {
    // Amplitude modulation of the fundamental from two strings a few cents apart.
    const wobble = (wear) => {
        const f = hz(64), d = renderAcousticPiano(SR, f, { type: 'upright', wear, unison: wear, resonance: 0, seed: 3 }), w = Math.round(SR * .06), env = [];
        for (let t = Math.round(SR * .1); t + w < SR * 2; t += w) env.push(power(d, peakNear(d, f), t, w));
        const mean = env.reduce((a, b) => a + b) / env.length;
        return Math.sqrt(env.reduce((a, b) => a + (b / mean - 1) ** 2, 0) / env.length);
    };
    expect(wobble(1)).toBeGreaterThan(wobble(0));
});

test('registers have one, two or three strings', () => {
    expect([24, 40, 70].map(stringCount)).toEqual([1, 2, 3]);
});

test('renderPiano routes the new types here and leaves felt and electric alone', () => {
    const options = { decay: 1, seed: 4, brightness: .5, hammer: .4, unison: .3, velocity: .8, resonance: .5, wear: 0 };
    const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    expect(same(renderPiano(SR, 220, { ...options, type: 'grand' }), renderAcousticPiano(SR, 220, { ...options, type: 'grand' }))).toBe(true);
    expect(same(renderPiano(SR, 220, { ...options, type: 'felt' }), renderAcousticPiano(SR, 220, { ...options, type: 'grand' }))).toBe(false);
});

test('notes render quickly enough to prepare on demand', () => {
    const start = performance.now();
    for (const midi of [30, 45, 60, 75, 90]) renderAcousticPiano(44100, hz(midi), { type: 'upright', wear: .5 });
    expect(performance.now() - start).toBeLessThan(5000);
});
