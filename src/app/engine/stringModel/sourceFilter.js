// A source-filter reading of a string table (docs/STRING_MODEL.md, "Source and body"): the level of harmonic h of a note at f0 is
//   B(h·f0) + S(h) + a(pitch) + b(pitch)·log2 h
// B the body, fixed in Hz (knots every 1/24 octave, linear between), S the string/bow, fixed in harmonic number, a the note's level
// and b its own tilt. Whatever is left is the residual. Fitted by least squares per strength layer, so a note of any pitch, including
// ones below the measured range, is B read at its own harmonics plus the source: that is what extrapolation means here.
const FLOOR = 60;                            // cells more than this far under the note's total are not fitted
const MAX_H = 120;

/** The cells to fit: [pitchIndex, h, f, dB relative to the note's total]. */
function observations(table, layer, skip) {
    const entries = table.pitches.filter((p) => p.layers[layer] && !skip?.has(p.pitch)), obs = [];
    entries.forEach((e, i) => {
        const L = e.layers[layer];
        for (const [h, tonal] of L.cells) if (h >= 1 && h <= MAX_H && tonal > L.total - FLOOR) obs.push([i, h, h * e.f0, tonal - L.total]);
    });
    return { entries, obs };
}

/** Cholesky solve of the symmetric positive-definite system A x = y (A is n×n, row-major, destroyed). */
function solve(A, y, n) {
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            let s = A[i * n + j];
            for (let k = 0; k < j; k++) s -= A[i * n + k] * A[j * n + k];
            A[i * n + j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / A[j * n + j];
        }
    }
    for (let i = 0; i < n; i++) { let s = y[i]; for (let k = 0; k < i; k++) s -= A[i * n + k] * y[k]; y[i] = s / A[i * n + i]; }
    for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= A[k * n + i] * y[k]; y[i] = s / A[i * n + i]; }
    return y;
}

/**
 * Fit one layer of a table. variant 'tilt': B + a + b·log2 h; 'source': B + S(h) + a; 'both': B + S(h) + a + b·log2 h.
 * `skip`: a Set of measured pitches to leave out. Returns { B, S, a, b, pitches, f0s, knots, evaluate }.
 */
export function fitLayer(table, layer, { variant = 'both', perOctave = 24, fMin = 55, fMax = 14000, smooth = .3, skip = null } = {}) {
    const { entries, obs } = observations(table, layer, skip), P = entries.length, K = Math.ceil(Math.log2(fMax / fMin) * perOctave) + 1;
    const useS = variant !== 'tilt', useTilt = variant !== 'source';
    const oB = 0, oS = K, oA = oS + (useS ? MAX_H : 0), oT = oA + P, n = oT + (useTilt ? P : 0);
    const A = new Float64Array(n * n), y = new Float64Array(n);
    const add = (idx, val, target, w = 1) => {
        for (let i = 0; i < idx.length; i++) { y[idx[i]] += w * val[i] * target; for (let j = 0; j < idx.length; j++) A[idx[i] * n + idx[j]] += w * val[i] * val[j]; }
    };
    const knotPos = (f) => Math.min(K - 1.0001, Math.max(0, Math.log2(f / fMin) * perOctave));
    for (const [p, h, f, d] of obs) {
        const x = knotPos(f), i = Math.floor(x), u = x - i, idx = [oB + i, oB + i + 1, oA + p], val = [1 - u, u, 1];
        if (useS) { idx.push(oS + h - 1); val.push(1); }
        if (useTilt) { idx.push(oT + p); val.push(Math.log2(h)); }
        add(idx, val, d);
    }
    // second differences of B keep it from chasing single cells where few harmonics land; S likewise, lightly
    for (let i = 1; i < K - 1; i++) add([oB + i - 1, oB + i, oB + i + 1], [1, -2, 1], 0, smooth);
    if (useS) for (let i = 1; i < MAX_H - 1; i++) add([oS + i - 1, oS + i, oS + i + 1], [1, -2, 1], 0, smooth * .3);
    for (let i = 0; i < n; i++) A[i * n + i] += 1e-3;       // the constant can move between B, S and a: pin it
    const x = solve(A, y, n);
    const B = x.slice(oB, oB + K), S = useS ? x.slice(oS, oS + MAX_H) : new Float64Array(MAX_H), a = x.slice(oA, oA + P), b = useTilt ? x.slice(oT, oT + P) : new Float64Array(P);
    const pitches = entries.map((e) => e.pitch), f0s = entries.map((e) => e.f0);
    const body = (f) => { const t = knotPos(f), i = Math.floor(t); return B[i] * (1 - (t - i)) + B[i + 1] * (t - i); };
    /** dB relative to the note's total for harmonic h (1-based) of a note at f0, with a and b interpolated between the measured pitches around `midi` (nearest outside the range). */
    const level = (midi, f0, h, ab = pitchTerms(midi)) => body(h * f0) + S[Math.min(h, MAX_H) - 1] + ab.a + ab.b * Math.log2(h);
    function pitchTerms(midi) {
        const j = pitches.findIndex((m) => m >= midi);
        if (j <= 0) return { a: a[0], b: b[0] };
        if (j < 0) return { a: a[P - 1], b: b[P - 1] };
        const t = (midi - pitches[j - 1]) / (pitches[j] - pitches[j - 1]);
        return { a: a[j - 1] * (1 - t) + a[j] * t, b: b[j - 1] * (1 - t) + b[j] * t };
    }
    function pitchTermsSafe(midi) { return midi >= pitches[P - 1] ? { a: a[P - 1], b: b[P - 1] } : pitchTerms(midi); }
    return { variant, B, S, a, b, pitches, f0s, K, perOctave, fMin, obs, entries, body, level: (midi, f0, h) => level(midi, f0, h, pitchTermsSafe(midi)), pitchTerms: pitchTermsSafe };
}

const fits = new WeakMap();
/** The fit of a table's layer, kept (a table is fixed once loaded). */
export function layerFit(table, layer, variant = 'both') {
    if (!fits.has(table)) fits.set(table, new Map());
    const m = fits.get(table), key = layer + variant;
    if (!m.has(key)) m.set(key, fitLayer(table, layer, { variant }));
    return m.get(key);
}

/**
 * The smooth part of a note's spectrum: dB per harmonic relative to the note's total, in the same blend of the two measured strengths
 * around `layers` ({ lo, hi, t }) as modelFor uses, for the first `count` harmonics of a note at f0.
 */
export function smoothShape(table, { lo, hi, t }, midi, f0, count, variant = 'both') {
    const flo = layerFit(table, lo, variant), fhi = layerFit(table, hi, variant);
    return Float64Array.from({ length: count }, (_, k) => flo.level(midi, f0, k + 1) * (1 - t) + fhi.level(midi, f0, k + 1) * t);
}
