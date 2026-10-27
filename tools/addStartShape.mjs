// Adds the bow-noise shape (analysis.js startShapeOf) to an existing take analysis without measuring everything again.
// Usage: node tools/addStartShape.mjs take.wav timeline.json analysis.json
import { readFileSync, writeFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { findOnset, startShapeOf } from '../src/app/engine/stringModel/analysis.js';

const [wavPath, timelinePath, analysisPath] = process.argv.slice(2);
if (!analysisPath) throw new Error('usage: addStartShape.mjs take.wav timeline.json analysis.json');
const wav = readWav(wavPath), timeline = JSON.parse(readFileSync(timelinePath, 'utf8')), analysis = JSON.parse(readFileSync(analysisPath, 'utf8'));
for (const note of analysis.notes) {
    const e = timeline.events.find((ev) => ev.kind === 'held' && ev.pitch === note.pitch && ev.velocity === note.velocity); if (!e) continue;
    const onset = findOnset(wav.mono, wav.rate, e.start - .05);
    note.startShape = startShapeOf(wav.mono, wav.rate, onset, note.f0).map((v) => (v == null ? null : Math.round(v * 10) / 10));
}
writeFileSync(analysisPath, JSON.stringify(analysis));
console.log(`${analysis.notes.length} notes updated`);
