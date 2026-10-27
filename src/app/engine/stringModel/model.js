// A sampled string instrument as a table of measurements (docs/STRING_MODEL.md), and the interpolation from it to
// any pitch and strength: `packTable` shrinks analysis.js output into the file in src/library/stringTables,
// `unpackTable` reads it, `modelFor` turns it into the spectrum, noise, vibrato and envelopes of one note.
import { BED_EDGES, BED_FADES, ENV_TIMES, RELEASE_TIMES, WANDER_HARMONICS, ONSET_STEP, START_FROM, START_RATIO } from './analysis.js';

const LAYERS = [40, 80, 127];
// Pooling neighbours: 1 averages power (reads 2-4 dB high for values that fluctuate), a large number tends to the geometric mean (low); 2 averages amplitude and left-one-out has no bias.
const POOL = 2;
/** The most of a harmonic's cell that may be played as noise on a bowed patch (their lines are clean; plucked and short notes start with a real broadband burst, so they have no cap). */
const NOISE_SHARE = .002;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const half = (v) => Math.round(v * 2) / 2;

/** The analysis of a take (tools/analyzeStringTake.mjs) as a compact table: cells and envelopes to half a dB, quiet cells dropped. */
export function packTable(analysis, { name = 'Strings', floor = 75 } = {}) {
    const byPitch = new Map();
    for (const note of analysis.notes) {
        if (!byPitch.has(note.pitch)) byPitch.set(note.pitch, { pitch: note.pitch, f0: note.f0, layers: {} });
        const cells = note.cells.filter(([, tonal, noise]) => Math.max(tonal, noise) > note.total - floor);
        const last = cells.length ? cells[cells.length - 1][0] : 0;
        byPitch.get(note.pitch).layers[note.velocity] = {
            total: note.total, onset: note.onset,
            cells: note.cells.filter(([h]) => h <= last).map(([h, t, n]) => [h, half(t), half(n)]),
            vibrato: note.vibrato ?? null,
            ...(note.bed ? { bed: note.bed.map((row) => row.map((v) => (v == null ? null : Math.round(v * 2) / 2))) } : {}),
            env: note.env.map((row) => row && row.map((v) => (v == null ? null : half(v)))),
            release: note.release?.map((row) => row && row.map((v) => (v == null ? null : half(v)))) ?? null,
        };
    }
    // How much of the sound at a frequency is noise (analysis.js wanderOf: the spread of a harmonic's level), by absolute frequency:
    // the recorded cello's lines are clean below about 600 Hz and fuzzy above 1.5 kHz whatever the pitch. Every measured harmonic of
    // every note is binned by frequency (half-octave bins from 300 Hz) and averaged.
    const bins = new Map();
    for (const n of analysis.notes) WANDER_HARMONICS.forEach((h, i) => {
        const db = n.wander?.db[i];
        if (db == null) return;
        const bin = Math.round(2 * Math.log2(h * n.f0 / 300));
        if (!bins.has(bin)) bins.set(bin, { f: 0, db: 0, n: 0 });
        const b = bins.get(bin); b.f += Math.log(h * n.f0); b.db += db; b.n++;
    });
    const wander = { freqs: [], db: [] };
    for (const bin of [...bins.keys()].sort((a, b) => a - b)) { const b = bins.get(bin); wander.freqs.push(Math.round(Math.exp(b.f / b.n))); wander.db.push(+(b.db / b.n).toFixed(1)); }
    const hasWander = wander.freqs.length > 0;
    // The body's fine response in dB (analysis.js bodyTrack), by frequency: every note's deviation points binned 0.4% wide from 150 Hz, averaged,
    // lightly smoothed. Held as quarter-dB integers.
    const BODY_FROM = 150, BODY_RATIO = 1.004, bodyBins = Math.ceil(Math.log(6000 / BODY_FROM) / Math.log(BODY_RATIO)), sums = new Float64Array(bodyBins), counts = new Float64Array(bodyBins);
    for (const n of analysis.notes) if (n.bodyPairs) for (let i = 0; i < n.bodyPairs.length; i += 2) {
        const b = Math.round(Math.log(n.bodyPairs[i] / BODY_FROM) / Math.log(BODY_RATIO));
        if (b >= 0 && b < bodyBins) { sums[b] += n.bodyPairs[i + 1]; counts[b]++; }
    }
    const raw = Float64Array.from(sums, (s, i) => (counts[i] >= 4 ? s / counts[i] : 0)), body = Array.from(raw, (v, i) => Math.round(4 * (.25 * (raw[i - 1] ?? v) + .5 * v + .25 * (raw[i + 1] ?? v))));
    const hasBody = counts.some((c) => c >= 4);
    // the starting transient: the share of the waveform that does not repeat, over the first 250 ms, averaged over every note
    const withOnset = analysis.notes.filter((n) => n.onsetNoise), onset = withOnset.length
        ? { step: ONSET_STEP, n: ONSET_STEP && withOnset[0].onsetNoise.map((_, i) => +(withOnset.reduce((s, n) => s + n.onsetNoise[i], 0) / withOnset.length).toFixed(2)) } : null;
    return { format: 1, name, mode: analysis.mode, ...(analysis.skirt ? { skirt: analysis.skirt } : {}), rate: analysis.rate, envTimes: ENV_TIMES, releaseTimes: RELEASE_TIMES, ...(hasWander ? { wander } : {}), ...(onset ? { onset } : {}), ...(hasBody ? { body: { from: BODY_FROM, ratio: BODY_RATIO, quarterDb: body } } : {}), pitches: [...byPitch.values()].sort((a, b) => a.pitch - b.pitch) };
}

export function unpackTable(file) {
    if (file.format !== 1) throw new Error('string table format ' + file.format);
    return file;
}

const layerOf = (entry, v) => entry.layers[v] ?? null;
/** The two measured strengths around `velocity` and the weight of the upper one. */
function strengthPair(table, velocity) {
    const have = LAYERS.filter((v) => table.pitches.some((p) => p.layers[v]));
    const v = clamp(velocity, have[0], have.at(-1));
    let hi = have.findIndex((x) => x >= v); if (hi < 0) hi = have.length - 1;
    const lo = Math.max(0, hi - 1);
    return { lo: have[lo], hi: have[hi], t: have[hi] === have[lo] ? 0 : (v - have[lo]) / (have[hi] - have[lo]) };
}

/** Noise power (dB) below half the fundamental of a note of `f0`: the neighbouring notes' density (power per Hz, relative to each note) times the width. */
function lowNoiseAt(table, layer, midi, f0, level) {
    let sum = 0, weight = 0;
    for (const entry of table.pitches) {
        const L = layerOf(entry, layer), cell = L?.cells.find(([h]) => h === 0);
        if (!cell || Math.abs(entry.pitch - midi) > 6) continue;
        const w = Math.exp(-.5 * ((entry.pitch - midi) / 1.5) ** 2), density = cell[2] - L.total - 10 * Math.log10(.5 * entry.f0);
        sum += w * 10 ** (density / (10 * POOL)); weight += w;
    }
    return weight > 0 ? 10 * POOL * Math.log10(sum / weight) + 10 * Math.log10(.5 * f0) + level : null;
}

/**
 * The bow-noise bed at a pitch and strength: dB per window and third-octave band (analysis.js BED_WINDOWS, START_FROM), pooled from the
 * measured notes by pitch (the noise is nearly the same whatever the pitch, so a wide neighbourhood is used where a band was not measurable
 * near this one: low notes mask all of the low bands). Power averaged. null for a table without one.
 */
function bedAt(table, layer, midi) {
    const entries = table.pitches.filter((e) => layerOf(e, layer)?.bed);
    if (!entries.length) return null;
    const windows = entries[0].layers[layer].bed.length, bands = entries[0].layers[layer].bed[0].length;
    return Array.from({ length: windows }, (_, w) => Array.from({ length: bands }, (_, b) => {
        for (const sigma of [1.5, 3, 6, 12, 48]) {
            let sum = 0, weight = 0;
            for (const e of entries) {
                const v = e.layers[layer].bed[w][b]; if (v == null) continue;
                const k = Math.exp(-.5 * ((e.pitch - midi) / sigma) ** 2); sum += k * 10 ** (v / 10); weight += k;
            }
            if (weight > .3) return 10 * Math.log10(sum / weight);
        }
        return null;
    }));
}

/** Evenness 0..1: how far each pitch's level is pulled toward the mean of its neighbours (a sampler's zones are not equally loud). */
function levelAt(table, layer, midi, evenness) {
    const entries = table.pitches.filter((p) => layerOf(p, layer));
    const raw = entries.map((p, i) => {
        const here = layerOf(p, layer).total, a = layerOf(entries[Math.max(0, i - 1)], layer).total, b = layerOf(entries[Math.min(entries.length - 1, i + 1)], layer).total;
        return here * (1 - evenness) + evenness * (a + here + b) / 3;
    });
    const j = entries.findIndex((p) => p.pitch >= midi);
    if (j < 0) return raw.at(-1);
    if (j === 0) return raw[0];
    const a = entries[j - 1], b = entries[j], t = (midi - a.pitch) / (b.pitch - a.pitch);
    return raw[j - 1] * (1 - t) + raw[j] * t;
}

/** Spectrum shape at the harmonics of `f0` (Hz): kernel average, in power (an average of dB reads low for values that fluctuate), of the neighbouring measured pitches' cells, each relative to its note. */
function shapeAt(table, layer, midi, f0, count, sigma = .075) {
    const tonal = new Float64Array(count), noise = new Float64Array(count), weight = new Float64Array(count);
    for (const entry of table.pitches) {
        const L = layerOf(entry, layer);
        if (!L || Math.abs(entry.pitch - midi) > 6) continue;
        const pw = Math.exp(-.5 * ((entry.pitch - midi) / 1.5) ** 2), cellWidth = 10 * Math.log10(entry.f0);
        for (const [h, t, n] of L.cells) {
            if (h === 0) continue;                                      // the cell below the fundamental is pooled on its own (lowNoiseAt)
            const f = h * entry.f0;
            for (let k = 0; k < count; k++) {
                const d = Math.log2(f / ((k + 1) * f0)), w = pw * Math.exp(-.5 * (d / sigma) ** 2);
                if (w < 1e-4) continue;
                tonal[k] += w * 10 ** ((t - L.total) / (10 * POOL)); noise[k] += w * 10 ** ((n - L.total - cellWidth) / (10 * POOL)); weight[k] += w;
            }
        }
    }
    // a harmonic no measured one is near enough to (very low, or the last cell) borrows from the nearest
    for (let k = 0; k < count; k++) {
        if (weight[k] > 1e-3) { tonal[k] = 10 * POOL * Math.log10(tonal[k] / weight[k]); noise[k] = 10 * POOL * Math.log10(noise[k] / weight[k]); continue; }
        tonal[k] = k ? tonal[k - 1] - 3 : -40; noise[k] = k ? noise[k - 1] : -80;
    }
    // The low harmonics belong to the string, not the body: a plucked note's fundamental is strong whatever the pitch, and pooling by
    // frequency would borrow a neighbour's second harmonic for it. They are interpolated by harmonic number between the two
    // measured pitches around the note instead, fading to the pooled (body) value by the fourth or so.
    const { a, b, t } = around(table, midi), La = layerOf(a, layer), Lb = layerOf(b, layer);
    if (La && Lb) {
        const at = (L, h) => { const c = L.cells.find(([n]) => n === h); return c ? c[1] - L.total : null; };
        for (let k = 0; k < Math.min(count, 8); k++) {
            const x = at(La, k + 1), y = at(Lb, k + 1);
            if (x == null || y == null) continue;
            const own = 1 / (1 + (k / 3) ** 2), byNumber = x * (1 - t) + y * t;
            tonal[k] = 10 * Math.log10(own * 10 ** (byNumber / 10) + (1 - own) * 10 ** (tonal[k] / 10));
        }
    }
    return { tonal, noise: noise.map((n) => n + 10 * Math.log10(f0)) };
}

function mix(a, b, t) { return a == null ? b : b == null ? a : a * (1 - t) + b * t; }
const mixRows = (A, B, t) => (A && B ? A.map((row, i) => (row && B[i] ? row.map((v, j) => mix(v, B[i][j], t)) : row ?? B[i])) : A ?? B);

/** The nearest two measured pitches at or around midi and the weight of the upper. */
function around(table, midi) {
    const list = table.pitches, j = list.findIndex((p) => p.pitch >= midi);
    if (j === 0) return { a: list[0], b: list[0], t: 0 };
    if (j < 0) return { a: list.at(-1), b: list.at(-1), t: 0 };
    return { a: list[j - 1], b: list[j], t: (midi - list[j - 1].pitch) / (list[j].pitch - list[j - 1].pitch) };
}

/**
 * The note for `midi` at `velocity` (1..127) played at frequency `f0`: { tonal: dB power per harmonic, noise: dB power per
 * harmonic cell, vibrato: { rate, depths }, env, release, onset }.
 */
export function modelFor(table, midi, velocity, f0 = 440 * 2 ** ((midi - 69) / 12), { evenness = .6, maxHarmonics = 200, noiseShare = table.mode === 'decay' ? 1 : NOISE_SHARE } = {}) {
    const { lo, hi, t } = strengthPair(table, velocity), top = Math.min(maxHarmonics, Math.floor(Math.min(12000, 21000) / f0));
    const layers = [lo, hi].map((v) => {
        const level = levelAt(table, v, midi, evenness), { tonal, noise } = shapeAt(table, v, midi, f0, top);
        return { tonal: tonal.map((x) => x + level), noise: noise.map((x) => x + level), level, low: lowNoiseAt(table, v, midi, f0, level) };
    });
    const { a, b, t: pt } = around(table, midi), pick = (entry, v) => layerOf(entry, v) ?? Object.values(entry.layers).sort((x, y) => Math.abs(x.total - entry.layers[lo]?.total) - Math.abs(y.total - entry.layers[lo]?.total))[0];
    const rows = (key) => mixRows(mixRows(pick(a, lo)[key], pick(b, lo)[key], pt), mixRows(pick(a, hi)[key], pick(b, hi)[key], pt), t);
    const vibrato = pick(a, lo).vibrato && pick(b, lo).vibrato
        ? { rate: mix(pick(a, lo).vibrato.rate, pick(b, lo).vibrato.rate, pt), depths: pick(a, lo).vibrato.depths.map((d, i) => mix(d, pick(b, lo).vibrato.depths[i], pt)) } : null;
    // Vibrato smears a high harmonic over its whole cell, which the analysis cannot tell from noise (no quiet bins between peaks);
    // heard as hiss it is the dull, flat sound. Noise in a cell is capped at a tenth of it and the rest is tone.
    const [tonal, noise] = [0, 1].map((w) => layers[0][w ? 'noise' : 'tonal'].map((x, k) => mix(x, layers[1][w ? 'noise' : 'tonal'][k], t)));
    for (let k = 0; k < tonal.length; k++) {
        const total = 10 ** (tonal[k] / 10) + 10 ** (noise[k] / 10), cap = total * noiseShare;
        if (10 ** (noise[k] / 10) > cap) { noise[k] = 10 * Math.log10(cap); tonal[k] = 10 * Math.log10(total - cap); }
    }
    const bedLo = bedAt(table, lo, midi), bedHi = bedAt(table, hi, midi);
    const bed = bedLo && bedHi ? { edges: BED_EDGES, fades: BED_FADES, from: START_FROM, ratio: START_RATIO, db: bedLo.map((row, w) => row.map((v, b) => (v == null || bedHi[w][b] == null ? v ?? bedHi[w][b] : mix(v, bedHi[w][b], t)))) } : null;
    const lowNoise = layers[0].low != null && layers[1].low != null ? mix(layers[0].low, layers[1].low, t) : layers[0].low ?? layers[1].low;
    return {
        f0, midi, velocity, mode: table.mode, lowNoise, level: mix(layers[0].level, layers[1].level, t),
        tonal, noise,
        vibrato, bed, skirt: table.skirt ?? null, wander: table.wander ?? null, startNoise: table.onset ?? null, body: table.body ?? null, env: rows('env'), release: rows('release'), envTimes: table.envTimes, releaseTimes: table.releaseTimes,
        onset: mix(pick(a, lo).onset, pick(b, lo).onset, pt),
    };
}
