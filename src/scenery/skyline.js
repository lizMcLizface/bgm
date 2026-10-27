// A city seen across the water from a distance: three ranks of towers that fade into the haze,
// lit windows that come on at dusk and flicker, red beacons on the tall ones, a far embankment with
// traffic crawling along it, and all of it mirrored in the water in front.
// `sc.look.neon` gives it the night-time look of a cyberpunk city lit in pink, purple and blue
// (the colours of the bisexual flag): pink light from the left edges of the towers, blue from the
// right, purple where they meet in the haze, and signs and windows in the same three.
import { Buf } from './scene.js';
import { hex, mix } from './lighting.js';
import { bayer, hash, lerp, noise1 } from './noise.js';
import { celestial, seedOf, sky, water } from './shapes.js';
import { LIGHTS, weather } from './biomes.js';

const Q = {
    glass: ['#0f1624', '#1a2438', '#2c3c58', '#4a6184'],
    concrete: ['#1a1a22', '#2a2a36', '#44445a', '#6a6a82'],
    stone: ['#2a2420', '#3e342c', '#5e5040', '#84735a'],
    harbour: ['#070b16', '#0c1424', '#142038', '#22344f'],
    harbourNeon: ['#0a0618', '#140c2c', '#241444', '#3a2060'],
};
const NEON = { pink: '#ff2f9a', purple: '#a45cff', blue: '#2f7bff', ice: '#cfe9ff' };

const pickWeighted = (rng, list) => {
    let r = rng() * list.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of list) if ((r -= w) < 0) return v;
    return list[0][0];
};

function city(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.6, 0.68)), neon = !!sc.look.neon;
    const C = c => hex(c), WARM = [LIGHTS.warm, LIGHTS.amber, LIGHTS.white, LIGHTS.cool];
    sc.climate = 'dry';
    if (neon) {
        // Night washes the sky toward a purple glow rising off the city.
        sc.relight = (L) => {
            const n = 1 - L.day;
            L.skyTop = mix(L.skyTop, C('#0c0830'), 0.55 * n);
            L.skyHor = mix(L.skyHor, C('#5a1a78'), 0.7 * n);
            L.haze = mix(L.haze, C('#4a1a70'), 0.6 * n);
        };
    }
    sky(sc);
    celestial(sc, rng, { count: neon ? 40 : 70 });
    weather(sc, hz);

    // Light spilling up from the city: pink on the left, purple between, blue on the right.
    if (neon) {
        const glow = [NEON.pink, NEON.purple, NEON.blue].map(c => sc.slot({ k: 'flame', c: C(c) }));
        const reach = U * 0.34;
        sc.addFn((f, t, L) => {
            if (L.lights < 0.05) return;
            const strength = L.lights * (1 - L.veil * 0.5);
            for (let y = Math.max(0, Math.round(hz - reach)); y < hz; y++) {
                const p = (hz - y) / reach, o = y * W;
                for (let x = 0; x < W; x++) {
                    const u = x / W, side = u < 0.34 ? 0 : u > 0.66 ? 2 : 1;
                    // the three overlap a little where they meet
                    const which = Math.abs(u - 0.34) < 0.06 || Math.abs(u - 0.66) < 0.06 ? 1 : side;
                    if (bayer(x, y) < (1 - p) ** 3 * 0.42 * strength) f[o + x] = glow[which];
                }
            }
        });
    }

    const beacons = [], blinkers = [], signs = [];
    const red = sc.slot({ k: 'flame', c: hex(LIGHTS.red) });
    const ranks = [
        { d: 0.62, size: [0.05, 0.22], width: [5, 11], lit: 0.1 },
        { d: 0.36, size: [0.07, 0.3], width: [6, 14], lit: 0.22 },
        { d: 0.14, size: [0.06, 0.34], width: [8, 18], lit: 0.34 },
    ];
    const baseY = hz + 1;
    ranks.forEach((rank, ri) => {
        const b = new Buf(W, H), R = sc.ramp(ri === 1 ? Q.glass : rng.chance(0.5) ? Q.concrete : Q.stone, rank.d), s = seedOf(rng);
        const palette = neon
            ? [[NEON.pink, 3], [NEON.purple, 2], [NEON.blue, 3], [NEON.ice, 1.2]]
            : [[WARM[0], 4], [WARM[1], 2], [WARM[2], 2], [WARM[3], 1]];
        const lamp = new Map();
        const lampFor = c => {
            if (!lamp.has(c)) lamp.set(c, sc.slot({ k: 'emit', c: C(c), base: R.c[1], d: rank.d, v: 1 }));
            return lamp.get(c);
        };
        const line = R.flat(0);
        for (let x = -6; x < W;) {
            // a cluster of taller towers in the middle, lower blocks at the edges
            const centre = 1 - Math.abs((x / W) * 2 - 1) ** 1.4 * 0.7, wob = 0.6 + 0.4 * noise1(x * 0.04, s);
            const w = rng.int(rank.width[0], rank.width[1]);
            const h = Math.round(U * lerp(rank.size[0], rank.size[1], rng() ** 1.5) * centre * (0.7 + wob * 0.6));
            const cx = x + w / 2, ytop = baseY - Math.max(5, h);
            const shape = pickWeighted(rng, [['flat', 4], ['step', 2.4], ['slant', 1.4], ['spire', h > U * 0.18 ? 2 : 0]]);
            const cut = xx => {
                if (shape === 'slant') return ytop + Math.round((xx - x) / w * Math.min(6, w * 0.5));
                if (shape === 'step') return xx - x < w * 0.28 || xx - x > w * 0.72 ? ytop + Math.round(h * 0.12) : ytop;
                return ytop;
            };
            const wx = rng.chance(0.75) ? 3 : 2, wy = 3, theme = pickWeighted(rng, palette), floorSeed = rng.int(0, 1e5);
            for (let xx = x; xx < x + w; xx++) {
                for (let y = cut(xx); y <= baseY; y++) b.set(xx, y, R.face(xx < cx ? -1 : 1, y === cut(xx) ? 1 : 0));
            }
            for (let y = ytop + 3; y < baseY - 1; y += wy) {
                for (let xx = x + 1; xx < x + w - 1; xx += wx) {
                    if (hash(0, y, floorSeed) >= 0.55 + rank.lit || hash(xx, y, s) > rank.lit * 2.4) continue;
                    const c = neon && hash(xx, y, s + 7) < 0.55 ? theme : pickWeighted(rng, palette);
                    b.set(xx, y, lampFor(c));
                    if (hash(xx, y, s + 3) < 0.04) blinkers.push({ x: xx, y, on: lampFor(c), off: R.face(xx < cx ? -1 : 1, 0), n: blinkers.length });
                }
            }
            if (neon && rank.d < 0.4 && h > U * 0.08) {
                // rim light: pink down the left edge, blue down the right, thinning toward the top
                const pinkE = sc.slot({ k: 'emit', c: C(NEON.pink), base: R.c[2], d: rank.d, v: 1 });
                const blueE = sc.slot({ k: 'emit', c: C(NEON.blue), base: R.c[2], d: rank.d, v: 1 });
                const rimTo = baseY - Math.round(h * rng.range(0.5, 0.95));
                for (let y = baseY; y >= rimTo; y--) if (bayer(x, y) < 0.9) { b.set(x, y, pinkE); b.set(x + w - 1, y, blueE); }
                if (rng.chance(0.5)) {
                    const edgeC = sc.slot({ k: 'emit', c: C(rng.chance(0.5) ? NEON.pink : NEON.purple), base: R.c[2], d: rank.d, v: 1 });
                    for (let xx = x; xx < x + w; xx++) b.set(xx, cut(xx), edgeC);
                }
                if (ri === 2 && w >= 10 && rng.chance(0.45)) {
                    // a sign panel near the top: bright rows with dark gaps
                    const sy = ytop + 5;
                    const hi = sc.slot({ k: 'emit', c: C(rng.chance(0.5) ? NEON.pink : NEON.blue), base: R.c[1], d: rank.d, v: 1 });
                    const lo = sc.slot({ k: 'emit', c: C(NEON.purple), base: R.c[1], d: rank.d, v: 0.8 });
                    for (let y = sy; y < sy + 7; y++) for (let xx = x + 2; xx < x + w - 2; xx++) b.set(xx, y, y % 2 ? lo : hi);
                    signs.push({ x: x + 2, y: sy, w: w - 4, n: signs.length });
                }
            }
            if (shape === 'spire') {
                const sh = Math.round(h * rng.range(0.18, 0.32));
                for (let y = ytop - sh; y < ytop; y++) b.set(Math.round(cx), y, line);
                beacons.push({ x: Math.round(cx), y: ytop - sh - 1, n: beacons.length });
            } else if (h > U * 0.2 && rng.chance(0.6)) beacons.push({ x: Math.round(cx), y: ytop - 1, n: beacons.length });
            x += w + (rng.chance(0.3) ? rng.int(1, 3) : 0);
        }
        sc.addStatic(b);
    });
    // Windows that blink on and off slowly, a sign that stutters, beacons that pulse.
    const dark = sc.slot({ k: 'mat', c: C('#10101a'), d: 0.2 });
    sc.addFn((f, t) => {
        for (const w of blinkers) f[w.y * W + w.x] = hash(w.n, Math.floor(t * 0.12 + w.n * 0.31), 5) < 0.5 ? w.on : w.off;
        for (const s of signs) {
            if (hash(s.n, Math.floor(t * 0.7), 11) > 0.08) continue;
            for (let y = s.y; y < s.y + 7; y++) for (let x = s.x; x < s.x + s.w; x++) f[y * W + x] = dark;
        }
        if (Math.floor(t * 0.8) % 2 === 0) for (const bcn of beacons) if (hash(bcn.n, 0, 3) < 0.7) f[bcn.y * W + bcn.x] = red;
    });

    // The far embankment: a low dark wall with lamps, and cars crawling along its road.
    const wallC = C('#10121c');
    const wall = sc.slot({ k: 'mat', c: wallC, d: 0.12 });
    const lampSlot = sc.slot({ k: 'emit', c: C(neon ? NEON.purple : LIGHTS.amber), base: wallC, d: 0.12, v: 1 });
    const white = sc.slot({ k: 'emit', c: C('#fff4d6'), base: wallC, d: 0.12, v: 1 }), tail = sc.slot({ k: 'emit', c: C('#ff3b30'), base: wallC, d: 0.12, v: 1 });
    const em = new Buf(W, H);
    for (let x = 0; x < W; x++) {
        em.set(x, hz, wall); em.set(x, hz - 1, wall);
        if (x % 11 === 3) em.set(x, hz - 2, lampSlot);
    }
    sc.addStatic(em);
    const cars = Array.from({ length: Math.round(W / 55) }, () => ({ x: rng.range(0, W), v: rng.range(2.5, 6) * (rng.chance(0.5) ? 1 : -1) }));
    sc.addFn((f, t, L) => {
        if (L.lights < 0.08) return;
        for (const c of cars) f[(hz - 1) * W + Math.round((((c.x + c.v * t) % W) + W) % W)] = c.v > 0 ? white : tail;
    });

    // The water in front, dark, mirroring the city.
    water(sc, rng, { y0: hz + 1, ramp: neon ? Q.harbourNeon : Q.harbour, mix: 0.5, fres: 0.55, waves: 0.04, speed: 1.2 });
}

export const SKYLINES = { city };
export const SKYLINE_HOURS = { city: 21.5 };
