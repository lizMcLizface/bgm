// A second take for the string model: the pitches the calibration take (makeStringCalibrationMidi.mjs, every third semitone) skipped, so
// every semitone of the range is measured. Held notes only, at the same three dynamics, in the same timeline format, so the same tools
// read it (analyzeStringTake, calibrateBed). Render it through each patch (long, live, short, pizzicato) and export a WAV each.
// Usage: node tools/makeStringDenseMidi.mjs [outDir] [--low 36] [--high 84] [--name cello-dense]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { midiFile } from './makeReferenceMidi.mjs';

const arg = (flag, fallback) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : process.argv[i + 1]; };
const LOW = +arg('--low', 36), HIGH = +arg('--high', 84), GRID_FROM = 36;     // the first take's pitches are 36, 39, 42, ...
const PITCHES = []; for (let p = LOW; p <= HIGH; p++) if ((p - GRID_FROM) % 3 !== 0) PITCHES.push(p);
const DYNAMICS = [40, 80, 127], LEAD_IN = 2, REST = 3.2, HOLD = 4.2;           // the bowed analysis reads to 3.6 s, so every note is held that long
const events = [], timeline = [];
for (const [controller, value] of [[7, 100], [1, 127], [11, 127]]) events.push({ time: .2, bytes: [0xb0, controller, value] });
let t = LEAD_IN;
for (const pitch of PITCHES) for (const dynamic of DYNAMICS) {
    events.push({ time: t - .05, bytes: [0xb0, 1, dynamic] }, { time: t, bytes: [0x90, pitch, dynamic] }, { time: t + HOLD, bytes: [0x80, pitch, 0] });
    timeline.push({ kind: 'held', pitch, velocity: dynamic, start: t, release: t + HOLD });
    t += HOLD + REST;
}
const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'renders/cello-reference', name = arg('--name', 'cello-dense');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${name}.mid`), midiFile(events, t, name));
writeFileSync(join(out, `${name}.timeline.json`), JSON.stringify({ instrument: name, tempo: 120, seconds: t, events: timeline }, null, 1));
console.log(`${name} ${t.toFixed(0)} s (${(t / 60).toFixed(1)} min), ${timeline.length} notes, ${PITCHES.length} pitches ${PITCHES[0]}..${PITCHES.at(-1)}`);
