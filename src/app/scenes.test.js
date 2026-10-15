import { SCENES, sceneSettings, sceneGroup, SCENE_GROUPS } from './scenes';
import { scaleById } from './theory';
import { findPreset } from './editor/presetStore';
import { SHAREABLE_PRESETS } from './shareCode';

test('every scene is valid as it stands: modes, presets, settings that survive sanitizing', () => {
    expect(new Set(SCENES.map((s) => s.name)).size).toBe(SCENES.length);
    SCENES.forEach((scene) => {
        const settings = sceneSettings(scene, 5);
        expect(() => scaleById(settings.mode)).not.toThrow();
        // nothing the scene says was thrown away as invalid
        Object.entries(scene.patch).forEach(([key, value]) => {
            if (key === 'ambienceShape') {
                Object.entries(value).forEach(([id, params]) => expect(settings.ambienceShape[id]).toMatchObject(params));
            } else if (typeof value === 'object') {
                Object.entries(value).forEach(([k, v]) => expect(settings[key][k]).toEqual(v));
            } else {
                expect(settings[key]).toEqual(value);
            }
        });
        Object.values(scene.presets).forEach((name) => {
            expect(findPreset(name)).toBeTruthy();
            expect(SHAREABLE_PRESETS).toContain(name);
        });
    });
});

test('every group has scenes, and ambience-only scenes play no music', () => {
    Object.keys(SCENE_GROUPS).forEach((group) => expect(SCENES.filter((s) => sceneGroup(s) === group).length).toBeGreaterThanOrEqual(4));
    SCENES.filter((s) => sceneGroup(s) === 'ambience').forEach((scene) => {
        const settings = sceneSettings(scene, 1);
        expect([settings.playMusic, settings.playAmbience]).toEqual([false, true]);
        expect(Object.values(settings.ambience).some((v) => v > 0)).toBe(true);
    });
});
