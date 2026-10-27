// The MIDI take for calibrating a bowed-string model against a sampled instrument (cello first): every third
// semitone held at three dynamics (a long note, so vibrato, swell and the steady spectrum show), the same
// pitches short, a repeated note (round-robin), slow crescendo/diminuendo ramps (brightness against dynamics),
// and legato pairs (for the articulated "live" patch). Render the same file through each patch (long, short,
// pizzicato, live) and export a WAV each; the timeline JSON says what was played when.
// Usage: node tools/makeStringCalibrationMidi.mjs [outDir] [--low 36] [--high 88] [--name cello-calibration] [--controllers cc1|open|none]
//   cc1 (default): the mod wheel (CC1, the sampler's Dynamics) is set to the dynamic before every note
//   open:          CC1 and CC11 fully open before the first note, so only velocity can change the sound
//   none:          no controller messages
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { midiFile } from './makeReferenceMidi.mjs';

const arg = (flag, fallback) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : process.argv[i + 1]; };
const LOW = +arg('--low', 36), HIGH = +arg('--high', 88), mode = arg('--controllers', 'cc1');
if (!['open', 'none', 'cc1'].includes(mode)) throw new Error('--controllers is open, none or cc1');
const PITCHES = []; for (let p = LOW; p <= HIGH; p += 3) PITCHES.push(p);
const DYNAMICS = [40, 80, 127], LEAD_IN = 2, REST = 3.2;              // rest leaves room for a sample's tail
const hold = (pitch) => (pitch <= 60 ? 5 : 4);                        // seconds the key stays down

const events = [], timeline = [];
if (mode !== 'none') for (const [controller, value] of [[7, 100], [1, 127], [11, 127]]) events.push({ time: .2, bytes: [0xb0, controller, value] });
let t = LEAD_IN;
const note = (pitch, dynamic, length, kind, rest = REST, extra = {}) => {
    if (mode === 'cc1') events.push({ time: t - .05, bytes: [0xb0, 1, dynamic] });
    events.push({ time: t, bytes: [0x90, pitch, dynamic] }, { time: t + length, bytes: [0x80, pitch, 0] });
    timeline.push({ kind, pitch, velocity: dynamic, start: t, release: t + length, ...extra });
    t += length + rest;
};

// 1. Held notes at three dynamics: steady spectrum, vibrato, swell, body response against pitch and dynamic.
for (const pitch of PITCHES) for (const dynamic of DYNAMICS) note(pitch, dynamic, hold(pitch), 'held');
// 2. Short notes at medium dynamic: the attack and how quickly it stops.
for (const pitch of PITCHES) note(pitch, 80, .3, 'short', 2.5);
// 3. One note seven times: what changes from bow to bow (round-robin, random vibrato phase).
for (let i = 0; i < 7; i++) note(48, 80, 1.2, 'repeat', 2);
// 4. Dynamics ramps on a low and a middle note: CC1 swept 10 -> 127 -> 10 over one held note.
for (const pitch of [48, 67]) {
    const length = 16, base = t;
    if (mode !== 'none') for (let i = 0; i <= 32; i++) {
        const x = i / 32, value = Math.round(10 + 117 * (x < .5 ? x * 2 : (1 - x) * 2));
        events.push({ time: base + x * length, bytes: [0xb0, 1, value] });
    }
    events.push({ time: base, bytes: [0x90, pitch, 80] }, { time: base + length, bytes: [0x80, pitch, 0] });
    timeline.push({ kind: 'ramp', pitch, velocity: 80, start: base, release: base + length });
    t += length + REST;
}
// 5. Legato pairs (overlapping notes): the second note starts while the first is still down.
for (const [low, step] of [[48, 2], [48, 7], [55, 12], [60, 1], [60, 5], [67, 3]]) {
    events.push({ time: t - .05, bytes: [0xb0, 1, 90] });
    events.push({ time: t, bytes: [0x90, low, 80] }, { time: t + 1.55, bytes: [0x80, low, 0] });
    events.push({ time: t + 1.5, bytes: [0x90, low + step, 80] }, { time: t + 3.5, bytes: [0x80, low + step, 0] });
    timeline.push({ kind: 'legato', pitch: low, to: low + step, velocity: 80, start: t, second: t + 1.5, release: t + 3.5 });
    t += 3.5 + REST;
}
const seconds = t;

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'renders/cello-reference';
const name = arg('--name', mode === 'cc1' ? 'cello-calibration' : `cello-calibration-${mode}`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${name}.mid`), midiFile(events, seconds, name));
writeFileSync(join(out, `${name}.timeline.json`), JSON.stringify({ instrument: name, tempo: 120, seconds, events: timeline }, null, 1));
console.log(`${name} ${seconds.toFixed(0)} s (${(seconds / 60).toFixed(1)} min), ${timeline.length} events, pitches ${PITCHES[0]}..${PITCHES.at(-1)} every 3`);
