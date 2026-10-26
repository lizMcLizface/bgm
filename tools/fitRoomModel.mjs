// Fits the room specs in src/nodes/roomModel.js to docs/measurements/room-reference.json and prints them.
// Starts from the specs as written and nudges RT60 anchors, tone and width until the audit's numbers agree.
// usage: node tools/fitRoomModel.mjs [reverbN]   (paste the output over ROOM_SPECS)
import fs from 'node:fs';
import { analyse } from './roomAnalysis.mjs';
import { roomImpulse, ROOM_SPECS, ROOM_TYPES } from '../src/nodes/roomModel.js';

const reference = JSON.parse(fs.readFileSync(new URL('../docs/measurements/room-reference.json', import.meta.url)));
const SR = reference.sampleRate;
// A recording's high band meets its noise floor early, which can read as longer than the mid band.
const cap = (want) => ({ ...want, rt60: { ...want.rt60, hi: Math.min(want.rt60.hi, want.rt60.mid * 0.7) } });
const round = (x, d) => +x.toFixed(d);

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
// the band measurements leak into each other, so the six numbers cannot be set one at a time:
// a seeded (1+1) search over RT60 (lo, mid, hi), tone (lo, hi) and width, minimising the miss
function miss(type, want) {
    const { channels } = roomImpulse(type, SR), got = analyse(channels[0], channels[1], SR);
    const rt = (a, b) => (Number.isFinite(a) ? Math.log(a / b) : 2) ** 2;
    return rt(got.rt60.lo, want.rt60.lo) + 1.5 * rt(got.rt60.mid, want.rt60.mid) + rt(got.rt60.hi, want.rt60.hi)
        + ((got.levelDb.lo - want.levelDb.lo) / 4) ** 2 + ((got.levelDb.hi - want.levelDb.hi) / 4) ** 2
        + ((got.correlation - want.correlation) / 0.08) ** 2 * 0.5;
}
let seed = 12345;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) - 0.5;

for (const type of process.argv[2] ? [process.argv[2]] : ROOM_TYPES) {
    const want = cap(reference.rooms[type]), spec = ROOM_SPECS[type];
    let best = miss(type, want), step = 0.3;
    for (let i = 0; i < 220; i++) {
        const old = { rt60: [...spec.rt60], tone: [...spec.tone], width: spec.width };
        spec.rt60 = old.rt60.map((x) => clamp(x * Math.exp(rnd() * step * 2), 0.4, 14));
        spec.tone = [clamp(old.tone[0] + rnd() * step * 20, -45, 20), 0, clamp(old.tone[2] + rnd() * step * 20, -45, 20)];
        spec.width = clamp(old.width + rnd() * step * 0.4, 0, 1);
        const m = miss(type, want);
        if (m < best) best = m; else Object.assign(spec, old);
        if (i % 50 === 49) step *= 0.5;
    }
    spec.rt60 = spec.rt60.map((x) => round(x, 1));
    spec.tone = spec.tone.map((x) => round(x, 1));
    spec.width = round(spec.width, 2);
    console.log(`    ${type}: ${JSON.stringify(spec).replace(/"(w+)":/g, '$1: ').replace(/,/g, ', ')},  // miss ${best.toFixed(2)}`);
}
