import { readFileSync } from 'node:fs';
import { unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderSustained, releaseCurve } from '../src/app/engine/stringModel/synth.js';
import { flatten } from '../src/app/engine/stringModel/spectrogram.js';
import { defaultTuning, tunedModelFrom } from '../src/app/engine/stringModel/tuning.js';
const rate = 48000;
for (const patch of ['Long', 'Live']) {
    const table = unpackTable(JSON.parse(readFileSync(`src/library/stringTables/cello${patch}.json`, 'utf8')));
    for (const pitch of (process.argv[2] ?? '81,72').split(',').map(Number)) for (const v of (process.argv[3] ?? '80').split(',').map(Number)) {
        const model = tunedModelFrom(table, pitch, v, defaultTuning(patch.toLowerCase()), pitch), made = renderSustained(model, rate), rel = releaseCurve(model), x = flatten(made, rel, pitch <= 48 ? 5 : 4, rate);
        // jumps: max |x[i+1]-x[i]| in 10 ms windows, report windows far above the median
        const win = 480, vals = []; for (let a = 0; a + win < x.length; a += win) { let m = 0; for (let i = a; i < a + win; i++) m = Math.max(m, Math.abs(x[i + 1] - x[i])); vals.push(m); }
        const sorted = [...vals].sort((p, q) => p - q), med = sorted[sorted.length >> 1];
        const bad = vals.map((v, i) => [i * win / rate, v / med]).filter(([, r]) => r > 2.5);
        if (bad.length || process.env.ALL) console.log(`${patch} ${pitch} v${v} release first gains ${rel.gains.slice(0, 3).map((g) => g.toFixed(2))} loop ${made.loopStart.toFixed(2)}-${made.loopEnd.toFixed(2)}  windows > 2.5x median step: ` + (bad.map(([t, r]) => `${t.toFixed(2)}s x${r.toFixed(1)}`).join(', ') || 'none'));
    }
}
