// Does the model's starting noise have the recording's spectrum? Residual (harmonic lines masked) band levels over the first 120 ms and over
// 120-300 ms, recording against model (the pitch left out of the table), and their difference.
// Usage: node tools/startNoiseCheck.mjs table.json take.wav timeline.json "48,60,72,84" [velocity=80]  (env SCALE sets the starting transient scale, SHAPE=0 the old burst)
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { unpackTable } from '../src/app/engine/stringModel/model.js';
import { defaultTuning, tunedModelFrom } from '../src/app/engine/stringModel/tuning.js';
import { renderDecay, renderSustained } from '../src/app/engine/stringModel/synth.js';
import { analyzeNote, findOnset, startShapeOf, START_FROM, START_RATIO } from '../src/app/engine/stringModel/analysis.js';

const [tablePath, wavPath, timelinePath, pitchList, velArg = '80'] = process.argv.slice(2), velocity = +velArg;
const full = unpackTable(JSON.parse(readFileSync(tablePath, 'utf8'))), wav = readWav(wavPath), rate = wav.rate, timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const unroll = (note) => { const L = note.loopEnd - note.loopStart, x = new Float32Array(3 * rate); for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % L)) * rate)]; } return x; };
const total = {};
const centres = Array.from({ length: 25 }, (_, b) => Math.round(START_FROM * START_RATIO ** (b + .5)));
console.log('band Hz     ' + centres.map((c) => String(c).padStart(5)).join(''));
for (const pitch of pitchList.split(',').map(Number)) {
    const event = timeline.events.find((e) => e.kind === 'held' && e.pitch === pitch && e.velocity === velocity); if (!event) continue;
    const real = analyzeNote(wav.mono, rate, { midi: pitch, start: event.start, release: event.release, mode: full.mode === 'decay' ? 'decay' : 'sustain' }), onset = findOnset(wav.mono, rate, event.start - .05);
    const model = { ...tunedModelFrom(full, pitch, velocity, { ...defaultTuning(process.env.PATCH ?? 'long'), ...(process.env.WAKE ? { wakeDb: +process.env.WAKE } : {}), ...(process.env.TAU ? { noiseTau: +process.env.TAU } : {}), ...(process.env.WAKET ? { wakeTime: +process.env.WAKET } : {}), onset: +(process.env.SCALE ?? 1.5), bed: +(process.env.BED ?? 0) }, pitch), f0: real.f0 }; if (process.env.NOBED) model.bed = null;
    const body = full.mode === 'decay' ? renderDecay(model, rate).buffer : unroll(renderSustained(model, rate)), pad = Math.round(.03 * rate), x = new Float32Array(body.length + pad); x.set(body, pad);
    for (const [label, a, b] of [['0-40ms', 0, .04], ['40-120', .04, .12], ['120-300', .12, .3], ['.3-1 s', .3, 1], ['1-3 s', 1.2, 2.8]]) {
        const r = startShapeOf(wav.mono, rate, onset, real.f0, a, b), m = startShapeOf(x, rate, .03, real.f0, a, b);
        const f = (v) => (v == null ? '    .' : v.toFixed(0).padStart(5));
        if (!process.env.QUIET) { console.log(`${String(pitch).padEnd(3)} ${label} rec ` + r.map(f).join('')); console.log(`        ${' '.repeat(3)}    mod ` + m.map(f).join('')); }
        const d = r.map((v, i) => (v != null && m[i] != null ? m[i] - v : null)), ok = d.filter((v) => v != null);
        { const t = (total[label] ??= []); r.forEach((v, i) => { if (v != null && m[i] != null && v > -150) t.push(m[i] - v); }); }
        if (!process.env.QUIET) console.log(`        ${' '.repeat(3)}    d   ` + d.map(f).join('') + `   mean ${(ok.reduce((s, v) => s + v, 0) / ok.length).toFixed(1)} abs ${(ok.reduce((s, v) => s + Math.abs(v), 0) / ok.length).toFixed(1)}`);
    }
}
console.log('SUMMARY (mean dB model-recording / mean abs, all bands and pitches): ' + Object.entries(total).map(([k, v]) => `${k} ${(v.reduce((a, z) => a + z, 0) / v.length).toFixed(1)}/${(v.reduce((a, z) => a + Math.abs(z), 0) / v.length).toFixed(1)}`).join('  '));
