// Timbre drift (settings.timbreDrift, 0..1): a voice's colour moves slowly around its own sound
// - every 8 bars a new seeded target, glided to - and only where that is safe: the calmbgm
// synth's oscillator sounds (no FM, piano, plucked string, native Wasm voice, DIY or classic
// synth), and only parameters the sound already uses, each within a small range of its own
// value. The preset itself is never changed (instruments apply it live: setDrift).
import { seeded } from '../random';

const SEGMENT = 8;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Whether a role's sound may drift at all. */
export function canDrift(preset) {
    if (!preset || preset.wasmVoice || preset.classics || preset.diy) return false;
    if (preset.stringModel && preset.stringModel !== 'oscillator') return false;
    return !(preset.fmIndex > 0 || preset.fmEnvAmount > 0);
}

// each parameter: whether the sound uses it, and its value at a position u in -1..1
const PARAMS = {
    filterFreq: { uses: (p) => p.filterFreq > 0 && p.filterFreq < 11000, at: (p, u, a) => clamp(p.filterFreq * 2 ** (u * 0.35 * a), 40, 16000) },
    osc2Amount: { uses: (p) => p.osc2Type !== 'off' && p.osc2Amount > 0, at: (p, u, a) => clamp(p.osc2Amount + u * 0.15 * a, 0, 1) },
    detuneSpread: { uses: (p) => p.voiceCount > 1 && p.detuneSpread > 0, at: (p, u, a) => p.detuneSpread * (1 + u * 0.3 * a) },
    noiseMix: { uses: (p) => p.noiseMix > 0, at: (p, u, a) => clamp(p.noiseMix * (1 + u * 0.3 * a), 0, 1) },
    vibratoDepth: { uses: (p) => p.vibratoDepth > 0, at: (p, u, a) => p.vibratoDepth * (1 + u * 0.3 * a) },
};
const ROLE_KEYS = { lead: Object.keys(PARAMS), counter: Object.keys(PARAMS), pad: Object.keys(PARAMS), bass: ['filterFreq'] };
const ROLE_SALT = { lead: 1, counter: 2, pad: 3, bass: 4 };

const position = (seed, role, segment, key) => seeded((seed * 131 + segment * 977 + ROLE_SALT[role] * 7919 + key.length * 31) >>> 0)() * 2 - 1;

/** The drifted values at `bar`, or null when nothing drifts. */
export function timbreDrift(preset, role, bar, amount, seed = 0) {
    if (!(amount > 0) || !ROLE_KEYS[role] || !canDrift(preset)) return null;
    const segment = Math.floor(Math.max(0, bar) / SEGMENT), t = smooth((Math.max(0, bar) % SEGMENT) / SEGMENT);
    const values = {};
    for (const key of ROLE_KEYS[role]) {
        const param = PARAMS[key];
        if (!param.uses(preset)) continue;
        const u = position(seed, role, segment, key) * (1 - t) + position(seed, role, segment + 1, key) * t;
        values[key] = param.at(preset, u, amount);
    }
    return Object.keys(values).length ? values : null;
}

/**
 * Slow pad vibrato (settings.padVibrato, 0..1): a pad or second-lead oscillator sound that has no vibrato of its own gets a
 * very gentle one (up to 6 cents at full, 0.3-0.8 Hz, so it reads as a slow shimmer, not as singing), its depth and rate
 * gliding between seeded targets every 8 bars like the timbre drift. Same safety rules as the drift (canDrift). A sound
 * that already has vibrato, and every other role, is left alone. Applied live; the preset never changes.
 */
export function slowVibrato(preset, role, bar, amount, seed = 0) {
    if (!(amount > 0) || (role !== 'pad' && role !== 'counter') || !canDrift(preset) || preset.vibratoDepth > 0) return null;
    const segment = Math.floor(Math.max(0, bar) / SEGMENT), t = smooth((Math.max(0, bar) % SEGMENT) / SEGMENT);
    const at = (key) => (position(seed, role, segment, key) * (1 - t) + position(seed, role, segment + 1, key) * t + 1) / 2;
    return { vibratoDepth: Math.round(amount * (0.35 + 0.65 * at('depth')) * 6 * 100) / 100, vibratoRate: Math.round((0.3 + 0.5 * at('rate')) * 1000) / 1000 };
}

/** What a role's sound moves by at `bar`: the timbre drift and the slow pad vibrato together, or null. */
export function voiceMotion(preset, role, bar, { timbreDrift: drift = 0, padVibrato = 0 } = {}, seed = 0) {
    const a = timbreDrift(preset, role, bar, drift, seed), b = slowVibrato(preset, role, bar, padVibrato, seed);
    return a || b ? { ...b, ...a } : null;
}
