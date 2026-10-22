import Gain from './gain';
import { PERFORMANCE } from '../audio/performance';

// Convolution reverb with a dry/wet mix.
//
// Impulse responses are FLAC files in public/reverb/, fetched and decoded
// the first time a reverb type is actually heard (wet > 0), then shared by
// every Reverb on the same AudioContext. They used to be base64 M4A (AAC)
// strings in the bundle: Firefox decodes AAC only where the OS provides the
// codec (often not on Linux), and reverb1 also ended in a truncated AAC
// frame - so every page load alerted "Error when decoding audio data".
// FLAC is lossless and decoded natively by Firefox, Chrome and Safari. A
// failed load now only leaves the reverb dry.

export const REVERB_TYPES = ['reverb1', 'reverb2', 'reverb3', 'reverb4', 'reverb5', 'reverb6'];

// sample rate -> Map(type -> Promise<AudioBuffer>). Keyed by rate, not
// context: an AudioBuffer plays in any context, so offline renders
// (app/engine/render.js) reuse what the live context decoded.
const buffers = new Map();

// A convolver's cost grows with its impulse's length, and some impulses
// carry seconds of tail below hearing (reverb2: 8 s, silent after ~3.8 s).
// Cut where the energy still to come falls below -60 dB, with a short fade.
//
// A convolver also holds memory in proportion to its impulse, about 14 MB per
// second at 48 kHz in stereo, and every instrument has its own: a 10 s hall
// on five of them was most of the page's 750 MB, and the convolution's CPU
// grows the same way. So the tail is capped as well (MAX_SECONDS, faded out
// over the last CAP_FADE_SECONDS) - under music, what is past that is not
// heard as a tail but as a haze.
const TAIL_DB = -60;
const FADE_SECONDS = 0.05;
export const MAX_SECONDS = 3;
// A wet level below this is not worth a convolver (tens of MB and a share of the audio thread for
// a room that is 20 dB under the dry sound): the reverb stays off.
export const MIN_WET = 0.08;
const CAP_FADE_SECONDS = 0.8;
export function trimImpulse(AC, buffer, maxSeconds = Infinity) {
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    const threshold = Math.pow(10, TAIL_DB / 10);
    let total = 0;
    channels.forEach((d) => d.forEach((x) => { total += x * x; }));
    let remaining = total;
    let end = buffer.length;
    for (let i = 0; i < buffer.length; i++) {
        if (remaining < total * threshold) {
            end = i;
            break;
        }
        channels.forEach((d) => { remaining -= d[i] * d[i]; });
    }
    let length = Math.min(buffer.length, end + Math.round(FADE_SECONDS * buffer.sampleRate));
    // the cap: fade over its last stretch instead of cutting
    const cap = Math.round(maxSeconds * buffer.sampleRate);
    const capped = length > cap;
    if (capped) {
        length = cap;
        end = cap - Math.round(CAP_FADE_SECONDS * buffer.sampleRate);
    }
    if (!capped && length >= buffer.length - buffer.sampleRate * 0.1) return buffer;
    const trimmed = AC.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    channels.forEach((d, c) => {
        const out = trimmed.getChannelData(c);
        out.set(d.subarray(0, length));
        for (let i = end; i < length; i++) out[i] *= (length - i) / (length - end);
    });
    return trimmed;
}
// "Light" reverb, a choice in the ⚙ menu's Performance section (audio/performance.js): the impulse is
// shortened (LIGHT_SECONDS) and summed to mono, and the convolver takes a mono
// input - one convolution of a shorter, half-size impulse instead of two of a
// longer one, about a fifth of the CPU and memory, with a narrower, plainer
// room.
export const LIGHT_SECONDS = 2;

const LIGHT = PERFORMANCE.reverb === 'light';

/** An impulse summed to one channel. */
export function monoImpulse(AC, buffer) {
    if (buffer.numberOfChannels === 1) return buffer;
    const mono = AC.createBuffer(1, buffer.length, buffer.sampleRate);
    const out = mono.getChannelData(0);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    for (let i = 0; i < out.length; i++) out[i] = channels.reduce((sum, d) => sum + d[i], 0) / channels.length;
    return mono;
}

function loadImpulse(AC, type) {
    if (!buffers.has(AC.sampleRate)) buffers.set(AC.sampleRate, new Map());
    const cache = buffers.get(AC.sampleRate);
    if (!cache.has(type)) {
        const url = `${import.meta.env.BASE_URL}reverb/${type}.flac`;
        const load = fetch(url)
            .then((response) => {
                if (!response.ok) throw new Error(`${response.status} for ${url}`);
                return response.arrayBuffer();
            })
            .then((data) => AC.decodeAudioData(data))
            .then((buffer) => trimImpulse(AC, buffer, LIGHT ? LIGHT_SECONDS : MAX_SECONDS))
            .then((buffer) => (LIGHT ? monoImpulse(AC, buffer) : buffer));
        // a failed load may be retried later (e.g. after a network hiccup)
        load.catch(() => cache.delete(type));
        cache.set(type, load);
    }
    return cache.get(type);
}

// The room controls a sampled room can follow (the Wasm voices' rooms take them as they are; the
// presets' defaults - 8 s, 6 kHz, 25 ms - are that room's, and leave a sampled room as recorded):
// decay only shortens the impulse (an envelope with that RT60, once below the impulse's own
// length), damping darkens it below its default, pre-delay adds what is above 25 ms.
export const ROOM_DEFAULTS = { decay: 8, damping: 6000, predelay: 0.025 };
const decayStep = (decay) => Math.round(decay * 10) / 10;
const envelopes = new WeakMap();
export function decayedImpulse(AC, buffer, decay) {
    if (!(decay < buffer.duration)) return buffer;
    if (!envelopes.has(buffer)) envelopes.set(buffer, new Map());
    const cache = envelopes.get(buffer), key = decayStep(decay);
    if (!cache.has(key)) {
        const out = AC.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        const k = -6.91 / (key * buffer.sampleRate);
        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const from = buffer.getChannelData(c), to = out.getChannelData(c);
            for (let i = 0; i < from.length; i++) to[i] = from[i] * Math.exp(k * i);
        }
        cache.set(key, out);
    }
    return cache.get(key);
}
/** Pre-delay and damping in front of a convolver (or a send to a shared one). */
export class RoomColour {
    constructor(AC) {
        this.AC = AC;
        this.input = AC.createGain();
        this.delay = AC.createDelay(0.2);
        this.filter = AC.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.filter.Q.value = 0.5;
        this.input.connect(this.delay);
        this.delay.connect(this.filter);
        this.setPredelay(ROOM_DEFAULTS.predelay);
        this.setDamping(ROOM_DEFAULTS.damping);
    }
    connect = (destination) => this.filter.connect(destination);
    setPredelay = (seconds) => this.delay.delayTime.setTargetAtTime(Math.min(0.2, Math.max(0, seconds - ROOM_DEFAULTS.predelay)), this.AC.currentTime, 0.02);
    setDamping = (hz) => this.filter.frequency.setTargetAtTime(Math.min(20000, 20000 * (Math.max(200, hz) / ROOM_DEFAULTS.damping) ** 1.5), this.AC.currentTime, 0.02);
}

class Reverb {
    constructor(AC) {
        this.AC = AC;
        this.type = 'reverb1';
        this.amount = 0;
        this.node = this.AC.createConvolver();
        if (LIGHT) {
            this.node.channelCount = 1;
            this.node.channelCountMode = 'explicit';
        }
        this.dryGain = new Gain(this.AC);
        this.wetGain = new Gain(this.AC);
        this.node.connect(this.wetGain.getNode());
        this.colour = new RoomColour(this.AC);
        this.colour.connect(this.node);
        this.decay = ROOM_DEFAULTS.decay;
        this.loadedType = null;

        this.setAmount(0);
    }

    connect = destination => {
        if (Array.isArray(destination)) {
            destination.forEach((dest) => {
                this.dryGain.connect(dest);
                this.wetGain.connect(dest);
            });
        } else {
            this.dryGain.connect(destination);
            this.wetGain.connect(destination);
        }
    }

    // Getters
    getNode = () => [this.dryGain.getNode(), this.colour.input];
    getType = () => this.type;
    getAmount = () => this.wetGain.getGain();

    /** Whether there is nothing (more) to wait for: no impulse wanted, or it is in. */
    get settled() {
        return this.deferred || this.amount < MIN_WET || Boolean(this.node.buffer);
    }

    // A deferred reverb holds no impulse (and so no convolver memory, see
    // MAX_SECONDS) until hear() - for a voice that may never play, like a
    // second lead that is off.
    defer() {
        this.deferred = true;
    }

    hear() {
        if (!this.deferred) return;
        this.deferred = false;
        this.ensureImpulse();
    }

    // Loads the current type's impulse once the reverb can be heard.
    ensureImpulse() {
        const wanted = `${this.type}|${decayStep(this.decay)}`;
        if (this.deferred || this.amount < MIN_WET || this.loadedType === wanted) return;
        const type = this.type;
        this.loadedType = wanted;
        loadImpulse(this.AC, type).then(
            (buffer) => {
                if (this.loadedType === wanted) this.node.buffer = decayedImpulse(this.AC, buffer, this.decay);
            },
            (error) => {
                if (this.loadedType === wanted) this.loadedType = null;
                console.warn(`Reverb "${type}" could not be loaded; playing dry.`, error);
            },
        );
    }

    // Setters
    setAmount = val => {
        this.amount = val;
        if (val < 0.5) {
            this.dryGain.setGain(1);
            this.wetGain.setGain(val * 2);
        } else {
            this.dryGain.setGain(1 - ((val - 0.5) * 2));
            this.wetGain.setGain(1);
        }
        this.ensureImpulse();
    }

    setType = val => {
        if (!REVERB_TYPES.includes(val)) return false;
        this.type = val;
        this.ensureImpulse();
    };

    setDecay = (seconds) => {
        this.decay = Math.max(0.3, seconds);
        this.ensureImpulse();
    };
    setPredelay = (seconds) => this.colour.setPredelay(seconds);
    setDamping = (hz) => this.colour.setDamping(hz);
}

export default Reverb;
