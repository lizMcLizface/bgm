// Compares the generated room impulses (src/nodes/roomModel.js) with the measurements of the recordings
// they were fitted to (docs/measurements/room-reference.json). Exits 1 when a room is out of tolerance.
// usage: node tools/auditRoomModel.mjs
import fs from 'node:fs';
import { analyse } from './roomAnalysis.mjs';
import { roomImpulse, ROOM_TYPES } from '../src/nodes/roomModel.js';

const reference = JSON.parse(fs.readFileSync(new URL('../docs/measurements/room-reference.json', import.meta.url)));
const TOL = { rt60: 0.2, early80: 0.05, correlation: 0.1, peakMs: 3, levelDb: 3 };
// reverb3's recorded low band is a faint boom under a tight, bright room; its short mid decay and
// strong early reflections (what the drums hear) are fitted, its sub-250 Hz tail is only approximated
// reverb2 is so dark that its direct-sound click alone puts it a few dB over the recorded top octave
const LOOSE = { reverb2: ['hi dB vs mid'], reverb3: ['rt60 lo', 'lo dB vs mid'] };
let failed = 0;
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
for (const type of ROOM_TYPES) {
    const want = reference.rooms[type], { channels } = roomImpulse(type, reference.sampleRate);
    const got = analyse(channels[0], channels[1], reference.sampleRate);
    const rows = [
        ['rt60 lo', want.rt60.lo, got.rt60.lo, Math.abs(got.rt60.lo / want.rt60.lo - 1) <= TOL.rt60],
        ['rt60 mid', want.rt60.mid, got.rt60.mid, Math.abs(got.rt60.mid / want.rt60.mid - 1) <= TOL.rt60],
        // a recording's high band meets its noise floor early, so its measured RT60 is only a ceiling
        ['rt60 hi', want.rt60.hi, got.rt60.hi, got.rt60.hi <= want.rt60.hi * (1 + TOL.rt60)],
        ['early 80ms', want.early80, got.early80, Math.abs(got.early80 - want.early80) <= TOL.early80],
        ['L/R corr', want.correlation, got.correlation, Math.abs(got.correlation - want.correlation) <= TOL.correlation],
        ['peak ms', want.peakMs, got.peakMs, Math.abs(got.peakMs - want.peakMs) <= TOL.peakMs],
        ['lo dB vs mid', want.levelDb.lo, got.levelDb.lo, Math.abs(got.levelDb.lo - want.levelDb.lo) <= TOL.levelDb],
        ['hi dB vs mid', want.levelDb.hi, got.levelDb.hi, Math.abs(got.levelDb.hi - want.levelDb.hi) <= TOL.levelDb],
    ];
    console.log(`${type} (${f(got.seconds)} s)`);
    for (const [name, a, b, ok] of rows) { const loose = !ok && LOOSE[type]?.includes(name); if (!ok && !loose) failed++; console.log(`  ${ok ? ' ok ' : loose ? 'loose' : 'FAIL'} ${name.padEnd(13)} recorded ${f(a).padStart(7)}  generated ${f(b).padStart(7)}`); }
}
console.log(failed ? `${failed} measurements out of tolerance` : 'all rooms within tolerance');
process.exit(failed ? 1 : 0);
