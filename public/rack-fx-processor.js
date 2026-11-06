// Three stereo effects for the effects rack (src/synths/effects/extras.js): a bit crusher, a pitch shifter and a z-plane filter.
// Each runs on both channels independently (explicit stereo), so a stereo chain stays stereo.

// Bit crusher: reduces the word length to `bits` and holds each sample for `divide` samples, then mixes with the dry signal.
class RackCrusher extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'bits', defaultValue: 8, minValue: 2, maxValue: 16, automationRate: 'k-rate' },
            { name: 'divide', defaultValue: 1, minValue: 1, maxValue: 32, automationRate: 'k-rate' },
            { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        ];
    }

    constructor() {
        super();
        this.held = [0, 0];
        this.count = 0;
        this.stopped = false;
        this.port.onmessage = (e) => { if (e.data === 'stop') this.stopped = true; };
    }

    process(inputs, outputs, parameters) {
        if (this.stopped) return false;
        const input = inputs[0], output = outputs[0];
        const levels = 2 ** (Math.round(parameters.bits[0]) - 1), divide = Math.max(1, Math.round(parameters.divide[0])), mix = parameters.mix[0];
        const n = output[0]?.length ?? 0;
        for (let i = 0; i < n; i++) {
            if (this.count === 0) {
                for (let ch = 0; ch < output.length; ch++) this.held[ch] = Math.round((input[ch]?.[i] ?? 0) * levels) / levels;
            }
            this.count = (this.count + 1) % divide;
            for (let ch = 0; ch < output.length; ch++) output[ch][i] = (input[ch]?.[i] ?? 0) * (1 - mix) + this.held[ch] * mix;
        }
        return true;
    }
}
registerProcessor('rack-crusher', RackCrusher);

// Pitch shifter: two read heads moving through a delay line at the pitch ratio, crossfaded with sin^2 windows half a window
// apart (so they sum to one), the classic dual-tap shifter. About 25 ms of latency; the dry signal is mixed in undelayed, so a
// mix near 0.5 sounds like a thickening or an octave pad rather than a pure shift.
const WINDOW = 0.05; // seconds
class RackPitch extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'semitones', defaultValue: -12, minValue: -24, maxValue: 24, automationRate: 'k-rate' },
            { name: 'cents', defaultValue: 0, minValue: -50, maxValue: 50, automationRate: 'k-rate' },
            { name: 'mix', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        ];
    }

    constructor() {
        super();
        this.size = 1 << 15;
        this.mask = this.size - 1;
        this.buffers = [new Float32Array(this.size), new Float32Array(this.size)];
        this.write = 0;
        this.window = Math.round(WINDOW * sampleRate);
        this.delay = [0, this.window / 2];
        this.stopped = false;
        this.port.onmessage = (e) => { if (e.data === 'stop') this.stopped = true; };
    }

    read(buffer, delay) {
        const at = this.write - delay, i = Math.floor(at), f = at - i;
        return buffer[i & this.mask] * (1 - f) + buffer[(i + 1) & this.mask] * f;
    }

    process(inputs, outputs, parameters) {
        if (this.stopped) return false;
        const input = inputs[0], output = outputs[0];
        const ratio = 2 ** ((parameters.semitones[0] + parameters.cents[0] / 100) / 12), mix = parameters.mix[0], W = this.window;
        const n = output[0]?.length ?? 0;
        for (let i = 0; i < n; i++) {
            const g0 = Math.sin(Math.PI * this.delay[0] / W) ** 2, g1 = Math.sin(Math.PI * this.delay[1] / W) ** 2;
            for (let ch = 0; ch < output.length; ch++) {
                const dry = input[ch]?.[i] ?? 0, b = this.buffers[ch];
                b[this.write & this.mask] = dry;
                const wet = this.read(b, this.delay[0] + 1) * g0 + this.read(b, this.delay[1] + 1) * g1;
                output[ch][i] = dry * (1 - mix) + wet * mix;
            }
            this.write++;
            for (let k = 0; k < 2; k++) {
                this.delay[k] += 1 - ratio;
                if (this.delay[k] >= W) this.delay[k] -= W;
                else if (this.delay[k] < 0) this.delay[k] += W;
            }
        }
        return true;
    }
}
registerProcessor('rack-pitch', RackPitch);

// Z-plane filter: up to twelve cascaded biquad sections (the ones with no boost or cut are skipped), each a pole pair and a zero pair at one angle on the z-plane (the E-mu way of
// describing a filter). A shape gives each section a centre frequency, a pole bandwidth and a boost in dB (see
// src/synths/effects/zplaneShapes.js, passed in as processorOptions.shapes); the filter morphs by sliding those values between
// shape a and shape b. Poles sit at radius exp(-pi bw / fs), zeros at the same angle with the bandwidth scaled by the boost, so a
// section is a peak when the zeros are wider than the poles and a notch when narrower. The level is held steady by taking the
// average dB over the audible range back out. Coefficients follow the parameters once per block; the sections run transposed
// direct form II, which stays well behaved while coefficients move.
const ZP_SECTIONS = 12, ZP_POINTS = 40;
class RackZPlane extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'a', defaultValue: 0, minValue: 0, maxValue: 63, automationRate: 'k-rate' },
            { name: 'b', defaultValue: 2, minValue: 0, maxValue: 63, automationRate: 'k-rate' },
            { name: 'morph', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'shift', defaultValue: 0, minValue: -1, maxValue: 1, automationRate: 'k-rate' },
            { name: 'q', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
            { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        ];
    }

    constructor(options) {
        super();
        this.shapes = options?.processorOptions?.shapes ?? [];
        this.custom = { a: null, b: null }; // the custom shapes' rows, sent by message
        this.coef = new Float64Array(ZP_SECTIONS * 5); // b0 b1 b2 a1 a2 per section
        this.state = [new Float64Array(ZP_SECTIONS * 2), new Float64Array(ZP_SECTIONS * 2)];
        this.gain = 1;
        this.used = []; // the sections that do something
        this.last = [NaN, NaN, NaN, NaN, NaN];
        this.points = Array.from({ length: ZP_POINTS }, (_, i) => 2 * Math.PI * Math.min(0.45 * sampleRate, 60 * (10000 / 60) ** (i / (ZP_POINTS - 1))) / sampleRate);
        this.stopped = false;
        this.port.onmessage = (e) => {
            if (e.data === 'stop') this.stopped = true;
            else if (e.data?.custom) { this.custom = e.data.custom; this.last = [NaN, NaN, NaN, NaN, NaN]; }
        };
    }

    update(a, b, morph, shift, q) {
        // a shape index past the built-in ones is the side's custom shape
        const rows = (side, i) => (i >= this.shapes.length ? this.custom[side] : this.shapes[Math.max(0, i)]?.sections);
        const A = rows('a', a), B = rows('b', b);
        if (!A || !B) return;
        const widen = 9 ** (0.5 - q), octave = 2 ** shift, nyquist = 0.45 * sampleRate;
        this.used = [];
        for (let s = 0; s < ZP_SECTIONS; s++) {
            const [fa, wa, da] = A[s], [fb, wb, db] = B[s];
            const freq = Math.max(20, Math.min(nyquist, Math.exp(Math.log(fa) * (1 - morph) + Math.log(fb) * morph) * octave));
            const bandwidth = Math.max(8, Math.min(8000, Math.exp(Math.log(wa) * (1 - morph) + Math.log(wb) * morph) * widen));
            const boost = Math.max(-30, Math.min(30, da + (db - da) * morph));
            if (Math.abs(boost) >= 0.05) this.used.push(s);
            const zeroBandwidth = Math.max(1, Math.min(20000, bandwidth * 10 ** (boost / 20)));
            const theta = 2 * Math.PI * freq / sampleRate, c = Math.cos(theta);
            const rp = Math.min(0.9995, Math.exp(-Math.PI * bandwidth / sampleRate)), rz = Math.min(0.9995, Math.exp(-Math.PI * zeroBandwidth / sampleRate));
            const k = s * 5;
            this.coef[k] = 1; this.coef[k + 1] = -2 * rz * c; this.coef[k + 2] = rz * rz; this.coef[k + 3] = -2 * rp * c; this.coef[k + 4] = rp * rp;
        }
        // the level: average dB across the audible range, taken back out
        let total = 0;
        for (const w of this.points) {
            const cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
            let db = 0;
            for (const s of this.used) {
                const k = s * 5;
                const nr = this.coef[k] + this.coef[k + 1] * cw + this.coef[k + 2] * c2, ni = -(this.coef[k + 1] * sw + this.coef[k + 2] * s2);
                const dr = 1 + this.coef[k + 3] * cw + this.coef[k + 4] * c2, di = -(this.coef[k + 3] * sw + this.coef[k + 4] * s2);
                db += 10 * Math.log10((nr * nr + ni * ni + 1e-20) / (dr * dr + di * di + 1e-20));
            }
            total += db;
        }
        this.gain = 10 ** (-total / ZP_POINTS / 20);
    }

    process(inputs, outputs, parameters) {
        if (this.stopped) return false;
        const input = inputs[0], output = outputs[0];
        const now = [Math.round(parameters.a[0]), Math.round(parameters.b[0]), parameters.morph[0], parameters.shift[0], parameters.q[0]];
        if (now.some((v, i) => v !== this.last[i])) { this.update(...now); this.last = now; }
        const mix = parameters.mix[0], g = this.gain, coef = this.coef, used = this.used;
        const n = output[0]?.length ?? 0;
        for (let ch = 0; ch < output.length; ch++) {
            const st = this.state[ch], src = input[ch], out = output[ch];
            for (let i = 0; i < n; i++) {
                const dry = src ? src[i] : 0;
                let x = dry;
                for (const s of used) {
                    const k = s * 5, j = s * 2;
                    const y = coef[k] * x + st[j];
                    st[j] = coef[k + 1] * x - coef[k + 3] * y + st[j + 1];
                    st[j + 1] = coef[k + 2] * x - coef[k + 4] * y;
                    if (st[j] < 1e-20 && st[j] > -1e-20) st[j] = 0;
                    if (st[j + 1] < 1e-20 && st[j + 1] > -1e-20) st[j + 1] = 0;
                    x = y;
                }
                out[i] = dry * (1 - mix) + x * g * mix;
            }
        }
        return true;
    }
}
registerProcessor('rack-zplane', RackZPlane);
