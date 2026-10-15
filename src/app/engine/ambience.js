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
import { LAYERS, THUNDER, LAYER_PARAMS, defaultShape, renderParams } from './ambienceSynth';

export const AMBIENCE_LAYERS = {
    rain: 'Rain',
    thunder: 'Distant thunder',
    wind: 'Wind',
    waves: 'Waves',
    fire: 'Fireplace',
    vinyl: 'Vinyl crackle',
};

export const DEFAULT_AMBIENCE = Object.fromEntries(Object.keys(AMBIENCE_LAYERS).map((id) => [id, 0]));

/** Every layer's shape at its defaults (settings.ambienceShape). */
export const defaultAmbienceShape = () => Object.fromEntries(Object.keys(AMBIENCE_LAYERS).map((id) => [id, defaultShape(id)]));

export { LAYER_PARAMS };

// One worker for every render, started on first use.
let worker = null;
let requests = 0;
const pending = new Map();
function renderInWorker(id, sampleRate, params) {
    if (typeof Worker === 'undefined') {
        return import('./ambienceSynth').then(({ renderLayer }) => renderLayer(id, sampleRate, params));
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
        worker.postMessage({ request, id, sampleRate, params });
    });
}

function toBuffer(context, channels) {
    const buffer = context.createBuffer(2, channels[0].length, context.sampleRate);
    channels.forEach((data, c) => buffer.copyToChannel(data, c));
    return buffer;
}

// `${sampleRate}:${id}:${render params}` -> { promise, buffer } (buffer once
// rendered; thunder: an array of variants). AudioBuffers play in any
// context. A loop is ~10 MB, so only the most recent few are kept; one
// still playing stays alive through its source.
const cache = new Map();
const CACHE_SIZE = 12;

const renderKey = (id, shape) => (id === 'thunder' ? '' : JSON.stringify(renderParams(id, shape)));

/** A layer's loop for `shape` (or the thunder variants), rendered on first use. */
export function layerBuffer(context, id, shape) {
    const key = `${context.sampleRate}:${id}:${renderKey(id, shape)}`;
    if (cache.has(key)) {
        const entry = cache.get(key);
        cache.delete(key);
        cache.set(key, entry); // most recently used last
        return entry;
    }
    const entry = {};
    entry.promise = renderInWorker(id, context.sampleRate, id === 'thunder' ? {} : renderParams(id, shape)).then((samples) => {
        entry.buffer = id === 'thunder' ? samples.map((v) => toBuffer(context, v)) : toBuffer(context, samples);
        return entry.buffer;
    });
    cache.set(key, entry);
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
    return entry;
}

// Slider (0..1) to gain: a gentle curve, so low settings stay usable.
const levelGain = (level) => Math.pow(level, 1.6) * 1.8;

// Distance (0..1) to a lowpass cutoff - 18 kHz (as is) down to 600 Hz -
// and a little less level, as far sounds are.
const distanceCutoff = (d) => 18000 * Math.pow(600 / 18000, d);
const distanceGain = (d) => 1 - 0.35 * d;

// Thunder "how often" (0..1) to the average gap: 2.5 min down to 15 s.
const thunderGap = (frequency) => 150 * Math.pow(10, -frequency);

// Thunder: seeded times, the first after a fraction of a gap; strikes
// spread around the pan by up to the width.
function thunderTimes(seed, gap) {
    const rng = seeded(seed);
    const list = [];
    let at = gap * (0.15 + 0.35 * rng());
    return (until) => {
        while (!list.length || list[list.length - 1].at < until) {
            list.push({ at, variant: Math.floor(rng() * THUNDER.variants), gain: 0.5 + rng() * 0.5, spread: rng() - 0.5 });
            at += gap * (0.5 + rng());
        }
        return list;
    };
}

const LOOKAHEAD = 4; // seconds of thunder booked ahead while playing live
const RERENDER_DELAY = 300; // ms after a shape change stops before re-rendering
const SWAP_FADE = 1; // seconds to cross-fade a re-rendered loop in

const isOffline = (context) => typeof OfflineAudioContext !== 'undefined' && context instanceof OfflineAudioContext;

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
        this.shape = defaultAmbienceShape();
        this.chains = {}; // layer id -> live chain (distance, width, pan, level)
        this.playing = {}; // layer id -> { source, fade, key } or { pending, key }
        this.running = false;
        this.seed = seed;
        this.thunderGap = thunderGap(this.shape.thunder.frequency);
        this.thunders = thunderTimes(seed, this.thunderGap);
        this.thunderTimer = null;
        this.renderTimers = {};
    }

    connect(destination) {
        this.output.connect(destination);
    }

    // Seconds into the piece at context time `time`.
    pieceTime(time) {
        return this.offset + (time - this.startedAt);
    }

    // A layer's live processing, made on first use: lowpass for distance,
    // a mid/side matrix for width, a panner, and the level.
    chain(id) {
        if (!this.chains[id]) {
            const AC = this.AC;
            const input = AC.createGain();
            const filter = AC.createBiquadFilter();
            filter.type = 'lowpass';
            filter.Q.value = 0.5;
            const split = AC.createChannelSplitter(2);
            const merge = AC.createChannelMerger(2);
            const same = [AC.createGain(), AC.createGain()]; // L->L, R->R
            const cross = [AC.createGain(), AC.createGain()]; // L->R, R->L
            input.connect(filter).connect(split);
            [0, 1].forEach((c) => {
                split.connect(same[c], c).connect(merge, 0, c);
                split.connect(cross[c], c).connect(merge, 0, 1 - c);
            });
            const panner = AC.createStereoPanner();
            const level = AC.createGain();
            level.gain.value = 0;
            merge.connect(panner).connect(level).connect(this.output);
            this.chains[id] = { input, filter, same, cross, panner, level };
            this.applyShape(id, AC.currentTime, 0);
        }
        return this.chains[id];
    }

    // The live part of a layer's shape (and its level), ramped over `ramp` s.
    applyShape(id, time, ramp) {
        const chain = this.chains[id];
        if (!chain) return;
        const { distance, pan, width } = this.shape[id];
        const set = (param, value) => (ramp ? param.setTargetAtTime(value, time, ramp / 3) : param.setValueAtTime(value, time));
        set(chain.filter.frequency, distanceCutoff(distance));
        // width 1: as is; 0: both channels the mid
        chain.same.forEach((g) => set(g.gain, (1 + width) / 2));
        chain.cross.forEach((g) => set(g.gain, (1 - width) / 2));
        // thunder pans each strike instead (bookThunder)
        set(chain.panner.pan, id === 'thunder' ? 0 : pan);
        const level = id === 'thunder'
            ? levelGain(this.levels.thunder) * (0.4 + 1.2 * this.shape.thunder.intensity)
            : levelGain(this.levels[id] || 0);
        set(chain.level.gain, level * distanceGain(distance));
    }

    /** Layer levels, 0..1 each (AMBIENCE_LAYERS); applies live while running. */
    setLevels(levels) {
        this.levels = { ...DEFAULT_AMBIENCE, ...levels };
        this.prepare();
        if (this.running) this.update(this.AC.currentTime, 0.4);
    }

    /**
     * Layer shapes (settings.ambienceShape): live params apply at once;
     * render params re-render the loop shortly after the last change and
     * cross-fade it in.
     */
    setShape(shape) {
        const previous = this.shape;
        this.shape = Object.fromEntries(Object.keys(AMBIENCE_LAYERS).map((id) => [id, { ...defaultShape(id), ...(shape && shape[id]) }]));
        const now = this.AC.currentTime;
        Object.keys(AMBIENCE_LAYERS).forEach((id) => {
            this.applyShape(id, now, 0.15);
            if (id === 'thunder' || renderKey(id, previous[id]) === renderKey(id, this.shape[id])) return;
            if (isOffline(this.AC)) return; // offline: prepare() then start() pick it up
            clearTimeout(this.renderTimers[id]);
            this.renderTimers[id] = setTimeout(() => this.swapLoop(id), RERENDER_DELAY);
        });
        const gap = thunderGap(this.shape.thunder.frequency);
        if (gap !== this.thunderGap) {
            this.thunderGap = gap;
            this.thunders = thunderTimes(this.seed, gap);
        }
    }

    /** Renders every layer that is turned up; resolves when all are ready. */
    prepare() {
        return Promise.all(Object.keys(this.levels).filter((id) => this.levels[id] > 0).map((id) => layerBuffer(this.AC, id, this.shape[id]).promise));
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
        // rumbles already booked end with the output's fade; their nodes are
        // dropped with the thunder chain, which starts fresh next time
        const thunder = this.chains.thunder;
        if (thunder) {
            delete this.chains.thunder;
            setTimeout(() => thunder.level.disconnect(), (fade + 0.5) * 1000);
        }
    }

    // Starts, re-levels or stops each layer to match this.levels.
    update(time, ramp) {
        Object.keys(LAYERS).forEach((id) => {
            const level = this.levels[id] || 0;
            const playing = this.playing[id];
            if (level > 0 && !playing) this.startLayer(id, time, ramp);
            else if (level > 0) this.applyShape(id, time, Math.max(ramp, 0.3));
            else if (playing) this.stopLayer(id, time + 0.5, 0.1);
        });
        if (this.levels.thunder > 0) {
            this.chain('thunder');
            this.applyShape('thunder', time, ramp ? 0.3 : 0);
        }
        this.updateThunder(time);
    }

    // A layer whose buffer is still rendering starts (fading in) once it's
    // there - if it is still wanted then.
    startLayer(id, time, ramp) {
        const key = renderKey(id, this.shape[id]);
        const entry = layerBuffer(this.AC, id, this.shape[id]);
        if (!entry.buffer) {
            this.playing[id] = { pending: true, key };
            entry.promise.then(() => {
                if (!this.playing[id] || !this.playing[id].pending) return;
                delete this.playing[id];
                if (this.running && this.levels[id] > 0) this.startLayer(id, Math.max(this.AC.currentTime, time), 0.4);
            });
            return;
        }
        const chain = this.chain(id);
        const { source, fade } = this.loopSource(entry.buffer, time, chain);
        fade.gain.setValueAtTime(1, time);
        // the level comes in over `ramp` (0: at once)
        chain.level.gain.cancelScheduledValues(time);
        chain.level.gain.setValueAtTime(ramp ? 0 : chain.level.gain.value, time);
        this.playing[id] = { source, fade, key };
        this.applyShape(id, time, ramp || 0.001);
    }

    // A looping source of `buffer` lined up with the piece, into `chain`
    // through its own fade gain (for cross-fades).
    loopSource(buffer, time, chain) {
        const source = this.AC.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const fade = this.AC.createGain();
        source.connect(fade).connect(chain.input);
        source.start(time, this.pieceTime(time) % buffer.duration);
        source.onended = () => fade.disconnect();
        return { source, fade };
    }

    // After a shape change: the new loop, cross-faded in once rendered.
    swapLoop(id) {
        const key = renderKey(id, this.shape[id]);
        const entry = layerBuffer(this.AC, id, this.shape[id]);
        entry.promise.then((buffer) => {
            const playing = this.playing[id];
            if (!this.running || !playing || playing.pending || playing.key === key || renderKey(id, this.shape[id]) !== key) return;
            const now = this.AC.currentTime + 0.02;
            const next = this.loopSource(buffer, now, this.chain(id));
            next.fade.gain.setValueAtTime(0, now);
            next.fade.gain.linearRampToValueAtTime(1, now + SWAP_FADE);
            playing.fade.gain.setValueAtTime(1, now);
            playing.fade.gain.linearRampToValueAtTime(0, now + SWAP_FADE);
            playing.source.stop(now + SWAP_FADE + 0.05);
            this.playing[id] = { ...next, key };
        });
    }

    stopLayer(id, time, fade) {
        const playing = this.playing[id];
        delete this.playing[id];
        if (playing.pending) return;
        if (fade) playing.fade.gain.setTargetAtTime(0, Math.max(this.AC.currentTime, time - fade * 4), fade);
        playing.source.stop(time);
    }

    // Live: books thunder a few seconds ahead from a timer. Offline (no
    // clock to wait for): books everything up to the render's end at once.
    updateThunder(time) {
        if (!this.running || !(this.levels.thunder > 0)) {
            clearInterval(this.thunderTimer);
            this.thunderTimer = null;
            return;
        }
        if (isOffline(this.AC)) {
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
        const entry = layerBuffer(this.AC, 'thunder');
        if (!entry.buffer) {
            // still rendering: book from where the clock is then
            entry.promise.then(() => this.running && this.bookThunder(until));
            return;
        }
        const { pan, width } = this.shape.thunder;
        const chain = this.chain('thunder');
        this.thunders(to).forEach(({ at, variant, gain, spread }) => {
            if (this.booked.has(at) || at >= to || at + THUNDER.seconds <= from) return;
            this.booked.add(at);
            const into = Math.max(0, from - at);
            const source = this.AC.createBufferSource();
            source.buffer = entry.buffer[variant];
            const level = this.AC.createGain();
            level.gain.value = gain;
            const panner = this.AC.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, pan + spread * 1.4 * width));
            source.connect(level).connect(panner).connect(chain.input);
            source.start(now + Math.max(0, at - from), into);
            source.onended = () => panner.disconnect();
        });
    }
}

export default Ambience;
