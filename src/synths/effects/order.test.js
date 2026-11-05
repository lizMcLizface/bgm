import { UNITS, BASE_UNITS, TAIL_UNITS, ORDER_COUNT, DEFAULT_CHAIN, orderFromCode, codeFromOrder, moveUnit, stagesFor, cleanOrder, chainUnits, maskFromUnits, addUnit } from './order';

const OLD = UNITS.slice(0, 7);
// the default order: the movable units, with the ones that cannot be moved just ahead of the limiter
const DEFAULT = [...BASE_UNITS.slice(0, -1), ...TAIL_UNITS, 'limiter'];

test('code 0 is the default order and every code round-trips', () => {
    expect(orderFromCode(0)).toEqual(DEFAULT);
    for (let code = 0; code < ORDER_COUNT; code += 99999989) expect(codeFromOrder(orderFromCode(code))).toBe(code);
    expect(codeFromOrder([...BASE_UNITS].reverse())).toBe(ORDER_COUNT - 1);
    // tape, shimmer and freeze follow the others whatever the code, and an order with them in it codes the same as without
    expect(codeFromOrder(orderFromCode(12345))).toBe(12345);expect(orderFromCode(12345).filter((u) => TAIL_UNITS.includes(u))).toEqual(TAIL_UNITS);
    expect(Number.isSafeInteger(ORDER_COUNT)).toBe(true);
});

test('moving a unit keeps the others in order', () => {
    expect(moveUnit(DEFAULT, 'chorus', 0).slice(0, 3)).toEqual(['chorus', 'saturation', 'eq']);
    expect(moveUnit(DEFAULT, 'space', 2).slice(0, 4)).toEqual(['saturation', 'eq', 'space', 'phaser']);
    expect(cleanOrder(['x'])).toEqual(DEFAULT);
});

test('the chain mask lists the units in the chain; the default is the original seven', () => {
    expect(chainUnits(DEFAULT_CHAIN)).toEqual(OLD);
    expect(maskFromUnits(['filter', 'limiter'])).toBe((1 << 7) | (1 << 13));
    expect(chainUnits(maskFromUnits(['eq', 'pitch']))).toEqual(['eq', 'pitch']);
});

test('an added unit lands beside the one it usually follows', () => {
    const at = (unit) => addUnit(DEFAULT, unit);
    expect(at('filter').indexOf('filter')).toBe(0);
    expect(at('crusher').indexOf('crusher')).toBe(at('crusher').indexOf('saturation') + 1);
    expect(at('tremolo').indexOf('tremolo')).toBe(at('tremolo').indexOf('chorus') + 1);
    expect(at('limiter').at(-1)).toBe('limiter');
});

test('the default order is one inserts instance, then the compressor and the space unit', () => {
    expect(stagesFor(UNITS, OLD)).toEqual([{ kind: 'inserts', units: ['saturation', 'eq', 'phaser', 'flanger', 'chorus'] }, { kind: 'compressor' }, { kind: 'space' }]);
});

test('units out of the chain are skipped, and an effect out of order gets its own inserts instance', () => {
    expect(stagesFor(['chorus', 'saturation', 'eq', 'phaser', 'flanger', 'compressor', 'space'], OLD)).toEqual([
        { kind: 'inserts', units: ['chorus'] }, { kind: 'inserts', units: ['saturation', 'eq', 'phaser', 'flanger'] }, { kind: 'compressor' }, { kind: 'space' }]);
    expect(stagesFor(['saturation', 'compressor', 'eq', 'phaser', 'space', 'flanger', 'chorus'], ['saturation', 'eq', 'space', 'chorus'])).toEqual([
        { kind: 'inserts', units: ['saturation', 'eq'] }, { kind: 'space' }, { kind: 'inserts', units: ['chorus'] }]);
    expect(stagesFor(['filter', 'saturation'], ['filter', 'saturation'])).toEqual([{ kind: 'filter' }, { kind: 'inserts', units: ['saturation'] }]);
});

test('the reverb can come before the delay, each on a stage of its own', () => {
    expect(stagesFor(['space'], ['space'])).toEqual([{ kind: 'space' }]);
    expect(stagesFor(['saturation', 'space'], ['saturation', 'space'], true)).toEqual([{ kind: 'inserts', units: ['saturation'] }, { kind: 'reverb' }, { kind: 'delay' }]);
});
