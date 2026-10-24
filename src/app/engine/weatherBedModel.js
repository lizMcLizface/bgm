import { WeatherModel } from '../../ambient/weatherModel.js';
import { defaultShape } from './ambienceSynth.js';

export const WEATHER_SOURCES = ['rain', 'thunder', 'waves'];
const shapeDefaults = shape => Object.fromEntries(WEATHER_SOURCES.map(id => [id, { ...defaultShape(id), ...shape?.[id] }]));
export function weatherEnvironment(shape, levels) {
    const { rain: r, thunder: t, waves: w } = shapeDefaults(shape);
    return { rainIntensity: levels.rain > 0 ? r.intensity : 0, windChaos: r.wind, correlation: r.coupling,
        impactTexture: r.texture, surfaceType: r.surface,
        thunderActivity: levels.thunder > 0 ? .03 + .97 * t.frequency : 0,
        thunderDistance: t.distance, thunderPower: t.intensity, thunderDecay: t.decay,
        surfLevel: levels.waves > 0 ? 1 : 0, waveSize: w.size, wavePace: 1 - w.period, waveFoam: w.retreat };
}
const attenuation = (db, shelter) => 10 ** (-db * shelter / 20);

// The lab's tuned synthesis, grouped into three independent main-page sources.
// Level/pan/width/distance and shelter low-passes live in Ambience's native chains.
export class WeatherBedModel {
    constructor(rate, shape = {}, levels = {}, seed = 1) {
        this.rate = rate; this.shape = shapeDefaults(shape); this.levels = levels;
        this.model = new WeatherModel(rate, weatherEnvironment(this.shape, levels), seed);
        this.smooth = 1 - Math.exp(-1 / (rate * .04)); this.gains = new Float64Array(12);
        this.setState(shape, levels); this.gains.set(this.targets);
    }
    setState(shape, levels) {
        this.shape = shapeDefaults(shape); this.levels = { ...levels };
        this.model.setEnvironment(weatherEnvironment(this.shape, levels));
        const { rain: r, thunder: t, waves: w } = this.shape;
        this.targets = Float64Array.from([
            attenuation(3, r.shelter), ...[0, 1, 2, 3].map(() => attenuation(9, r.shelter)),
            Math.min(2.5, r.drops / .4) * attenuation(24, r.shelter),
            t.crack * attenuation(15, t.shelter), t.roll * attenuation(3, t.shelter), t.echo * attenuation(6, t.shelter),
            w.surge * attenuation(9, w.shelter), w.break * attenuation(9, w.shelter), w.wash * attenuation(9, w.shelter),
        ]);
    }
    process(outputs) {
        const n = outputs[0][0].length;
        if (this.scratch?.[0][0].length !== n) this.scratch = Array.from({ length: 12 }, () => [new Float32Array(n), new Float32Array(n)]);
        this.model.process(this.scratch);
        for (let i = 0; i < n; i++) {
            for (let l = 0; l < 12; l++) this.gains[l] += this.smooth * (this.targets[l] - this.gains[l]);
            for (let c = 0; c < 2; c++) {
                let rain = 0, thunder = 0, waves = 0;
                for (let l = 0; l < 6; l++) rain += this.scratch[l][c][i] * this.gains[l];
                for (let l = 6; l < 9; l++) thunder += this.scratch[l][c][i] * this.gains[l];
                for (let l = 9; l < 12; l++) waves += this.scratch[l][c][i] * this.gains[l];
                outputs[0][c][i] = rain; outputs[1][c][i] = thunder; outputs[2][c][i] = waves;
            }
        }
    }
}

// A sequential export retains enough source history for render.js's 30-second
// pre-roll plus overlap. It never restarts thunder/waves at a chunk boundary.
export class WeatherSegmentRenderer {
    constructor(rate, shape, levels, seed = 1) {
        this.rate = rate; this.model = new WeatherBedModel(rate, shape, levels, seed); this.cursor = 0;
        this.capacity = Math.ceil(32 * rate);
        this.active = WEATHER_SOURCES.filter(id => levels[id] > 0);
        this.history = Object.fromEntries(this.active.map(id => [id, [new Float32Array(this.capacity), new Float32Array(this.capacity)]]));
        this.scratch = WEATHER_SOURCES.map(() => [new Float32Array(128), new Float32Array(128)]);
    }
    render(from, frames) {
        if (!Number.isInteger(from) || !Number.isInteger(frames) || from < 0 || frames < 1 || from < this.cursor - this.capacity) throw Error('Weather export range is outside retained history.');
        const result = Object.fromEntries(this.active.map(id => [id, [new Float32Array(frames), new Float32Array(frames)]]));
        const past = Math.min(frames, Math.max(0, this.cursor - from));
        for (const id of this.active) for (let c = 0; c < 2; c++) for (let i = 0; i < past; i++) result[id][c][i] = this.history[id][c][(from + i) % this.capacity];
        while (this.cursor < from + frames) {
            const n = Math.min(128, from + frames - this.cursor);
            const out = n === 128 ? this.scratch : this.scratch.map(pair => pair.map(ch => ch.subarray(0, n)));
            this.model.process(out);
            for (const id of this.active) {
                const layer = WEATHER_SOURCES.indexOf(id);
                for (let c = 0; c < 2; c++) for (let i = 0; i < n; i++) {
                    const at = this.cursor + i, value = out[layer][c][i]; this.history[id][c][at % this.capacity] = value;
                    if (at >= from) result[id][c][at - from] = value;
                }
            }
            this.cursor += n;
        }
        return result;
    }
}
