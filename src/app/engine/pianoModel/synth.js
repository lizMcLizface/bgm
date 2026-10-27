// Rebuilds a piano note from the parameters analysis.js measures: a sum of partials, each with its own
// swell-in, two-stage decay and beating, plus the residual as shaped noise. The same function plays
// a measured note back and (later) one interpolated between measured pitches and strengths.
import { NOISE_EDGES } from './analysis.js';

const CONTROL = .001;                                   // seconds between envelope control points

/** One partial's amplitude at time t (seconds from the onset). */
export function partialEnvelope(p, t) {
    const swell = t <= p.delay ? 0 : (1 - Math.exp(-(t - p.delay) / p.rise)) ** 3;
    let dbs = p.s1 * Math.max(0, t - p.tPeak);
    if (p.tb != null && p.s2 !== p.s1) dbs += (p.s2 - p.s1) * Math.max(0, t - p.tb);
    let level = p.a * swell * 10 ** (dbs / 20);
    if (p.beatDepth > 0) level *= 1 + p.beatDepth * Math.cos(2 * Math.PI * p.beat * t + p.beatPhase);
    return level;
}

// The damper coming down when the key goes up, measured on a sampled grand (A0 to C5): the note falls only a few
// dB while the damper settles (about 40 dB per second for 0.15 s), then dies quickly (about 110 dB per second).
export const RELEASE = { settle: .15, slow: 40, fast: 110 };

/** Gain (linear) `t` seconds after the key goes up; 1 before. */
export function releaseGain(t, release = RELEASE) {
    if (t <= 0) return 1;
    return 10 ** (-(release.slow * Math.min(t, release.settle) + release.fast * Math.max(0, t - release.settle)) / 20);
}

/**
 * The gain that brings a note to a standard loudness: its low band (below 700 Hz, where a mix judges the weight of a
 * piano note; for a note above that, its first partials) 0.4 s after the strike, as renderAcousticPiano levels its notes. The engine's own gain then follows the
 * player velocity: a harder blow is brighter in the buffer, but its weight comes from that gain.
 */
export function lowBandRms(model) {
    // below 700 Hz, or the first two partials of a note too high to have any there
    const limit = Math.max(700, 2.5 * model.f1);
    let power = 0;
    for (const p of model.partials) if (p.f < limit) power += partialEnvelope(p, .4) ** 2 / 2;
    return Math.sqrt(power);
}

export function normalizedGain(model, target = .08) {
    const rms = lowBandRms(model);
    return rms > 0 ? target / rms : 1;
}

/** The time after which a partial stays below `floorDb` relative to its peak (capped at `cap`). */
function audibleUntil(p, floorDb, cap) {
    for (let t = p.tPeak; t < cap; t += .05) {
        let dbs = p.s1 * Math.max(0, t - p.tPeak);
        if (p.tb != null && p.s2 !== p.s1) dbs += (p.s2 - p.s1) * Math.max(0, t - p.tb);
        if (dbs < floorDb) return t;
    }
    return cap;
}

function generator(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 2147483648 - 1; };
}

const bandGain = new Map();
// A band-pass of two cascaded biquads (24 dB per octave skirts, so a loud low band does not leak into the quiet top
// of the spectrum) at the geometric centre of a band, and the RMS it leaves of unit white noise, to normalise by.
function bandFilter(lo, hi, rate) {
    const centre = Math.sqrt(lo * hi), w0 = 2 * Math.PI * centre / rate, q = Math.max(.7, centre / (hi - lo) * 1.2), alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha, b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * Math.cos(w0) / a0, a2 = (1 - alpha) / a0;
    const run = (state, x) => {
        const y1 = b0 * x + b2 * state.x2 - a1 * state.y1 - a2 * state.y2;
        state.x2 = state.x1; state.x1 = x; state.y2 = state.y1; state.y1 = y1;
        return y1;
    };
    const fresh = () => ({ x1: 0, x2: 0, y1: 0, y2: 0 });
    const key = `${lo}/${hi}/${rate}`;
    if (!bandGain.has(key)) {
        const next = generator(12345), one = fresh(), two = fresh();
        let sum = 0;
        const n = 16384;
        for (let i = 0; i < n; i++) {
            const y = run(two, run(one, next() * Math.sqrt(3)));
            if (i > 2048) sum += y * y;
        }
        bandGain.set(key, 1 / Math.sqrt(sum / (n - 2049)));
    }
    return { norm: bandGain.get(key), stages: [fresh(), fresh()], run };
}

/**
 * @param {object} model - the result of analyzeNote (or an interpolation of several)
 * @param {number} rate - sample rate to render at
 * @param {object} [o] - seconds (default the held time plus a second), gain, noise (scale of the residual, default 1), seed,
 *   keyUp (seconds from the onset at which the key goes up and the damper falls; leave out for a note that rings on, as with the pedal down)
 */
export function renderPianoModel(model, rate, { seconds, gain = 1, noise = 1, seed = 1, keyUp = null } = {}) {
    // a note that ends is rendered to where the damper has silenced it
    const total = seconds ?? (keyUp === null ? Math.min(10, model.held + 1) : keyUp + .9), length = Math.ceil(total * rate), out = new Float32Array(length);
    const hop = Math.max(1, Math.round(rate * CONTROL)), points = Math.ceil(length / hop) + 2;

    for (const p of model.partials) {
        if (p.f >= rate * .45) continue;
        const until = Math.min(total, audibleUntil(p, -85, total));
        const env = new Float32Array(points);
        for (let k = 0; k < points; k++) env[k] = k * hop / rate <= until ? partialEnvelope(p, k * hop / rate) * gain : 0;
        const w = 2 * Math.PI * p.f / rate, dr = Math.cos(w), di = Math.sin(w);
        let cr = 1, ci = 0;                                         // e^(j w i); sine phase: the sample is ci
        const end = Math.min(length, Math.ceil(until * rate));
        for (let i = 0; i < end; i++) {
            const k = (i / hop) | 0, u = i / hop - k, a = env[k] + (env[k + 1] - env[k]) * u;
            out[i] += a * ci;
            const nr = cr * dr - ci * di;
            ci = cr * di + ci * dr; cr = nr;
            if ((i & 2047) === 2047) { const m = Math.hypot(cr, ci); cr /= m; ci /= m; }
        }
    }

    if (noise > 0 && model.noise) {
        const next = generator(seed * 2654435761);
        for (const band of model.noise) {
            if (!(band.rms > 0 || band.floor > 0) || band.lo >= rate * .45) continue;
            const f = bandFilter(band.lo, Math.min(band.hi, rate * .45), rate);
            // the strike (peaks, then dies quickly) and, in a high note's low bands, a sustained body under it
            const floorEnd = band.floor > 0 ? Math.min(total, band.floorTau * 7) : 0;
            const end = Math.min(length, Math.ceil(Math.max(Math.min(total, band.tPeak + band.tau * 7), floorEnd) * rate));
            for (let i = 0; i < end; i++) {
                const t = i / rate, y = f.run(f.stages[1], f.run(f.stages[0], next() * Math.sqrt(3)));
                let e = band.rms > 0 ? (t < band.tPeak ? (t / Math.max(band.tPeak, 1e-4)) ** 2 : Math.exp(-(t - band.tPeak) / band.tau)) * band.rms : 0;
                if (band.floor > 0) e += band.floor * Math.exp(-t / band.floorTau) * Math.min(1, t / .02);
                out[i] += y * f.norm * e * noise * gain;
            }
        }
    }
    if (keyUp !== null) for (let i = Math.max(0, Math.floor(keyUp * rate)); i < length; i++) out[i] *= releaseGain(i / rate - keyUp);
    const fade = Math.min(length, Math.round(rate * .05));
    for (let i = 0; i < fade; i++) out[length - 1 - i] *= i / fade;
    return out;
}

export { NOISE_EDGES };
