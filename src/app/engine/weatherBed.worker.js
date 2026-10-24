import { WeatherSegmentRenderer } from './weatherBedModel.js';
let renderer;
self.onmessage = ({ data }) => {
    try {
        renderer ??= new WeatherSegmentRenderer(data.rate, data.shape, data.levels, data.seed);
        const samples = renderer.render(data.from, data.frames);
        self.postMessage({ request: data.request, samples }, Object.values(samples).flat().map(ch => ch.buffer));
    } catch (error) { self.postMessage({ request: data.request, error: error.message }); }
};
