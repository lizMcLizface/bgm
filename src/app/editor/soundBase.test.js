import { soundBase, BASES } from './soundBase';
import { PRESET_CATEGORIES } from '../presets';

test('every library sound has a base, and the main kinds are told apart', () => {
    for (const presets of Object.values(PRESET_CATEGORIES)) for (const [name, preset] of Object.entries(presets)) expect(BASES[soundBase(preset).id], name).toBeTruthy();
    expect(soundBase({ stringModel: 'piano' }).label).toBe('Calm piano');
    expect(soundBase({ fmIndex: 2 }).label).toBe('Calm FM');
    expect(soundBase({}).label).toBe('Calm poly');
    expect(soundBase({ bitCrushAmount: 0.5 }).label).toBe('Web Audio');
    expect(soundBase({ classics: { synth: 'cs80' } }).id).toBe('classic');
    expect(soundBase({ classicRef: { synth: 'cs80', synthName: 'V 80' } }).label).toBe('V 80');
    expect(soundBase(PRESET_CATEGORIES['Wasm voices']['Wasm Round FM Bass']).label).toBe('Calm FM');
});
