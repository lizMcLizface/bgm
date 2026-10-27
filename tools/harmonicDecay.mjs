// How differently do the harmonics of one note die away? Level of each harmonic (power within +-2 bins, 2048-point frames) at several times, dB below its own level at 30 ms.
// Usage: node tools/harmonicDecay.mjs patch pitch [velocity=80]   (recording only)
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { analyzeNote, findOnset, powerSpectrum } from '../src/app/engine/stringModel/analysis.js';
const [patch, pitchArg, velArg = '80'] = process.argv.slice(2), P = patch[0].toUpperCase() + patch.slice(1), pitch = +pitchArg, velocity = +velArg;
const wav = readWav(`C:/Users/rimuru/Documents/LUNA Sessions/Strings/Exported Files/Strings - ${P}.wav`), rate = wav.rate, timeline = JSON.parse(readFileSync('renders/cello-reference/cello-calibration.timeline.json', 'utf8'));
const e = timeline.events.find((ev) => ev.kind === 'held' && ev.pitch === pitch && ev.velocity === velocity), onset = findOnset(wav.mono, rate, e.start - .05);
const f0 = analyzeNote(wav.mono, rate, { midi: pitch, start: e.start, release: e.release, mode: 'decay' }).f0, N = 2048, hz = rate / N, times = [.03, .1, .2, .3, .5, .7];
const level = (f, t) => { const p = powerSpectrum(wav.mono, Math.round((onset + t) * rate) - N / 2, N), k = Math.round(f / hz); let s = 0; for (let j = k - 2; j <= k + 2; j++) s += p[j]; return 10 * Math.log10(s + 1e-20); };
console.log(`pitch ${pitch} f0 ${f0.toFixed(1)}: harmonic, Hz, level at ${times[0]} s (dB), then dB re that at ${times.slice(1).join(' ')} s`);
for (let h = 1; h * f0 < 4500; h++) { const f = h * f0, l0 = level(f, times[0]); console.log(String(h).padStart(2), String(Math.round(f)).padStart(5), l0.toFixed(0).padStart(5), times.slice(1).map((t) => (level(f, t) - l0).toFixed(0).padStart(5)).join('')); }
