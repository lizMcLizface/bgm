import { voiceTraits } from './voiceTraits';
import { GENERATIVE_PRESETS } from '../presets';

test('slow, dark pads and quick, bright plucks read as such', () => {
    const pad = voiceTraits({ gainAttack: 1.2, gainSustain: 0.7, filterFreq: 800 });
    expect(pad.envelope).toBe('slow swell');
    expect(pad.tone).toBe('dark');
    const pluck = voiceTraits({ gainAttack: 0.003, gainSustain: 0, filterFreq: 9000 });
    expect(pluck.envelope).toBe('plucked');
    expect(pluck.tone).toBe('bright');
});

test('every built-in preset gets a description', () => {
    Object.values(GENERATIVE_PRESETS).forEach((preset) => {
        const traits = voiceTraits(preset);
        expect(traits.chips.length).toBeGreaterThanOrEqual(2);
        expect(traits.wave).toBeTruthy();
    });
});
