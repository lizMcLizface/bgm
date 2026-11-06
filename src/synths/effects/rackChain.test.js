import { RACK_PARAMS, rackPackets, cleanRack } from './params';
import { maskFromUnits, chainUnits, DEFAULT_CHAIN, orderFromCode, stagesFor } from './order';
import { unitsUsedBy, presetValues, syncedDelayMs, activeUnits, leanChain } from './rackParts';
import { RACK_PRESETS } from './params';

test('a unit that is not in the chain does not run, whatever its settings', () => {
    const loud = { ...cleanRack(), 'inserts.chorus': 0.5, 'effects.reverb': 0.4, 'compressor.enabled': 1 };
    const full = rackPackets(RACK_PARAMS.sanitize(loud));
    expect(full.inserts.chorus).toBe(0.5);
    expect(full.effects.reverb).toBe(0.4);
    expect(full.compressor.enabled).toBe(1);
    const trimmed = rackPackets(RACK_PARAMS.sanitize({ ...loud, 'master.chain': maskFromUnits(['saturation', 'eq']) }));
    expect(trimmed.inserts.chorus).toBe(0);
    expect(trimmed.effects.reverb).toBe(0);
    expect(trimmed.compressor.enabled).toBe(0);
});

test('the added units are off until they are put in the chain', () => {
    const extras = rackPackets(cleanRack()).extras;
    expect(Object.keys(extras).sort()).toEqual(['crusher', 'filter', 'freeze', 'limiter', 'pitch', 'ring', 'shimmer', 'tape', 'tremolo', 'width', 'zplane']);
    expect(Object.values(extras).every((e) => e.on === false)).toBe(true);
    const added = rackPackets(RACK_PARAMS.sanitize({ ...cleanRack(), 'master.chain': DEFAULT_CHAIN | (1 << 7) })).extras;
    expect(added.filter.on).toBe(true);
    expect(added.tremolo.on).toBe(false);
});

test('a preset brings in the units it uses and keeps the order and chain the player chose', () => {
    const drumGlue = RACK_PRESETS.find((p) => p.name === 'Drum glue');
    expect(unitsUsedBy(drumGlue.values)).toEqual(expect.arrayContaining(['saturation', 'compressor', 'space']));
    const mine = { ...cleanRack(), 'master.order': 1234, 'master.chain': maskFromUnits(['eq', 'filter']) };
    const applied = presetValues(drumGlue, mine);
    expect(applied['master.order']).toBe(1234);
    expect(chainUnits(applied['master.chain'])).toEqual(expect.arrayContaining(['eq', 'filter', 'saturation', 'compressor', 'space']));
});

test('a synced delay is a note length at the tempo', () => {
    expect(syncedDelayMs(1, 120)).toBe(500);
    expect(syncedDelayMs(2, 120)).toBe(250);
    expect(syncedDelayMs(3, 120)).toBe(375);
    expect(syncedDelayMs(5, 120)).toBeCloseTo(166.67, 1);
    expect(syncedDelayMs(0, 120)).toBe(0);
});

test('a unit counts as active only when it does something to the sound', () => {
    expect(activeUnits(cleanRack())).toEqual([]);
    // a phaser at 0% mix is in the chain but idle; turned up, it is active
    expect(activeUnits({ ...cleanRack(), 'inserts.phaser': 0 })).not.toContain('phaser');
    expect(activeUnits({ ...cleanRack(), 'inserts.phaser': 0.4, 'inserts.lowGain': 3, 'effects.reverb': 0.3, 'compressor.enabled': 1 })).toEqual(['eq', 'phaser', 'compressor', 'space']);
    expect(activeUnits({ ...cleanRack(), 'effects.reverb': 0.3, 'switch.reverb': 0 })).toEqual([]);                     // switched off is idle
    expect(activeUnits({ ...cleanRack(), 'master.chain': maskFromUnits(['tape', 'shimmer', 'freeze']), 'tape.wow': 0.2, 'freeze.mix': 0.5, 'shimmer.mix': 0 })).toEqual(['tape', 'freeze']);
    expect(activeUnits({ ...cleanRack(), 'master.chain': maskFromUnits(['crusher', 'ring']), 'crusher.mix': 0.3, 'crusher.bits': 8, 'ring.mix': 0 })).toEqual(['crusher']);
    expect(chainUnits(leanChain({ ...cleanRack(), 'inserts.chorus': 0.5 }))).toEqual(['chorus']);
});

test('tape, shimmer and freeze come into the chain last and cannot be moved', () => {
    const order = orderFromCode(0), at = (u) => order.indexOf(u);
    expect(at('tape')).toBeLessThan(at('shimmer'));expect(at('shimmer')).toBeLessThan(at('freeze'));expect(at('freeze')).toBeLessThan(at('limiter'));
    const stages = stagesFor(order, ['space', 'tape', 'freeze']).map((s) => s.kind);
    expect(stages).toEqual(['space', 'tape', 'freeze']);
});
