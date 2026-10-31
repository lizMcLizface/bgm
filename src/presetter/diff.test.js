import { SCENES, normalizeScene } from '../app/scenes';
import { DEFAULT_LAYER_RULES } from '../app/arranger';
import { findPreset } from '../app/editor/presetStore';
import { diffSetup } from './diff';
import { applyChange } from './changes';
import { pageAfterLoading } from './testSupport';

test('a preset just loaded differs from itself by nothing, for every preset', () => {
    for (const scene of SCENES) expect(diffSetup(scene, pageAfterLoading(scene)), scene.name).toEqual({});
});

const scene = SCENES.find((s) => s.name === 'Oxygene Sunrise');

test('what was changed on the page is what the diff holds, and applying it gives the page back', () => {
    const page = pageAfterLoading(scene);
    page.settings.bpm += 7;
    page.settings.volumes = { ...page.settings.volumes, lead: 0.31 };
    page.settings.layers = 'split';
    page.settings.layerRules = { ...DEFAULT_LAYER_RULES, clear: false };
    page.voices.lead = { name: 'Soft Flute', synth: findPreset('Soft Flute') };
    page.voices.pad = { name: 'Glass Pad', synth: findPreset('Glass Pad') };
    page.voices.rhythm = { name: 'Music Box', synth: findPreset('Music Box') };
    const change = diffSetup(scene, page);
    expect(change.settings).toEqual({ bpm: scene.settings.bpm + 7, volumes: { lead: 0.31 }, layers: 'split', layerRules: { clear: false } });
    // with the layers split the pad and rhythm voices are the preset's layered ones, the lead's its own
    expect(change.voices).toEqual({ lead: 'Soft Flute' });
    expect(change.layerVoices).toEqual({ pad: 'Glass Pad', rhythm: 'Music Box' });
    const baked = normalizeScene(applyChange(scene, change));
    const again = diffSetup(baked, page);
    expect(again).toEqual({});
});

test('a sound edited by hand is kept in full, except for the layers, which only know names', () => {
    const page = pageAfterLoading(scene);
    page.voices.lead = { name: 'Soft Flute', synth: { ...findPreset('Soft Flute'), filterFreq: 1234 } };
    expect(diffSetup(scene, page).voices.lead).toEqual({ name: 'Soft Flute', synth: page.voices.lead.synth });
    const layered = pageAfterLoading({ ...scene, settings: { ...scene.settings, layers: 'split' } });
    layered.voices.rhythm = { name: 'Music Box', synth: { ...findPreset('Music Box'), filterFreq: 999 } };
    const change = diffSetup({ ...scene, settings: { ...scene.settings, layers: 'split' } }, layered);
    expect(change.layerVoices).toBeUndefined();
    expect(change.warnings[0]).toMatch(/rhythm: an edited sound/);
});

test('the seed and a changed rulebook', () => {
    const page = pageAfterLoading(scene, 99);
    expect(diffSetup(scene, page)).toEqual({});
    page.rulebook = { ...page.rulebook, rules: { ...page.rulebook.rules, 'layer-flow': { enabled: true, value: 'journey' } } };
    expect(diffSetup(scene, page).rulebook).toEqual(page.rulebook);
});
