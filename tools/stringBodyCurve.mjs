// Exploring how a sampled bowed instrument's body shapes its harmonics: for every held note of a calibration take
// (tools/makeStringCalibrationMidi.mjs) it measures the harmonics of the steady part, then pools all notes by
// absolute frequency. A fixed body shows up as the same bumps at the same Hz whatever the pitch.
// Usage: node tools/stringBodyCurve.mjs take.wav timeline.json [--dynamic 80] [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { magnitudeSpectrum, peakNear } from '../src/app/engine/pianoModel/dsp.js';

const arg = (flag, fallback) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : process.argv[i + 1]; };
const DYNAMIC = +arg('--dynamic', 80), FROM = 1.2, LENGTH = 2.4, TOP = 14000;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12), db = (x) => 20 * Math.log10(x + 1e-12);

/** Harmonic amplitudes [n, f, dB] of the steady part of one note. */
export function harmonics(mono, rate, start, midi) {
    const from = Math.round((start + FROM) * rate), count = Math.round(LENGTH * rate), spec = magnitudeSpectrum(mono, rate, from, count, 2);
    const first = peakNear(spec, hz(midi), .03), out = [];
    for (let n = 1; n * first.f < TOP; n++) {
        const p = peakNear(spec, n * first.f, .012 + .004 * Math.min(n, 5));
        out.push([n, p.f, db(p.a)]);
    }
    return { f0: first.f, partials: out };
}

if (process.argv[1]?.endsWith('stringBodyCurve.mjs') && process.argv[3]) {
    const wav = readWav(process.argv[2]), timeline = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    const notes = timeline.events.filter((e) => e.kind === 'held' && e.velocity === DYNAMIC && e.pitch >= 36 && e.pitch <= 84);
    const bins = new Map(), perNote = [];
    for (const e of notes) {
        const { f0, partials } = harmonics(wav.mono, wav.rate, e.start, e.pitch);
        const tuning = 1200 * Math.log2(f0 / hz(e.pitch));
        // loudness of the note = power sum of its partials, so notes of different level pool on one scale
        const total = db(Math.sqrt(partials.reduce((s, [, , d]) => s + 10 ** (d / 10), 0)));
        perNote.push({ pitch: e.pitch, f0: +f0.toFixed(2), cents: +tuning.toFixed(1), totalDb: +total.toFixed(1), partials: partials.map(([n, f, d]) => [n, +f.toFixed(1), +d.toFixed(1)]) });
        for (const [, f, d] of partials) {
            const bin = Math.round(6 * Math.log2(f / 100));                 // sixth-octave bins from 100 Hz
            if (!bins.has(bin)) bins.set(bin, []);
            bins.get(bin).push(d - total);
        }
    }
    console.log(`dynamic ${DYNAMIC}: ${notes.length} notes; pooled level of every harmonic against its frequency (dB relative to the note, median [min..max], count)`);
    const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
    for (const bin of [...bins.keys()].sort((a, b) => a - b)) {
        const xs = bins.get(bin), f = 100 * 2 ** (bin / 6);
        console.log(`${f.toFixed(0).padStart(6)} Hz  ${median(xs).toFixed(1).padStart(6)}  [${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}]  n=${xs.length}`);
    }
    console.log('tuning (cents from A440): ' + perNote.map((n) => `${n.pitch}:${n.cents}`).join(' '));
    const out = arg('--json', null);
    if (out) writeFileSync(out, JSON.stringify({ dynamic: DYNAMIC, notes: perNote }));
}
