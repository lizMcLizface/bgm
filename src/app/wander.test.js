import { defaultWander, wanderPeriod, wanderPhase, instrumentWander, wanders, RoleWander, WANDER_ROLES, WANDER_LIMITS } from './engine/wander';
import { TOUR_STEPS } from './tourSteps';
import { defaultSettings, sanitizeSettings, encodeSettings, decodeSettings, decodeShare } from './settings';

test('every voice and kind drifts on its own period and phase, the same every time', () => {
    const periods = new Set();
    const phases = new Set();
    WANDER_ROLES.forEach((role) => ['pan', 'volume', 'filter', 'pitch'].forEach((kind) => {
        const period = wanderPeriod(60, role, kind);
        expect(period).toBeGreaterThanOrEqual(60 * 0.85);
        expect(period).toBeLessThanOrEqual(60 * 1.15);
        expect(wanderPeriod(60, role, kind)).toBe(period);
        expect(wanderPhase(role, kind)).toBeGreaterThanOrEqual(0);
        expect(wanderPhase(role, kind)).toBeLessThan(1);
        periods.add(period.toFixed(3));
        phases.add(wanderPhase(role, kind).toFixed(3));
    }));
    expect(periods.size).toBe(20);
    expect(phases.size).toBe(20);
});

test('only the voices switched on wander; the instrument gets cents of cutoff and pitch', () => {
    const wander = { ...defaultWander(), filter: 0.5, pitch: 7 };
    expect(wanders(wander, 'lead')).toBe(true);
    expect(wanders(wander, 'bass')).toBe(false);
    const lead = instrumentWander(wander, 'lead', 12);
    expect([lead.filter, lead.pitch, lead.offset]).toEqual([600, 7, 12]);
    const bass = instrumentWander(wander, 'bass');
    expect([bass.filter, bass.pitch]).toEqual([0, 0]);
});

// A context that records what is set on its params.
function fakeContext() {
    const param = () => ({ value: 0 });
    const node = (extra = {}) => ({ connect() {}, disconnect() {}, ...extra });
    return {
        currentTime: 0,
        createGain: () => node({ gain: { value: 1 } }),
        createConstantSource: () => node({ start() {}, stop() {}, offset: param() }),
        createChannelSplitter: () => node(),
        createChannelMerger: () => node(),
        createWaveShaper: () => node(),
        createPeriodicWave: () => ({}),
        createOscillator: () => node({ start() {}, stop() {}, setPeriodicWave() {}, frequency: param() }),
    };
}

test('a role wander centres its pan in the range and ranges over its width; off, it is a pass-through', () => {
    const wander = { ...defaultWander(), pan: { min: -0.2, max: 0.8 }, volume: 0.3 };
    const rw = new RoleWander(fakeContext(), 'lead', { smooth: false });
    rw.apply(wander);
    expect(rw.panCentre.offset.value).toBeCloseTo(0.3);
    expect(rw.panLfo.depth.gain.value).toBeCloseTo(0.5);
    expect(rw.volumeLfo.depth.gain.value).toBeCloseTo(0.3);
    rw.apply({ ...wander, voices: { ...wander.voices, lead: false } });
    expect([rw.panCentre.offset.value, rw.panLfo.depth.gain.value, rw.volumeLfo.depth.gain.value]).toEqual([0, 0, 0]);
});

test('wander settings: validated, pan ends put in order, carried in links', () => {
    const d = defaultSettings();
    expect(sanitizeSettings({ wander: { period: 5000, pan: { min: 0.5, max: -0.5 }, volume: 9, filter: -1, pitch: 'x', voices: { bass: true, lead: 'no' } } }).wander).toEqual({
        ...d.wander,
        period: WANDER_LIMITS.period.max,
        pan: { min: -0.5, max: 0.5 },
        volume: WANDER_LIMITS.volume.max,
        filter: 0,
        voices: { ...d.wander.voices, bass: true },
    });
    const settings = {
        ...d,
        seed: 3,
        wander: { period: 120, pan: { min: -0.9, max: 0.35 }, volume: 0.4, filter: 1.25, pitch: 12, voices: { lead: false, counter: true, pad: true, bass: true, perc: true } },
    };
    expect(decodeSettings(encodeSettings(settings)).wander).toEqual(settings.wander);
    // a link that changes nothing about it reads the defaults
    expect(decodeShare(encodeSettings({ ...d, seed: 3 })).settings.wander).toEqual(d.wander);
});

test('the tour has unique steps, each with text; its first and last are centred cards', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    TOUR_STEPS.forEach((s) => {
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.text.length).toBeGreaterThan(20);
    });
    expect([TOUR_STEPS[0].selector, TOUR_STEPS[TOUR_STEPS.length - 1].selector]).toEqual([null, null]);
});
