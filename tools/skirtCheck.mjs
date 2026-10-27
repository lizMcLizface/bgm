// How much of a harmonic's power sits beside the line, and how it narrows over time? For harmonics 2-9, power at 35-130 Hz either side of the line (bins
// beyond the peak's own +-2) over the line's peak power, dB, in 2048-point frames at several times; recording against model (pitch left out).
// Usage: node tools/skirtCheck.mjs patch "60,72,84" [velocity=80]   (env WAKE etc. as startNoiseCheck)
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderDecay, renderSustained } from '../src/app/engine/stringModel/synth.js';
import { analyzeNote, findOnset, powerSpectrum } from '../src/app/engine/stringModel/analysis.js';
import { defaultTuning, tunedModelFrom } from '../src/app/engine/stringModel/tuning.js';
const [patch, pitches, velArg = '80'] = process.argv.slice(2), velocity = +velArg, P = patch[0].toUpperCase() + patch.slice(1);
const table = unpackTable(JSON.parse(readFileSync(`src/library/stringTables/cello${P}.json`, 'utf8'))), decay = table.mode === 'decay';
const wav = readWav(`C:/Users/rimuru/Documents/LUNA Sessions/Strings/Exported Files/Strings - ${P}.wav`), rate = wav.rate, timeline = JSON.parse(readFileSync('renders/cello-reference/cello-calibration.timeline.json', 'utf8'));
const N = 2048, hz = rate / N, TIMES = [.01, .03, .06, .1, .2, .3], unroll = (note) => { const L = note.loopEnd - note.loopStart, x = new Float32Array(3 * rate); for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % L)) * rate)]; } return x; };
function skirt(x, onset, f0, t, near = [35, 130]) {
    const p = powerSpectrum(x, Math.round((onset + t) * rate) - N / 2, N); let sum = 0, count = 0;
    for (let h = 2; h <= 9 && h * f0 < 4500; h++) {
        const k = Math.round(h * f0 / hz); let peak = 0; for (let j = k - 2; j <= k + 2; j++) peak = Math.max(peak, p[j] ?? 0);
        let s = 0, c = 0; for (let j = Math.ceil(near[0] / hz) + 2; j <= Math.floor(near[1] / hz); j++) { s += (p[k + j] ?? 0) + (p[k - j] ?? 0); c += 2; }
        if (peak > 0 && c) { sum += 10 * Math.log10(s / c / peak + 1e-20); count++; }
    }
    return count ? sum / count : null;
}
const total = TIMES.map(() => ({ rec: [], mod: [] }));
for (const pitch of pitches.split(',').map(Number)) {
    const e = timeline.events.find((ev) => ev.kind === 'held' && ev.pitch === pitch && ev.velocity === velocity), onset = findOnset(wav.mono, rate, e.start - .05);
    const f0 = analyzeNote(wav.mono, rate, { midi: pitch, start: e.start, release: e.release, mode: decay ? 'decay' : 'sustain' }).f0;
    const model = { ...tunedModelFrom(table, pitch, velocity, { ...defaultTuning(patch), ...(process.env.WAKE ? { wakeDb: +process.env.WAKE } : {}), ...(process.env.TAU ? { noiseTau: +process.env.TAU } : {}) }, pitch), f0 }, body = decay ? renderDecay(model, rate).buffer : unroll(renderSustained(model, rate)), pad = Math.round(.03 * rate), x = new Float32Array(body.length + pad); x.set(body, pad);
    const row = TIMES.map((t, i) => { const r = skirt(wav.mono, onset, f0, t), m = skirt(x, .03, f0, t); if (r != null && m != null) { total[i].rec.push(r); total[i].mod.push(m); } return `${r?.toFixed(0)}/${m?.toFixed(0)}`; });
    console.log(`${pitch} f0 ${f0.toFixed(0)}  rec/model skirt dB at ${TIMES.join(' ')} s: ` + row.join('  '));
}
const mean = (a) => (a.reduce((s, v) => s + v, 0) / a.length).toFixed(1);
console.log('mean rec  : ' + total.map((t) => mean(t.rec)).join('  ') + '\nmean model: ' + total.map((t) => mean(t.mod)).join('  '));
