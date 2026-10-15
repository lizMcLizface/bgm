// Renders ambient layers off the main thread (see ambience.js).
import { renderLayer } from './ambienceSynth';

self.onmessage = ({ data: { request, id, sampleRate } }) => {
    const samples = renderLayer(id, sampleRate);
    const transfer = (id === 'thunder' ? samples.flat() : samples).map((channel) => channel.buffer);
    self.postMessage({ request, samples }, transfer);
};
