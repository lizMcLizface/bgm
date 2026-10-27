// Is the noise of a note pulsed at the string period? Band-passes a stretch of the recording, takes its envelope (analytic signal)
// and reports how strongly that envelope repeats at the period of the fundamental (autocorrelation at that lag against the lag
// of half a period; white noise gives about 0, noise gated by the bow's stick-slip gives a clear peak).
// Usage: node tools/noisePulse.mjs take.wav timeline.json "Long|Short" pitch from to [lowHz=2000] [highHz=6000]
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { fft } from '../src/app/engine/pianoModel/dsp.js';
import { analyzeNote, findOnset } from '../src/app/engine/stringModel/analysis.js';

const [wavPath, timelinePath, mode, pitchArg, fromArg, toArg, lowArg = '2000', highArg = '6000'] = process.argv.slice(2), pitch = +pitchArg, from = +fromArg, to = +toArg, lo = +lowArg, hi = +highArg;
const wav = readWav(wavPath), rate = wav.rate, event = JSON.parse(readFileSync(timelinePath, 'utf8')).events.find((e) => e.kind === 'held' && e.pitch === pitch && e.velocity === 80);
const onset = findOnset(wav.mono, rate, event.start - .05), real = analyzeNote(wav.mono, rate, { midi: pitch, start: event.start, release: event.release, mode: mode === 'Long' ? 'sustain' : 'decay' });
const f0 = real.f0, n = 2 ** Math.ceil(Math.log2((to - from) * rate)), re = new Float64Array(n), im = new Float64Array(n), start = Math.round((onset + from) * rate);
for (let i = 0; i < (to - from) * rate; i++) re[i] = wav.mono[start + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / ((to - from) * rate)));
fft(re, im);
// analytic signal of the band: keep positive frequencies in [lo, hi], double them
for (let k = 0; k < n; k++) { const f = k * rate / n; if (k > n / 2 || f < lo || f > hi) { re[k] = 0; im[k] = 0; } else { re[k] *= 2; im[k] *= 2; } }
for (let k = 0; k < n; k++) im[k] = -im[k];
fft(re, im);
const env = Float64Array.from({ length: Math.floor((to - from) * rate) }, (_, i) => Math.hypot(re[i], im[i]) / n);
const mean = env.reduce((s, v) => s + v, 0) / env.length, x = env.map((v) => v - mean), power = x.reduce((s, v) => s + v * v, 0);
const lag = (l) => { let s = 0; for (let i = 0; i + l < x.length; i++) s += x[i] * x[i + l]; return s / power; };
const period = rate / f0, p = Math.round(period), best = Math.max(lag(p - 1), lag(p), lag(p + 1)), half = lag(Math.round(period / 2));
console.log(`${mode} pitch ${pitch} f0 ${f0.toFixed(1)} Hz, ${from}-${to} s, band ${lo}-${hi} Hz: envelope autocorrelation at one period ${best.toFixed(2)}, at half a period ${half.toFixed(2)}, envelope depth (std/mean) ${(Math.sqrt(power / x.length) / mean).toFixed(2)}`);
