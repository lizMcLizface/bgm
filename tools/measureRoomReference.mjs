// Measures recorded room impulses (FLAC/WAV, decoded with ffmpeg) into docs/measurements/room-reference.json.
// The recordings are no longer shipped (public/reverb/ went when the rooms became generated); they are
// in git history before that change. This is how the fit targets were taken.
// usage: node tools/measureRoomReference.mjs <dir-with-reverbN.flac> [out.json]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { analyse } from './roomAnalysis.mjs';

const dir = process.argv[2], out = process.argv[3] || 'docs/measurements/room-reference.json';
const SR = 44100, result = {};
for (let n = 1; n <= 6; n++) {
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, `reverb${n}.flac`), '-ar', String(SR), '-ac', '2', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    const f = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4), len = f.length / 2;
    const l = new Float32Array(len), r = new Float32Array(len);
    for (let i = 0; i < len; i++) { l[i] = f[2 * i]; r[i] = f[2 * i + 1]; }
    result[`reverb${n}`] = analyse(l, r, SR);
}
fs.writeFileSync(out, JSON.stringify({ sampleRate: SR, rooms: result }, null, 2) + '\n');
console.log(JSON.stringify(result, (k, v) => typeof v === 'number' ? +v.toFixed(2) : v));
