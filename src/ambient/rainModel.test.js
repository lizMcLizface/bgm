import { RainModel, LAYERS, MATERIALS, sanitizeEnvironment } from './rainModel.js';
import { powerSpectrum } from '../synth-lab/spectral.js';

const output = n => LAYERS.map(() => [new Float32Array(n), new Float32Array(n)]);
function render(environment, { rate = 24000, seconds = 3, seed = 731, block = 128 } = {}) {
    const model = new RainModel(rate, environment, seed), result = output(rate * seconds), scratch = output(block);
    for (let at = 0; at < result[0][0].length; at += block) {
        const n = Math.min(block, result[0][0].length - at);
        const part = n === block ? scratch : output(n); model.process(part);
        part.forEach((pair, l) => pair.forEach((ch, c) => result[l][c].set(ch, at)));
    }
    return { model, result };
}
const energy = x => x.reduce((s, v) => s + v * v, 0) / x.length;

test('seeded stream is invariant to render quantum size, including splash fragments', () => {
    const a = render({ surfaceType: 'puddle' }, { block: 128 }), b = render({ surfaceType: 'puddle' }, { block: 511 });
    expect(a.model.events).toBe(b.model.events);
    a.result.forEach((pair, l) => pair.forEach((ch, c) => expect(ch.every((v, i) => v === b.result[l][c][i])).toBe(true)));
});
test('dry weather produces silence and schedules no drops', () => {
    const { model, result } = render({ rainIntensity: 0 });
    expect(model.events).toBe(0);
    result.flat().forEach(ch => expect(energy(ch)).toBe(0));
});
test('high intensity increases arrival density; stationary and coupled rates are distinct', () => {
    const light = render({ rainIntensity: .15 }), heavy = render({ rainIntensity: 1 });
    expect(heavy.model.events).toBeGreaterThan(light.model.events * 8);
    const model = new RainModel(24000, { rainIntensity: .7, windChaos: 1, correlation: 0 });
    const block = output(2400), rates = [];
    for (let i = 0; i < 30; i++) { model.process(block); rates.push(model.rateNow); }
    expect(Math.max(...rates) - Math.min(...rates)).toBeLessThan(1e-8);
    model.setEnvironment({ correlation: 1 });
    for (let i = 0; i < 30; i++) { model.process(block); rates.push(model.rateNow); }
    expect(Math.max(...rates) - Math.min(...rates)).toBeGreaterThan(5);
});
test('pressure is mono while wash and foreground have independent spatial information', () => {
    const { result } = render({ rainIntensity: .8 });
    expect(result[0][0].every((v, i) => v === result[0][1][i])).toBe(true);
    for (const l of [1, 2, 3, 4, 5]) {
        let difference = 0;
        for (let i = 0; i < result[l][0].length; i++) difference += (result[l][0][i] - result[l][1][i]) ** 2;
        expect(difference).toBeGreaterThan(.01);
    }
});
test.each([8000, 44100, 48000, 96000])('all materials remain finite at %i Hz with bounded voice usage and headroom', rate => {
    for (const material of Object.keys(MATERIALS)) {
        const { model, result } = render({ rainIntensity: 1, windChaos: 1, surfaceType: material }, { rate, seconds: 1 });
        let peak = 0, finite = true;
        for (let i = 0; i < rate; i++) for (let c = 0; c < 2; c++) {
            let sample = 0; for (const pair of result) { const v = pair[c][i]; finite &&= Number.isFinite(v); sample += v; }
            peak = Math.max(peak, Math.abs(sample));
        }
        expect(finite).toBe(true); expect(peak).toBeLessThan(1); expect(model.voices).toHaveLength(96);
    }
});
test('material colours change the foreground sound and controls settle to silence', () => {
    const glass = render({ surfaceType: 'glass' }), tin = render({ surfaceType: 'tin' });
    expect(glass.result[5][0].some((v, i) => v !== tin.result[5][0][i])).toBe(true);
    tin.model.setEnvironment({ rainIntensity: 0 });
    const silent = output(48000); tin.model.process(silent);
    expect(energy(silent[5][0].slice(36000))).toBe(0);
    expect(energy(silent[3][0].slice(36000))).toBeLessThan(1e-20);
});

function envelopeStats(x, rate) {
    const hop = Math.round(rate * .002), envelope = [];
    for (let start = 0; start + hop <= x.length; start += hop) {
        let e = 0; for (let i = start; i < start + hop; i++) e += x[i] ** 2;
        envelope.push(Math.sqrt(e / hop));
    }
    const mean = envelope.reduce((s, x) => s + x, 0) / envelope.length;
    const variance = envelope.reduce((s, x) => s + (x - mean) ** 2, 0) / envelope.length;
    let ac = 0;
    for (let i = 0; i < envelope.length - 5; i++) ac += (envelope[i] - mean) * (envelope[i + 5] - mean);
    return { cv: Math.sqrt(variance) / mean, ac10ms: ac / (envelope.length - 5) / variance };
}
test('body and air retain short splatter envelopes with macro weather held stationary', () => {
    const smooth = render({ impactTexture: 0, correlation: 0 }, { seconds: 5 });
    const textured = render({ impactTexture: 1, correlation: 0 }, { seconds: 5 });
    for (const layer of [1, 4]) {
        const a = envelopeStats(smooth.result[layer][0], 24000), b = envelopeStats(textured.result[layer][0], 24000);
        // Body should remain softly textured, not meet the splash's sharpness target.
        expect(b.cv).toBeGreaterThan(a.cv * (layer === 1 ? 1.1 : 1.5));
        expect(b.ac10ms).toBeGreaterThan(.2);
        expect(b.ac10ms).toBeGreaterThan(a.ac10ms + .2);
    }
});

function bandFraction(x, low, high, rate = 24000) {
    let band = 0, total = 0;
    for (let offset = rate; offset + 8192 <= x.length; offset += 8192) {
        const spectrum = powerSpectrum(x, rate, { offset, size: 8192 });
        for (let k = 1; k < spectrum.power.length; k++) {
            const hz = k * spectrum.binHz, p = spectrum.power[k]; total += p;
            if (hz >= low && hz < high) band += p;
        }
    }
    return band / total;
}
test('distant layers keep dull body, gentle mist and depth under the bright frying texture', () => {
    const { result } = render({ impactTexture: 1, correlation: 0 }, { seconds: 5 });
    expect(bandFraction(result[1][0], 1200, 12000)).toBeLessThan(.04);
    expect(envelopeStats(result[2][0], 24000).cv).toBeLessThan(.3);
    expect(bandFraction(result[4][0], 1000, 4000)).toBeGreaterThan(.12);
    expect(bandFraction(result[4][0], 7000, 12000)).toBeGreaterThan(.3);
});
test('near patter suppresses bright crackle and the instantaneous popcorn onset', () => {
    const { result } = render({ correlation: 0 }, { seconds: 5 });
    expect(bandFraction(result[5][0], 5000, 12000)).toBeLessThan(.035);
    for (const surfaceType of ['mixed', 'leaves', 'concrete', 'glass', 'tin', 'puddle']) {
        const rate = 24000, model = new RainModel(rate, { rainIntensity: 0, surfaceType }), isolated = output(rate / 2);
        model.drop(); model.process(isolated);
        const x = isolated[5][0]; let total = 0, onset = 0;
        for (let i = 0; i < x.length; i++) { total += x[i] ** 2; if (i < rate * .001) onset += x[i] ** 2; }
        expect(total).toBeGreaterThan(0);
        expect(onset / total).toBeLessThan(.002);
    }
});
test.each(['glass', 'tin', 'puddle'])('%s impacts have broad noisy attacks without a sustained musical tail', surfaceType => {
    const rate = 24000, model = new RainModel(rate, { rainIntensity: 0, surfaceType }), out = output(rate / 2);
    // An isolated foreground hit, with no wash or subsequent scheduled rain.
    model.drop(); model.process(out); const x = out[5][0];
    let total = 0, late = 0, periodicity = 0;
    for (let i = 0; i < x.length; i++) { total += x[i] ** 2; if (i > rate * .07) late += x[i] ** 2; }
    for (let lag = Math.round(rate * .0005); lag < rate * .006; lag++) {
        let xy = 0, xx = 0, yy = 0;
        for (let i = 0; i < rate * .14 - lag; i++) { xy += x[i] * x[i + lag]; xx += x[i] ** 2; yy += x[i + lag] ** 2; }
        periodicity = Math.max(periodicity, xy / Math.sqrt(xx * yy));
    }
    expect(total).toBeGreaterThan(0);
    expect(late / total).toBeLessThan(.01);
    expect(periodicity).toBeLessThan(.5);
});
test('invalid controls cannot poison DSP state', () => {
    expect(sanitizeEnvironment({ rainIntensity: Infinity, windChaos: -2, indoorFilter: 9, surfaceType: '__proto__' }))
        .toMatchObject({ rainIntensity: .5, windChaos: 0, indoorFilter: 1, surfaceType: 'mixed' });
});
