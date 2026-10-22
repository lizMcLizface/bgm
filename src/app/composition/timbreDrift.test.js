import { describe, expect, it } from 'vitest';
import { canDrift, timbreDrift } from './timbreDrift';

const pad = { stringModel: 'oscillator', filterFreq: 1200, osc2Type: 'sawtooth', osc2Amount: 0.4, voiceCount: 3, detuneSpread: 10, noiseMix: 0, vibratoDepth: 0 };

describe('timbre drift', () => {
    it('leaves complex and special sounds alone', () => {
        for (const p of [{ ...pad, fmIndex: 2 }, { ...pad, stringModel: 'piano' }, { ...pad, wasmVoice: 'x' }, { ...pad, classics: {} }, { ...pad, diy: {} }]) {
            expect(canDrift(p)).toBe(false);
            expect(timbreDrift(p, 'pad', 5, 1, 1)).toBeNull();
        }
        expect(timbreDrift(pad, 'pad', 5, 0, 1)).toBeNull();
        expect(timbreDrift(pad, 'perc', 5, 1, 1)).toBeNull();
    });
    it('moves only what the sound uses, within bounds of its own values', () => {
        for (let bar = 0; bar < 80; bar++) {
            const v = timbreDrift(pad, 'pad', bar, 1, 3);
            expect(Object.keys(v).sort()).toEqual(['detuneSpread', 'filterFreq', 'osc2Amount']);
            expect(v.filterFreq).toBeGreaterThanOrEqual(1200 * 2 ** -0.35 - 1e-6);
            expect(v.filterFreq).toBeLessThanOrEqual(1200 * 2 ** 0.35 + 1e-6);
            expect(Math.abs(v.osc2Amount - 0.4)).toBeLessThanOrEqual(0.15 + 1e-9);
            expect(Math.abs(v.detuneSpread / 10 - 1)).toBeLessThanOrEqual(0.3 + 1e-9);
        }
        expect(Object.keys(timbreDrift(pad, 'bass', 3, 1, 3))).toEqual(['filterFreq']);
        expect(timbreDrift({ ...pad, filterFreq: 18000, osc2Amount: 0, voiceCount: 1 }, 'lead', 3, 1, 3)).toBeNull();
    });
    it('moves gradually from bar to bar', () => {
        let last = timbreDrift(pad, 'lead', 0, 1, 9).filterFreq;
        for (let bar = 1; bar < 64; bar++) {
            const now = timbreDrift(pad, 'lead', bar, 1, 9).filterFreq;
            expect(Math.abs(Math.log2(now / last))).toBeLessThan(0.15);
            last = now;
        }
    });
});
