import { describe, expect, it } from 'vitest';
import { BIOME_NAMES, WEATHER } from './catalog';
import { landscapeForScene, SCENE_LANDSCAPES } from './presetScenes';
import library from '../library/scenes.json';

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

    it('covers every library scene, variants included', () => {
        library.scenes.forEach((s) => expect(landscapeForScene(s.name, s.category), s.name).toBeTruthy());
    });

    it('lists no scene that does not exist', () => {
        const names = new Set(library.scenes.map((s) => s.name));
        Object.keys(SCENE_LANDSCAPES).forEach((n) => expect(names.has(n), n).toBe(true));
    });
});
