// A piano note is rendered, not sampled (piano.js), and a render takes tens of milliseconds: on the main thread a chord
// played for the first time sounded as an arpeggio. This renders the notes a chord needs in parallel on a few workers
// and puts them in the same cache, so by the time the instrument books the note the buffer is there.
import { findNoteBuffer, cachedNoteBuffer } from './noteBufferCache';
import { pianoNote, pianoKey } from './piano';

const MAX_WORKERS = 4;
const inflight = new Map();
let pool = null;

function makePool() {
    if (typeof Worker === 'undefined') return null;
    const count = Math.max(2, Math.min(MAX_WORKERS, (globalThis.navigator?.hardwareConcurrency ?? 4) - 2));
    const workers = Array.from({ length: count }, () => ({ worker: new Worker(new URL('./piano.worker.js', import.meta.url), { type: 'module' }), job: null }));
    const queue = [];
    const next = (slot) => {
        slot.job = queue.shift() ?? null;
        if (slot.job) slot.worker.postMessage({ id: 0, ...slot.job.message });
    };
    workers.forEach((slot) => {
        slot.worker.onmessage = ({ data }) => { const job = slot.job; next(slot); data.error ? job.fail(new Error(data.error)) : job.done(data.samples); };
        slot.worker.onerror = (event) => { const job = slot.job; next(slot); job?.fail(new Error(event.message || 'piano worker failed')); };
    });
    return {
        render(message) {
            return new Promise((done, fail) => {
                const job = { message, done, fail }, idle = workers.find((slot) => !slot.job);
                if (idle) { idle.job = job; idle.worker.postMessage({ id: 0, ...message }); } else queue.push(job);
            });
        },
    };
}

/**
 * Null when the note is in the cache already (or workers are not available: pianoBuffer then renders it on the spot);
 * otherwise a promise, always resolved (a failed render is left for pianoBuffer), for when it is.
 */
export function pianoBufferLater(context, frequency, options = {}) {
    const note = pianoNote(frequency, options), key = pianoKey(note);
    if (findNoteBuffer(context, key)) return null;
    pool ??= makePool();
    if (!pool) return null;
    const id = JSON.stringify([context.sampleRate, key]);
    if (!inflight.has(id)) {
        inflight.set(id, pool.render({ sampleRate: context.sampleRate, freq: note.freq, settings: note.settings })
            .then((samples) => { cachedNoteBuffer(context, key, () => samples); })
            .catch(() => {})
            .finally(() => inflight.delete(id)));
    }
    return inflight.get(id);
}

/** For tests: forget the workers and what is being rendered. */
export function resetPianoPool() {
    inflight.clear();
    pool = null;
}
