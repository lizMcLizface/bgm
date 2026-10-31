import { pianoBuffer, renderPiano, clearPianoCache } from './piano';
import { pianoBufferLater, resetPianoPool } from './pianoRenderPool';

const context = { sampleRate: 8000, createBuffer: (channels, length) => { const data = new Float32Array(length); return { length, getChannelData: () => data }; } };
const options = { type: 'felt', decay: 0.4, velocity: 0.6, seed: 3 };

// workers answer a tick later, as real ones do
class FakeWorker {
    static made = []; static jobs = [];
    constructor() { FakeWorker.made.push(this); }
    postMessage({ id, sampleRate, freq, settings }) {
        FakeWorker.jobs.push(freq);
        setTimeout(() => this.onmessage({ data: { id, samples: renderPiano(sampleRate, freq, settings) } }), 1);
    }
}

beforeEach(() => { FakeWorker.made = []; FakeWorker.jobs = []; globalThis.Worker = FakeWorker; clearPianoCache(); resetPianoPool(); });
afterEach(() => { delete globalThis.Worker; });

test('a note not rendered yet is rendered on a worker and then found in the cache', async () => {
    const later = pianoBufferLater(context, 261.63, options);
    expect(later).toBeInstanceOf(Promise);
    await later;
    expect(FakeWorker.jobs).toEqual([261.63]);
    expect(pianoBufferLater(context, 261.63, options)).toBeNull();
    expect(pianoBuffer(context, 261.63, options).length).toBeGreaterThan(0);
    expect(FakeWorker.jobs).toHaveLength(1);
});

test('a chord is rendered on several workers at once, and the same note asked twice is rendered once', async () => {
    const chord = [261.63, 329.63, 392, 523.25].map((f) => pianoBufferLater(context, f, options));
    const again = pianoBufferLater(context, 261.63, options);
    expect(again).toBe(chord[0]);
    expect(FakeWorker.made.length).toBeGreaterThan(1);
    await Promise.all(chord);
    expect(FakeWorker.jobs.sort()).toEqual([261.63, 329.63, 392, 523.25]);
});

test('without workers the caller renders on the spot', () => {
    delete globalThis.Worker; resetPianoPool();
    expect(pianoBufferLater(context, 261.63, options)).toBeNull();
});
