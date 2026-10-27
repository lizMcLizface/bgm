// A short MIDI take for judging a piano's bass attack against a real sampled piano: seven low pitches,
// each struck soft, medium and hard and held 3 s, then short (0.25 s) at medium. Render it through a piano
// you like, export a WAV, then compare its first 100 ms with the model (spectrograms, attack ratios).
// Usage: node tools/makePianoBassMidi.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { midiFile } from './makeReferenceMidi.mjs';

const PITCHES = [28, 33, 36, 40, 43, 48, 52], VELOCITIES = [45, 80, 115], HOLD = 3, REST = 2, LEAD_IN = 2;
const events = [], timeline = [];
// Samplers often start with the mod wheel and expression at 0, which is silent: open them first.
for (const [controller, value] of [[7, 100], [1, 127], [11, 127]]) events.push({ time: .2, bytes: [0xb0, controller, value] });
let t = LEAD_IN;
const note = (pitch, velocity, length, kind) => {
    events.push({ time: t, bytes: [0x90, pitch, velocity] }, { time: t + length, bytes: [0x80, pitch, 0] });
    timeline.push({ kind, pitch, velocity, start: t, release: t + length });
    t += length + REST;
};
for (const pitch of PITCHES) for (const velocity of VELOCITIES) note(pitch, velocity, HOLD, 'held');
for (const pitch of PITCHES) note(pitch, 80, .25, 'short');
const seconds = t;

const out = process.argv[2] ?? 'renders/piano-reference';
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'piano-bass-attack.mid'), midiFile(events, seconds, 'piano-bass-attack'));
writeFileSync(join(out, 'piano-bass-attack.timeline.json'), JSON.stringify({ instrument: 'piano-bass-attack', tempo: 120, seconds, events: timeline }, null, 1));
console.log(`piano-bass-attack ${seconds.toFixed(0)} s, pitches ${PITCHES.join(' ')}`);
