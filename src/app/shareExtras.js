// What a link carries beyond the bit-packed parts (shareCode.js): the shared effects bus when it
// is not the default, the voices played by a classic or DIY synth, and a drum machine - as the
// compact references of editor/soundRefs.js - and edited sounds of the generator's own synth
// (editor/presetEdits.js), in a compressed JSON part `x`. Validated here
// without the synths (which load only when a sound is applied); unknown synths are dropped.
import { compressSync, decompressSync, strToU8, strFromU8 } from 'fflate';
import { defaultBus } from './engine/bus';

export const VOICE_SYNTHS = ['poly', 'fm', 'cs80', 'juno', 'prophet5', 'jupiter8', 'minimoog', 'dx7', 'obxa', 'vs'];
export const MACHINE_SYNTHS = ['tr808', 'tr909'];
const ROLES = ['lead', 'counter', 'pad', 'bass'];

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : undefined);
// numbers only, a bounded count of them
const numbers = (raw, max) => {
    if (!isObject(raw)) return undefined;
    const out = Object.fromEntries(Object.entries(raw).filter(([key, v]) => key.length <= 60 && typeof v === 'number' && Number.isFinite(v)).slice(0, max));
    return Object.keys(out).length ? out : undefined;
};
/** An untrusted edit of the generator's own synth ({ name, values }) -> a clean one, or null (presetStore checks the values' keys and types). */
export function cleanEdit(raw) {
    if (!isObject(raw) || !text(raw.name, 60) || !isObject(raw.values)) return null;
    const values = Object.fromEntries(Object.entries(raw.values).filter(([key, v]) => key.length <= 60
        && (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40))).slice(0, 300));
    return { name: text(raw.name, 60), values };
}
/** An untrusted reference -> a clean one, or null. */
export function cleanRef(raw, synths = VOICE_SYNTHS) {
    if (!isObject(raw) || !synths.includes(raw.synth) || !text(raw.name, 60)) return null;
    const values = numbers(raw.values, 600), rack = numbers(raw.rack, 120);
    return {
        synth: raw.synth, name: text(raw.name, 60),
        ...(text(raw.category, 40) ? { category: text(raw.category, 40) } : {}),
        ...(Number.isFinite(raw.level) ? { level: Math.max(0.01, Math.min(4, raw.level)) } : {}),
        ...(values ? { values } : {}), ...(rack ? { rack } : {}),
    };
}

const toBase64Url = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); };
const fromBase64Url = (text) => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));

/**
 * { bus, sounds: { role: ref }, machine: ref } -> the `x` part, or '' when there is nothing to
 * carry (a default bus, no classic or DIY voices, the generator's own kit).
 */
export function encodeExtras({ bus, sounds = {}, machine = null, edits = {}, sequencer = null, portamento = null }) {
    const data = {};
    if (bus && JSON.stringify(bus) !== JSON.stringify(defaultBus())) data.b = bus;
    const s = Object.fromEntries(ROLES.filter((role) => sounds[role]).map((role) => [role, sounds[role]]));
    if (Object.keys(s).length) data.s = s;
    if (machine) data.p = machine;
    const n = Object.fromEntries(ROLES.filter((role) => edits[role]).map((role) => [role, edits[role]]));
    if (Object.keys(n).length) data.n = n;
    // the step sequencer (sequencer.js), only when it plays or has a beat chosen
    if (sequencer && (sequencer.on || sequencer.arrangement)) data.q = sequencer;
    // glide between notes (composition/portamento.js), only when a role has some
    if (portamento && Object.values(portamento).some((v) => v > 0)) data.g = portamento;
    return Object.keys(data).length ? toBase64Url(compressSync(strToU8(JSON.stringify(data)), { level: 9 })) : '';
}
/** The `x` part -> { bus?, sounds, machine, edits, sequencer? } (clean); nothing usable for anything unreadable. */
export function decodeExtras(part) {
    try {
        if (typeof part !== 'string' || part.length > 20000) return { sounds: {}, edits: {} };
        const data = JSON.parse(strFromU8(decompressSync(fromBase64Url(part))));
        const sounds = Object.fromEntries(ROLES.map((role) => [role, cleanRef(data?.s?.[role])]).filter(([, ref]) => ref));
        const edits = Object.fromEntries(ROLES.map((role) => [role, cleanEdit(data?.n?.[role])]).filter(([, edit]) => edit));
        return { ...(isObject(data?.b) ? { bus: data.b } : {}), sounds, machine: cleanRef(data?.p, MACHINE_SYNTHS), edits, ...(isObject(data?.q) ? { sequencer: data.q } : {}), ...(isObject(data?.g) ? { portamento: data.g } : {}) };
    } catch (e) {
        return { sounds: {}, edits: {} };
    }
}
