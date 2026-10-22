// How a scene plays (settings.dynamics), applied to the finished notes of a bar after the
// performance passes: `level` scales every velocity, `range` spreads or narrows them around a
// typical strength, so accents, section swells and phrase shapes grow or shrink with it.
// `attack` and `brightness` travel with each note: the Web Audio voices read them from the note's
// expression (engine/noteExpression.js), the Wasm voices from their patch (engine/wasmPreset.js).
export const DEFAULT_DYNAMICS = { level: 1, range: 1, attack: 0, brightness: 0 };
const REFERENCE = 0.62;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const dynamicsOf = (raw) => ({ ...DEFAULT_DYNAMICS, ...(raw ?? {}) });

/** Velocities, before note expression (which reads them). */
export function applyDynamics(events, raw) {
    const d = dynamicsOf(raw);
    if (d.level === 1 && d.range === 1) return events;
    // (never below 0.1: a wide range must not make a note inaudible)
    for (const e of events) e.velocity = clamp(d.level * (REFERENCE + (e.velocity - REFERENCE) * d.range), 0.1, 1);
    return events;
}

/** Attack and brightness on each pitched note's expression, after the expression passes. */
export function expressDynamics(events, raw) {
    const d = dynamicsOf(raw);
    if (!d.attack && !d.brightness) return events;
    for (const e of events) {
        if (e.role === 'perc') continue;
        const brightness = d.brightness * 1500 * (e.velocity - 0.6);
        e.expression = { ...(e.expression ?? {}), dynamicAttack: d.attack,
            brightnessCents: clamp((e.expression?.brightnessCents ?? 0) + brightness, -600, 600) };
    }
    return events;
}

/** A note's attack for its strength: softer notes up to 3× slower and at least 60 ms at full
 * `amount`, the strongest a little quicker. The Wasm kernel computes the same (synth-engine). */
export function dynamicAttack(attack, velocity, amount) {
    if (!(amount > 0)) return attack;
    const soft = clamp((0.68 - velocity) / 0.3, -0.5, 1);
    return Math.max(attack * 2 ** (amount * soft * 1.6), amount * Math.max(0, soft) * 0.06);
}
