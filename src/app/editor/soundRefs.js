// A classic / DIY voice sound or a drum machine as a compact reference, for links, setups and
// scenes (shareExtras.js): its synth, its sound's name and only what differs from that sound.
// Lazy-loaded with the sound window: the page itself never loads the synths.
import { SYNTHS } from '../../synths/models';
import { cleanRack } from '../../synths/effects/params';
import { roleSound, percussionSound } from '../../synths/ensemble/state';

const changed = (values, base) => Object.fromEntries(Object.entries(values ?? {}).filter(([key, value]) => base?.[key] !== value));
const withLabel = (sound) => ({ ...sound, label: `${SYNTHS[sound.synth].name} · ${sound.name}` });

/** A voice's sound -> { synth, name, category, level, values?, rack? } (changes only). */
export function soundRef(sound) {
    const base = SYNTHS[sound.synth].presets.find((p) => p.name === sound.name);
    const values = changed(sound.values, base && SYNTHS[sound.synth].params.sanitize(base.values));
    const rack = changed(sound.rack, cleanRack());
    return { synth: sound.synth, name: sound.name, ...(sound.category ? { category: sound.category } : {}), ...(sound.matched ? { level: sound.level } : {}),
        ...(Object.keys(values).length ? { values } : {}), ...(Object.keys(rack).length ? { rack } : {}) };
}
/** A reference -> the voice's sound, labelled and with its reference (a sound that no longer exists: the synth's sound for the role). */
export function soundFromRef(ref, role) {
    const synth = SYNTHS[ref.synth], base = synth.presets.find((p) => p.name === ref.name);
    const start = base ? { synth: ref.synth, name: base.name, category: ref.category ?? base.category, values: synth.params.sanitize(base.values), rack: cleanRack() } : roleSound(ref.synth, role);
    const sound = { ...start, values: synth.params.sanitize({ ...start.values, ...ref.values }), rack: { ...cleanRack(), ...ref.rack },
        level: Number.isFinite(ref.level) ? ref.level : 1, matched: Number.isFinite(ref.level) };
    return described(sound);
}
/** A sound with its track-strip label and link reference. */
export const described = (sound) => ({ ...withLabel(sound), ref: soundRef(sound) });

/** A drum machine -> { synth, name, values?, rack? }, and back. */
export function machineRef(machine) {
    const base = SYNTHS[machine.synth].presets.find((p) => p.name === machine.name);
    const values = changed(machine.values, base && SYNTHS[machine.synth].params.sanitize(base.values));
    const rack = changed(machine.rack, cleanRack());
    return { synth: machine.synth, name: machine.name, ...(Object.keys(values).length ? { values } : {}), ...(Object.keys(rack).length ? { rack } : {}) };
}
export function machineFromRef(ref) {
    const kit = percussionSound(ref.synth, ref.name);
    const machine = { ...kit, values: SYNTHS[kit.synth].params.sanitize({ ...kit.values, ...ref.values }), rack: { ...cleanRack(), ...ref.rack } };
    return describedMachine(machine);
}
export const describedMachine = (machine) => ({ ...withLabel(machine), ref: machineRef(machine) });
