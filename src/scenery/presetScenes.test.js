import { describe, expect, it } from 'vitest';
import { BIOME_NAMES, WEATHER } from './catalog';
import { landscapeForScene, SCENE_LANDSCAPES } from './presetScenes';
import library from '../library/scenes.json';
import { WEATHER_SCENES } from '../app/weatherPresets';

describe('preset landscapes', () => {
    it('only name real landscapes, weather, hours and seasons', () => {
        Object.entries(SCENE_LANDSCAPES).forEach(([name, l]) => {
            expect(BIOME_NAMES[l.biome], name).toBeTruthy();
            expect(WEATHER[l.weather], name).toBeTruthy();
            expect(l.hour).toBeGreaterThanOrEqual(0);
            expect(l.hour).toBeLessThan(24);
            expect(l.year).toBeGreaterThanOrEqual(0);
            expect(l.year).toBeLessThan(4);
        });
    });

    it('keeps windows sane, the preset hour and season inside their own window', () => {
        const inside = (v, [a, b], p) => ((v - a) % p + p) % p <= ((b - a) % p + p) % p;
        Object.entries(SCENE_LANDSCAPES).forEach(([name, l]) => {
            if (l.hours) {
                l.hours.forEach((h) => { expect(h, name).toBeGreaterThanOrEqual(0); expect(h, name).toBeLessThan(24); });
                expect(inside(l.hour, l.hours, 24), name).toBe(true);
            }
            if (l.seasons) {
                l.seasons.forEach((y) => { expect(y, name).toBeGreaterThanOrEqual(0); expect(y, name).toBeLessThan(4); });
                expect(inside(l.year, l.seasons, 4), name).toBe(true);
            }
        });
    });

    it('covers every library scene, variants included', () => {
        library.scenes.forEach((s) => expect(landscapeForScene(s.name, s.category), s.name).toBeTruthy());
    });

    it('puts the step-sequencer presets away from the synthwave coast', () => {
        library.scenes.filter((s) => s.tags?.includes('sequencer')).forEach((s) => expect(landscapeForScene(s.name, s.category).biome, s.name).not.toBe('synth'));
        ['Warehouse Lift', 'Minimal Click Lab', 'Uplifting Trance Departures'].forEach((n) => expect(landscapeForScene(n, 'electronic').biome, n).toBe('warehouse'));
    });

    it('names a landscape for each weather preset rather than leaving it to its category', () => {
        WEATHER_SCENES.forEach((s) => expect(SCENE_LANDSCAPES[s.name], s.name).toBeTruthy());
    });

    it('lists no scene that does not exist', () => {
        const names = new Set([...library.scenes, ...WEATHER_SCENES].map((s) => s.name));
        Object.keys(SCENE_LANDSCAPES).forEach((n) => expect(names.has(n), n).toBe(true));
    });
});
