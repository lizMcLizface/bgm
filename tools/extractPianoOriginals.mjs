// Cuts the held notes of a recorded calibration take into one short Ogg Opus file for the piano page's A/B listening
// (src/synths/piano): every sixth semitone from A0 at three strengths, back to back, each clip CLIP seconds long.
//   node tools/extractPianoOriginals.mjs take.wav timeline.json out.ogg [--old]
// --old: the earlier take (piano.timeline.json, possibly 96 kHz): its sustained and low notes at velocity 80, 4 s each.
// Writes out.ogg and out.json ({ rate, clip, pitches, velocities }); clip k of pitch i and velocity j starts at (i * velocities + j) * clip.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { wavInfo, readSegment, findFirstSound } from './analyzePianoTake.mjs';
import { decimate } from '../src/app/engine/pianoModel/dsp.js';

const OLD = process.argv.includes('--old'), CLIP = 4.5, RATE = 48000;
const PITCHES = OLD ? null : Array.from({ length: 15 }, (_, i) => 21 + 6 * i), VELOCITIES = OLD ? [80] : [40, 80, 115];
const [wavPath, timelinePath, outPath] = process.argv.slice(2, 5);
if (!outPath) { console.error('usage: node tools/extractPianoOriginals.mjs take.wav timeline.json out.ogg'); process.exit(1); }
const info = wavInfo(wavPath), all = JSON.parse(readFileSync(timelinePath, 'utf8')).events, timeline = all.filter((e) => (OLD ? ['sustained', 'low'].includes(e.kind) && e.velocity === 80 : e.kind === 'held'));
const offset = findFirstSound(info) - all[0].start, factor = Math.round(info.rate / RATE);
if (!OLD && factor !== 1) throw new Error(`expected a ${RATE} Hz take, got ${info.rate}`);
const pitches = PITCHES ?? [...new Set(timeline.map((e) => e.pitch))].sort((a, b) => a - b);
const out = new Float32Array(Math.round(pitches.length * VELOCITIES.length * CLIP * RATE)), fade = Math.round(RATE * .6);
pitches.forEach((pitch, i) => VELOCITIES.forEach((velocity, j) => {
    const e = timeline.find((t) => t.pitch === pitch && t.velocity === velocity);
    if (!e) throw new Error(`no held note ${pitch} at ${velocity}`);
    const x = decimate(readSegment(info, e.start + offset - .01, CLIP), factor), base = (i * VELOCITIES.length + j) * CLIP * RATE | 0;
    for (let k = 0; k < x.length; k++) out[base + k] = x[k] * Math.min(1, (x.length - k) / fade);
}));
const dir = mkdtempSync(join(tmpdir(), 'orig-')), raw = join(dir, 'clips.f32');
writeFileSync(raw, Buffer.from(out.buffer));
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', raw, '-c:a', 'libopus', '-b:a', '36k', '-application', 'audio', outPath], { stdio: 'inherit' });
rmSync(dir, { recursive: true });
if (r.status !== 0) process.exit(1);
writeFileSync(outPath.replace(/\.ogg$/, '.json'), JSON.stringify({ rate: RATE, clip: CLIP, pitches, velocities: VELOCITIES }));
