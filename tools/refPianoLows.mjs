// Compares the low notes of several piano recordings of piano.mid (see makeReferenceMidi.mjs) with the model:
// for each pitch, stiffness B and the level of partials 1..16 over the first 0.4 s, in dB below the strongest.
// Usage: node tools/refPianoLows.mjs timeline.json recording.wav... [--model type]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readWav } from './refAnalyze.mjs';
import { envelope, firstNoteOffset } from './refTimeline.mjs';
import { analyzeNote } from './refCompare.mjs';
import { renderAcousticPiano } from '../src/app/engine/acousticPiano.js';

const args = process.argv.slice(2), timeline = JSON.parse(readFileSync(args.shift(), 'utf8'));
const mi = args.indexOf('--model'), types = mi >= 0 ? args.splice(mi, args.length).slice(1) : ['grand'];
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const events = timeline.events.filter((e) => (e.kind === 'low' || (e.kind === 'sustained' && e.pitch <= 48 && e.velocity === 80)));
const unique = [...new Map(events.map((e) => [e.pitch, e])).values()].sort((a, b) => a.pitch - b.pitch);
const rows = {};   // pitch -> [{name, note}]
const add = (pitch, name, note) => (rows[pitch] ??= []).push({ name, note });
const rel = (note) => { const top = Math.max(...note.levels.filter(Boolean).map((l) => l[0])); return note.levels.map((l) => (l ? Math.round(20 * Math.log10(l[0] / top)) : null)); };

for (const path of args) {
    const wav = readWav(path), offset = firstNoteOffset(envelope(wav), timeline.events[0].start) ?? 0, name = basename(path, '.wav').replace('Pianos - ', '');
    for (const e of unique) add(e.pitch, name, analyzeNote(wav.mono, wav.rate, e.start + offset, hz(e.pitch)));
    console.error('read', name);
}
for (const type of types) for (const e of unique) add(e.pitch, `MODEL ${type}`, analyzeNote(renderAcousticPiano(48000, hz(e.pitch), { type, velocity: .62, decay: 2.8, brightness: .55, hammer: .45, unison: .25, resonance: .6, seed: 11 }), 48000, 0, hz(e.pitch)));
for (const pitch of Object.keys(rows)) {
    console.log(`\nMIDI ${pitch} (${hz(pitch).toFixed(1)} Hz)            partials 1..16, dB re strongest`);
    for (const { name, note } of rows[pitch]) console.log(`${name.padEnd(13)} B=${note.B.toExponential(1)} f1=${note.f1.toFixed(1).padStart(6)} ` + rel(note).map((v) => (v === null ? '   -' : String(v).padStart(4))).join(''));
}
