// How long does a note take to render? node tools/timeStringRender.mjs [patch=Long] [pitches=36,60,84]  (env NOBED=1, NOWAKE=1, NOSHIMMER=1 switch parts off)
import { readFileSync } from 'node:fs';
import { unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderDecay, renderSustained } from '../src/app/engine/stringModel/synth.js';
import { defaultTuning, tunedModelFrom } from '../src/app/engine/stringModel/tuning.js';
const patch = process.argv[2] ?? 'Long', table = unpackTable(JSON.parse(readFileSync(`src/library/stringTables/cello${patch}.json`, 'utf8')));
for (const pitch of (process.argv[3] ?? '36,60,84').split(',').map(Number)) {
    const tuning = { ...defaultTuning(patch.toLowerCase()), ...(process.env.NOWAKE ? { wakeDb: -40 } : {}), ...(process.env.NOSHIMMER ? { shimmer: 0 } : {}) };
    const t0 = performance.now(), model = tunedModelFrom(table, pitch, 80, tuning); if (process.env.NOBED) model.bed = null;
    const t1 = performance.now(); table.mode === 'decay' ? renderDecay(model, 48000) : renderSustained(model, 48000); const t2 = performance.now();
    console.log(`${patch} ${pitch}: model ${(t1 - t0).toFixed(0)} ms, render ${(t2 - t1).toFixed(0)} ms`);
}
