import { trimImpulse } from './reverb';

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
    // -80 dB of energy left after ~1.33 s for a 1 s RT60, plus the fade
    expect(trimmed.duration).toBeGreaterThan(1.3);
    expect(trimmed.duration).toBeLessThan(1.45);
    const out = trimmed.getChannelData(1);
    expect(Array.from(out.subarray(0, 1000))).toEqual(Array.from(data.subarray(0, 1000)));
    expect(Math.abs(out[out.length - 1])).toBeLessThan(Math.abs(data[out.length - 1]));
});

test('keeps an impulse that rings to its end', () => {
    const buffer = makeBuffer([impulse(3, 0).subarray(0, 4000)]);
    expect(trimImpulse(AC, buffer)).toBe(buffer);
});
