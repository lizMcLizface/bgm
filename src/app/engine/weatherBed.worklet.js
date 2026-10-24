import { WeatherBedModel } from './weatherBedModel.js';
class WeatherBedProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(); const p = options.processorOptions;
        this.model = new WeatherBedModel(sampleRate, p.shape, p.levels, p.seed);
        this.startFrame = Math.round(p.startTime * sampleRate); this.alive = true;
        this.port.onmessage = ({ data }) => {
            if (data.type === 'state') this.model.setState(data.shape, data.levels);
            if (data.type === 'stop') this.alive = false;
        };
    }
    process(_inputs, outputs) {
        if (!this.alive) return false;
        const n = outputs[0][0].length;
        if (currentFrame + n <= this.startFrame) return true;
        const skip = Math.max(0, this.startFrame - currentFrame);
        if (skip) this.model.process(outputs.map(pair => pair.map(ch => ch.subarray(skip))));
        else this.model.process(outputs);
        return true;
    }
}
registerProcessor('main-weather-bed', WeatherBedProcessor);
