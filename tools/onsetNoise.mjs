// Where does the noise around the harmonics at the start of a note come from? Measures the skirt of each line (level 15 to 100 Hz
// either side of its peak, dB re the peak, short frames) in the first second of the recording and of the model with each
// noise-making part switched off in turn.  Usage: node tools/onsetNoise.mjs table.json take.wav timeline.json [pitch=60] [from=.2] [to=.7]
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { modelFor, unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderSustained } from '../src/app/engine/stringModel/synth.js';
import { analyzeNote, powerSpectrum } from '../src/app/engine/stringModel/analysis.js';

const [tablePath, wavPath, timelinePath, pitchArg = '60', fromArg = '.2', toArg = '.7'] = process.argv.slice(2), pitch = +pitchArg, from = +fromArg, to = +toArg, velocity = 80;
const full = unpackTable(JSON.parse(readFileSync(tablePath, 'utf8'))), table = { ...full, pitches: full.pitches.filter((p) => p.pitch !== pitch) };
const wav = readWav(wavPath), rate = wav.rate, event = JSON.parse(readFileSync(timelinePath, 'utf8')).events.find((e) => e.kind === 'held' && e.pitch === pitch && e.velocity === velocity);
const real = analyzeNote(wav.mono, rate, { midi: pitch, start: event.start, release: event.release, mode: 'sustain' });
const N = 4096, hz = rate / N, offsets = [15, 30, 60, 100];

function skirt(x, onset) {
    const rows = [];
    for (const h of [4, 6, 8, 10, 12, 16]) {
        const f = h * real.f0; if (f > 5500) continue;
        const acc = offsets.map(() => 0); let frames = 0;
        for (let t = from; t < to; t += .02) {
            const p = powerSpectrum(x, Math.round((onset + t) * rate) - N / 2, N); let k = Math.round(f * .975 / hz);
            for (let i = k; i <= Math.round(f * 1.025 / hz); i++) if (p[i] > p[k]) k = i;
            offsets.forEach((o, q) => { const d = Math.round(o / hz); acc[q] += (p[k - d] + p[k + d]) / 2 / p[k]; });
            frames++;
        }
        rows.push(acc.map((a) => 10 * Math.log10(a / frames)));
    }
    const mean = offsets.map((_, q) => rows.reduce((s, r) => s + r[q], 0) / rows.length);
    return mean.map((v) => v.toFixed(1).padStart(6)).join(' ');
}
const unroll = (note) => { const L = note.loopEnd - note.loopStart, x = new Float32Array(4 * rate); for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % L)) * rate)]; } return x; };
console.log(`pitch ${pitch}, ${from}-${to} s after the onset; skirt at ${offsets.join(' / ')} Hz (dB re the line, mean over harmonics 4 6 8 10 12 16)`);
console.log('recording                 ', skirt(wav.mono, event.start + real.onset));
const shares = (process.argv[8] ?? '.1,.03,.015,.005').split(',').map(Number);
for (const share of shares) {
    const model = { ...modelFor(table, pitch, velocity, real.f0, { noiseShare: share }), wake: { gainDb: 6, tau: .25 }, smear: 0 };
    console.log(`model, noise share ${String(share).padEnd(5)}`.padEnd(28), skirt(unroll(renderSustained(model, rate)), 0));
}
