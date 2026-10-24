// Fits an acoustic piano type to a recording of piano.mid (makeReferenceMidi.mjs).
//   node tools/fitPiano.mjs measure timeline.json out.json recording.wav...   band-averaged targets per recording
//   node tools/fitPiano.mjs fit targets.json name                              search the type's parameters, print them
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { readWav } from './refAnalyze.mjs';
import { envelope, firstNoteOffset } from './refTimeline.mjs';
import { analyzeNote } from './refCompare.mjs';
import { renderAcousticPiano, inharmonicity, ACOUSTIC_TYPES } from '../src/app/engine/acousticPiano.js';

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
export const BANDS = { low: [21, 24, 28, 31], lowmid: [33, 36, 40, 43], mid: [45, 48, 52, 55], high: [60, 72, 84] };
const SLOPE_PARTIALS = [1, 2, 4, 8];

/** Partial levels (dB re the strongest, 16) and decay slopes (dB/s) of a measured note. */
export function features(note) {
    const top = Math.max(...note.levels.filter(Boolean).map((l) => l[0]));
    const rel = note.levels.map((l) => (l ? 20 * Math.log10(l[0] / top) : -90));
    const slope = (l) => { const t = note.centreTimes.slice(1, 5), y = l.slice(1, 5).map((a) => 20 * Math.log10(a + 1e-12)); const m = (a) => a.reduce((s, v) => s + v, 0) / a.length, tm = m(t), ym = m(y); return t.reduce((s, x, i) => s + (x - tm) * (y[i] - ym), 0) / t.reduce((s, x) => s + (x - tm) ** 2, 0); };
    return { rel: rel.map((v) => Math.max(v, -70)), slopes: SLOPE_PARTIALS.map((n) => (note.levels[n - 1] ? slope(note.levels[n - 1]) : 0)), B: note.B };
}
export const average = (list) => ({ rel: list[0].rel.map((_, i) => mean(list.map((f) => f.rel[i]))), slopes: list[0].slopes.map((_, i) => mean(list.map((f) => f.slopes[i]))), Bratio: null });
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length, median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

function measure(timelinePath, outPath, wavs) {
    const timeline = JSON.parse(readFileSync(timelinePath, 'utf8')), result = {};
    const start = (pitch) => timeline.events.find((e) => e.pitch === pitch && (e.kind === 'low' || (e.kind === 'sustained' && e.velocity === 80))).start;
    for (const path of wavs) {
        const wav = readWav(path), offset = firstNoteOffset(envelope(wav), timeline.events[0].start) ?? 0, name = basename(path, '.wav').replace('Pianos - ', '');
        result[name] = {};
        for (const [band, pitches] of Object.entries(BANDS)) {
            const notes = pitches.map((p) => ({ p, f: features(analyzeNote(wav.mono, wav.rate, start(p) + offset, hz(p))) }));
            result[name][band] = { ...average(notes.map((n) => n.f)), Bratio: median(notes.map((n) => n.f.B / inharmonicity(n.p))) };
        }
        console.error('measured', name);
    }
    writeFileSync(outPath, JSON.stringify(result, null, 1));
}

if (process.argv[1]?.endsWith('fitPiano.mjs') && process.argv[2] === 'measure') measure(process.argv[3], process.argv[4], process.argv.slice(5));

// ---- fitting ----
const FIELDS = {   // name: [low, high, start]
    strike: [.09, .17, .118], contact: [.6, 4.5, 1], loss: [.5, 3.5, 1], inharm: [.4, 2.2, 1], stiffLow: [.2, 1.5, 1], decayScale: [.4, 2.6, 1.2], slow: [2, 7, 4.5],
    knee: [30, 160, 70], lead: [0, 1.6, 1], darkHz: [250, 4000, 1500], darkOrder: [.2, 3, 1], fund: [-30, 8, 0],
};
const typeOf = (p, ripple) => ({ strike: p.strike, contact: p.contact, loss: p.loss, inharm: p.inharm, stiffLow: p.stiffLow, spread: .45, slow: p.slow, knee: p.knee, lead: p.lead, thump: .3, knock: .8, decayScale: p.decayScale, aftersound: .3,
    dark: [p.darkHz, p.darkOrder, 72], fund: p.fund, ripple, body: { count: 12, low: 110, high: 2200, q: [7, 16], gain: 1 } });

function modelBands(p, ripple) {
    const out = {};
    const shape = typeOf(p, ripple);
    for (const [band, pitches] of Object.entries(BANDS)) {
        const notes = pitches.map((m) => features(analyzeNote(renderAcousticPiano(48000, hz(m), { shape, velocity: .62, decay: 2.8, brightness: .55, hammer: .45, unison: .25, resonance: .6, seed: 11 }), 48000, 0, hz(m))));
        out[band] = average(notes);
    }
    return out;
}
function cost(model, target) {
    let c = 0;
    for (const band of Object.keys(BANDS)) {
        const m = model[band], t = target[band];
        for (let i = 0; i < 16; i++) c += (i < 12 ? 1 : .5) * (m.rel[i] - t.rel[i]) ** 2 / 16;
        for (let i = 0; i < m.slopes.length; i++) c += .25 * (m.slopes[i] - t.slopes[i]) ** 2 / m.slopes.length;
    }
    return c / 4;
}
function fit(targetsPath, name) {
    const target = JSON.parse(readFileSync(targetsPath, 'utf8'))[name], ripple = target.ripple ?? 7;
    const FIXED = ['inharm', 'stiffLow'], keys = Object.keys(FIELDS).filter((k) => !FIXED.includes(k)), p = Object.fromEntries(Object.keys(FIELDS).map((k) => [k, FIELDS[k][2]]));
    // stiffness: start from what was measured
    p.inharm = Math.min(2.2, Math.max(.4, median(['lowmid', 'mid', 'high'].map((b) => target[b].Bratio)))); p.stiffLow = Math.min(1.5, Math.max(.2, target.low.Bratio / p.inharm));
    let best = cost(modelBands(p, ripple), target), step = .25, evals = 0;
    const t0 = Date.now();
    while (step > .015 && evals < 500) {
        let improved = false;
        for (const k of keys) for (const dir of [1, -1]) {
            const [lo, hi] = FIELDS[k], q = { ...p, [k]: Math.min(hi, Math.max(lo, p[k] + dir * step * (hi - lo))) };
            if (q[k] === p[k]) continue;
            const c = cost(modelBands(q, ripple), target); evals++;
            if (c < best) { best = c; p[k] = q[k]; improved = true; }
        }
        if (!improved) step /= 2;
    }
    console.error(`${name}: rms ${Math.sqrt(best).toFixed(1)} dB after ${evals} evals (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    console.log(JSON.stringify({ name, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, +v.toPrecision(3)])), ripple }));
}
if (process.argv[1]?.endsWith('fitPiano.mjs') && process.argv[2] === 'fit') fit(process.argv[3], process.argv[4]);
