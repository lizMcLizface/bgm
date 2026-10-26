import { vi } from 'vitest';
import DrumRoom, { FDN_ROOMS as DRUM_ROOMS, fdnRoomSupported, makeDrumRoom } from './fdnRoom';

vi.mock('../../synth-lab/effects', () => ({ createEffectsBus: vi.fn() }));
import { createEffectsBus } from '../../synth-lab/effects';

const param = (value = 0) => ({ value, setValueAtTime() {}, setTargetAtTime() {} });
function node(extra = {}) {
    const n = { connected: [], connect(to) { n.connected.push(to); return to; }, disconnect() { n.connected = []; }, gain: param(1), frequency: param(), Q: param(), ...extra };
    return n;
}
function context(extra = {}) {
    return { currentTime: 0, sampleRate: 48000, audioWorklet: {}, createGain: () => node(), createBiquadFilter: () => node(),
        createConvolver: () => node(), createDelay: () => node({ delayTime: param() }), ...extra };
}
const fakeBus = () => ({ node: node(), patch: vi.fn(), clear: vi.fn(), dispose: vi.fn() });

beforeEach(() => {
    createEffectsBus.mockReset();
    createEffectsBus.mockImplementation(async () => fakeBus());
    vi.stubGlobal('fetch', () => Promise.reject(new Error('no network in tests')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

test('the kernel is used where an AudioWorklet exists, the convolver where it does not', () => {
    expect(fdnRoomSupported(context())).toBe(true);
    expect(fdnRoomSupported(context({ audioWorklet: undefined }))).toBe(false);
    expect(makeDrumRoom(context())).toBeInstanceOf(DrumRoom);
    expect(makeDrumRoom(context({ audioWorklet: undefined }))).not.toBeInstanceOf(DrumRoom);
});

test('a deferred room starts nothing until it is heard', async () => {
    const room = new DrumRoom(context());
    room.defer();
    room.setAmount(0.5);
    expect(createEffectsBus).not.toHaveBeenCalled();
    createEffectsBus.mockResolvedValue(fakeBus());
    room.hear();
    expect(createEffectsBus).toHaveBeenCalledTimes(1);
});

test('a room too quiet to hear starts nothing', () => {
    const room = new DrumRoom(context());
    room.setAmount(0.02);
    expect(createEffectsBus).not.toHaveBeenCalled();
    expect(room.settled).toBe(true);
});

test('the kernel gets the room as wet-only settings, and the send goes to its reverb input', async () => {
    const bus = fakeBus();
    createEffectsBus.mockResolvedValue(bus);
    const room = new DrumRoom(context());
    room.setAmount(0.4);
    await room.starting;
    const settings = createEffectsBus.mock.calls[0][1];
    const { hp, lp, ...kernelRoom } = DRUM_ROOMS.reverb3;
    expect(hp).toBeGreaterThan(0);
    expect(lp).toBeGreaterThan(hp);
    expect(settings).toMatchObject({ ...kernelRoom, dry: 0, reverb: 0.8, delay: 0, quality: 0 });
    expect(settings.hp).toBeUndefined();
    expect(settings.lp).toBeUndefined();
    expect(room.lowpass.connected).toContainEqual(bus.node);
    expect(bus.node.connected).toContain(room.out);
    expect(room.settled).toBe(true);
});

test('the dry / wet law follows the convolver reverb', () => {
    const room = new DrumRoom(context());
    room.setAmount(0.25);
    expect([room.dryGain.gain.value, room.sendGain.gain.value]).toEqual([1, 0.5]);
    room.setAmount(0.75);
    expect([room.dryGain.gain.value, room.sendGain.gain.value]).toEqual([0.5, 1]);
});

test('a failed kernel leaves the recorded room, and only then fetches it', async () => {
    createEffectsBus.mockRejectedValue(new Error('no wasm'));
    const fetched = vi.fn(() => Promise.reject(new Error('no network in tests')));
    vi.stubGlobal('fetch', fetched);
    const room = new DrumRoom(context());
    room.setAmount(0.4);
    await room.starting;
    expect(room.failed).toBe(true);
    expect(room.fallback).not.toBeNull();
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(fetched.mock.calls[0][0]).toMatch(/reverb3\.flac$/);
});

test('with the kernel working, nothing is fetched', async () => {
    const fetched = vi.fn(() => Promise.reject(new Error('should not be called')));
    vi.stubGlobal('fetch', fetched);
    createEffectsBus.mockResolvedValue(fakeBus());
    const room = new DrumRoom(context());
    room.setAmount(0.4);
    await room.starting;
    expect(fetched).not.toHaveBeenCalled();
});

test('a room disposed while the kernel loads releases it', async () => {
    const bus = fakeBus();
    createEffectsBus.mockResolvedValue(bus);
    const room = new DrumRoom(context());
    room.setAmount(0.4);
    room.dispose();
    await room.starting;
    expect(bus.dispose).toHaveBeenCalled();
});

test('the tail it reports covers the room and flush clears it', async () => {
    const bus = fakeBus();
    createEffectsBus.mockResolvedValue(bus);
    const room = new DrumRoom(context());
    room.setAmount(0.4);
    await room.starting;
    expect(room.tailSeconds()).toBeGreaterThan(DRUM_ROOMS.reverb3.decay);
    room.flush();
    expect(bus.clear).toHaveBeenCalled();
});

test('every room type has a fitted room, and a presets decay only shortens it', () => {
    expect(Object.keys(DRUM_ROOMS)).toEqual(['reverb1', 'reverb2', 'reverb3', 'reverb4', 'reverb5', 'reverb6']);
    for (const room of Object.values(DRUM_ROOMS)) expect(room).toEqual(expect.objectContaining({ decay: expect.any(Number), hp: expect.any(Number), lp: expect.any(Number) }));
    const room = new DrumRoom(context(), 'reverb4');
    expect(room.settings().decay).toBe(DRUM_ROOMS.reverb4.decay);
    room.setDecay(1);
    expect(room.settings().decay).toBe(1);
    room.setDecay(20);
    expect(room.settings().decay).toBe(DRUM_ROOMS.reverb4.decay);
    room.setType('reverb2');
    expect(room.settings().damping).toBe(DRUM_ROOMS.reverb2.damping);
});
