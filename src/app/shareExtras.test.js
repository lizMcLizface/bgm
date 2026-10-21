import { encodeExtras, decodeExtras, cleanRef } from './shareExtras';
import { defaultSettings, encodeSettings, decodeShare } from './settings';
import { defaultBus } from './engine/bus';
import { buildSetup, parseSetup } from './scenes';

const lead = { synth: 'jupiter8', name: 'Highway Sync', category: 'lead', level: 0.8, values: { cutoff: 900 }, rack: { 'effects.reverb': 0.2 } };
const machine = { synth: 'tr909', name: 'Room', values: { 'bd.level': 0.7 } };

test('nothing to carry makes no part: a default bus, no classic voices, the kit', () => {
    expect(encodeExtras({ bus: defaultBus(), sounds: {}, machine: null })).toBe('');
});

test('voices, a drum machine and the bus survive a link', () => {
    const settings = { ...defaultSettings(), bus: { ...defaultBus(), sends: { ...defaultBus().sends, pad: 0.4 } } };
    const code = encodeSettings(settings, { lead: { external: lead }, perc: { machine } });
    expect(code).toMatch(/(^|&)x=/);
    const { settings: back, presets } = decodeShare(code);
    expect(back.bus.sends.pad).toBe(0.4);
    expect(presets.lead).toEqual({ external: lead });
    expect(presets.perc).toEqual({ machine });
});

test('references are checked: unknown synths, odd names and non-numbers are dropped', () => {
    expect(cleanRef({ synth: 'nope', name: 'x' })).toBe(null);
    expect(cleanRef({ synth: 'cs80' })).toBe(null);
    expect(cleanRef({ synth: 'cs80', name: 'Brass', values: { a: 1, b: 'two', c: NaN }, level: 99 })).toEqual({ synth: 'cs80', name: 'Brass', values: { a: 1 }, level: 4 });
    expect(cleanRef(machine)).toBe(null); // a drum machine is no voice
    expect(decodeExtras('not a part')).toEqual({ sounds: {}, edits: {} });
});

test('a setup keeps a classic voice and a drum machine, and reads back', () => {
    const setup = buildSetup({ settings: defaultSettings(), voices: { lead: { name: 'Pluto 8 · Highway Sync', external: lead }, pad: { name: 'Soft Pad', synth: { masterVolume: 0.5 } } }, percussion: machine }, { name: 'Mixed' });
    const scene = parseSetup(JSON.stringify(setup));
    expect(scene.voices.lead).toEqual({ name: 'Pluto 8 · Highway Sync', external: lead });
    expect(scene.percussion).toEqual(machine);
    expect(scene.voices.pad.name).toBe('Soft Pad');
});

test('an edited sound of the generator\'s own synth travels as its changes, and comes back whole', async () => {
    const { presetEdit, presetFromEdit } = await import('./editor/presetEdits');
    const { findPreset } = await import('./editor/presetStore');
    const edited = { ...findPreset('Felt Piano'), filterFreq: 1234, reverbType: 'reverb2' };
    const edit = presetEdit('Felt Piano', edited);
    expect(edit.values).toEqual({ filterFreq: 1234, reverbType: 'reverb2' });
    const { presets } = decodeShare(encodeSettings(defaultSettings(), { lead: { edit } }));
    expect(presets.lead).toEqual({ edit });
    expect(presetFromEdit(presets.lead.edit)).toMatchObject({ ...findPreset('Felt Piano'), filterFreq: 1234, reverbType: 'reverb2' });
});
