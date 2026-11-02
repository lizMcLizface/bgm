// Closes the loop on /synths/iowa without a browser or an ear: renders notes through the real voice code, puts them through the same
// measurement the recordings went through, and compares the numbers. What it cannot say is whether the result sounds like the instrument.
//   node tools/checkIowa.mjs [--only flute,oboe]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { PATCHES } from '../src/app/engine/iowaModel/patches.js';
import { analyzeHeld, analyzeDecay, levels } from '../src/app/engine/iowaModel/analysis.js';
import { heldModel, heldVoice, decayModel, renderDecay, settleLevels, pitchRange } from '../src/app/engine/iowaModel/model.js';
import { HeldVoice } from '../src/app/engine/iowaModel/voice.js';

const arg = (flag) => { const i = process.argv.indexOf(flag); return i < 0 ? null : process.argv[i + 1]; };
const only = arg('--only')?.split(','), RATE = 48000, VELOCITIES = { pp: 30, mf: 80, ff: 118 };
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN);
const rmsDiff = (a, b, floor = -60) => {
    const d = [];
    a.forEach((v, i) => { if (b[i] !== undefined && Math.max(v, b[i]) > floor) d.push(Math.max(v, floor) - Math.max(b[i], floor)); });
    const offset = mean(d);
    return Math.sqrt(mean(d.map((v) => (v - offset) ** 2)));
};
const attackMs = (e) => { const times = [0, 5, 10, 15, 20, 30, 40, 60, 80, 100, 130, 160, 200, 250, 300, 400, 500], i = e.findIndex((v) => v > -3); return i < 0 ? 500 : times[i]; };
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');
const lines = ['| Patch | Notes | Shape err dB | Level err dB | Attack ms, ours / meas. | Vibrato cents | Vibrato Hz | Noise 1-8 kHz dB |', '|---|---|---|---|---|---|---|---|'];
const DECAY_AT = [2, 5, 10, 20, 50, 100];     // in steps of 10 ms after the peak
const decayLines = ['| Patch | Notes | Partials found | Strongest-partial level err dB | Fall after peak, dB err against the recording at 20, 50, 100, 200, 500, 1000 ms |', '|---|---|---|---|---|'];
/** How far the level has fallen from its peak at DECAY_AT, to the recording's noise at most. */
const fall = (x, rate) => {
    const env = levels(x, rate, .01, .01), top = Math.max(...env), start = env.indexOf(top);
    return DECAY_AT.map((k) => (start + k < env.length ? env[start + k] - top : NaN));
};
/** A note cut for the page's A/B: 16-bit mono WAV, as tools/analyzeIowa.mjs writes it. */
function readNote(path) {
    const b = readFileSync(path), rate = b.readUInt32LE(24), x = new Float32Array((b.length - 44) >> 1);
    for (let i = 0; i < x.length; i++) x[i] = b.readInt16LE(44 + i * 2) / 32768;
    return { x, rate };
}

for (const patch of PATCHES.filter((p) => !p.uses && (!only || only.includes(p.id)))) {
    let table;
    try { table = settleLevels(JSON.parse(readFileSync(`src/library/iowaTables/${patch.id}.json`, 'utf8'))); } catch { console.log(`${patch.id}: no table`); continue; }
    const results = [];
    for (const [layer, notes] of Object.entries(table.layers)) {
        const v = VELOCITIES[layer], picked = notes.filter((_, i) => i % Math.max(1, Math.round(notes.length / 6)) === 0);
        for (const note of picked) {
            if (table.decay) {
                const samples = renderDecay(decayModel(table, note.m, v), RATE), padded = new Float32Array(samples.length + 2400);
                padded.set(samples, 480);
                const back = analyzeDecay(padded, RATE, note.m, null);
                const recording = readNote(`banks/iowa/notes/${patch.id}/${layer}-${note.m}.wav`), theirs = fall(recording.x, recording.rate), ours = fall(samples, RATE);
                // past the recording's noise floor there is nothing to compare
                results.push({ found: back.partials.length, level: back.level - note.l, gaps: ours.map((v, i) => (theirs[i] > -45 ? v - theirs[i] : NaN)) });
            } else {
                const spec = heldVoice(heldModel(table, note.m, v), RATE), voice = new HeldVoice(spec, RATE, 10 ** (note.level / 20));
                const seconds = 2.4, out = new Float32Array(Math.round((seconds + .9) * RATE) + 2400);
                const pre = 2400;     // silence first, as a recording has
                for (let at = pre; at < out.length; at += 128) {
                    if (at - pre >= seconds * RATE) voice.release();
                    const block = new Float32Array(Math.min(128, out.length - at));
                    voice.render(block, block.length);
                    out.set(block, at);
                }
                const back = analyzeHeld(out, RATE, note.m, null);
                results.push({ shape: rmsDiff(back.harmonics, note.h), level: back.level - note.level, attack: attackMs(back.envelope), wantAttack: attackMs(note.e), depth: back.depth, wantDepth: note.v[1], rate: back.rate, wantRate: note.v[0], noise: mean(back.noise.slice(9, 18)), wantNoise: mean(note.n.slice(9, 18).filter((n) => n > -90)) });
            }
        }
    }
    const [lo, hi] = pitchRange(table), get = (k) => mean(results.map((r) => r[k]).filter(Number.isFinite));
    if (table.decay) {
        const gaps = DECAY_AT.map((_, i) => fmt(mean(results.map((r) => r.gaps[i]).filter(Number.isFinite)))).join(' / ');
        decayLines.push(`| ${patch.name} | ${results.length} | ${fmt(get('found'), 0)} | ${fmt(mean(results.map((r) => Math.abs(r.level))))} | ${gaps} |`);
    }
    else lines.push(`| ${patch.name} | ${results.length} | ${fmt(get('shape'))} | ${fmt(mean(results.map((r) => Math.abs(r.level))))} | ${fmt(get('attack'), 0)} / ${fmt(get('wantAttack'), 0)} | ${fmt(get('depth'))} / ${fmt(get('wantDepth'))} | ${fmt(get('rate'))} / ${fmt(get('wantRate'))} | ${fmt(get('noise'), 0)} / ${fmt(get('wantNoise'), 0)} |`);
    console.log(`${patch.id.padEnd(22)} ${lo}-${hi} checked ${results.length}`);
}
mkdirSync('.tmp/iowa-check', { recursive: true });
writeFileSync('.tmp/iowa-check/report.md', ['# Iowa instruments: measured again after synthesis', '', ...lines, '', ...decayLines, ''].join('\n'));
console.log(['', ...lines, '', ...decayLines].join('\n'));
