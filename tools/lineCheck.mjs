// Do the harmonic lines last as long as the recording's? Mean level (dB, over harmonics up to 4 kHz) of the power within +-2 bins of each line,
// per stretch, recording against model (pitch left out). Usage: node tools/lineCheck.mjs patch "48,60,72" [velocity=80]
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderDecay, renderSustained } from '../src/app/engine/stringModel/synth.js';
import { analyzeNote, findOnset, powerSpectrum, BED_WINDOWS } from '../src/app/engine/stringModel/analysis.js';
import { defaultTuning, tunedModelFrom } from '../src/app/engine/stringModel/tuning.js';
const [patch, pitches, velArg = '80'] = process.argv.slice(2), velocity = +velArg, P = patch[0].toUpperCase() + patch.slice(1);
const table = unpackTable(JSON.parse(readFileSync(`src/library/stringTables/cello${P}.json`, 'utf8'))), decay = table.mode === 'decay';
const wav = readWav(`C:/Users/rimuru/Documents/LUNA Sessions/Strings/Exported Files/Strings - ${P}.wav`), rate = wav.rate, timeline = JSON.parse(readFileSync('renders/cello-reference/cello-calibration.timeline.json', 'utf8'));
const unroll = (note) => { const L = note.loopEnd - note.loopStart, x = new Float32Array(3 * rate); for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % L)) * rate)]; } return x; };
const N = 2048, hz = rate / N;
function lines(x, onset, f0, from, to) {
    let sum = 0, count = 0;
    for (let t = from; t < to; t += .01) {
        const p = powerSpectrum(x, Math.round((onset + t) * rate) - N / 2, N);
        for (let h = 1; h * f0 < 4000; h++) { const k = Math.round(h * f0 / hz); let s = 0; for (let j = k - 2; j <= k + 2; j++) s += p[j] ?? 0; sum += 10 * Math.log10(s + 1e-20); count++; }
    }
    return sum / count;
}
const SERIES = process.env.SERIES ? [0, .03, .06, .1, .15, .2, .3, .4, .5, .7, 1].map((t) => [t, t + .02]) : null;
const total = BED_WINDOWS.map(() => []);
for (const pitch of pitches.split(',').map(Number)) {
    const e = timeline.events.find((ev) => ev.kind === 'held' && ev.pitch === pitch && ev.velocity === velocity), onset = findOnset(wav.mono, rate, e.start - .05);
    const real = analyzeNote(wav.mono, rate, { midi: pitch, start: e.start, release: e.release, mode: decay ? 'decay' : 'sustain' });
    const model = tunedModelFrom(table, pitch, velocity, defaultTuning(patch), pitch), body = decay ? renderDecay(model, rate).buffer : unroll(renderSustained(model, rate)), pad = Math.round(.03 * rate), x = new Float32Array(body.length + pad); x.set(body, pad);
    const row = (SERIES ?? BED_WINDOWS).map(([a, b], w) => { const r = lines(wav.mono, onset, real.f0, a, b), m = lines(x, .03, real.f0, a, b); if (r > -150 && total[w]) total[w].push(m - r); return `${r.toFixed(0)}/${m.toFixed(0)}`; });
    console.log(`${pitch} rec/model dB: ` + row.join('  '));
}
if (!SERIES) console.log('model - recording, mean over pitches: ' + total.map((v, w) => `${BED_WINDOWS[w][0]}-${BED_WINDOWS[w][1]}s ${v.length ? (v.reduce((a, z) => a + z, 0) / v.length).toFixed(1) : '-'}`).join('  '));
