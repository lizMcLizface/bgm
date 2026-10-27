// Measures every held note of a recorded string calibration take (tools/makeStringCalibrationMidi.mjs).
// Usage: node tools/analyzeStringTake.mjs take.wav timeline.json out.json [--mode sustain|decay] [--pitches 36,39,...]
// sustain: bowed patches that follow the key (Long, Live); decay: plucked or fixed-length samples (Pizzicato, Short).
import { readFileSync, writeFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { analyzeNote } from '../src/app/engine/stringModel/analysis.js';

const arg = (flag, fallback) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : process.argv[i + 1]; };
const [wavPath, timelinePath, outPath] = process.argv.slice(2);
if (!outPath) throw new Error('usage: analyzeStringTake.mjs take.wav timeline.json out.json [--mode sustain|decay]');
const mode = arg('--mode', 'sustain'), only = arg('--pitches', null)?.split(',').map(Number);
const wav = readWav(wavPath), timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const notes = [];
const silent = -60;   // dB: below this the sampler produced nothing (a pitch above its range)
for (const e of timeline.events.filter((ev) => ev.kind === 'held' && (!only || only.includes(ev.pitch)))) {
    const r = analyzeNote(wav.mono, wav.rate, { midi: e.pitch, start: e.start, release: e.release, mode });
    if (!r || r.total < silent) { console.log(`  ${e.pitch} v${e.velocity}: silent or out of range`); continue; }
    notes.push({ ...r, velocity: e.velocity });
    console.log(`  ${String(e.pitch).padStart(3)} v${String(e.velocity).padStart(3)}  f0 ${r.f0.toFixed(2)} (${r.cents >= 0 ? '+' : ''}${r.cents} c)  ${r.total.toFixed(1)} dB  ${r.cells.length} cells${r.vibrato ? `  vibrato ${r.vibrato.rate} Hz ${r.vibrato.depths.join('/')} c` : ''}`);
}
writeFileSync(outPath, JSON.stringify({ source: wavPath.split(/[\/]/).pop(), rate: wav.rate, mode, notes }));
console.log(`${notes.length} notes -> ${outPath}`);
