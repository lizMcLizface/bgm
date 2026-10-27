// How deep the valleys between harmonics are, original against model (leave-one-out): per group of harmonics, the mean
// level of the bins midway between harmonics relative to the harmonic peaks, over the steady part of a note.
// Usage: node tools/valleyDepth.mjs table.json take.wav timeline.json [pitch=48] [velocity=80]
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { modelFor, unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderSustained, renderDecay } from '../src/app/engine/stringModel/synth.js';
import { powerSpectrum, analyzeNote } from '../src/app/engine/stringModel/analysis.js';

const [tablePath, wavPath, timelinePath, pitchArg = '48', velArg = '80'] = process.argv.slice(2), pitch = +pitchArg, velocity = +velArg;
const full = unpackTable(JSON.parse(readFileSync(tablePath, 'utf8'))), table = { ...full, pitches: full.pitches.filter((p) => p.pitch !== pitch) };
const wav = readWav(wavPath), event = JSON.parse(readFileSync(timelinePath, 'utf8')).events.find((e) => e.kind === 'held' && e.pitch === pitch && e.velocity === velocity);
const rate = wav.rate, real = analyzeNote(wav.mono, rate, { midi: pitch, start: event.start, release: event.release, mode: full.mode });
const model = modelFor(table, pitch, velocity, real.f0), note = full.mode === 'sustain' ? renderSustained(model, rate) : renderDecay(model, rate);
let x = note.buffer;
if (full.mode === 'sustain') { const L = note.loopEnd - note.loopStart; x = new Float32Array(5 * rate); for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % L)) * rate)]; } }
const N = 16384, hz = rate / N, groups = [[1, 4], [5, 8], [9, 16], [17, 32], [33, 64]];
function depth(signal, from) {
    const p = powerSpectrum(signal, from, N), out = groups.map(() => ({ peak: 0, valley: 0, n: 0 }));
    for (let h = 1; h <= 64; h++) {
        const g = groups.findIndex(([lo, hi]) => h >= lo && h <= hi), f = real.f0 * h, w = .1 * real.f0 / hz;
        if (f * 1.05 > 8000) break;
        const at = (c, lo, hi) => { let s = 0, n = 0; for (let k = Math.round(c / hz - lo); k <= Math.round(c / hz + hi); k++) { s += p[k]; n++; } return [s, n]; };
        let peak = 0; for (let k = Math.round(f / hz - w); k <= Math.round(f / hz + w); k++) peak = Math.max(peak, p[k]);
        const [s, n] = at(f + real.f0 / 2, w, w);
        out[g].peak += peak; out[g].valley += s / n; out[g].n++;
    }
    return out.map((o) => (o.n ? 10 * Math.log10(o.valley / o.peak) : null));
}
const a = depth(wav.mono, Math.round((event.start + 1.6) * rate)), b = depth(x, Math.round(1.6 * rate));
console.log(`${full.name} pitch ${pitch}: valley level below the harmonic peaks (dB), steady part`);
groups.forEach(([lo, hi], i) => console.log(`  harmonics ${lo}-${hi}: original ${a[i]?.toFixed(1)}  model ${b[i]?.toFixed(1)}  (model deeper by ${(a[i] - b[i]).toFixed(1)})`));
