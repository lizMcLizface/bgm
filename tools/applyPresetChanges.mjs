// Bakes the changes dumped by the preset tool (/tools/presetter/, "Dump to file") into src/library/scenes.json.
//   node tools/applyPresetChanges.mjs <dump.json>          writes scenes.json and prints what changed
//   node tools/applyPresetChanges.mjs <dump.json> --dry    only prints
// A hidden revision copy of a preset that was the same as it gets the same change, so the pair still match. Notes and verdicts are not
// kept in the library; the presets marked "Needs a tweak" or "Needs redoing" are listed, for what is next.
import fs from 'node:fs';
import { bakeLibrary } from '../src/presetter/changes.js';

const [file, ...flags] = process.argv.slice(2), DRY = flags.includes('--dry'), LIBRARY = 'src/library/scenes.json';
if (!file) { console.error('Usage: node tools/applyPresetChanges.mjs <dump.json> [--dry]'); process.exit(1); }
const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
if (dump.format !== 'bgm-presetter' || typeof dump.presets !== 'object') { console.error('Not a presetter dump.'); process.exit(1); }

const { library, applied, missing, warned, next } = bakeLibrary(JSON.parse(fs.readFileSync(LIBRARY, 'utf8')), dump);
if (!DRY && applied.length) fs.writeFileSync(LIBRARY, JSON.stringify(library, null, 2) + '\n');
console.log(`${applied.length} presets changed${DRY ? ' (dry run)' : ''}:\n  ${applied.join('\n  ') || 'none'}`);
if (missing.length) console.log(`Not in the library: ${missing.join(', ')}`);
if (warned.length) console.log(`Not kept:\n  ${warned.join('\n  ')}`);
if (next.length) console.log(`Still marked for work:\n  ${next.join('\n  ')}`);
