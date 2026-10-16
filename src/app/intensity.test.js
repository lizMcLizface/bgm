import { intensity, intensityLabel, viridis } from './intensity';
import { SCENES, sceneSettings } from './scenes';

const of = (name) => intensity(sceneSettings(SCENES.find((s) => s.name === name), 1));

test('a bare pad is calm and a fast driving sequence is intense', () => {
    expect(of('Open Mic Pad')).toBeLessThan(0.3);
    expect(of('Robot Factory Rush')).toBeGreaterThan(0.7);
    expect(of('Open Mic Pad')).toBeLessThan(of('Study session'));
    expect(of('Study session')).toBeLessThan(of('Zero Fun Zone'));
});

test('ambience-only presets are at the bottom, and every preset stays in range', () => {
    expect(of('Campfire')).toBe(0);
    SCENES.forEach((s) => {
        const x = intensity(sceneSettings(s, 1));
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
    });
});

test('labels and colours cover the whole range', () => {
    expect(intensityLabel(0)).toBe('Very calm');
    expect(intensityLabel(1)).toBe('Intense');
    expect(viridis(0)).toBe('rgb(68, 1, 84)');
    expect(viridis(1)).toBe('rgb(253, 231, 37)');
});
