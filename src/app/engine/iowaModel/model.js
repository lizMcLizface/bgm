// From the measured tables (tools/analyzeIowa.mjs) to what one note plays: the numbers for a pitch and strength blended from the notes
// around them, and the wavetables, noise and rendered samples made from those numbers. Pure, so the tools can run it without a browser.
import { fft } from '../pianoModel/dsp.js';
import { BANDS, ENVELOPE_MS, RELEASE_MS, SLICE_MS, SLICE_HARMONICS } from './analysis.js';
import { LAYERS, PATCHES } from './patches.js';
import { SIZE, DecayVoice } from './voice.js';

const NOISE_SIZE = 1 << 15, BURST_SIZE = 1 << 12, STEADY_AT = .4, FASTEST_RISE = .7;      // dB per ms of an evened attack
const lerp = (a, b, t) => a + (b - a) * t;
const lerpList = (a, b, t) => a.map((v, i) => lerp(v, b[i] ?? v, t));
const median = (list) => { const s = [...list].sort((a, b) => a - b); return s[s.length >> 1]; };
const ifft = (re, im) => { for (let i = 0; i < im.length; i++) im[i] = -im[i]; fft(re, im); for (let i = 0; i < re.length; i++) re[i] /= re.length; };
function random(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export const pitchRange = (table) => {
    const notes = Object.values(table.layers).flat();
    return [Math.min(...notes.map((n) => n.m)), Math.max(...notes.map((n) => n.m))];
};

/** Each note's measurements as the median of the notes around it: the attack, release, noise and movements of 7 keys, and of 5 for the harmonics, where a note's register shows. */
function evenTakes(notes) {
    const source = notes.map((n) => ({ ...n })), medians = (lists, length) => Array.from({ length }, (_, k) => median(lists.map((list) => list[k]).filter((v) => v !== undefined)));
    notes.forEach((note, i) => {
        const near = source.slice(Math.max(0, i - 3), i + 4), close = source.slice(Math.max(0, i - 2), i + 3);
        for (const key of ['e', 'r', 'n', 'b', 'v']) note[key] = medians(near.map((n) => n[key]), note[key].length);
        note.h = medians(close.map((n) => n.h), note.h.length);
        note.s = note.s.map((row, r) => medians(near.map((n) => n.s[r] ?? row), row.length));
        // A bow that catches jumps 20 dB in 10 ms, a tick on a note this low. Worked back from where the note gets to, so it still arrives when it did.
        for (let k = note.e.length - 2; k >= 0; k--) note.e[k] = Math.max(note.e[k], note.e[k + 1] - FASTEST_RISE * (ENVELOPE_MS[k + 1] - ENVELOPE_MS[k]));
    });
}

/** A straight line through a layer's levels: where a scale moves to another string they can all step by 10 dB at one key, which a median only moves along. */
function levelLine(notes) {
    const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length, m = mean(notes.map((n) => n.m)), l = mean(notes.map((n) => n.l));
    const slope = notes.reduce((sum, n) => sum + (n.m - m) * (n.l - l), 0) / (notes.reduce((sum, n) => sum + (n.m - m) ** 2, 0) || 1);
    return (midi) => l + slope * (midi - m);
}

/** Takes dB off a note's harmonics and noise above a frequency. A held voice's tables have unit power, so the note's level stays and the top moves under it. */
function softenTakes(notes, { from, perOctave }) {
    const cut = (hz) => Math.max(0, Math.log2(hz / from)) * perOctave;
    for (const note of notes) {
        const f0 = 440 * 2 ** ((note.m - 69) / 12);
        note.h = note.h.map((level, k) => level - cut((k + 1) * f0));
        for (const key of ['n', 'b']) note[key] = note[key].map((level, b) => (level <= -90 ? level : level - cut(BANDS[b])));
    }
}

/**
 * Evens out a layer's levels: a note may stray only 3 dB from the notes around it (what a single take adds), and half of what is left
 * of the slope across the range goes, since an instrument nobody can balance in a mix is no use even if the recordings really do climb.
 */
export function settleLevels(table) {
    // A note far under its neighbours is a poor take: a struck cut that missed the strike, a held note played high up a quiet string. So is a held note whose pitch
    // wanders by more than a player's does, which is the tracker lost in noise. The notes around it stand in.
    for (const [name, notes] of Object.entries(table.layers)) {
        const raw = notes.map((n) => n.l), kept = notes.filter((note, i) => raw[i] >= median(raw.slice(Math.max(0, i - 3), i + 4)) - 12 && !(note.v?.[3] > 20));
        if (kept.length) table.layers[name] = kept;
    }
    const patch = PATCHES.find((p) => p.id === table.id);
    for (const notes of Object.values(table.layers)) {
        if (patch?.even) evenTakes(notes);
        if (patch?.soften) softenTakes(notes, patch.soften);
        const levels = notes.map((n) => n.l), whole = median(levels), line = patch?.even ? levelLine(notes) : null;
        notes.forEach((note, i) => {
            const near = median(levels.slice(Math.max(0, i - 3), i + 4));
            note.level = whole + ((line ? line(note.m) : Math.max(near - 3, Math.min(near + 3, note.l))) - whole) * .5;
        });
    }
    return table;
}

/** The notes a layer has either side of a pitch, and how far between them the pitch lies; null when the layer stops more than 4 semitones short of it. */
function around(notes, midi) {
    if (!notes?.length || midi < notes[0].m - 4 || midi > notes.at(-1).m + 4) return null;
    let upper = notes.findIndex((n) => n.m >= midi);
    if (upper < 0) return { a: notes.at(-1), b: notes.at(-1), t: 0 };
    if (upper === 0) return { a: notes[0], b: notes[0], t: 0 };
    const a = notes[upper - 1], b = notes[upper];
    return { a, b, t: b.m === a.m ? 0 : (midi - a.m) / (b.m - a.m) };
}

/** The two layers a velocity (1-127) lies between, and how far between them, using only layers that reach this pitch. */
function layersFor(table, midi, velocity) {
    const usable = LAYERS.map(([name, at]) => ({ at, spot: around(table.layers[name], midi) })).filter((l) => l.spot);
    if (!usable.length) return null;
    if (velocity <= usable[0].at) return { lo: usable[0], hi: usable[0], t: 0 };
    if (velocity >= usable.at(-1).at) return { lo: usable.at(-1), hi: usable.at(-1), t: 0 };
    const upper = usable.findIndex((l) => l.at >= velocity), lo = usable[upper - 1], hi = usable[upper];
    return { lo, hi, t: (velocity - lo.at) / (hi.at - lo.at) };
}

/** What a held note plays. The shapes are in dB and blended in dB, so the note between two others has the levels between theirs. */
export function heldModel(table, midi, velocity) {
    const pair = layersFor(table, midi, velocity);
    if (!pair) return null;
    const count = Math.max(...[pair.lo.spot.a, pair.lo.spot.b, pair.hi.spot.a, pair.hi.spot.b].map((n) => n.h.length));
    const padded = (list) => { const out = [...list]; while (out.length < count) out.push(Math.min(-60, (out.at(-1) ?? -60) - 3)); return out; };
    const spot = ({ a, b, t }) => ({
        harmonics: lerpList(padded(a.h), padded(b.h), t), slices: a.s.map((row, i) => lerpList(row, b.s[i] ?? row, t)), envelope: lerpList(a.e, b.e, t), release: lerpList(a.r, b.r, t),
        noise: lerpList(a.n, b.n, t), burst: lerpList(a.b, b.b, t), moves: lerpList(a.v, b.v, t), level: lerp(a.level, b.level, t),
    });
    const lo = spot(pair.lo.spot), hi = spot(pair.hi.spot), t = pair.t;
    return {
        f0: 440 * 2 ** ((midi - 69) / 12), level: lerp(lo.level, hi.level, t),
        harmonics: lerpList(lo.harmonics, hi.harmonics, t), slices: lo.slices.map((row, i) => lerpList(row, hi.slices[i], t)),
        envelope: lerpList(lo.envelope, hi.envelope, t), release: lerpList(lo.release, hi.release, t), noise: lerpList(lo.noise, hi.noise, t), burst: lerpList(lo.burst, hi.burst, t),
        rate: lerp(lo.moves[0], hi.moves[0], t), depth: lerp(lo.moves[1], hi.moves[1], t), tremolo: lerp(lo.moves[2], hi.moves[2], t),
        pitchWander: Math.min(6, lerp(lo.moves[3], hi.moves[3], t)), levelWander: Math.min(2, lerp(lo.moves[4], hi.moves[4], t)),
    };
}

/** One cycle of unit power with these harmonic levels (dB). The phases are the same in every table of a note, so morphing between them cannot cancel. */
function cycle(levelsDb, top, phases) {
    const re = new Float64Array(SIZE), im = new Float64Array(SIZE);
    let power = 0;
    for (let k = 1; k <= top; k++) {
        const amplitude = Math.sqrt(2 * 10 ** (levelsDb[k - 1] / 10)), half = amplitude * SIZE / 2;
        re[k] = half * Math.cos(phases[k]); im[k] = half * Math.sin(phases[k]);
        re[SIZE - k] = re[k]; im[SIZE - k] = -im[k];
        power += amplitude * amplitude / 2;
    }
    ifft(re, im);
    const scale = 1 / Math.sqrt(power || 1), out = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) out[i] = re[i] * scale;
    return out;
}

/** A loop of noise with these third-octave powers (dB, relative to the note). */
function shapedNoise(bandsDb, rate, size, seed) {
    const re = new Float64Array(size), im = new Float64Array(size), hz = rate / size, rnd = random(seed);
    let any = false;
    BANDS.forEach((centre, b) => {
        if (bandsDb[b] <= -90) return;
        any = true;
        const lo = centre * 2 ** (-1 / 6), hi = centre * 2 ** (1 / 6), first = Math.max(1, Math.ceil(lo / hz)), last = Math.min((size >> 1) - 1, Math.floor(hi / hz));
        if (last < first) return;
        const perBin = Math.sqrt(2 * 10 ** (bandsDb[b] / 10) / (last - first + 1)) * size / 2;
        for (let k = first; k <= last; k++) { const a = 2 * Math.PI * rnd(); re[k] = perBin * Math.cos(a); im[k] = perBin * Math.sin(a); re[size - k] = re[k]; im[size - k] = -im[k]; }
    });
    if (!any) return null;
    ifft(re, im);
    return Float32Array.from(re);
}

/** Everything a held voice reads: the wavetables, noise loops and curves of a note. `options.brightness` tilts the top; `vibrato` scales depth. */
export function heldVoice(model, rate, { vibrato = 1, seed = 1 } = {}) {
    const top = Math.min(model.harmonics.length, Math.floor(.45 * rate / (model.f0 * 2 ** ((model.depth * vibrato + 8) / 1200))), SIZE / 2 - 1);
    const rnd = random(seed * 7919 + 13), phases = Array.from({ length: top + 1 }, () => 2 * Math.PI * rnd());
    const sliced = model.slices.map((row) => model.harmonics.map((level, k) => level + (row[Math.min(k, SLICE_HARMONICS - 1)] ?? 0)));
    const tables = [...sliced, model.harmonics].map((levels) => cycle(levels, top, phases));
    // The steady part of the measured noise, and what the strike or breath adds at the start.
    const extra = model.burst.map((b, i) => (b > model.noise[i] + 3 ? b : -99));
    const releaseFrom = model.release[0], released = model.release.map((v) => v - releaseFrom);
    let end = released.length;
    while (end > 2 && released[end - 1] === released[end - 2]) end--;     // the recording ended there; the tail below finishes the note
    const relTimes = RELEASE_MS.slice(0, end).map((ms) => ms / 1000), relDb = released.slice(0, end);
    relTimes.push(relTimes.at(-1) + .06); relDb.push(-80);
    return {
        tables, times: [...SLICE_MS.map((ms) => ms / 1000), STEADY_AT], noise: shapedNoise(model.noise, rate, NOISE_SIZE, seed + 1), burst: shapedNoise(extra, rate, NOISE_SIZE >> 2, seed + 2),
        f0: model.f0, level: model.level,
        // a slow bow or breath has not arrived by the end of the measured rise: it goes on to the steady level over the next half second
        envTimes: [...ENVELOPE_MS.map((ms) => ms / 1000), 1], envDb: [...model.envelope, 0], relTimes, relDb,
        rate: model.rate, depth: model.depth * vibrato, tremolo: model.tremolo * Math.min(1, vibrato), pitchWander: model.pitchWander, levelWander: model.levelWander,
    };
}

/** Two layers' partials as one list: those at the same frequency blended in dB, or they would beat against each other; the rest fade with their layer's weight. */
function blendPartials(low, high, t) {
    if (t === 0) return low.map((p) => ({ ...p }));
    const free = high.map((p) => ({ ...p, taken: false })), out = [], weighted = (p, weight) => ({ ...p, level: p.level + 20 * Math.log10(Math.max(weight, 1e-4)) });
    for (const a of low) {
        let twin = null;
        for (const b of free) if (!b.taken && Math.abs(b.f / a.f - 1) < .03 && (!twin || Math.abs(b.f - a.f) < Math.abs(twin.f - a.f))) twin = b;
        if (twin) {
            twin.taken = true;
            out.push({ f: lerp(a.f, twin.f, t), level: lerp(a.level, twin.level, t), rise: lerp(a.rise, twin.rise, t), early: lerp(a.early, twin.early, t), late: lerp(a.late, twin.late, t) });
        } else out.push(weighted(a, 1 - t));
    }
    for (const b of free) if (!b.taken) out.push(weighted(b, t));
    return out.sort((p, q) => p.f - q.f);
}

/** What a struck note plays at a strength, from the nearest measured note of the layers around it. */
export function decayModel(table, midi, velocity) {
    const pair = layersFor(table, midi, velocity);
    if (!pair) return null;
    const nearest = ({ a, b, t }) => (t < .5 ? a : b), low = nearest(pair.lo.spot), high = nearest(pair.hi.spot), f0 = 440 * 2 ** ((midi - 69) / 12);
    const partialsOf = (note) => {
        const toLevel = note.level - note.l;
        return note.p.map(([ratio, level, rise, early, late]) => ({ f: ratio * f0, level: level + toLevel, rise: rise / 1000, early, late }));
    };
    const burstOf = (note) => note.b.map((b) => (b <= -90 ? -99 : b + note.level - note.l));
    const t = pair.t, one = burstOf(low), other = burstOf(high);
    return {
        f0, seconds: lerp(low.d, high.d, t), partials: blendPartials(partialsOf(low), partialsOf(high), t),
        burst: one.map((b, i) => 10 * Math.log10((1 - t) * 10 ** (b / 10) + t * 10 ** (other[i] / 10) + 1e-12)).map((b) => (b < -90 ? -99 : b)),
    };
}

/** Everything a struck voice reads. A strike reaches its partials at once: a later peak in the measurement is beating, not a rise, so no partial takes over 4 ms. */
export function decayVoice(model, rate, seed = 1) {
    const partials = model.partials.filter((p) => p.f < rate * .47), rnd = random(seed * 104729 + 7);
    return {
        decay: true, seconds: Math.min(8, Math.max(.3, model.seconds)), burst: shapedNoise(model.burst, rate, BURST_SIZE, seed),
        frequency: Float64Array.from(partials, (p) => p.f), amplitude: Float64Array.from(partials, (p) => 10 ** (p.level / 20)), phase: Float64Array.from(partials, () => 2 * Math.PI * rnd()),
        rise: Float64Array.from(partials, (p) => Math.min(.004, p.rise)), early: Float64Array.from(partials, (p) => p.early), late: Float64Array.from(partials, (p) => p.late),
    };
}

/** A struck note as samples, through the same voice that plays it live. */
export function renderDecay(model, rate, seed = 1) {
    const spec = decayVoice(model, rate, seed), voice = new DecayVoice(spec, rate, 1), out = new Float32Array(Math.round(spec.seconds * rate));
    for (let at = 0; at < out.length; at += 128) {
        const block = new Float32Array(Math.min(128, out.length - at));
        if (!voice.render(block, block.length)) break;
        out.set(block, at);
    }
    return out;
}
