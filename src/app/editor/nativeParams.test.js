import { describe, expect, it } from 'vitest';
import PRESET_DEFAULTS from '../engine/presetDefaults';
import { NATIVE_SYNTH, toPanel, panelChanges } from './nativeParams';
import { GENERATIVE_PRESETS } from '../presets';

const P = NATIVE_SYNTH.params.BY_KEY;

describe('the calmbgm synth panel', () => {
    it('shows an idle effect at its own defaults and writes them when its mix comes up', () => {
        const preset = { ...PRESET_DEFAULTS };
        const before = toPanel(preset);
        expect(before.flangerDepth).toBe(P.flangerDepth.default);
        expect(before.delayTime).toBe(P.delayTime.default);
        const changes = Object.fromEntries(panelChanges(before, { ...before, flangerAmount: 0.3 }, preset));
        expect(changes).toEqual({ flangerAmount: 0.3, flangerRate: P.flangerRate.default, flangerDepth: P.flangerDepth.default, flangerDelay: P.flangerDelay.default, flangerFeedback: P.flangerFeedback.default });
    });
    it('keeps a set value and a mixed-in effect as they are', () => {
        const preset = { ...PRESET_DEFAULTS, delayAmount: 0.2, delayTime: 0.25, flangerDelay: 0.008 };
        const before = toPanel(preset);
        expect(before.delayTime).toBe(0.25);
        expect(before.flangerDelay).toBe(0.008);
        expect(panelChanges(before, { ...before, delayAmount: 0.3 }, preset)).toEqual([['delayAmount', 0.3]]);
    });
    it('library sounds fit the effect ranges', () => {
        const keys = Object.keys(P).filter((k) => /^(distortion|bitCrush|flanger|chorus|phaser|delay|pingPong|eq)/.test(k));
        for (const [name, preset] of Object.entries(GENERATIVE_PRESETS)) {
            for (const key of keys) if (Number.isFinite(preset[key])) expect([name, key, preset[key] >= P[key].min && preset[key] <= P[key].max]).toEqual([name, key, true]);
        }
    });
});
