// Leave-one-out check of a string table: renders `pitch` from a table without that pitch, analyses the result the way
// the recording was analysed, and prints the differences. With --wav out.wav writes the real note then the model's.
// Usage: node tools/checkStringModel.mjs table.json take.wav timeline.json [--pitch 60] [--velocity 80] [--wav out.wav]
import { readFileSync, writeFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { modelFor, unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderSustained, renderDecay } from '../src/app/engine/stringModel/synth.js';
import { analyzeNote, ENV_TIMES } from '../src/app/engine/stringModel/analysis.js';

const arg = (flag, fallback) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : process.argv[i + 1]; };
const [tablePath, wavPath, timelinePath] = process.argv.slice(2);
const pitch = +arg('--pitch', 60), velocity = +arg('--velocity', 80), outPath = arg('--wav', null);
const full = unpackTable(JSON.parse(readFileSync(tablePath, 'utf8')));
const table = process.argv.includes('--keep') ? full : { ...full, pitches: full.pitches.filter((p) => p.pitch !== pitch) };
const wav = readWav(wavPath), event = JSON.parse(readFileSync(timelinePath, 'utf8')).events.find((e) => e.kind === 'held' && e.pitch === pitch && e.velocity === velocity);
const rate = wav.rate, sustain = table.mode === 'sustain';
const real = analyzeNote(wav.mono, rate, { midi: pitch, start: event.start, release: event.release, mode: table.mode });
const model = modelFor(table, pitch, velocity, real.f0);
const t0 = Date.now();
const note = sustain ? renderSustained(model, rate) : renderDecay(model, rate);
const took = Date.now() - t0;
// the rendered note starts at 0; analyse it the same way (a sustained note is looped out to 4 s first)
let rendered = note.buffer;
if (sustain) {
    const out = new Float32Array(Math.round(5 * rate)), loopLen = Math.round((note.loopEnd - note.loopStart) * rate);
    for (let i = 0; i < out.length; i++) { const t = i / rate; out[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % (note.loopEnd - note.loopStart))) * rate)]; }
    rendered = out;
}
const mine = analyzeNote(rendered, rate, { midi: pitch, start: 0, mode: table.mode, release: null });
const db = (a, b) => (a - b).toFixed(1).padStart(6);
console.log(`${table.name} pitch ${pitch} v${velocity}: ${sustain ? 'loop ' + note.loop.L.toFixed(2) + ' s, ' + note.loop.k + ' vibrato cycles' : 'decay'}; rendered in ${took} ms; model ${model.tonal.length} harmonics`);
console.log(`total level: real ${real.total} dB, model ${mine.total} dB (${db(mine.total, real.total)})`);
console.log(`pitch: real ${real.f0} Hz, model ${mine.f0} Hz`);
if (real.vibrato) console.log(`vibrato: real ${real.vibrato.rate} Hz ${real.vibrato.depths.join('/')} c; model ${mine.vibrato.rate} Hz ${mine.vibrato.depths.join('/')} c`);
// spectrum by octave of harmonic number: mean cell dB difference (model minus real), against what the neighbours alone say
const groups = [[1, 1], [2, 2], [3, 4], [5, 8], [9, 16], [17, 32], [33, 64], [65, 128]];
const row = (cells) => (lo, hi) => { const v = cells.filter(([h]) => h >= lo && h <= hi); return v.length ? 10 * Math.log10(v.reduce((s, [, t, n]) => s + 10 ** (t / 10) + 10 ** (n / 10), 0) / v.length) : null; };
const r = row(real.cells), m = row(mine.cells);
console.log('harmonics    real dB   model dB   diff   (per-cell power, tonal + noise)');
for (const [lo, hi] of groups) { const a = r(lo, hi), b = m(lo, hi); if (a != null && b != null) console.log(`${String(lo).padStart(4)}-${String(hi).padEnd(4)}  ${a.toFixed(1).padStart(8)}  ${b.toFixed(1).padStart(8)}  ${db(b, a)}`); }
console.log('band envelopes (dB re steady), band: time (s) real/model');
for (let b = 0; b < real.env.length; b++) {
    if (!real.env[b] || !mine.env[b]) continue;
    console.log(`  band ${b}: ` + [3, 6, 8, 10, 12, 14, 16, 18].map((i) => `${ENV_TIMES[i]}s ${real.env[b][i]}/${mine.env[b][i]}`).join('  '));
}
if (outPath) {
    const seconds = 5, a = wav.mono.subarray(Math.round((event.start) * rate), Math.round((event.start + seconds) * rate)), n = Math.round(seconds * rate);
    const data = new Float32Array(n * 2 + Math.round(.5 * rate)); data.set(a, 0); data.set(rendered.subarray(0, n), n + Math.round(.5 * rate));
    const buf = Buffer.alloc(44 + data.length * 4);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + data.length * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(data.length * 4, 40);
    for (let i = 0; i < data.length; i++) buf.writeFloatLE(data[i], 44 + i * 4);
    writeFileSync(outPath, buf); console.log('wrote ' + outPath);
}
