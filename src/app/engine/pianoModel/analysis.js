// Measures one recorded (or modelled) piano note as a set of parameters that synth.js can rebuild:
//   - the fundamental and the stiffness B of its strings (partial n sounds at n f1 sqrt(1 + B n^2));
//   - for every partial: its peak amplitude, when it begins and how fast it swells in, its decay in
//     two stages (the prompt sound, then the slow aftersound, as dB per second with the hinge between
//     them) and its beating (the unison strings drifting apart and together, as a rate and a depth);
//   - the residual after those sinusoids are taken away (hammer thud, action and string noise) as
//     eleven noise bands, each with a level, a peak time and a decay.
// This is the sinusoids-plus-noise view of a piano tone, with the envelope shapes the literature uses
// for pianos (Bank, "Physics-based sound synthesis of the piano"; Rauhala et al., beating and two-stage decay).
import { fft, magnitudeSpectrum, peakNear, heterodyne } from './dsp.js';

export const NOISE_EDGES = [60, 120, 240, 480, 960, 1500, 2400, 3600, 4800, 6000, 8000, 12000];
// noise is what is gone by this time (seconds); the rest of a band's residual is unresolved partials
const NOISE_FLOOR_FROM = .3;
const STEP = .002;                         // the grid partial envelopes are read on, seconds
const db = (a) => 20 * Math.log10(Math.max(a, 1e-12));

/** Time of the note's first sound: where the 1 ms RMS first rises to `rel` of its maximum in the first `within` seconds. */
export function findOnset(x, rate, { within = .25, rel = .1 } = {}) {
    const hop = Math.max(1, Math.round(rate * .001)), env = [];
    for (let i = 0; i + hop <= Math.min(x.length, Math.round(within * rate)); i += hop) {
        let s = 0;
        for (let j = 0; j < hop; j++) s += x[i + j] ** 2;
        env.push(Math.sqrt(s / hop));
    }
    const peak = Math.max(...env, 1e-12);
    const at = env.findIndex((v) => v >= rel * peak);
    return Math.max(0, at) * hop / rate;
}

/** Fits f_n = n f1 sqrt(1 + B n^2) to measured partial frequencies by scanning B and solving f1 in closed form. */
export function fitStiffness(points) {
    let best = { err: Infinity, f1: 0, B: 0 };
    for (let B = 0; B <= .03; B += 1e-5) {
        let num = 0, den = 0;
        for (const { n, f } of points) { const g = n * Math.sqrt(1 + B * n * n); num += f * g; den += g * g; }
        const f1 = num / den;
        let err = 0;
        for (const { n, f } of points) err += Math.log(f / (f1 * n * Math.sqrt(1 + B * n * n))) ** 2;
        if (err < best.err) best = { err, f1, B };
    }
    return best;
}

/**
 * The partials of a note by spectral peaks, found one after another: the stiff-string series is refitted after every
 * partial that is accepted, so the prediction for the next one stays on track (a fit from the first few partials alone
 * drifts by a percent by partial 20, and the high partials are what makes a bass note ring).
 */
export function findPartials(x, rate, from, f0Guess, { max = 80, floorRatio = 8, topHz = 20000 } = {}) {
    const seconds = Math.min(1.2, Math.max(.4, 12 / f0Guess)), count = Math.min(x.length - from, Math.round(seconds * rate));
    const spec = magnitudeSpectrum(x, rate, from, count, 8);
    // the floor between partials: a low percentile of the spectrum around f, not its mean, which in the bass is full of other strong partials
    const localFloor = (f) => {
        const lo = Math.max(1, Math.round(f * .75 / spec.hz)), hi = Math.round(f * 1.25 / spec.hz), values = [];
        for (let k = lo; k < hi; k += 1 + ((hi - lo) >> 7)) values.push(spec.mag[k] ?? 0);
        values.sort((a, b) => a - b);
        return values[Math.floor(values.length * .25)] ?? 0;
    };
    let f1 = f0Guess, B = 3e-4;
    const found = [];
    let misses = 0;
    for (let n = 1; n <= max; n++) {
        const guess = n * f1 * Math.sqrt(1 + B * n * n);
        if (guess > Math.min(topHz, rate * .45)) break;
        // a wide window while the series is still uncertain, narrowing as more partials pin it down
        const tolerance = Math.max(.004, Math.min(.03, (n < 5 ? .03 : .018) * 5 / Math.max(5, found.length)));
        const peak = peakNear(spec, guess, tolerance);
        if (peak.a > floorRatio * localFloor(peak.f)) {
            found.push({ n, f: peak.f, a: peak.a });
            misses = 0;
            if (found.length >= 3) { const fit = fitStiffness(found.slice(-40)); f1 = fit.f1; B = fit.B; }
        } else if (++misses >= 7 && n > 12) break;
    }
    const strongest = Math.max(...found.map((q) => q.a), 1e-12);
    return { f1, B, partials: found.filter((q) => q.a > strongest * 10 ** (-90 / 20)) };
}

// Hinge fit: dB = c + s1 t + (s2 - s1) max(0, t - tb), solved by least squares for each hinge time on a grid.
function twoSlopeFit(t, y) {
    const n = t.length;
    const solve = (hinge) => {
        // normal equations for [1, t, hinge(t)]
        const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
        for (let i = 0; i < n; i++) {
            const row = [1, t[i], hinge === null ? 0 : Math.max(0, t[i] - hinge)];
            for (let r = 0; r < 3; r++) { b[r] += row[r] * y[i]; for (let c = 0; c < 3; c++) A[r][c] += row[r] * row[c]; }
        }
        if (hinge === null) { A[2][2] = 1; }
        // Gaussian elimination, 3x3
        const m = A.map((r, i) => [...r, b[i]]);
        for (let i = 0; i < 3; i++) {
            let piv = i;
            for (let r = i + 1; r < 3; r++) if (Math.abs(m[r][i]) > Math.abs(m[piv][i])) piv = r;
            [m[i], m[piv]] = [m[piv], m[i]];
            if (Math.abs(m[i][i]) < 1e-12) return null;
            for (let r = i + 1; r < 3; r++) { const f = m[r][i] / m[i][i]; for (let c = i; c < 4; c++) m[r][c] -= f * m[i][c]; }
        }
        const sol = [0, 0, 0];
        for (let i = 2; i >= 0; i--) { let s = m[i][3]; for (let c = i + 1; c < 3; c++) s -= m[i][c] * sol[c]; sol[i] = s / m[i][i]; }
        let sse = 0;
        for (let i = 0; i < n; i++) sse += (sol[0] + sol[1] * t[i] + (hinge === null ? 0 : sol[2] * Math.max(0, t[i] - hinge)) - y[i]) ** 2;
        return { c: sol[0], s1: sol[1], s2: sol[1] + (hinge === null ? 0 : sol[2]), tb: hinge, sse };
    };
    let best = solve(null);
    if (!best || n < 12) return best;
    const t0 = t[0], span = t[n - 1] - t0;
    for (let k = 1; k < 24; k++) {
        const fit = solve(t0 + span * (.06 + .8 * k / 24));
        // the aftersound must decay more slowly than the prompt sound, and the second stage must matter
        if (fit && fit.s2 >= fit.s1 - 1e-9 && fit.s2 <= 0 && fit.sse < best.sse * .85) best = fit;
    }
    return best;
}

// Dominant slow modulation of a (mean 0) series sampled every `step`: its rate (Hz), depth and phase, by least squares at each trial rate.
function strongestModulation(m, step, lo, hi) {
    const n = m.length;
    if (n < 16) return { rate: 0, depth: 0, phase: 0 };
    let best = { power: 0, rate: 0, depth: 0, phase: 0 };
    for (let rate = lo; rate <= hi; rate += .05) {
        let cc = 0, ss = 0, cs = 0, mc = 0, ms = 0;
        for (let i = 0; i < n; i++) {
            const c = Math.cos(2 * Math.PI * rate * i * step), s = Math.sin(2 * Math.PI * rate * i * step);
            cc += c * c; ss += s * s; cs += c * s; mc += m[i] * c; ms += m[i] * s;
        }
        const det = cc * ss - cs * cs;
        if (Math.abs(det) < 1e-9) continue;
        const a = (mc * ss - ms * cs) / det, b = (ms * cc - mc * cs) / det, power = a * mc + b * ms;
        if (power > best.power) best = { power, rate, depth: Math.hypot(a, b), phase: -Math.atan2(b, a) };
    }
    return best;
}

/** One partial's envelope parameters from its amplitude series A on the STEP grid, over `held` seconds of key-down. */
export function fitEnvelope(A, held, f0) {
    const n = A.length, smoothed = new Float64Array(n), w = 3;
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -w; k <= w; k++) if (A[i + k] !== undefined) { s += A[i + k]; c++; } smoothed[i] = s / c; }
    // the peak is found on a 50 ms average, so the first crest of a beating partial does not stand for the whole note
    let peakAt = 0, best = -1;
    const search = Math.min(n, Math.round(.45 / STEP));
    for (let i = 0; i < search; i++) {
        let sum = 0, count = 0;
        for (let k = -12; k <= 12; k++) if (smoothed[i + k] !== undefined) { sum += smoothed[i + k]; count++; }
        if (sum / count > best) { best = sum / count; peakAt = i; }
    }
    const peak = smoothed[peakAt];
    if (!(peak > 0)) return null;
    // the swell: when it crosses 10% and 90% of the peak on the way up
    let i10 = 0, i90 = peakAt;
    for (let i = 0; i <= peakAt; i++) { if (smoothed[i] < .1 * peak) i10 = i; if (smoothed[i] < .9 * peak) i90 = i; }
    const delay = i10 * STEP, rise = Math.max(.0005, (i90 - i10) * STEP / 2.73);
    // the decay: from the peak to the end of the held note or 60 dB down, every 10 ms
    const t = [], y = [], limit = Math.min(n, Math.floor(held / STEP) - 5);
    for (let i = peakAt; i < limit; i += 5) {
        if (db(smoothed[i]) < db(peak) - 60) break;
        t.push((i - peakAt) * STEP); y.push(db(smoothed[i]));
    }
    const fit = t.length >= 6 ? twoSlopeFit(t, y) : null;
    const s1 = fit ? Math.min(0, fit.s1) : 0, s2 = fit ? Math.min(0, fit.s2) : 0, tb = fit?.tb == null ? null : fit.tb + peakAt * STEP;
    // the beating: the ripple of the amplitude around its smooth decay
    let beat = { rate: 0, depth: 0, phase: 0 };
    if (fit && t.length >= 30) {
        const ripple = [];
        for (let k = 0; k < t.length; k++) {
            const model = fit.c + fit.s1 * t[k] + (fit.tb == null ? 0 : (fit.s2 - fit.s1) * Math.max(0, t[k] - fit.tb));
            ripple.push(10 ** ((y[k] - model) / 20) - 1);
        }
        const meanRipple = ripple.reduce((a, v) => a + v, 0) / ripple.length;
        const found = strongestModulation(ripple.map((v) => v - meanRipple), .01, .15, Math.min(12, f0 / 3));
        if (found.depth > .08) beat = { rate: found.rate, depth: Math.min(.9, found.depth), phase: found.phase + 2 * Math.PI * found.rate * (peakAt * STEP) };
    }
    // the amplitude is the smooth decay's value at the peak (a beating partial's crest is higher than its mean)
    const beatNorm = beat.depth > 0 ? (1 + Math.sqrt(1 - Math.min(.95, beat.depth) ** 2)) / 2 : 1;
    const amplitude = fit ? Math.min(peak * 1.5, 10 ** (fit.c / 20) / beatNorm) : peak;
    return { a: amplitude, tPeak: peakAt * STEP, delay, rise, s1, s2, tb, beat: beat.rate, beatDepth: beat.depth, beatPhase: beat.phase };
}

/**
 * The residual in NOISE_EDGES bands: peak RMS, when it peaks and its decay time constant (seconds) after. In a high note
 * (fundamental above 1 kHz) what lies well below the fundamental cannot be unresolved partials of that string: it is
 * the thump of the action and the sound board and sympathetic strings, and it lasts. Those bands are kept whole, with
 * their own decay (up to 2 s), where the others lose their steady floor and are cut off at 0.1 s or less.
 */
export function noiseBands(residual, rate, f1 = 0) {
    const size = 1024, hop = 240, frames = Math.max(0, Math.floor((residual.length - size) / hop));
    const energy = NOISE_EDGES.slice(1).map(() => new Float64Array(frames));
    const re = new Float64Array(size), im = new Float64Array(size), hann = Float64Array.from({ length: size }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / size));
    const hz = rate / size;
    for (let f = 0; f < frames; f++) {
        for (let i = 0; i < size; i++) { re[i] = residual[f * hop + i] * hann[i]; im[i] = 0; }
        fft(re, im);
        for (let b = 0; b < energy.length; b++) {
            const lo = Math.max(1, Math.round(NOISE_EDGES[b] / hz)), hi = Math.min(size / 2, Math.round(NOISE_EDGES[b + 1] / hz));
            let s = 0;
            for (let k = lo; k < hi; k++) s += re[k] ** 2 + im[k] ** 2;
            // the RMS of the band-limited signal: for r^2 of power in the band, the one-sided bins sum to r^2 (size / 2) sum(w^2), and sum(w^2) = .375 size
            energy[b][f] = Math.sqrt(s / (size / 2 * .375 * size));
        }
    }
    return NOISE_EDGES.slice(1).map((hi, b) => {
        const lo = NOISE_EDGES[b], seconds = (f) => (f * hop + size / 2) / rate;
        // What is still there well after the strike is not noise: it is partial energy the sinusoid fit did not
        // resolve (beating, weak partials), and played back as noise it hisses like a cymbal. Take that steady floor
        // away and keep only the part that dies away quickly, as hammer and action noise do.
        const body = f1 >= 1000 && hi <= f1 * .85;
        const meanPower = (t0, t1) => { let sum = 0, count = 0; for (let f = 0; f < frames; f++) if (seconds(f) >= t0 && seconds(f) < t1) { sum += energy[b][f] ** 2; count++; } return count ? sum / count : 0; };
        let floorPower = 0, floorFrames = 0;
        for (let f = 0; f < frames; f++) if (seconds(f) >= NOISE_FLOOR_FROM) { floorPower += energy[b][f] ** 2; floorFrames++; }
        const floor = floorFrames ? floorPower / floorFrames : 0;
        // the sustained part of a body band: its level 0.25 to 0.8 s in and how fast it dies (against 1 to 2 s in)
        let sustained = 0, sustainedTau = 0;
        if (body) {
            const early = meanPower(.25, .8), late = meanPower(1, 2);
            sustained = Math.sqrt(early);
            sustainedTau = late > 0 && late < early ? Math.min(4, Math.max(.2, 1 / Math.log(Math.sqrt(early / late)))) : 4;
        }
        const attack = Float64Array.from(energy[b], (e) => Math.sqrt(Math.max(0, e * e - floor)));
        let pk = 0;
        for (let f = 0; f < frames; f++) if (attack[f] > attack[pk]) pk = f;
        const rms = attack[pk] ?? 0;
        let tau = .02;
        if (rms > 0) {
            // decay constant from the time the band falls 20 dB below its peak
            let drop = frames - 1;
            for (let f = pk; f < frames; f++) if (attack[f] < rms * .1) { drop = f; break; }
            tau = (drop - pk) * hop / rate / Math.log(10);
        }
        const cap = lo >= 4800 ? .02 : lo >= 1200 ? .04 : .1;
        return { lo, hi, rms, tPeak: seconds(pk), tau: Math.min(cap, Math.max(.004, tau)), floor: sustained, floorTau: sustainedTau };
    });
}

/**
 * Analyse a note. `x` starts shortly before the key goes down (any pre-roll is fine) and must cover
 * `held` seconds of key-down. Returns the parameter set described at the top of this file.
 */
export function analyzeNote(x, rate, { midi, f0, held = 4, partials: maxPartials = 64 } = {}) {
    const guess = f0 ?? 440 * 2 ** ((midi - 69) / 12);
    const onset = findOnset(x, rate), from = Math.round((onset + .03) * rate);
    const { f1, B, partials: peaks } = findPartials(x, rate, from, guess, { max: maxPartials });
    const window = Math.round(rate / Math.max(20, Math.min(250, f1)));
    const seconds = Math.min(held + .1, (x.length / rate) - onset - .02);
    const base = Math.round(onset * rate), segment = x.subarray(Math.max(0, base - Math.round(.02 * rate)));
    const lead = Math.min(base, Math.round(.02 * rate)) / rate;
    const out = [];
    const rebuilt = new Float64Array(Math.min(segment.length, Math.round(.6 * rate)));
    for (const peak of peaks) {
        const env = heterodyne(segment, rate, peak.f, window, STEP, seconds + lead);
        const A = new Float64Array(env.count);
        for (let k = 0; k < env.count; k++) A[k] = Math.hypot(env.re[k], env.im[k]);
        // time zero of the fit is the onset, not the start of the segment
        const skip = Math.round(lead / STEP), series = A.subarray(skip);
        const fit = fitEnvelope(series, held, f1);
        if (!fit) continue;
        out.push({ n: peak.n, f: peak.f, ...fit });
        // add this partial's measured waveform to the reconstruction, for the residual
        const w = 2 * Math.PI * peak.f / rate;
        for (let i = 0; i < rebuilt.length; i++) {
            const pos = i / rate / STEP, k = Math.min(env.count - 2, Math.floor(pos)), u = pos - k;
            const cr = env.re[k] * (1 - u) + env.re[k + 1] * u, ci = env.im[k] * (1 - u) + env.im[k + 1] * u;
            rebuilt[i] += cr * Math.cos(w * i) - ci * Math.sin(w * i);
        }
    }
    const residual = new Float64Array(rebuilt.length);
    for (let i = 0; i < residual.length; i++) residual[i] = segment[i] - rebuilt[i];
    const level = Math.sqrt(segment.subarray(0, Math.round(rate * .5)).reduce((a, v) => a + v * v, 0) / Math.round(rate * .5));
    return { midi, f1, B, onset, held, level, partials: out, noise: noiseBands(residual, rate, f1).map((band) => ({ ...band, tPeak: Math.max(0, band.tPeak - lead) })), rate };
}
