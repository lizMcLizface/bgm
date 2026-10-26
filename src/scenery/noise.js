// Seeded randomness, value noise and ordered dithering for the pixel scenery.

export function makeRng(seed) {
    let a = seed >>> 0;
    const next = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (lo, hi) => lo + (hi - lo) * next();
    next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
    next.pick = arr => arr[Math.floor(next() * arr.length)];
    next.chance = p => next() < p;
    return next;
}

export function hash(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
    const t = clamp((v - a) / (b - a));
    return t * t * (3 - 2 * t);
};
const ease = t => t * t * (3 - 2 * t);
const wrap = (a, n) => ((a % n) + n) % n;

// `period` (in lattice cells) makes x wrap, so drifting layers tile seamlessly.
export function noise1(x, seed, period = 0) {
    const xi = Math.floor(x), f = ease(x - xi);
    const a = period ? wrap(xi, period) : xi, b = period ? wrap(xi + 1, period) : xi + 1;
    const ha = hash(a, 0, seed);
    return ha + (hash(b, 0, seed) - ha) * f;
}

export function noise2(x, y, seed, period = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = ease(x - xi), fy = ease(y - yi);
    const x0 = period ? wrap(xi, period) : xi, x1 = period ? wrap(xi + 1, period) : xi + 1;
    const a = hash(x0, yi, seed), b = hash(x1, yi, seed);
    const c = hash(x0, yi + 1, seed), d = hash(x1, yi + 1, seed);
    const top = a + (b - a) * fx;
    return top + (c + (d - c) * fx - top) * fy;
}

export function fbm1(x, seed, octaves = 4, period = 0) {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
        sum += amp * noise1(x * f, seed + o * 101, period * f);
        norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
}

export function fbm2(x, y, seed, octaves = 4, period = 0) {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
        sum += amp * noise2(x * f, y * f, seed + o * 101, period * f);
        norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// Quantise v in [0, 1] to `levels` steps, ordered-dithering the fractional part.
export function quant(v, levels, x, y) {
    const f = clamp(v) * (levels - 1);
    const i = Math.floor(f);
    return Math.min(levels - 1, i + (f - i > bayer(x, y) ? 1 : 0));
}
