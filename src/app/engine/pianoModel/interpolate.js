// A model for any pitch and strength from the notes that were measured: the neighbouring measured pitches
// (at each measured strength) are blended partial by partial, then the strengths are blended. A table is
// an array of { pitch, velocity, analysis } as tools/analyzePianoTake.mjs writes it.
//   - amplitudes blend in dB, decay rates and times linearly, rise times and stiffness geometrically;
//   - partial n at the new pitch sits at n f1 sqrt(1 + B n^2) with the interpolated f1 (the equal-tempered
//     pitch plus the measured tuning offset) and B, so partials stay on the stiff-string series;
//   - beating belongs to a particular pair of strings, so it is taken from the nearer measured note, not blended.

import { fitHammer, applyHammer } from './hammer.js';

const lerp = (a, b, t) => a + (b - a) * t;
const hammerCache = new WeakMap();
const geo = (a, b, t) => Math.exp(lerp(Math.log(Math.max(a, 1e-9)), Math.log(Math.max(b, 1e-9)), t));
const toDb = (a) => 20 * Math.log10(Math.max(a, 1e-9));
const fromDb = (d) => 10 ** (d / 20);
const equalTempered = (midi) => 440 * 2 ** ((midi - 69) / 12);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function blendPartial(a, b, t, f) {
    if (!a || !b) {
        const only = a ?? b;
        return only ? { ...only, f } : null;
    }
    const near = t < .5 ? a : b;
    return {
        n: a.n, f,
        a: fromDb(lerp(toDb(a.a), toDb(b.a), t)),
        tPeak: lerp(a.tPeak, b.tPeak, t), delay: lerp(a.delay, b.delay, t), rise: geo(a.rise, b.rise, t),
        s1: lerp(a.s1, b.s1, t), s2: lerp(a.s2, b.s2, t),
        tb: a.tb == null || b.tb == null ? near.tb : lerp(a.tb, b.tb, t),
        beat: near.beat, beatDepth: near.beatDepth, beatPhase: near.beatPhase,
    };
}

/** Two analyses of one strength, blended at t (0 = a, 1 = b) for a note at `midi`. */
export function blendAnalyses(a, b, t, midi) {
    const tuning = lerp(a.f1 / equalTempered(a.midi), b.f1 / equalTempered(b.midi), t);
    const f1 = equalTempered(midi) * tuning, B = geo(a.B, b.B, t);
    const count = Math.max(a.partials.at(-1)?.n ?? 0, b.partials.at(-1)?.n ?? 0);
    const byN = (m) => new Map(m.partials.map((p) => [p.n, p]));
    const pa = byN(a), pb = byN(b), partials = [];
    for (let n = 1; n <= count; n++) {
        const f = n * f1 * Math.sqrt(1 + B * n * n);
        if (f > 20000) break;
        const p = blendPartial(pa.get(n), pb.get(n), t, f);
        // a partial only one of the two had stays only while it is nearer to that one
        if (p && ((pa.get(n) && pb.get(n)) || (pa.get(n) ? t < .5 : t >= .5))) partials.push(p);
    }
    const noise = a.noise.map((band, i) => {
        const other = b.noise[i] ?? band;
        const fa = band.floor ?? 0, fb = other.floor ?? 0, floor = fa > 0 || fb > 0 ? fromDb(lerp(toDb(Math.max(fa, 1e-9)), toDb(Math.max(fb, 1e-9)), t)) : 0;
        return { lo: band.lo, hi: band.hi, rms: fromDb(lerp(toDb(band.rms), toDb(other.rms), t)), tPeak: geo(band.tPeak, other.tPeak, t), tau: geo(band.tau, other.tau, t), floor, floorTau: band.floorTau && other.floorTau ? geo(band.floorTau, other.floorTau, t) : (band.floorTau || other.floorTau || 0) };
    });
    return { midi, f1, B, onset: lerp(a.onset, b.onset, t), held: Math.max(a.held, b.held), level: fromDb(lerp(toDb(a.level), toDb(b.level), t)), partials, noise, rate: a.rate };
}

/** The measured pitches around `midi` among those of one strength: [lower, upper, t]. */
function bracket(layer, midi) {
    const sorted = [...layer].sort((x, y) => x.pitch - y.pitch);
    let lo = sorted[0], hi = sorted.at(-1);
    for (const note of sorted) { if (note.pitch <= midi) lo = note; }
    for (const note of [...sorted].reverse()) { if (note.pitch >= midi) hi = note; }
    if (lo.pitch > midi) return [lo, lo, 0];
    if (hi.pitch < midi) return [hi, hi, 0];
    return [lo, hi, lo.pitch === hi.pitch ? 0 : (midi - lo.pitch) / (hi.pitch - lo.pitch)];
}

/** Scale every amplitude of an analysis by `db` (and the noise with them). */
export function scaleLevel(m, db) {
    const g = fromDb(db);
    return { ...m, level: m.level * g, partials: m.partials.map((p) => ({ ...p, a: p.a * g })), noise: m.noise.map((b) => ({ ...b, rms: b.rms * g, floor: (b.floor ?? 0) * g })) };
}

/**
 * The model for a note of `midi` struck at `velocity` (MIDI 1..127). With measurements at several strengths the strongest
 * is the reference and the hammer's curves (hammer.js) shape the others, so any strength can be asked for; with
 * `hammer: false` the measured strengths are blended partial by partial instead, and strengths beyond them
 * continue the slope between the two nearest, held to +-12 dB of the nearest measured strength.
 */
export function modelFor(table, midi, velocity, { hammer = true } = {}) {
    if (hammer && (table.hammer || new Set(table.map((n) => n.velocity)).size > 1)) {
        // a table loaded from a file carries its curves; otherwise they are learned from the layers once per table
        if (!table.hammer && !hammerCache.has(table)) hammerCache.set(table, fitHammer(table));
        const curves = table.hammer ?? hammerCache.get(table);
        if (curves) {
            const [lo, hi, t] = bracket(table.filter((n) => n.velocity === curves.reference), midi);
            return { ...applyHammer(blendAnalyses(lo.analysis, hi.analysis, t, midi), curves, velocity), midi };
        }
    }
    const velocities = [...new Set(table.map((n) => n.velocity))].sort((a, b) => a - b);
    const layerAt = (v) => { const [lo, hi, t] = bracket(table.filter((n) => n.velocity === v), midi); return blendAnalyses(lo.analysis, hi.analysis, t, midi); };
    if (velocities.length === 1) return scaleLevel(layerAt(velocities[0]), clamp(toDb(velocity / velocities[0]) * 1.2, -12, 12));
    if (velocity <= velocities[0] || velocity >= velocities.at(-1)) {
        const first = velocity <= velocities[0], [va, vb] = first ? [velocities[0], velocities[1]] : [velocities.at(-2), velocities.at(-1)];
        const near = layerAt(first ? va : vb);
        if (velocity === (first ? va : vb)) return near;
        // beyond the measured strengths: continue the slope of the nearest pair, held to +-12 dB
        const a = layerAt(va), b = layerAt(vb), slope = (toDb(b.level) - toDb(a.level)) / (vb - va);
        return scaleLevel(near, clamp(slope * (velocity - (first ? va : vb)), -12, 12));
    }
    let below = velocities[0], above = velocities.at(-1);
    for (const v of velocities) if (v <= velocity) below = v;
    for (const v of [...velocities].reverse()) if (v >= velocity) above = v;
    if (below === above) return layerAt(below);
    const lowModel = layerAt(below), highModel = layerAt(above), t = (velocity - below) / (above - below);
    const merged = blendAnalyses(lowModel, highModel, t, midi);
    // keep the measured pitch (blendAnalyses assumes midi differs by pitch, here both are at `midi`)
    return { ...merged, midi };
}
