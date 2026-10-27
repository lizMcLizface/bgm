// Plays the measured string tables through Web Audio (docs/STRING_MODEL.md): a note is rendered once into a cached
// buffer (renderSustained / renderDecay) and played from it, so playing costs nothing after the first time.
// A bowed note loops its steady part until the key comes up, then follows the measured release; a pluck or a short
// note plays through and ignores the key.
import celloLong from '../../../library/stringTables/celloLong.json';
import celloLive from '../../../library/stringTables/celloLive.json';
import celloShort from '../../../library/stringTables/celloShort.json';
import celloPizzicato from '../../../library/stringTables/celloPizzicato.json';
import { unpackTable } from './model.js';
import { DEFAULT_TUNING, PATCH_TUNING, defaultTuning, tunedModelFrom } from './tuning.js';
import { renderSustained, renderDecay, releaseCurve } from './synth.js';

export const PATCHES = {
    long: { label: 'Long', table: celloLong, bowed: true },
    live: { label: 'Live', table: celloLive, bowed: true },
    short: { label: 'Short', table: celloShort, bowed: false },
    pizzicato: { label: 'Pizzicato', table: celloPizzicato, bowed: false },
};
/** The instrument's range as measured (the sampler sounds nothing outside it). */
export const RANGE = [36, 84];
export { DEFAULT_TUNING, PATCH_TUNING, defaultTuning };
const TARGET_DB = -22;                       // loudness of a note at velocity 80, middle C, in dB mean-square, after levelling

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const tables = Object.fromEntries(Object.entries(PATCHES).map(([id, p]) => [id, unpackTable(p.table)]));

/** The model for a note of a patch with the listener's tuning applied (tuning.js). */
export const tunedModel = (patch, midi, velocity, tuning = DEFAULT_TUNING, without = null) => tunedModelFrom(tables[patch], midi, velocity, tuning, without);

/** The pitches a patch was measured at (the ones with a recording to compare against). */
export const measuredPitches = (patch) => tables[patch].pitches.map((p) => p.pitch);

export default class StringPlayer {
    constructor(context) {
        this.context = context;
        this.master = context.createGain();
        this.master.gain.value = 1;
        this.cache = new Map();
        this.levels = new Map();
        this.pending = new Map();
        this.queue = [];
        this.tuning = { ...DEFAULT_TUNING };
        this.stats = { renders: 0, lastMs: 0, lastKey: '' };
    }
    connect(node) { this.master.connect(node); return this; }
    setTuning(tuning) { this.tuning = { ...DEFAULT_TUNING, ...tuning }; }

    /** Gain that brings the patch to a common loudness: a note at velocity 80 on middle C is the reference. */
    level(patch) {
        if (!this.levels.has(patch)) {
            const m = tunedModel(patch, 60, 80, DEFAULT_TUNING);
            this.levels.set(patch, 10 ** ((TARGET_DB - m.level) / 20));
        }
        return this.levels.get(patch);
    }

    /** The cache key of a note: everything that changes how it sounds. */
    keyOf(patch, midi, velocity, { without = null, exact = false } = {}) {
        const v = exact ? Math.round(clamp(velocity, 1, 127)) : Math.round(clamp(velocity, 1, 127) / 6) * 6, t = this.tuning;
        return { v, key: [patch, midi, v, t.vibrato, t.noise, t.tilt, t.evenness, t.smear, t.lineRatio, t.wakeDb, t.wakeTime, t.noiseShare, t.phase, t.onset, t.shimmer, t.bed, t.flare, t.noiseTau, without ?? ''].join(':') };
    }

    /** Keep a rendered note: the samples in a Web Audio buffer, and what the page shows about it. */
    keep(key, rendered, { harmonics, ms }) {
        const { buffer: samples, made, release } = rendered, buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
        buffer.copyToChannel(samples, 0);
        this.cache.set(key, { buffer, made: { ...made, buffer: samples }, release, model: { tonal: { length: harmonics } } });
        this.stats = { renders: this.stats.renders + 1, lastMs: ms, lastKey: key };
    }

    /** The rendered note, rendered here and now (on the main thread) if it is not ready: use `prepare` where there is time to wait. */
    note(patch, midi, velocity, options = {}) {
        const { v, key } = this.keyOf(patch, midi, velocity, options), { without = null } = options;
        if (!this.cache.has(key)) {
            const started = performance.now(), model = tunedModel(patch, midi, v, this.tuning, without), rate = this.context.sampleRate, bowed = PATCHES[patch].bowed;
            const made = bowed ? renderSustained(model, rate, { seed: midi * 7 + v }) : renderDecay(model, rate, { seed: midi * 7 + v }), gain = this.level(patch);
            for (let i = 0; i < made.buffer.length; i++) made.buffer[i] *= gain;
            const { buffer, ...rest } = made;
            this.keep(key, { buffer, made: rest, release: bowed ? releaseCurve(model) : null }, { harmonics: model.tonal.length, ms: Math.round(performance.now() - started) });
        }
        return this.cache.get(key);
    }

    /** The rendered note, made by the worker pool if it is not ready; resolves with it (null if it was cancelled while queued). Notes asked for twice are rendered once. */
    prepare(patch, midi, velocity, options = {}) {
        const { v, key } = this.keyOf(patch, midi, velocity, options);
        if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
        if (this.pending.has(key)) return this.pending.get(key).promise;
        const job = { key, patch, midi, v, without: options.without ?? null, tuning: { ...this.tuning } };
        job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
        this.pending.set(key, job); this.queue.push(job);
        this.pump();
        return job.promise;
    }

    pump() {
        if (!this.workers) {
            const count = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1));
            this.workers = Array.from({ length: count }, () => ({ worker: new Worker(new URL('./render.worker.js', import.meta.url), { type: 'module' }), job: null }));
            for (const slot of this.workers) {
                slot.worker.onmessage = ({ data }) => {
                    const job = slot.job; slot.job = null;
                    if (job) {
                        if (!this.cache.has(job.key)) this.keep(job.key, data, data);
                        this.pending.delete(job.key); job.resolve(this.cache.get(job.key));
                    }
                    this.pump();
                };
                slot.worker.onerror = (event) => { const job = slot.job; slot.job = null; if (job) { this.pending.delete(job.key); job.reject(new Error(event.message)); } this.pump(); };
            }
        }
        for (const slot of this.workers) {
            if (slot.job || !this.queue.length) continue;
            const job = this.queue.shift(); slot.job = job;
            slot.worker.postMessage({ id: job.key, patch: job.patch, midi: job.midi, v: job.v, tuning: job.tuning, without: job.without, rate: this.context.sampleRate, gain: this.level(job.patch) });
        }
    }

    /** Drop the notes still waiting for a worker (the tuning changed, so they would be rendered for nothing). The ones being rendered finish. */
    cancelQueued() { for (const job of this.queue) { this.pending.delete(job.key); job.resolve(null); } this.queue.length = 0; }

    /** Start a note. Returns a handle for `stop`. */
    start(patch, midi, velocity, when = this.context.currentTime, options = {}) {
        const spec = PATCHES[patch], { buffer, made, release } = this.note(patch, clamp(midi, RANGE[0], RANGE[1]), velocity * 127, options);
        const source = this.context.createBufferSource(), gain = this.context.createGain();
        source.buffer = buffer;
        if (spec.bowed) { source.loop = true; source.loopStart = made.loopStart; source.loopEnd = made.loopEnd; }
        source.connect(gain); gain.connect(this.master);
        source.start(when);
        const handle = { source, gain, release, bowed: spec.bowed, stopped: false };
        if (!spec.bowed) source.onended = () => gain.disconnect();
        return handle;
    }

    /** Key up: a bowed note follows its measured release; the others play on. */
    stop(handle, when = this.context.currentTime) {
        if (!handle || handle.stopped || !handle.bowed) return;
        handle.stopped = true;
        const { times, gains, seconds } = handle.release, g = handle.gain.gain;
        // setValueCurveAtTime spreads its values evenly over the time, the measured points are not evenly spaced
        const curve = Float32Array.from({ length: 64 }, (_, i) => {
            const t = seconds * i / 63;
            let j = 1; while (j < times.length - 1 && times[j] < t) j++;
            const u = clamp((t - times[j - 1]) / (times[j] - times[j - 1]), 0, 1);
            return gains[j - 1] * (1 - u) + gains[j] * u;
        });
        g.cancelScheduledValues(when);
        g.setValueAtTime(1, when);
        g.setValueCurveAtTime(curve, when, seconds);
        handle.source.stop(when + seconds + .05);
        handle.source.onended = () => handle.gain.disconnect();
    }
}
