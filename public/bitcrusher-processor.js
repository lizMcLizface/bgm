// Bitcrusher: sample-and-hold at normfreq of the rate, quantised to `bits`.
// Same algorithm as the ScriptProcessorNode version it replaces
// (src/nodes/bitcrusher.js), but on the audio thread instead of the main
// thread. A 'stop' message ends it (process() returns false).
class BitcrusherProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
            { name: 'normfreq', defaultValue: 0.25, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
        ];
    }

    constructor() {
        super();
        this.phaser = 0;
        this.last = 0;
        this.stopped = false;
        this.port.onmessage = (e) => { if (e.data === 'stop') this.stopped = true; };
    }

    process(inputs, outputs, parameters) {
        if (this.stopped) return false;
        const input = inputs[0] && inputs[0][0];
        const output = outputs[0] && outputs[0][0];
        if (!output) return true;
        const step = Math.pow(0.75, parameters.bits[0]);
        const normfreq = parameters.normfreq[0];
        for (let i = 0; i < output.length; i++) {
            this.phaser += normfreq;
            if (this.phaser >= 1.0) {
                this.phaser -= 1.0;
                this.last = input ? step * Math.floor(input[i] / step + 0.5) : 0;
            }
            output[i] = this.last;
        }
        return true;
    }
}

registerProcessor('bitcrusher-processor', BitcrusherProcessor);
