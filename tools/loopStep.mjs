// Is a rendered bowed note's loop seamless? The largest jump across the loop point against the largest sample-to-sample change inside the loop.
// Usage: node tools/loopStep.mjs [patch=Long] [pitches=81,72,60,48] (env NOBED=1, NOWAKE=1)
import { readFileSync } from 'node:fs';
import { unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderSustained } from '../src/app/engine/stringModel/synth.js';
import { defaultTuning, tunedModelFrom } from '../src/app/engine/stringModel/tuning.js';
const patch = process.argv[2] ?? 'Long', table = unpackTable(JSON.parse(readFileSync(`src/library/stringTables/cello${patch}.json`, 'utf8'))), rate = 48000;
for (const pitch of (process.argv[3] ?? '81,72,60,48').split(',').map(Number)) {
    const model = tunedModelFrom(table, pitch, 80, { ...defaultTuning(patch.toLowerCase()), ...(process.env.NOWAKE ? { wakeDb: -40 } : {}) }); if (process.env.NOBED) model.bed = null;
    const note = renderSustained(model, rate), b = note.buffer, a = Math.round(note.loopStart * rate), e = Math.round(note.loopEnd * rate);
    let slope = 0; for (let i = a; i < e - 1; i++) slope = Math.max(slope, Math.abs(b[i + 1] - b[i]));
    const jump = Math.abs(b[a] - b[e - 1]);
    console.log(`${patch} ${pitch}: loop ${(note.loopStart).toFixed(3)}-${note.loopEnd.toFixed(3)} s, jump ${jump.toExponential(2)} vs max step ${slope.toExponential(2)} (ratio ${(jump / slope).toFixed(2)})`);
}
