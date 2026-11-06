// The order of the rack's effects. Fourteen units that can be put in any order, and three (tape, shimmer, freeze) that sit after them,
// ahead of a limiter that is last, so that every order code stored before they existed still reads the same; Delay and Reverb are one unit ("space") because they share one kernel
// (the effects bus: delay into reverb, with the dry signal). The instrument comes before the first unit and the output
// after the last. The order is stored as one number in the rack values ('master.order'): the unit order's position among
// all permutations (a factorial-base "Lehmer" code), 0 being the default order.
//
// Which units are in the chain at all is a second number, 'master.chain' (a bitmask over UNITS, unit 0 the lowest bit): a unit
// that is not in the chain is not wired and does not run, whatever its settings.

export const BASE_UNITS = ['saturation', 'eq', 'phaser', 'flanger', 'chorus', 'compressor', 'space', 'filter', 'tremolo', 'crusher', 'ring', 'pitch', 'width', 'limiter'];
/** Units that cannot be moved: they follow the others (tape, shimmer, freeze: the calmbgm synth's own stages, app/engine/voiceFx.js; and the z-plane filter). */
export const TAIL_UNITS = ['tape', 'shimmer', 'freeze', 'zplane'];
export const UNITS = [...BASE_UNITS, ...TAIL_UNITS];
const withTail = (base) => (base[base.length - 1] === 'limiter' ? [...base.slice(0, -1), ...TAIL_UNITS, 'limiter'] : [...base, ...TAIL_UNITS]);
export const INSERT_UNITS = ['saturation', 'eq', 'phaser', 'flanger', 'chorus'];
/** Units in the chain until the player removes them: everything the rack had before units could be added. */
export const DEFAULT_CHAIN = 0b1111111;
const FACTORIAL = [1];
for (let i = 1; i <= BASE_UNITS.length; i++) FACTORIAL.push(FACTORIAL[i - 1] * i);
export const ORDER_COUNT = FACTORIAL[BASE_UNITS.length];
export const CHAIN_MAX = 2 ** UNITS.length - 1;

export function orderFromCode(code) {
    let n = Math.max(0, Math.min(ORDER_COUNT - 1, Math.round(Number(code) || 0)));
    const pool = [...BASE_UNITS], order = [];
    for (let i = BASE_UNITS.length - 1; i >= 0; i--) {
        const at = Math.floor(n / FACTORIAL[i]);
        n %= FACTORIAL[i];
        order.push(pool.splice(at, 1)[0]);
    }
    return withTail(order);
}

/** The code of an order; the units that cannot be moved do not count. */
export function codeFromOrder(order) {
    const pool = [...BASE_UNITS];
    let code = 0;
    order.filter((u) => BASE_UNITS.includes(u)).forEach((unit, i) => {
        const at = pool.indexOf(unit);
        code += at * FACTORIAL[BASE_UNITS.length - 1 - i];
        pool.splice(at, 1);
    });
    return code;
}

/** A well-formed order (every unit once) from any array, else the default. */
export const cleanOrder = (order) => {
    if (!Array.isArray(order)) return withTail([...BASE_UNITS]);
    const base = order.filter((u) => BASE_UNITS.includes(u));
    return base.length === BASE_UNITS.length && BASE_UNITS.every((u) => base.includes(u)) ? withTail(base) : withTail([...BASE_UNITS]);
};

/** Moves one unit to a new position in the order. */
export function moveUnit(order, unit, to) {
    const next = order.filter((u) => u !== unit);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, unit);
    return next;
}

/** The units in the chain, from the bitmask. */
export const chainUnits = (mask = DEFAULT_CHAIN) => UNITS.filter((_, i) => (Math.round(Number(mask) || 0) >> i) & 1);
export const maskFromUnits = (units) => UNITS.reduce((m, u, i) => (units.includes(u) ? m | (1 << i) : m), 0);

/** Where a unit lands when it is added: beside the unit a player would expect it to follow (or at an end). */
const SLOT = { filter: { before: 'saturation' }, pitch: { before: 'saturation' }, crusher: { after: 'saturation' }, ring: { after: 'eq' }, tremolo: { after: 'chorus' }, width: { after: 'compressor' }, limiter: { end: true } };
export function addUnit(order, unit) {
    const slot = SLOT[unit];
    if (!slot || TAIL_UNITS.includes(unit)) return order;
    const without = order.filter((u) => u !== unit);
    if (slot.end) return [...without, unit];
    const at = without.indexOf(slot.before ?? slot.after);
    return moveUnit(order, unit, slot.before ? at : at + 1);
}

/**
 * The audio stages for the units in the chain, in order. The inserts kernel runs saturation, EQ, phaser, flanger and
 * chorus in one fixed order, so a run of consecutive insert effects that are already in that order shares one kernel
 * instance; any effect out of order, or cut off by another unit, starts another. The default order is one instance.
 * Returns [{ kind: 'inserts', units }, { kind: 'compressor' }, { kind: 'space' }, { kind: 'filter' }, ...].
 */
export function stagesFor(order, chain = UNITS, reverbFirst = false) {
    const stages = [];
    for (const unit of order) {
        if (!chain.includes(unit)) continue;
        // the delay and the reverb are one stage, or two when the reverb comes first (each on a bus of its own)
        if (unit === 'space' && reverbFirst) { stages.push({ kind: 'reverb' }, { kind: 'delay' }); continue; }
        if (!INSERT_UNITS.includes(unit)) { stages.push({ kind: unit }); continue; }
        const last = stages[stages.length - 1];
        if (last?.kind === 'inserts' && INSERT_UNITS.indexOf(last.units[last.units.length - 1]) < INSERT_UNITS.indexOf(unit)) last.units.push(unit);
        else stages.push({ kind: 'inserts', units: [unit] });
    }
    return stages;
}
