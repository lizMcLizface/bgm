// The MIDI take for calibrating a piano model against a real piano: every third semitone from A0 to C8,
// each struck soft, medium and hard and held (longer in the bass, where notes ring for many seconds), then
// the same pitches short at medium strength (attack and release), a repeated note, and a short pedal
// section (sympathetic resonance and the pedal's release). Render it through the piano twice, with the
// sampler's dynamics on and off, and export a WAV each time; the timeline JSON says what was played when.
// Usage: node tools/makePianoCalibrationMidi.mjs [outDir] [--controllers open|none|cc1]
//   open (default): mod wheel and expression fully open before the first note, as the other reference takes do
//   none:           no controller messages at all, so a sampler that maps dynamics to velocity alone is not overridden
//   cc1:            the mod wheel (CC1) is set to the velocity before every note, for samplers that take dynamics from it
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { midiFile } from './makeReferenceMidi.mjs';

const PITCHES = Array.from({ length: 30 }, (_, i) => 21 + 3 * i);          // A0 C1 ... C8 (21..108)
const VELOCITIES = [40, 80, 115], LEAD_IN = 2, REST = 2;
const hold = (pitch) => (pitch <= 48 ? 8 : pitch <= 72 ? 5 : 3);          // seconds the key stays down

const events = [], timeline = [];
const flag = process.argv.indexOf('--controllers'), mode = flag < 0 ? 'open' : process.argv[flag + 1];
if (!['open', 'none', 'cc1'].includes(mode)) throw new Error('--controllers is open, none or cc1');
// Samplers often start with the mod wheel and expression at 0, which is silent: open them first.
if (mode !== 'none') for (const [controller, value] of [[7, 100], [1, 127], [11, 127]]) events.push({ time: .2, bytes: [0xb0, controller, value] });
let t = LEAD_IN;
const note = (pitch, velocity, length, kind, rest = REST, extra = {}) => {
    if (mode === 'cc1') events.push({ time: t - .05, bytes: [0xb0, 1, velocity] });
    events.push({ time: t, bytes: [0x90, pitch, velocity] }, { time: t + length, bytes: [0x80, pitch, 0] });
    timeline.push({ kind, pitch, velocity, start: t, release: t + length, ...extra });
    t += length + rest;
};

// 1. Held notes at three strengths: the spectrum, decay and beating of every partial, against pitch and velocity.
for (const pitch of PITCHES) for (const velocity of VELOCITIES) note(pitch, velocity, hold(pitch), 'held');
// 2. Short notes at medium strength: the attack and how quickly it stops.
for (const pitch of PITCHES) note(pitch, 80, .3, 'short', 2);
// 3. One note struck seven times: what changes from strike to strike (the dynamics-off render should not).
for (let i = 0; i < 7; i++) note(48, 80, 1, 'repeat', 1.5);
t += 1;
// 4. The pedal: a low, a middle and a high note with the damper pedal down before the key and released 4 s later.
for (const pitch of [36, 60, 84]) {
    events.push({ time: t - .3, bytes: [0xb0, 64, 127] });
    note(pitch, 80, 1.5, 'pedal', 0, { pedalDown: t - .3, pedalUp: t + 4 });
    events.push({ time: t + 4, bytes: [0xb0, 64, 0] });
    t += 4 + 2.5;
}
const seconds = t;

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'renders/piano-reference';
const name = mode === 'open' ? 'piano-calibration' : `piano-calibration-${mode}`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${name}.mid`), midiFile(events, seconds, name));
writeFileSync(join(out, `${name}.timeline.json`), JSON.stringify({ instrument: name, tempo: 120, seconds, events: timeline }, null, 1));
console.log(`${name} ${seconds.toFixed(0)} s (${(seconds / 60).toFixed(1)} min), ${timeline.length} events, pitches ${PITCHES[0]}..${PITCHES.at(-1)} every 3`);
