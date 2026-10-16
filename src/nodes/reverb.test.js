import { trimImpulse, monoImpulse } from './reverb';

const SR = 1000;

// Minimal AudioBuffer stand-ins (jsdom has no Web Audio).
const makeBuffer = (channels, sampleRate = SR) => ({
    numberOfChannels: channels.length,
    length: channels[0].length,
    sampleRate,
    duration: channels[0].length / sampleRate,
    getChannelData: (c) => channels[c],
});
const AC = { createBuffer: (count, length, sampleRate) => makeBuffer(Array.from({ length: count }, () => new Float32Array(length)), sampleRate) };

// Exponential decay of `rt60` seconds, padded with `silence` seconds of zeros.
function impulse(rt60, silence) {
    const decay = Math.round(rt60 * 2 * SR); // to -120 dB
    const data = new Float32Array(decay + silence * SR);
    for (let i = 0; i < decay; i++) data[i] = Math.pow(10, (-60 * i) / (rt60 * SR) / 20) * (i % 2 ? 1 : -1);
    return data;
}

test('cuts the inaudible tail, with a fade', () => {
    const data = impulse(1, 5);
    const trimmed = trimImpulse(AC, makeBuffer([data, data]));
    // -60 dB of energy left after ~1 s for a 1 s RT60, plus the fade
    expect(trimmed.duration).toBeGreaterThan(0.95);
    expect(trimmed.duration).toBeLessThan(1.15);
    const out = trimmed.getChannelData(1);
    expect(Array.from(out.subarray(0, 1000))).toEqual(Array.from(data.subarray(0, 1000)));
    expect(Math.abs(out[out.length - 1])).toBeLessThan(Math.abs(data[out.length - 1]));
});

test('keeps an impulse that rings to its end', () => {
    const buffer = makeBuffer([impulse(10, 0).subarray(0, 3000)]);
    expect(trimImpulse(AC, buffer)).toBe(buffer);
});

test('caps a long tail, fading it out over its last stretch', () => {
    const data = impulse(8, 0);
    const trimmed = trimImpulse(AC, makeBuffer([data]), 4);
    expect(trimmed.duration).toBe(4);
    const out = trimmed.getChannelData(0);
    // untouched at the start, faded to nothing at the end
    expect(Array.from(out.subarray(0, 500))).toEqual(Array.from(data.subarray(0, 500)));
    expect(Math.abs(out[out.length - 1])).toBeLessThan(Math.abs(data[out.length - 1]) * 0.01);
    // a short impulse is left alone by a cap it doesn't reach
    expect(trimImpulse(AC, makeBuffer([impulse(1, 5)]), 4).duration).toBeLessThan(1.2);
});

test('the light reverb sums an impulse to one channel', () => {
    const left = Float32Array.from([1, 0.5, 0]);
    const right = Float32Array.from([0, 0.5, -1]);
    const mono = monoImpulse(AC, makeBuffer([left, right]));
    expect(mono.numberOfChannels).toBe(1);
    expect(Array.from(mono.getChannelData(0))).toEqual([0.5, 0.5, -0.5]);
    const already = makeBuffer([left]);
    expect(monoImpulse(AC, already)).toBe(already);
});
