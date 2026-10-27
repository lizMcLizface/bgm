// How well a string table predicts a note it has not seen: for every measured pitch (not the ends) leave it out, build
// the model from the rest and compare its harmonic cells with the measured ones. Prints, per group of harmonics, the
// RMS and mean difference in dB, and the level difference.  Usage: node tools/evalStringTable.mjs table.json [velocity]
import { readFileSync } from 'node:fs';
import { modelFor, unpackTable } from '../src/app/engine/stringModel/model.js';

const full = unpackTable(JSON.parse(readFileSync(process.argv[2], 'utf8'))), velocity = +(process.argv[3] ?? 80);
const groups = [[1, 1], [2, 2], [3, 4], [5, 8], [9, 16], [17, 32], [33, 80]], stat = groups.map(() => ({ s: 0, q: 0, n: 0 })), level = [];
for (const entry of full.pitches.slice(1, -1)) {
    const real = entry.layers[velocity];
    if (!real) continue;
    const table = { ...full, pitches: full.pitches.filter((p) => p !== entry) }, m = modelFor(table, entry.pitch, velocity, entry.f0);
    level.push(m.level - real.total);
    for (const [h, tonal, noise] of real.cells) {
        if (h === 0) continue;                       // the cell below the fundamental has no harmonic to compare
        const k = h - 1;
        if (k >= m.tonal.length || Math.max(tonal, noise) < real.total - 60) continue;
        const power = (t, n) => 10 * Math.log10(10 ** (t / 10) + 10 ** (n / 10)), d = power(m.tonal[k], m.noise[k]) - power(tonal, noise) - (m.level - real.total);   // shape only
        const g = groups.findIndex(([lo, hi]) => h >= lo && h <= hi);
        stat[g].s += d; stat[g].q += d * d; stat[g].n++;
    }
}
console.log(`${full.name} v${velocity}: spectrum shape error left-one-out (model minus measured, dB)`);
groups.forEach(([lo, hi], g) => stat[g].n && console.log(`  harmonics ${lo}-${hi}: rms ${Math.sqrt(stat[g].q / stat[g].n).toFixed(1)}  mean ${(stat[g].s / stat[g].n).toFixed(1)}  (${stat[g].n} cells)`));
console.log(`  level: rms ${Math.sqrt(level.reduce((s, x) => s + x * x, 0) / level.length).toFixed(1)} dB, worst ${Math.max(...level.map(Math.abs)).toFixed(1)} dB`);
