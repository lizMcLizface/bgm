// The host of the sequencers' sound generators (docs/SEQUENCER_SYSTEM_PLAN.md): the front page's own Generator, used as the orchestra. Its role instruments are loaded the way the
// main and ensemble pages load them (scene voices; a classic synth or DIY patch as a source, level-matched), and the song is planned by its planner, so the progression, voicings
// and lines are the generator's. The sequencers then play those same role instruments.
import Generator, { ROLES } from '../../app/Generator';
import { sceneSettings, sceneVoiceSpec } from '../../app/scenes';
import { seeded } from '../../app/random';
import { SYNTHS } from '../models';
import { matchedLevel, soundSource } from '../ensemble/sources';
import { ROLE_PICKS } from '../ensemble/state';
import { cleanRack } from '../effects/params';
import { captureProject, planProgressions } from '../../seq/capture';

/** The sequencers, in the order of the panel: the parts the generator plays with notes (the percussion is the drum sequencer's). */
export const SEQUENCERS = [
    { role: 'lead', label: 'Lead', short: 'LD' },
    { role: 'counter', label: 'Second lead', short: '2L' },
    { role: 'rhythm', label: 'Rhythm', short: 'RH' },
    { role: 'pad', label: 'Pad', short: 'PD' },
    { role: 'bass', label: 'Bass', short: 'BS' },
    { role: 'perc', label: 'Drums', short: 'DR' },
];
export const GENERATOR_ROLES = Object.keys(ROLES);

/** A voice the generator can play a role with: its own synth (a preset by name), a classic synth or a DIY synth (a patch of it). */
export const synthChoices = () => [{ id: 'calmbgm', name: 'calmbgm' }, ...['poly', 'fm', 'cs80', 'juno', 'prophet5', 'jupiter8', 'minimoog', 'dx7', 'obxa', 'vs'].map((id) => ({ id, name: SYNTHS[id].name }))];
export const patchesOf = (synthId) => (synthId === 'calmbgm' ? [] : SYNTHS[synthId].presets);

export function createHost(scene) {
    const settings = sceneSettings(scene);
    const g = new Generator(settings);
    const loaded = {};
    const hostScene = { scene };

    /** The scene's voices on the roles, as the main page does when a scene is chosen. */
    function applySceneVoices(next = scene) {
        for (const role of GENERATOR_ROLES) {
            const spec = sceneVoiceSpec(next, role, g.settings.layers);
            if (!spec) continue;
            if (typeof spec === 'string') g.loadRolePreset(role, spec);
            else g.loadRolePreset(role, spec.name, spec.synth);
            loaded[role] = { synth: 'calmbgm', name: typeof spec === 'string' ? spec : spec.name };
        }
    }

    /** A role's sound: { synth: 'calmbgm' } keeps the scene's voice; otherwise a patch of a classic or DIY synth (by name; the first when it is not found), with its level matched. */
    async function setSound(role, { synth, name }) {
        if (synth === 'calmbgm') { applySceneVoices(hostScene.scene); return loaded[role]; }
        // without a name: the sound this synth has curated for the role (the ensemble page's picks), the rhythm layer taking the pad's
        const model = SYNTHS[synth], pick = name ?? ROLE_PICKS[synth]?.[role === 'rhythm' ? 'pad' : role];
        const patch = model.presets.find((p) => p.name === pick) ?? model.presets[0];
        const sound = { synth, name: patch.name, category: patch.category, values: model.params.sanitize(patch.values), rack: cleanRack() };
        const level = await matchedLevel(sound, role);
        await g.setRoleSource(role, soundSource({ ...sound, level, matched: true }, role, false), patch.name);
        loaded[role] = { synth, name: patch.name };
        return loaded[role];
    }

    /** Plan the requested number of complete progression cycles. */
    function capture({ progressions = 4, seed = settings.seed } = {}) {
        const plan = g.planner();
        plan.settings = { ...plan.settings, seed };
        plan.rng = seeded(seed);
        const records = planProgressions(plan, progressions);
        const project = captureProject(records, { stepsPerBar: Math.round(plan.meter.units * 4) });
        return project && { ...project, meter: plan.settings.meter, bpm: records[0].bpm ?? plan.settings.bpm, seed };
    }

    /** One note on a role's instrument, as the generator books its own. */
    function note(role, midi, time, duration, velocity) {
        const instrument = g.roles[role]?.instrument;
        if (instrument?.scheduleNote) instrument.scheduleNote(midi, Math.max(time, g.AC.currentTime), duration, velocity);
    }

    function drum(hit, time, stepSec) {
        const instrument = g.roles.perc.instrument, start = Math.max(time, g.AC.currentTime);
        if (hit.track && instrument.hitTrack) instrument.hitTrack(hit.track, hit.drum, start, hit.velocity);
        else instrument.scheduleNote(hit.drum, start, hit.duration * stepSec, hit.velocity, hit.vary ?? 0);
    }

    return {
        g, settings, loaded, applySceneVoices, setSound, capture, note, drum,
        get context() { return g.AC; },
        async wake() { await g.AC.resume(); if (g.percussionReady) await g.percussionReady; g.endStopFade?.(); },
        setScene(next) { hostScene.scene = next; },
        dispose() { g.stopAll?.(); Object.values(g.roles).forEach((r) => { r.instrument?.dispose?.(); r.ensembleRack?.dispose?.(); r.wander?.dispose?.(); }); },
    };
}
