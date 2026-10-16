import { SendReverb, hubFor } from './sharedReverb';
import { readPerformance, writePerformance, isMobile, PERFORMANCE_KEY } from '../audio/performance';

// Minimal Web Audio stand-ins: nodes that record what they are connected to.
function makeContext() {
    const node = (extra = {}) => {
        const n = {
            connections: new Set(),
            connect(to) { n.connections.add(to); },
            disconnect() { n.connections.clear(); },
            gain: { value: 1, setValueAtTime(v) { n.gain.value = v; }, setTargetAtTime(v) { n.gain.value = v; } },
            buffer: null,
            ...extra,
        };
        return n;
    };
    return { currentTime: 0, sampleRate: 48000, createGain: () => node(), createConvolver: () => node() };
}

beforeEach(() => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('no network in tests')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe('shared reverb', () => {
    test('voices on the same impulse share one convolver; another impulse gets its own', () => {
        const AC = makeContext();
        const hub = hubFor(AC);
        const a = new SendReverb(AC, hub);
        const b = new SendReverb(AC, hub);
        const c = new SendReverb(AC, hub);
        [a, b, c].forEach((r) => { r.setType('reverb4'); r.setAmount(0.4); r.setAwake(true); });
        c.setType('reverb3');
        expect(hub.buses.size).toBe(2);
        expect(a.bus).toBe(b.bus);
        expect(a.bus).not.toBe(c.bus);
        expect(a.levelGain.getNode().connections.has(a.bus.node)).toBe(true);
    });

    test('a quiet, asleep or deferred voice is not connected to any convolver (and none is made for it)', () => {
        const AC = makeContext();
        const hub = hubFor(AC);
        const r = new SendReverb(AC, hub);
        r.setType('reverb5');
        r.setAmount(0.05);
        r.setAwake(true);
        expect(hub.buses.size).toBe(0);
        expect(r.settled).toBe(true);
        r.setAmount(0.4);
        expect(r.bus).not.toBeNull();
        r.setAwake(false);
        expect(r.bus).toBeNull();
        expect(r.levelGain.getNode().connections.size).toBe(0);
        r.setAwake(true);
        expect(r.bus).not.toBeNull();
        r.defer();
        r.route();
        expect(r.bus).toBeNull();
        r.hear();
        expect(r.bus).not.toBeNull();
    });

    test('the dry sound follows the usual law and the wet level the same one; the role volume scales the send', () => {
        const AC = makeContext();
        const r = new SendReverb(AC, hubFor(AC));
        r.setAmount(0.25);
        expect(r.dryGain.getNode().gain.value).toBe(1);
        expect(r.sendGain.getNode().gain.value).toBe(0.5);
        r.setAmount(0.75);
        expect(r.dryGain.getNode().gain.value).toBeCloseTo(0.5);
        expect(r.sendGain.getNode().gain.value).toBe(1);
        r.setLevel(0);
        expect(r.levelGain.getNode().gain.value).toBe(0);
    });

    test('changing the impulse type moves the send to the other convolver', () => {
        const AC = makeContext();
        const r = new SendReverb(AC, hubFor(AC));
        r.setAmount(0.4);
        r.setAwake(true);
        r.setType('reverb4');
        const first = r.bus;
        r.setType('reverb6');
        expect(r.bus).not.toBe(first);
        expect(r.levelGain.getNode().connections.has(first.node)).toBe(false);
        expect(r.levelGain.getNode().connections.has(r.bus.node)).toBe(true);
    });
});

describe('performance choices', () => {
    const userAgent = (ua, touch = 0) => {
        vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua);
        Object.defineProperty(window.navigator, 'maxTouchPoints', { value: touch, configurable: true });
    };
    const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/155.0 Safari/537.36';
    const PIXEL = 'Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro) AppleWebKit/537.36 Chrome/155.0 Mobile Safari/537.36';
    const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';

    test('a desktop starts with everything full; a phone (or a tablet) with every saving on', () => {
        userAgent(DESKTOP);
        expect(readPerformance()).toEqual({ reverb: 'full', sharedReverb: false });
        expect(isMobile()).toBe(false);
        userAgent(PIXEL, 5);
        expect(isMobile()).toBe(true);
        expect(readPerformance()).toEqual({ reverb: 'light', sharedReverb: true });
        userAgent(IPAD_DESKTOP, 5);
        expect(isMobile()).toBe(true);
        userAgent(IPAD_DESKTOP, 0);
        expect(isMobile()).toBe(false);
    });

    test('a choice made on a phone is kept, including turning a saving off', () => {
        userAgent(PIXEL, 5);
        expect(writePerformance({ reverb: 'full' })).toBe(true);
        expect(readPerformance()).toEqual({ reverb: 'full', sharedReverb: true });
        writePerformance({ sharedReverb: false });
        expect(readPerformance()).toEqual({ reverb: 'full', sharedReverb: false });
    });

    test('read back what was written, drop what is invalid', () => {
        userAgent(DESKTOP);
        writePerformance({ reverb: 'light', sharedReverb: true });
        expect(readPerformance()).toEqual({ reverb: 'light', sharedReverb: true });
        window.localStorage.setItem(PERFORMANCE_KEY, JSON.stringify({ reverb: 'huge', sharedReverb: 'yes' }));
        expect(readPerformance()).toEqual({ reverb: 'full', sharedReverb: false });
        window.localStorage.setItem(PERFORMANCE_KEY, '{nope');
        expect(readPerformance().reverb).toBe('full');
    });

    test('the buffer: lowest latency on a desktop, 100 ms on a phone until chosen, and a choice sticks', async () => {
        // (the module makes the page's AudioContext when it loads)
        vi.stubGlobal('AudioContext', class {});
        window.AudioContext = class {};
        const { storedBufferSeconds, storeBufferSeconds } = await import('../audio/context');
        userAgent(DESKTOP);
        expect(storedBufferSeconds()).toBeNull();
        userAgent(PIXEL, 5);
        expect(storedBufferSeconds()).toBe(0.1);
        storeBufferSeconds(null);
        expect(storedBufferSeconds()).toBeNull();
        storeBufferSeconds(0.2);
        expect(storedBufferSeconds()).toBe(0.2);
    });
});
