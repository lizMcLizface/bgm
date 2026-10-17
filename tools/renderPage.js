// The browser half of the command-line renderer (tools/render.js): builds the
// generator for a preset or link exactly as the page does, then renders its
// audio in chunks (src/app/engine/render.js) and hands them to the script.
// Everything the Web Audio engine does needs a browser, which is why the
// script drives a headless Chrome through this page.

import Generator, { ROLES } from '../src/app/Generator';
import { defaultSettings, shareFromLocation } from '../src/app/settings';
import { sceneSettings, sceneBySlug, presetFromSearch, SCENES, sceneSlug } from '../src/app/scenes';
import { prepareSound } from '../src/app/engine/prepareSound';
import {applyBook,readBook,withPresetBook} from '../src/app/rulebook/session';
import { generationFromSearch } from '../src/app/generation';
import { phraseToSeed } from '../src/app/phrase';
import { renderPcm, planTimeline } from '../src/app/engine/render';
import { timelineColors } from '../src/app/ChordTimeline';
import { AMBIENCE_LAYERS } from '../src/app/engine/ambience';
import '../src/app/generative.css';

let gen = null;
let presetNames = {};

const toBase64 = (pcm) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.readAsDataURL(new Blob([pcm.buffer], { type: 'application/octet-stream' }));
});

window.bgmRender = {
    /** The built-in presets: [{ name, slug, category }]. */
    list: () => SCENES.map((scene) => ({ name: scene.name, slug: sceneSlug(scene.name), category: scene.category })),

    /**
     * Builds the generator from the page's own query: ?preset=slug (or a bare ?slug),
     * a share link's m= / v= / a= (or s=), `seed=N` or `phrase=...` to choose the variation.
     * @returns {object} what the video shows: name, roles and their sounds, the palette
     */
    async setup({ theme = 'dark' } = {}) {
        const query = new URLSearchParams(window.location.search);
        const share = shareFromLocation(window.location);
        const hasSettings = ['m', 'v', 'a', 's'].some((key) => query.has(key)) || window.location.hash.includes('s=');
        const scene = hasSettings ? null : sceneBySlug(presetFromSearch(window.location.search));
        if (!hasSettings && !scene) throw new Error(`No such preset: ${presetFromSearch(window.location.search)}`);
        let seed;
        if (query.has('seed')) seed = Number(query.get('seed'));
        else if (query.has('phrase')) seed = phraseToSeed(query.get('phrase')) ?? undefined;
        let name = 'bgm';
        if (scene) {
            name = scene.name;
            gen = new Generator(sceneSettings(scene, seed));
            Object.keys(ROLES).forEach((role) => {
                const voice = scene.voices[role];
                if (typeof voice === 'string') gen.loadRolePreset(role, voice);
                else if (voice) gen.loadRolePreset(role, voice.name, voice.synth);
            });
        } else {
            const settings = share ? share.settings : defaultSettings();
            if (seed !== undefined) settings.seed = seed;
            gen = new Generator(settings);
            if (share) {
                for (const [role, preset] of Object.entries(share.presets)) {
                    if (preset.generated) {
                        const sound = await prepareSound(preset.generated, generationFromSearch(window.location.search));
                        gen.loadRolePreset(role, sound.name, sound.preset);
                    } else gen.loadRolePreset(role, preset);
                }
            }
        }
        gen.set('generation', generationFromSearch(window.location.search));
        applyBook(gen,withPresetBook(scene?.rulebook,readBook(window.location.search)));
        gen.reset();
        // the kind of slow drift can be chosen for the recording: wander=sine|brownian (the voices), ambience-wander=sine|brownian
        if (query.has('wander')) gen.settings.wander = { ...gen.settings.wander, mode: query.get('wander') };
        if (query.has('ambience-wander')) gen.settings.ambienceWander = { ...gen.settings.ambienceWander, mode: query.get('ambience-wander') };
        presetNames = Object.fromEntries(Object.keys(gen.roles).map((role) => [role, role === 'perc' ? null : gen.roles[role].presetName]));
        document.documentElement.dataset.theme = theme;
        return {
            name,
            seed: gen.settings.seed,
            generation: gen.settings.generation,
            sampleRate: gen.AC.sampleRate,
            roles: Object.keys(gen.roles),
            presets: presetNames,
            playMusic: gen.settings.playMusic !== false,
            colors: timelineColors(document.getElementById('palette')),
            // for the video of an ambience-only render
            ambience: {
                layers: Object.entries(AMBIENCE_LAYERS).filter(([id]) => gen.settings.ambience[id] > 0).map(([id, label]) => ({ id, label, level: gen.settings.ambience[id] })),
                wander: gen.settings.ambienceWander,
            },
        };
    },

    /** The plan for the video: one entry per bar (see planTimeline). */
    timeline(seconds, ending) {
        const view = { beatsPerBar: gen.beatsPerBar, meter: gen.meter, bars: planTimeline(gen, seconds, { ending }) };
        view.mix = Object.fromEntries(Object.entries(gen.roles).map(([role, r]) => [role, { mute: r.mute, solo: r.solo }]));
        return view;
    },

    /** Renders the audio, passing each chunk to `window.bgmChunk` (base64 of 16-bit stereo PCM). */
    async audio(seconds, ending) {
        const result = await renderPcm(gen, seconds, {
            ending,
            onProgress: (fraction) => window.bgmProgress(fraction),
            onChunk: async (pcm) => { await window.bgmChunk(await toBase64(pcm)); },
        });
        return result;
    },
};

window.bgmRenderReady = true;
