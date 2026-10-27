// Measuring one note of a sampled bowed or plucked string (docs/STRING_MODEL.md): where its harmonics sit, how much
// of the sound is each harmonic's cell of spectrum and how much is noise between them, how the pitch moves
// (vibrato), and how seven frequency bands rise at the start, die away and are released.
// Pure functions on typed arrays; used by tools and tests, nothing in playback.
import { fft } from '../pianoModel/dsp.js';

/** Band edges in Hz for the envelopes; the last band is open at the top. */
export const BAND_EDGES = [0, 250, 500, 1000, 2000, 4000, 8000, Infinity];
/** Seconds after the onset at which the band envelopes are read, and after a key release. */
export const ENV_TIMES = [0, .01, .02, .03, .045, .06, .08, .1, .13, .16, .2, .25, .3, .4, .5, .65, .8, 1, 1.25, 1.5, 2, 2.5, 3, 4];
export const RELEASE_TIMES = [0, .05, .1, .15, .2, .3, .4, .5, .7, 1];

const hann = new Map();
const window = (n) => {
    if (!hann.has(n)) { const w = new Float64Array(n); let s = 0; for (let i = 0; i < n; i++) { w[i] = .5 - .5 * Math.cos(2 * Math.PI * i / n); s += w[i] * w[i]; } hann.set(n, { w, s }); }
    return hann.get(n);
};
export const dbPower = (p) => 10 * Math.log10(p + 1e-20);

/** One-sided power spectrum of n samples from `from` (mean-square units: a sinusoid of amplitude a sums to a^2 / 2). */
export function powerSpectrum(x, from, n) {
    const { w, s } = window(n), re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = (x[from + i] ?? 0) * w[i];
    fft(re, im);
    const p = new Float64Array(n / 2);
    for (let k = 0; k < p.length; k++) p[k] = 2 * (re[k] * re[k] + im[k] * im[k]) / (n * s);
    return p;
}

/** Power in each of the BAND_EDGES bands of a spectrum made with `rate` / `n`. */
export function bandPowers(p, rate, n) {
    const out = new Float64Array(BAND_EDGES.length - 1), hz = rate / n;
    for (let k = 1; k < p.length; k++) { const f = k * hz; let b = 0; while (f >= BAND_EDGES[b + 1]) b++; out[b] += p[k]; }
    return out;
}

/** First sample (as seconds from the start of x) louder than a floor: the sampler's real onset. */
export function findOnset(x, rate, from, floor = 1e-4) {
    for (let i = Math.max(0, Math.round(from * rate)); i < x.length; i++) if (Math.abs(x[i]) > floor) return i / rate;
    return null;
}

/** The fundamental that best lines up a comb of harmonics with a spectrum, searched around `nominal` +-`range` cents. */
export function findFundamental(p, rate, n, nominal, { range = 60, harmonics = 14, step = .5 } = {}) {
    const hz = rate / n, smooth = new Float64Array(p.length);
    for (let k = 1; k < p.length - 1; k++) smooth[k] = p[k - 1] + p[k] + p[k + 1];
    const at = (f) => { const x = f / hz, k = Math.floor(x), t = x - k; return k + 1 >= smooth.length ? 0 : Math.sqrt(smooth[k] * (1 - t) + smooth[k + 1] * t); };
    let best = nominal, bestScore = -1;
    for (let c = -range; c <= range; c += step) {
        const f0 = nominal * 2 ** (c / 1200);
        let score = 0;
        for (let h = 1; h <= harmonics && h * f0 < rate / 2.2; h++) score += at(h * f0);
        if (score > bestScore) { bestScore = score; best = f0; }
    }
    return best;
}

/**
 * Vibrato smears a harmonic and a comb of peaks reads it a little off; the centroid of the power around each of the first
 * harmonics is the mean frequency, which is the pitch the note should be played at.
 */
export function refineFundamental(p, rate, n, f0, harmonics = 5) {
    const hz = rate / n; let sum = 0, weight = 0;
    for (let h = 1; h <= harmonics; h++) {
        let s = 0, sf = 0;
        for (let k = Math.round((h - .3) * f0 / hz); k <= Math.round((h + .3) * f0 / hz); k++) { s += p[k]; sf += p[k] * k * hz; }
        if (s > 0) { sum += s * (sf / s) / h; weight += s; }
    }
    return weight > 0 ? sum / weight : f0;
}

/**
 * The spectrum as one cell per harmonic (from half a fundamental below it to half above): its total power, and an
 * estimate of how much of that is noise (the quiet bins between the harmonic's peaks, scaled by what the
 * lowest fifth of a noise periodogram would read), both in dB. Cells run to `maxHz`.
 */
export function harmonicCells(p, rate, n, f0, maxHz = 12000, lobe = 0) {
    const hz = rate / n, cells = [];
    if (lobe > 0) {
        // Everything below the first cell (half a fundamental): the thump of the note starting, the body's lowest modes. Harmonic 0, all noise.
        const top = Math.round(.5 * f0 / hz); let low = 0;
        for (let k = 1; k < top; k++) low += p[k];
        if (top > 2 && low > 0) cells.push([0, -200, dbPower(low)]);
    }
    for (let h = 1; h * f0 < maxHz; h++) {
        const lo = Math.max(1, Math.round((h - .5) * f0 / hz)), hi = Math.min(p.length, Math.round((h + .5) * f0 / hz));
        if (hi - lo < 2) break;
        let sum = 0; const bins = [];
        for (let k = lo; k < hi; k++) { sum += p[k]; bins.push(p[k]); }
        let noise;
        if (lobe > 0) {
            // tone = the power within `lobe` bins of the cell's peak (a steady or decaying harmonic fills about that), noise = the rest: the broadband
            // burst and the body's own, non-harmonic ringing. The quiet-bins estimate below reads nearly nothing for a short note.
            let pk = lo; for (let k = lo; k < hi; k++) if (p[k] > p[pk]) pk = k;
            let tone = 0; for (let k = Math.max(lo, pk - lobe); k <= Math.min(hi - 1, pk + lobe); k++) tone += p[k];
            noise = Math.max(1e-20, sum - tone);
        } else {
            bins.sort((a, b) => a - b);
            noise = Math.min(sum, 4.5 * bins[Math.floor(bins.length * .2)] * bins.length);
        }
        cells.push([h, dbPower(Math.max(1e-20, sum - noise)), dbPower(noise)]);
    }
    return cells;
}

/** Mean of power spectra of several frames, which steadies the estimate of a note that is not perfectly still. */
function averagedSpectrum(x, frames, n) {
    const sum = new Float64Array(n / 2);
    for (const from of frames) { const p = powerSpectrum(x, from, n); for (let k = 0; k < sum.length; k++) sum[k] += p[k] / frames.length; }
    return sum;
}

/** The pitch trajectory of a sustained note in cents from its mean, every 10 ms from `from` to `to` seconds after the onset. */
export function pitchTrack(x, rate, onset, f0, from, to) {
    const n = 4096, hop = Math.round(rate * .01), track = [];
    for (let t = from; t < to; t += .01) {
        const start = Math.round((onset + t) * rate) - n / 2;
        if (start < 0 || start + n > x.length) break;
        const p = powerSpectrum(x, start, n);
        track.push(1200 * Math.log2(findFundamental(p, rate, n, f0, { range: 45, harmonics: 24, step: 1 }) / f0));
    }
    const mean = track.reduce((s, c) => s + c, 0) / track.length;
    return { cents: track.map((c) => c - mean), mean, step: .01, hop };
}

/** Vibrato rate (Hz) and depth (cents, zero to peak) of a pitch track, and its depth in the segments of `segments` seconds. */
export function vibratoOf(track, segments = [[.3, .7], [.7, 1.1], [1.1, 1.6], [1.6, 2.6], [2.6, 3.6]], first = .3) {
    const size = 2048, re = new Float64Array(size), im = new Float64Array(size), c = track.cents;
    for (let i = 0; i < c.length && i < size; i++) re[i] = c[i] * (.5 - .5 * Math.cos(2 * Math.PI * i / c.length));
    fft(re, im);
    const hzPerBin = 1 / (track.step * size);
    let best = 0, bestMag = 0;
    for (let k = Math.ceil(3 / hzPerBin); k <= Math.floor(8 / hzPerBin); k++) { const m = Math.hypot(re[k], im[k]); if (m > bestMag) { bestMag = m; best = k; } }
    // the depth is that of a sine at the vibrato rate fitted to the segment (least squares), not the spread of the whole track,
    // which also holds the pitch's slow wander and the measurement's noise and would overstate the vibrato
    const rate = best * hzPerBin;
    const depth = (a, b) => {
        const i0 = Math.round((a - first) / track.step), part = c.slice(i0, Math.round((b - first) / track.step));
        if (part.length < 10) return 0;
        const mean = part.reduce((s, v) => s + v, 0) / part.length;
        let sc = 0, ss = 0, cc = 0, sn = 0, cs = 0;
        part.forEach((v, i) => { const w = 2 * Math.PI * rate * (i0 + i) * track.step, co = Math.cos(w), si = Math.sin(w); sc += (v - mean) * co; ss += (v - mean) * si; cc += co * co; sn += si * si; cs += co * si; });
        const det = cc * sn - cs * cs, A = (sc * sn - ss * cs) / det, B = (ss * cc - sc * cs) / det;
        return Math.hypot(A, B);
    };
    return { rate: best * hzPerBin, depths: segments.map(([a, b]) => depth(a, b)) };
}

/** Band envelopes in dB at `times` (seconds after `origin`), each relative to its `reference` band powers. */
export function bandEnvelopes(x, rate, origin, times, reference) {
    return BAND_EDGES.slice(1).map((_, b) => times.map((t) => {
        const n = t < .3 ? 1024 : 4096, start = Math.round((origin + t) * rate) - (t === 0 ? 0 : n / 2);
        if (start < 0 || start + n > x.length) return null;
        const p = bandPowers(powerSpectrum(x, start, n), rate, n);
        return dbPower(p[b]) - dbPower(reference[b]);
    }));
}

/** The harmonics whose wander is measured. */
export const WANDER_HARMONICS = [4, 8, 12, 16];

/**
 * How much each harmonic of a sustained note wanders on its own: the spread, in cents, of its frequency about the vibrato
 * all harmonics share, and of its level in dB, over 1.2 to 3.8 s. One player's harmonics move together; several players
 * (or a bow that is not steady) make each wander separately, which shows as smeared lines on a spectrogram. The measurement
 * has a floor (a sinusoid with that vibrato reads about f/950 cents and 1.2 dB), taken off in quadrature.
 */
export function wanderOf(x, rate, onset, f0, vibratoRate = 0) {
    const n = 8192, hz = rate / n, frames = [];
    for (let t = 1.2; t < 3.8; t += .02) { const from = Math.round((onset + t) * rate) - n / 2; if (from < 0 || from + n > x.length) return null; frames.push(powerSpectrum(x, from, n)); }
    const track = (h) => {
        const f = h * f0, cents = [], levels = [];
        for (const p of frames) {
            const lo = Math.round(f * .975 / hz), hi = Math.round(f * 1.025 / hz); let k = lo;
            for (let i = lo; i <= hi; i++) if (p[i] > p[k]) k = i;
            const a = Math.log(p[k - 1] + 1e-20), b = Math.log(p[k] + 1e-20), c = Math.log(p[k + 1] + 1e-20), shift = Math.max(-.5, Math.min(.5, .5 * (a - c) / (a - 2 * b + c)));
            cents.push((k + (Number.isFinite(shift) ? shift : 0)) * hz); levels.push(10 * Math.log10(p[k] + 1e-20));
        }
        const mean = cents.reduce((s, v) => s + v, 0) / cents.length, lm = levels.reduce((s, v) => s + v, 0) / levels.length;
        return { cents: cents.map((v) => 1200 * Math.log2(v / mean)), std: Math.sqrt(levels.reduce((s, v) => s + (v - lm) ** 2, 0) / levels.length) };
    };
    const shared = [4, 5, 6, 7, 8].map(track), common = shared[0].cents.map((_, i) => shared.reduce((s, o) => s + o.cents[i], 0) / shared.length);
    const norm = common.reduce((s, v) => s + v * v, 0);
    const out = { cents: [], db: [], vibrato: null };
    if (vibratoRate > 0 && norm > 1e-6) {          // the vibrato itself: a sine at its rate fitted to the track shared by the harmonics
        let sc = 0, ss = 0, cc = 0, sn = 0, cs = 0;
        common.forEach((v, i) => { const w = 2 * Math.PI * vibratoRate * i * .02, co = Math.cos(w), si = Math.sin(w); sc += v * co; ss += v * si; cc += co * co; sn += si * si; cs += co * si; });
        const det = cc * sn - cs * cs, depth = Math.hypot((sc * sn - ss * cs) / det, (ss * cc - sc * cs) / det);
        // how much of the track the sine explains: a vibrato that drifts in rate is not fitted, and its depth is then not trusted
        out.vibrato = { depth, fit: (depth * depth / 2) / (common.reduce((a, v) => a + v * v, 0) / common.length) };
    }
    for (const h of WANDER_HARMONICS) {
        if (h * f0 > 5000 || norm < 1e-6) { out.cents.push(null); out.db.push(null); continue; }
        const o = track(h), g = o.cents.reduce((s, v, i) => s + v * common[i], 0) / norm, residual = o.cents.map((v, i) => v - g * common[i]);
        const rms = Math.sqrt(residual.reduce((s, v) => s + v * v, 0) / residual.length), floor = h * f0 / 950;
        out.cents.push(Math.sqrt(Math.max(0, rms * rms - floor * floor))); out.db.push(Math.sqrt(Math.max(0, o.std * o.std - 1.2 * 1.2)));
    }
    return out;
}

/**
 * The starting transient of a bowed note: how much of the waveform is not a repeat of the one before, over the first 250 ms. The bow takes
 * a number of periods to settle into the string's regular (Helmholtz) motion; before that the motion is irregular, which is the scratch at the
 * start of a note. For windows of four periods every 10 ms, 1 minus the correlation of each period with the next (resampled to the same length).
 */
export const ONSET_STEP = .01, ONSET_POINTS = 26;
export function onsetNoiseOf(x, rate, onset, f0) {
    const period = rate / f0, out = [];
    const cycle = (t0) => Float64Array.from({ length: 64 }, (_, k) => { const p = t0 + k * period / 64, i = Math.floor(p), u = p - i; return (x[i] ?? 0) * (1 - u) + (x[i + 1] ?? 0) * u; });
    for (let j = 0; j < ONSET_POINTS; j++) {
        const a = onset * rate + j * ONSET_STEP * rate; let sum = 0, n = 0;
        for (let q = 0; q < 4; q++) {
            const u = cycle(a + q * period), v = cycle(a + (q + 1) * period), mu = u.reduce((s, z) => s + z, 0) / 64, mv = v.reduce((s, z) => s + z, 0) / 64;
            let c = 0, du = 0, dv = 0; for (let k = 0; k < 64; k++) { c += (u[k] - mu) * (v[k] - mv); du += (u[k] - mu) ** 2; dv += (v[k] - mv) ** 2; }
            if (du > 0 && dv > 0) { sum += c / Math.sqrt(du * dv); n++; }
        }
        out.push(n ? Math.max(0, Math.min(1, 1 - sum / n)) : (out.at(-1) ?? 1));
    }
    return out;
}

/**
 * The body's fine response, measured as vibrato sweeps through it: for harmonics 2 to 24 of the steady part, each short frame gives the
 * harmonic's frequency and level; the level minus the harmonic's own mean is how much the body raised or lowered it at that frequency.
 * Returns flat [frequency Hz, deviation dB, ...]. The analysis window is the shortest that still resolves the harmonics (bins under a fifth
 * of the fundamental), so the level follows the sweep.
 */
export function bodyTrack(x, rate, onset, f0, from = 1.2, to = 3.4) {
    const n = 2 ** Math.ceil(Math.log2(5 * rate / f0)), hz = rate / n, tracks = new Map();
    for (let t = from; t < to; t += .01) {
        const start = Math.round((onset + t) * rate) - n / 2;
        if (start < 0 || start + n > x.length) break;
        const p = powerSpectrum(x, start, n);
        for (let h = 2; h <= 24 && h * f0 < 6000; h++) {
            const f = h * f0, tol = Math.min(.03, .35 / h), lo = Math.max(2, Math.round(f * (1 - tol) / hz)), hi = Math.min(p.length - 2, Math.round(f * (1 + tol) / hz));
            let k = lo; for (let i = lo; i <= hi; i++) if (p[i] > p[k]) k = i;
            if (k === lo || k === hi) continue;                                                     // no peak inside the window
            const a = Math.log(p[k - 1] + 1e-20), b = Math.log(p[k] + 1e-20), c = Math.log(p[k + 1] + 1e-20), shift = .5 * (a - c) / (a - 2 * b + c);
            if (!Number.isFinite(shift)) continue;
            if (!tracks.has(h)) tracks.set(h, []);
            tracks.get(h).push([(k + shift) * hz, dbPower(p[k])]);
        }
    }
    const out = [];
    for (const list of tracks.values()) {
        if (list.length < 40) continue;
        const mean = list.reduce((s, [, d]) => s + d, 0) / list.length;
        for (const [f, d] of list) out.push(Math.round(f), +(d - mean).toFixed(1));
    }
    return out;
}

/**
 * The bow noise of the first stretch of a note, by absolute frequency. Bow noise is much the same whatever the pitch (docs/STRING_MODEL.md),
 * so it is measured as a density over fixed third-octave bands: short-frame spectra over `from`..`to` seconds with every bin near a harmonic
 * left out, the mean power per bin of what remains. Returns dB per band (START_BANDS), null where too little is left to measure (low notes).
 */
/** The stretches over which the bow-noise bed is measured (s from the onset), the times between them where playback changes over, and half the width of each change. */
export const BED_WINDOWS = [[0, .04], [.04, .12], [.12, .3], [.3, .5], [.5, .8], [.8, 1.2], [1.2, 2.8]], BED_EDGES = [.04, .12, .3, .5, .8, 1.2], BED_FADES = [.008, .015, .03, .04, .06, .1];   // later stretches are short too: a plucked or short note falls 40 dB between .3 and 1 s, which one constant level per stretch cannot follow
export const START_FROM = 22, START_RATIO = 2 ** (1 / 3), START_BANDS = 25;      // 22 Hz to 6.6 kHz: the low bands hold a bin or none of the 23 Hz spectrum (null where none), the thump of the start lives there
export function startShapeOf(x, rate, onset, f0, from = 0, to = .12) {
    const N = 2048, hz = rate / N, sums = new Float64Array(START_BANDS), counts = new Float64Array(START_BANDS);
    for (let t = from; t < to; t += .01) {
        const start = Math.round((onset + t) * rate) - N / 2;
        if (start < 0 || start + N > x.length) break;
        const p = powerSpectrum(x, start, N), masked = new Uint8Array(p.length);
        for (let h = 1; h * f0 < 7000; h++) {
            const f = h * f0, w = Math.max(3 * hz, .012 * f + 2 * hz);
            for (let k = Math.max(0, Math.floor((f - w) / hz)); k <= Math.min(p.length - 1, Math.ceil((f + w) / hz)); k++) masked[k] = 1;
        }
        for (let k = 1; k < p.length; k++) {
            if (masked[k]) continue;
            const b = Math.floor(Math.log(k * hz / START_FROM) / Math.log(START_RATIO));
            if (b >= 0 && b < START_BANDS) { sums[b] += p[k]; counts[b]++; }
        }
    }
    return Array.from(sums, (s, b) => (counts[b] >= 3 ? dbPower(s / counts[b]) : null));
}

/**
 * How much of a harmonic sits beside its line: the mean power per bin 35-130 Hz either side of the line (leaving the peak's own +-2 bins) over the peak bin's
 * power, in dB averaged over harmonics 2 to 9 (a linear mean is dominated by the few harmonics that are momentarily all skirt), in a 2048-point frame centred `t` seconds after the onset. A plucked or short note starts with each
 * harmonic broad in frequency (the string is struck, not eased in) and narrowing to a line in 50-100 ms; the ratio is large for that flare and small for a line.
 */
export const SKIRT_TIMES = [.01, .03, .06, .1, .2, .3];
export function skirtRatio(x, rate, onset, f0, t) {
    const N = 2048, hz = rate / N, p = powerSpectrum(x, Math.round((onset + t) * rate) - N / 2, N); let sum = 0, count = 0;
    for (let h = 2; h <= 9 && h * f0 < 4500; h++) {
        const k = Math.round(h * f0 / hz); let peak = 0; for (let j = k - 2; j <= k + 2; j++) peak = Math.max(peak, p[j] ?? 0);
        let s = 0, c = 0; for (let j = Math.ceil(35 / hz) + 2; j <= Math.floor(130 / hz); j++) { s += (p[k + j] ?? 0) + (p[k - j] ?? 0); c += 2; }
        if (peak > 0 && c) { sum += 10 * Math.log10(s / c / peak + 1e-20); count++; }
    }
    return count ? sum / count : null;
}

const round = (v, digits = 1) => (v == null ? null : +v.toFixed(digits));

/**
 * Analyse one note. `mode` 'sustain' (a bowed note held to `release`) reads its steady part from 1.4 to 3.4 s after the
 * onset; 'decay' (a pluck or a fixed-length short note) reads the first 0.2 s. Returns
 * { f0, cents, total, cells: [[harmonic, tonal dB, noise dB]], vibrato, env, release, onset }.
 */
export function analyzeNote(x, rate, { midi, start, release = null, mode = 'sustain' }) {
    const onset = findOnset(x, rate, start - .05);
    if (onset == null || onset - start > .15) return null;   // nothing sounded for this note (a pitch outside the instrument's range)
    const nominal = 440 * 2 ** ((midi - 69) / 12), n = mode === 'sustain' ? 16384 : 8192;
    const frames = mode === 'sustain'
        ? [1.4, 1.9, 2.4, 2.9].map((t) => Math.round((onset + t) * rate) - n / 2)
        : [.004, .05].map((t) => Math.round((onset + t) * rate));
    if (frames.some((f) => f < 0 || f + n > x.length)) return null;
    const p = averagedSpectrum(x, frames, n), f0 = refineFundamental(p, rate, n, findFundamental(p, rate, n, nominal, { harmonics: 6 }));
    const cells = harmonicCells(p, rate, n, f0, 12000, mode === 'decay' ? 3 : 0), reference = bandPowers(p, rate, n);
    const total = dbPower(reference.reduce((s, v) => s + v, 0));
    // Bands holding nothing within 45 dB of the whole have no envelope worth keeping (relative to nothing it reads +20 dB at the attack).
    const envelopes = bandEnvelopes(x, rate, onset, ENV_TIMES, reference).map((row, b) => (dbPower(reference[b]) < total - 45 ? null : row.map((v) => round(v))));
    const out = { pitch: midi, f0: round(f0, 3), cents: round(1200 * Math.log2(f0 / nominal)), total: round(total), onset: round(onset - start, 3), cells: cells.map(([h, t, nz]) => [h, round(t), round(nz)]), env: envelopes };
    if (mode === 'sustain') {
        const track = pitchTrack(x, rate, onset, f0, .3, 3.6), v = vibratoOf(track);
        out.vibrato = { rate: round(v.rate, 2), depths: v.depths.map((d) => round(d)) };
        out.onsetNoise = onsetNoiseOf(x, rate, onset, f0).map((v) => round(v, 2));
        out.bodyPairs = bodyTrack(x, rate, onset, f0);
        const w = wanderOf(x, rate, onset, f0, v.rate);
        if (w) out.wander = { cents: w.cents.map((c) => round(c)), db: w.db.map((c) => round(c)) };
        if (release != null) {
            const before = [-.35, -.25, -.15].map((t) => Math.round((release + t + (onset - start)) * rate) - 512);
            const ref = new Float64Array(BAND_EDGES.length - 1);
            for (const from of before) { const q = bandPowers(powerSpectrum(x, from, 1024), rate, 1024); for (let b = 0; b < ref.length; b++) ref[b] += q[b] / before.length; }
            out.release = bandEnvelopes(x, rate, release + (onset - start), RELEASE_TIMES, ref).map((row, b) => (dbPower(ref[b]) < total - 45 ? null : row.map((v) => round(v))));
        }
    }
    return out;
}
