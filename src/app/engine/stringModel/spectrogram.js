// A spectrogram of a note for comparing a model with its recording (the A/B panel on /synths/strings/): magnitude in dB
// (a sinusoid of amplitude a reads 20 log10 a), the difference of two of them, and mean level by band.
import { fft } from '../pianoModel/dsp.js';

/**
 * Magnitude spectrogram of `x`: `size` samples per frame (Hann), a frame every `hop`, bins up to `maxHz`.
 * Returns { frames, bins, hz, hop, rate, data } where data[frame * bins + bin] is dB.
 */
export function spectrogram(x, rate, { size = 4096, hop = 1024, maxHz = 4000, seconds = x.length / rate, minDb = -120 } = {}) {
    const bins = Math.min(size / 2, Math.ceil(maxHz * size / rate)), count = Math.max(1, Math.floor((Math.min(x.length, seconds * rate) - size) / hop) + 1);
    const w = new Float64Array(size); let sum = 0;
    for (let i = 0; i < size; i++) { w[i] = .5 - .5 * Math.cos(2 * Math.PI * i / size); sum += w[i]; }
    const data = new Float32Array(count * bins), re = new Float64Array(size), im = new Float64Array(size);
    for (let f = 0; f < count; f++) {
        for (let i = 0; i < size; i++) { re[i] = (x[f * hop + i] ?? 0) * w[i]; im[i] = 0; }
        fft(re, im);
        for (let k = 0; k < bins; k++) data[f * bins + k] = Math.max(minDb, 20 * Math.log10(2 * Math.hypot(re[k], im[k]) / sum + 1e-9));
    }
    return { frames: count, bins, hz: rate / size, hop, rate, data };
}

/** model minus original, frame by frame (the shorter of the two sets the length). */
export function difference(a, b) {
    const frames = Math.min(a.frames, b.frames), data = new Float32Array(frames * a.bins);
    for (let i = 0; i < data.length; i++) data[i] = b.data[i] - a.data[i];
    return { ...a, frames, data };
}

/** Mean level in dB (power mean over time and frequency) of each band [lo, hi) Hz of a spectrogram. */
export function bandLevels(spec, edges) {
    return edges.slice(0, -1).map((lo, i) => {
        const a = Math.max(1, Math.round(lo / spec.hz)), b = Math.min(spec.bins, Math.round(edges[i + 1] / spec.hz));
        let s = 0, n = 0;
        for (let f = 0; f < spec.frames; f++) for (let k = a; k < b; k++) { s += 10 ** (spec.data[f * spec.bins + k] / 10); n++; }
        return n ? 10 * Math.log10(s / n) : null;
    });
}

/** Colour of a level (dB): black through purple and orange to white over `range` dB below `top`. */
export function heat(db, top, range = 80) {
    const t = Math.max(0, Math.min(1, (db - (top - range)) / range)), stops = [[0, 0, 0], [40, 10, 90], [160, 30, 110], [240, 110, 40], [255, 230, 120], [255, 255, 255]];
    const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), u = p - i;
    return stops[i].map((c, k) => Math.round(c * (1 - u) + stops[i + 1][k] * u));
}

/** Colour of a difference (dB): blue where the model is weaker, dark at zero, red where it is stronger, saturating at `range`. */
export function delta(d, range = 24) {
    const t = Math.max(-1, Math.min(1, d / range)), a = Math.abs(t);
    return t < 0 ? [Math.round(20 * (1 - a)), Math.round(40 + 90 * a), Math.round(30 + 225 * a)] : [Math.round(30 + 225 * a), Math.round(40 + 60 * (1 - a) * a * 2), Math.round(30 * (1 - a))];
}

/** A note for comparison: a bowed note's loop unrolled to `hold` seconds and its release applied; any other note as it is. */
export function flatten(made, release, hold, rate) {
    if (!release || made.loopStart == null) return made.buffer;
    const count = Math.round((hold + release.seconds) * rate), out = new Float32Array(count), L = made.loopEnd - made.loopStart;
    for (let i = 0; i < count; i++) {
        const t = i / rate, source = t < made.loopEnd ? t : made.loopStart + ((t - made.loopStart) % L);
        let g = 1;
        if (t > hold) {
            const dt = t - hold, { times, gains } = release;
            let j = 1; while (j < times.length - 1 && times[j] < dt) j++;
            const u = Math.max(0, Math.min(1, (dt - times[j - 1]) / (times[j] - times[j - 1])));
            g = gains[j - 1] * (1 - u) + gains[j] * u;
        }
        out[i] = made.buffer[Math.min(made.buffer.length - 1, Math.round(source * rate))] * g;
    }
    return out;
}
