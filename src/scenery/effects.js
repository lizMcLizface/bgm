// Sky, night and spark effects: aurora, shooting stars, the Milky Way and rainbows (behind
// the land, added with the sun and stars), morning mist in the valleys, fireflies (in front
// of the land) and embers rising from flames. They draw from
// sc.frng, a stream of their own, so terrain and clouds never move when they change.
import { hex } from './lighting.js';
import { bayer, clamp, fbm2, hash, noise1, smoothstep } from './noise.js';
import { REFLECT, VEIL } from './scene.js';

const AURORA = new Set(['lake', 'hills', 'woodland', 'grassland', 'farmland', 'alpine', 'tundra', 'camp']);
const NO_MILKY_WAY = new Set(['industrial', 'synth']);
const NO_RAINBOW = new Set(['synth', 'planet']);
const MIST = new Set(['lake', 'hills', 'woodland', 'grassland', 'farmland', 'river', 'alpine', 'swamp', 'camp', 'jungle', 'ruins', 'harbour', 'savanna', 'village', 'garden']);
const FIREFLIES = new Set(['grassland', 'farmland', 'woodland', 'river', 'swamp', 'camp', 'jungle']);

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

// Which sky gradient level (1..8) each slot is, 0 for anything that is not plain sky.
function skyLevels(sc) {
    return Uint8Array.from(sc.defs, d => (d?.k === 'sky' ? 1 + Math.round(d.v * 7) : 0));
}
const SKY_LEVELS = 8;
const perLevel = (sc, def) => Array.from({ length: SKY_LEVELS }, (_, k) => sc.slot({ k: 'skymix', v: k / (SKY_LEVELS - 1), ...def }));

// The Milky Way on clear dark nights: a broad, clumpy band of glow tilted across the sky,
// a dark dust lane wandering down its middle, a brighter core, crowded with faint stars.
// It fades into the murk toward the horizon. Not every place gets it (city glow, a seed).
function milkyWay(sc, rng) {
    if (!rng.chance(0.7)) return;
    const { W, U } = sc, hz = sc.horizon, seed = rng.int(1, 1e6);
    const px = W * rng.range(0.2, 0.8), py = hz * rng.range(0.15, 0.45), th = (rng.chance(0.5) ? 1 : -1) * rng.range(0.85, 1.35);
    const dx = Math.cos(th), dy = Math.sin(th), w = U * rng.range(0.09, 0.13), core = rng.range(-0.6, 0.6) * U;
    const glow = [['#8e98cc', 0.1], ['#aeb2dc', 0.17], ['#d8d2e4', 0.27]].map(([c, a]) => perLevel(sc, { c: hex(c), a, n: 1 }));
    const lv = new Uint8Array(W * hz), stars = [];
    const density = (x, y) => {
        const rx = x - px, ry = y - py, s = rx * dx + ry * dy, d = -rx * dy + ry * dx;
        const ww = w * (0.8 + 0.4 * Math.exp(-(((s - core) / U) ** 2)));
        let v = Math.exp(-((d / ww) ** 2) * 2) * (0.45 + 0.75 * fbm2(s * 0.035, d * 0.06, seed, 3));
        const d0 = (noise1(s * 0.02, seed + 1) - 0.5) * ww * 0.5, lane = Math.exp(-(((d - d0) / (ww * 0.16)) ** 2));
        v *= 1 - 0.8 * lane * smoothstep(0.3, 0.6, noise1(s * 0.012, seed + 2));
        return v * (0.55 + 0.7 * Math.exp(-(((s - core) / (U * 0.5)) ** 2))) * smoothstep(hz, hz * 0.65, y);
    };
    for (let y = 0; y < hz; y++) for (let x = 0; x < W; x++) {
        lv[y * W + x] = clamp(Math.floor(density(x, y) * 3.2 + (bayer(x, y) - 0.5) * 0.9), 0, 3);
    }
    // Stars scattered through the band, thickest where it glows brightest.
    const tone = [0.35, 0.6, 1].map(v => sc.slot({ k: 'star', v }));
    for (let i = 0; i < 1600 && stars.length < 260; i++) {
        const x = rng.int(0, W - 1), y = rng.int(0, hz - 1);
        if (rng() < density(x, y) * 0.9) stars.push({ i: y * W + x, s: tone[rng() < 0.1 ? 2 : rng() < 0.35 ? 1 : 0] });
    }
    let sky = null, bg = null;
    sc.addFn((f, t, L) => {
        if (L.stars < 0.3) return;
        sky ||= skyLevels(sc);
        if (!bg) { bg = Uint8Array.from(sky, v => (v ? 1 : 0)); for (const row of glow) for (const s of row) bg[s] = 1; }
        for (let i = 0; i < lv.length; i++) {
            const k = sky[f[i]];
            if (k && lv[i]) f[i] = glow[lv[i] - 1][k - 1];
        }
        stars.forEach((st, j) => { if (bg[f[st.i]] && hash(j, Math.floor(t * 1.7 + j * 0.3), seed) > 0.08) f[st.i] = st.s; });
    });
}

// A rainbow after rain: opposite the sun while it is still low, when the showers have
// moved on and the light breaks through. Patchy where the rain was thin, a faint
// secondary bow outside it with the colours reversed. Fades a couple of minutes after.
const BOW = ['#ff4a3c', '#ff9c3a', '#ffe86a', '#5ad46a', '#4a8cff', '#8a5ce0'];

function rainbow(sc, rng) {
    const { W, U } = sc, hz = sc.horizon, seed = rng.int(1, 1e6);
    const main = BOW.map(c => [0.24, 0.46].map(a => perLevel(sc, { c: hex(c), a }))), outer = BOW.map(c => perLevel(sc, { c: hex(c), a: 0.18 }));
    let sky = null;
    const ring = (f, cx, cy, r1, bw, inten, vis, draw) => {
        const r0 = r1 - bw;
        for (let y = Math.max(0, Math.floor(cy - r1)); y < Math.min(hz, cy + r1); y++) {
            const ry = y - cy, xo = Math.sqrt(Math.max(0, r1 * r1 - ry * ry)), xi = Math.abs(ry) < r0 ? Math.sqrt(r0 * r0 - ry * ry) : 0;
            for (const [a, b] of [[cx - xo, cx - xi], [cx + xi, cx + xo]]) for (let x = Math.max(0, Math.ceil(a)); x <= Math.min(W - 1, b); x++) {
                const i = y * W + x, k = sky[f[i]];
                if (!k) continue;
                const rx = x - cx, d = Math.hypot(rx, ry), band = clamp(Math.floor((r1 - d) / bw * 6), 0, 5);
                draw(f, i, band, k - 1, inten * vis(Math.atan2(-ry, rx)) * 2 + bayer(x, y) - 0.5);
            }
        }
    };
    sc.addFn((f, t, L) => {
        const wx = sc.wx;
        if (!wx || L.day <= 0) return;
        const recent = 1 - smoothstep(30, 170, t - wx.wetAt);
        const inten = recent * smoothstep(0.02, 0.14, L.sunElev) * (1 - smoothstep(0.5, 0.72, L.sunElev)) * clamp(1 - L.veil * 1.3);
        if (inten < 0.04) return;
        sky ||= skyLevels(sc);
        // Where the bow is broken: different for every shower.
        const ev = Math.floor(wx.wetAt) % 977;
        const vis = a => smoothstep(0.22, 0.55, noise1(a * 2.4 + ev * 3.7, seed));
        // Big, standing higher the lower the sun; where it stands across the view differs each time.
        const R = U * 0.85, cx = W * (0.25 + 0.5 * hash(ev, 1, seed)), cy = hz * (0.12 + 0.6 * L.sunElev) + R, bw = Math.max(7, Math.round(U * 0.045));
        ring(f, cx, cy, R * 1.3, bw * 1.4, inten, vis, (f, i, b, k, e) => { if (e >= 1.1) f[i] = outer[5 - b][k]; });
        ring(f, cx, cy, R, bw, inten, vis, (f, i, b, k, e) => { if (e >= 0.5) f[i] = main[b][e >= 1.5 ? 1 : 0][k]; });
    });
}

export function skyEffects(sc) {
    const rng = sc.frng;
    if (!rng) return;
    if (AURORA.has(sc.biome)) aurora(sc, rng);
    if (sc.biome !== 'industrial') shootingStars(sc, rng);
    if (!NO_MILKY_WAY.has(sc.biome)) milkyWay(sc, rng);
    if (!NO_RAINBOW.has(sc.biome)) rainbow(sc, rng);
}

// Mist lying in the low ground at dawn: wisps drifting slowly along the valley floor and
// over distant water, burning off as the sun climbs. Things close by stand clear of it.
// It uses the veil levels the fog weather uses, so it stays translucent; when the weather
// brings its own veil (fog, rain) that wins.
export function valleyMist(sc) {
    const rng = sc.frng;
    if (!rng || !MIST.has(sc.biome) || !rng.chance(0.75)) return;
    const { W, H, U } = sc, hz = sc.horizon, seed = rng.int(1, 1e6), bw = W * 2;
    const y0 = Math.max(0, Math.round(hz - U * 0.05)), y1 = Math.min(H, Math.round(hz + (H - hz) * rng.range(0.3, 0.5)));
    // A few flat banks at different depths, each thick in places and torn open in others.
    const dens = new Uint8Array(bw * (y1 - y0)), banks = Array.from({ length: rng.int(3, 5) }, (_, k, n) => ({
        y: y0 + (y1 - y0) * (0.08 + 0.75 * (k + rng.range(0, 0.6)) / 4), th: rng.range(1.5, 4) * (1 + k * 0.35), s: rng.int(1, 1e6),
    }));
    for (const b of banks) for (let x = 0; x < bw; x++) {
        const cover = smoothstep(0.38, 0.62, fbm2(x * 0.01, b.y * 0.1, b.s, 3, Math.round(bw * 0.01)));
        if (cover <= 0) continue;
        const yc = b.y + (fbm2(x * 0.02, 0, b.s + 1, 2, Math.round(bw * 0.02)) - 0.5) * b.th * 2, th = b.th * (0.5 + cover);
        for (let y = Math.max(y0, Math.floor(yc - th * 2.5)); y < Math.min(y1, yc + th * 1.5); y++) {
            // Flat on top where it lies against the air above, a soft skirt below.
            const u = (y - yc) / th, v = cover * (u < 0 ? Math.exp(-u * u * 0.8) : Math.exp(-u * u * 1.6));
            const o = (y - y0) * bw + x;
            dens[o] = Math.max(dens[o], Math.round(clamp(v * 1.3) * 255));
        }
    }
    // The colour of the sky just above the horizon, a little paler: it glows with the dawn.
    const veil = { def: { k: 'skymix', v: 1, c: [250, 250, 255], a: 0.25 }, amounts: [0.4, 0.75] };
    let inten = 0, near = null;
    sc.lightHooks.push(L => {
        if (sc.veil === veil) sc.veil = null;
        const S = sc.S, morning = L.sunX < 0 ? 1 : 0;
        inten = morning * smoothstep(-0.25, -0.02, L.sunElev) * (1 - smoothstep(0.18, 0.45, L.sunElev)) * clamp(0.6 + 0.4 * Math.max(S.autumn, S.fresh) - 0.5 * S.dry);
        if (sc.veil || L.fog > 0.3) inten = 0;
        if (inten > 0.03) sc.veil = veil;
    });
    sc.addFn((f, t) => {
        if (inten <= 0.03) return;
        // How far off each slot is: the near foreground (d ~ 0) stays clear.
        near ||= Float32Array.from(sc.defs, d => (!d ? 0 : d.k === 'sky' ? 0.5 : smoothstep(0.02, 0.14, d.d ?? 0)));
        const off = ((Math.floor(t * 1.5) % bw) + bw) % bw;
        for (let y = y0; y < y1; y++) {
            const row = (y - y0) * bw, o = y * W;
            for (let x = 0; x < W; x++) {
                let sx = x + off;
                if (sx >= bw) sx -= bw;
                const v = dens[row + sx];
                if (!v) continue;
                const cur = f[o + x];
                if (cur >= VEIL) continue;
                const m = (v / 255) * inten * near[cur % REFLECT] * 2.6 + (bayer(x, y) - 0.5) * 0.6;
                if (m >= 0.5) f[o + x] = cur + (m >= 1.5 ? 2 : 1) * VEIL;
            }
        }
    });
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
