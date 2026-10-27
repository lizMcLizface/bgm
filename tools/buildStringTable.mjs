// Packs a string take's analysis (tools/analyzeStringTake.mjs) into the file the app loads (stringModel/model.js).
//   node tools/buildStringTable.mjs analysis.json out.json [--name "Cello Long"]
import { readFileSync, writeFileSync } from 'node:fs';
import { packTable } from '../src/app/engine/stringModel/model.js';

const [inPath, outPath] = process.argv.slice(2, 4);
if (!outPath) { console.error('usage: node tools/buildStringTable.mjs analysis.json out.json [--name "Cello Long"]'); process.exit(1); }
const flag = process.argv.indexOf('--name'), name = flag < 0 ? 'strings' : process.argv[flag + 1];
const file = packTable(JSON.parse(readFileSync(inPath, 'utf8')), { name });
const text = JSON.stringify(file);
writeFileSync(outPath, text);
console.error(`${file.pitches.length} pitches, ${file.mode}, ${(text.length / 1024).toFixed(0)} KB`);
