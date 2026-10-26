// Night and spark effects: aurora and shooting stars (behind the land, added with the sun
// and stars), fireflies (in front of it) and embers rising from flames. They draw from
// sc.frng, a stream of their own, so terrain and clouds never move when they change.
import { hex } from './lighting.js';
import { bayer, clamp, hash, noise1, smoothstep } from './noise.js';

const AURORA = new Set(['lake', 'hills', 'woodland', 'grassland', 'farmland', 'alpine', 'tundra', 'camp']);
const FIREFLIES = new Set(['grassland', 'farmland', 'woodland', 'river', 'swamp', 'camp']);

// Aurora on clear nights, likelier in the cold half of the year, swelling and fading over a
// few minutes. Each curtain is a folded ribbon: a sharp, bright lower edge that meanders
// across the sky, fine vertical rays crawling along it, green fading up through teal into
// violet. Stars and the moon still show through it.
const AURORA_HUES = [['#c6ffe0', '#7dffb6', '#3cf08e'], ['#5dffa8', '#38e08e', '#22b878'], ['#4fe0c8', '#36b4b0', '#2a8a9a'], ['#b08cff', '#8c6ae6', '#6a4cc0']];

function aurora(sc, rng) {
    const { W, U } = sc, hz = sc.horizon, ph = rng() * 6;
    // hue band (edge, green, teal, violet) x brightness (bright .. faint)
    const slots = AURORA_HUES.map(row => row.map((c, i) => sc.slot({ k: 'aur', c: hex(c), v: [0.85, 0.6, 0.38][i] })));
    const curtains = [
        { seed: rng.int(1, 1e6), base: rng.range(0.42, 0.58), h: 1, a: 1, drift: rng.range(0.8, 1.4) * (rng.chance(0.5) ? 1 : -1) },
        { seed: rng.int(1, 1e6), base: rng.range(0.22, 0.34), h: 0.7, a: 0.55, drift: rng.range(0.5, 1) * (rng.chance(0.5) ? 1 : -1) },
    ];
    let sky = null;
    sc.addFn((f, t, L) => {
        const S = sc.S, dark = smoothstep(0.35, 0.8, L.stars);
        if (dark <= 0) return;
        const cold = Math.max(S.snow, S.autumn * 0.7), wave = 0.5 + 0.5 * Math.sin(t * 0.05 + ph);
        const inten = dark * (0.3 + 0.7 * cold) * (0.35 + 0.65 * wave) * (1 - L.veil);
        if (inten < 0.08) return;
        sky ||= Uint8Array.from(sc.defs, d => (d?.k === 'sky' ? 1 : 0));
        for (const c of curtains) {
            const s = c.seed;
            for (let x = 0; x < W; x++) {
                // Where along the arc the curtain is lit at all; it comes and goes in patches.
                const en = smoothstep(0.3, 0.62, noise1(x * 0.009 + t * 0.006, s)), e = en * c.a * inten;
                if (e < 0.05) continue;
                // The lower edge folds: a slow meander plus tighter kinks that travel along it.
                const base = hz * c.base + (noise1(x * 0.011 + t * 0.012, s + 1) - 0.5) * hz * 0.32
                    + Math.sin(x * 0.045 + t * 0.09 * c.drift + noise1(x * 0.02, s + 2) * 4) * hz * 0.035;
                // Rays: thin vertical streaks of different brightness, drifting sideways.
                const ray = 0.35 + 0.65 * noise1(x * 0.32 + t * 0.5 * c.drift, s + 3) ** 1.5;
                const h = U * c.h * (0.16 + 0.24 * noise1(x * 0.05 + t * 0.03, s + 4)) * (0.6 + 0.4 * ray) * (0.3 + 0.7 * en);
                const y1 = Math.min(hz - 1, Math.round(base));
                for (let y = Math.max(0, Math.floor(base - h)); y <= y1; y++) {
                    const i = y * W + x;
                    if (!sky[f[i]]) continue;
                    const u = (base - y) / h;
                    // Sharp rise at the edge, a bright band just above it, then a long fade.
                    const prof = u < 0.05 ? 0.55 + u * 9 : Math.exp(-(u - 0.05) * 2.2);
                    const a = e * prof * (u < 0.1 ? 1 : ray ** (0.5 + u));
                    const lv = a * 3 + bayer(x, y) - 0.5;
                    if (lv < 0.5) continue;
                    const hue = u < 0.06 ? 0 : u < 0.4 ? 1 : u < 0.68 ? 2 : 3;
                    f[i] = slots[hue][lv >= 2.5 ? 0 : lv >= 1.5 ? 1 : 2];
                }
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
