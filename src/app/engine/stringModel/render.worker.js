// Renders string notes off the main thread (a note takes a few hundred ms; a whole keyboard of them froze the page). One message per note:
// { id, patch, midi, v, tuning, without, rate, gain } -> { id, ... } with the samples transferred back.
import { PATCHES, tunedModel } from './player.js';
import { renderSustained, renderDecay, releaseCurve } from './synth.js';

self.onmessage = ({ data: { id, patch, midi, v, tuning, without, rate, gain } }) => {
    const started = performance.now(), model = tunedModel(patch, midi, v, tuning, without), bowed = PATCHES[patch].bowed;
    const made = bowed ? renderSustained(model, rate, { seed: midi * 7 + v }) : renderDecay(model, rate, { seed: midi * 7 + v });
    for (let i = 0; i < made.buffer.length; i++) made.buffer[i] *= gain;
    const { buffer, ...rest } = made;
    self.postMessage({ id, buffer, made: rest, release: bowed ? releaseCurve(model) : null, harmonics: model.tonal.length, ms: Math.round(performance.now() - started) }, [buffer.buffer]);
};
