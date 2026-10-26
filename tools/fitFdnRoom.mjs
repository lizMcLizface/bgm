// Fits the effects kernel's FDN room (plus a high-pass on its send) to a recorded room of
// docs/measurements/room-reference.json, so the Wasm engine can offer that room without the recording.
// usage: node tools/fitFdnRoom.mjs reverb3 [iterations]   -> prints the room as stored in app/engine/drumRoom.js
import fs from 'node:fs';
import { analyse, biquad } from './roomAnalysis.mjs';
import { fdnImpulse } from './fdnRender.mjs';

const type = process.argv[2] || 'reverb3', iterations = +process.argv[3] || 200;
const reference = JSON.parse(fs.readFileSync(new URL('../docs/measurements/room-reference.json', import.meta.url)));
const SR = reference.sampleRate, raw = reference.rooms[type];
// The convolver caps a room at 3 s with a fade, so past about 4 s of RT60 a longer recording is only a haze.
const want = { ...raw, rt60: Object.fromEntries(Object.entries(raw.rt60).map(([k, v]) => [k, Math.min(v, 4)])) };
// The Web Audio convolver scales an impulse to a fixed RMS (0.00125 at 44.1 kHz), whatever its level:
// a 2-channel impulse of n frames ends with n * 1.5625e-6 of energy per channel. The room has to return as much.
const targetEnergy = Math.min(raw.seconds, 3) * SR * 1.5625e-6 * (raw.wholeRt60 < 3 ? 0.7 : 1);
const energy = (a) => { let s = 0; for (const x of a) s += x * x; return s; };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const BOUNDS = { decay: [0.3, 8], size: [0.2, 1], damping: [1500, 16000], predelay: [0, 60], width: [0, 1], modulation: [0, 1], reverbReturn: [-24, 18], reflections: [0, 8], hp: [20, 600], lp: [1500, 20000] };
export function render(room) {
    const { hp, lp, ...kernel } = room;
    let { channels } = fdnImpulse({ quality: 0, ...kernel }, SR, Math.min(Math.max(want.seconds, 2), 5));
    if (hp > 20) channels = channels.map((c) => biquad('highpass', hp, 1, SR, c));
    if (lp < 19000) channels = channels.map((c) => biquad('lowpass', lp, 1, SR, c));
    return channels;
}
function miss(room) {
    const [l, r] = render(room), got = analyse(l, r, SR);
    const log = (a, b) => (Number.isFinite(a) && a > 0 ? Math.log(a / b) : 2) ** 2;
    const level = (energy(l) + energy(r)) / 2 / 0.01; // the click is 0.1 in both ears
    return 1.5 * log(got.rt60.mid, want.rt60.mid) + log(got.rt60.hi, Math.min(want.rt60.hi, want.rt60.mid * 0.8))
        + ((got.early80 - want.early80) / 0.06) ** 2 + ((got.correlation - want.correlation) / 0.1) ** 2 * 0.5
        + ((got.levelDb.lo - want.levelDb.lo) / 5) ** 2 * 0.5 + ((got.levelDb.hi - want.levelDb.hi) / 4) ** 2
        + (10 * Math.log10(level / targetEnergy) / 1.5) ** 2;
}

let seed = 4242;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) - 0.5;
const room = { decay: want.rt60.mid, size: 0.4, damping: 6000, predelay: Math.max(0, want.peakMs - 10), width: 0.5, modulation: 0.3, reverbReturn: 0, reflections: 2, hp: 150, lp: 12000 };
let best = miss(room), step = 0.3;
for (let i = 0; i < iterations; i++) {
    const old = { ...room };
    for (const key of Object.keys(BOUNDS)) {
        const [lo, hi] = BOUNDS[key], span = hi - lo, scale = key === 'decay' || key === 'damping' || key === 'hp' ? room[key] : span;
        room[key] = clamp(room[key] + rnd() * step * (key === 'decay' || key === 'damping' || key === 'hp' || key === 'lp' ? 1 : 0.5) * scale, lo, hi);
    }
    const m = miss(room);
    if (m < best) best = m; else Object.assign(room, old);
    if (i % Math.ceil(iterations / 4) === Math.ceil(iterations / 4) - 1) step *= 0.5;
}
const round = (x, d) => +x.toFixed(d);
const out = { decay: round(room.decay, 2), size: round(room.size, 2), damping: Math.round(room.damping / 10) * 10, predelay: round(room.predelay, 1), width: round(room.width, 2), modulation: round(room.modulation, 2), reverbReturn: round(room.reverbReturn, 1), reflections: round(room.reflections, 2), hp: Math.round(room.hp), lp: Math.round(room.lp / 10) * 10 };
const [l, r] = render(out), got = analyse(l, r, SR);
console.log(`${type}: ${JSON.stringify(out)}  // miss ${best.toFixed(2)}`);
console.log(JSON.stringify({ want: { rt60: want.rt60, early80: want.early80, correlation: want.correlation, levelDb: want.levelDb }, got: { rt60: got.rt60, early80: got.early80, correlation: got.correlation, levelDb: got.levelDb, energy: (energy(l) + energy(r)) / 2 / 0.01, targetEnergy } }, (k, v) => typeof v === 'number' ? +v.toFixed(3) : v));
