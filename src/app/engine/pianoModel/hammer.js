// How the strength of the blow shapes a piano note, learned from a table of measured notes at several strengths.
//
// On a sampled grand the change from one strength to another turned out to depend on a partial's frequency and
// hardly at all on the pitch of the note: from velocity 115 to 40 the partials near 150 Hz drop about 5 dB, those near
// 1 kHz about 15 dB and those above 2 kHz 28 dB or more (a harder blow is a shorter, stiffer felt contact, so the
// string is fed more of the upper partials). The changes at different strengths are nearly the same curve scaled by
// ln(115 / velocity). The decay rates, swell times and peak times do not change with velocity at all. So the model keeps
// one reference strength per pitch and one pitch-independent curve:
//
//     dB(partial of frequency f at velocity v) = dB(partial at the reference) - ln(ref / v) S(f)
//
// and a second curve Sn for the noise bands, which drop a little faster in the low bands (the action's thud).
// Curves are piecewise linear in log2 f between NODES.

export const NODES = Array.from({ length: 8 }, (_, k) => 100 * 2 ** k);           // 100 Hz .. 12.8 kHz
const dB = (a) => 20 * Math.log10(Math.max(a, 1e-12));
const lambda = (v, ref) => Math.log(ref / v);

/** The curve's value at f (dB per unit of ln(ref / v)), flat beyond the first and last node. */
export function curveAt(curve, f) {
    const x = Math.log2(Math.max(f, 1) / NODES[0]);
    if (x <= 0) return curve[0];
    if (x >= curve.length - 1) return curve[curve.length - 1];
    const i = Math.floor(x), t = x - i;
    return curve[i] * (1 - t) + curve[i + 1] * t;
}

// Weighted least squares for a curve on the nodes from points { f, s, w }, with a second-difference penalty so nodes
// that no point reaches follow their neighbours.
function fitCurve(points, smooth = .5) {
    const n = NODES.length, A = Array.from({ length: n }, () => new Float64Array(n)), b = new Float64Array(n);
    for (const { f, s, w } of points) {
        const x = Math.min(n - 1 - 1e-9, Math.max(0, Math.log2(f / NODES[0]))), i = Math.floor(x), t = x - i;
        const basis = [[i, 1 - t], [i + 1, t]];
        for (const [r, br] of basis) { b[r] += w * br * s; for (const [c, bc] of basis) A[r][c] += w * br * bc; }
    }
    for (let i = 1; i < n - 1; i++) {
        const row = [[i - 1, 1], [i, -2], [i + 1, 1]];
        for (const [r, br] of row) for (const [c, bc] of row) A[r][c] += smooth * br * bc;
    }
    for (let i = 0; i < n; i++) A[i][i] += 1e-6;
    // Gaussian elimination
    const m = A.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < n; i++) {
        let piv = i;
        for (let r = i + 1; r < n; r++) if (Math.abs(m[r][i]) > Math.abs(m[piv][i])) piv = r;
        [m[i], m[piv]] = [m[piv], m[i]];
        for (let r = i + 1; r < n; r++) { const k = m[r][i] / m[i][i]; for (let c = i; c <= n; c++) m[r][c] -= k * m[i][c]; }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) { let s = m[i][n]; for (let c = i + 1; c < n; c++) s -= m[i][c] * x[c]; x[i] = s / m[i][i]; }
    return x;
}

/**
 * Learn the curves from a table of { pitch, velocity, analysis }: the strongest measured velocity is the reference.
 * Partials near the measurement floor at the softer strength are left out (they would read as less of a drop than
 * there really is), as are noise bands that did not register.
 */
export function fitHammer(table) {
    const velocities = [...new Set(table.map((n) => n.velocity))].sort((a, b) => a - b), reference = velocities.at(-1);
    const partials = [], noise = [];
    for (const note of table.filter((n) => n.velocity === reference)) {
        const ref = note.analysis, byN = new Map(ref.partials.map((p) => [p.n, p])), top = Math.max(...ref.partials.map((p) => dB(p.a)));
        for (const soft of table.filter((n) => n.pitch === note.pitch && n.velocity < reference)) {
            const l = lambda(soft.velocity, reference);
            for (const p of soft.analysis.partials) {
                const r = byN.get(p.n);
                if (!r || dB(r.a) < top - 60 || dB(p.a) < top - 62) continue;
                partials.push({ f: p.f, s: (dB(r.a) - dB(p.a)) / l, w: l * l });
            }
            soft.analysis.noise.forEach((band, i) => {
                const other = ref.noise[i];
                if (!(band.rms > 0) || !(other?.rms > 0)) return;
                noise.push({ f: Math.sqrt(band.lo * band.hi), s: (dB(other.rms) - dB(band.rms)) / l, w: l * l });
            });
        }
    }
    if (partials.length < 20) return null;
    return { reference, S: fitCurve(partials), Sn: noise.length >= 20 ? fitCurve(noise) : null };
}

/** The model at `velocity` from one at the reference strength: partials and noise bands scaled by the curves. */
export function applyHammer(model, hammer, velocity) {
    const l = lambda(Math.max(1, velocity), hammer.reference);
    const shift = (curve, f) => 10 ** (-l * curveAt(curve, f) / 20);
    return {
        ...model,
        // The curve was learned from fundamentals below ~1 kHz, so it describes upper partials. In the treble the
        // fundamental itself sits at 2-4 kHz and must not be darkened like a 20th partial: cap the frequency it reads.
        partials: model.partials.map((p) => ({ ...p, a: p.a * shift(hammer.S, Math.min(p.f, 800 * (p.n ?? 1))) })),
        noise: model.noise.map((band) => { const g = hammer.Sn ? shift(hammer.Sn, Math.sqrt(band.lo * band.hi)) : shift(hammer.S, Math.sqrt(band.lo * band.hi)); return { ...band, rms: band.rms * g, floor: (band.floor ?? 0) * g }; }),
        level: model.level * shift(hammer.S, 300),
    };
}

/** The inverse of applyHammer: an analysis measured at `velocity` as it would be at the reference strength (for a pitch measured only once). */
export function liftToReference(analysis, hammer, velocity) {
    const l = lambda(Math.max(1, velocity), hammer.reference), shift = (curve, f) => 10 ** (l * curveAt(curve, f) / 20);
    return {
        ...analysis,
        partials: analysis.partials.map((p) => ({ ...p, a: p.a * shift(hammer.S, Math.min(p.f, 800 * (p.n ?? 1))) })),
        noise: analysis.noise.map((band) => { const g = shift(hammer.Sn ?? hammer.S, Math.sqrt(band.lo * band.hi)); return { ...band, rms: band.rms * g, floor: (band.floor ?? 0) * g }; }),
        level: analysis.level * shift(hammer.S, 300),
    };
}
