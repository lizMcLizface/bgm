// The flare at the start of a plucked or short note (synth.js flare, analysis.js skirtRatio): the share n(t) of each harmonic's power that starts as noise
// in a lobe round the line, found by closed loop. The recording's skirt-to-peak ratio at SKIRT_TIMES (mean over the notes) is the target; the model
// (pitch left out, current table) is rendered with a guess for n(t), its ratio measured the same way, and n corrected, three times. Written as `skirt` into
// the analysis json (packTable carries it into the table).
// Usage: node tools/calibrateSkirt.mjs table.json take.wav timeline.json analysis.json patch [pitches=48,54,60,66,72,78,84] [velocities=80,127]
import { readFileSync, writeFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderDecay } from '../src/app/engine/stringModel/synth.js';
import { findOnset, skirtRatio, SKIRT_TIMES } from '../src/app/engine/stringModel/analysis.js';
import { defaultTuning, tunedModelFrom } from '../src/app/engine/stringModel/tuning.js';

const [tablePath, wavPath, timelinePath, analysisPath, patch, pitchArg = '48,54,60,66,72,78,84', velArg = '80,127'] = process.argv.slice(2);
const table = unpackTable(JSON.parse(readFileSync(tablePath, 'utf8'))), wav = readWav(wavPath), rate = wav.rate, timeline = JSON.parse(readFileSync(timelinePath, 'utf8')), analysis = JSON.parse(readFileSync(analysisPath, 'utf8'));
const K = .116;                                        // n/(1-n) = ratio / K for a Gaussian lobe of 60 Hz (the geometry in synth.js flare and skirtRatio)
const notes = [];
for (const pitch of pitchArg.split(',').map(Number)) for (const velocity of velArg.split(',').map(Number)) {
    const e = timeline.events.find((ev) => ev.kind === 'held' && ev.pitch === pitch && ev.velocity === velocity), measured = analysis.notes.find((n) => n.pitch === pitch && n.velocity === velocity); if (!e || !measured) continue;
    const onset = findOnset(wav.mono, rate, e.start - .05);
    notes.push({ pitch, velocity, f0: measured.f0, onset, target: SKIRT_TIMES.map((t) => skirtRatio(wav.mono, rate, onset, measured.f0, t)) });
}
const mean = (list) => list.filter((v) => v != null).reduce((s, v) => s + v, 0) / list.filter((v) => v != null).length;
const target = SKIRT_TIMES.map((_, i) => mean(notes.map((n) => n.target[i])));
function modelRatios(n) {
    const rows = notes.map((note) => {
        const model = { ...tunedModelFrom({ ...table, skirt: { times: SKIRT_TIMES, n } }, note.pitch, note.velocity, { ...defaultTuning(analysis.patch ?? patch), flare: 1 }, note.pitch), f0: note.f0 }, body = renderDecay(model, rate).buffer, pad = Math.round(.03 * rate), x = new Float32Array(body.length + pad);
        x.set(body, pad); return SKIRT_TIMES.map((t) => skirtRatio(x, rate, .03, note.f0, t));
    });
    return SKIRT_TIMES.map((_, i) => mean(rows.map((r) => r[i])));
}
const lin = (db) => 10 ** (db / 10);
let n = SKIRT_TIMES.map(() => 0), base = modelRatios(n), x = SKIRT_TIMES.map((_, i) => Math.max(0, lin(target[i]) - lin(base[i])) / K);
console.log('recording ratio  ' + target.map((v) => v.toFixed(1)).join(' ') + '\nmodel, no flare  ' + base.map((v) => v.toFixed(1)).join(' '));
for (let pass = 0; pass < 3; pass++) {
    n = x.map((v) => +(v / (1 + v)).toFixed(3));
    const got = modelRatios(n);
    console.log(`pass ${pass}: n ${n.join(' ')}  model ratio ${got.map((v) => v.toFixed(1)).join(' ')}`);
    x = x.map((v, i) => (target[i] > base[i] + .5 ? Math.max(1e-3, v * Math.min(4, Math.max(.25, lin(target[i] - base[i]) / lin(Math.max(.2, got[i] - base[i]))))) : 0));
}
analysis.skirt = { times: SKIRT_TIMES, n: x.map((v, i) => (SKIRT_TIMES[i] > .06 ? 0 : +(v / (1 + v)).toFixed(3))) };   // an onset effect: later ratios are the string's own beating, not the flare
writeFileSync(analysisPath, JSON.stringify(analysis));
console.log('skirt n: ' + analysis.skirt.n.join(' '));
