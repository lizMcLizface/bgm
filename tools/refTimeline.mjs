// Checks a recording of a reference MIDI take against its timeline: where the first note really
// started, how loud each note is, and how long the sound lingers after each release.
// Usage: node tools/refTimeline.mjs recording.wav timeline.json
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';

const WINDOW = .01;
export function envelope({ rate, mono }) {
    const hop = Math.round(rate * WINDOW), env = new Float32Array(Math.floor(mono.length / hop));
    for (let i = 0; i < env.length; i++) { let s = 0; for (let j = 0; j < hop; j++) s += mono[i * hop + j] ** 2; env[i] = Math.sqrt(s / hop); }
    return env;
}
const db = (x) => 20 * Math.log10(x + 1e-9);
const at = (env, t) => Math.max(0, Math.min(env.length - 1, Math.round(t / WINDOW)));

/** Seconds from the nominal start to where the first note is really heard (the sampler's latency or pre-roll). */
export function firstNoteOffset(env, nominal) {
    const peak = Math.max(...env.slice(at(env, nominal - .5), at(env, nominal + 2))), floor = 10 ** (-60 / 20);
    for (let i = at(env, Math.max(0, nominal - 1)); i < env.length; i++) if (env[i] > Math.max(floor, peak * .03)) return i * WINDOW - nominal;
    return null;
}

export function summarize(wav, timeline) {
    const env = envelope(wav), first = timeline.events[0], offset = firstNoteOffset(env, first.start) ?? 0, rows = [];
    for (const e of timeline.events) {
        const start = e.start + offset, release = e.release + offset;
        const slice = (a, b) => env.slice(at(env, a), at(env, b) + 1);
        const peak = Math.max(...slice(start, start + .6)), held = slice(release - .5, release - .1);
        const level = (xs) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
        // seconds after release until the level is 40 dB below the level at release (or the next event)
        const atRelease = Math.max(...slice(release - .15, release));
        let fall = null;
        for (let t = release; t < release + 6; t += WINDOW) if (env[at(env, t)] < atRelease * 10 ** (-40 / 20)) { fall = t - release; break; }
        rows.push({ ...e, peakDb: db(peak), heldDb: held.length ? db(level(held)) : null, fall40: fall });
    }
    return { offset, rows, peak: wav.mono.reduce((m, x) => Math.max(m, Math.abs(x)), 0), floorDb: db(Math.min(...env.slice(0, at(env, first.start + offset - .2)))) };
}

if (process.argv[1]?.endsWith('refTimeline.mjs') && process.argv[3]) {
    const wav = readWav(process.argv[2]), timeline = JSON.parse(readFileSync(process.argv[3], 'utf8')), s = summarize(wav, timeline);
    console.log(`${timeline.instrument}: first note heard ${s.offset >= 0 ? '+' : ''}${(s.offset * 1000).toFixed(0)} ms from the file's schedule, peak ${s.peak.toFixed(3)}, floor before ${s.floorDb.toFixed(0)} dB`);
    for (const r of s.rows) console.log(`  ${r.kind.padEnd(16)} ${r.pitch ?? ''}`.padEnd(26) + ` v${String(r.velocity).padStart(3)}  start ${r.start.toFixed(1).padStart(6)}s  peak ${r.peakDb.toFixed(0).padStart(4)} dB  held ${r.heldDb === null ? '   -' : r.heldDb.toFixed(0).padStart(4)} dB  -40 dB after release: ${r.fall40 === null ? '>6' : r.fall40.toFixed(2)} s`);
}
