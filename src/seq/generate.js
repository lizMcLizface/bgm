// Pattern generators for one row of steps (docs/SEQUENCER_DEVICE_PLAN.md, roadmap 2). They are pure: a row in, a row out, with an injectable
// random source. Their output is ordinary notes (0 off, 1 hit), so a generated row and a hand-drawn one are the same data.

/** A small seeded random source (mulberry32): the same seed gives the same row. */
export function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Bjorklund's algorithm: `pulses` hits spread as evenly as possible over `steps`, as an array of 0 and 1 (E(3,8) is x..x..x.). */
export function bjorklund(pulses, steps) {
    steps = Math.max(1, Math.round(steps));
    pulses = Math.min(steps, Math.max(0, Math.round(pulses)));
    if (!pulses) return Array(steps).fill(0);
    let a = Array.from({ length: pulses }, () => [1]), b = Array.from({ length: steps - pulses }, () => [0]);
    while (b.length > 1) {
        const n = Math.min(a.length, b.length);
        const joined = Array.from({ length: n }, (_, i) => [...a[i], ...b[i]]);
        const rest = a.length > b.length ? a.slice(n) : b.slice(n);
        a = joined; b = rest;
    }
    return [...a, ...b].flat();
}

/** A Euclidean rhythm of `pulses` in `steps`, rotated `rotation` steps later. */
export function euclid(pulses, steps, rotation = 0) {
    const base = bjorklund(pulses, steps), n = base.length, r = ((Math.round(rotation) % n) + n) % n;
    return base.map((_, i) => base[(i - r + n) % n]);
}

/** `cell` (a short row) repeated to fill `length` steps. */
export const tile = (cell, length) => Array.from({ length }, (_, i) => cell[i % cell.length]);

/** A random row: each step lit with chance `density` (0..1); steps on the beat (every fourth) are a little more likely, the off-beats a little less. */
export function randomRow(length, density, random = Math.random) {
    const d = Math.min(1, Math.max(0, density));
    return Array.from({ length }, (_, i) => (random() < (i % 4 === 0 ? Math.min(1, d * 1.25) : d * 0.9) ? 1 : 0));
}

/**
 * A variation of a row: with chance `amount` (0..1) a note is dropped or moved a step either way, and an empty step grows a note with a
 * chance that keeps the density about the same. Returns the new row; the row's length stays.
 */
export function mutateRow(row, amount, random = Math.random) {
    const a = Math.min(1, Math.max(0, amount)), n = row.length, out = row.map(() => 0);
    const lit = row.filter(Boolean).length, density = lit / Math.max(1, n);
    row.forEach((v, i) => {
        if (!v) return;
        const r = random();
        if (r >= a) out[i] = v;
        else if (r < a / 3) { /* dropped */ }
        else { const j = (i + (random() < 0.5 ? -1 : 1) + n) % n; out[j] = out[j] || v; }
    });
    row.forEach((v, i) => { if (!v && !out[i] && random() < a * density * 0.5) out[i] = 1; });
    return out;
}
