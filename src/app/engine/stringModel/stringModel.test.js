import { BED_WINDOWS, analyzeNote, findFundamental, powerSpectrum, refineFundamental } from './analysis';
import { packTable, unpackTable, modelFor } from './model';
import { loopFor, renderSustained, renderDecay, releaseCurve } from './synth';

const SR = 48000;
/** A synthetic bowed note: harmonics falling 1/n, vibrato after .3 s, a swell over the first 0.4 s, a little noise. */
function bowed(f0, { seconds = 5, depth = 20, rate = 5.4, level = .1 } = {}) {
    const x = new Float32Array(Math.round(seconds * SR)), a = (i) => Math.min(1, i / (.4 * SR));
    let phase = 0, seed = 7;
    for (let i = 0; i < x.length; i++) {
        const t = i / SR, f = f0 * 2 ** (Math.min(1, Math.max(0, (t - .3) / 1)) * depth * Math.sin(2 * Math.PI * rate * t) / 1200);
        phase += 2 * Math.PI * f / SR;
        let s = 0;
        for (let h = 1; h * f0 < 8000; h++) s += Math.sin(h * phase) / h;
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        x[i] = level * a(i) * (s + 1e-3 * ((seed >>> 0) / 2147483648 - 1));
    }
    return x;
}

test('a comb of harmonics finds the fundamental, and the centroid corrects it when vibrato smears the peaks', () => {
    const x = bowed(261.63, { depth: 25 }), n = 16384, p = powerSpectrum(x, Math.round(2 * SR), n);
    const f = refineFundamental(p, SR, n, findFundamental(p, SR, n, 261.63, { harmonics: 6 }));
    expect(Math.abs(1200 * Math.log2(f / 261.63))).toBeLessThan(8);   // the frame covers a little under two vibrato cycles, so its mean is not exactly the centre
});

test('analysing a synthetic bowed note recovers its pitch, vibrato rate and depth, and its swell', () => {
    const a = analyzeNote(bowed(196, { depth: 20, rate: 5.4 }), SR, { midi: 55, start: 0, mode: 'sustain' });
    expect(Math.abs(a.cents)).toBeLessThan(6);
    expect(Math.abs(a.vibrato.rate - 5.4)).toBeLessThan(.4);
    expect(a.vibrato.depths[4]).toBeGreaterThan(15); expect(a.vibrato.depths[4]).toBeLessThan(25);
    expect(a.vibrato.depths[0]).toBeLessThan(a.vibrato.depths[4]);          // vibrato builds up
    expect(a.cells[0][1]).toBeGreaterThan(a.cells[3][1] + 8);              // 1/n harmonics: the fourth is 12 dB under the first
    const swell = a.env[1];                                                   // band 250-500 Hz holds the 2nd harmonic
    expect(swell[0]).toBeLessThan(-6); expect(Math.abs(swell[swell.length - 1])).toBeLessThan(3);
});

test('a note outside the range of the instrument (nothing sounded) is not analysed', () => {
    const silent = new Float32Array(10 * SR);
    silent.set(bowed(300, { seconds: 2 }).subarray(0, 2 * SR), 8 * SR);
    expect(analyzeNote(silent, SR, { midi: 60, start: 1, mode: 'sustain' })).toBeNull();
});

/** A small table made from three synthetic notes (every third semitone) at two strengths. */
function tableFrom() {
    const notes = [];
    for (const midi of [57, 60, 63]) for (const [velocity, level] of [[40, .03], [127, .12]]) {
        const f0 = 440 * 2 ** ((midi - 69) / 12), a = analyzeNote(bowed(f0, { level }), SR, { midi, start: 0, mode: 'sustain' });
        notes.push({ ...a, velocity });
    }
    return unpackTable(packTable({ mode: 'sustain', rate: SR, notes }, { name: 'test' }));
}

test('a packed table keeps what is needed, and the model for a pitch between measured ones sits between their levels', () => {
    const table = tableFrom(), model = modelFor(table, 61, 127);
    expect(table.pitches.map((p) => p.pitch)).toEqual([57, 60, 63]);
    const lo = modelFor(table, 60, 127).level, hi = modelFor(table, 63, 127).level;
    expect(model.level).toBeGreaterThan(Math.min(lo, hi) - 2); expect(model.level).toBeLessThan(Math.max(lo, hi) + 2);
    expect(modelFor(table, 60, 127).level - modelFor(table, 60, 40).level).toBeGreaterThan(8);          // strength changes the level
    expect(modelFor(table, 60, 80).level).toBeGreaterThan(modelFor(table, 60, 40).level);
    expect(model.tonal[0]).toBeGreaterThan(model.tonal[3]);
});

test('a loop holds a whole number of fundamental periods and of vibrato cycles, close to the measured rate', () => {
    for (const f0 of [65.4, 130.8, 261.6, 523.3, 1046.5]) {
        const g = loopFor(f0, 5.4);
        expect(g.m / f0).toBeCloseTo(g.L, 9); expect(g.k / g.L).toBeCloseTo(g.rate, 9);
        expect(Math.abs(g.rate - 5.4)).toBeLessThan(1.2); expect(g.L).toBeGreaterThan(.9); expect(g.L).toBeLessThan(2.5);
    }
});

test('a sustained note loops without a step: the signal at the loop end continues into the loop start', () => {
    const model = modelFor(tableFrom(), 60, 100), note = renderSustained(model, SR, { seed: 3 });
    const at = (t) => note.buffer[Math.round(t * SR)];
    const slope = Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(at(note.loopStart + (i + 1) / SR) - at(note.loopStart + i / SR))));
    const step = Math.abs(at(note.loopEnd) - at(note.loopStart));
    expect(slope).toBeGreaterThan(0);
    expect(step).toBeLessThan(slope * 3);      // a real discontinuity is as big as the signal, many times a sample's change
});

test('a rendered bowed note has the pitch and the swell it was given', () => {
    const model = modelFor(tableFrom(), 60, 100), note = renderSustained(model, SR, { seed: 5 });
    const rms = (a, b) => { let s = 0; for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) s += note.buffer[i] ** 2; return Math.sqrt(s / ((b - a) * SR)); };
    expect(rms(0, .05)).toBeLessThan(rms(1.5, 2) * .6);
    expect(Number.isFinite(note.buffer[1000])).toBe(true);
    const p = powerSpectrum(note.buffer, Math.round(1.2 * SR), 16384);
    expect(Math.abs(1200 * Math.log2(refineFundamental(p, SR, 16384, findFundamental(p, SR, 16384, 261.63, { harmonics: 6 })) / 261.63))).toBeLessThan(6);
});

test('a decaying note renders to its fade and the release curve ends at silence', () => {
    const notes = [];
    for (const midi of [57, 63]) notes.push({ ...analyzeNote(bowed(440 * 2 ** ((midi - 69) / 12)), SR, { midi, start: 0, mode: 'decay' }), velocity: 80 });
    const table = unpackTable(packTable({ mode: 'decay', rate: SR, notes }, { name: 'decay' })), model = modelFor(table, 60, 80);
    const note = renderDecay(model, SR, { seconds: 2 });
    expect(note.buffer.length).toBe(2 * SR);
    expect(Math.abs(note.buffer[note.buffer.length - 1])).toBeLessThan(1e-3);
    const curve = releaseCurve(modelFor(tableFrom(), 60, 80));
    expect(curve.gains.at(-1)).toBe(0); expect(curve.gains[0]).toBeGreaterThan(.5);
});

test('a spectrogram reads a sinusoid at its frequency and amplitude, and the difference of two is their dB gap', async () => {
    const { spectrogram, difference, bandLevels } = await import('./spectrogram');
    const tone = (a) => new Float32Array(SR).map((_, i) => a * Math.sin(2 * Math.PI * 1500 * i / SR));
    const one = spectrogram(tone(.1), SR, { maxHz: 4000 }), half = spectrogram(tone(.05), SR, { maxHz: 4000 });
    const bin = Math.round(1500 / one.hz);
    expect(one.data[bin]).toBeGreaterThan(-20.5); expect(one.data[bin]).toBeLessThan(-19);            // 20 log10 .1 = -20 dB
    expect(difference(one, half).data[bin]).toBeCloseTo(-6.02, 0);
    const [low, high] = bandLevels(one, [500, 1000, 2000]);
    expect(high).toBeGreaterThan(low + 40);
});

test('a bow-noise bed adds noise between the harmonic lines, and none when it is absent', () => {
    const flat = (v) => Array.from({ length: BED_WINDOWS.length }, () => Array.from({ length: 18 }, () => v));
    const notes = [];
    for (const midi of [57, 60, 63]) for (const [velocity, level] of [[40, .03], [127, .12]]) {
        const f0 = 440 * 2 ** ((midi - 69) / 12);
        notes.push({ ...analyzeNote(bowed(f0, { level }), SR, { midi, start: 0, mode: 'sustain' }), velocity, bed: flat(-80) });
    }
    const model = modelFor(unpackTable(JSON.parse(JSON.stringify(packTable({ mode: 'sustain', rate: SR, notes }, { name: 't' })))), 60, 80);
    expect(model.bed.db.length).toBe(BED_WINDOWS.length);
    expect(model.bed.db[0][5]).toBeCloseTo(-80, 0);
    const quiet = renderSustained({ ...model, bed: null }, SR), loud = renderSustained({ ...model, bed: { ...model.bed, db: flat(-60) } }, SR);
    const power = (n) => { let s = 0; for (let i = Math.round(SR * 2.2); i < Math.round(SR * 2.4); i++) s += n.buffer[i] ** 2; return s; };
    expect(power(loud)).toBeGreaterThan(power(quiet));
});
