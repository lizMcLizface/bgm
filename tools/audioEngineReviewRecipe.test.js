import { describe, expect, it } from 'vitest';
import { createRecipe, fingerprints, validateRecipe, validateSavedRecord, verifyReplay } from './audioEngineReviewRecipe.js';

describe('integrated review reload admission', () => {
    it('replays serialized settings and presets independent of object property order', async () => {
        const recipe = createRecipe(48000);
        const original = await fingerprints({ recipe, settings: { seed: 42, muted: false },
            presets: [{ name: 'actual preset', amount: .5 }], factory: { kernel: 'accepted', clock: '7a' } });
        const saved = validateSavedRecord(JSON.parse(JSON.stringify({ version: 1, recipe, fingerprints: original })), 48000);
        const replayed = await fingerprints({ factory: { clock: '7a', kernel: 'accepted' },
            presets: [{ amount: .5, name: 'actual preset' }], settings: { muted: false, seed: 42 }, recipe });
        expect(verifyReplay(saved.fingerprints, replayed)).toBe(true);
        for (const key of ['settings', 'presets', 'factory', 'recipe']) {
            expect(() => verifyReplay(saved.fingerprints, { ...replayed, [key]: '0'.repeat(64) })).toThrow('Reload changed');
        }
        expect(() => validateSavedRecord(saved, 44100)).toThrow('sample rate');
    });

    it('refuses tampered saved recipes before constructing any Generator owners', () => {
        const recipe = createRecipe(48000);
        for (const change of [{ orderedMix: false }, { liveInputLeadSeconds: 0 }, { seed: 4 },
            { presets: ['arbitrary preset'] }, { extraFactory: 'unreviewed' }, { sampleRate: 12345 }]) {
            expect(() => validateRecipe({ ...recipe, ...change })).toThrow('supported integrated slice');
        }
        expect(() => validateSavedRecord({ version: 1, recipe, fingerprints: {} }, 48000)).toThrow('completed review');
        expect(() => verifyReplay({ factory: 'same' }, { factory: 'same' })).toThrow('Reload changed');
    });
});
