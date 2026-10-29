import { sceneVoices, SCENE_ROLES } from './sceneVoices';
import { BROWSABLE_SCENES, sceneSettings } from './scenes';
import { FAMILIES } from './editor/soundFamilies';

const scene = (name) => BROWSABLE_SCENES.find((s) => s.name === name);

test('Rainy café plays lead, rhythm, bass and drums, with the ambience on, and no second lead', () => {
    const s = scene('Rainy café'), { voices, ambience } = sceneVoices(s, sceneSettings(s, 1));
    const by = Object.fromEntries(voices.map((v) => [v.role, v]));
    expect(voices.map((v) => v.role)).toEqual(SCENE_ROLES.map((r) => r.role));
    expect(by.lead.used && by.pad.used && by.bass.used && by.perc.used).toBe(true);
    expect(by.counter.used).toBe(false);
    expect(by.pad.name).toBe('Felt Keys (updated)');
    expect(by.bass.family).toBe('bass');
    expect(ambience.on).toBe(true);
    expect(ambience.layers).toEqual(expect.arrayContaining(['rain', 'vinyl']));
});

test('every preset has a family for every voice, and a name', () => {
    for (const s of BROWSABLE_SCENES) {
        const { voices } = sceneVoices(s, sceneSettings(s, 1));
        for (const v of voices) { expect(FAMILIES[v.family], `${s.name} ${v.role}`).toBeTruthy(); expect(v.name, `${s.name} ${v.role}`).toBeTruthy(); }
    }
});

test('a preset with no music dims every voice', () => {
    const s = BROWSABLE_SCENES[0], settings = { ...sceneSettings(s, 1), playMusic: false };
    expect(sceneVoices(s, settings).voices.every((v) => !v.used)).toBe(true);
});
