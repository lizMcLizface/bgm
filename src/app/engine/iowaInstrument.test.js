import voices from '../../library/voices.json';
import library from '../../library/scenes.json';
import { PATCHES } from './iowaModel/patches';
import { soundBase } from '../editor/soundBase';
import { findPreset } from '../editor/presetStore';
import { SHAREABLE_PRESETS } from '../shareCode';
import { SCENE_CATEGORIES, BROWSABLE_SCENES, SCENES, sceneBySlug } from '../scenes';

const LIST = voices['Iowa & VSCO'];

test('every instrument is in the list once, findable, shareable, with a range and its own tag', () => {
    expect(Object.keys(LIST)).toHaveLength(PATCHES.length);
    expect(new Set(Object.values(LIST).map((v) => v.iowa)).size).toBe(PATCHES.length);
    for (const [name, entry] of Object.entries(LIST)) {
        expect(findPreset(name)?.iowa, name).toBe(entry.iowa);
        expect(SHAREABLE_PRESETS, name).toContain(name);
        expect(entry.range[1], name).toBeGreaterThan(entry.range[0]);
        expect(soundBase(entry).label).toBe(name.startsWith('VSCO') ? 'VSCO' : 'Iowa');
    }
});

test('the flutes glide by themselves, and nothing else does', () => {
    const gliding = Object.values(LIST).filter((v) => v.glide > 0).map((v) => v.iowa).sort();
    expect(gliding).toEqual(['alto-flute', 'bass-flute', 'flute', 'flute-straight', 'piccolo']);
});

test('the showcase presets are in their own category, open, and each names a category it could join', () => {
    const shown = BROWSABLE_SCENES.filter((s) => s.category === 'recordings'), others = new Set(SCENE_CATEGORIES.map((c) => c.id));
    expect(shown.length).toBeGreaterThanOrEqual(10);
    for (const scene of shown) {
        const fits = scene.tags.find((t) => t.startsWith('fits:'))?.slice(5);
        expect(others.has(fits), `${scene.name} fits ${fits}`).toBe(true);
        expect(fits).not.toBe('recordings');
        expect(Object.values(scene.voices).some((v) => findPreset(v)?.iowa), scene.name).toBe(true);
        for (const v of Object.values(scene.voices)) expect(findPreset(v), `${scene.name}: ${v}`).toBeTruthy();
    }
    expect(new Set(shown.map((s) => s.tags.find((t) => t.startsWith('fits:')))).size).toBeGreaterThanOrEqual(10);
});

test('the demos are retired: hidden, out of the pickers, and still found by their links', () => {
    const demos = library.scenes.filter((s) => s.category === 'demo');
    expect(demos.length).toBeGreaterThan(0);
    demos.forEach((s) => expect(s.hidden, s.name).toBe(true));
    expect(BROWSABLE_SCENES.some((s) => s.category === 'demo')).toBe(false);
    expect(SCENE_CATEGORIES.some((c) => c.id === 'demo')).toBe(false);
    expect(sceneBySlug('demo-pad-under-pluck')?.name).toBe('Demo: Pad under pluck');
    expect(SCENES.some((s) => s.name === 'Demo: Pad under pluck')).toBe(true);
});
