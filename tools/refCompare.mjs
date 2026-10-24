// Measures a piano note the same way in a recording and in the model: the stiffness of its strings
// (inharmonicity B), how loud each partial is over the first moments, and how fast each decays.
// Usage: node tools/refCompare.mjs recording.wav [model-type]
import { readWav, onsets } from './refAnalyze.mjs';
import { renderAcousticPiano } from '../src/app/engine/acousticPiano.js';

function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
                re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
                const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
            }
        }
    }
}

/** Magnitude spectrum of `seconds` of signal from `start` (seconds), Hann-windowed, zero-padded 4x. */
export function spectrum(signal, rate, start, seconds) {
    const length = Math.round(seconds * rate), size = 2 ** Math.ceil(Math.log2(length * 4)), re = new Float64Array(size), im = new Float64Array(size), from = Math.round(start * rate);
    for (let i = 0; i < length; i++) re[i] = (signal[from + i] ?? 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / (length - 1)));
    fft(re, im);
    const mag = new Float64Array(size / 2);
    for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i], im[i]) / length * 4;
    return { mag, hz: rate / size };
}

function peakNear(sp, f, tolerance) {
    const lo = Math.max(1, Math.floor(f * (1 - tolerance) / sp.hz)), hi = Math.ceil(f * (1 + tolerance) / sp.hz);
    let best = lo;
    for (let i = lo; i <= hi; i++) if (sp.mag[i] > sp.mag[best]) best = i;
    const a = Math.log(sp.mag[best - 1] + 1e-12), b = Math.log(sp.mag[best] + 1e-12), c = Math.log(sp.mag[best + 1] + 1e-12), shift = .5 * (a - c) / (a - 2 * b + c);
    return { f: (best + (Number.isFinite(shift) ? shift : 0)) * sp.hz, a: sp.mag[best] };
}

/** Fits f_n = n f1 sqrt(1 + B n^2) to measured partials by scanning B. */
function fitStiffness(points) {
    let best = { err: Infinity, f1: 0, B: 0 };
    for (let B = 0; B <= 0.03; B += 2e-5) {
        let num = 0, den = 0;
        for (const { n, f } of points) { const g = n * Math.sqrt(1 + B * n * n); num += f * g; den += g * g; }
        const f1 = num / den; let err = 0;
        for (const { n, f } of points) err += (Math.log(f / (f1 * n * Math.sqrt(1 + B * n * n)))) ** 2;
        if (err < best.err) best = { err, f1, B };
    }
    return best;
}

const WINDOWS = [.03, .3, .75, 1.2, 1.65];
/** Stiffness, partial levels at five moments and each partial's decay rate, for a note starting at `start` seconds. */
export function analyzeNote(signal, rate, start, expected, { partials = 16 } = {}) {
    const first = spectrum(signal, rate, start + .03, .4);
    let f1 = expected, B = 1e-4, found = [];
    for (let pass = 0; pass < 3; pass++) {
        found = [];
        for (let n = 1; n <= (pass ? 40 : 6); n++) {
            const guess = n * f1 * Math.sqrt(1 + B * n * n);
            if (guess > rate * .4) break;
            const p = peakNear(first, guess, pass ? .012 : .04);
            // keep only clear peaks: well above the local floor
            let floor = 0, count = 0;
            for (let k = Math.round(guess * .7 / first.hz); k < Math.round(guess * 1.3 / first.hz); k += 7) { floor += first.mag[k]; count++; }
            if (p.a > 4 * (floor / count)) found.push({ n, f: p.f, a: p.a });
        }
        if (found.length < 3) break;
        const fit = fitStiffness(found); f1 = fit.f1; B = fit.B;
    }
    const times = WINDOWS.map((t) => spectrum(signal, rate, start + t, .4));
    const levels = [];
    for (let n = 1; n <= partials; n++) {
        const f = n * f1 * Math.sqrt(1 + B * n * n);
        levels.push(f > rate * .4 ? null : times.map((sp) => peakNear(sp, f, .006).a));
    }
    return { f1, B, partialsFound: found.length, levels, centreTimes: WINDOWS.map((t) => t + .2) };
}

const db = (x, ref) => (20 * Math.log10(x / ref)).toFixed(0).padStart(4);
export function report(label, note) {
    const top = Math.max(...note.levels.filter(Boolean).map((l) => l[0]));
    console.log(`${label}  f1=${note.f1.toFixed(2)} Hz  B=${note.B.toExponential(1)}  (${note.partialsFound} partials fitted)`);
    console.log('   partial level at +0.2s, re strongest (dB):' + note.levels.map((l) => (l ? db(l[0], top) : '   -')).join(''));
    // decay between the 2nd and 5th windows in dB per second, for partials 1, 2, 3, 4, 6, 8, 12
    const slope = (l) => { const t = note.centreTimes, y = l.map((a) => 20 * Math.log10(a + 1e-12)); const n = 4; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = 1; i < 5; i++) { sx += t[i]; sy += y[i]; sxx += t[i] * t[i]; sxy += t[i] * y[i]; } return (n * sxy - sx * sy) / (n * sxx - sx * sx); };
    console.log('   decay dB/s of partials 1 2 3 4 6 8 12:  ' + [1, 2, 3, 4, 6, 8, 12].map((n) => (note.levels[n - 1] ? slope(note.levels[n - 1]).toFixed(0).padStart(5) : '    -')).join(''));
    const first = note.levels[0] ? note.levels[0].map((a) => (20 * Math.log10(a / top)).toFixed(0)).join(' ') : '';
    console.log('   fundamental across the 5 moments (dB re strongest at +0.2s): ' + first);
}

const C = [32.7032, 65.4064, 130.8128, 261.6256, 523.2511, 1046.502, 2093.005];
if (process.argv[1]?.endsWith('refCompare.mjs') && process.argv[2] && process.argv[2] !== '--model') {
    const wav = readWav(process.argv[2]), list = onsets(wav).onsets;
    list.slice(0, 14).forEach((o, i) => report(`${i < 7 ? 'HARD  ' : 'GENTLE'} C${i % 7 + 1} @${o.time.toFixed(2)}s`, analyzeNote(wav.mono, wav.rate, o.time, C[i % 7])));
}

// Model notes measured the same way: node tools/refCompare.mjs --model grand|upright|felted [velocity] [more options as JSON]
if (process.argv[1]?.endsWith('refCompare.mjs') && process.argv[2] === '--model') {
    const type = process.argv[3] ?? 'grand', velocity = Number(process.argv[4] ?? .85), extra = process.argv[5] ? JSON.parse(process.argv[5]) : {}, rate = 48000;
    C.forEach((f, i) => report(`MODEL ${type} v${velocity} C${i + 1}`, analyzeNote(renderAcousticPiano(rate, f, { type, velocity, decay: 2.8, brightness: .55, hammer: .45, unison: .25, resonance: .6, seed: 11, ...extra }), rate, 0, f)));
}
