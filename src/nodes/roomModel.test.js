import { roomImpulse, roomBuffer, ROOM_SPECS, ROOM_TYPES } from './roomModel';

const SR = 22050;
const energy = (a, from = 0, to = a.length) => { let s = 0; for (let i = from; i < to; i++) s += a[i] * a[i]; return s; };

test('the room types are the six the presets name', () => {
    expect(ROOM_TYPES).toEqual(['reverb1', 'reverb2', 'reverb3', 'reverb4', 'reverb5', 'reverb6']);
});

test.each(ROOM_TYPES)('%s: a finite stereo impulse of unit energy and the specified length', (type) => {
    const { channels } = roomImpulse(type, SR);
    expect(channels).toHaveLength(2);
    expect(channels[0].length).toBe(Math.round(ROOM_SPECS[type].seconds * SR));
    expect(channels.every((c) => c.every(Number.isFinite))).toBe(true);
    expect(energy(channels[0]) + energy(channels[1])).toBeCloseTo(1, 3);
});

test('the same room is the same impulse every time', () => {
    const a = roomImpulse('reverb4', SR, 1), b = roomImpulse('reverb4', SR, 1);
    expect(Array.from(a.channels[1])).toEqual(Array.from(b.channels[1]));
});

test('rooms differ from one another', () => {
    const a = roomImpulse('reverb1', SR, 1).channels[0], b = roomImpulse('reverb2', SR, 1).channels[0];
    expect(Array.from(a.subarray(0, 2000))).not.toEqual(Array.from(b.subarray(0, 2000)));
});

test('the impulse can be shortened without changing the room it starts as', () => {
    const full = roomImpulse('reverb3', SR), cut = roomImpulse('reverb3', SR, 1);
    expect(cut.channels[0].length).toBe(SR);
    expect(cut.channels[0].length).toBeLessThan(full.channels[0].length);
});

test('early energy follows the spec', () => {
    for (const type of ROOM_TYPES) {
        const { channels } = roomImpulse(type, SR), window = Math.round(0.08 * SR);
        const share = (energy(channels[0], 0, window) + energy(channels[1], 0, window)) / (energy(channels[0]) + energy(channels[1]));
        expect(Math.abs(share - ROOM_SPECS[type].early)).toBeLessThan(0.1);
    }
});

test('the tail dies away: the last quarter is far quieter than the first', () => {
    for (const type of ROOM_TYPES) {
        const c = roomImpulse(type, SR).channels[0], q = Math.floor(c.length / 4);
        expect(energy(c, 3 * q, 4 * q)).toBeLessThan(energy(c, 0, q) * 0.01);
    }
});

test('a near-mono room keeps its ears together and a wide one does not', () => {
    const corr = (type) => {
        const [l, r] = roomImpulse(type, SR).channels;
        let x = 0;
        for (let i = 0; i < l.length; i++) x += l[i] * r[i];
        return x / Math.sqrt(energy(l) * energy(r));
    };
    expect(corr('reverb1')).toBeGreaterThan(0.9);
    expect(corr('reverb4')).toBeLessThan(0.3);
});

test('roomBuffer fills an AudioBuffer of the context', () => {
    const made = [];
    const AC = { sampleRate: SR, createBuffer: (count, length, rate) => { const data = Array.from({ length: count }, () => new Float32Array(length)); made.push({ count, length, rate }); return { getChannelData: (c) => data[c], data }; } };
    const buffer = roomBuffer(AC, 'reverb5', 1);
    expect(made).toEqual([{ count: 2, length: SR, rate: SR }]);
    expect(energy(buffer.data[0])).toBeGreaterThan(0);
});

test('an unknown room is an error, not silence', () => {
    expect(() => roomImpulse('reverb9', SR)).toThrow(/Unknown room/);
});
