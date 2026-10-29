import classics from '../../library/classics.json';
import { SYNTHS } from '../../synths/models';
import { presetGroups, findPreset } from './presetStore';
import { FAMILIES } from './soundFamilies';

test('every classic sound in the picker exists on its synth', () => {
    for (const { synth, name, family } of classics.sounds) {
        expect(SYNTHS[synth], synth).toBeTruthy();
        expect(SYNTHS[synth].presets.some((p) => p.name === name), `${synth}: ${name}`).toBe(true);
        expect(classics.synths[synth]).toBe(SYNTHS[synth].name);
        expect(FAMILIES[family], name).toBeTruthy();
    }
});

test('they are listed as their own block and resolve by the label the voice shows', () => {
    const block = presetGroups().find(({ group }) => group === 'Classic synths');
    expect(Object.keys(block.presets)).toContain('V 80 · Plain');
    expect(findPreset('Analog 106 · Bass 106').classicRef).toMatchObject({ synth: 'juno', name: 'Bass 106' });
});
