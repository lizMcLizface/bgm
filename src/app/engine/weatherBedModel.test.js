import { WeatherBedModel, WeatherSegmentRenderer, WEATHER_SOURCES, weatherEnvironment } from './weatherBedModel';
import { WeatherModel } from '../../ambient/weatherModel';
import { defaultAmbienceShape } from './ambience';
import { defaultSettings, encodeSettings, decodeSettings } from '../settings';
import { WEATHER_PRESETS, weatherPresetPatch, matchingWeatherPreset } from '../weatherPresets';

const output = n => WEATHER_SOURCES.map(() => [new Float32Array(n), new Float32Array(n)]);
test('source grouping preserves the approved lab synthesis with its default component balance', () => {
    const shape = defaultAmbienceShape(), levels = { rain: 1, thunder: 1, waves: 1 }, rate = 8000;
    const bed = new WeatherBedModel(rate, shape, levels, 42), lab = new WeatherModel(rate, weatherEnvironment(shape, levels), 42);
    const a = output(rate * 6), b = Array.from({ length: 12 }, () => [new Float32Array(rate * 6), new Float32Array(rate * 6)]);
    bed.process(a); lab.process(b);
    for (let i = 0; i < a[0][0].length; i++) for (let c = 0; c < 2; c++) for (let layer = 0; layer < 3; layer++) {
        const start = layer === 0 ? 0 : layer === 1 ? 6 : 9, end = layer === 0 ? 6 : start + 3;
        let sum = 0; for (let l = start; l < end; l++) sum += b[l][c][i];
        if (Math.abs(a[layer][c][i] - sum) > 2e-7) throw Error('Weather source grouping changed the synthesis');
    }
});
test('offline exports continue exactly across pre-roll and overlapping chunks', () => {
    const rate = 8000, shape = defaultAmbienceShape(), levels = { rain: .6, thunder: .5, waves: .7 };
    const session = new WeatherSegmentRenderer(rate, shape, levels, 12);
    const first = session.render(0, rate * 40), second = session.render(rate * 10, rate * 40);
    for (const id of WEATHER_SOURCES) for (let c = 0; c < 2; c++) {
        expect(second[id][c].subarray(0, rate * 30).every((v, i) => v === first[id][c][rate * 10 + i])).toBe(true);
    }
    const uninterrupted = new WeatherSegmentRenderer(rate, shape, levels, 12).render(0, rate * 50);
    for (const id of WEATHER_SOURCES) for (let c = 0; c < 2; c++) expect(second[id][c].every((v, i) => v === uninterrupted[id][c][rate * 10 + i])).toBe(true);
});
test('each weather preset changes only its own source and all settings survive sharing', () => {
    const base = defaultSettings();
    for (const [id, presets] of Object.entries(WEATHER_PRESETS)) for (const preset of presets) {
        const patch = weatherPresetPatch(id, preset.id, base.ambienceShape, base.ambience), settings = { ...base, seed: 7, ...patch };
        expect(matchingWeatherPreset(id, patch.ambienceShape[id], patch.ambience[id])).toBe(preset.id);
        expect(matchingWeatherPreset(id, patch.ambienceShape[id], 0)).toBe('');
        for (const other of WEATHER_SOURCES.filter(source => source !== id)) {
            expect(patch.ambienceShape[other]).toEqual(base.ambienceShape[other]); expect(patch.ambience[other]).toBe(base.ambience[other]);
        }
        expect(decodeSettings(encodeSettings(settings))).toEqual(settings);
    }
});
test('the frozen original ambience code still decodes its shapes and wander unchanged', () => {
    const settings = decodeSettings('m=IAAAAO&a=0zKg4lOb8gFMmao');
    expect(settings.ambience).toMatchObject({ rain: .45, thunder: .3, waves: .5 });
    expect(settings.ambienceShape.rain).toMatchObject({ intensity: .8, drops: .2, distance: .35, surface: 'mixed' });
    expect(settings.ambienceShape.thunder).toMatchObject({ frequency: .75, intensity: .9, decay: .65 });
    expect(settings.ambienceWander).toEqual({ mode: 'brownian', total: .12, layers: .25, period: 240 });
});
