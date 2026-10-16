// Blending one synth preset into another (Instrument.morphTo): the numbers
// glide, the choices (a waveform, a filter type, a reverb) switch halfway.

// Numbers that cannot glide: whole steps, or setters that rebuild a waveform.
const STEPWISE = new Set(['voiceCount', 'subOscOctaveOffset', 'osc2OctaveOffset', 'vcoDutyCycle', 'osc2DutyCycle']);

// Frequencies glide in ratio (equal steps in pitch), not in Hz.
const FREQUENCIES = new Set(['filterFreq', 'masterFilterFreq', 'eqLowFreq', 'eqHighFreq', 'phaserFrequency']);

/**
 * The preset `t` (0..1) of the way from `from` to `to`.
 * @param {object} from - a full preset
 * @param {object} to - a full preset
 * @param {number} t
 * @returns {object} a full preset (the keys of `to`)
 */
export function blendPresets(from, to, t) {
    const out = {};
    Object.keys(to).forEach((key) => {
        const a = from[key];
        const b = to[key];
        if (typeof a === 'number' && typeof b === 'number' && !STEPWISE.has(key)) {
            out[key] = FREQUENCIES.has(key) && a > 0 && b > 0 ? a * (b / a) ** t : a + (b - a) * t;
        } else {
            out[key] = t < 0.5 ? a : b;
        }
    });
    return out;
}
