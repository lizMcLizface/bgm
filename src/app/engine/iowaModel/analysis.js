// Measures one note of an Iowa recording into the numbers /synths/iowa plays it from (docs/IOWA_INSTRUMENTS.md). Pure functions on
// typed arrays, used by tools/analyzeIowa.mjs and the tests, nothing in playback.
import { fft, heterodyne } from '../pianoModel/dsp.js';

const NAMES = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
export const ENVELOPE_MS = [0, 5, 10, 15, 20, 30, 40, 60, 80, 100, 130, 160, 200, 250, 300, 400, 500];
export const RELEASE_MS = [0, 20, 40, 80, 120, 200, 300, 500, 800];
export const SLICE_MS = [10, 25, 50, 90, 160, 280];
export const SLICE_HARMONICS = 16;
export const BANDS = Array.from({ length: 22 }, (_, i) => 125 * 2 ** (i / 3));   // third octaves, 125 Hz to 16 kHz
const db = (power) => 10 * Math.log10(power + 1e-14);
const median = (list) => { const s = Array.from(list).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const mean = (list) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
const pow2Above = (n) => 2 ** Math.ceil(Math.log2(n));
const clampSize = (n, lo, hi) => Math.max(lo, Math.min(hi, pow2Above(n)));

const noteMidi = (name) => { const m = /^([A-G]b?)(\d)$/.exec(name); return m ? 12 * (Number(m[2]) + 1) + NAMES[m[1]] : null; };

/** What an Iowa file name says: its dynamic, the range of its scale (low to high), the string it was played on. */
export function parseName(file) {
    const tokens = file.replace(/\.aiff?$/i, '').replace(/\s+/g, '').split('.');
    const dynamic = tokens.find((t) => /^(pp|mf|ff)$/i.test(t))?.toLowerCase() ?? 'mf';
    const string = tokens.find((t) => /^sul_?[A-G]$/i.test(t))?.replace('_', '') ?? null;
    let from = null, to = null;
    for (const t of tokens) {
        const m = /^([A-G]b?\d)([A-G]b?\d)?$/.exec(t);
        if (!m) continue;
        from = noteMidi(m[1]); to = m[2] ? noteMidi(m[2]) : from;
        if (to < from) to += 12;      // one or two files name the top note an octave low (Db2C2 runs up to C3)
    }
    return { dynamic, string, from, to };
}

/** What a VSCO file name says: the note, and its dynamic layer as a number (v1, v2, ...) or a marking; the first round-robin take is the one used. Null for a later take. */
export function parseVscoName(file) {
    const base = file.replace(/\.wav$/i, ''), note = /(?:^|_)([A-G])(#?)(\d)(?=_|$|[a-z])/.exec(base);
    if (!note) return null;
    if (/rr[2-9]|_[2-9](?:_|$)/i.test(base) || /sustain[2-9]/i.test(base)) return null;
    const layer = /_v(\d)/.exec(base), SHARPS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    return { midi: 12 * (Number(note[3]) + 1) + SHARPS[note[1]] + (note[2] ? 1 : 0), layer: layer ? Number(layer[1]) : 0 };
}

/** The dynamic each layer number stands for: the softest pp, the loudest ff, anything in between (or a single layer) mf. */
export function layerNames(numbers) {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    return Object.fromEntries(sorted.map((n, i) => [n, sorted.length === 1 ? 'mf' : i === 0 ? 'pp' : i === sorted.length - 1 ? 'ff' : 'mf']));
}

/** A roll: how fast the hits come, how unevenly in time (fraction of the interval) and in level (dB). Hits are the level's local peaks at least 25 ms apart. */
export function measureRoll(x, rate) {
    const step = .005, env = levels(x, rate, step, .01), top = Math.max(...env), hits = [];
    for (let i = 5; i < env.length - 5; i++) {
        if (env[i] < top - 18 || env[i] < env[i - 1] || env[i] < env[i + 1]) continue;
        const around = env.slice(i - 5, i + 6);
        if (env[i] === Math.max(...around) && env[i] - Math.min(...around) > 2) hits.push(i);
    }
    if (hits.length < 4) return null;
    const gaps = hits.slice(1).map((h, i) => (h - hits[i]) * step), typical = median(gaps), peaks = hits.map((h) => env[h]), level = mean(peaks);
    return { rate: 1 / typical, timing: Math.sqrt(mean(gaps.map((g) => (g - typical) ** 2))) / typical, level: Math.sqrt(mean(peaks.map((v) => (v - level) ** 2))) };
}

/** RMS level in dB in steps of `step` seconds over a window of `width` seconds. */
export function levels(x, rate, step, width = step, from = 0, to = x.length) {
    const hop = Math.max(1, Math.round(step * rate)), size = Math.max(1, Math.round(width * rate)), out = [];
    for (let at = from; at + size <= to; at += hop) {
        let sum = 0;
        for (let i = 0; i < size; i++) sum += x[at + i] * x[at + i];
        out.push(db(sum / size));
    }
    return out;
}

/** Power spectrum of a Hann-windowed stretch: a sine of power P sums to P over its main lobe. */
function spectrum(x, from, n, pad = 1) {
    const size = n * pad, re = new Float64Array(size), im = new Float64Array(size);
    let weight = 0;
    for (let i = 0; i < n; i++) { const w = .5 - .5 * Math.cos(2 * Math.PI * (i + .5) / n); re[i] = (x[from + i] ?? 0) * w; weight += w * w; }
    fft(re, im);
    const power = new Float64Array(size / 2), scale = 2 / (size * weight);
    for (let i = 0; i < size / 2; i++) power[i] = (re[i] * re[i] + im[i] * im[i]) * scale;
    return power;
}

/** Notes separated by silence: stretches above the recording's floor, trying thresholds until the count is the one the name promises; null if none does. */
export function segmentBySilence(x, rate, expected) {
    const step = .02, env = levels(x, rate, step), floor = median([...env].sort((a, b) => a - b).slice(0, Math.max(4, env.length >> 2)));
    for (const above of [15, 12, 20, 9, 25, 30]) {
        const notes = [];
        let start = -1, quiet = 0;
        env.forEach((level, i) => {
            if (level > floor + above) { if (start < 0) start = i; quiet = 0; }
            else if (start >= 0 && ++quiet * step > .16) { if ((i - quiet - start) * step > .08) notes.push([start, i - quiet + 1]); start = -1; }
        });
        if (start >= 0 && (env.length - start) * step > .08) notes.push([start, env.length]);
        if (notes.length === expected) return notes.map(([a, b]) => [Math.max(0, Math.round((a - 1.5) * step * rate)), Math.min(x.length, Math.round((b + 1) * step * rate))]);
    }
    return null;
}

/**
 * The notes of a held chromatic scale from `from` to `to`, which some recordings play with no silence between notes: how much of each
 * frame's power sits on each note's harmonics, the best path through the notes in order, then each boundary moved to the level's lowest point near it.
 * Returns one [start, end] per note, or null where the recording seems not to play that note.
 */
export function segmentHeld(x, rate, from, to) {
    const separated = segmentBySilence(x, rate, to - from + 1);
    if (separated) return separated;
    const notes = to - from + 1, n = clampSize(rate * .25, 4096, 32768), hop = Math.round(rate * .04), hz = rate / n, scores = [], loudness = [];
    for (let at = 0; at + n <= x.length; at += hop) {
        const power = spectrum(x, at, n), total = power.reduce((a, b) => a + b, 0) + 1e-12;
        loudness.push(total);
        scores.push(Array.from({ length: notes }, (_, i) => {
            const f = 440 * 2 ** ((from + i - 69) / 12);
            let sum = 0;
            for (let k = 1; k <= 8 && k * f < rate * .45; k++) { const bin = Math.round(k * f / hz); for (let j = Math.max(0, bin - 1); j <= bin + 1; j++) sum += power[j] ?? 0; }
            return sum / total;
        }));
    }
    if (scores.length < notes) return Array(notes).fill(null);
    const loudest = Math.max(...loudness);
    scores.forEach((row, f) => { if (loudness[f] < loudest * 1e-3) row.fill(0); });
    // best[f][i]: the most score reachable with frame f on note i, moving only upward through the scale, one note at a time at most
    const frames = scores.length, best = scores.map(() => new Float64Array(notes).fill(-Infinity)), back = scores.map(() => new Int16Array(notes));
    best[0][0] = scores[0][0];
    for (let f = 1; f < frames; f++) for (let i = 0; i < notes; i++) {
        const stay = best[f - 1][i], move = i ? best[f - 1][i - 1] : -Infinity;
        best[f][i] = Math.max(stay, move) + scores[f][i];
        back[f][i] = stay >= move ? i : i - 1;
    }
    const path = new Int16Array(frames);
    path[frames - 1] = notes - 1;
    for (let f = frames - 1; f > 0; f--) path[f - 1] = back[f][path[f]];
    const env = levels(x, rate, .01), spans = [];
    const frameTime = (f) => (f * hop + n / 2) / rate, lowestNear = (t) => {
        const lo = Math.max(0, Math.round((t - .35) / .01)), hi = Math.min(env.length - 1, Math.round((t + .35) / .01));
        let low = lo;
        for (let i = lo; i <= hi; i++) if (env[i] < env[low]) low = i;
        return low * .01;
    };
    const cuts = [0];
    for (let i = 1; i < notes; i++) cuts.push(lowestNear(frameTime(path.indexOf(i))));
    cuts.push(x.length / rate);
    for (let i = 0; i < notes; i++) {
        const frameList = [];
        path.forEach((p, f) => { if (p === i) frameList.push(scores[f][i]); });
        const start = Math.round(cuts[i] * rate), end = Math.round(cuts[i + 1] * rate);
        const sounding = frameList.filter((v) => v > 0).sort((p, q) => p - q);
        spans.push(!sounding.length || sounding[Math.floor(sounding.length * .75)] < .25 || end - start < rate * .25 ? null : [start, end]);
    }
    return spans.map((span) => span && trimToNote(x, rate, span));
}

/** A cut note without the silence around it, keeping a little before the start. */
function trimToNote(x, rate, [start, end]) {
    const env = levels(x, rate, .01, .01, start, end), peak = Math.max(...env), floorDb = peak - 35;
    let first = env.findIndex((l) => l > floorDb), last = env.length - 1;
    while (last > first && env[last] < floorDb) last--;
    first = Math.max(0, first);
    return [Math.max(start, start + Math.round((first - 3) * .01 * rate)), Math.min(end, start + Math.round((last + 3) * .01 * rate))];
}

/**
 * The strikes of a struck or plucked chromatic scale from `from` to `to`. Level alone cannot do this: a mallet's rebound is a strike too, and one
 * miscount moves every later note to the wrong pitch. So every sharp rise is a candidate, each scored on how much of it sits where each note's
 * partials should be, and the best assignment in order picks the strikes. Returns one [start, end] per note, or null for a note no strike fits.
 */
export function segmentStruck(x, rate, from, to) {
    const step = .005, env = levels(x, rate, step), notes = to - from + 1, candidates = [], loudest = Math.max(...env);
    for (let i = 4; i < env.length - 1; i++) {
        const rise = env[i] - Math.min(env[i - 4], env[i - 3]);
        if (rise <= 6 || env[i + 1] > env[i] + 3 || env[i] < loudest - 35) continue;     // a rise in the room's hum is not a strike
        const last = candidates.at(-1);
        // a rise is one candidate however many frames it spans: its loudest frame, and .1 s clear of the one before
        if (last && (i - last.i) * step < .1) { if (env[i] > env[last.i]) last.i = i; continue; }
        candidates.push({ i });
    }
    const n = clampSize(rate * .25, 4096, 32768), hz = rate / n, lowest = 440 * 2 ** ((from - 69) / 12);
    const scores = candidates.map(({ i }) => {
        const power = spectrum(x, Math.round(i * step * rate), n);
        let total = 1e-12;
        for (let bin = Math.ceil(lowest * .7 / hz); bin < power.length; bin++) total += power[bin];
        return Array.from({ length: notes }, (_, note) => {
            const f = 440 * 2 ** ((from + note - 69) / 12);
            let sum = 0;
            for (const [k, weight] of [[1, 1], [2, .5], [3, .5], [4, .5]]) {
                const centre = k * f / hz, wide = Math.max(1, centre * .02);       // about 35 cents
                for (let bin = Math.round(centre - wide); bin <= centre + wide; bin++) sum += weight * (power[bin] ?? 0);
            }
            return sum / total;
        });
    });
    // best[note][c]: the most score from the first `note` notes using the first `c` candidates, each used once, in order
    const count = candidates.length, best = Array.from({ length: notes + 1 }, () => new Float64Array(count + 1));
    for (let note = 1; note <= notes; note++) for (let c = 1; c <= count; c++) best[note][c] = Math.max(best[note - 1][c], best[note][c - 1], best[note - 1][c - 1] + scores[c - 1][note - 1]);
    const chosen = Array(notes).fill(null);
    for (let note = notes, c = count; note > 0 && c > 0;) {
        if (best[note][c] === best[note][c - 1]) c--;
        else if (best[note][c] === best[note - 1][c]) note--;
        else { if (scores[c - 1][note - 1] > .04) chosen[note - 1] = c - 1; note--; c--; }
    }
    // a rebound fits its note as well as the strike before it did: of the candidates that fit a note, the first is the strike
    let previous = -1;
    chosen.forEach((c, note) => {
        if (c === null) return;
        let first = c;
        while (first - 1 > previous && scores[first - 1][note] > scores[c][note] * .5) first--;
        chosen[note] = previous = first;
    });
    return chosen.map((c, note) => {
        if (c === null) return null;
        const next = chosen.slice(note + 1).find((later) => later !== null);
        return [Math.max(0, Math.round((candidates[c].i - 6) * step * rate)), next === undefined ? x.length : Math.round((candidates[next].i - 8) * step * rate)];
    });
}

/** The fundamental near `f`, by the sum of log levels at the harmonics, in 2-cent steps within ±range cents. */
export function findPitch(x, rate, from, count, f, range = 120) {
    const n = 2 ** Math.floor(Math.log2(Math.min(count, 1 << 16))), power = spectrum(x, from, n, 2), hz = rate / (2 * n);
    let best = f, top = -Infinity;
    for (let cents = -range; cents <= range; cents += 2) {
        const candidate = f * 2 ** (cents / 1200);
        let sum = 0;
        for (let k = 1; k <= 8 && k * candidate < rate * .45; k++) {
            const i = Math.round(k * candidate / hz);
            sum += Math.log(Math.max(power[i - 1] ?? 0, power[i] ?? 0, power[i + 1] ?? 0) + 1e-12) / Math.sqrt(k);
        }
        if (sum > top) { top = sum; best = candidate; }
    }
    return best;
}

/** Harmonic powers in one frame. */
function harmonicsIn(x, rate, from, n, f0, count) {
    const power = spectrum(x, from, n), hz = rate / n, out = new Float64Array(count);
    for (let k = 0; k < count; k++) {
        const bin = Math.round((k + 1) * f0 / hz);
        for (let i = Math.max(0, bin - 2); i <= bin + 2 && i < power.length; i++) out[k] += power[i];
    }
    return out;
}

/** Noise in third octaves (power in each band): the typical level between harmonics, less the recording's floor. */
function noiseBands(power, hz, f0, width, floor) {
    return BANDS.map((centre, b) => {
        const lo = centre * 2 ** (-1 / 6), hi = centre * 2 ** (1 / 6), values = [];
        for (let i = Math.ceil(lo / hz); i <= hi / hz && i < power.length; i++) {
            const f = i * hz, k = Math.max(1, Math.round(f / f0));
            if (Math.abs(f - k * f0) > Math.max(6 * hz, 2 * width * k)) values.push(power[i]);
        }
        if (!values.length) return 0;
        return Math.max(0, median(values) * 1.44 - (floor?.[b] ?? 0)) * (hi - lo) / hz;   // 1.44: the median of chi-square power is .69 of its mean
    });
}

/** The floor of a recording, measured between its notes, as noise power per bin (of rate / 8192 Hz) in each band. */
export function silenceBands(x, rate, gaps) {
    const n = 8192, hz = rate / n, frames = [];
    for (const [from, to] of gaps) for (let at = from; at + n <= to; at += n) frames.push(spectrum(x, at, n));
    if (!frames.length) return null;
    return BANDS.map((centre) => {
        const lo = Math.ceil(centre * 2 ** (-1 / 6) / hz), hi = Math.floor(centre * 2 ** (1 / 6) / hz);
        let sum = 0, count = 0;
        for (const frame of frames) for (let i = lo; i <= hi && i < frame.length; i++) { sum += frame[i]; count++; }
        return count ? sum / count : 0;
    });
}

/** A floor in power per bin of size hz. */
const floorAt = (floor, rate, hz) => floor && floor.map((p) => p * hz / (rate / 8192));

/** Slow movement of a held note: vibrato and tremolo (strongest pitch movement between 2 and 9 Hz and the level's at that rate), and what wanders besides. */
export function movement(x, rate, from, to, f0, harmonicsDb) {
    let best = 0;
    harmonicsDb.forEach((level, k) => { if ((k + 1) * f0 < 5000 && level > harmonicsDb[best]) best = k; });
    const target = (best + 1) * f0, n = clampSize(4 * rate / f0, 2048, 8192), hop = Math.round(rate * .01), pad = 4, hz = rate / (n * pad);
    const cents = [], loud = [];
    for (let at = from; at + n < to; at += hop) {
        const power = spectrum(x, at, n, pad);
        const lo = Math.max(1, Math.floor(target * 2 ** (-90 / 1200) / hz)), hi = Math.min(power.length - 2, Math.ceil(target * 2 ** (90 / 1200) / hz));
        let peak = lo;
        for (let i = lo; i <= hi; i++) if (power[i] > power[peak]) peak = i;
        const a = Math.log(power[peak - 1] + 1e-30), b = Math.log(power[peak] + 1e-30), c = Math.log(power[peak + 1] + 1e-30);
        // a peak lies within a bin of the largest sample; on a noisy frame the fit can say otherwise, and one such frame would read as huge vibrato
        const offset = Math.abs(a - 2 * b + c) > 1e-9 ? Math.max(-1, Math.min(1, .5 * (a - c) / (a - 2 * b + c))) : 0;
        cents.push(1200 * Math.log2((peak + offset) * hz / target));
        let sum = 0;
        for (let i = 0; i < n; i++) sum += x[at + i] * x[at + i];
        loud.push(db(sum / n));
    }
    if (cents.length < 30) return { cents: 0, rate: 0, depth: 0, tremolo: 0, pitchWander: 0, levelWander: 0 };
    const tuning = median(cents), step = hop / rate, pitch = cents.map((c) => c - tuning);
    const average = mean(loud), level = loud.map((l) => l - average);
    const dft = (series, r) => {
        let s = 0, q = 0;
        series.forEach((v, i) => { s += v * Math.sin(2 * Math.PI * r * i * step); q += v * Math.cos(2 * Math.PI * r * i * step); });
        return 2 * Math.hypot(s, q) / series.length;
    };
    let vibratoRate = 0, depth = 0;
    for (let r = 2; r <= 9; r += .1) { const d = dft(pitch, r); if (d > depth) { depth = d; vibratoRate = r; } }
    const tremolo = dft(level, vibratoRate);
    const rms = (series) => Math.sqrt(mean(series.map((v) => v * v)));
    return {
        cents: tuning, rate: vibratoRate, depth, tremolo,
        pitchWander: Math.sqrt(Math.max(0, rms(pitch) ** 2 - depth * depth / 2)), levelWander: Math.sqrt(Math.max(0, rms(level) ** 2 - tremolo * tremolo / 2)),
    };
}

/** Where a note begins, in samples: from where the level first comes within 20 dB of what it settles at, back down the rise (at most 80 ms) to 40 dB under it. */
function onsetOf(env, reference, step, rate) {
    let i = Math.max(0, env.findIndex((l) => l > reference - 20));
    const limit = Math.max(0, i - Math.round(.08 / step));
    while (i > limit && env[i - 1] > reference - 40 && env[i - 1] < env[i] + 2) i--;
    return Math.round(i * step * rate);
}

/**
 * Where a held note really starts, in samples. A cut can open on a second or more of room noise, loud enough to pass for the note by level alone, which then
 * gets measured as its attack and its vibrato. So: where the note's own first harmonics come within 12 dB of what they settle at, then back over what
 * rises out of the noise just before it, at most 150 ms, which keeps the bow's or the breath's own start, and 20 ms of lead.
 */
export function heldStart(x, rate, midi) {
    const f0 = 440 * 2 ** ((midi - 69) / 12), step = .01, seconds = x.length / rate - .05;
    if (seconds < .2) return 0;
    const window = Math.round(rate * Math.max(.012, 3 / f0)), power = [1, 2, 3].filter((k) => k * f0 < rate * .45).map((k) => {
        const h = heterodyne(x, rate, k * f0, window, step, seconds);
        return Array.from(h.re, (re, i) => re * re + h.im[i] * h.im[i]);
    });
    const pitched = power[0].map((_, i) => db(power.reduce((sum, row) => sum + row[i], 0))), settled = median(pitched.filter((l) => l > Math.max(...pitched) - 14));
    const arrives = Math.max(0, pitched.findIndex((l) => l > settled - 12));
    const broad = levels(x, rate, step, .02), before = broad.slice(0, Math.max(1, arrives - Math.round(.15 / step))), noise = median(before);
    let start = Math.min(arrives, broad.length - 1);
    const limit = Math.max(0, arrives - Math.round(.15 / step));
    while (start > limit && broad[start - 1] > noise + 6) start--;
    return Math.max(0, Math.round((start * step - .02) * rate));
}

/** A held note. `x` is the note with a little silence before it. */
export function analyzeHeld(x, rate, midi, floor) {
    let f0 = 440 * 2 ** ((midi - 69) / 12);
    const step = .005, coarse = levels(x, rate, step, Math.max(step, 1 / f0));
    const peak = Math.max(...coarse), steadyDb = median(coarse.filter((l) => l > peak - 14));
    const onset = onsetOf(coarse, steadyDb, step, rate);
    let last = coarse.length - 1;
    while (last > 0 && coarse[last] < steadyDb - 8) last--;
    const ending = Math.round(last * step * rate);
    const from = Math.min(onset + Math.round(.35 * rate), onset + Math.round((ending - onset) * .35));
    const to = Math.max(from + Math.round(.1 * rate), ending - Math.round(.08 * rate));
    f0 = findPitch(x, rate, from, to - from, f0);
    const count = Math.min(40, Math.floor(18000 / f0)), n = clampSize(4 * rate / f0, 1024, 8192), hop = Math.round(.02 * rate);
    const sum = new Float64Array(count);
    for (let at = from, first = true; first || at + n < to; at += hop, first = false) {
        const part = harmonicsIn(x, rate, at, n, f0, count);
        for (let k = 0; k < count; k++) sum[k] += part[k];
    }
    const total = sum.reduce((a, b) => a + b, 0) || 1e-14, shape = Array.from(sum, (p) => db(p / total));
    const moves = movement(x, rate, from, to, f0, shape);
    const shortN = clampSize(3 * rate / f0, 512, n), slices = SLICE_MS.map((ms) => {
        const part = harmonicsIn(x, rate, Math.max(0, onset + Math.round(ms / 1000 * rate) - (shortN >> 1)), shortN, f0, count);
        const partTotal = part.reduce((a, b) => a + b, 0) || 1e-14;
        return Array.from({ length: Math.min(SLICE_HARMONICS, count) }, (_, k) => db(part[k] / partTotal) - shape[k]);
    });
    const at = (ms, origin) => coarse[Math.min(coarse.length - 1, Math.max(0, Math.round((origin / rate + ms / 1000) / step)))] - steadyDb;
    // Some scales run from note to note with no silence: the cut starts on the last note's tail, so the rise is read off this note's own strongest harmonic.
    const joined = coarse[0] > steadyDb - 25;
    let attack = ENVELOPE_MS.map((ms) => at(ms, onset));
    if (joined) {
        const strongest = shape.indexOf(Math.max(...shape)), f = (strongest + 1) * f0, h = heterodyne(x, rate, f, Math.round(rate * Math.max(.004, 3 / f)), .005, Math.min(.8, x.length / rate - .02));
        const amps = Array.from(h.re, (re, k) => 20 * Math.log10(Math.hypot(re, h.im[k]) + 1e-9)), settled = median(amps.slice(Math.min(amps.length - 1, 60)));
        const begins = Math.max(0, amps.findIndex((l) => l > settled - 25));
        attack = ENVELOPE_MS.map((ms) => Math.min(6, (amps[Math.min(amps.length - 1, begins + Math.round(ms / 5))] ?? settled) - settled));
    }
    const longN = Math.min(1 << 14, 2 ** Math.floor(Math.log2(Math.max(4096, to - from))));
    const steadyPower = new Float64Array(longN >> 1);
    let longFrames = 0;
    for (let a = from, first = true; first || a + longN <= to; a += longN >> 1, first = false) {
        const part = spectrum(x, a, longN);
        for (let i = 0; i < part.length; i++) steadyPower[i] += part[i];
        longFrames++;
    }
    for (let i = 0; i < steadyPower.length; i++) steadyPower[i] /= longFrames;
    const hz = rate / longN, width = f0 * (2 ** (Math.max(moves.depth, 4) * 1.5 / 1200) - 1);
    const noise = noiseBands(steadyPower, hz, f0, width, floorAt(floor, rate, hz));
    const burstN = 2048, burstHz = rate / burstN;
    const burst = noiseBands(spectrum(x, Math.max(0, onset - 256), burstN), burstHz, f0, 2 * burstHz, floorAt(floor, rate, burstHz));
    const signal = 10 ** (steadyDb / 10);
    return {
        midi, cents: moves.cents, level: steadyDb, harmonics: shape, slices,
        envelope: attack, joined,
        release: RELEASE_MS.map((ms) => at(ms, ending)),
        noise: noise.map((p) => db(p / signal)), burst: burst.map((p) => db(p / signal)),
        rate: moves.rate, depth: moves.depth, tremolo: moves.tremolo, pitchWander: moves.pitchWander, levelWander: moves.levelWander,
    };
}

/** A struck or plucked note: its strongest partials, each with its own level, rise and two decay rates, and the noise of the strike. */
export function analyzeDecay(x, rate, midi, floor, maxPartials = 32) {
    const f0 = 440 * 2 ** ((midi - 69) / 12), step = .005, coarse = levels(x, rate, step, Math.max(step, 1 / f0));
    const peak = Math.max(...coarse), onset = onsetOf(coarse, peak, step, rate), y = x.subarray(onset);
    if (y.length < rate * .1) return null;     // a cut with hardly anything after its onset
    const n = Math.min(1 << 15, 2 ** Math.floor(Math.log2(Math.max(4096, y.length)))), pad = 2, power = spectrum(y, 0, n, pad), hz = rate / (n * pad);
    const minSpacing = Math.max(8, f0 * .08), found = [];
    for (let i = 2; i < power.length - 2 && i * hz < 18000; i++) if (i * hz > f0 * .75 && power[i] > power[i - 1] && power[i] >= power[i + 1]) found.push(i);
    found.sort((a, b) => power[b] - power[a]);
    const kept = [];
    for (const i of found) {
        if (power[i] < power[found[0]] * 1e-7) break;
        if (kept.every((k) => Math.abs(k - i) * hz > minSpacing)) kept.push(i);
        if (kept.length >= maxPartials) break;
    }
    const seconds = Math.min(8, y.length / rate - .02), detail = .01;
    const partials = kept.map((i) => {
        const a = Math.log(power[i - 1] + 1e-30), b = Math.log(power[i] + 1e-30), c = Math.log(power[i + 1] + 1e-30);
        const offset = Math.abs(a - 2 * b + c) > 1e-9 ? Math.max(-1, Math.min(1, .5 * (a - c) / (a - 2 * b + c))) : 0, f = (i + offset) * hz;
        // the window is long enough, three cycles of the distance to the nearest stronger partial, to keep that partial out of this one's level
        const stronger = kept.filter((k) => k !== i && power[k] > power[i]).map((k) => Math.abs(k - i) * hz), distance = stronger.length ? Math.min(...stronger) : 100;
        const window = Math.round(rate * Math.max(1 / 150, Math.min(1 / 8, 3 / distance)));
        const h = heterodyne(y, rate, f, window, detail, seconds), amps = Array.from(h.re, (re, k) => 20 * Math.log10(Math.hypot(re, h.im[k]) + 1e-9));
        // read only once the window lies wholly inside the note: at the very start it is cut short, and lets the neighbours through
        const inside = Math.min(amps.length - 1, Math.ceil(window / rate / detail)), searched = amps.slice(inside, Math.round(.3 / detail) + 1);
        const top = inside + (searched.length ? searched.indexOf(Math.max(...searched)) : 0), reached = amps[top];
        // the two stretches of the decay: a straight line over the first quarter second after the peak, then another down to the floor
        const fit = (lo, hi) => {
            let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
            for (let k = lo; k < hi && k < amps.length; k++) { const t = k * detail; sx += t; sy += amps[k]; sxx += t * t; sxy += t * amps[k]; m++; }
            return m < 3 ? null : (m * sxy - sx * sy) / Math.max(1e-9, m * sxx - sx * sx);
        };
        // down to the partial's own floor at the end of the note, or that floor would flatten the line and the partial would ring for ever
        const floorHere = median(amps.slice(Math.max(top, amps.length - 30))) + 6;
        let bottom = top;
        while (bottom < amps.length - 1 && amps[bottom] > reached - 55 && amps[bottom] > -92 && amps[bottom] > floorHere) bottom++;
        // too quick to fit a line through: it fell as far as it was seen to fall, in the time it took
        const dropped = -(reached - (amps[Math.max(bottom, top + 1)] ?? reached - 55)) / (Math.max(1, bottom - top) * detail);
        // and one that never rises above its floor is not decaying at all
        const knee = top + Math.round(.25 / detail), still = reached <= floorHere, early = still ? 0 : fit(top, Math.min(knee, bottom)) ?? Math.min(-30, dropped), late = still ? 0 : fit(knee, bottom) ?? early;
        // falling from the first reading: it was higher at the strike, by the decay over the time skipped
        const falling = top === inside, level = reached + (falling ? Math.min(6, -Math.min(0, early) * top * detail) : 0);
        return { f, ratio: f / f0, level, rise: falling ? 0 : top * detail, early: Math.min(0, early), late: Math.min(0, late) };
    }).filter((p) => p.level > -100).sort((p, q) => p.f - q.f);
    if (!partials.length) return null;
    const biggest = Math.max(...partials.map((p) => p.level));
    // what does not die away, far below the note and low enough to be the mains is not the instrument; high up, that is how a bell's partial behaves
    const instrument = partials.filter((p) => p.level > biggest - 60 && !(p.f < 500 && p.early > -3 && p.late > -3 && p.level < biggest - 25));
    // the player's pitch is the key's: tune the partials to the fundamental when there is one, and leave them as they are when not (bells sound far above the written note)
    const fundamental = instrument.filter((p) => Math.abs(p.ratio - 1) < .06).sort((p, q) => q.level - p.level)[0];
    if (fundamental && fundamental.level > biggest - 25) { const tune = fundamental.ratio; for (const p of instrument) p.ratio /= tune; }
    const burstN = 1024, burst = spectrum(y, 0, burstN), burstHz = rate / burstN, burstFloor = floorAt(floor, rate, burstHz);
    const bands = BANDS.map((centre, b) => {
        const lo = centre * 2 ** (-1 / 6), hi = centre * 2 ** (1 / 6);
        let sum = 0;
        for (let i = Math.ceil(lo / burstHz); i <= hi / burstHz && i < burst.length; i++) sum += burst[i];
        for (const p of instrument) if (p.f >= lo && p.f < hi) sum -= 10 ** (p.level / 10) / 2;
        return db(Math.max(0, sum - (burstFloor?.[b] ?? 0) * (hi - lo) / burstHz));
    });
    return { midi, level: biggest, peak, partials: instrument, burst: bands, seconds: y.length / rate };
}
