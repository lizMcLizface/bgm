import { WeatherModel, WEATHER_LAYERS, sanitizeWeather } from './weatherModel.js';
import { RainModel } from './rainModel.js';
import { DiffuseTail } from './weatherEvents.js';
import { powerSpectrum } from '../synth-lab/spectral.js';

const output = n => WEATHER_LAYERS.map(() => [new Float32Array(n), new Float32Array(n)]);
function render(environment, { seconds = 12, rate = 8000, block = 128, trigger = [], seed = 731 } = {}) {
    const model = new WeatherModel(rate, { rainIntensity: 0, ...environment }, seed), result = output(seconds * rate), scratch = output(block);
    trigger.forEach(type => model.trigger(type));
    for (let at = 0; at < seconds * rate; at += block) {
        const n = Math.min(block, seconds * rate - at), part = n === block ? scratch : output(n);
        model.process(part); part.forEach((pair, l) => pair.forEach((ch, c) => result[l][c].set(ch, at)));
    }
    return { model, result };
}
const power = (pair, start = 0, end = pair[0].length) => {
    let sum = 0; for (const ch of pair) for (let i = start; i < end; i++) sum += ch[i] ** 2;
    return sum / ((end - start) * pair.length);
};

test('new events default to silence and preserve the tuned rain stream exactly', () => {
    const weather = new WeatherModel(24000), rain = new RainModel(24000), a = output(24000), b = output(24000);
    weather.process(a); rain.process(b);
    for (let l = 0; l < 6; l++) for (let c = 0; c < 2; c++) expect(a[l][c].every((v, i) => v === b[l][c][i])).toBe(true);
    for (let l = 6; l < 12; l++) expect(power(a[l])).toBe(0);
});
test('thunder has an initial report, a later low roll, stereo echoes and a falling tail', () => {
    const { result } = render({}, { seconds: 24, trigger: ['thunder'] });
    expect(power(result[6], 0, 4000)).toBeGreaterThan(1e-8);
    expect(power(result[7], 8000, 48000)).toBeGreaterThan(1e-6);
    expect(power(result[8], 8000, 48000)).toBeGreaterThan(1e-8);
    expect(power(result[7], 160000, 184000)).toBeLessThan(power(result[7], 16000, 48000) * .02);
    expect(result[8][0].some((v, i) => Math.abs(v - result[8][1][i]) > .0001)).toBe(true);
});
test('generated reverberation starts after the direct sound, spreads in stereo and decays', () => {
    const reverb = new DiffuseTail(8000), early = [], late = [];
    for (let i = 0; i < 8000 * 10; i++) {
        reverb.tick(i === 0 ? 1 : 0, 0);
        if (i < 1000) expect(reverb.left).toBe(0);
        if (i > 1000 && i < 16000) early.push(reverb.left ** 2 + reverb.right ** 2);
        if (i > 64000) late.push(reverb.left ** 2 + reverb.right ** 2);
    }
    expect(early.reduce((s, x) => s + x, 0)).toBeGreaterThan(.001);
    expect(late.reduce((s, x) => s + x, 0)).toBeLessThan(early.reduce((s, x) => s + x, 0) * .001);
});
test('a wave approaches before breaking, then leaves foam and a quieter retreat', () => {
    const { result } = render({}, { seconds: 24, trigger: ['surf'] });
    expect(power(result[9], 1000, 8000)).toBeGreaterThan(1e-8);
    expect(power(result[10], 0, 8000)).toBe(0);
    expect(power(result[11], 0, 8000)).toBe(0);
    expect(power(result[10], 24000, 40000)).toBeGreaterThan(1e-6);
    expect(power(result[11], 40000, 64000)).toBeGreaterThan(1e-6);
    expect(power(result[10], 96000, 112000)).toBeLessThan(power(result[10], 24000, 40000) * .01);
    expect(power(result[11], 160000, 184000)).toBeLessThan(power(result[11], 40000, 64000) * .02);
});

function spectralShare(pair, from, to, secondsFrom, secondsTo, rate = 8000) {
    let energy = 0, band = 0, weighted = 0;
    for (const x of pair) for (let at = Math.round(secondsFrom * rate); at + 2048 <= secondsTo * rate; at += 2048) {
        const s = powerSpectrum(x, rate, { offset: at, size: 2048 });
        for (let k = 1; k < s.power.length; k++) {
            const hz = k * s.binHz, p = s.power[k]; energy += p; weighted += hz * p;
            if (hz >= from && hz < to) band += p;
        }
    }
    return { fraction: band / energy, centroid: weighted / energy };
}
test('thunder starts as a compact strike and rolls mostly below 180 Hz rather than hissing', () => {
    const { result } = render({}, { seconds: 12, trigger: ['thunder'] });
    expect(power(result[6], 0, 3200)).toBeGreaterThan(power(result[6], 3200, 8000) * 100);
    expect(spectralShare(result[7], 0, 180, 1, 9).fraction).toBeGreaterThan(.85);
    expect(spectralShare(result[7], 500, 4000, 1, 9).fraction).toBeLessThan(.01);
});
test('wave colour stays coherent through the crest and retreat instead of a rapid filter handoff', () => {
    const { result } = render({}, { seconds: 12, trigger: ['surf'] });
    const approach = spectralShare(result[9], 0, 4000, .5, 2).centroid;
    const crest = spectralShare(result[10], 0, 4000, 3, 5).centroid;
    const wash = spectralShare(result[11], 0, 4000, 6, 10).centroid;
    expect(approach).toBeGreaterThan(0);
    expect(crest / approach).toBeGreaterThan(.7); expect(crest / approach).toBeLessThan(1.4);
    expect(wash / crest).toBeGreaterThan(.7); expect(wash / crest).toBeLessThan(1.4);
});
test('event synthesis and scheduling are invariant to render block boundaries', () => {
    const e = { thunderActivity: 1, surfLevel: .8, wavePace: .7 };
    const a = render(e, { seconds: 8, block: 128, trigger: ['thunder', 'surf'] });
    const b = render(e, { seconds: 8, block: 313, trigger: ['thunder', 'surf'] });
    a.result.forEach((pair, l) => pair.forEach((ch, c) => expect(ch.every((v, i) => v === b.result[l][c][i])).toBe(true)));
});
test('automatic wave intervals vary and zero activity stops new events while tails finish', () => {
    const model = new WeatherModel(8000, { rainIntensity: 0, surfLevel: .8, wavePace: .7, thunderActivity: 1 }), block = output(800);
    const times = []; let count = 0;
    for (let i = 0; i < 500; i++) { model.process(block); if (model.surf.events > count) { count = model.surf.events; times.push(i * .1); } }
    expect(times.length).toBeGreaterThan(3); expect(model.thunder.events).toBeGreaterThan(1);
    const gaps = times.slice(1).map((t, i) => t - times[i]); expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(.5);
    const thunderCount = model.thunder.events, waveCount = model.surf.events;
    model.setEnvironment({ thunderActivity: 0, surfLevel: 0 });
    for (let i = 0; i < 600; i++) model.process(block);
    expect(model.thunder.events).toBe(thunderCount); expect(model.surf.events).toBe(waveCount);
    expect(model.thunder.stats().active).toBe(0); expect(model.surf.stats().active).toBe(0);
    expect(power(block[7]) + power(block[8]) + power(block[11])).toBeLessThan(1e-12);
});
test.each([8000, 44100, 48000, 96000])('combined weather remains finite with headroom at %i Hz', rate => {
    const { model, result } = render({ rainIntensity: 1, windChaos: 1, thunderPower: 1, thunderDecay: 1, waveSize: 1, waveFoam: 1 },
        { rate, seconds: 5, trigger: ['thunder', 'surf'] });
    let finite = true, peak = 0;
    for (let i = 0; i < rate * 5; i++) for (let c = 0; c < 2; c++) {
        let sample = 0; for (const pair of result) { finite &&= Number.isFinite(pair[c][i]); sample += pair[c][i]; }
        peak = Math.max(peak, Math.abs(sample));
    }
    expect(finite).toBe(true); expect(peak).toBeLessThan(1);
    expect(model.thunder.voices).toHaveLength(4); expect(model.surf.voices).toHaveLength(8);
});
test('rapid manual triggering has a bounded event budget and invalid controls are sanitized', () => {
    const model = new WeatherModel();
    for (let i = 0; i < 100; i++) { model.trigger('thunder'); model.trigger('surf'); }
    expect(model.thunder.events).toBe(4); expect(model.surf.events).toBe(8);
    expect(model.thunder.skipped).toBe(96); expect(model.surf.skipped).toBe(92);
    expect(model.trigger('unknown')).toBe(false);
    expect(sanitizeWeather({ thunderDistance: Infinity, surfLevel: -3, waveSize: 12 })).toMatchObject({ thunderDistance: .6, surfLevel: 0, waveSize: 1 });
});
