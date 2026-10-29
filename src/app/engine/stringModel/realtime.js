// The string played live instead of rendered (docs/STRING_MODEL.md, "Real-time version"). A note costs one single-cycle wavetable
// (a few ms to build, 16 KB) played by an AudioWorklet voice with vibrato; every voice goes into ONE convolver that holds the body
// (the fitted response in Hz, sourceFilter.js, with the table's fine body curve and the wake tail in it), so the body costs the same
// however many notes sound, and a vibrato sweep through its resonances leaves the ringing trails by itself.
// The source of a note is the table's spectrum for it divided by the body at its harmonics, so on a steady pitch the harmonics
// come out at exactly the table's levels (or the smooth part's, tuning.parts), and what changes with pitch and vibrato is the body.
import realtimeWorkletUrl from './realtime.worklet.js?worker&url';
import { fft } from '../pianoModel/dsp.js';
import { PATCHES, tunedModel, EXTENDED_LOW, RANGE, DEFAULT_TUNING } from './player.js';
import { strengthPair, unpackTable } from './model.js';
import { layerFit } from './sourceFilter.js';
import { wakeImpulse, convolve, releaseCurve } from './synth.js';

const BODY_STRENGTH = 80, SIZE = 4096, BODY_SIZE = 1 << 16, TARGET_DB = -22;
const DARK_DB_PER_OCTAVE = -9, NOISE_UNIT = .27;
const ifft = (re, im) => { for (let i = 0; i < im.length; i++) im[i] = -im[i]; fft(re, im); for (let i = 0; i < re.length; i++) { re[i] /= re.length; im[i] = -im[i] / re.length; } };
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function random(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** The body's magnitude in dB at f for the strength `pair` of a table: the fitted curve, with the table's fine curve added (scaled by `fine`), less its mean over the main range. */
function bodyCurve(table, pair, fine, rate) {
    const lo = layerFit(table, pair.lo, 'tilt'), hi = layerFit(table, pair.hi, 'tilt'), measured = table.body;
    const fineAt = (f) => {
        if (!measured || !fine) return 0;
        const x = Math.log(f / measured.from) / Math.log(measured.ratio), i = Math.floor(x);
        return i < 0 || i >= measured.quarterDb.length - 1 ? 0 : fine * (measured.quarterDb[i] * (1 - (x - i)) + measured.quarterDb[i + 1] * (x - i)) / 4;
    };
    const raw = (f) => lo.body(f) * (1 - pair.t) + hi.body(f) * pair.t + fineAt(f);
    let mean = 0, count = 0;
    for (let f = 150; f < 5000; f *= 1.03) { mean += raw(f); count++; }
    mean /= count;
    // nothing below the lowest string, and the top of the band gently away (the table has nothing there to say)
    return (f) => raw(f) - mean - (f < 60 ? 12 * Math.log2(60 / Math.max(f, 5)) : 0) - (f > 9000 ? 24 * Math.log2(f / 9000) : 0);
}

/** The impulse response of a body: minimum phase from its magnitude (cepstral folding), cut to `seconds`, then the wake tail convolved in. */
export function bodyImpulse(curveDb, rate, { seconds = .7, wakeDb = 0, wakeTime = .5 } = {}) {
    const N = BODY_SIZE, re = new Float64Array(N), im = new Float64Array(N);
    for (let k = 0; k <= N / 2; k++) { const l = curveDb(Math.max(k, .5) * rate / N) * Math.LN10 / 20; re[k] = l; if (k > 0 && k < N / 2) re[N - k] = l; }
    ifft(re, im);                                                // the real cepstrum
    for (let n = 1; n < N / 2; n++) { re[n] *= 2; im[n] = 0; }
    for (let n = N / 2 + 1; n < N; n++) { re[n] = 0; im[n] = 0; }
    im.fill(0);
    fft(re, im);                                                 // log of the minimum-phase spectrum
    for (let k = 0; k < N; k++) { const m = Math.exp(re[k]), a = im[k]; re[k] = m * Math.cos(a); im[k] = m * Math.sin(a); }
    ifft(re, im);
    const length = Math.min(N, Math.round(seconds * rate)), body = new Float32Array(length);
    for (let i = 0; i < length; i++) { const u = i / length, fade = u < .7 ? 1 : .5 + .5 * Math.cos(Math.PI * (u - .7) / .3); body[i] = re[i] * fade; }
    if (!(wakeDb > -40)) return body;
    const tail = wakeImpulse(wakeDb, wakeTime, rate, random(7)), padded = new Float32Array(length + tail.length);
    padded.set(body);
    return convolve(padded, tail);
}

export default class RealtimeStrings {
    constructor(context) {
        this.context = context;
        this.master = context.createGain();
        this.convolver = context.createConvolver();
        this.convolver.normalize = false;
        this.convolver.connect(this.master);
        this.tables = new Map();
        this.tuning = { ...DEFAULT_TUNING, rtNoise: -30, rtShimmer: 1 };
        this.nextId = 1;
        this.stats = { tableMs: 0, bodyMs: 0, voices: 0 };
        this.bodyKey = '';
        this.ready = context.audioWorklet.addModule(realtimeWorkletUrl).then(() => {
            this.node = new AudioWorkletNode(context, 'string-voices', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
            this.node.connect(this.convolver);
        });
    }
    connect(node) { this.master.connect(node); return this; }
    setTuning(tuning) { this.tuning = { ...this.tuning, ...tuning }; }

    /** The body of a patch, measured at a middle strength whatever the notes' (a convolver cannot change with every note): rebuilt only when something it depends on changed. */
    body(patch) {
        const t = this.tuning, table = unpackTable(PATCHES[patch].table), pair = strengthPair(table, BODY_STRENGTH), key = [patch, t.rtShimmer, t.wakeDb, t.wakeTime].join(':');
        if (key !== this.bodyKey) {
            const started = performance.now(), curve = bodyCurve(table, pair, t.rtShimmer, this.context.sampleRate);
            const ir = bodyImpulse(curve, this.context.sampleRate, { wakeDb: t.wakeDb, wakeTime: t.wakeTime }), buffer = this.context.createBuffer(1, ir.length, this.context.sampleRate);
            buffer.copyToChannel(ir, 0);
            this.convolver.buffer = buffer;
            this.curve = curve; this.bodyKey = key; this.tables.clear();
            this.stats.bodyMs = Math.round(performance.now() - started);
        }
        return this.curve;
    }

    /** The wavetables of a note (bright and dark), built from the table's spectrum and the body, cached per note. */
    tablesFor(patch, midi, velocity) {
        const t = this.tuning, key = [patch, midi, Math.round(velocity), t.parts, t.phase, t.vibrato, this.bodyKey].join(':');
        if (this.tables.has(key)) return this.tables.get(key);
        const started = performance.now(), curve = this.body(patch, velocity), rate = this.context.sampleRate;
        const model = tunedModel(patch, midi, velocity, t), f0 = model.f0, depthMax = Math.max(0, ...(model.vibrato?.depths ?? [0])) + 3;
        const top = Math.min(model.tonal.length, Math.floor(.45 * rate / (f0 * 2 ** (depthMax / 1200))), SIZE / 2 - 1), rnd = random(midi * 7919 + 13);
        const amps = new Float64Array(top), phases = new Float64Array(top);
        let power = 0;
        for (let n = 1; n <= top; n++) {
            const body = 10 ** (clamp(curve(n * f0), -40, 40) / 20);
            amps[n - 1] = Math.sqrt(2 * 10 ** (model.tonal[n - 1] / 10)) / body;
            phases[n - 1] = t.phase === 'random' ? 2 * Math.PI * rnd() : 0;
            power += amps[n - 1] ** 2 / 2;
        }
        const build = (tilt) => {
            const table = new Float32Array(SIZE);
            for (let n = 1; n <= top; n++) {
                const a = amps[n - 1] * 10 ** (tilt * Math.log2(n) / 20), step = 2 * Math.PI * n / SIZE;
                let c = Math.cos(phases[n - 1]), s = Math.sin(phases[n - 1]);
                const cs = Math.cos(step), sn = Math.sin(step);
                for (let j = 0; j < SIZE; j++) { table[j] += a * c; const nc = c * cs - s * sn; s = s * cs + c * sn; c = nc; }
            }
            return table;
        };
        const depths = model.vibrato ? (model.vibrato.depths.length >= 5 ? model.vibrato.depths : [model.vibrato.depths[0], model.vibrato.depths[0], model.vibrato.depths[1], model.vibrato.depths[2], model.vibrato.depths[2]]) : null;
        const made = {
            table: build(0), dark: build(DARK_DB_PER_OCTAVE), rms: Math.sqrt(power), release: releaseCurve(model), f0,
            vibrato: depths && { rate: model.vibrato.rate, times: [0, .3, .5, .9, 1.35, 1.8], depths: [0, depths[0] * .6, depths[0], depths[1], depths[2], (depths[3] + depths[4]) / 2] },
            level: model.level,
        };
        this.stats.tableMs = +(performance.now() - started).toFixed(1);
        this.tables.set(key, made);
        return made;
    }

    /** The gain that brings a patch to the common loudness the rendered notes have. */
    levelOf(patch) {
        if (!this.levels) this.levels = new Map();
        if (!this.levels.has(patch)) this.levels.set(patch, 10 ** ((TARGET_DB - tunedModel(patch, 60, 80, DEFAULT_TUNING).level) / 20));
        return this.levels.get(patch);
    }

    /** Start a note; returns a handle for `stop`. Only the bowed patches. */
    start(patch, midi, velocity) {
        const low = this.tuning.parts === 'smooth' ? EXTENDED_LOW : RANGE[0], note = clamp(midi, low, RANGE[1]), v = clamp(Math.round(velocity * 127), 1, 127);
        const made = this.tablesFor(patch, note, v), id = this.nextId++;
        this.node.port.postMessage({
            on: true, id, table: made.table, dark: made.dark, f0: made.f0, gain: this.levelOf(patch), attack: this.tuning.rtAttack, open: Math.max(this.tuning.rtOpen, .01), hiss: this.tuning.rtHiss, relScale: this.tuning.rtRelease,
            noise: made.rms * 10 ** (this.tuning.rtNoise / 20) / NOISE_UNIT, vibrato: made.vibrato, release: made.release,
        });
        return { id };
    }
    stop(handle) { if (handle) this.node.port.postMessage({ off: true, id: handle.id }); }
    panic() { this.node.port.postMessage({ panic: true }); }
}
