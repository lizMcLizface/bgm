// How regular is a note's waveform from one period to the next? For a stretch of the note, the correlation between each period and the
// next (resampled to the same length), averaged; 1 is a perfectly periodic tone, 0 is noise. Also the crest factor (peak / RMS).
// Reports the recording and the model (pitch left out), for a few noise shares.
// Usage: node tools/periodicity.mjs table.json take.wav timeline.json pitch fromMs toMs [shares="1,.3,.1"] [phase=random]
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { modelFor, unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderSustained, renderDecay } from '../src/app/engine/stringModel/synth.js';
import { analyzeNote, findOnset } from '../src/app/engine/stringModel/analysis.js';

const [tablePath, wavPath, timelinePath, pitchArg, fromArg, toArg, sharesArg = '1,.3,.1', phase = 'random'] = process.argv.slice(2), pitch = +pitchArg, from = +fromArg / 1000, to = +toArg / 1000;
const full = unpackTable(JSON.parse(readFileSync(tablePath, 'utf8'))), table = process.env.KEEP ? full : { ...full, pitches: full.pitches.filter((p) => p.pitch !== pitch) };
const wav = readWav(wavPath), rate = wav.rate, event = JSON.parse(readFileSync(timelinePath, 'utf8')).events.find((e) => e.kind === 'held' && e.pitch === pitch && e.velocity === 80);
const real = analyzeNote(wav.mono, rate, { midi: pitch, start: event.start, release: event.release, mode: full.mode }), onset = findOnset(wav.mono, rate, event.start - .05);

function measure(x, start) {
    const period = rate / real.f0, a = Math.round((start + from) * rate), b = Math.round((start + to) * rate), cuts = [];
    for (let t = a; t + 2 * period < b; t += period) cuts.push(t);
    const cycle = (t0) => Float64Array.from({ length: 64 }, (_, k) => { const p = t0 + k * period / 64, i = Math.floor(p), u = p - i; return x[i] * (1 - u) + x[i + 1] * u; });
    let sum = 0, n = 0;
    for (const t of cuts) {
        const u = cycle(t), v = cycle(t + period), mu = u.reduce((s, q) => s + q, 0) / 64, mv = v.reduce((s, q) => s + q, 0) / 64;
        let c = 0, du = 0, dv = 0; for (let k = 0; k < 64; k++) { c += (u[k] - mu) * (v[k] - mv); du += (u[k] - mu) ** 2; dv += (v[k] - mv) ** 2; }
        if (du > 0 && dv > 0) { sum += c / Math.sqrt(du * dv); n++; }
    }
    let peak = 0, e = 0; for (let i = a; i < b; i++) { peak = Math.max(peak, Math.abs(x[i])); e += x[i] * x[i]; }
    return { coherence: sum / Math.max(1, n), crest: peak / Math.sqrt(e / (b - a)) };
}
const unroll = (note) => { if (note.loopStart == null) return note.buffer; const L = note.loopEnd - note.loopStart, x = new Float32Array(4 * rate); for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % L)) * rate)]; } return x; };
const r = measure(wav.mono, onset);
console.log(`${full.name} pitch ${pitch} (${real.f0.toFixed(0)} Hz), ${from * 1000}-${to * 1000} ms: period-to-period correlation / crest factor`);
console.log(`  recording         ${r.coherence.toFixed(2)}  ${r.crest.toFixed(1)}`);
for (const share of sharesArg.split(',').map(Number)) {
    const base = modelFor(table, pitch, 80, real.f0, { noiseShare: share }), model = { ...base, noise: base.noise.map((v) => v + +(process.env.NOISEDB ?? 0)), wake: { gainDb: 0, tau: .3 }, phase }, note = full.mode === 'sustain' ? renderSustained(model, rate) : renderDecay(model, rate), m = measure(unroll(note), 0);
    console.log(`  model share ${String(share).padEnd(6)} ${m.coherence.toFixed(2)}  ${m.crest.toFixed(1)}`);
}
