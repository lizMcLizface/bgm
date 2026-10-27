// How smeared a note's harmonics are, recording against model (left one out): for harmonics of the steady part,
//  - the -10 dB width of the spectral line in short frames (Hz and cents), and
//  - the pitch wander of each harmonic in cents once the vibrato shared by all harmonics is taken out (a single player
//    wanders the same in cents for every harmonic; several players, or a section, wander more the higher you go).
// Usage: node tools/harmonicSmear.mjs table.json take.wav timeline.json [pitch=60] [velocity=80]
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { modelFor, unpackTable } from '../src/app/engine/stringModel/model.js';
import { renderSustained } from '../src/app/engine/stringModel/synth.js';
import { analyzeNote, powerSpectrum } from '../src/app/engine/stringModel/analysis.js';

const [tablePath, wavPath, timelinePath, pitchArg = '60', velArg = '80'] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--')), pitch = +pitchArg, velocity = +velArg;
const full = unpackTable(JSON.parse(readFileSync(tablePath, 'utf8'))), table = { ...full, pitches: full.pitches.filter((p) => p.pitch !== pitch) };
const wav = readWav(wavPath), event = JSON.parse(readFileSync(timelinePath, 'utf8')).events.find((e) => e.kind === 'held' && e.pitch === pitch && e.velocity === velocity);
const rate = wav.rate, real = analyzeNote(wav.mono, rate, { midi: pitch, start: event.start, release: event.release, mode: 'sustain' });
const opt = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i < 0 ? fallback : +process.argv[i + 1]; };
const model = modelFor(table, pitch, velocity, real.f0, { noiseShare: opt('share', undefined) });
model.wake = { gainDb: opt('wake', -40), tau: opt('tau', .3) };
model.smear = opt('smear', 0); model.shimmer = opt('shimmer', 1); model.onsetScale = opt('onset', 2.5); model.lineWidth = opt('ratio', 0.2) * real.f0;
const note = renderSustained(model, rate);
const L = note.loopEnd - note.loopStart, rendered = new Float32Array(6 * rate);
for (let i = 0; i < rendered.length; i++) { const t = i / rate; rendered[i] = t < note.loopEnd ? note.buffer[i] : note.buffer[Math.round((note.loopStart + ((t - note.loopStart) % L)) * rate)]; }

const N = 8192, hop = Math.round(.02 * rate), hz = rate / N, harmonics = [3, 4, 5, 6, 8, 10, 12, 16, 20, 24];
/** Per harmonic: the frequency track in cents about its mean (from parabolic peaks) and the -10 dB line widths. */
function measure(x, onset) {
    const frames = [];
    for (let t = 1.2; t < 3.8; t += .02) frames.push(powerSpectrum(x, Math.round((onset + t) * rate) - N / 2, N));
    return harmonics.map((h) => {
        const f = h * real.f0, track = [], widths = [], levels = [];
        for (const p of frames) {
            const lo = Math.round(f * .975 / hz), hi = Math.round(f * 1.025 / hz); let k = lo;
            for (let i = lo; i <= hi; i++) if (p[i] > p[k]) k = i;
            const a = Math.log(p[k - 1] + 1e-20), b = Math.log(p[k] + 1e-20), c = Math.log(p[k + 1] + 1e-20), shift = Math.max(-.5, Math.min(.5, .5 * (a - c) / (a - 2 * b + c)));
            track.push((k + shift) * hz); levels.push(10 * Math.log10(p[k] + 1e-20));
            let l = k, r = k; while (l > 1 && p[l] > p[k] * .1) l--; while (r < p.length - 2 && p[r] > p[k] * .1) r++;
            widths.push((r - l) * hz);
        }
        const mean = track.reduce((s, v) => s + v, 0) / track.length;
        const lm = levels.reduce((s, v) => s + v, 0) / levels.length, wander = Math.sqrt(levels.reduce((s, v) => s + (v - lm) ** 2, 0) / levels.length);
        return { h, cents: track.map((v) => 1200 * Math.log2(v / mean)), width: widths.sort((a, b) => a - b)[widths.length >> 1], levelStd: wander };
    });
}
function report(label, x, onset) {
    const m = measure(x, onset), ref = m.filter((o) => o.h >= 4 && o.h <= 8), len = ref[0].cents.length;
    const common = Array.from({ length: len }, (_, i) => ref.reduce((s, o) => s + o.cents[i], 0) / ref.length);
    console.log(`${label}`);
    for (const o of m) {
        // residual after removing the common vibrato by least squares
        const dot = o.cents.reduce((s, v, i) => s + v * common[i], 0), norm = common.reduce((s, v) => s + v * v, 0), g = dot / norm;
        const resid = o.cents.map((v, i) => v - g * common[i]), rms = Math.sqrt(resid.reduce((s, v) => s + v * v, 0) / len), swing = Math.sqrt(o.cents.reduce((s, v) => s + v * v, 0) / len);
        console.log(`  h${String(o.h).padStart(2)} ${(o.h * real.f0).toFixed(0).padStart(5)} Hz  line width ${o.width.toFixed(0).padStart(3)} Hz (${(1200 * Math.log2(1 + o.width / (o.h * real.f0))).toFixed(0).padStart(3)} c)  vibrato swing ${swing.toFixed(1).padStart(5)} c  follows the common track ${g.toFixed(2)}  residual wander ${rms.toFixed(1).padStart(4)} c  level std ${o.levelStd.toFixed(1)} dB`);
    }
}
/** The skirt of each harmonic's line: mean level (dB below the peak) at fixed offsets from it, over short frames. */
function skirt(x, onset, label) {
    const n = 4096, hz2 = rate / n, offsets = [15, 30, 60, 100], rows = [];
    for (const h of [4, 8, 12, 16]) {
        const f = h * real.f0; if (f > 6000) continue;
        const acc = offsets.map(() => 0); let frames = 0;
        for (let t = 1.2; t < 3.8; t += .02) {
            const p = powerSpectrum(x, Math.round((onset + t) * rate) - n / 2, n); let k = Math.round(f * .975 / hz2);
            for (let i = k; i <= Math.round(f * 1.025 / hz2); i++) if (p[i] > p[k]) k = i;
            offsets.forEach((o, q) => { const d = Math.round(o / hz2); acc[q] += (p[k - d] + p[k + d]) / 2 / p[k]; });
            frames++;
        }
        rows.push(`h${String(h).padStart(2)} ` + offsets.map((o, q) => `${o}Hz ${(10 * Math.log10(acc[q] / frames)).toFixed(1)}`).join('  '));
    }
    console.log([`  skirt ${label} (dB re the line's peak, mean over frames):`, ...rows.map((r) => '    ' + r)].join('\n'));
}
if (process.argv.includes('--score')) {
    const grab = (x, onset) => { const rows = []; const orig = console.log; console.log = (t) => rows.push(t); skirt(x, onset, ''); console.log = orig; return rows.join(' ').replace(/h\s*\d+/g, '').match(/-\d+\.\d/g).map(Number); };
    const a = grab(wav.mono, event.start + real.onset), b = grab(rendered, 0), diff = a.map((v, i) => b[i] - v);
    console.log(`score smear ${model.smear} width ${model.lineWidth} share ${opt('share', .1)}: mean |dB| ${(diff.reduce((s, v) => s + Math.abs(v), 0) / diff.length).toFixed(1)}  bias ${(diff.reduce((s, v) => s + v, 0) / diff.length).toFixed(1)}`);
    process.exit(0);
}
skirt(wav.mono, event.start + real.onset, 'RECORDING'); skirt(rendered, 0, 'MODEL');
console.log(`pitch ${pitch} v${velocity}  f0 ${real.f0} Hz  (frame ${N} samples = ${(N / rate * 1000).toFixed(0)} ms, line width at -10 dB of the peak)`);
report('RECORDING', wav.mono, event.start + real.onset);
report('MODEL (this pitch left out)', rendered, 0);
