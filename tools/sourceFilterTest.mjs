// Is a string table a body (fixed in Hz) times a source (fixed in harmonic number)?  Fits sourceFilter.js to a layer, then reports
//  - in-sample and left-one-pitch-out error of the fit by group of harmonics (compare tools/evalStringTable.mjs, which scores the table's own model),
//  - how the residual is locked: correlation of a note's residual with its neighbour's by harmonic number vs by frequency.
// Usage: node tools/sourceFilterTest.mjs src/library/stringTables/celloLong.json [velocity] [variant: tilt|source|both]
import { readFileSync } from 'node:fs';
import { fitLayer } from '../src/app/engine/stringModel/sourceFilter.js';

const table = JSON.parse(readFileSync(process.argv[2], 'utf8')), layer = +(process.argv[3] ?? 80), variant = process.argv[4] ?? 'both';
const groups = [[1, 1], [2, 2], [3, 4], [5, 8], [9, 16], [17, 32], [33, 80], [81, 120]];
const groupOf = (h) => groups.findIndex(([lo, hi]) => h >= lo && h <= hi);
const rms = (s) => (s.n ? Math.sqrt(s.q / s.n).toFixed(1) : '-');

const fit = fitLayer(table, layer, { variant });
const inSample = groups.map(() => ({ q: 0, n: 0 })), residual = new Map();      // pitch -> Map(h -> r)
for (const [p, h, f, d] of fit.obs) {
    const pitch = fit.pitches[p], r = d - fit.level(pitch, fit.f0s[p], h) + 0;            // a and b of the note itself
    const own = d - (fit.body(f) + fit.S[Math.min(h, 120) - 1] + fit.a[p] + fit.b[p] * Math.log2(h));
    const g = groupOf(h); inSample[g].q += own * own; inSample[g].n++;
    if (!residual.has(pitch)) residual.set(pitch, new Map());
    residual.get(pitch).set(h, own);
    void r;
}

// The sampler holds one recording per zone of about four semitones and repitches it (neighbours in a zone share their residual, see below), so
// leaving out one pitch tests nothing: the other three still carry its recording. Leaving out a whole zone is the real test, for the fit and
// for the table's own model (model.js) alike.
const ZONES = [36, 37, 42, 46, 50, 54, 58, 62, 66, 70, 74, 78, 82, 85];
import { modelFor } from '../src/app/engine/stringModel/model.js';
const loo = groups.map(() => ({ q: 0, n: 0 })), ref = groups.map(() => ({ q: 0, n: 0 })), looLevel = [];
for (let z = 1; z < ZONES.length - 2; z++) {
    const out = new Set(table.pitches.map((p) => p.pitch).filter((m) => m >= ZONES[z] && m < ZONES[z + 1]));
    const f = fitLayer(table, layer, { variant, skip: out }), rest = { ...table, pitches: table.pitches.filter((p) => !out.has(p.pitch)) };
    for (const entry of table.pitches.filter((p) => out.has(p.pitch))) {
        const L = entry.layers[layer]; if (!L) continue;
        const m = modelFor(rest, entry.pitch, layer, entry.f0);
        for (const [h, tonal] of L.cells) {
            if (h < 1 || h > 120 || tonal <= L.total - 60) continue;
            const g = groupOf(h), d = f.level(entry.pitch, entry.f0, h) - (tonal - L.total); loo[g].q += d * d; loo[g].n++;
            if (h <= m.tonal.length) { const e = m.tonal[h - 1] - m.level - (tonal - L.total); ref[g].q += e * e; ref[g].n++; }
        }
    }
}
console.log(`${table.name} v${layer}, variant ${variant}: ${fit.obs.length} cells, ${fit.K} body knots`);
console.log('group      in-sample   zone-out: fit   table model   (rms dB, tonal level re the note total)');
groups.forEach(([lo, hi], g) => console.log(`  h ${String(lo).padStart(2)}-${String(hi).padEnd(3)}   ${rms(inSample[g]).padStart(5)}      ${rms(loo[g]).padStart(5)}        ${rms(ref[g]).padStart(5)}`));

// locking of the residual between neighbouring semitones
const corr = (xs, ys) => {
    const n = xs.length; if (n < 20) return NaN;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    return sxy / Math.sqrt(sxx * syy);
};
const f0Of = new Map(fit.pitches.map((m, i) => [m, fit.f0s[i]]));
for (const [label, hlo, hhi] of [['h 2-8', 2, 8], ['h 9-24', 9, 24], ['h 25-60', 25, 60]]) {
    const byH = [[], []], byF = [[], []], byF2 = [[], []];
    for (const [pitch, r] of residual) {
        const next = residual.get(pitch + 1), next2 = residual.get(pitch + 2); if (!next) continue;
        for (const [h, v] of r) {
            if (h < hlo || h > hhi) continue;
            if (next.has(h)) { byH[0].push(v); byH[1].push(next.get(h)); }
            // the same frequency in the next pitch: harmonic h/ratio, nearest whole harmonic if it is within a fifth of the spacing
            const hn = h * f0Of.get(pitch) / f0Of.get(pitch + 1), near = Math.round(hn);
            if (Math.abs(hn - near) < .2 && next.has(near)) { byF[0].push(v); byF[1].push(next.get(near)); }
            if (next2) { const hm = h * f0Of.get(pitch) / f0Of.get(pitch + 2), nm = Math.round(hm); if (Math.abs(hm - nm) < .2 && next2.has(nm)) { byF2[0].push(v); byF2[1].push(next2.get(nm)); } }
        }
    }
    console.log(`residual ${label}: neighbour correlation by harmonic number ${corr(...byH).toFixed(2)} (${byH[0].length}), by frequency ${corr(...byF).toFixed(2)} (${byF[0].length}), two semitones by frequency ${corr(...byF2).toFixed(2)} (${byF2[0].length})`);
}
// along the harmonics of one note: is the residual a smooth ripple or cell-to-cell scatter?
{ const xs = [], ys = []; for (const r of residual.values()) for (const [h, v] of r) if (h >= 4 && h <= 60 && r.has(h + 1)) { xs.push(v); ys.push(r.get(h + 1)); } console.log(`residual of harmonic h with h+1 (same note): ${corr(xs, ys).toFixed(2)}`); }
// how the body and source look
const at = (f) => fit.body(f).toFixed(1);
console.log('body B(f) dB at 100,150,200,300,400,600,800,1k,1.5k,2k,3k,4k,6k Hz: ' + [100, 150, 200, 300, 400, 600, 800, 1000, 1500, 2000, 3000, 4000, 6000].map(at).join(' '));
console.log('source S(h) dB at h 1,2,3,4,6,8,12,16,24,32,48,64: ' + [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64].map((h) => fit.S[h - 1].toFixed(1)).join(' '));
console.log('tilt b(pitch) dB/octave of h, pitches 36,48,60,72,84: ' + [36, 48, 60, 72, 84].map((m) => fit.b[fit.pitches.indexOf(m)]?.toFixed(1)).join(' ') + '   level a: ' + [36, 48, 60, 72, 84].map((m) => fit.a[fit.pitches.indexOf(m)]?.toFixed(1)).join(' '));
