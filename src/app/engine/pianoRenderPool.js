// A piano note is rendered, not sampled (piano.js), and a render takes tens of milliseconds: on the main thread a chord
// played for the first time sounded as an arpeggio. This renders the notes a chord needs in parallel on a few workers
// and puts them in the same cache, so by the time the instrument books the note the buffer is there.
import { findNoteBuffer, cachedNoteBuffer } from './noteBufferCache';
import { pianoNote, pianoKey,pianoBodyNote,renderPiano,renderPianoBody } from './piano';
import {pianoRendererFor,readPianoPreparation,recordPianoPreparation} from './pianoPreparation';
import {loadRustPiano,supportsRustPianoBody} from './rustPiano';

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
        slot.worker.onmessage = ({ data }) => { const job = slot.job; next(slot); data.error ? job.fail(new Error(data.error)) : job.done(data); };
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
    const note = pianoNote(frequency, options),requested=readPianoPreparation(),renderer=pianoRendererFor(note.settings),key = pianoKey(note,renderer),bodyNote=pianoBodyNote(context.sampleRate,frequency,note.settings,renderer),bodyKey=bodyNote.key;
    if (findNoteBuffer(context, key)) return null;
    pool ??= makePool();
    if (!pool&&renderer!=='rust') return null;
    const id = JSON.stringify([context.sampleRate, key]);
    if (!inflight.has(id)) {
        const work=pool?pool.render({sampleRate:context.sampleRate,freq:note.freq,bodyFrequency:frequency,settings:note.settings,renderer}):loadRustPiano().then(({renderer:r,version})=>({samples:r.renderNote(context.sampleRate,note.freq,note.settings),body:supportsRustPianoBody(note.settings)?r.renderBody(context.sampleRate,frequency,bodyNote.settings):null,renderer:'rust',version}));
        inflight.set(id, work
            .then((data) => { cachedNoteBuffer(context, key, () => data.samples);if(data.body)cachedNoteBuffer(context,bodyKey,()=>data.body);recordPianoPreparation({renderer:data.renderer??'legacy',body:!!data.body,version:data.version,unsupported:requested==='rust'&&renderer==='legacy',...(renderer==='rust'&&data.renderer!=='rust'?{error:'Piano worker returned the original renderer instead of Rust.'}:{})}); })
            .catch((error) => {if(renderer==='rust'){cachedNoteBuffer(context,key,()=>renderPiano(context.sampleRate,note.freq,note.settings));if(supportsRustPianoBody(note.settings))cachedNoteBuffer(context,bodyKey,()=>renderPianoBody(context.sampleRate,frequency,bodyNote.settings));}recordPianoPreparation({renderer:'legacy',prepared:renderer==='rust',error});})
            .finally(() => inflight.delete(id)));
    }
    return inflight.get(id);
}

/** For tests: forget the workers and what is being rendered. */
export function resetPianoPool() {
    inflight.clear();
    pool = null;
}
