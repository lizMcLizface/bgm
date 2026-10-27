// Signal-processing pieces for measuring a piano note and rebuilding it: an FFT, a windowed-sinc
// decimator, and the heterodyne that pulls one partial's complex envelope out of a note.
// Pure functions on typed arrays; used by analysis.js (tools and tests) and nothing in playback.

/** In-place radix-2 FFT of (re, im); the length must be a power of two. */
export function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
                const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
            }
        }
    }
}

/** Hann-windowed magnitude spectrum of `count` samples from `from`, zero-padded `pad` times; amplitude of a sinusoid reads as its peak. */
export function magnitudeSpectrum(x, rate, from, count, pad = 4) {
    const size = 2 ** Math.ceil(Math.log2(count * pad)), re = new Float64Array(size), im = new Float64Array(size);
    let window = 0;
    for (let i = 0; i < count; i++) {
        const w = .5 - .5 * Math.cos(2 * Math.PI * i / (count - 1));
        re[i] = (x[from + i] ?? 0) * w; window += w;
    }
    fft(re, im);
    const mag = new Float64Array(size / 2);
    for (let i = 0; i < mag.length; i++) mag[i] = 2 * Math.hypot(re[i], im[i]) / window;
    return { mag, hz: rate / size };
}

/** The frequency and amplitude of the strongest spectral peak within `tolerance` (fraction) of f, refined by parabolic interpolation of the log magnitude. */
export function peakNear(spec, f, tolerance) {
    const lo = Math.max(1, Math.floor(f * (1 - tolerance) / spec.hz)), hi = Math.min(spec.mag.length - 2, Math.ceil(f * (1 + tolerance) / spec.hz));
    let best = lo;
    for (let i = lo; i <= hi; i++) if (spec.mag[i] > spec.mag[best]) best = i;
    const a = Math.log(spec.mag[best - 1] + 1e-12), b = Math.log(spec.mag[best] + 1e-12), c = Math.log(spec.mag[best + 1] + 1e-12);
    const shift = .5 * (a - c) / (a - 2 * b + c);
    return { f: (best + (Number.isFinite(shift) ? Math.max(-.5, Math.min(.5, shift)) : 0)) * spec.hz, a: spec.mag[best] };
}

/** Lowpass by an odd-length Hann-windowed sinc, then keep every `factor`th sample. */
export function decimate(x, factor) {
    if (factor <= 1) return x;
    const half = 12 * factor, cutoff = .45 / factor, taps = new Float64Array(2 * half + 1);
    let sum = 0;
    for (let k = -half; k <= half; k++) {
        const s = k === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * k) / (Math.PI * k);
        const w = .5 + .5 * Math.cos(Math.PI * k / (half + 1));
        taps[k + half] = s * w; sum += s * w;
    }
    for (let k = 0; k < taps.length; k++) taps[k] /= sum;
    const out = new Float32Array(Math.floor(x.length / factor));
    for (let i = 0; i < out.length; i++) {
        let acc = 0;
        const centre = i * factor;
        for (let k = -half; k <= half; k++) { const j = centre + k; if (j >= 0 && j < x.length) acc += x[j] * taps[k + half]; }
        out[i] = acc;
    }
    return out;
}

/**
 * The complex envelope of the sinusoid at `freq` in x: mix it down to zero, smooth with two moving
 * averages of `window` samples (a triangle whose first null is rate/window, so a window of one
 * fundamental period rejects every other harmonic), and read it at `step` seconds. A sinusoid
 * A cos(2 pi f t + p) comes out as A e^(jp) (the factor 2 for the missing negative frequency is
 * included). Returns { re, im, step, count } where sample k is the value at k * step.
 */
export function heterodyne(x, rate, freq, window, step, seconds) {
    const total = Math.min(x.length, Math.ceil((seconds + 2 * window / rate) * rate));
    const re = new Float64Array(total), im = new Float64Array(total), w = 2 * Math.PI * freq / rate;
    // x e^(-j w i) by a rotating phasor (cr, ci) = e^(j w i), renormalised now and then against drift
    const dr = Math.cos(w), di = Math.sin(w);
    let cr = 1, ci = 0;
    for (let i = 0; i < total; i++) {
        re[i] = x[i] * cr; im[i] = -x[i] * ci;
        const nr = cr * dr - ci * di;
        ci = cr * di + ci * dr; cr = nr;
        if ((i & 2047) === 2047) { const m = Math.hypot(cr, ci); cr /= m; ci /= m; }
    }
    smooth(re, window); smooth(re, window);
    smooth(im, window); smooth(im, window);
    const count = Math.floor(seconds / step), outRe = new Float64Array(count), outIm = new Float64Array(count);
    for (let k = 0; k < count; k++) {
        const at = Math.min(total - 1, Math.round(k * step * rate));
        outRe[k] = 2 * re[at]; outIm[k] = 2 * im[at];
    }
    return { re: outRe, im: outIm, step, count };
}

/** In-place centred moving average of `window` samples (edges average what exists). */
function smooth(a, window) {
    const n = a.length, half = window >> 1, prefix = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + a[i];
    for (let i = 0; i < n; i++) {
        const lo = Math.max(0, i - half), hi = Math.min(n, i - half + window);
        a[i] = (prefix[hi] - prefix[lo]) / Math.max(1, hi - lo);
    }
}
