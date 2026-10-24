// Ambient bed under the music: rain, distant thunder, wind, waves, a
// fireplace and vinyl crackle. Everything is synthesised here from noise -
// no recordings, so nothing to license or download.
//
// Rain, thunder and waves share the streaming weather model used by /ambient/.
// A worklet supplies three stereo sources, each with independent shape,
// shelter, spatial controls and level. Offline exports run that same model
// in a worker and retain history across chunk prerolls and crossfades.
//
// Wind, fireplace and vinyl use seamless 17-31 s loops, prepared in
// ambience.worker.js. Different loop lengths keep their movement apart.
// A layer starts when its buffer is ready; prepare() can render ahead.
//
// The bed drifts slowly (wander.js): the whole bed's level and each layer's
// own level move by small amounts, on sine waves or as a bounded random
// walk (setWander), so a long stretch never sits perfectly still.
//
// Times can be offset into the piece (start(time, offset)), so an offline
// render in chunks (render.js) continues the loops and weather events.
// (No audio imports at module level: settings.js reads the layer list.)

import { WeatherBedRoute, WeatherBedOffline } from './weatherBedAudio';
import { WEATHER_SOURCES } from './weatherBedModel';
import { wanderLfo, defaultAmbienceWander, WalkPath } from './wander';
import { LAYERS, LAYER_PARAMS, defaultShape, renderParams } from './ambienceSynth';

export const AMBIENCE_LAYERS = {
    rain: 'Rain',
    thunder: 'Thunder',
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

const isOffline = (context) => typeof OfflineAudioContext !== 'undefined' && context instanceof OfflineAudioContext;

// Each layer's wander runs 0.85 .. 1.15 times the round, from its own phase and seed.
const layerSlot = (id) => Object.keys(AMBIENCE_LAYERS).indexOf(id);
const layerPeriodFactor = (id) => 0.85 + 0.3 * (((layerSlot(id) * 0.381966 + 0.19) % 1));

/**
 * What the wander does to levels at piece time t, for drawing it (the video
 * of an ambience-only render): a function (id, t) -> the layer's factor
 * (1 +- layers) and `total(t)` the whole bed's (1 +- total). The same
 * paths the audio follows.
 */
export function ambienceDrift(wander) {
    const w = { ...defaultAmbienceWander(), ...wander };
    const paths = {};
    const wave = (period, phase, seed, t) => {
        if (w.mode !== 'brownian') return Math.sin(2 * Math.PI * (t / period + phase));
        paths[seed] = paths[seed] || new WalkPath(seed, period);
        return paths[seed].valueAt(t);
    };
    return {
        layer: (id, t) => 1 + w.layers * wave(w.period * layerPeriodFactor(id), (layerSlot(id) * 0.618034 + 0.07) % 1, 6101 + layerSlot(id) * 53, t),
        total: (t) => 1 + w.total * wave(w.period, 0.31, 4411, t),
    };
}


const RERENDER_DELAY = 300; // ms after a shape change stops before re-rendering
const SWAP_FADE = 1; // seconds to cross-fade a re-rendered loop in


class Ambience {
    /**
     * @param {object} options
     * @param {BaseAudioContext} options.context
     * @param {number} [options.seed] - for thunder times
     * @param {number} [options.offset] - seconds of the piece elapsed at context time 0 (renders: for the wander)
     */
    constructor({ context, seed = 1, offset = 0, weatherBuffers = null }) {
        this.offset = offset;
        this.AC = context;
        this.output = context.createGain();
        // the bed's own slow wander in level, after the start / stop fades
        this.wanderOut = context.createGain();
        this.output.connect(this.wanderOut);
        this.wander = { ...defaultAmbienceWander(), total: 0, layers: 0 };
        this.totalLfo = wanderLfo(context, { period: this.wander.period, phase: 0.31, seed: 4411, offset, mode: this.wander.mode });
        this.totalLfo.depth.connect(this.wanderOut.gain);
        this.levels = { ...DEFAULT_AMBIENCE };
        this.shape = defaultAmbienceShape();
        this.chains = {}; // layer id -> live chain (distance, width, pan, level)
        this.playing = {}; // layer id -> { source, fade, key } or { pending, key }
        this.running = false;
        this.seed = seed;
        this.weatherBuffers = weatherBuffers;
        this.weatherRoute = new WeatherBedRoute(context, id => this.chain(id).input, seed);
        this.weatherPlaying = [];
        this.renderTimers = {};
    }

    connect(destination) {
        this.wanderOut.connect(destination);
    }

    /**
     * The slow wander (settings.ambienceWander): `total` and `layers` are the
     * fractions of level the whole bed and each layer drift by (+-), `period`
     * a round in seconds, `mode` 'sine' or 'brownian'. Eases in when live.
     */
    setWander(wander) {
        this.wander = { ...defaultAmbienceWander(), ...wander };
        this.totalLfo.setMode(this.wander.mode);
        this.totalLfo.setPeriod(this.wander.period);
        this.ease(this.totalLfo.depth.gain, this.wander.total);
        Object.keys(this.chains).forEach((id) => this.applyWanderTo(id));
    }

    ease(param, value) {
        if (isOffline(this.AC)) param.value = value;
        else param.setTargetAtTime(value, this.AC.currentTime, 0.4);
    }

    // A layer's own wander, its period a little different from the others'.
    applyWanderTo(id) {
        const { lfo } = this.chains[id];
        lfo.setMode(this.wander.mode);
        lfo.setPeriod(this.wander.period * layerPeriodFactor(id));
        this.ease(lfo.depth.gain, this.wander.layers);
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
            input.connect(filter);
            const shelter = WEATHER_SOURCES.includes(id) ? [AC.createBiquadFilter(), AC.createBiquadFilter()] : [];
            let previous = filter;
            for (const f of shelter) { f.type = 'lowpass'; f.Q.value = Math.SQRT1_2; previous.connect(f); previous = f; }
            previous.connect(split);
            [0, 1].forEach((c) => {
                split.connect(same[c], c).connect(merge, 0, c);
                split.connect(cross[c], c).connect(merge, 0, 1 - c);
            });
            const panner = AC.createStereoPanner();
            const level = AC.createGain();
            level.gain.value = 0;
            // the layer's wander: a gain around 1, after its level
            const drift = AC.createGain();
            const lfo = wanderLfo(AC, {
                period: this.wander.period * layerPeriodFactor(id),
                phase: (layerSlot(id) * 0.618034 + 0.07) % 1,
                seed: 6101 + layerSlot(id) * 53,
                offset: this.offset || 0,
                mode: this.wander.mode,
            });
            lfo.depth.connect(drift.gain);
            merge.connect(panner).connect(level).connect(drift).connect(this.output);
            this.chains[id] = { input, filter, shelter, same, cross, panner, level, drift, lfo };
            this.applyWanderTo(id);
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
        for (const f of chain.shelter) set(f.frequency, Math.min(this.AC.sampleRate * .45, 18000 * (300 / 18000) ** (this.shape[id].shelter || 0)));
        // width 1: as is; 0: both channels the mid
        chain.same.forEach((g) => set(g.gain, (1 + width) / 2));
        chain.cross.forEach((g) => set(g.gain, (1 - width) / 2));
        set(chain.panner.pan, pan);
        const level = levelGain(this.levels[id] || 0);
        set(chain.level.gain, level * distanceGain(distance));
    }

    /** Layer levels, 0..1 each (AMBIENCE_LAYERS); applies live while running. */
    setLevels(levels) {
        this.levels = { ...DEFAULT_AMBIENCE, ...levels };
        this.prepare().catch(error => { this.error = error; });
        this.weatherRoute.setState(this.shape, this.levels);
        if (this.running) this.update(this.AC.currentTime, 0.4);
    }

    /**
     * Layer shapes (settings.ambienceShape): live params apply at once;
     * weather params update the streaming model; other render params
     * re-render their loop and cross-fade it in.
     */
    setShape(shape) {
        const previous = this.shape;
        this.shape = Object.fromEntries(Object.keys(AMBIENCE_LAYERS).map((id) => [id, { ...defaultShape(id), ...(shape && shape[id]) }]));
        const now = this.AC.currentTime;
        Object.keys(AMBIENCE_LAYERS).forEach((id) => {
            this.applyShape(id, now, 0.15);
            if (WEATHER_SOURCES.includes(id) || renderKey(id, previous[id]) === renderKey(id, this.shape[id])) return;
            if (isOffline(this.AC)) return; // offline: prepare() then start() pick it up
            clearTimeout(this.renderTimers[id]);
            this.renderTimers[id] = setTimeout(() => this.swapLoop(id), RERENDER_DELAY);
        });
        this.weatherRoute.setState(this.shape, this.levels);
    }

    /** Renders every layer that is turned up; resolves when all are ready. */
    prepare() {
        const tasks = Object.keys(this.levels).filter(id => this.levels[id] > 0 && !WEATHER_SOURCES.includes(id))
            .map(id => layerBuffer(this.AC, id, this.shape[id]).promise);
        if (WEATHER_SOURCES.some(id => this.levels[id] > 0)) {
            if (isOffline(this.AC)) {
                this.weatherPreparation ??= (async () => {
                    if (!this.weatherBuffers) {
                        this.ownedWeatherOffline = new WeatherBedOffline(this.AC.sampleRate, this.shape, this.levels, this.seed);
                        this.weatherBuffers = await this.ownedWeatherOffline.render(this.offset, this.AC.length);
                    }
                    this.weatherAudioBuffers = Object.fromEntries(Object.entries(this.weatherBuffers).map(([id, channels]) => [id, toBuffer(this.AC, channels)]));
                })();
                tasks.push(this.weatherPreparation);
            } else tasks.push(this.weatherRoute.prepare());
        }
        return Promise.all(tasks);
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
        this.weatherRoute.stop(time + fade); this.weatherRunning = false;
        for (const source of this.weatherPlaying) source.stop(time + fade);
        this.weatherPlaying = []; this.ownedWeatherOffline?.dispose();
    }

    // Starts, re-levels or stops each layer to match this.levels.
    update(time, ramp) {
        Object.keys(LAYERS).filter(id => !WEATHER_SOURCES.includes(id)).forEach((id) => {
            const level = this.levels[id] || 0;
            const playing = this.playing[id];
            if (level > 0 && !playing) this.startLayer(id, time, ramp);
            else if (level > 0) this.applyShape(id, time, Math.max(ramp, 0.3));
            else if (playing) this.stopLayer(id, time + 0.5, 0.1);
        });
        WEATHER_SOURCES.forEach(id => { if (this.levels[id] > 0) this.chain(id); this.applyShape(id, time, ramp ? .3 : 0); });
        const active = WEATHER_SOURCES.some(id => this.levels[id] > 0);
        if (active && !this.weatherRunning) {
            this.weatherRunning = true; this.weatherRoute.setState(this.shape, this.levels);
            if (isOffline(this.AC)) {
                for (const [id, buffer] of Object.entries(this.weatherAudioBuffers || {})) {
                    const source = this.AC.createBufferSource(); source.buffer = buffer; source.connect(this.chain(id).input); source.start(time);
                    source.onended = () => source.disconnect(); this.weatherPlaying.push(source);
                }
            } else void this.weatherRoute.start(time);
        } else if (!active && this.weatherRunning) { this.weatherRoute.stop(time + .5); this.weatherRunning = false; }
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


}

export default Ambience;
