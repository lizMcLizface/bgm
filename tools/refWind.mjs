// Measures the sustained notes of a wind, brass or choir take against its timeline: the true pitch
// (octave transposition), the harmonic ladder, how fast it speaks, vibrato, breath noise and how the
// spectrum changes with strength. Usage: node tools/refWind.mjs recording.wav timeline.json [json]
import { readFileSync } from 'node:fs';
import { readWav } from './refAnalyze.mjs';
import { spectrum } from './refCompare.mjs';
import { envelope, firstNoteOffset } from './refTimeline.mjs';

const hz = (m) => 440 * 2 ** ((m - 69) / 12);
function peakAt(sp, f, tol = .03) {
    let b = Math.max(2, Math.round(f * (1 - tol) / sp.hz));
    const hi = Math.min(sp.mag.length - 3, Math.round(f * (1 + tol) / sp.hz));
    for (let i = b; i <= hi; i++) if (sp.mag[i] > sp.mag[b]) b = i;
    const a = Math.log(sp.mag[b - 1] + 1e-12), c = Math.log(sp.mag[b] + 1e-12), d = Math.log(sp.mag[b + 1] + 1e-12), shift = .5 * (a - d) / (a - 2 * c + d);
    return { f: (b + (Number.isFinite(shift) ? shift : 0)) * sp.hz, a: sp.mag[b] };
}

/** Which of nominal / an octave away is sounding: the one whose harmonic comb collects the most energy. */
function trueFundamental(sp, nominal) {
    let best = null;
    for (const octave of [1, 2]) {
        const f0 = nominal * octave; let score = 0;
        for (let n = 1; n <= 8 && f0 * n < 9000; n++) score += peakAt(sp, f0 * n, .02).a;
        if (!best || score > best.score * 1.15) best = { f0, score, octave };
    }
    return best;
}

export function analyzeSustained(wav, env, event, offset) {
    const start = event.start + offset, nominal = hz(event.pitch);
    const hold = event.release - event.start;
    const sp = spectrum(wav.mono, wav.rate, start + Math.min(1.2, hold * .4), .5);
    const { f0, octave } = trueFundamental(sp, nominal);
    const f0m = peakAt(sp, f0, .03).f;
    const harmonics = [];
    for (let n = 1; n <= 24 && f0m * n < 14000; n++) harmonics.push(peakAt(sp, f0m * n, .015).a);
    const top = Math.max(...harmonics);
    // breath/noise: spectrum between the harmonics against the harmonics
    let between = 0, count = 0, tonal = 0;
    for (let n = 1; n <= 10 && f0m * (n + .5) < 9000; n++) {
        const i = Math.round(f0m * (n + .5) / sp.hz); let m = 0; for (let k = i - 2; k <= i + 2; k++) m = Math.max(m, sp.mag[k]); between += m * m; count++;
        tonal += harmonics[n - 1] ** 2;
    }
    const breathDb = 10 * Math.log10((between / count) / (tonal / count + 1e-18) + 1e-18);
    // speech: 10%..90% of the level reached in the first two seconds, and the time to the first 10%
    const i0 = Math.round(start / .01), seg = env.slice(i0, i0 + 200), mx = Math.max(...seg);
    let t10 = null, t90 = null; seg.forEach((x, i) => { if (t10 === null && x > mx * .1) t10 = i; if (t90 === null && x > mx * .9) t90 = i; });
    // the level over the note, in dB below its loudest moment, and how long after the key goes up it takes to fall 40 dB
    const held = env.slice(i0, i0 + Math.round(hold * 100)), top100 = Math.max(...held);
    const profile = [.05, .1, .2, .4, .8, 1.5, 2.5, 3.5].map((t) => (t < hold ? 20 * Math.log10((held[Math.round(t * 100)] ?? 1e-9) / top100 + 1e-9) : null));
    let shortfall = null; for (let k = 0; k < held.length; k++) if (held[k] > top100 * .7) { shortfall = k * .01; break; }
    const rel = env.slice(i0 + Math.round(hold * 100) - 5, i0 + Math.round(hold * 100) + 600), relTop = Math.max(...rel.slice(0, 10));
    let release40 = null; for (let k = 0; k < rel.length; k++) if (rel[k] < relTop * .01) { release40 = k * .01; break; }
    // vibrato on the strongest of the first six harmonics
    const strong = harmonics.slice(0, 6).reduce((b, a, i) => (a > b.a ? { a, n: i + 1 } : b), { a: 0, n: 1 }), series = [];
    for (let t = Math.min(1, hold * .25); t <= hold - .4; t += .05) {
        const s = spectrum(wav.mono, wav.rate, start + t, .2);
        series.push(1200 * Math.log2(peakAt(s, strong.n * f0m, .015).f / (strong.n * f0m)));
    }
    const mean = series.reduce((a, b) => a + b, 0) / series.length, dev = series.map((x) => x - mean);
    let crossings = 0; for (let i = 1; i < dev.length; i++) if (dev[i - 1] < 0 && dev[i] >= 0) crossings++;
    const rms = Math.sqrt(dev.reduce((a, b) => a + b * b, 0) / dev.length);
    // spectral centroid over the first 24 harmonics, in harmonic numbers and Hz
    const total = harmonics.reduce((a, b) => a + b * b, 0), centroidN = harmonics.reduce((a, b, i) => a + (i + 1) * b * b, 0) / total;
    return {
        pitch: event.pitch, velocity: event.velocity, f0: f0m, octave, cents: 1200 * Math.log2(f0m / (nominal * octave)),
        levelDb: 20 * Math.log10(Math.max(...env.slice(i0 + Math.round(Math.min(1.2, hold * .4) * 100), i0 + Math.round(hold * 100) - 20)) + 1e-9),
        harmonicsDb: harmonics.map((a) => 20 * Math.log10(a / top + 1e-9)), breathDb,
        profile, reach70: shortfall, release40, startSeconds: (t10 ?? 0) * .01, vibratoHz: crossings / ((series.length - 1) * .05), vibratoCents: rms,
        centroidHarmonic: centroidN, centroidHz: centroidN * f0m,
    };
}

export function analyzeTake(file, timelineFile) {
    const wav = readWav(file), timeline = JSON.parse(readFileSync(timelineFile, 'utf8')), env = envelope(wav), offset = firstNoteOffset(env, timeline.events[0].start) ?? 0;
    return timeline.events.filter((e) => e.kind === 'sustained').map((e) => analyzeSustained(wav, env, e, offset));
}

if (process.argv[1]?.endsWith('refWind.mjs') && process.argv[3]) {
    const notes = analyzeTake(process.argv[2], process.argv[3]);
    if (process.argv[4] === 'json') console.log(JSON.stringify(notes));
    else for (const n of notes) console.log(`MIDI ${String(n.pitch).padStart(3)} v${String(n.velocity).padStart(3)}  sounds ${n.octave === 1 ? 'as written' : n.octave > 1 ? 'x' + n.octave + ' up' : 'down'} ${n.f0.toFixed(1).padStart(7)} Hz (${n.cents.toFixed(0).padStart(3)} c)  level ${n.levelDb.toFixed(0)} dB  centroid h${n.centroidHarmonic.toFixed(1)} (${n.centroidHz.toFixed(0)} Hz)  rise-to-70% ${n.reach70?.toFixed(2)} s  release-40dB ${n.release40?.toFixed(2)} s  vibrato ${n.vibratoHz.toFixed(1)} Hz ${n.vibratoCents.toFixed(1)} c  breath ${n.breathDb.toFixed(0)} dB\n        level over time (.05 .1 .2 .4 .8 1.5 2.5 3.5 s): ${n.profile.map((x) => (x === null ? '  -' : x.toFixed(0).padStart(3))).join(' ')}
        h1..12 dB: ${n.harmonicsDb.slice(0, 12).map((x) => x.toFixed(0).padStart(4)).join('')}`);
}
