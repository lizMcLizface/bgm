// A piano played from measurements of a real one (docs/PIANO_MODEL.md): the packed table in src/library/pianoTables is
// the piano, `modelFor` makes the note for a pitch and strength from it, `renderPianoModel` turns that into a buffer.
// The engine asks for a frequency (its temperament and stretch choose it), so the partials are moved onto that
// frequency, keeping the string's stiffness; strength comes in as velocity 0..1 and goes to MIDI velocity.
import measured from '../../library/pianoTables/measured.json';
import measuredAmbient from '../../library/pianoTables/measuredAmbient.json';
import measuredDrama from '../../library/pianoTables/measuredDrama.json';
import measuredGlass from '../../library/pianoTables/measuredGlass.json';
import measuredHouse from '../../library/pianoTables/measuredHouse.json';
import measuredRavel from '../../library/pianoTables/measuredRavel.json';
import measuredSoft from '../../library/pianoTables/measuredSoft.json';
import measuredSubdued from '../../library/pianoTables/measuredSubdued.json';
import { unpackTable } from './pianoModel/tableFile.js';
import { modelFor } from './pianoModel/interpolate.js';
import { renderPianoModel, normalizedGain } from './pianoModel/synth.js';

/** The calibrated piano types a preset can name (`pianoType`), and the file each one plays. */
export const CALIBRATED_FILES = { measured, measuredAmbient, measuredDrama, measuredGlass, measuredHouse, measuredRavel, measuredSoft, measuredSubdued };
/** What each is called in a menu: the sampled instrument it was measured from (`measured` is The Grand). */
export const CALIBRATED_LABELS = { measured: 'Measured: The Grand', measuredAmbient: 'Measured: Ambient', measuredDrama: 'Measured: Soft Drama', measuredGlass: 'Measured: Glass Grand', measuredHouse: 'Measured: House Piano', measuredRavel: 'Measured: Ravel', measuredSoft: 'Measured: Soft Piano', measuredSubdued: 'Measured: Subdued' };
export const CALIBRATED_TYPES = Object.keys(CALIBRATED_FILES);
export const isCalibratedPiano = (type) => Object.hasOwn(CALIBRATED_FILES, type);

const tables = new Map();
const tableFor = (type) => {
    if (!tables.has(type)) tables.set(type, unpackTable(CALIBRATED_FILES[type]));
    return tables.get(type);
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo));

// The measured piano rings 2.8 s by the `decay` scale the other piano types use; a preset can shorten or lengthen that.
const MEASURED_DECAY = 2.8;

/**
 * What the analysis could not measure in the treble. Above C5 a note has few partials and the fits for them are
 * unreliable, so: the decay rates get a loose sanity limit (the recorded treble does die fast, so nothing like a
 * "typical" ring may be imposed: tested against seven recordings, a tight limit gave 19 dB RMS error in the fundamental's
 * envelope, none or a loose one 4.7); the unison beating is halved (the fits read it deeper than it sounds); the hammer
 * and action noise gets +3 dB (against the recordings' spectra in the first 150 ms that is the best fit at all strengths;
 * cutting it, as first tried, flattened the differences in hammer texture between the pianos); and its onset may not
 * lag the strike (a lagging thud reads as felt delay). Slow swells (the bass fits reach 0.1 s) are limited everywhere.
 */
export const TIDY = { limitDecay: true, base: 25, slope: .6, fast: 4, noise: 0, beat: .5, noiseGain: 3, tauMin: 0, tPeakMax: .006 };
export function tidyModel(model, midi, cfg = TIDY) {
    const high = clamp((midi - 72) / 24, 0, 1), over = midi > 72 ? midi - 72 : 0;
    const partials = model.partials.map((p) => {
        const out = { ...p, rise: Math.min(p.rise, .012), delay: Math.min(p.delay, .004), beatDepth: over > 0 ? p.beatDepth * cfg.beat : p.beatDepth };
        if (over > 0 && cfg.limitDecay) {
            const lim2 = -(cfg.base + cfg.slope * over) * (1 + .25 * ((p.n ?? 1) - 1));
            // a fast first stage is only real where the fit found a hinge; a single slope is the ringing itself
            const lim1 = p.tb != null && p.tb < 1 ? cfg.fast * lim2 : lim2;
            out.s2 = Math.max(p.s2, lim2); out.s1 = Math.max(p.s1, lim1);
        }
        return out;
    });
    const fundamental = partials.reduce((m, p) => Math.max(m, p.a), 0);
    const quiet = 10 ** (-(8 + 14 * high) / 20);                    // dB below the fundamental the noise may reach
    const noise = model.noise.map((b) => {
        const rms = over > 0 && cfg.noise > 0 ? Math.min(b.rms * 10 ** (-12 * high * cfg.noise / 20), fundamental * quiet ** cfg.noise) : b.rms;
        return { ...b, floor: (b.floor ?? 0) * 10 ** ((over > 0 ? cfg.noiseGain : 0) / 20), rms: rms * 10 ** ((over > 0 ? cfg.noiseGain : 0) / 20), tPeak: Math.min(b.tPeak, cfg.tPeakMax), tau: over > 0 && !(model.f1 >= 1000 && b.hi <= model.f1 * .85) ? Math.max(cfg.tauMin, Math.min(b.tau, .02 + .02 * (1 - high))) : b.tau };
    });
    return { ...model, partials, noise };
}

// A real piano is not equally loud on every key: the recordings fall 10 to 17 dB from the bass to the top. The notes keep
// that curve; only the overall weight is set, once per strength, at this key (the partial amplitudes are the recording's own).
const ANCHOR = 60, anchors = new Map();
function anchorGain(type, strength) {
    const key = `${type}:${strength}`;
    if (!anchors.has(key)) anchors.set(key, normalizedGain(modelFor(tableFor(type), ANCHOR, strength)));
    return anchors.get(key);
}

/**
 * Make a measured piano ready before its first note: unpack its table and set its levels for the usual strengths, so that
 * note is only the cost of its own rendering (4 to 125 ms) and not that of the table as well. Cheap, synchronous and safe to
 * repeat. `types` defaults to all of them (the tables are bundled, so this is the only loading there is).
 */
export function preloadCalibratedPiano(types = CALIBRATED_TYPES, strengths = [40, 80, 115]) {
    for (const type of [].concat(types)) {
        if (!isCalibratedPiano(type)) continue;
        tableFor(type);
        for (const strength of strengths) anchorGain(type, strength);
    }
}

/**
 * One struck note. Options as renderAcousticPiano takes them where they mean something here: decay (scales the decay
 * rates), unison (scales the beating between strings, .25 as measured), velocity 0..1, seed (the noise).
 */
export function renderCalibratedPiano(sampleRate, frequency, { type = 'measured', decay = MEASURED_DECAY, unison = .25, velocity = .8, seed = 1, tidy: tidyConfig = TIDY } = {}) {
    const sr = clamp(sampleRate, 8000, 192000), f0 = clamp(frequency, 15, sr / 6);
    const midi = 69 + 12 * Math.log2(f0 / 440), strength = clamp(Math.round(clamp(velocity, 0, 1) * 127), 1, 127);
    const base = modelFor(tableFor(type), midi, strength), move = f0 / base.f1;
    const stretch = MEASURED_DECAY / clamp(decay, .3, 5), beating = clamp(unison, 0, 1) / .25;
    const tidy = tidyModel(base, midi, tidyConfig);
    const model = {
        ...tidy, f1: f0,
        partials: tidy.partials.map((p) => ({
            ...p, f: p.f * move, s1: p.s1 * stretch, s2: p.s2 * stretch, tb: p.tb == null ? null : p.tb / stretch,
            beatDepth: Math.min(.9, p.beatDepth * beating),
        })),
    };
    const out = renderPianoModel(model, sr, { seconds: Math.min(9, model.held + 1), gain: anchorGain(type, strength), seed });
    let peak = 0;
    for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
    if (peak > .85) for (let i = 0; i < out.length; i++) out[i] *= .85 / peak;
    return out;
}
