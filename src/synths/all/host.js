// The host of the sequencers' sound generators (docs/SEQUENCER_SYSTEM_PLAN.md): the front page's own Generator, used as the orchestra. Its role instruments are loaded the way the
// main and ensemble pages load them (scene voices; a classic synth or DIY patch as a source, level-matched), and the song is planned by its planner, so the progression, voicings
// and lines are the generator's. The sequencers then play those same role instruments.
import Generator, { ROLES } from '../../app/Generator';
import { sceneSettings, sceneVoiceSpec } from '../../app/scenes';
import { seeded } from '../../app/random';
import { SYNTHS } from '../models';
import library from '../../library/voices.json';
import { matchedLevel, soundSource } from '../ensemble/sources';
import { ROLE_PICKS } from '../ensemble/state';
import { cleanRack, rackForPatch, splitRackEdits } from '../effects/params';
import { createOutputMonitor } from '../effects/outputMonitor';
import { leanChain } from '../effects/rackParts';

// as on the pages (ui/SynthShell): the instrument's own space controls are moved into the rack, and a rack that has not been touched holds only the effects the sound uses
const MOVED = { moved: true };
const leanRack = (model, values, rack) => ({ ...rack, 'master.chain': leanChain(rackForPatch(model, values, rack, MOVED)) });
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
/** The generator's own instruments that have a page of their own: the pianos (the piano page's list: the pianos and the front page's piano-model keys) and the instruments measured from recordings (preset.iowa). Each plays one of the front page's sounds (library/voices.json). */
const PIANOS = { ...library.Pianos, ...Object.fromEntries(Object.entries(library['Keys & plucks']).filter(([, p]) => p.stringModel === 'piano')) };
const MEASURED = library['Iowa & VSCO'];
export const NATIVE = { piano: { name: 'Piano', presets: PIANOS }, iowa: { name: 'Measured instruments', presets: MEASURED } };
export const isNative = (synth) => synth in NATIVE;
/** The synth that plays a front page sound as an instrument of its own, or as a patch it can be edited in (DI-Poly): null when the generator's own voice is all there is. */
export const synthForPreset = (name) => (!name ? null : name in PIANOS ? 'piano' : name in MEASURED ? 'iowa' : SYNTHS.poly.presets.some((p) => p.name === name) ? 'poly' : null);
export const synthChoices = () => [{ id: 'calmbgm', name: 'calmbgm' }, ...Object.entries(NATIVE).map(([id, n]) => ({ id, name: n.name })), ...['poly', 'fm', 'cs80', 'juno', 'prophet5', 'jupiter8', 'minimoog', 'dx7', 'obxa', 'vs', 'wt'].map((id) => ({ id, name: SYNTHS[id].name }))];
export const patchesOf = (synthId) => (synthId === 'calmbgm' ? [] : isNative(synthId) ? Object.keys(NATIVE[synthId].presets).map((name) => ({ name })) : SYNTHS[synthId].presets);

export function createHost(scene) {
    const settings = sceneSettings(scene);
    const g = new Generator(settings);
    const loaded = {};
    const sounds = {}; // role -> the classic or DIY patch playing it: { synth, name, category, values, rack, level }
    const racks = {}; // role -> the effects of a calmbgm voice
    const natives = {}; // role -> { synth, name, preset } for a piano, measured-instrument or string voice (the preset as edited)
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

    /** The effects of a calmbgm voice: its own rack between the instrument and the role's mix (as the ensemble page does it). */
    async function nativeRack(role, values) {
        const r = g.roles[role];
        if (!r.ensembleRack) {
            const { createRack } = await import('../effects/graph');
            const rack = await createRack(g.AC, values);
            r.instrument.output.disconnect();
            if (r.instrument.destinations) r.instrument.destinations = [];
            r.instrument.connect(rack.input);
            rack.connect(r.tone ?? r.gain);
            r.ensembleRack = rack;
        } else r.ensembleRack.patch(values);
    }
    const dropRack = (role) => { g.roles[role].ensembleRack?.dispose(); g.roles[role].ensembleRack = null; };

    /** One of the generator's own presets for a role; `kind` names the page it belongs to (a piano, measured instruments, strings), else it is a plain calmbgm voice. */
    async function setPreset(role, name, kind = 'calmbgm') {
        dropRack(role);
        const preset = kind === 'calmbgm' ? undefined : structuredClone(NATIVE[kind].presets[name]);
        g.loadRolePreset(role, name, preset);
        loaded[role] = { synth: kind, name };
        delete sounds[role];
        if (kind === 'calmbgm') delete natives[role]; else natives[role] = { synth: kind, name, preset };
        if (racks[role]) await nativeRack(role, racks[role]);
        return loaded[role];
    }
    /** The preset a piano, measured-instrument or string voice plays now, as edited (null for any other voice). */
    const nativeOf = (role) => natives[role] ?? null;
    /** A control of such a voice moved: the preset is loaded again with it. */
    function editNative(role, changes) {
        const entry = natives[role];
        if (!entry) return;
        entry.preset = { ...entry.preset, ...changes };
        g.loadRolePreset(role, entry.name, structuredClone(entry.preset));
    }

    /** A role's sound: { synth: 'calmbgm' } keeps the scene's voice, with a name it is one of the generator's presets; otherwise a patch of a classic or DIY synth (by name, or with its values when it comes from a library; the first when it is not found), with its level matched. */
    async function setSound(role, { synth, name, values }) {
        if (isNative(synth)) return setPreset(role, name && NATIVE[synth].presets[name] ? name : Object.keys(NATIVE[synth].presets)[0], synth);
        if (synth === 'calmbgm') {
            if (name) return setPreset(role, name);
            Object.keys(sounds).forEach((r) => delete sounds[r]);
            Object.keys(natives).forEach((r) => delete natives[r]);
            Object.keys(racks).forEach(dropRack);
            applySceneVoices(hostScene.scene);
            return loaded[role];
        }
        // without a name: the sound this synth has curated for the role (the ensemble page's picks), the rhythm layer taking the pad's
        const model = SYNTHS[synth], pick = name ?? ROLE_PICKS[synth]?.[role === 'rhythm' ? 'pad' : role];
        const patch = values ? { name, category: 'library', values } : model.presets.find((p) => p.name === pick) ?? model.presets[0];
        const clean = model.params.sanitize(patch.values), sound = { synth, name: patch.name, category: patch.category, values: clean, rack: leanRack(model, clean, cleanRack()), ...(patch.waves ? { waves: patch.waves } : {}) };
        const level = await matchedLevel(sound, role);
        dropRack(role);
        await g.setRoleSource(role, soundSource({ ...sound, rack: rackForPatch(model, clean, sound.rack, MOVED), moved: true, level, matched: true }, role, false), patch.name);
        loaded[role] = { synth, name: patch.name };
        sounds[role] = { ...sound, level };
        return loaded[role];
    }

    /** The patch a classic or DIY voice plays now (null for a calmbgm voice). */
    const soundOf = (role) => sounds[role] ?? null;
    /** A knob of the voice's own synth moved. */
    function editValues(role, values) {
        if (!sounds[role]) return;
        const model = SYNTHS[sounds[role].synth];
        sounds[role] = { ...sounds[role], values };
        g.roles[role].instrument.setValues?.(values);
        g.roles[role].instrument.setRack?.(rackForPatch(model, values, sounds[role].rack, MOVED));
    }
    /** The effects chain of a voice, as the rack panel shows it. */
    const rackValues = (role) => (sounds[role] ? rackForPatch(SYNTHS[sounds[role].synth], sounds[role].values, sounds[role].rack, MOVED) : racks[role] ?? { ...cleanRack(), 'master.chain': leanChain(cleanRack()) });
    /** An effect of the voice changed (a classic keeps the instrument's own space controls in its values). */
    async function editRack(role, changes) {
        const sound = sounds[role];
        if (sound) {
            const model = SYNTHS[sound.synth], { native, extra } = splitRackEdits(model, changes, MOVED);
            const values = { ...sound.values, ...native }, rack = { ...sound.rack, ...extra };
            sounds[role] = { ...sound, values, rack };
            const instrument = g.roles[role].instrument;
            instrument.setValues?.(values);
            instrument.setRack?.(rackForPatch(model, values, rack, MOVED));
        } else {
            racks[role] = { ...(racks[role] ?? { ...cleanRack(), 'master.chain': leanChain(cleanRack()) }), ...changes };
            await nativeRack(role, racks[role]);
        }
    }
    /** An output meter on the generator's mix for the scope: { context, requestScope }. */
    async function openMonitor() {
        const monitor = await createOutputMonitor(g.AC);
        const silent = g.AC.createGain();
        silent.gain.value = 0;
        g.output.connect(monitor.node);
        monitor.node.connect(silent);
        silent.connect(g.AC.destination);
        return { context: g.AC, requestScope: monitor.requestScope, dispose() { try { g.output.disconnect(monitor.node); } catch { /* already gone */ } monitor.dispose(); silent.disconnect(); } };
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
        g, settings, loaded, applySceneVoices, setSound, setPreset, soundOf, nativeOf, editNative, editValues, rackValues, editRack, openMonitor, capture, note, drum,
        get context() { return g.AC; },
        async wake() { await g.AC.resume(); if (g.percussionReady) await g.percussionReady; g.endStopFade?.(); },
        setScene(next) { hostScene.scene = next; },
        dispose() { g.stopAll?.(); Object.values(g.roles).forEach((r) => { r.instrument?.dispose?.(); r.ensembleRack?.dispose?.(); r.wander?.dispose?.(); }); },
    };
}
