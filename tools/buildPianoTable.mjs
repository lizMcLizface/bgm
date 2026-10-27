// Packs the notes analyzePianoTake measured into the file the app loads (pianoModel/tableFile.js).
//   node tools/buildPianoTable.mjs analysis.json out.json [--name "Grand"]
import { readFileSync, writeFileSync } from 'node:fs';
import { packTable } from '../src/app/engine/pianoModel/tableFile.js';

const [inPath, outPath] = process.argv.slice(2, 4);
if (!outPath) { console.error('usage: node tools/buildPianoTable.mjs analysis.json out.json [--name "Grand"]'); process.exit(1); }
const flag = process.argv.indexOf('--name'), name = flag < 0 ? 'piano' : process.argv[flag + 1];
const data = JSON.parse(readFileSync(inPath, 'utf8'));
const file = packTable(data.notes, { name, rate: data.rate });
const text = JSON.stringify(file);
writeFileSync(outPath, text);
console.error(`${file.notes.length} notes, ${file.notes.reduce((a, n) => a + n.partials.length, 0)} partials, reference velocity ${file.reference}, ${(text.length / 1024).toFixed(0)} KB`);
