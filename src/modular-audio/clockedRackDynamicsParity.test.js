// @vitest-environment node
import fs from 'node:fs';
import vm from 'node:vm';
import { it, expect } from 'vitest';
import { RackDynamicsCommandWriter } from './rackDynamicsCommandTransport.js';
import { StampedRackTargetWriter } from './stampedRackTargetTransport.js';
import { nativeContextClockSpec } from './nativeContextClockCodec.js';

const module = new WebAssembly.Module(fs.readFileSync('public/rack-dynamics-calls/engine.wasm'));
function fixture(rate, kind, clocked) {
    const path = `public/rack-dynamics-${clocked ? 'clocked' : 'calls'}`;
    const manifest = JSON.parse(fs.readFileSync(path + '/build.json'));
    const box = { sampleRate: rate, currentFrame: 0, Float32Array, Float64Array, WebAssembly,
        AudioWorkletProcessor: class { constructor() { this.port = { postMessage() {} }; } }, registerProcessor: (_, T) => box.T = T };
    vm.createContext(box); vm.runInContext(fs.readFileSync(path + '/processor.js', 'utf8'), box);
    const owner = new box.T({ processorOptions: { module, engineVersion: manifest.version, kind, originFrame: 0, originSeconds: 0,
        nativeConstructor: true, values: kind === 'compressor' ? [-24, 30, 12, .005, .05, 1, 1] : [-24, 0, 20, .002, .09, 1, 1] } });
    const parameters = Object.fromEntries(box.T.parameterDescriptors.map(d => [d.name, new Float32Array([d.defaultValue])]));
    parameters.hostDemand[0] = 1;
    const context = { currentTime: 0, sampleRate: rate };
    const writer = clocked ? new RackDynamicsCommandWriter({ postMessage: data => owner.message(data) }, context) :
        new StampedRackTargetWriter(new Map(Object.entries(parameters).map(([key, value]) => [key, { setValueAtTime: v => value[0] = v }])), context, { ranges: [[0, 6], [-100, 40]], slots: 32 });
    if (clocked) owner.message({ kind: 'native-clock-spec', spec: nativeContextClockSpec(rate, 0, 1) });
    const output = [[new Float32Array(128), new Float32Array(128)]];
    return { owner, writer, context, tick(frame, input) {
        box.currentFrame = frame;
        if (clocked) {
            parameters.nativeClockLow = Float32Array.from({ length: 128 }, (_, i) => (frame + i) % (rate * 8) + 1);
            parameters.nativeClockCoarse = Float32Array.from({ length: 128 }, (_, i) => (frame + i) / (rate * 8));
        }
        expect(owner.process([input], output, parameters)).toBe(true);
        return output[0];
    } };
}
for (const rate of [8000, 44100, 48000, 96000]) for (const kind of ['compressor', 'limiter']) {
    it(`${kind} ${rate}: message edits preserve stamped-reference output, including late controls`, () => {
        const before = fixture(rate, kind, false), after = fixture(rate, kind, true);
        try {
            for (let q = 0; q < 24; q++) {
                const frame = q * 128;
                if ([0, 3, 7].includes(q)) for (const f of [before, after]) {
                    f.context.currentTime = (q === 7 ? frame - 128 : frame) / rate;
                    const lanes = kind === 'compressor' ? [5, 6, 0, 2, 1, 3, 4] : [0, 6, 5];
                    const values = [-32 + q, 18, 6, .007, .16, q ? .2 : 0, .8];
                    for (const lane of lanes) f.writer.post([lane, values[lane]], { initial: q === 0 });
                }
                const input = [0, 1].map(ch => Float32Array.from({ length: 128 }, (_, i) => Math.sin((frame + i) * .04 + ch) * .7));
                const reference = before.tick(frame, input), actual = after.tick(frame, input);
                for (let ch = 0; ch < 2; ch++) expect(actual[ch]).toEqual(reference[ch]);
                expect(after.owner.snapshot().coefficients).toEqual(before.owner.snapshot().coefficients);
            }
            expect(after.owner.snapshot().lateEdits).toBeGreaterThan(0);
        } finally { before.owner.message({ kind: 'dispose' }); after.owner.message({ kind: 'dispose' }); }
    });
}
