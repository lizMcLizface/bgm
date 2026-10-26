// Night and spark effects: aurora and shooting stars (behind the land, added with the sun
// and stars), fireflies (in front of it) and embers rising from flames. They draw from
// sc.frng, a stream of their own, so terrain and clouds never move when they change.
import { hex } from './lighting.js';
import { bayer, clamp, hash, noise1, smoothstep } from './noise.js';

const AURORA = new Set(['lake', 'hills', 'woodland', 'grassland', 'farmland']);
const FIREFLIES = new Set(['grassland', 'farmland', 'woodland', 'river']);

// Curtains of light high in the sky on clear nights: likelier in the cold half of the year,
// they swell and fade over a couple of minutes.
function aurora(sc, rng) {
    const { W } = sc, hz = sc.horizon, seed = rng.int(1, 1e6), ph = rng() * 6;
    const slot = (c, v) => sc.slot({ k: 'aur', c: hex(c), v });
    const green = [slot('#5dffa8', 0.3), slot('#5dffa8', 0.55), slot('#8dffc4', 0.8)];
    const violet = [slot('#a07bff', 0.3), slot('#c08bff', 0.55)];
    sc.addFn((f, t, L) => {
        const S = sc.S, dark = smoothstep(0.35, 0.8, L.stars);
        if (dark <= 0) return;
        const cold = Math.max(S.snow, S.autumn * 0.7), wave = 0.5 + 0.5 * Math.sin(t * 0.05 + ph);
        const inten = dark * (0.3 + 0.7 * cold) * (0.35 + 0.65 * wave);
        if (inten < 0.08) return;
        for (let x = 0; x < W; x++) {
            const ray = clamp((noise1(x * 0.05 + t * 0.12, seed) - 0.25) * 1.8);
            if (ray <= 0) continue;
            const base = hz * 0.5 + (noise1(x * 0.012 + t * 0.03, seed + 1) - 0.5) * hz * 0.25;
            const h = hz * 0.42 * ray * inten;
            for (let y = Math.max(0, Math.floor(base - h)); y <= base; y++) {
                const u = (base - y) / h, a = (1 - u) ** 1.3 * (0.5 + 0.5 * inten);
                if (a <= bayer(x, y)) continue;
                f[y * W + x] = u > 0.7 ? violet[a > 0.4 ? 1 : 0] : green[a > 0.66 ? 2 : a > 0.33 ? 1 : 0];
            }
        }
    });
}

// A streak across the dark sky every so often.
function shootingStars(sc, rng) {
    const { W } = sc, hz = sc.horizon, seed = rng.int(1, 1e6);
    const trail = [1, 0.7, 0.45, 0.25].map(v => sc.slot({ k: 'star', v }));
    sc.addFn((f, t, L) => {
        if (L.stars < 0.45) return;
        const k = Math.floor(t / 9);
        if (hash(k, 5, seed) > 0.4) return;
        const dt = t - (k * 9 + hash(k, 6, seed) * 7.5);
        if (dt < 0 || dt > 0.8) return;
        const dir = hash(k, 9, seed) < 0.5 ? -1 : 1, vx = dir * 110, vy = 45 + hash(k, 10, seed) * 30;
        const x0 = W * (0.1 + 0.8 * hash(k, 7, seed)), y0 = hz * (0.05 + 0.4 * hash(k, 8, seed));
        for (let i = 0; i < 12; i++) {
            const d = dt - i * 0.012, x = Math.round(x0 + vx * d), y = Math.round(y0 + vy * d);
            if (d < 0 || x < 0 || x >= W || y < 0 || y >= hz) continue;
            f[y * W + x] = trail[Math.min(3, i >> 1)];
        }
    });
}

export function skyEffects(sc) {
    const rng = sc.frng;
    if (!rng) return;
    if (AURORA.has(sc.biome)) aurora(sc, rng);
    if (sc.biome !== 'industrial') shootingStars(sc, rng);
}

// Little blinking lights drifting low over the grass on warm evenings.
export function fireflies(sc) {
    const rng = sc.frng;
    if (!rng || !FIREFLIES.has(sc.biome)) return;
    const { W, H } = sc, hz = sc.horizon, core = sc.slot({ k: 'flame', c: hex('#e4ff72') }), glow = sc.slot({ k: 'flame', c: hex('#8fb83c') });
    const flies = Array.from({ length: 46 }, () => ({
        x: rng.range(0, W), y: rng.range(hz + 6, H - 8), sx: rng.range(0.2, 0.6), sy: rng.range(0.3, 0.8),
        ph: rng() * 6, bl: rng.range(0.5, 1.2), r: rng.range(3, 9),
    }));
    sc.addFn((f, t, L) => {
        const S = sc.S, warm = clamp(1 - Math.max(S.snow, S.autumn * 1.2)), n = Math.floor(flies.length * (1 - L.day) * warm * (1 - L.veil));
        for (let i = 0; i < n; i++) {
            const b = flies[i], pulse = Math.sin(t * b.bl * 2.4 + b.ph);
            if (pulse < 0.2) continue;
            const x = Math.round(((b.x + Math.sin(t * b.sx + b.ph) * b.r) % W + W) % W), y = Math.round(b.y + Math.cos(t * b.sy + b.ph * 2) * b.r * 0.5);
            if (y < 0 || y >= H) continue;
            f[y * W + x] = core;
            if (pulse > 0.75) {
                if (x > 0) f[y * W + x - 1] = glow;
                if (x < W - 1) f[y * W + x + 1] = glow;
            }
        }
    });
}

// Sparks lifting off flames, cooling from yellow to dull red as they rise.
export function embers(sc, sources) {
    const rng = sc.frng;
    if (!rng || !sources.length) return;
    const { W, H } = sc, cols = ['#ffd27a', '#ff8a2c', '#c8441c'].map(c => sc.slot({ k: 'flame', c: hex(c) }));
    const sparks = sources.flatMap(s => Array.from({ length: 14 }, () => ({ x: s.x, y: s.y - 6, ph: rng() * 6, v: rng.range(0.6, 1.1), p: rng() })));
    sc.addFn((f, t) => {
        for (const e of sparks) {
            const age = (t * 0.28 * e.v + e.p) % 1;
            const x = Math.round(e.x + Math.sin(age * 5 + e.ph) * 3 + age * 8), y = Math.round(e.y - age * 34 * e.v);
            if (x < 0 || y < 0 || x >= W || y >= H || bayer(x, y) < age * 0.6) continue;
            f[y * W + x] = cols[age < 0.35 ? 0 : age < 0.7 ? 1 : 2];
        }
    });
}
