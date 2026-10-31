// Renders piano notes off the main thread (pianoRenderPool.js): { id, sampleRate, freq, settings } -> { id, samples }.
import { renderPiano } from './piano';

self.onmessage = ({ data: { id, sampleRate, freq, settings } }) => {
    try {
        const samples = renderPiano(sampleRate, freq, settings);
        self.postMessage({ id, samples }, [samples.buffer]);
    } catch (error) {
        self.postMessage({ id, error: String(error?.message ?? error) });
    }
};
