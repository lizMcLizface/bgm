// The listener's settings for a string note and the model they produce. Kept apart from player.js (which imports the tables as JSON and needs a bundler)
// so that the calibration tools can build exactly the notes the page plays.
import { modelFor, strengthPair } from './model.js';
import { smoothShape } from './sourceFilter.js';

/** The parameters of the model a listener can move; each changes the rendered note, so each is part of the cache key. */
export const DEFAULT_TUNING = { vibrato: 1, noise: -9.5, tilt: 0, evenness: .6, smear: 0, lineRatio: .15, wakeDb: 0, wakeTime: .5, noiseShare: .002, rtNoise: -30, rtShimmer: 1, rtAttack: .06, rtOpen: .35, rtHiss: .4, rtRelease: 1, parts: 'full', phase: 'random', onset: 1.5, shimmer: 2, bed: 0, flare: 1, noiseTau: 0 };   // the user's settings by ear, 2026-10-27 (bowed patches)
/** Each patch's own starting values: a pluck or short note starts with a real broadband burst, so its noise is left as measured. */
export const PATCH_TUNING = { long: DEFAULT_TUNING, live: { ...DEFAULT_TUNING, bed: -5 }, short: { ...DEFAULT_TUNING, noise: -2, wakeDb: 0, wakeTime: .3, noiseShare: 1, bed: -4, noiseTau: .04 }, pizzicato: { ...DEFAULT_TUNING, noise: -3, wakeDb: 0, wakeTime: .3, noiseShare: 1, bed: -4, noiseTau: .15 } };   // noise: matched to the recordings' period-to-period coherence (tools/periodicity.mjs)
export const defaultTuning = (patch) => ({ ...(PATCH_TUNING[patch] ?? DEFAULT_TUNING) });

/**
 * Listening to the body-and-source reading of the table (sourceFilter.js) in parts. 'full': the table's own spectrum. 'smooth': the
 * body fixed in Hz times a source with a tilt of its own, with no per-note detail (it also exists below the measured range). 'residual':
 * only what the table has beyond that, each harmonic at the size of the difference of the two amplitudes, with nothing else sounding.
 */
function splitParts(table, model, midi, velocity, f0, parts) {
    if (parts !== 'smooth' && parts !== 'residual') return { tonal: model.tonal, over: {} };
    const shape = smoothShape(table, strengthPair(table, velocity), midi, f0, model.tonal.length, 'tilt'), power = (list) => list.reduce((sum, db) => sum + 10 ** (db / 10), 0), lift = 10 * Math.log10(power(model.tonal) / power(Array.from(shape, (d) => d + model.level)));
    const smooth = Array.from(shape, (d) => d + model.level + lift);       // same total power as the table's note: the fit does not conserve it, and parts of unequal loudness are hard to compare
    if (parts === 'smooth') return { tonal: smooth, over: {} };
    const tonal = Array.from(model.tonal, (full, k) => 20 * Math.log10(Math.max(1e-6, Math.abs(10 ** (full / 20) - 10 ** (smooth[k] / 20)))));
    return { tonal, over: { noise: model.noise.map(() => -200), lowNoise: null, bed: null, startNoise: null, body: null, wake: null, burst: false } };
}

/** The model for a note with the listener's tuning applied (vibrato depth, bow-noise level, tilt in dB per octave above 1 kHz). `without`: a measured pitch to leave out of the table. */
export function tunedModelFrom(full, midi, velocity, tuning = DEFAULT_TUNING, without = null) {
    const table = without == null ? full : { ...full, pitches: full.pitches.filter((p) => p.pitch !== without) }, f0 = 440 * 2 ** ((midi - 69) / 12), model = modelFor(table, midi, velocity, f0, { evenness: tuning.evenness, noiseShare: tuning.noiseShare });
    const tilt = (db, k) => db + tuning.tilt * Math.log2(Math.max(.25, (k + 1) * f0 / 1000));
    const parts = splitParts(table, model, midi, velocity, f0, tuning.parts);
    return {
        ...model, wake: { gainDb: tuning.wakeDb, tau: tuning.wakeTime }, phase: tuning.phase, onsetScale: tuning.onset, shimmer: tuning.shimmer, smear: tuning.smear, lineWidth: tuning.lineRatio * f0,   // the noise band is as wide as a fraction of the fundamental (its skirt was ~30 Hz at C3 and ~60 Hz at C4)
        bedDb: tuning.bed ?? 0, flare: tuning.flare ?? 1, noiseTau: tuning.noiseTau ?? 0,
        tonal: parts.tonal.map(tilt), lowNoise: model.lowNoise == null ? model.lowNoise : model.lowNoise + tuning.noise, noise: model.noise.map((db, k) => tilt(db, k) + tuning.noise),
        vibrato: model.vibrato && { ...model.vibrato, depths: model.vibrato.depths.map((d) => d * tuning.vibrato) },
        ...parts.over,
    };
}
