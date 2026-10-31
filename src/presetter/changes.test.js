import { deepMerge, deepDiff, leafPaths, applyChange, isEmptyChange, describeChange, bakeLibrary } from './changes';

test('a patch lays over its base key by key, replacing arrays and values whole', () => {
    expect(deepMerge({ a: 1, b: { c: 2, d: [1, 2] }, e: { f: 1 } }, { b: { c: 3, d: [9] }, e: 5, g: { h: 1 } })).toEqual({ a: 1, b: { c: 3, d: [9] }, e: 5, g: { h: 1 } });
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
});

test('the diff keeps only the leaves that differ, minus what is skipped', () => {
    const base = { seed: 1, bpm: 90, volumes: { pad: 0.5, lead: 0.6 }, list: [1, 2], ambience: { rain: 0.2 } };
    const actual = { seed: 9, bpm: 90, volumes: { pad: 0.5, lead: 0.7 }, list: [1, 3], ambience: { rain: 0.2 }, layers: 'split' };
    expect(deepDiff(base, actual, ['seed'])).toEqual({ volumes: { lead: 0.7 }, list: [1, 3], layers: 'split' });
    expect(deepDiff(base, base)).toEqual({});
    expect(leafPaths({ volumes: { lead: 0.7 }, list: [1, 3], layers: 'split' })).toEqual(['volumes.lead', 'list', 'layers']);
});

test('applying a change gives the scene with it, and leaves the scene itself alone', () => {
    const scene = { name: 'x', settings: { bpm: 90, volumes: { pad: 0.5, lead: 0.6 } }, voices: { pad: 'Soft Pad', lead: 'Glass Lead' }, layerVoices: { rhythm: 'Music Box' } };
    const copy = JSON.parse(JSON.stringify(scene));
    const out = applyChange(scene, { settings: { volumes: { lead: 0.8 }, layers: 'split' }, voices: { lead: { name: 'Mine', synth: { masterVolume: 0.4 } } }, layerVoices: { pad: 'Velvet Pad' }, rulebook: { version: 1 } });
    expect(out.settings).toEqual({ bpm: 90, volumes: { pad: 0.5, lead: 0.8 }, layers: 'split' });
    expect(out.voices).toEqual({ pad: 'Soft Pad', lead: { name: 'Mine', synth: { masterVolume: 0.4 } } });
    expect(out.layerVoices).toEqual({ rhythm: 'Music Box', pad: 'Velvet Pad' });
    expect(out.rulebook).toEqual({ version: 1 });
    expect(scene).toEqual(copy);
    expect(applyChange(scene, {})).toBe(scene);
});

test('an empty change is empty, and a change says what it touches', () => {
    expect(isEmptyChange({})).toBe(true);
    expect(isEmptyChange({ settings: {}, voices: {} })).toBe(true);
    expect(isEmptyChange({ warnings: ['x'] })).toBe(true);
    expect(describeChange({ settings: { a: 1, b: { c: 2 } }, voices: { pad: 'x' }, layerVoices: { rhythm: 'y' }, rulebook: {} })).toBe('2 settings, 2 voices, rulebook');
    expect(describeChange({})).toBe('');
});

describe('baking a dump into the library', () => {
    const library = { categories: [{ id: 'c' }], scenes: [
        { name: 'A', settings: { bpm: 80 }, voices: { pad: 'Soft Pad' } },
        { name: 'A (previous)', comparisonOf: 'A', hidden: true, settings: { bpm: 80 }, voices: { pad: 'Soft Pad' } },
        { name: 'A (other)', comparisonOf: 'A', hidden: true, settings: { bpm: 70 }, voices: { pad: 'Soft Pad' } },
        { name: 'B', settings: { bpm: 90 }, voices: { pad: 'Velvet Pad' } },
    ] };
    const dump = { format: 'bgm-presetter', presets: {
        A: { change: { settings: { bpm: 85 }, layerVoices: { rhythm: 'Music Box' } } },
        B: { status: 'redo', note: 'too busy' },
        C: { change: { settings: { bpm: 1 } } },
        D: { status: 'tweak', change: { warnings: ['rhythm: an edited sound is not kept'] } },
    } };

    test('applies each change to its preset, and to an identical revision copy only', () => {
        const out = bakeLibrary(library, dump);
        expect(out.library.scenes.map((s) => s.settings.bpm)).toEqual([85, 85, 70, 90]);
        expect(out.library.scenes[0].layerVoices).toEqual({ rhythm: 'Music Box' });
        expect(out.library.scenes[2]).toBe(library.scenes[2]);
        expect(out.library.categories).toBe(library.categories);
        expect(library.scenes[0].settings.bpm).toBe(80);
    });

    test('reports what it did, what it could not find and what is still marked for work', () => {
        const out = bakeLibrary(library, dump);
        expect(out.applied).toEqual(['A: 1 setting, 1 voice']);
        expect(out.missing).toEqual(['C']);
        expect(out.warned).toEqual(['D: rhythm: an edited sound is not kept']);
        expect(out.next).toEqual(['B (redo): too busy', 'D (tweak)']);
    });
});
