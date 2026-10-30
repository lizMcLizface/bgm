import { pushLevel, glidePush, PUSH_RATE, applyPush, pushTempo, pushEnergy, pushTone, pushLabel, pushActive, defaultPush } from './push';
import { defaultSettings, sanitizeSettings } from '../settings';
import { sequencerStages, stageForBar } from '../sequencer';

const program = (patch) => ({ level: 0, program: { ...defaultPush().program, mode: 'intervals', low: -0.5, high: 0.8, lowSeconds: 40, highSeconds: 30, rampSeconds: 10, ...patch } });

test('the level is the slider\'s with no program, and a program follows music time', () => {
    expect(pushLevel({ level: 0.4, program: { mode: 'off' } }, 500)).toBe(0.4);
    expect(pushLevel(undefined, 10)).toBe(0);
    const p = program({});
    expect(pushLevel(p, 0)).toBe(-0.5);
    expect(pushLevel(p, 39)).toBe(-0.5);
    // a steady (linear) ramp up over ten seconds, the high held, a steady ramp down, then the cycle again
    expect(pushLevel(p, 45)).toBeCloseTo(0.15, 6);
    expect(pushLevel(p, 50)).toBeCloseTo(0.8, 6);
    expect(pushLevel(p, 79)).toBeCloseTo(0.8, 6);
    expect(pushLevel(p, 85)).toBeCloseTo(0.15, 6);
    expect(pushLevel(p, 90)).toBeCloseTo(-0.5, 6);
    expect(pushLevel(p, 90 + 40 + 5)).toBeCloseTo(pushLevel(p, 45), 6);
    // no ramp: a switch
    expect(pushLevel(program({ rampSeconds: 0 }), 40)).toBe(0.8);
    expect(pushLevel(program({ rampSeconds: 0 }), 70)).toBe(-0.5);
});

test('a ramp program climbs steadily from low to high over its minutes and then holds', () => {
    const p = program({ mode: 'ramp', minutes: 4 });
    expect(pushLevel(p, 0)).toBe(-0.5);
    expect(pushLevel(p, 120)).toBeCloseTo(0.15, 6);
    expect(pushLevel(p, 240)).toBe(0.8);
    expect(pushLevel(p, 9999)).toBe(0.8);
});

test('applyPush leaves level 0 alone, never mutates, and goes the way the level does', () => {
    const settings = { ...defaultSettings(), leadActivity: 0.5, leadDensity: 0.3, padWeights: { sustain: 60, pulse: 20, arpeggio: 20, sequence: 0, rolled: 0, stacked: 0 }, bassWeights: { whole: 50, half: 50, walking: 0, drive: 0 },
        drums: { style: 'lofi', activity: 0.5, variation: 0.4, sprinkle: 0.1, kit: 'felt' } };
    const before = structuredClone(settings);
    expect(applyPush(settings, 0)).toBe(settings);
    const calm = applyPush(settings, -1), hard = applyPush(settings, 1);
    expect(settings).toEqual(before);
    expect(hard.leadActivity).toBeGreaterThan(settings.leadActivity); expect(calm.leadActivity).toBeLessThan(settings.leadActivity);
    expect(hard.leadDensity).toBeGreaterThan(settings.leadDensity); expect(calm.leadDensity).toBeLessThan(settings.leadDensity);
    expect(hard.drums.activity).toBeGreaterThan(calm.drums.activity);
    expect(hard.drums.style).toBe('drive'); expect(calm.drums.style).toBe('heartbeat');
    expect(hard.padWeights.sustain).toBeLessThan(settings.padWeights.sustain); expect(calm.padWeights.sustain).toBeGreaterThan(settings.padWeights.sustain);
    expect(hard.bassWeights.drive).toBeGreaterThan(40); expect(calm.bassWeights.whole).toBeGreaterThan(settings.bassWeights.whole);
    expect(hard.dynamics.level).toBeGreaterThan(calm.dynamics.level);
    // a middling push does not switch the drum style yet
    expect(applyPush(settings, 0.3).drums.style).toBe('lofi');
});

test('the sequencer plays its Drop at the top and its Breakdown at the bottom, and a middling push leaves the stage alone', () => {
    const seq = { on: true, arrangement: 'warehouse-shift', slots: [1, 2], pump: 0.5, variation: 0.4, fills: false };
    const s = { ...defaultSettings(), sequencer: seq };
    expect(stageForBar(applyPush(s, 1).sequencer, { slotIndex: 0, bar: 0 })).toBe(6);
    expect(stageForBar(applyPush(s, -1).sequencer, { slotIndex: 0, bar: 0 })).toBe(4);
    expect(stageForBar(applyPush(s, 0.5).sequencer, { slotIndex: 0, bar: 0 })).toBe(1);
    expect(applyPush(s, 1).sequencer.pump).toBeGreaterThan(seq.pump);
    expect(seq.forceStage).toBeUndefined();
    expect(sequencerStages(applyPush(s, 1).sequencer)).toHaveLength(8);
});

test('tempo, energy and tone go with the level, and the labels name it', () => {
    expect(pushTempo(0)).toBe(1); expect(pushTempo(1)).toBeCloseTo(1.15, 6); expect(pushTempo(-1)).toBeCloseTo(0.85, 6);
    expect(pushEnergy(0.8)).toBe(1); expect(pushEnergy(-1)).toBeCloseTo(0.3, 6);
    expect(pushTone(20000, 0.5)).toBe(20000); expect(pushTone(20000, -1)).toBeLessThan(7000); expect(pushTone(2000, -1)).toBe(2000);
    expect(pushLabel(-1)).toBe('Very calm'); expect(pushLabel(0)).toBe('As made'); expect(pushLabel(1)).toBe('Overdrive');
    expect(pushActive({ level: 0, program: { mode: 'off' } })).toBe(false); expect(pushActive(program({}))).toBe(true); expect(pushActive({ level: 0.2, program: { mode: 'off' } })).toBe(true);
});

test('the setting survives sanitizing, and bad values are put right', () => {
    const clean = sanitizeSettings({ push: program({ mode: 'ramp', minutes: 9999, low: -4 }) });
    expect(clean.push.program).toMatchObject({ mode: 'ramp', minutes: 120, low: -1 });
    expect(sanitizeSettings({ push: { level: 'x', program: { mode: 'nope' } } }).push).toEqual(defaultPush());
    expect(defaultSettings().push).toEqual(defaultPush());
});

test('intensity travels in a share link, and an old link plays the preset as made', async () => {
    const { encodeSettings, decodeSettings } = await import('../settings');
    const settings = { ...defaultSettings(), push: program({ mode: 'ramp', minutes: 12, low: -0.4, high: 0.95, lowSeconds: 50, highSeconds: 20, rampSeconds: 7 }) };
    const back = decodeSettings(encodeSettings(settings));
    expect(back.push.program).toMatchObject({ mode: 'ramp', minutes: 12, low: -0.4, high: 0.95, lowSeconds: 50, highSeconds: 20, rampSeconds: 7 });
    expect(decodeSettings(encodeSettings(defaultSettings())).push).toEqual(defaultPush());
});

test('a manual change glides: a step a bar from the level before, never a jump, and a program is not slowed', () => {
    const manual = (level) => ({ level, program: { mode: 'off' } });
    expect(glidePush(manual(-1), undefined, -1, 2)).toBe(-1);
    // 2 s of music moves the level by 2 * PUSH_RATE
    expect(glidePush(manual(-1), 1, -1, 2)).toBeCloseTo(1 - 2 * PUSH_RATE, 6);
    expect(glidePush(manual(1), -1, 1, 2)).toBeCloseTo(-1 + 2 * PUSH_RATE, 6);
    expect(glidePush(manual(0.5), 0.45, 0.5, 2)).toBe(0.5);
    // from +1 to -1 takes the 25 seconds the rate says, through 0
    let level = 1, seconds = 0;
    while (level > -1) { level = glidePush(manual(-1), level, -1, 1.5); seconds += 1.5; }
    expect(seconds).toBeGreaterThan(24); expect(seconds).toBeLessThan(28);
    expect(glidePush(program({}), 1, -0.5, 2)).toBe(-0.5);
});
