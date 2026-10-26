// Renders the impulse response of the effects kernel's FDN room (public/synth-lab/effects.wasm) in node,
// the way the worklet would: a mono click into the reverb send, wet output only.
import fs from 'node:fs';
import { EFFECTS } from '../src/synth-lab/effectsConfig.js';

const wasm = new WebAssembly.Module(fs.readFileSync(new URL('../public/synth-lab/effects.wasm', import.meta.url)));
const INDEX = Object.fromEntries(EFFECTS.map(([key], i) => [key, i]));

/** `room`: any of the EFFECTS keys (decay, size, damping, predelay, width, modulation, quality, reverbReturn, ...). */
export function fdnImpulse(room, sampleRate = 44100, seconds = 3) {
    const fx = new WebAssembly.Instance(wasm, {}).exports;
    fx.fx_init(sampleRate);
    const params = { dry: 0, reverb: 0.8, delay: 0, delayToReverb: 0, ...room };
    for (const [key, value] of Object.entries(params)) fx.fx_param(INDEX[key], value);
    const memory = fx.memory.buffer, block = 2048;
    const inputs = Array.from({ length: 6 }, (_, c) => new Float32Array(memory, fx.fx_input(c), block));
    const outputs = [0, 1].map((c) => new Float32Array(memory, fx.fx_output(c), block));
    const length = Math.round(seconds * sampleRate), left = new Float32Array(length), right = new Float32Array(length);
    for (let at = 0; at < length; at += block) {
        const n = Math.min(block, length - at);
        inputs.forEach((input) => input.fill(0));
        if (at === 0) { inputs[2][0] = 0.1; inputs[3][0] = 0.1; }
        fx.fx_render(n);
        left.set(outputs[0].subarray(0, n), at);
        right.set(outputs[1].subarray(0, n), at);
    }
    return { channels: [left, right], sampleRate };
}
