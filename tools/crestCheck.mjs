// Pulse shape of the start of a note: crest factor (peak over RMS, dB) of the first 100 ms and of 100-400 ms, recording against the model (pitch left out)
// in each phase mode. Usage: node tools/crestCheck.mjs patch "48,60,72" [velocity=80]
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderDecay, renderSustained } from '../src/app/engine/stringModel/synth.js';
import { analyzeNote, findOnset } from '../src/app/engine/stringModel/analysis.js';
import { defaultTuning, tunedModelFrom } from '../src/app/engine/stringModel/tuning.js';
const [patch, pitches, velArg = '80'] = process.argv.slice(2), velocity = +velArg, P = patch[0].toUpperCase() + patch.slice(1);
const table = unpackTable(JSON.parse(readFileSync(`src/library/stringTables/cello${P}.json`, 'utf8'))), decay = table.mode === 'decay';
const wav = readWav(`C:/Users/rimuru/Documents/LUNA Sessions/Strings/Exported Files/Strings - ${P}.wav`), rate = wav.rate, timeline = JSON.parse(readFileSync('renders/cello-reference/cello-calibration.timeline.json', 'utf8'));
const crest = (x, a, b) => { let pk = 0, s = 0; const i0 = Math.round(a * rate), i1 = Math.round(b * rate); for (let i = i0; i < i1; i++) { pk = Math.max(pk, Math.abs(x[i])); s += x[i] ** 2; } return 20 * Math.log10(pk / Math.sqrt(s / (i1 - i0))); };
const unroll = (note) => { const L = note.loopEnd - note.loopStart, x = new Float32Array(3 * rate); for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % L)) * rate)]; } return x; };
for (const pitch of pitches.split(',').map(Number)) {
    const e = timeline.events.find((ev) => ev.kind === 'held' && ev.pitch === pitch && ev.velocity === velocity), onset = findOnset(wav.mono, rate, e.start - .05);
    const row = [`${pitch} rec ${crest(wav.mono, onset, onset + .1).toFixed(1)}/${crest(wav.mono, onset + .1, onset + .4).toFixed(1)}`];
    for (const phase of ['random', 'pulse', 'minimum']) {
        const model = tunedModelFrom(table, pitch, velocity, { ...defaultTuning(patch), phase }, pitch), x = decay ? renderDecay(model, rate).buffer : unroll(renderSustained(model, rate));
        row.push(`${phase} ${crest(x, .004, .1).toFixed(1)}/${crest(x, .1, .4).toFixed(1)}`);
    }
    console.log(row.join('   '));
}
