import { decimate, heterodyne, fft, magnitudeSpectrum, peakNear } from './dsp';
import { analyzeNote, fitStiffness, fitEnvelope, findOnset } from './analysis';
import { renderPianoModel, partialEnvelope, releaseGain, normalizedGain, lowBandRms } from './synth';
import { renderAcousticPiano } from '../acousticPiano';
import { modelFor, blendAnalyses } from './interpolate';
import { fitHammer, applyHammer, curveAt, NODES } from './hammer';
import { packTable, unpackTable, levelTrims } from './tableFile';

const SR = 48000;
const rms = (x, a, b) => { let s = 0; const i0 = Math.round(a * SR), i1 = Math.min(x.length, Math.round(b * SR)); for (let i = i0; i < i1; i++) s += x[i] ** 2; return Math.sqrt(s / Math.max(1, i1 - i0)); };
const dB = (a, b) => 20 * Math.log10((a + 1e-12) / (b + 1e-12));

test('the FFT puts a sinusoid in the right bin, and a spectral peak is found to a fraction of a bin', () => {
    const x = new Float32Array(8192).map((_, i) => .5 * Math.sin(2 * Math.PI * 1234.5 * i / SR));
    const spec = magnitudeSpectrum(x, SR, 1000, 4096, 4);
    const peak = peakNear(spec, 1200, .1);
    expect(Math.abs(peak.f - 1234.5)).toBeLessThan(.5);
    expect(peak.a).toBeGreaterThan(.45); expect(peak.a).toBeLessThan(.55);
    const re = Float64Array.from([1, 0, 0, 0]), im = new Float64Array(4);
    fft(re, im);
    expect([...re]).toEqual([1, 1, 1, 1]);
});

test('decimation keeps what is below the new Nyquist and removes what is above it', () => {
    const tone = (f) => new Float32Array(48000).map((_, i) => Math.sin(2 * Math.PI * f * i / 96000));
    const low = decimate(tone(1000), 2), high = decimate(tone(30000), 2);
    expect(low.length).toBe(24000);
    const level = (x) => Math.sqrt(x.subarray(2000, 20000).reduce((a, v) => a + v * v, 0) / 18000);
    expect(level(low)).toBeGreaterThan(.68); expect(level(high)).toBeLessThan(.02);
});

test('heterodyne reads the amplitude and decay of one partial and rejects its neighbours', () => {
    const f = 220, x = new Float32Array(SR * 2).map((_, i) => {
        const t = i / SR;
        return .3 * Math.exp(-t * 1.5) * Math.sin(2 * Math.PI * f * t) + .3 * Math.sin(2 * Math.PI * 2 * f * t) + .3 * Math.sin(2 * Math.PI * 3 * f * t);
    });
    const env = heterodyne(x, SR, f, Math.round(SR / f), .01, 1.5);
    const a = (k) => Math.hypot(env.re[k], env.im[k]);
    expect(a(10)).toBeGreaterThan(.3 * Math.exp(-.1 * 1.5) * .93); expect(a(10)).toBeLessThan(.3 * Math.exp(-.1 * 1.5) * 1.07);
    expect(dB(a(100), a(50))).toBeGreaterThan(-8 * 1.5 / 8.7 * .5 - 8);       // falls by about 1.5 * 0.5 s * 8.7 dB/neper = 6.5 dB
    expect(dB(a(100), a(50))).toBeLessThan(-5);
});

test('stiffness is recovered from partial frequencies', () => {
    const f1 = 110, B = 4e-4, points = [1, 2, 3, 5, 8, 13, 20].map((n) => ({ n, f: n * f1 * Math.sqrt(1 + B * n * n) }));
    const fit = fitStiffness(points);
    expect(fit.f1).toBeCloseTo(f1, 1); expect(fit.B).toBeCloseTo(B, 4);
});

test('onset and the swell of an envelope are read from where it crosses 10% and 90%', () => {
    const x = new Float32Array(SR).map((_, i) => (i / SR > .02 ? Math.sin(2 * Math.PI * 300 * i / SR) * (1 - Math.exp(-(i / SR - .02) / .008)) ** 3 : 0));
    expect(findOnset(x, SR)).toBeGreaterThan(.02); expect(findOnset(x, SR)).toBeLessThan(.04);
    const A = new Float64Array(400).map((_, i) => (1 - Math.exp(-i * .002 / .01)) ** 3 * Math.exp(-i * .002 * 1.2));
    const fit = fitEnvelope(A, .8, 100);
    expect(fit.rise).toBeGreaterThan(.005); expect(fit.rise).toBeLessThan(.02);
});

// A note built from known parameters comes back out of the analysis with them.
const KNOWN = {
    held: 4, noise: [],
    partials: Array.from({ length: 14 }, (_, i) => {
        const n = i + 1;
        return { n, f: n * 98 * Math.sqrt(1 + 3e-4 * n * n), a: .05 / n ** .6, delay: .004, rise: .004, tPeak: .03, s1: -10 - 2 * n, s2: -3 - .3 * n, tb: n === 3 ? .9 : 1.1,
            beat: n === 5 ? .7 : 0, beatDepth: n === 5 ? .3 : 0, beatPhase: 0 };
    }),
};

test('model, analysis, model: stiffness, decay stages and beating survive the round trip', () => {
    const x = renderPianoModel(KNOWN, SR, { seconds: 5, noise: 0 });
    const m = analyzeNote(x, SR, { midi: 43, held: 4 });
    expect(Math.abs(m.f1 / 98 - 1)).toBeLessThan(.002);
    expect(Math.abs(m.B / 3e-4 - 1)).toBeLessThan(.25);
    expect(m.partials.length).toBeGreaterThanOrEqual(12);
    const p = (n) => m.partials.find((q) => q.n === n);
    expect(p(3).s1).toBeLessThan(p(3).s2 - 3);
    expect(Math.abs(p(3).s1 - KNOWN.partials[2].s1)).toBeLessThan(5); expect(Math.abs(p(3).s2 - KNOWN.partials[2].s2)).toBeLessThan(2);
    expect(p(5).beatDepth).toBeGreaterThan(.12); expect(Math.abs(p(5).beat - .7)).toBeLessThan(.15);
    expect(p(2).beatDepth).toBeLessThan(.12);
    // and the rebuilt note is close to the first one all the way down
    const again = renderPianoModel(m, SR, { seconds: 5, noise: 0 });
    for (const [a, b] of [[.05, .1], [.1, .3], [.3, .8], [.8, 1.5], [1.5, 3]]) expect(Math.abs(dB(rms(again, a, b), rms(x, a, b)))).toBeLessThan(1.5);
});

test('a note from the current piano model is rebuilt within 1.5 dB at every moment, and sounds at the same pitches', () => {
    for (const midi of [40, 64]) {
        const f0 = 440 * 2 ** ((midi - 69) / 12), src = renderAcousticPiano(SR, f0, { type: 'concert', decay: 2.8, brightness: .55, hammer: .45, unison: .25, resonance: .6, seed: 11, velocity: .75 });
        const m = analyzeNote(src, SR, { midi, held: 4 });
        expect(Math.abs(m.f1 / f0 - 1)).toBeLessThan(.003);
        const re = renderPianoModel(m, SR, { seconds: 4.5 });
        for (const [a, b] of [[.03, .06], [.06, .12], [.12, .3], [.3, .8], [.8, 1.5], [1.5, 2.5]]) expect(Math.abs(dB(rms(re, a, b), rms(src, a, b))), `${midi} ${a}-${b}`).toBeLessThan(1.5);
        const nonzero = m.partials.filter((q) => partialEnvelope(q, q.tPeak + .05) > 0);
        expect(nonzero.length).toBe(m.partials.length);
    }
});

test('a pitch that was not measured is interpolated from its neighbours, close to what the source model plays there', () => {
    const play = (midi, velocity) => renderAcousticPiano(SR, 440 * 2 ** ((midi - 69) / 12), { type: 'concert', decay: 2.8, brightness: .55, hammer: .45, unison: .25, resonance: .6, seed: 11, velocity });
    const table = [];
    for (const [velocity, v] of [[50, .4], [110, .9]]) for (const pitch of [36, 48, 60]) table.push({ pitch, velocity, analysis: analyzeNote(play(pitch, v), SR, { midi: pitch, held: 4 }) });
    const m = modelFor(table, 54, 110);
    expect(m.midi).toBe(54);
    expect(Math.abs(m.f1 / (440 * 2 ** ((54 - 69) / 12)) - 1)).toBeLessThan(.01);
    const made = renderPianoModel(m, SR, { seconds: 4 }), truth = play(54, .9);
    for (const [a, b] of [[.06, .12], [.12, .3], [.3, .8], [.8, 1.5], [1.5, 2.5]]) expect(Math.abs(dB(rms(made, a, b), rms(truth, a, b))), `${a}-${b}`).toBeLessThan(3.5);
    // strength: a softer blow is quieter, in proportion to the measured layers
    const soft = renderPianoModel(modelFor(table, 54, 50), SR, { seconds: 2 }), loud = renderPianoModel(modelFor(table, 54, 110), SR, { seconds: 2 });
    const truthGap = dB(rms(play(54, .9), .1, .5), rms(play(54, .4), .1, .5));
    expect(Math.abs(dB(rms(loud, .1, .5), rms(soft, .1, .5)) - truthGap)).toBeLessThan(2.5);
    // between two analyses of one note's pitch the blend is the analysis itself at the ends
    const a = table[0].analysis, same = blendAnalyses(a, a, .3, a.midi);
    expect(same.partials.length).toBe(a.partials.length); expect(Math.abs(same.f1 / a.f1 - 1)).toBeLessThan(1e-9);
});

test('asking for a measured strength gives that measured note back, and an unmeasured one lies between its layers', () => {
    const play = (midi, v) => renderAcousticPiano(SR, 440 * 2 ** ((midi - 69) / 12), { type: 'concert', decay: 2.8, brightness: .55 + v * .3, hammer: v, unison: .25, resonance: .6, seed: 11, velocity: v });
    const table = [];
    for (const [velocity, v] of [[40, .3], [80, .6], [115, .9]]) for (const pitch of [48, 60]) table.push({ pitch, velocity, analysis: analyzeNote(play(pitch, v), SR, { midi: pitch, held: 3 }) });
    const at = (v) => modelFor(table, 60, v, { hammer: false });
    const measured = table.find((n) => n.pitch === 60 && n.velocity === 80).analysis;
    expect(at(80).partials[0].a).toBeCloseTo(measured.partials[0].a, 9);
    expect(at(40).partials[0].a).toBeCloseTo(table.find((n) => n.pitch === 60 && n.velocity === 40).analysis.partials[0].a, 9);
    const level = (v) => at(v).level;
    expect(level(60)).toBeGreaterThan(Math.min(level(40), level(80)) - 1e-12); expect(level(60)).toBeLessThan(Math.max(level(40), level(80)) + 1e-12);
    // beyond the loudest layer the note keeps growing, but only by a bounded amount
    expect(level(127)).toBeLessThan(level(115) * 10 ** (12 / 20) + 1e-12);
});

test('a note whose key comes up is silenced by the damper: slowly at first, then quickly, and never before the key', () => {
    expect(releaseGain(-1)).toBe(1); expect(releaseGain(0)).toBe(1);
    expect(20 * Math.log10(releaseGain(.15))).toBeCloseTo(-6, 0); expect(20 * Math.log10(releaseGain(.3))).toBeLessThan(-20);
    expect(20 * Math.log10(releaseGain(.8))).toBeLessThan(-70);
    const ringing = renderPianoModel(KNOWN, SR, { seconds: 3 }), cut = renderPianoModel(KNOWN, SR, { seconds: 3, keyUp: 1 });
    for (let i = 0; i < SR * .95; i++) expect(cut[i]).toBeCloseTo(ringing[i], 7);
    expect(dB(rms(cut, 1.4, 1.5), rms(ringing, 1.4, 1.5))).toBeLessThan(-25);
    expect(rms(cut, 2, 3)).toBeLessThan(rms(ringing, 2, 3) * 1e-3);
    expect(renderPianoModel(KNOWN, SR, { keyUp: .5 }).length).toBe(Math.ceil(1.4 * SR));
});

test('the hammer curves learned from layers brighten harder blows, leave the reference alone and reach strengths nobody measured', () => {
    const play = (midi, v) => renderAcousticPiano(SR, 440 * 2 ** ((midi - 69) / 12), { type: 'concert', decay: 2.8, brightness: .3 + v * .5, hammer: v, unison: .25, resonance: .6, seed: 11, velocity: v });
    const table = [];
    for (const [velocity, v] of [[40, .3], [80, .6], [115, .95]]) for (const pitch of [40, 52, 64]) table.push({ pitch, velocity, analysis: analyzeNote(play(pitch, v), SR, { midi: pitch, held: 3 }) });
    const h = fitHammer(table);
    expect(h.reference).toBe(115);
    // softer blows lose the upper partials faster than the lower ones
    expect(curveAt(h.S, NODES[5])).toBeGreaterThan(curveAt(h.S, NODES[0]) + 3);
    const ref = modelFor(table, 52, 115), soft = modelFor(table, 52, 40), softer = modelFor(table, 52, 15);
    expect(applyHammer(ref, h, 115).partials[3].a).toBeCloseTo(ref.partials[3].a, 12);
    const level = (m, n) => m.partials.find((p) => p.n === n).a;
    for (const n of [1, 8]) {
        const f = ref.partials.find((p) => p.n === n).f, expected = 10 ** (-Math.log(115 / 15) * curveAt(h.S, f) / 20);
        expect(level(softer, n) / level(ref, n), `partial ${n}`).toBeCloseTo(expected, 8);
    }
    // the strength the table never held is close to what the source plays there
    const made = renderPianoModel(modelFor(table, 52, 80), SR, { seconds: 3 }), truth = play(52, .6);
    for (const [a, b] of [[.06, .12], [.12, .3], [.3, .8], [.8, 1.5]]) expect(Math.abs(dB(rms(made, a, b), rms(truth, a, b))), `${a}-${b}`).toBeLessThan(3);
});

test('a table packed into its file and loaded again plays the same notes, from the reference layer alone', () => {
    const play = (midi, v) => renderAcousticPiano(SR, 440 * 2 ** ((midi - 69) / 12), { type: 'concert', decay: 2.8, brightness: .3 + v * .5, hammer: v, unison: .25, resonance: .6, seed: 11, velocity: v });
    const table = [];
    for (const [velocity, v] of [[40, .3], [115, .95]]) for (const pitch of [40, 52, 64]) table.push({ kind: 'held', pitch, velocity, analysis: analyzeNote(play(pitch, v), SR, { midi: pitch, held: 3 }) });
    const text = JSON.stringify(packTable(table, { name: 'test', rate: SR })), loaded = unpackTable(JSON.parse(text));
    expect(loaded.length).toBe(3); expect(new Set(loaded.map((n) => n.velocity))).toEqual(new Set([115]));
    expect(loaded.hammer.S).toHaveLength(NODES.length);
    for (const velocity of [30, 80, 115]) {
        const a = modelFor(table, 52, velocity), b = modelFor(loaded, 52, velocity);
        expect(b.partials.length).toBeGreaterThan(a.partials.length * .6);
        const made = renderPianoModel(b, SR, { seconds: 2 }), ref = renderPianoModel(a, SR, { seconds: 2 });
        for (const [x, y] of [[.05, .2], [.2, .6], [.6, 1.5]]) expect(Math.abs(dB(rms(made, x, y), rms(ref, x, y))), `${velocity} ${x}-${y}`).toBeLessThan(1.5);
    }
});

test('level trims pull an uneven row of notes toward a smooth curve, and leave a smooth one alone', () => {
    const pitches = [36, 39, 42, 45, 48, 51, 54], smooth = [-20, -21, -22, -23, -24, -25, -26];
    for (const t of levelTrims(pitches, smooth)) expect(Math.abs(t)).toBeLessThan(1);          // a straight line only bends at its ends
    const uneven = smooth.map((v, i) => v + (i === 3 ? -6 : 0)), trims = levelTrims(pitches, uneven);
    expect(trims[3]).toBeGreaterThan(2.5); expect(trims[3]).toBeLessThan(6);
    expect(Math.abs(trims[0])).toBeLessThan(2);
});

const playSource = (midi, v) => renderAcousticPiano(SR, 440 * 2 ** ((midi - 69) / 12), { type: 'concert', decay: 2.8, brightness: .3 + v * .5, hammer: v, unison: .25, resonance: .6, seed: 11, velocity: v });

test('packing evens the levels of the notes by the amount asked, and 0 leaves the measurements as they were', () => {
    const table = [];
    for (const [velocity, v] of [[40, .3], [115, .95]]) for (const pitch of [40, 43, 46, 49, 52]) table.push({ kind: 'held', pitch, velocity, analysis: analyzeNote(playSource(pitch, v), SR, { midi: pitch, held: 3 }) });
    // make one note 6 dB too quiet, as a sampler's gain staging might
    const quiet = table.find((n) => n.pitch === 46 && n.velocity === 115).analysis, was = quiet.level;
    quiet.level *= .5; quiet.partials.forEach((p) => { p.a *= .5; });
    const level = (file, pitch) => file.notes.find((n) => n.pitch === pitch).level;
    const raw = packTable(table, { rate: SR, evenness: 0 }), even = packTable(table, { rate: SR, evenness: 1 });
    expect(level(raw, 46)).toBeCloseTo(20 * Math.log10(was * .5), 1);   // levels are stored to 0.1 dB
    expect(level(even, 46)).toBeGreaterThan(level(raw, 46) + 2);
    expect(Math.abs(level(even, 40) - level(raw, 40))).toBeLessThan(2.5);
});

test('normalised gain gives every note and strength the same low-band weight', () => {
    const table = [];
    for (const [velocity, v] of [[40, .3], [115, .95]]) for (const pitch of [40, 52, 64]) table.push({ pitch, velocity, analysis: analyzeNote(playSource(pitch, v), SR, { midi: pitch, held: 3 }) });
    const weight = (midi, velocity) => {
        const m = modelFor(table, midi, velocity);
        return 20 * Math.log10(normalizedGain(m) * lowBandRms(m));
    };
    for (const [midi, velocity] of [[40, 115], [46, 60], [58, 20], [64, 127]]) expect(weight(midi, velocity)).toBeCloseTo(20 * Math.log10(.08), 6);
});
