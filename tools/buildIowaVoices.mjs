// Lists the instruments of src/app/engine/iowaModel/patches.js in the instrument list (src/library/voices.json, category "Iowa & VSCO"), each with the range its table reaches,
// which the generator keeps its part inside (composition/registerShift.js). Names are appended to SHAREABLE_PRESETS, whose order must never change.
//   node tools/buildIowaVoices.mjs       after tools/analyzeIowa.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { PATCHES } from '../src/app/engine/iowaModel/patches.js';
import { settleLevels, pitchRange } from '../src/app/engine/iowaModel/model.js';

export const CATEGORY = 'Iowa & VSCO';
const voiceName = (patch) => `${patch.source === 'vsco' ? 'VSCO' : 'Iowa'} ${patch.name.replace('♭', 'b')}`;
const raw = readFileSync('src/library/voices.json', 'utf8'), entries = {};
for (const patch of PATCHES) {
    const table = settleLevels(JSON.parse(readFileSync(`src/library/iowaTables/${patch.uses ?? patch.id}.json`, 'utf8')));
    entries[voiceName(patch)] = { iowa: patch.id, iowaSource: patch.source === 'vsco' ? 'vsco' : 'iowa', range: pitchRange(table), ...(patch.glide ? { glide: patch.glide } : {}), masterVolume: 1, reverbAmount: .25 };
}
// Only this category's text changes: the rest of the file keeps its formatting, so a rebuild's diff is just this.
const entryText = Object.entries(entries).map(([name, entry]) => `    ${JSON.stringify(name)}: ${JSON.stringify(entry)}`).join(',\n');
const block = `  ${JSON.stringify(CATEGORY)}: {\n${entryText}\n  }`, marker = `,\n  ${JSON.stringify(CATEGORY)}: {`, already = raw.indexOf(marker);
const close = raw.lastIndexOf('\n}'), rest = raw.slice(close);
writeFileSync('src/library/voices.json', `${raw.slice(0, already >= 0 ? already : close)},\n${block}${rest}`);

const share = readFileSync('src/app/shareCode.js', 'utf8'), missing = Object.keys(entries).filter((name) => !share.includes(`'${name}'`));
if (missing.length) {
    const end = share.indexOf('];', share.indexOf('export const SHAREABLE_PRESETS'));
    const lines = ['    // measured from the Iowa and VSCO recordings (engine/iowaModel)'];
    for (let i = 0; i < missing.length; i += 5) lines.push(`    ${missing.slice(i, i + 5).map((name) => `'${name}',`).join(' ')}`);
    writeFileSync('src/app/shareCode.js', `${share.slice(0, end)}${lines.join('\n')}\n${share.slice(end)}`);
}
console.log(`${Object.keys(entries).length} voices in "${CATEGORY}", ${missing.length} new names in SHAREABLE_PRESETS`);
