import { defaultWander, defaultAmbienceWander, AMBIENCE_WANDER_LIMITS, WalkPath, wanderPeriod, wanderPhase, instrumentWander, wanders, RoleWander, WANDER_ROLES, WANDER_LIMITS } from './engine/wander';
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
        wander: { period: 120, pan: { min: -0.9, max: 0.35 }, volume: 0.4, filter: 1.25, pitch: 12, voices: { lead: false, counter: true, pad: true, bass: true, perc: true }, mode: 'brownian' },
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

test('the random walk is deterministic, stays within -1..1 and is spread normally around the centre', () => {
    const a = new WalkPath(5, 120);
    const b = new WalkPath(5, 120);
    const values = Array.from({ length: 20000 }, (_, i) => a.valueAt(i * 2));
    expect(values.map((_, i) => b.valueAt(i * 2))).toEqual(values);
    expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(1);
    const mean = values.reduce((x, y) => x + y, 0) / values.length;
    const sd = Math.sqrt(values.reduce((x, y) => x + (y - mean) ** 2, 0) / values.length);
    expect(Math.abs(mean)).toBeLessThan(0.08);
    expect(sd).toBeGreaterThan(0.3);
    expect(sd).toBeLessThan(0.5);
    // about two thirds within one sd, and it does move
    const within = values.filter((v) => Math.abs(v - mean) <= sd).length / values.length;
    expect(within).toBeGreaterThan(0.6);
    expect(within).toBeLessThan(0.76);
    expect(new WalkPath(6, 120).valueAt(300)).not.toBe(a.valueAt(300));
});

test('ambience wander: validated and carried in links; the default is on, a link without it reads the default', () => {
    const d = defaultSettings();
    expect(d.ambienceWander).toEqual(defaultAmbienceWander());
    expect(sanitizeSettings({ ambienceWander: { mode: 'x', total: 9, layers: -1, period: 1 } }).ambienceWander).toEqual({
        ...d.ambienceWander,
        total: AMBIENCE_WANDER_LIMITS.total.max,
        layers: 0,
        period: AMBIENCE_WANDER_LIMITS.period.min,
    });
    const settings = { ...d, seed: 3, ambienceWander: { mode: 'sine', total: 0.25, layers: 0.5, period: 300 } };
    expect(decodeSettings(encodeSettings(settings)).ambienceWander).toEqual(settings.ambienceWander);
    expect(decodeShare(encodeSettings({ ...d, seed: 3 })).settings.ambienceWander).toEqual(d.ambienceWander);
});


test('room sends share pan/volume controls without new oscillators or waveshapers',()=>{
 const ctx=fakeContext(),rw=new RoleWander(ctx,'pad',{smooth:false}),osc=vi.spyOn(ctx,'createOscillator'),shape=vi.spyOn(ctx,'createWaveShaper'),volume=vi.spyOn(rw.volumeLfo.depth,'connect'),left=vi.spyOn(rw.balanceShapers[0],'connect'),sourceDispose=vi.spyOn(rw.volumeLfo,'dispose');
 const f=rw.createFollower();expect(osc).not.toHaveBeenCalled();expect(shape).not.toHaveBeenCalled();expect(volume).toHaveBeenCalledWith(f.input.gain);expect(left).toHaveBeenCalled();f.dispose();expect(sourceDispose).not.toHaveBeenCalled();expect(rw.followers.size).toBe(0);rw.dispose();expect(sourceDispose).toHaveBeenCalledTimes(1);expect(()=>rw.createFollower()).toThrow('disposed');
});
