// Measurements of a stereo room impulse: what src/nodes/roomModel.js is fitted to and audited against.
// Pure JS (no ffmpeg), so the same numbers come out of a recording and of a generated impulse.

const BANDS = { lo: ['lowpass', 250], mid: ['bandpass', 1000, 1], hi: ['highpass', 4000] };

// RBJ biquad, applied in place on a copy
export function biquad(kind, hz, octaves, sr, input) {
    const w0 = 2 * Math.PI * hz / sr, cos = Math.cos(w0), sin = Math.sin(w0);
    const alpha = kind === 'bandpass' ? sin * Math.sinh(Math.LN2 / 2 * octaves * w0 / sin) : sin / (2 * Math.SQRT1_2);
    let b0, b1, b2;
    if (kind === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
    else if (kind === 'highpass') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; }
    const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
    const out = new Float32Array(input.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < input.length; i++) {
        const x = input[i];
        const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y;
    }
    return out;
}

const energy = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return s; };

// Schroeder backward integration over 40 ms windows (both channels together), RT60 from -5 to -25 dB.
function rt60(channels, sr) {
    const w = Math.round(sr * 0.04), e = [];
    for (let i = 0; i < channels[0].length; i += w) {
        let s = 0;
        for (const c of channels) for (let j = i; j < Math.min(c.length, i + w); j++) s += c[j] * c[j];
        e.push(s);
    }
    let rem = e.reduce((a, b) => a + b, 0);
    const total = rem;
    const curve = e.map((x) => { rem -= x; return 10 * Math.log10(Math.max(rem, 1e-30) / total); });
    const at = (db) => { const i = curve.findIndex((x) => x < db); return i < 0 ? NaN : (i + 1) * w / sr; };
    return (at(-25) - at(-5)) * 3;
}

export function analyse(left, right, sr) {
    const channels = [left, right];
    const total = energy(left) + energy(right);
    let peak = 0, peakAt = 0;
    channels.forEach((c) => c.forEach((x, i) => { if (Math.abs(x) > peak) { peak = Math.abs(x); peakAt = i; } }));
    const early = Math.round(sr * 0.08);
    const earlyEnergy = energy(left.subarray(0, early)) + energy(right.subarray(0, early));
    let cross = 0;
    for (let i = 0; i < left.length; i++) cross += left[i] * right[i];
    const bands = {};
    for (const [name, [kind, hz, oct]] of Object.entries(BANDS)) {
        // two stages each: steep enough that a long low band does not leak into the middle one
        const filtered = channels.map((c) => biquad(kind, hz, oct, sr, biquad(kind, hz, oct, sr, c)));
        bands[name] = { rt60: rt60(filtered, sr), energy: filtered.reduce((s, c) => s + energy(c), 0) };
    }
    const level = (name) => 10 * Math.log10(bands[name].energy / bands.mid.energy);
    return {
        seconds: left.length / sr,
        peakMs: peakAt / sr * 1000,
        early80: earlyEnergy / total,
        correlation: cross / Math.sqrt(energy(left) * energy(right)),
        rt60: { lo: bands.lo.rt60, mid: bands.mid.rt60, hi: bands.hi.rt60 },
        levelDb: { lo: level('lo'), hi: level('hi') },
        wholeRt60: rt60(channels, sr),
    };
}
