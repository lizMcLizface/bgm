// Ambient bed under the music: rain, distant thunder, wind, waves, a
// fireplace and vinyl crackle. Everything is synthesised here from noise -
// no recordings, so nothing to license or download.
//
// Each layer is rendered once (per sample rate) into a buffer of 17-31 s
// that loops seamlessly: its slow movement (gusts, swells, flicker) is
// periodic over the loop, and the noise is cross-faded across the loop
// point. The lengths differ, so layers never line up the same way twice.
// Playing a layer is then one looping buffer source and a gain - next to
// nothing for the audio thread. Thunder is the exception: one-off rumbles
// at seeded random times (a looped one would be heard to repeat).
//
// Rendering a layer takes a moment, so it happens in a worker
// (ambience.worker.js, sounds in ambienceSynth.js) - never on the main
// thread, where it would hold up the note scheduler. A layer starts as soon
// as its buffer is ready; prepare() renders ahead (offline renders, or as
// soon as a slider moves while stopped).
//
// Times can be offset into the piece (start(time, offset)), so an offline
// render in chunks (render.js) continues every loop and thunder exactly.
// (No audio imports at module level: settings.js reads the layer list.)

import { seeded } from '../random';
import { LAYERS, THUNDER } from './ambienceSynth';

export const AMBIENCE_LAYERS = {
    rain: 'Rain',
    thunder: 'Distant thunder',
    wind: 'Wind',
    waves: 'Waves',
    fire: 'Fireplace',
    vinyl: 'Vinyl crackle',
};

export const DEFAULT_AMBIENCE = Object.fromEntries(Object.keys(AMBIENCE_LAYERS).map((id) => [id, 0]));

// One worker for every render, started on first use.
let worker = null;
let requests = 0;
const pending = new Map();
function renderInWorker(id, sampleRate) {
    if (typeof Worker === 'undefined') {
        return import('./ambienceSynth').then(({ renderLayer }) => renderLayer(id, sampleRate));
    }
    if (!worker) {
        worker = new Worker(new URL('./ambience.worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
            pending.get(data.request)(data.samples);
            pending.delete(data.request);
        };
    }
    const request = ++requests;
    return new Promise((resolve) => {
        pending.set(request, resolve);
        worker.postMessage({ request, id, sampleRate });
    });
}

function toBuffer(context, channels) {
    const buffer = context.createBuffer(2, channels[0].length, context.sampleRate);
    channels.forEach((data, c) => buffer.copyToChannel(data, c));
    return buffer;
}

// `${sampleRate}:${id}` -> { promise, buffer } (buffer once rendered;
// thunder: an array of variants). AudioBuffers play in any context.
const cache = new Map();

/** A layer's loop (or the thunder variants), rendered on first use. */
export function layerBuffer(context, id) {
    const key = `${context.sampleRate}:${id}`;
    if (!cache.has(key)) {
        const entry = {};
        entry.promise = renderInWorker(id, context.sampleRate).then((samples) => {
            entry.buffer = id === 'thunder' ? samples.map((v) => toBuffer(context, v)) : toBuffer(context, samples);
            return entry.buffer;
        });
        cache.set(key, entry);
    }
    return cache.get(key);
}

// Slider (0..1) to gain: a gentle curve, so low settings stay usable.
const levelGain = (level) => Math.pow(level, 1.6) * 1.8;

// Thunder: first after 8-25 s, then every 25-75 s.
function thunderTimes(seed) {
    const rng = seeded(seed);
    const list = [];
    let at = 8 + rng() * 17;
    return (until) => {
        while (!list.length || list[list.length - 1].at < until) {
            list.push({ at, variant: Math.floor(rng() * THUNDER.variants), gain: 0.5 + rng() * 0.5, pan: (rng() - 0.5) * 1.2 });
            at += 25 + rng() * 50;
        }
        return list;
    };
}

const LOOKAHEAD = 4; // seconds of thunder booked ahead while playing live

class Ambience {
    /**
     * @param {object} options
     * @param {BaseAudioContext} options.context
     * @param {number} [options.seed] - for thunder times
     */
    constructor({ context, seed = 1 }) {
        this.AC = context;
        this.output = context.createGain();
        this.levels = { ...DEFAULT_AMBIENCE };
        this.playing = {}; // layer id -> { source, gain }
        this.running = false;
        this.seed = seed;
        this.thunders = thunderTimes(seed);
        this.thunderTimer = null;
        this.thunderGain = context.createGain();
        this.thunderGain.connect(this.output);
    }

    connect(destination) {
        this.output.connect(destination);
    }

    // Seconds into the piece at context time `time`.
    pieceTime(time) {
        return this.offset + (time - this.startedAt);
    }

    /** Layer levels, 0..1 each (AMBIENCE_LAYERS); applies live while running. */
    setLevels(levels) {
        this.levels = { ...DEFAULT_AMBIENCE, ...levels };
        this.prepare();
        if (this.running) this.update(this.AC.currentTime, 0.4);
    }

    /** Renders every layer that is turned up; resolves when all are ready. */
    prepare() {
        return Promise.all(Object.keys(this.levels).filter((id) => this.levels[id] > 0).map((id) => layerBuffer(this.AC, id).promise));
    }

    /**
     * Starts every layer that is turned up.
     * @param {number} time - context time
     * @param {number} [offset=0] - seconds into the piece at `time`
     */
    start(time, offset = 0) {
        this.running = true;
        this.startedAt = time;
        this.offset = offset;
        this.booked = new Set();
        this.output.gain.cancelScheduledValues(time);
        this.output.gain.setValueAtTime(1, time);
        this.update(time, 0);
    }

    /** Fades out over about `fade` seconds from `time`, then stops. */
    stop(time = this.AC.currentTime, fade = 0.4) {
        if (!this.running) return;
        this.running = false;
        this.output.gain.cancelScheduledValues(time);
        this.output.gain.setTargetAtTime(0, time, fade / 5);
        Object.keys(this.playing).forEach((id) => this.stopLayer(id, time + fade));
        clearInterval(this.thunderTimer);
        this.thunderTimer = null;
        // rumbles already booked fade with their gain, which is then dropped
        const thunder = this.thunderGain;
        thunder.gain.setTargetAtTime(0, time, fade / 5);
        setTimeout(() => thunder.disconnect(), (fade + 0.5) * 1000);
        this.thunderGain = this.AC.createGain();
        this.thunderGain.connect(this.output);
    }

    // Starts, re-levels or stops each layer to match this.levels.
    update(time, ramp) {
        Object.keys(LAYERS).forEach((id) => {
            const level = this.levels[id] || 0;
            const playing = this.playing[id];
            if (level > 0 && !playing) this.startLayer(id, time, ramp);
            else if (level > 0 && !playing.pending) playing.gain.gain.setTargetAtTime(levelGain(level), time, 0.1);
            else if (playing) this.stopLayer(id, time + 0.5, 0.1);
        });
        this.thunderGain.gain.setTargetAtTime(levelGain(this.levels.thunder), time, ramp ? 0.1 : 0.001);
        this.updateThunder(time);
    }

    // A layer whose buffer is still rendering starts (fading in) once it's
    // there - if it is still wanted then.
    startLayer(id, time, ramp) {
        const entry = layerBuffer(this.AC, id);
        if (!entry.buffer) {
            this.playing[id] = { pending: true };
            entry.promise.then(() => {
                if (!this.playing[id] || !this.playing[id].pending) return;
                delete this.playing[id];
                if (this.running && this.levels[id] > 0) this.startLayer(id, Math.max(this.AC.currentTime, time), 0.4);
            });
            return;
        }
        const buffer = entry.buffer;
        const source = this.AC.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const gain = this.AC.createGain();
        gain.gain.setValueAtTime(ramp ? 0 : levelGain(this.levels[id]), time);
        if (ramp) gain.gain.setTargetAtTime(levelGain(this.levels[id]), time, ramp / 3);
        source.connect(gain);
        gain.connect(this.output);
        source.start(time, this.pieceTime(time) % buffer.duration);
        this.playing[id] = { source, gain };
    }

    stopLayer(id, time, fade) {
        const { source, gain, pending } = this.playing[id];
        delete this.playing[id];
        if (pending) return;
        if (fade) gain.gain.setTargetAtTime(0, Math.max(this.AC.currentTime, time - fade * 4), fade);
        source.stop(time);
        source.onended = () => gain.disconnect();
    }

    // Live: books thunder a few seconds ahead from a timer. Offline (no
    // clock to wait for): books everything up to the render's end at once.
    updateThunder(time) {
        if (!this.running || !(this.levels.thunder > 0)) {
            clearInterval(this.thunderTimer);
            this.thunderTimer = null;
            return;
        }
        if (typeof OfflineAudioContext !== 'undefined' && this.AC instanceof OfflineAudioContext) {
            this.bookThunder(this.AC.length / this.AC.sampleRate);
        } else if (!this.thunderTimer) {
            this.bookThunder(time + LOOKAHEAD);
            this.thunderTimer = setInterval(() => this.bookThunder(this.AC.currentTime + LOOKAHEAD), 1000);
        }
    }

    // Books each rumble sounding before context time `until` that isn't
    // booked yet - one already under way (an offline chunk's start, thunder
    // just turned up) joins in the middle.
    bookThunder(until) {
        const now = Math.max(this.AC.currentTime, this.startedAt);
        const from = this.pieceTime(now);
        const to = this.pieceTime(until);
        const variants = layerBuffer(this.AC, 'thunder').buffer;
        if (!variants) {
            // still rendering: book from where the clock is then
            layerBuffer(this.AC, 'thunder').promise.then(() => this.running && this.bookThunder(until));
            return;
        }
        this.thunders(to).forEach(({ at, variant, gain, pan }) => {
            if (this.booked.has(at) || at >= to || at + THUNDER.seconds <= from) return;
            this.booked.add(at);
            const into = Math.max(0, from - at);
            const source = this.AC.createBufferSource();
            source.buffer = variants[variant];
            const level = this.AC.createGain();
            level.gain.value = gain;
            const panner = this.AC.createStereoPanner();
            panner.pan.value = pan;
            source.connect(level).connect(panner).connect(this.thunderGain);
            source.start(now + Math.max(0, at - from), into);
            source.onended = () => panner.disconnect();
        });
    }
}

export default Ambience;
