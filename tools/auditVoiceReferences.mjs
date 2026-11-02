// Scores the Measured voices against the sampler takes they are named after: every sustained note of a reference take
// (tools/makeReferenceMidi.mjs) is rendered through the app's own engine in headless Chrome and both are measured the
// same way. Needs the dev server. Writes report.md and report.json, and keeps the renders as .f32, in the out folder.
//
//   node tools/auditVoiceReferences.mjs --takes "C:/Users/.../Untitled 3/Exported Files"
//   node tools/auditVoiceReferences.mjs --takes ... --voices "Measured Flute,Measured Trumpet" --origin http://localhost:5173
//   node tools/auditVoiceReferences.mjs --takes ... --reuse      analyse the renders already in the out folder
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { readWav } from './refAnalyze.mjs';

const arg = (flag, fallback) => { const i = process.argv.indexOf(flag); return i < 0 ? fallback : process.argv[i + 1]; };
const takes = arg('--takes'), timelines = arg('--timelines', '.tmp/reference-midi'), out = arg('--out', '.tmp/voice-audit');
const origin = arg('--origin', 'http://localhost:5173'), reuse = process.argv.includes('--reuse'), only = arg('--voices')?.split(',');
if (!takes) throw new Error('usage: auditVoiceReferences.mjs --takes folder [--voices a,b] [--origin url] [--out folder] [--reuse]');

const RATE = 48000, HARMONICS = 16, WIDTH = 45;  // cents either side of a harmonic that count as that harmonic
const SHAPE_FLOOR = -60;                        // dB: a harmonic below this counts as this, so an absent one is one miss, not 100 dB
const SILENT = -70;                              // dB: below this the sampler played nothing (a pitch above its range)
// decay: plucked or struck, measured just after the onset rather than once settled.
// Measured Violin and Measured Cello are hidden from the pickers (HIDDEN_PRESETS) and from the labs catalog, so they are left out.
const VOICES = [
    ['Measured Celesta', 'celeste', 'celeste 1', 'decay'],
    ['Measured Choir Ah', 'choir', 'choir 1'],
    ['Measured Breathy Choir', 'choir', 'choir 1'],
    ['Measured Trumpet', 'trumpet', 'trumpet 1'],
    ['Measured Horn', 'horn', 'horn 1'],
    ['Measured Brass', 'brass', 'brass 1'],
    ['Measured Clarinet', 'clarinet', 'clarinet 1'],
    ['Measured Flute', 'flute', 'flute 1'],
    ['Measured String Section', 'strings', 'strings 1'],
    ['Measured Chamber Strings', 'chamber', 'chamber 1'],
    ['Measured Epic Strings', 'strings-epic', 'strings-epic 1'],
    ['Measured Cello Pizzicato', 'cello-pizzicato', 'cello-pizzicato 1', 'decay'],
].map(([name, instrument, take, mode = 'sustain']) => ({ name, instrument, take, mode })).filter((v) => !only || only.includes(v.name));

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
const db = (power) => 10 * Math.log10(power + 1e-14);
const mean = (list) => list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN;
const median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const pow2Below = (n) => 2 ** Math.floor(Math.log2(n));

/** Power spectrum of a Hann-windowed stretch, zero-padded by `pad`. */
function powerSpectrum(x, from, n, pad = 1) {
    const size = n * pad, re = new Float64Array(size), im = new Float64Array(size);
    for (let i = 0; i < n; i++) re[i] = (x[from + i] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
    fft(re, im);
    const power = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i];
    return power;
}

/** Harmonics (dB of the whole), brightness bands and the energy between harmonics. */
function spectrum(x, rate, from, seconds, f0) {
    const n = pow2Below(rate * seconds), power = powerSpectrum(x, from, n), hz = rate / n;
    const harmonics = new Float64Array(HARMONICS);
    let total = 0, weighted = 0, presence = 0, air = 0, above10 = 0, between = 0;
    for (let i = 1; i < power.length; i++) {
        const f = i * hz, p = power[i];
        total += p; weighted += p * f;
        if (f >= 2000 && f < 5000) presence += p;
        if (f >= 5000) air += p;
        if (f > f0 * 10.5) above10 += p;
        const k = Math.round(f / f0);
        if (k >= 1 && k <= HARMONICS && Math.abs(1200 * Math.log2(f / (k * f0))) <= WIDTH) harmonics[k - 1] += p;
        else if (f < f0 * HARMONICS) between += p;
    }
    return {
        harmonics: [...harmonics].map((p) => db(p / total)),
        centroid: weighted / total,
        presence: db(presence / total), air: db(air / total), above10: db(above10 / total), between: db(between / total),
    };
}

/** Pitch and level over a held stretch: tuning, vibrato depth (peak cents) and rate, level wobble. */
function movement(x, rate, from, to, f0, harmonicsDb) {
    let best = 0;
    harmonicsDb.forEach((level, k) => { if ((k + 1) * f0 < 4000 && level > harmonicsDb[best]) best = k; });
    const target = (best + 1) * f0, n = pow2Below(rate * .085), pad = 4, hz = rate / (n * pad), hop = Math.round(rate * .02);
    const cents = [], levels = [];
    for (let at = from; at + n < to; at += hop) {
        const power = powerSpectrum(x, at, n, pad);
        const lo = Math.max(1, Math.floor(target * 2 ** (-100 / 1200) / hz)), hi = Math.min(power.length - 2, Math.ceil(target * 2 ** (100 / 1200) / hz));
        let peak = lo;
        for (let i = lo; i <= hi; i++) if (power[i] > power[peak]) peak = i;
        const a = Math.log(power[peak - 1] + 1e-30), b = Math.log(power[peak] + 1e-30), c = Math.log(power[peak + 1] + 1e-30);
        const offset = Math.abs(a - 2 * b + c) > 1e-9 ? .5 * (a - c) / (a - 2 * b + c) : 0;
        cents.push(1200 * Math.log2((peak + offset) * hz / target));
        let sum = 0;
        for (let i = 0; i < n; i++) sum += x[at + i] * x[at + i];
        levels.push(db(sum / n));
    }
    const tuning = median(cents), series = cents.map((c) => c - tuning), step = hop / rate;
    // Vibrato: the strongest slow movement of the pitch, by direct DFT over 1-12 Hz in 0.1 Hz steps.
    let bestRate = 0, bestDepth = 0;
    for (let r = 1; r <= 12; r += .1) {
        let s = 0, q = 0;
        series.forEach((v, i) => { s += v * Math.sin(2 * Math.PI * r * i * step); q += v * Math.cos(2 * Math.PI * r * i * step); });
        const depth = 2 * Math.hypot(s, q) / Math.max(1, series.length);
        if (depth > bestDepth) { bestDepth = depth; bestRate = r; }
    }
    const average = mean(levels);
    return { tuning, vibratoDepth: bestDepth, vibratoRate: bestRate, wobble: Math.sqrt(mean(levels.map((l) => (l - average) ** 2))) };
}

/** Short-time level in dB, 5 ms steps. */
function envelope(x, rate, from, to) {
    const step = Math.round(rate * .005), out = [];
    for (let at = Math.max(0, from); at + step <= Math.min(x.length, to); at += step) {
        let sum = 0;
        for (let i = 0; i < step; i++) sum += x[at + i] * x[at + i];
        out.push(db(sum / step));
    }
    return out;
}

function measureNote(x, rate, event, mode) {
    const f0 = 440 * 2 ** ((event.pitch - 69) / 12), start = Math.round(event.start * rate), release = Math.round(event.release * rate);
    const settled = mode === 'decay' ? start + Math.round(.03 * rate) : start + rate, seconds = mode === 'decay' ? .36 : 2.75;
    const window = envelope(x, rate, settled, settled + Math.round(seconds * rate)), level = mean(window);
    if (!(level > SILENT)) return null;
    const result = { pitch: event.pitch, velocity: event.velocity, level, ...spectrum(x, rate, settled, seconds, f0) };
    const opening = envelope(x, rate, start - Math.round(.05 * rate), start + Math.round(1 * rate));
    const peak = Math.max(...opening), reference = mode === 'decay' ? peak : median(window);
    const toMs = (i) => i * 5 - 50;
    result.onset = toMs(opening.findIndex((l) => l > reference - 40));
    result.attack = toMs(opening.findIndex((l) => l > reference - 3));
    const onsetAt = start + Math.round(result.onset / 1000 * rate);
    result.onsetCentroid = spectrum(x, rate, Math.max(0, onsetAt), .085, f0).centroid;
    if (mode === 'decay') {
        const after = envelope(x, rate, start, start + 3 * rate), top = after.indexOf(Math.max(...after));
        const fall = after.slice(top).findIndex((l) => l < after[top] - 20);
        result.decay = fall < 0 ? null : fall * 5;
    } else {
        Object.assign(result, movement(x, rate, settled, settled + Math.round(seconds * rate), f0, result.harmonics));
        const before = mean(envelope(x, rate, release - Math.round(.2 * rate), release));
        const fall = envelope(x, rate, release, release + Math.round(2.5 * rate)).findIndex((l) => l < before - 20);
        result.release = fall < 0 ? null : fall * 5;
    }
    return result;
}

/** Renders the sustained notes through the voice, as the app would play them, with its own reverb. */
async function renderVoice(page, name, events) {
    const seconds = Math.ceil(Math.max(...events.map((e) => e.release)) + 3);
    const notes = events.map((e) => ({ midi: e.pitch, time: e.start, duration: e.release - e.start, velocity: e.velocity / 127 }));
    const result = await page.evaluate(async (name, notes, seconds, rate) => {
        const { LAB_VOICES, voiceSpec } = await import('/src/labs/catalog.js'), { LabVoice } = await import('/src/labs/voice.js');
        const entry = LAB_VOICES.find((v) => v.name === name);
        if (!entry) return { error: `no voice ${name}` };
        const context = new OfflineAudioContext(2, rate * seconds, rate), spec = voiceSpec(entry, 'wasm', 16);
        const voice = await LabVoice.create(context, spec, { notes });
        voice.connect(context.destination);
        const buffer = await context.startRendering();
        voice.dispose?.();
        const left = buffer.getChannelData(0), right = buffer.getChannelData(1), mono = new Float32Array(left.length);
        for (let i = 0; i < mono.length; i++) mono[i] = (left[i] + right[i]) / 2;
        const bytes = new Uint8Array(mono.buffer);
        let text = '';
        for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
        return { engine: spec.engine, kind: spec.kind, data: btoa(text) };
    }, name, notes, seconds, RATE);
    if (result.error) throw new Error(result.error);
    return { engine: result.engine, kind: result.kind, bytes: Buffer.from(result.data, 'base64') };
}

/** What separates a voice from its take, one number per question, ours against the reference. */
function summarize(pairs, mode) {
    const per = (fn) => pairs.map(fn).filter(Number.isFinite), both = (key) => ({
        ref: mean(per((p) => p.ref[key])), ours: mean(per((p) => p.ours[key])),
    });
    // Shape: harmonic levels with their overall offset removed, over the harmonics either side can actually hear.
    const shape = pairs.map(({ ref, ours }) => {
        const floored = (h) => Math.max(h, SHAPE_FLOOR);
        const d = ref.harmonics.map((r, k) => (Math.max(r, ours.harmonics[k]) > -50 ? floored(ours.harmonics[k]) - floored(r) : NaN)).filter(Number.isFinite), offset = mean(d);
        return Math.sqrt(mean(d.map((v) => (v - offset) ** 2)));
    });
    const levelGap = pairs.map(({ ref, ours }) => ours.level - ref.level), gap = mean(levelGap);
    const dynamics = (side) => {
        const spreads = [];
        for (const pitch of new Set(pairs.map((p) => p.ref.pitch))) {
            const notes = pairs.filter((p) => p.ref.pitch === pitch).sort((a, b) => a.ref.velocity - b.ref.velocity);
            if (notes.length > 1) spreads.push({
                level: notes.at(-1)[side].level - notes[0][side].level,
                bright: 1200 * Math.log2(notes.at(-1)[side].centroid / notes[0][side].centroid),
            });
        }
        return { level: mean(spreads.map((s) => s.level)), bright: mean(spreads.map((s) => s.bright)) };
    };
    const summary = {
        mode, notes: pairs.length, shapeError: mean(shape),
        levelSpread: Math.sqrt(mean(levelGap.map((v) => (v - gap) ** 2))),
        centroid: both('centroid'), presence: both('presence'), air: both('air'), above10: both('above10'), between: both('between'),
        attack: both('attack'), onsetCentroid: both('onsetCentroid'),
        dynamics: { ref: dynamics('ref'), ours: dynamics('ours') },
    };
    if (mode === 'decay') summary.decay = both('decay');
    else Object.assign(summary, { release: both('release'), vibratoDepth: both('vibratoDepth'), vibratoRate: both('vibratoRate'), wobble: both('wobble'), tuning: both('tuning') });
    return summary;
}

const fmt = (v, digits = 0) => (Number.isFinite(v) ? v.toFixed(digits) : '-');
const cell = ({ ref, ours }, digits = 0) => `${fmt(ours, digits)} / ${fmt(ref, digits)}`;

function report(results) {
    const lines = ['# Measured voices against their reference takes', '', 'Every cell is **ours / reference**. Ranked by harmonic shape error (dB RMS, offset removed).',
        'Ours is the voice as the app plays it, with its reverb; the reference is whatever the sampler patch exports.', '',
        '| Voice | Notes | Shape err dB | 2-5 kHz dB | >5 kHz dB | >h10 dB | Louder: bright (cents) | Louder: level dB | Attack ms | Release or decay ms | Vibrato cents | Between harmonics dB |',
        '|---|---|---|---|---|---|---|---|---|---|---|---|'];
    for (const { name, summary: s } of [...results].sort((a, b) => b.summary.shapeError - a.summary.shapeError)) {
        const d = s.dynamics;
        lines.push(`| ${name} | ${s.notes} | ${fmt(s.shapeError, 1)} | ${cell(s.presence, 1)} | ${cell(s.air, 1)} | ${cell(s.above10, 1)} | ${fmt(d.ours.bright)} / ${fmt(d.ref.bright)} | ${fmt(d.ours.level, 1)} / ${fmt(d.ref.level, 1)} | ${cell(s.attack)} | ${cell(s.release ?? s.decay)} | ${s.vibratoDepth ? cell(s.vibratoDepth, 1) : '-'} | ${cell(s.between, 1)} |`);
    }
    for (const { name, instrument, engine, kind, pairs, offsets } of results) {
        lines.push('', `## ${name} (${instrument}, ${kind}/${engine})`, '', `Reference onset after the timeline, median: ${fmt(median(offsets))} ms.`, '',
            '| Note | Vel | Harmonics 1-10, ours | Harmonics 1-10, reference |', '|---|---|---|---|');
        for (const { ref, ours } of pairs) {
            const row = (m) => { const top = Math.max(...m.harmonics); return m.harmonics.slice(0, 10).map((h) => Math.round(h - top)).join(' '); };
            lines.push(`| ${ref.pitch} | ${ref.velocity} | ${row(ours)} | ${row(ref)} |`);
        }
    }
    return lines.join('\n') + '\n';
}

mkdirSync(out, { recursive: true });
const browser = reuse ? null : await puppeteer.launch({ executablePath: process.env.SYNTH_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const results = [];
try {
    const page = browser && await browser.newPage();
    page?.on('pageerror', (e) => console.error('page error:', e.message));
    await page?.goto(origin + '/tools/stress.html');
    const wavs = new Map();
    for (const voice of VOICES) {
        const events = JSON.parse(readFileSync(join(timelines, `${voice.instrument}.timeline.json`), 'utf8')).events.filter((e) => e.kind === 'sustained');
        const file = join(out, `${voice.name.replace(/ /g, '_')}.f32`);
        let engine = '?', kind = '?';
        if (!(reuse && existsSync(file))) {
            const rendered = await renderVoice(page, voice.name, events);
            ({ engine, kind } = rendered);
            writeFileSync(file, rendered.bytes);
        }
        const raw = readFileSync(file), ours = new Float32Array(raw.buffer, raw.byteOffset, raw.length >> 2);
        if (!wavs.has(voice.take)) wavs.set(voice.take, readWav(join(takes, `Untitled 3 - ${voice.take}.wav`)));
        const wav = wavs.get(voice.take);
        const pairs = [], offsets = [];
        for (const event of events) {
            const ref = measureNote(wav.mono, wav.rate, event, voice.mode), mine = measureNote(ours, RATE, event, voice.mode);
            if (ref) offsets.push(ref.onset);
            if (ref && mine) pairs.push({ ref, ours: mine });
        }
        const summary = summarize(pairs, voice.mode);
        results.push({ ...voice, engine, kind, offsets, pairs, summary });
        console.log(`${voice.name.padEnd(26)} ${String(pairs.length).padStart(2)}/${events.length} notes  shape ${fmt(summary.shapeError, 1)} dB  onset ${fmt(median(offsets))} ms`);
    }
} finally {
    await browser?.close();
}
writeFileSync(join(out, 'report.json'), JSON.stringify(results.map(({ name, instrument, engine, kind, summary, pairs }) => ({ name, instrument, engine, kind, summary, pairs })), null, 1));
writeFileSync(join(out, 'report.md'), report(results));
console.log(`-> ${join(out, 'report.md')}`);
