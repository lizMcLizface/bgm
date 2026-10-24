import { WeatherModel } from './weatherModel.js';
class RainProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.model = new WeatherModel(sampleRate, options.processorOptions?.environment, options.processorOptions?.seed);
        this.alive = true; this.frames = 0;
        this.port.onmessage = ({ data }) => {
            if (data.type === 'stop') this.alive = false;
            if (data.type === 'environment') this.model.setEnvironment(data.value);
            if (data.type === 'trigger') this.model.trigger(data.value);
        };
    }
    process(_inputs, outputs) {
        if (!this.alive) return false;
        this.model.process(outputs);
        this.frames += outputs[0][0].length;
        if (this.frames >= sampleRate / 4) {
            this.frames = 0;
            this.port.postMessage(this.model.stats());
        }
        return true;
    }
}
registerProcessor('procedural-rain', RainProcessor);
