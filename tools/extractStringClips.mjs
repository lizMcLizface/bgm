// Cuts the held notes of a string calibration take into one 16-bit mono WAV each, for the A/B panel on /synths/strings/.
// They are the sampler's own audio, so they go into the git-ignored banks/cello-reference/ (served only by the local
// dev and preview servers, never published). Usage: node tools/extractStringClips.mjs [takesDir] [timeline.json]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readWav } from './refAnalyze.mjs';
import { findOnset } from '../src/app/engine/stringModel/analysis.js';

const dir = process.argv[2] ?? 'C:/Users/rimuru/Documents/LUNA Sessions/Strings/Exported Files', timelinePath = process.argv[3] ?? 'renders/cello-reference/cello-calibration.timeline.json';
const out = 'banks/cello-reference', timeline = JSON.parse(readFileSync(timelinePath, 'utf8')); mkdirSync(out, { recursive: true });
const wavBytes = (x, rate) => {
    const b = Buffer.alloc(44 + x.length * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
    for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
    return b;
};
for (const [patch, bowed] of [['long', true], ['live', true], ['short', false], ['pizzicato', false]]) {
    const wav = readWav(join(dir, `Strings - ${patch[0].toUpperCase() + patch.slice(1)}.wav`)); let count = 0;
    for (const e of timeline.events.filter((ev) => ev.kind === 'held')) {
        const onset = findOnset(wav.mono, wav.rate, e.start - .05);
        if (onset == null || onset - e.start > .15) continue;                      // a pitch the instrument does not play
        const from = Math.round(onset * wav.rate), seconds = bowed ? e.release - e.start + 1.2 : 3.5;
        writeFileSync(join(out, `cello-${patch}-${e.pitch}-${e.velocity}.wav`), wavBytes(wav.mono.subarray(from, from + Math.round(seconds * wav.rate)), wav.rate)); count++;
    }
    console.log(patch, count, 'clips');
}
