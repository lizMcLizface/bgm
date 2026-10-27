// Scans the wake parameters (tail level in dB, decay time in s) of the string model against the recording, loading the take once.
// The score is the skirt of each harmonic's line: mean level, in dB below the line's peak in short frames, 15 to 100 Hz either
// side of it, for harmonics 4, 8, 12, 16 up to 6 kHz; reported as the model's minus the recording's.
// Usage: node tools/scanWake.mjs table.json take.wav timeline.json "48,60,72" "-12,-6,0,6" ".15,.3,.6" [velocity=80]
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { modelFor, unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderSustained } from '../src/app/engine/stringModel/synth.js';
import { analyzeNote, powerSpectrum } from '../src/app/engine/stringModel/analysis.js';

const [tablePath, wavPath, timelinePath, pitchList, gainList, tauList, velArg = '80'] = process.argv.slice(2), velocity = +velArg;
const full = unpackTable(JSON.parse(readFileSync(tablePath, 'utf8'))), wav = readWav(wavPath), timeline = JSON.parse(readFileSync(timelinePath, 'utf8'));
const rate = wav.rate, N = 4096, hz = rate / N, offsets = [15, 30, 60, 100];

function skirt(x, onset, f0) {
    const out = [];
    for (const h of [4, 8, 12, 16]) {
        const f = h * f0; if (f > 6000) continue;
        const acc = offsets.map(() => 0); let frames = 0;
        for (let t = 1.2; t < 3.8; t += .02) {
            const p = powerSpectrum(x, Math.round((onset + t) * rate) - N / 2, N); let k = Math.round(f * .975 / hz);
            for (let i = k; i <= Math.round(f * 1.025 / hz); i++) if (p[i] > p[k]) k = i;
            offsets.forEach((o, q) => { const d = Math.round(o / hz); acc[q] += (p[k - d] + p[k + d]) / 2 / p[k]; });
            frames++;
        }
        out.push(...acc.map((a) => 10 * Math.log10(a / frames)));
    }
    return out;
}
const unroll = (note, seconds = 6) => {
    const L = note.loopEnd - note.loopStart, x = new Float32Array(seconds * rate);
    for (let i = 0; i < x.length; i++) { const t = i / rate; x[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % L)) * rate)]; }
    return x;
};
for (const pitch of pitchList.split(',').map(Number)) {
    const table = { ...full, pitches: full.pitches.filter((p) => p.pitch !== pitch) }, event = timeline.events.find((e) => e.kind === 'held' && e.pitch === pitch && e.velocity === velocity);
    const real = analyzeNote(wav.mono, rate, { midi: pitch, start: event.start, release: event.release, mode: 'sustain' }), target = skirt(wav.mono, event.start + real.onset, real.f0);
    for (const g of gainList.split(',').map(Number)) for (const tau of tauList.split(',').map(Number)) {
        const model = modelFor(table, pitch, velocity, real.f0);
        model.wake = { gainDb: g, tau }; model.smear = 0;
        const mine = skirt(unroll(renderSustained(model, rate)), 0, real.f0), d = mine.map((v, i) => v - target[i]);
        const per = [0, 1, 2, 3].map((h) => (d.slice(h * 4, h * 4 + 4).reduce((s, v) => s + v, 0) / 4).toFixed(1)).join(' / ');
        console.log(`  per harmonic (4/8/12/16, dB model-recording): ${per}`);
        console.log(`pitch ${pitch} wake ${String(g).padStart(4)} dB tau ${tau}: mean |dB| ${(d.reduce((s, v) => s + Math.abs(v), 0) / d.length).toFixed(1)}  bias ${(d.reduce((s, v) => s + v, 0) / d.length).toFixed(1)}`);
    }
}
