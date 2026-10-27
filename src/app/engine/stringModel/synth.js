// Playing a measured string note (docs/STRING_MODEL.md): harmonics at the dB levels `modelFor` gives, moved by the
// vibrato that was measured, shaped in time by the measured band envelopes, with the between-harmonic noise added.
// A bowed note comes back as an attack followed by a seamless loop (loop length = a whole number of vibrato cycles
// and of fundamental periods, so every harmonic and the vibrato close on themselves) plus a release curve; a pluck or
// a fixed-length short note comes back as one buffer.
import { fft } from '../pianoModel/dsp.js';
import { BAND_EDGES, SKIRT_TIMES } from './analysis.js';

const BAND_CENTRES = BAND_EDGES.slice(0, -1).map((lo, b) => (b === 0 ? 125 : Math.sqrt(lo * (BAND_EDGES[b + 1] === Infinity ? lo * 2 : BAND_EDGES[b + 1]))));
/** How much of the tone's spectral slope the starting transient's noise keeps (0 = white across the harmonics, 1 = the tone's own envelope). */
const BURST_FLAT = 1;
/** The starting transient is full strength to this time and gone by the next (s): the measured curve's tail is within the measurement's error, and a tail of noise is heard as hiss. */
const BURST_FULL = .04, BURST_END = .12;
const STEP = .01, ATTACK = 1.8;                  // the bands settle within about 1.5 s, the vibrato by 1.8
/** A raised-cosine fade-in over the first `seconds`: a note that begins at full level on its first sample is heard as a click (a blip). */
export function fadeIn(buffer, sampleRate, seconds = .004) {
    const n = Math.min(buffer.length, Math.max(1, Math.round(seconds * sampleRate)));
    for (let i = 0; i < n; i++) buffer[i] *= .5 - .5 * Math.cos(Math.PI * i / n);
    return buffer;
}
/**
 * The phase of each harmonic (the note is a sum of sin(n theta + phi)). A bowed string slips once a period, which puts all the
 * harmonics in phase at that instant; the body then rings, which is a delay that varies with frequency. `mode` 'random' (a smooth,
 * low-crest wave, what the model first had), 'pulse' (all in phase: an impulse train with the measured spectrum) or 'minimum' (the pulse
 * through the minimum-phase filter that has the measured harmonic levels: the ringing a body with those peaks would add).
 */
export function harmonicPhases(model, harmonics, sampleRate, rnd, mode = 'random') {
    if (mode === 'pulse') return harmonics.map(() => Math.PI / 2);                       // cos(n theta) = sin(n theta + pi/2)
    if (mode !== 'minimum') return harmonics.map(() => 2 * Math.PI * rnd());
    // log magnitude on a dense grid by linear interpolation between the harmonics (in dB), then the minimum phase by the folded cepstrum
    const size = 16384, half = size / 2, re = new Float64Array(size), im = new Float64Array(size), hz = sampleRate / size;
    const db = (n) => model.tonal[n - 1] / 2;                                           // dB power -> amplitude dB for the log of the magnitude below
    for (let k = 0; k <= half; k++) {
        const f = k * hz, pos = f / model.f0;
        let a;
        if (pos <= 1) a = db(1); else {
            const n0 = Math.min(Math.floor(pos), model.tonal.length - 1), n1 = Math.min(n0 + 1, model.tonal.length), u = pos - n0;
            a = n0 >= model.tonal.length ? db(model.tonal.length) - 40 : db(n0) * (1 - u) + db(n1) * u;
        }
        re[k] = a * Math.LN10 / 10;                                                      // ln of the amplitude (dB amplitude / 20 * ln 10, with the /2 above)
        if (k > 0 && k < half) re[size - k] = re[k];
    }
    fft(re, im);                                                                         // real cepstrum (times size; symmetric input so real)
    const c = Float64Array.from(re, (v) => v / size), fold = new Float64Array(size), zero = new Float64Array(size);
    fold[0] = c[0]; for (let n = 1; n < half; n++) fold[n] = 2 * c[n]; fold[half] = c[half];
    fft(fold, zero);                                                                     // log of the minimum-phase spectrum: imag = phase
    return harmonics.map((n) => {
        const k = Math.min(half, Math.round(n * model.f0 / hz));
        return Math.PI / 2 + zero[k];
    });
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function random(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

/** Linear interpolation of `values` at `times` read at t; holds the ends. */
function interpolate(times, values, t) {
    if (t <= times[0]) return values[0];
    for (let i = 1; i < times.length; i++) if (t <= times[i]) { const u = (t - times[i - 1]) / (times[i] - times[i - 1]); return values[i - 1] * (1 - u) + values[i] * u; }
    return values[values.length - 1];
}

/** Band envelope rows on the 10 ms control grid, a missing band taking its nearest neighbour's; `hold` freezes it after that time. */
function envelopeGrid(allRows, times, seconds, hold = Infinity) {
    // A band that holds almost nothing in the steady state (the low band of a high note) reads +20 dB at the bow's first
    // touch against that nothing; no real band swells by more than a few dB over its steady level, so such rows are dropped.
    const rows = allRows.map((row) => (row && Math.max(...row.map((v) => v ?? -90)) > 12 ? null : row));
    const steps = Math.ceil(seconds / STEP) + 2, filled = rows.map((row, b) => row ?? rows.slice(b + 1).find(Boolean) ?? [...rows.slice(0, b)].reverse().find(Boolean) ?? times.map(() => 0));
    return filled.map((row) => Float64Array.from({ length: steps }, (_, j) => interpolate(times, row.map((v) => v ?? -90), Math.min(hold, j * STEP))));
}

/** Where a frequency sits between band centres (log-spaced): the two bands and the weight of the upper. */
function bandMix(f) {
    const lf = Math.log(f);
    if (f <= BAND_CENTRES[0]) return [0, 0, 0];
    for (let b = 1; b < BAND_CENTRES.length; b++) if (f <= BAND_CENTRES[b]) return [b - 1, b, (lf - Math.log(BAND_CENTRES[b - 1])) / (Math.log(BAND_CENTRES[b]) - Math.log(BAND_CENTRES[b - 1]))];
    return [BAND_CENTRES.length - 1, BAND_CENTRES.length - 1, 0];
}

const nearestBand = (f) => { const [lo, hi, u] = bandMix(f); return u < .5 ? lo : hi; };

/** Gain curves (linear, one per control step) of each harmonic and of the noise. */
function gainCurves(model, grid, seconds, floorDb) {
    const harmonics = [], top = Math.max(...model.tonal);
    model.tonal.forEach((db, k) => { if (db > top - floorDb) harmonics.push(k + 1); });
    const gains = harmonics.map((n) => {
        const [lo, hi, u] = bandMix(n * model.f0), out = new Float32Array(grid[0].length);
        for (let j = 0; j < out.length; j++) out[j] = 10 ** ((grid[lo][j] * (1 - u) + grid[hi][j] * u) / 20);
        return out;
    });
    // noise follows the band envelopes weighted by how much noise each band holds
    const bandNoise = BAND_CENTRES.map(() => 0);
    model.noise.forEach((db, k) => { bandNoise[nearestBand((k + 1) * model.f0)] += 10 ** (db / 10); });
    if (model.lowNoise != null) bandNoise[nearestBand(.25 * model.f0)] += 10 ** (model.lowNoise / 10);
    const total = bandNoise.reduce((s, v) => s + v, 0) || 1, noiseGain = new Float32Array(grid[0].length);
    for (let j = 0; j < noiseGain.length; j++) { let g = 0; bandNoise.forEach((p, b) => { g += (p / total) * 10 ** (grid[b][j] / 20); }); noiseGain[j] = g; }
    return { harmonics, gains, noiseGain };
}

/**
 * Noise concentrated round one harmonic: `size` samples (a power of two) of unit-variance noise whose spectrum is a Gaussian lobe of standard
 * deviation `sigma` Hz centred on `centre` Hz, random phases. Read once through from the note's start (it is not a loop).
 */
function lobeNoise(centre, sigma, size, sampleRate, random) {
    const re = new Float64Array(size), im = new Float64Array(size), hz = sampleRate / size, weights = new Float64Array(size / 2);
    let total = 0;
    for (let b = 1; b < size / 2; b++) { const d = (b * hz - centre) / sigma; weights[b] = d * d < 18 ? Math.exp(-.5 * d * d) : 0; total += weights[b]; }
    for (let b = 1; b < size / 2; b++) { if (!weights[b]) continue; const amp = Math.sqrt(2 * weights[b] / total), ph = 2 * Math.PI * random(); re[b] = amp * Math.cos(ph); im[b] = -amp * Math.sin(ph); }
    fft(re, im);
    return Float32Array.from(re);
}

/**
 * The flare at the start of a note: each harmonic starts broad in frequency and narrows to a line (skirtRatio). The line gives up a share n(t) of its
 * power (model.skirt.n at SKIRT_TIMES, falling to nothing by 0.45 s) to noise in a lobe round its frequency, which carries the same envelope as the line.
 * Changes `gains` (the lines'); returns what to add: [{ buffer, gain }] per harmonic.
 */
const FLARE_SIGMA = 60, FLARE_END = .45;
function flare(model, harmonics, gains, sampleRate, random) {
    if (!model.skirt || !((model.flare ?? 1) > 0)) return [];
    const times = [...SKIRT_TIMES, FLARE_END], n = [...model.skirt.n, 0], scale = model.flare ?? 1, steps = gains[0].length;
    const share = Float32Array.from({ length: steps }, (_, j) => clamp(scale * interpolate(times, n, j * STEP), 0, .98));
    const size = 2 ** Math.ceil(Math.log2(FLARE_END * 1.6 * sampleRate)), out = [];
    harmonics.forEach((k, h) => {
        if (k * model.f0 > 4500) return;
        const gain = new Float32Array(steps), power = Math.sqrt(10 ** (model.tonal[k - 1] / 10));
        for (let j = 0; j < steps; j++) { gain[j] = power * gains[h][j] * Math.sqrt(share[j]); gains[h][j] *= Math.sqrt(1 - share[j]); }
        out.push({ buffer: lobeNoise(k * model.f0, FLARE_SIGMA, size, sampleRate, random), gain });
    });
    return out;
}

/**
 * A period of the bow-noise bed for one stretch of time: noise whose density over absolute frequency is `levels` (dB per analysis bin, one per
 * third-octave band from bed.from; analysis.js startShapeOf measures it as the power per 2048-point bin, so the variance per Hz is that over
 * rate / 2048). Bow noise is much the same whatever the pitch, so the bed is a smooth continuum rather than a plateau round each harmonic.
 * Below the first band it falls 6 dB/octave, above the last 12; a band with no measurement (null) counts as silent.
 */
function bedNoise(levels, bed, period, size, sampleRate, random) {
    const re = new Float64Array(size), im = new Float64Array(size), n = levels.length, binHz = sampleRate / 2048, lr = Math.log(bed.ratio), octave = Math.log2(bed.ratio);
    // a band with nothing measured (a third of an octave can hold no bin of the 23 Hz spectrum at the bottom) takes the line between its neighbours
    const filled = levels.map((v, k) => {
        if (v != null) return v;
        let a = k - 1, b = k + 1; while (a >= 0 && levels[a] == null) a--; while (b < n && levels[b] == null) b++;
        return a < 0 && b >= n ? -200 : a < 0 ? levels[b] : b >= n ? levels[a] : levels[a] + (levels[b] - levels[a]) * (k - a) / (b - a);
    });
    const at = (k) => filled[clamp(k, 0, n - 1)];
    for (let b = 1; b < size / 2; b++) {
        const f = b / period, pos = Math.log(f / bed.from) / lr - .5, i = Math.floor(pos), u = pos - i;
        const db = i < 0 ? at(0) + 6 * pos * octave : i >= n - 1 ? at(n - 1) - 12 * (pos - (n - 1)) * octave : at(i) * (1 - u) + at(i + 1) * u;
        const amp = Math.sqrt(2 * 10 ** (db / 10) / binHz / period), ph = 2 * Math.PI * random();
        re[b] = amp * Math.cos(ph); im[b] = -amp * Math.sin(ph);
    }
    fft(re, im);
    return Float32Array.from(re);
}

/**
 * A period of shaped noise as `size` samples: bin k stands for k / period Hz, with the power of the model's noise cells,
 * random phases. Reading it with period `period` seconds gives noise that repeats seamlessly.
 */
function periodicNoise(model, period, size, random, bands = []) {
    const re = new Float64Array(size), im = new Float64Array(size);
    model.noise.forEach((db, k) => {
        const lo = Math.max(1, Math.round((k + .5) * model.f0 * period)), hi = Math.min(size / 2, Math.round((k + 1.5) * model.f0 * period)), m = hi - lo;
        if (m < 1) return;
        const amp = Math.sqrt(2 * 10 ** (db / 10) / m);
        for (let b = lo; b < hi; b++) { const ph = 2 * Math.PI * random(); re[b] = amp * Math.cos(ph); im[b] = -amp * Math.sin(ph); }
    });
    if (model.lowNoise != null) {                                              // below half the fundamental: the note's thump
        const hi = Math.min(size / 2, Math.round(.5 * model.f0 * period)), m = hi - 1;
        if (m >= 1) { const amp = Math.sqrt(2 * 10 ** (model.lowNoise / 10) / m); for (let b = 1; b < hi; b++) { const ph = 2 * Math.PI * random(); re[b] += amp * Math.cos(ph); im[b] -= amp * Math.sin(ph); } }
    }
    // bands of noise at fixed frequencies (about the mean pitch of a harmonic), added to the cells' noise
    for (const { f, power, width } of bands) {
        const lo = Math.max(1, Math.round((f - width) * period)), hi = Math.min(size / 2, Math.max(lo + 1, Math.round((f + width) * period))), amp = Math.sqrt(2 * power / (hi - lo));
        for (let b = lo; b < hi; b++) { const ph = 2 * Math.PI * random(); re[b] += amp * Math.cos(ph); im[b] -= amp * Math.sin(ph); }
    }
    fft(re, im);
    return Float32Array.from(re);
}

const cubic = (x, i, t) => {
    const n = x.length, a = x[(i - 1 + n) % n], b = x[i % n], c = x[(i + 1) % n], d = x[(i + 2) % n];
    return b + .5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
};

/**
 * Adds the bow-noise bed to `out`: one noise per measured stretch (bedNoise, repeating every `period` seconds), each held for its own stretch and
 * crossfaded in power across the short change-over at each edge between stretches (a crossfade from centre to centre would smear the loud first
 * stretch into the next). `at(t)` is where in the noise's `size` samples time t reads.
 */
function addBed(out, model, sampleRate, period, size, rnd, at) {
    const { edges, fades, db } = model.bed, offset = model.bedDb ?? 0, buffers = db.map((levels) => bedNoise(levels.map((v) => (v == null ? null : v + offset)), model.bed, period, size, sampleRate, rnd));
    for (let i = 0; i < out.length; i++) {
        const t = i / sampleRate, x = at(t), xi = Math.floor(x);
        let w = 0; while (w < edges.length && t >= edges[w] + fades[w]) w++;
        if (w < edges.length && t > edges[w] - fades[w]) {
            const u = (t - edges[w] + fades[w]) / (2 * fades[w]);
            out[i] += cubic(buffers[w], xi, x - xi) * Math.cos(Math.PI * u / 2) + cubic(buffers[w + 1], xi, x - xi) * Math.sin(Math.PI * u / 2);
        } else out[i] += cubic(buffers[w], xi, x - xi);
    }
}

/** The loop geometry: m fundamental periods and k vibrato cycles in L seconds, the vibrato rate as close as it can be to `rate`. */
export function loopFor(f0, rate = 5.3) {
    let best = null;
    for (let k = 4; k <= 9; k++) {
        const m = Math.max(1, Math.round(f0 * k / rate)), L = m / f0, r = k / L, miss = Math.abs(Math.log(r / rate)) + (L < 1 ? 1 : 0) + (L > 2.4 ? 1 : 0);
        if (!best || miss < best.miss) best = { k, m, L, rate: r, miss };
    }
    return best;
}

/**
 * A harmonic's level fluctuates when part of it is noise: a steady tone reads 0 dB, Rayleigh noise about 5.6 dB, and a tone
 * with noise in between (Rician fading). From that spread (dB) the share of the harmonic's power that is a coherent tone.
 */
const FADING = [[0, 1], [.19, .999], [.61, .99], [1.1, .97], [1.56, .94], [2.26, .89], [3.26, .8], [4.32, .67], [5.09, .5], [5.5, .24], [5.6, 0]];
export function toneFraction(std) {
    if (!(std > 0)) return 1;
    for (let i = 1; i < FADING.length; i++) if (std <= FADING[i][0]) { const u = (std - FADING[i - 1][0]) / (FADING[i][0] - FADING[i - 1][0]); return FADING[i - 1][1] * (1 - u) + FADING[i][1] * u; }
    return 0;
}

/** The level spread (dB) at frequency f: linear in log frequency between the table's measured bins, falling to nothing below the first. */
function spreadAt(wander, f) {
    const { freqs, db } = wander;
    if (f <= freqs[0]) return db[0] * f / freqs[0];
    for (let i = 1; i < freqs.length; i++) if (f <= freqs[i]) { const u = Math.log(f / freqs[i - 1]) / Math.log(freqs[i] / freqs[i - 1]); return db[i - 1] * (1 - u) + db[i] * u; }
    return db.at(-1);
}

/**
 * The wake of a moving tone. A sound whose frequency sweeps (vibrato) through a body or a room leaves the frequencies it has
 * passed through still ringing, a band over the span of the sweep that exists only once the vibrato does. It is made by an
 * impulse response: the direct sound plus a decaying noise tail (T60 `tau` seconds) whose power, at `fullHz` and above, is `gainDb`
 * relative to the direct sound, fading to nothing by `startHz` (the sweep is a fixed number of cents, so it is wider in Hz higher up
 * and low notes leave almost no wake). Built in the frequency domain so that the level of each frequency is kept on average.
 */
export function wakeImpulse(gainDb, tau, sampleRate, random, { startHz = 500, fullHz = 2500 } = {}) {
    const length = Math.max(16, Math.round(tau * sampleRate)), size = 2 ** Math.ceil(Math.log2(length * 2)), tail = new Float64Array(size), im = new Float64Array(size);
    let energy = 0;
    for (let i = 0; i < length; i++) { const v = (random() * 2 - 1) * Math.exp(-6.9 * i / (tau * sampleRate)); tail[i] = v; energy += v * v; }
    for (let i = 0; i < length; i++) tail[i] /= Math.sqrt(energy);                      // unit energy: a flat power of 1 per frequency on average
    fft(tail, im);
    const G = 10 ** (gainDb / 10), re = new Float64Array(size), ii = new Float64Array(size);
    for (let k = 0; k <= size / 2; k++) {
        const f = k * sampleRate / size, w = f <= startHz ? 0 : f >= fullHz ? 1 : Math.log(f / startHz) / Math.log(fullHz / startHz), g = Math.sqrt(G) * w, norm = 1 / Math.sqrt(1 + g * g);
        re[k] = norm * (1 + g * tail[k]); ii[k] = norm * g * im[k];
        if (k > 0 && k < size / 2) { re[size - k] = re[k]; ii[size - k] = -ii[k]; }
    }
    // inverse transform (the spectrum is conjugate-symmetric, so the result is real)
    for (let k = 0; k < size; k++) ii[k] = -ii[k];
    fft(re, ii);
    // A level curve with no phase is a symmetric (non-causal) filter, half of which wraps round to the end of the transform and would
    // play as an echo about size / rate seconds after the note starts. Keep the causal half only (the tail is shorter than that).
    return Float32Array.from({ length: size / 2 }, (_, i) => re[i] / size);
}

/** x convolved with h by FFT, to the length of x. */
export function convolve(x, h) {
    const size = 2 ** Math.ceil(Math.log2(x.length + h.length)), ar = new Float64Array(size), ai = new Float64Array(size), br = new Float64Array(size), bi = new Float64Array(size);
    ar.set(x); br.set(h);
    fft(ar, ai); fft(br, bi);
    for (let k = 0; k < size; k++) { const r = ar[k] * br[k] - ai[k] * bi[k]; ai[k] = -(ar[k] * bi[k] + ai[k] * br[k]); ar[k] = r; }   // conjugate for the inverse transform
    fft(ar, ai);
    return Float32Array.from({ length: x.length }, (_, i) => ar[i] / size);
}

/**
 * A bowed note: { buffer, loopStart, loopEnd, attack } in seconds. Everything before `loopStart` is the attack and settling;
 * from there the buffer repeats seamlessly. The note-off gain curve is `releaseCurve(model)`.
 */
export function renderSustained(model, sampleRate, { seed = 1, floorDb = 70 } = {}) {
    const rnd = random(seed), vib = model.vibrato ?? { rate: 5.3, depths: [0, 0, 0] }, geometry = loopFor(model.f0, vib.rate);
    const wake = model.wake && model.wake.gainDb > -40 ? model.wake : null, periods = wake ? 2 : 1;    // a wake needs a steady period before the loop it is taken from
    const seconds = ATTACK + periods * geometry.L, count = Math.ceil(seconds * sampleRate), grid = envelopeGrid(model.env, model.envTimes, seconds, ATTACK);
    const { harmonics, gains, noiseGain } = gainCurves(model, grid, seconds, floorDb);
    const phi = harmonicPhases(model, harmonics, sampleRate, rnd, model.phase);
    // Part of each harmonic is not a steady tone but noise about it (bow noise): narrowband noise centred on the harmonic, which
    // follows the vibrato with it. The share comes from how much the harmonic's level fluctuates (toneFraction); `smear` scales the spread.
    const spread = model.wander ? harmonics.map((n) => spreadAt(model.wander, n * model.f0) * (model.smear ?? 1)) : harmonics.map(() => 0);
    const tone = spread.map(toneFraction), amps = harmonics.map((n, h) => Math.sqrt(2 * 10 ** (model.tonal[n - 1] / 10) * tone[h]));
    // That noise is not on the moving harmonic: it stays at the frequency the harmonic has on average, as a resonance the
    // harmonic's vibrato sweeps through would, so it is added to the loop's (fixed-frequency) noise below.
    const bands = harmonics.map((n, h) => ({ f: n * model.f0, power: 10 ** (model.tonal[n - 1] / 10) * (1 - tone[h]), width: model.lineWidth ?? 50 })).filter((b) => b.power > 0);
    // The starting transient: for the first ~200 ms part of the sound is not a repeat of the last period (the bow has not settled into
    // its regular motion), measured as the share n(t). The tone gives that share up and a burst of noise with the same spectral envelope
    // (the harmonics' own power per cell) carries it, so the total follows the measured band envelopes as before.
    const onset = model.startNoise && (model.onsetScale ?? 1) > 0 ? model.startNoise : null, onsetScale = model.onsetScale ?? 1;
    const share = (t) => {
        if (!onset || t >= BURST_END) return 0;
        const x = t / onset.step, i = Math.floor(x), taper = t <= BURST_FULL ? 1 : .5 + .5 * Math.cos(Math.PI * (t - BURST_FULL) / (BURST_END - BURST_FULL));
        return Math.min(1, onsetScale * taper * (onset.n[i] * (1 - (x - i)) + onset.n[i + 1] * (x - i)));
    };
    const steps = grid[0].length;
    let burstGain = null;
    if (onset) {
        const power = harmonics.map((n) => 10 ** (model.tonal[n - 1] / 10)), total = power.reduce((s, v) => s + v, 0);
        burstGain = new Float32Array(steps);
        for (let j = 0; j < steps; j++) {
            const n = share(j * STEP); let rmsGain = 0;
            for (let h = 0; h < harmonics.length; h++) { const g = gains[h][j]; rmsGain += power[h] * g * g; gains[h][j] = g * Math.sqrt(1 - n); }
            burstGain[j] = Math.sqrt(n * rmsGain / total);
        }
    }
    // vibrato depth over the first seconds: none at the onset, then the depths measured in five stretches (centred .5, .9, 1.35 and 2.1 s), steady from ATTACK
    const depths = vib.depths.length >= 5 ? vib.depths : [vib.depths[0], vib.depths[0], vib.depths[1], vib.depths[2], vib.depths[2]];
    const depthAt = (t) => interpolate([0, .3, .5, .9, 1.35, ATTACK], [0, depths[0] * .6, depths[0], depths[1], depths[2], (depths[3] + depths[4]) / 2], t);
    const freqAt = (t, phase) => model.f0 * 2 ** (depthAt(t) * Math.sin(phase) / 1200);
    // scale the pitch so the loop holds exactly m periods
    const sub = 2, dt = 1 / (sampleRate * sub), startPhase = Math.PI;
    let cycles = 0;
    for (let t = ATTACK; t < ATTACK + geometry.L; t += dt) cycles += freqAt(t, startPhase + 2 * Math.PI * geometry.rate * t) * dt;
    // Vibrato sweeps each harmonic through the body's resonances (measured as `body`), so its level rises and falls with the vibrato: a pure
    // frequency sweep sounds synthetic, the level change is what makes it sound played. The static level is the mean over the sweep.
    if (model.body && (model.shimmer ?? 1) > 0) {
        const { from, ratio, quarterDb } = model.body, lnr = Math.log(ratio), at = (f) => { const x = Math.log(f / from) / lnr, i = Math.floor(x); return i < 0 || i >= quarterDb.length - 1 ? 0 : (quarterDb[i] * (1 - (x - i)) + quarterDb[i + 1] * (x - i)) / 4; };
        const steps = grid[0].length, cycleSamples = 32;
        harmonics.forEach((n, h) => {
            if (n < 2) return;
            let mean = 0;
            for (let q = 0; q < cycleSamples; q++) { const t = ATTACK + geometry.L * q / cycleSamples; mean += at(n * freqAt(t, startPhase + 2 * Math.PI * geometry.rate * t)) / cycleSamples; }
            for (let j = 0; j < steps; j++) { const t = j * STEP; gains[h][j] *= 10 ** ((at(n * freqAt(t, startPhase + 2 * Math.PI * geometry.rate * t)) - mean) * (model.shimmer ?? 1) / 20); }
        });
    }
    const kappa = geometry.m / cycles, out = new Float32Array(count);
    // sin and cos of every harmonic's phase from those of the fundamental by the Chebyshev recurrence, rather than a sine each
    const top = Math.max(...harmonics), at = new Int32Array(top + 1).fill(-1), cosPhi = phi.map(Math.cos), sinPhi = phi.map(Math.sin);
    harmonics.forEach((n, h) => { at[n] = h; });
    let theta = 0;
    for (let i = 0; i < count; i++) {
        const t = i / sampleRate, j = t / STEP, j0 = Math.min(grid[0].length - 2, Math.floor(j)), u = j - j0;
        const c = Math.cos(theta), two = 2 * c;
        let sPrev = 0, sCur = Math.sin(theta), cPrev = 1, cCur = c, sum = 0;
        for (let n = 1; n <= top; n++) {
            const h = at[n];
            if (h >= 0) {
                sum += amps[h] * (sCur * cosPhi[h] + cCur * sinPhi[h]) * (gains[h][j0] * (1 - u) + gains[h][j0 + 1] * u);
            }
            const sNext = two * sCur - sPrev, cNext = two * cCur - cPrev;
            sPrev = sCur; sCur = sNext; cPrev = cCur; cCur = cNext;
        }
        out[i] = sum;
        for (let q = 0; q < sub; q++) { const tt = t + q * dt; theta += 2 * Math.PI * kappa * freqAt(tt, startPhase + 2 * Math.PI * geometry.rate * tt) * dt; }
    }
    // the noise: one period of shaped noise read at the loop period, scaled by the broadband envelope
    const size = 2 ** Math.ceil(Math.log2(geometry.L * sampleRate * 1.25)), period = periodicNoise(model, geometry.L, size, rnd, bands);
    if (burstGain && !model.bed && model.burst !== false) {
        // The burst's spectrum is the harmonics' envelope flattened (its dB scaled by BURST_FLAT, same total power): noise as low-passed as the tone
        // is still correlated from one period to the next and would read as partly periodic.
        const flat = Array.from(model.tonal, (d) => d * BURST_FLAT), have = flat.reduce((a, d) => a + 10 ** (d / 10), 0), want = Array.from(model.tonal).reduce((a, d) => a + 10 ** (d / 10), 0), lift = 10 * Math.log10(want / have);
        const burst = periodicNoise({ f0: model.f0, noise: flat.map((d) => d + lift) }, geometry.L, size, rnd);
        for (let i = 0; i < count; i++) {
            const t = i / sampleRate, j = t / STEP, j0 = Math.min(burstGain.length - 2, Math.floor(j)), u = j - j0, g = burstGain[j0] * (1 - u) + burstGain[j0 + 1] * u;
            if (g < 1e-6) { if (t > BURST_END + .02) break; continue; }
            const x = ((t % geometry.L) / geometry.L) * size;
            out[i] += cubic(burst, Math.floor(x), x - Math.floor(x)) * g;
        }
    }
    if (model.bed) addBed(out, model, sampleRate, geometry.L, size, rnd, (t) => ((t % geometry.L) / geometry.L) * size);
    for (let i = 0; i < count; i++) {
        const t = i / sampleRate, j = t / STEP, j0 = Math.min(grid[0].length - 2, Math.floor(j)), u = j - j0, x = ((t % geometry.L) / geometry.L) * size;
        out[i] += cubic(period, Math.floor(x), x - Math.floor(x)) * (noiseGain[j0] * (1 - u) + noiseGain[j0 + 1] * u);
    }
    if (wake) {
        const wet = fadeIn(convolve(out, wakeImpulse(wake.gainDb, wake.tau, sampleRate, rnd)), sampleRate, .006);
        return { buffer: wet, loopStart: ATTACK + geometry.L, loopEnd: ATTACK + 2 * geometry.L, attack: ATTACK + geometry.L, loop: geometry };
    }
    return { buffer: fadeIn(out, sampleRate, .006), loopStart: ATTACK, loopEnd: ATTACK + geometry.L, attack: ATTACK, loop: geometry };
}

/** A fixed-length note (a pluck or a short bow): one buffer of `seconds`, ending in a fade. */
export function renderDecay(model, sampleRate, { seed = 1, floorDb = 70, seconds = 4 } = {}) {
    const rnd = random(seed), count = Math.ceil(seconds * sampleRate), grid = envelopeGrid(model.env, model.envTimes, seconds);
    // The cells were measured as the average spectrum over the first 0.2 s (two Hann windows of 170 ms, from 4 ms and 50 ms), so each
    // band's envelope must have that same average power over that stretch, or a note that falls away fast comes out under what was measured.
    const weight = (t, from) => { const u = (t - from) / .1707; return u > 0 && u < 1 ? .5 - .5 * Math.cos(2 * Math.PI * u) : 0; };
    for (const row of grid) {
        let num = 0, den = 0;
        for (let j = 0; j < row.length; j++) { const t = j * STEP, w = weight(t, .004) + weight(t, .05); num += w * 10 ** (row[j] / 10); den += w; }
        const shift = den > 0 && num > 0 ? 10 * Math.log10(num / den) : 0;
        if (Math.abs(shift) < 20) for (let j = 0; j < row.length; j++) row[j] -= shift;
    }
    const { harmonics, gains, noiseGain } = gainCurves(model, grid, seconds, floorDb);
    const flares = flare(model, harmonics, gains, sampleRate, rnd);
    const out = new Float32Array(count), phi = harmonicPhases(model, harmonics, sampleRate, rnd, model.phase), amps = harmonics.map((n) => Math.sqrt(2 * 10 ** (model.tonal[n - 1] / 10)));
    const top = Math.max(...harmonics), at = new Int32Array(top + 1).fill(-1), cosPhi = phi.map(Math.cos), sinPhi = phi.map(Math.sin);
    harmonics.forEach((n, h) => { at[n] = h; });
    for (let i = 0; i < count; i++) {
        const j = i / sampleRate / STEP, j0 = Math.min(grid[0].length - 2, Math.floor(j)), u = j - j0, theta = 2 * Math.PI * model.f0 * i / sampleRate, c = Math.cos(theta), two = 2 * c;
        let sPrev = 0, sCur = Math.sin(theta), cPrev = 1, cCur = c, sum = 0;
        for (let n = 1; n <= top; n++) {
            const h = at[n];
            if (h >= 0) sum += amps[h] * (gains[h][j0] * (1 - u) + gains[h][j0 + 1] * u) * (sCur * cosPhi[h] + cCur * sinPhi[h]);
            const sNext = two * sCur - sPrev, cNext = two * cCur - cPrev;
            sPrev = sCur; sCur = sNext; cPrev = cCur; cCur = cNext;
        }
        out[i] = sum;
    }
    // the noise of a struck note is mostly in its first tens of ms (a burst, then the lines ring on alone): the cell noise falls fast to a floor of 20% in amplitude
    if (model.noiseTau > 0) for (let j = 0; j < noiseGain.length; j++) noiseGain[j] *= .2 + .8 * Math.exp(-j * STEP / model.noiseTau);
    for (const { buffer, gain } of flares) {
        const end = Math.min(count, buffer.length, Math.round((FLARE_END + .02) * sampleRate));
        for (let i = 0; i < end; i++) { const j = i / sampleRate / STEP, j0 = Math.min(gain.length - 2, Math.floor(j)), u = j - j0; out[i] += buffer[i] * (gain[j0] * (1 - u) + gain[j0 + 1] * u); }
    }
    const size = 2 ** Math.ceil(Math.log2(seconds * sampleRate)), noise = periodicNoise(model, seconds, size, rnd);
    for (let i = 0; i < count; i++) {
        const j = i / sampleRate / STEP, j0 = Math.min(grid[0].length - 2, Math.floor(j)), u = j - j0, x = i * size / count;
        out[i] += cubic(noise, Math.floor(x), x - Math.floor(x)) * (noiseGain[j0] * (1 - u) + noiseGain[j0 + 1] * u);
    }
    if (model.bed) addBed(out, model, sampleRate, seconds, size, rnd, (t) => t * sampleRate * size / count);
    // the burst at the start excites the body, which keeps ringing at its own frequencies: the same resonant tail as a bowed note's wake
    const wake = model.wake && model.wake.gainDb > -40 ? model.wake : null, wet = wake ? convolve(out, wakeImpulse(wake.gainDb, wake.tau, sampleRate, rnd)) : out;
    const fade = Math.round(.15 * sampleRate);
    for (let i = 0; i < fade; i++) wet[count - 1 - i] *= i / fade;
    return { buffer: fadeIn(wet, sampleRate, .004) };
}

/** The gain after a note-off as { times, gains }: the measured release averaged over the bands, weighted by how much power each holds. */
export function releaseCurve(model) {
    const times = model.releaseTimes, power = BAND_CENTRES.map(() => 0);
    model.tonal.forEach((db, k) => { power[nearestBand((k + 1) * model.f0)] += 10 ** (db / 10); });
    const total = power.reduce((s, v) => s + v, 0) || 1;
    const gains = times.map((_, i) => {
        let g = 0, w = 0;
        (model.release ?? []).forEach((row, b) => { if (row && row[i] != null) { g += power[b] / total * 10 ** (row[i] / 20); w += power[b] / total; } });
        return w > 0 ? g / w : Math.exp(-times[i] / .15);
    });
    // The first value is the band powers at the instant of key-up against their average over the 0.35 s before, which is 0.5 to 1.25 in the measurements (the level
    // wanders); played as it is, the sound steps by that much at key-up, a broadband click now that the bed carries noise in every band. Start from 1.
    const start = gains[0] > 0 ? gains[0] : 1;
    for (let i = 0; i < gains.length; i++) gains[i] = Math.min(i ? gains[i - 1] : 1, gains[i] / start);      // and never rise: a released note does not get louder
    // after the last measured time the sound is gone: fade to silence
    return { times: [...times, times.at(-1) + .25], gains: [...gains, 0], seconds: times.at(-1) + .25 };
}

/** The level that brings a rendered buffer to a target RMS over its first `seconds` (the cached notes are levelled by this). */
export function rms(buffer, from, to) {
    let s = 0; const a = Math.max(0, from | 0), b = Math.min(buffer.length, to | 0);
    for (let i = a; i < b; i++) s += buffer[i] * buffer[i];
    return Math.sqrt(s / Math.max(1, b - a));
}
