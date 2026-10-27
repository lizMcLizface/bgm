// What do the noise parts of different notes have in common? For each note the harmonic lines are masked out of short-frame spectra and
// what remains (bow noise, the thump of the start, body ringing) is averaged in third-octave bands over several stretches of the note.
// Compared between notes: the shape over frequency (level minus the note's own mean level) and the level itself.
// Usage: node tools/commonNoise.mjs take.wav timeline.json "72,84" [velocity=80] [allPitches=0]
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { analyzeNote, findOnset, powerSpectrum } from '../src/app/engine/stringModel/analysis.js';

const [wavPath, timelinePath, pitchList, velArg = '80', allArg = '0'] = process.argv.slice(2), velocity = +velArg;
const wav = readWav(wavPath), rate = wav.rate, timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const N = 2048, hz = rate / N, WINDOWS = [['0-80 ms', 0, .08], ['80-300 ms', .08, .3], ['0.3-1 s', .3, 1], ['1.5-3 s', 1.5, 3]];
const EDGES = []; for (let f = 90; f < 6500; f *= 2 ** (1 / 3)) EDGES.push(f);          // third-octave band edges

/** Mean power per bin (dB) in each band over a stretch, with every bin near a harmonic left out. */
function residual(x, onset, f0, from, to) {
    const sums = EDGES.map(() => 0), counts = EDGES.map(() => 0);
    for (let t = from; t < to; t += .01) {
        const start = Math.round((onset + t) * rate) - N / 2; if (start < 0 || start + N > x.length) break;
        const p = powerSpectrum(x, start, N), masked = new Uint8Array(p.length);
        for (let h = 1; h * f0 < 7000; h++) { const f = h * f0, w = Math.max(3 * hz, .012 * f + 2 * hz); for (let k = Math.max(0, Math.floor((f - w) / hz)); k <= Math.min(p.length - 1, Math.ceil((f + w) / hz)); k++) masked[k] = 1; }
        for (let k = 1; k < p.length; k++) {
            if (masked[k]) continue;
            const f = k * hz; let b = EDGES.length - 1; while (b > 0 && EDGES[b] > f) b--;
            if (f < EDGES[0] || f >= EDGES.at(-1) * 2 ** (1 / 3)) continue;
            sums[b] += p[k]; counts[b]++;
        }
    }
    return sums.map((s, b) => (counts[b] > 20 ? 10 * Math.log10(s / counts[b]) : null));
}

const all = allArg === '1' ? [...new Set(timeline.events.filter((e) => e.kind === 'held').map((e) => e.pitch))].filter((p) => p <= 84) : pitchList.split(',').map(Number);
const results = new Map();
for (const pitch of all) {
    const event = timeline.events.find((e) => e.kind === 'held' && e.pitch === pitch && e.velocity === velocity); if (!event) continue;
    const real = analyzeNote(wav.mono, rate, { midi: pitch, start: event.start, release: event.release, mode: 'sustain' }); if (!real) continue;
    const onset = findOnset(wav.mono, rate, event.start - .05);
    results.set(pitch, { f0: real.f0, rows: WINDOWS.map(([, a, b]) => residual(wav.mono, onset, real.f0, a, b)) });
}
const mean = (a) => { const v = a.filter((z) => z != null); return v.reduce((s, z) => s + z, 0) / v.length; };
const corr = (a, b) => { const idx = a.map((_, i) => i).filter((i) => a[i] != null && b[i] != null); const ma = mean(idx.map((i) => a[i])), mb = mean(idx.map((i) => b[i])); let c = 0, da = 0, db = 0; for (const i of idx) { c += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return c / Math.sqrt(da * db); };

if (!all.length) throw new Error('no notes');
const names = [...results.keys()];
if (names.length === 2) {
    const [p, q] = names, a = results.get(p), b = results.get(q);
    console.log(`residual (harmonic lines masked) level per bin, dB, third-octave bands; pitch ${p} (${a.f0.toFixed(0)} Hz) against ${q} (${b.f0.toFixed(0)} Hz), strength ${velocity}`);
    WINDOWS.forEach(([label], w) => {
        console.log(`\n${label}:  level ${mean(a.rows[w]).toFixed(1)} vs ${mean(b.rows[w]).toFixed(1)} dB mean;  shape correlation ${corr(a.rows[w], b.rows[w]).toFixed(2)};  mean absolute difference of shapes ${mean(a.rows[w].map((v, i) => (v != null && b.rows[w][i] != null ? Math.abs((v - mean(a.rows[w])) - (b.rows[w][i] - mean(b.rows[w]))) : null))).toFixed(1)} dB`);
        console.log('  band Hz  ' + EDGES.map((f, i) => (a.rows[w][i] != null && b.rows[w][i] != null ? String(Math.round(f)).padStart(5) : null)).filter(Boolean).join(' '));
        console.log(`  ${String(p).padEnd(7)}  ` + a.rows[w].map((v, i) => (v != null && b.rows[w][i] != null ? v.toFixed(0).padStart(5) : null)).filter(Boolean).join(' '));
        console.log(`  ${String(q).padEnd(7)}  ` + b.rows[w].map((v, i) => (v != null && a.rows[w][i] != null ? v.toFixed(0).padStart(5) : null)).filter(Boolean).join(' '));
    });
} else {
    console.log(`How pitch-independent is the residual? Per window: spread (std over pitches, dB) of the band levels at fixed absolute frequency, ${names.length} pitches, strength ${velocity}`);
    WINDOWS.forEach(([label], w) => {
        const spreadAbs = [], spreadShape = [];
        EDGES.forEach((_, i) => {
            const v = names.map((p) => results.get(p).rows[w][i]).filter((z) => z != null), shape = names.map((p) => { const r = results.get(p).rows[w]; return r[i] != null ? r[i] - mean(r) : null; }).filter((z) => z != null);
            if (v.length >= 4) { const m = mean(v), s = mean(shape); spreadAbs.push(Math.sqrt(v.reduce((a, z) => a + (z - m) ** 2, 0) / v.length)); spreadShape.push(Math.sqrt(shape.reduce((a, z) => a + (z - s) ** 2, 0) / shape.length)); }
        });
        console.log(`  ${label.padEnd(10)} std of level over pitches ${mean(spreadAbs).toFixed(1)} dB (absolute), ${mean(spreadShape).toFixed(1)} dB (after removing each note's mean level)`);
    });
}

// shape correlation between every pair of pitches (third window: 0.3-1 s), to see whether the noise groups by register (string)
if (all.length > 2 && process.env.MATRIX) {
    const w = 2, ps = names;
    console.log(`\nshape correlation of the 0.3-1 s residual between pitches (x10, 9 = 0.9 or more; rows and columns are MIDI pitches)`);
    console.log('       ' + ps.map((p) => String(p).padStart(3)).join(''));
    for (const p of ps) console.log(String(p).padStart(5) + '  ' + ps.map((q) => { const c = corr(results.get(p).rows[w], results.get(q).rows[w]); return String(Math.max(0, Math.min(9, Math.floor(c * 10)))).padStart(3); }).join(''));
}
