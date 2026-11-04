// Two stereo effects for the effects rack (src/synths/effects/extras.js): a bit crusher and a pitch shifter.
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
