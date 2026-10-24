// The generator's own synth (SYNTH_SCHEMA, once edited by knobs) as a /synths
// parameter table, so the touch panels' faders and choice buttons (synths/ui) edit it. The same
// preset keys and the same ranges as the knobs: only the controls differ. Choices and toggles
// are stored as strings / booleans in presets and as option indices on the panel.
import { defineParams } from '../../synths/params';
import SYNTH_SCHEMA from './synthSchema';

// The modules that colour a finished sound rather than make it: the window's Effects tab.
export const EFFECT_MODULES = new Set(['Drive', 'Tape', 'Crush', 'EQ2', 'Compressor', 'Chorus', 'Flanger', 'Phaser', 'Tremolo / Auto-pan', 'Delay', 'Ping Pong Delay', 'Reverb', 'Shimmer', 'Freeze']);
// What a Wasm voice offers of the generator's controls: its envelope and level.
const NATIVE_CONTROLS = new Set(['gainAttack', 'gainDecay', 'gainSustain', 'gainRelease', 'masterVolume']);

const words = (key) => key.replace(/_dc$/, ' (duty)').replace(/^(\w)/, (c) => c.toUpperCase()).replace(/(\d)$/, ' $1');
const unitOf = (label, min, max) => /cutoff|freq|tone|frequency/i.test(label) && max > 100 ? 'Hz'
    : /attack|decay|release|hold$|time|portamento/i.test(label) && max <= 10 ? 's'
        : min >= 0 && max <= 1 ? '%' : 'decimal';

// A knob's value range, as Knob.jsx maps its rotation (type A: offset..offset+modifier,
// type B: offset±modifier, logarithmic: minValue..maxValue).
function knobRange({ modifier = 1, offset = 0, type = 'A', scalingType, minValue, maxValue, min, max }) {
    if (scalingType === 'logarithmic') return { min: minValue || offset, max: maxValue || modifier + offset, curve: 'log' };
    const lo = type === 'B' ? offset - modifier : offset, hi = offset + modifier;
    return { min: min ?? lo, max: max ?? hi, curve: 'lin' };
}

const rows = [], CHOICES = {}, TOGGLES = new Set();
for (const module of SYNTH_SCHEMA) for (const c of module.controls) {
    const id = rows.length;
    if (c.kind === 'select' || c.kind === 'choice') {
        const keys = Object.keys(c.options);
        CHOICES[c.key] = keys;
        rows.push([c.key, id, c.label, 0, keys.length - 1, 0, 'n', 'step', keys.map((k) => (c.kind === 'choice' ? c.options[k] : words(k)))]);
    } else if (c.kind === 'toggle') {
        TOGGLES.add(c.key);
        rows.push([c.key, id, c.label, 0, 1, 0, 'n', 'step', ['Off', 'On']]);
    } else {
        const { min, max, curve } = knobRange(c.props ?? {});
        const rounded = c.props?.round || c.props?.isRounded;
        rows.push([c.key, id, c.label, min, max, Math.min(max, Math.max(min, c.props?.resetValue ?? min)), c.props?.unit ?? unitOf(c.label, min, max), rounded && max - min <= 16 ? 'step' : curve]);
    }
}
const params = defineParams(rows);

/** The calmbgm synth as a /synths model: its parameter table and nothing to play (the generator plays it). */
export const NATIVE_SYNTH = { id: 'calmbgm', name: 'calmbgm synth', params };

// Effects whose settings default to 0 in presets (presetDefaults), silent even with the mix up:
// while the mix is 0 the panel shows the control's own default in place of such a 0, and raising
// the mix writes those shown values too, so the effect is heard at once. (The preset defaults stay
// as they are: links store a sound as its differences from them.)
const IDLE_SETTINGS = {
    distortionAmount: ['distortionDist'],
    flangerAmount: ['flangerRate', 'flangerDepth', 'flangerDelay', 'flangerFeedback'],
    delayAmount: ['delayTime', 'delayFeedback'],
    pingPongAmount: ['pingPongDelayTime', 'pingPongFeedback'],
};
const idleKeys = (preset) => Object.entries(IDLE_SETTINGS).filter(([mix]) => !(preset[mix] > 0)).flatMap(([, keys]) => keys.filter((k) => !preset[k]));

/** A preset as panel values: every control's value, choices and toggles as option indices. */
export function toPanel(preset) {
    const values = {};
    for (const p of params.PARAMS) {
        const v = preset[p.key];
        values[p.key] = CHOICES[p.key] ? Math.max(0, CHOICES[p.key].indexOf(v)) : TOGGLES.has(p.key) ? (v ? 1 : 0) : Number.isFinite(v) ? v : p.default;
    }
    for (const key of idleKeys(preset)) values[key] = params.BY_KEY[key].default;
    return params.sanitize(values);
}
/** One panel value as the preset stores it. */
export const fromPanel = (key, value) => (CHOICES[key] ? CHOICES[key][value] : TOGGLES.has(key) ? value === 1 : value);
/** The panel values that differ between two sets, as preset values (an edit's changes); with the
 * preset, raising an effect's mix from 0 also writes the settings the panel showed for it. */
export function panelChanges(before, after, preset) {
    const keys = Object.keys(after).filter((k) => after[k] !== before[k]);
    if (preset) {
        const idle = new Set(idleKeys(preset));
        for (const mix of keys) for (const k of (after[mix] > 0 ? IDLE_SETTINGS[mix] ?? [] : [])) if (idle.has(k) && !keys.includes(k)) keys.push(k);
    }
    return keys.map((k) => [k, fromPanel(k, after[k])]);
}
/** The schema's modules for a preset and a tab (instrument or effects), without the controls that do nothing for it
 * (a Wasm voice: only its envelope and level). */
export function panelModules(preset, part, context) {
    const string = ['plucked', 'piano'].includes(preset.stringModel);
    return SYNTH_SCHEMA
        .filter(({ label }) => ['VCO', 'FM'].includes(label) ? !string : label === 'Plucked string' ? preset.stringModel === 'plucked' : ['Piano', 'Piano tuning'].includes(label) ? preset.stringModel === 'piano' : true)
        .filter(({ label }) => EFFECT_MODULES.has(label) === (part === 'effects'))
        .map((m) => ({ title: m.label, keys: m.controls.filter((c) => !(c.disabled && c.disabled(preset, context)) && (!preset.wasmVoice || NATIVE_CONTROLS.has(c.key))).map((c) => c.key) }))
        .filter((m) => m.keys.length);
}
