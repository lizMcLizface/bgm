// What a preset plays, for the preset browser's cards: each voice with its sound and the kind of instrument it
// is (editor/soundFamilies.js), whether it plays at all, and whether the ambience is on. `settings` is the
// preset's complete settings (sceneSettings).

import { ROLE_PRESETS } from './presets';
import { percussionVoice } from './percussionVoices';
import { soundFamily } from './editor/soundFamilies';

export const SCENE_ROLES = [
    { role: 'lead', label: 'Lead', letter: 'L' },
    { role: 'counter', label: 'Second lead', letter: '2' },
    { role: 'pad', label: 'Rhythm', letter: 'R' },
    { role: 'bass', label: 'Bass', letter: 'B' },
    { role: 'perc', label: 'Percussion', letter: 'P' },
];
// a voice with nothing to say about itself is the kind its role is
const ROLE_FAMILY = { lead: 'lead', counter: 'lead', pad: 'pad', bass: 'bass', perc: 'texture' };

/** @returns {{ voices: Array<{ role, label, letter, used, name, family }>, ambience: { on: boolean, layers: string[] } }} */
export function sceneVoices(scene, settings) {
    const plays = settings.playMusic !== false;
    const used = {
        lead: plays,
        counter: plays && settings.counter?.mode !== 'off',
        pad: plays,
        bass: plays,
        perc: plays && settings.drums?.style !== 'off',
    };
    const voices = SCENE_ROLES.map(({ role, label, letter }) => {
        if (role === 'perc') return { role, label, letter, used: used[role], name: percussionVoice(settings.drums?.kit).name, family: 'texture' };
        const spec = scene.voices?.[role];
        const name = (typeof spec === 'string' ? spec : spec?.name) || ROLE_PRESETS[role];
        // a bass is a bass, whatever it is called
        return { role, label, letter, used: used[role], name, family: role === 'bass' ? 'bass' : soundFamily(name, undefined, ROLE_FAMILY[role]) };
    });
    const layers = Object.entries(settings.ambience ?? {}).filter(([, level]) => level > 0).map(([id]) => id);
    return { voices, ambience: { on: settings.playAmbience === true && layers.length > 0, layers } };
}
