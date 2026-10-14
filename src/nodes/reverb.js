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
            .then((data) => AC.decodeAudioData(data));
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
