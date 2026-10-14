// Random helpers over an injectable source, so arrangement is testable and
// (docs/DESIGN.md §6) reproducible per seed.

/** Seeded PRNG (mulberry32): returns () => float in [0, 1). */
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

export const chance = (rng, p) => rng() < p;

export const pick = (rng, list) => list[Math.floor(rng() * list.length)];

/** { a: 2, b: 1 } -> 'a' two times in three. */
export function weighted(rng, weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let r = rng() * total;
    for (const [key, w] of entries) {
        r -= w;
        if (r < 0) return key;
    }
    return entries[entries.length - 1][0];
}

/** Uniform in [-amount, amount]. */
export const jitter = (rng, amount) => (rng() * 2 - 1) * amount;

/** Normally distributed, mean 0, standard deviation `sd`, clamped to ±3 sd (Box-Muller). */
export function normal(rng, sd) {
    if (!sd) return 0;
    const u = Math.max(rng(), 1e-12);
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
    return Math.max(-3, Math.min(3, z)) * sd;
}
