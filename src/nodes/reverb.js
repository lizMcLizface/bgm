import Gain from './gain';

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

// AudioContext -> Map(type -> Promise<AudioBuffer>)
const buffers = new WeakMap();

// A convolver's cost grows with its impulse's length, and some impulses
// carry seconds of tail below hearing (reverb2: 8 s, silent after ~3.8 s).
// Cut where the energy still to come falls below -80 dB, with a short fade.
const TAIL_DB = -80;
const FADE_SECONDS = 0.05;
export function trimImpulse(AC, buffer) {
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
    const length = Math.min(buffer.length, end + Math.round(FADE_SECONDS * buffer.sampleRate));
    if (length >= buffer.length - buffer.sampleRate * 0.1) return buffer;
    const trimmed = AC.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    channels.forEach((d, c) => {
        const out = trimmed.getChannelData(c);
        out.set(d.subarray(0, length));
        for (let i = end; i < length; i++) out[i] *= (length - i) / (length - end);
    });
    return trimmed;
}
function loadImpulse(AC, type) {
    if (!buffers.has(AC)) buffers.set(AC, new Map());
    const cache = buffers.get(AC);
    if (!cache.has(type)) {
        const url = `${import.meta.env.BASE_URL}reverb/${type}.flac`;
        const load = fetch(url)
            .then((response) => {
                if (!response.ok) throw new Error(`${response.status} for ${url}`);
                return response.arrayBuffer();
            })
            .then((data) => AC.decodeAudioData(data))
            .then((buffer) => trimImpulse(AC, buffer));
        // a failed load may be retried later (e.g. after a network hiccup)
        load.catch(() => cache.delete(type));
        cache.set(type, load);
    }
    return cache.get(type);
}

class Reverb {
    constructor(AC) {
        this.AC = AC;
        this.type = 'reverb1';
        this.amount = 0;
        this.node = this.AC.createConvolver();
        this.dryGain = new Gain(this.AC);
        this.wetGain = new Gain(this.AC);
        this.node.connect(this.wetGain.getNode());
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
    getNode = () => [this.dryGain.getNode(), this.node];
    getType = () => this.type;
    getAmount = () => this.wetGain.getGain();

    // Loads the current type's impulse once the reverb can be heard.
    ensureImpulse() {
        if (this.amount <= 0 || this.loadedType === this.type) return;
        const type = this.type;
        this.loadedType = type;
        loadImpulse(this.AC, type).then(
            (buffer) => {
                if (this.type === type) this.node.buffer = buffer;
            },
            (error) => {
                if (this.loadedType === type) this.loadedType = null;
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
}

export default Reverb;
