// How quickly does a bowed note become periodic? Period-to-period correlation (1 = a perfect repeat, 0 = noise) in sliding windows of
// four periods from the onset, for the recording and for the model (pitch left out), several pitches and strengths averaged.
// The part of the waveform that is not a repeat, 1 - coherence, is the noise-like share of the starting transient.
// Usage: node tools/onsetCoherence.mjs table.json take.wav timeline.json "48,60,72" [phase=minimum] [maxMs=300]
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { modelFor, unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderSustained } from '../src/app/engine/stringModel/synth.js';
import { analyzeNote, findOnset } from '../src/app/engine/stringModel/analysis.js';

const [tablePath, wavPath, timelinePath, pitchList, phase = 'minimum', maxArg = '300'] = process.argv.slice(2), maxMs = +maxArg;
const full = unpackTable(JSON.parse(readFileSync(tablePath, 'utf8'))), wav = readWav(wavPath), rate = wav.rate, timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const STEP = 10;                                                   // ms between windows

/** Coherence over `periods` periods from sample `a`, comparing each period with the next. */
function coherence(x, a, period, periods = 4) {
    const cycle = (t0) => Float64Array.from({ length: 64 }, (_, k) => { const p = t0 + k * period / 64, i = Math.floor(p), u = p - i; return x[i] * (1 - u) + x[i + 1] * u; });
    let sum = 0, n = 0;
    for (let q = 0; q < periods; q++) {
        const u = cycle(a + q * period), v = cycle(a + (q + 1) * period), mu = u.reduce((s, z) => s + z, 0) / 64, mv = v.reduce((s, z) => s + z, 0) / 64;
        let c = 0, du = 0, dv = 0; for (let k = 0; k < 64; k++) { c += (u[k] - mu) * (v[k] - mv); du += (u[k] - mu) ** 2; dv += (v[k] - mv) ** 2; }
        if (du > 0 && dv > 0) { sum += c / Math.sqrt(du * dv); n++; }
    }
    return n ? sum / n : NaN;
}
const unroll = (note) => { const L = note.loopEnd - note.loopStart, x = new Float32Array(3 * rate); for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % L)) * rate)]; } return x; };

const times = Array.from({ length: Math.floor(maxMs / STEP) }, (_, i) => i * STEP), acc = { real: times.map(() => []), model: times.map(() => []) };
for (const pitch of pitchList.split(',').map(Number)) for (const velocity of [40, 80, 127]) {
    const event = timeline.events.find((e) => e.kind === 'held' && e.pitch === pitch && e.velocity === velocity); if (!event) continue;
    const real = analyzeNote(wav.mono, rate, { midi: pitch, start: event.start, release: event.release, mode: 'sustain' }), onset = findOnset(wav.mono, rate, event.start - .05), period = rate / real.f0;
    const table = { ...full, pitches: full.pitches.filter((p) => p.pitch !== pitch) }, model = { ...modelFor(table, pitch, velocity, real.f0), wake: { gainDb: -40, tau: .3 }, phase, onsetScale: +(process.env.SCALE ?? 1) }, x = unroll(renderSustained(model, rate));
    times.forEach((ms, i) => { acc.real[i].push(coherence(wav.mono, Math.round((onset + ms / 1000) * rate), period)); acc.model[i].push(coherence(x, Math.round(ms / 1000 * rate), period)); });
}
const mean = (a) => { const v = a.filter(Number.isFinite); return v.reduce((s, z) => s + z, 0) / v.length; };
console.log(`${full.name}: period-to-period coherence in 4-period windows starting at t (mean over pitches ${pitchList}, three strengths)`);
console.log('  t ms    recording   model');
times.forEach((ms, i) => console.log(`  ${String(ms).padStart(4)}     ${mean(acc.real[i]).toFixed(2)}       ${mean(acc.model[i]).toFixed(2)}`));
