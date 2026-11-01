// Golden-hour landscapes: sharp peaks with the sun setting in a notch between them, a lavender
// slope under a snowy summit, a country road with a hut and a big tree, a lake at dusk with
// power lines, and an autumn forest path. Each one pushes the sky toward a strong sunset when the
// sun is low (`glowLight`), so the time of day matters more than in the other landscapes.
import { Buf } from './scene.js';
import { hex, mix } from './lighting.js';
import { bayer, clamp, fbm1, fbm2, hash, lerp, noise1, smoothstep } from './noise.js';
import { blades, blobTree, canopyRidge, celestial, conifer, cumulus, hill, mountains, seedOf, sky, sphereField, stratus, water } from './shapes.js';
import { P, FLOWERS, LIGHTS, coniferRidge, envelope, footTufts, leafFall, meadow, rock, treeShadows, weather } from './biomes.js';

const Q = {
    rock: ['#2a2850', '#42386e', '#9a5c96', '#e88c9c'],
    rockFar: ['#3c3a6a', '#5a4a88', '#a86aa0', '#f09ab0'],
    snow: ['#8488c8', '#bca8dc', '#ffdce4', '#ffffff'],
    mist: ['#5a5894', '#7a72aa', '#a68cc2', '#c8a8d0'],
    lav: ['#2e2468', '#4a3a98', '#7058c8', '#a088ea'],
    lavHi: ['#7e68d0', '#9c86e8', '#bca8f6', '#dccaff'],
    path: ['#6a5a5a', '#8a7874', '#b8a092', '#dcc6b0'],
    plank: ['#2a1c1c', '#3e2a26', '#6a4a3a', '#8e6c52'],
    footing: ['#2c2830', '#3e3a40', '#6a6468', '#8c8688'],
    barn: ['#4a2a22', '#6a3a2c', '#a8644a', '#c88a62'],
    shore: ['#1a3440', '#24505a', '#3c7c74', '#68aa98'],
    leafTeal: ['#10242e', '#183640', '#1f4a50', '#2a6a62', '#3e8a74', '#5aa888', '#8acaa0'],
    oak: ['#1e1e2a', '#28322c', '#34502c', '#4a6e2e', '#6a9234', '#94b440', '#ccd658'],
    gold: ['#2e2240', '#42304a', '#5e4448', '#86663e', '#b08e40', '#d8b850', '#f2dc84'],
    shrub: ['#1e2a3c', '#2c3e44', '#4a6648', '#7a9058'],
    pine: ['#1c1c3e', '#28284e', '#3e3a68', '#5a4e80'],
    sandy: ['#6a4a30', '#8a6238', '#b88a50', '#dcb070'],
    blush: ['#3a2a5e', '#5a3a7e', '#c25a8c', '#ff8fa6'],
    pole: ['#14101c', '#1e1826', '#2c2438', '#3c3250'],
    amber: ['#5a2a1e', '#8a4026', '#c8743a', '#f0a850'],
    amberFar: ['#8a5a4a', '#a86c50', '#d89a62', '#f2c88a'],
    lake: ['#4a3274', '#60408a', '#8a5ca4', '#d88cb0'],
    leaf: ['#5a2414', '#7a2e12', '#a03a14', '#d4561c', '#f0841e', '#ffb030', '#ffd860'],
    litter: ['#3a2418', '#5a3420', '#8a5428', '#c08a44'],
    trunk: ['#1c1214', '#2c1c1c', '#4a3028', '#6a4a38'],
};

function groups(sc) {
    const g = (name, ...pals) => pals.forEach(p => sc.groups.set(p, name));
    g('grass', P.grass, P.grassHi, P.hill, Q.lav, Q.lavHi, Q.shore, Q.litter, Q.shrub);
    g('conifer', P.forest);
    g('rock', Q.rock, Q.rockFar, Q.blush, Q.mist);
    g('ground', Q.path, Q.sandy);
    g('bark', P.trunk, Q.trunk, Q.plank);
    g('canopy', Q.amber, Q.amberFar);
}

// Push the sky toward a strong sunset while the sun is low: a violet zenith, coral and pink
// near the horizon, pink-lit clouds, and a rosy tint on everything the sun reaches. `spread` pulls
// the sun in from the screen edge (so it can set behind a notch in the peaks); `width` is how far
// from the horizon in sun height the effect reaches, `tint` the colour multiplied into the land.
function glowLight(sc, o = {}) {
    const top = hex(o.top ?? '#5a50d4'), hor = hex(o.hor ?? '#ff8068'), haze = hex(o.haze ?? '#d070b0');
    const lit = hex(o.cloudLit ?? '#ff8fb4'), dark = hex(o.cloudDark ?? '#6a4a9c'), sun = hex(o.sun ?? '#ffd8a0');
    const tint = o.tint ?? [1.08, 0.72, 0.76], width = o.width ?? 0.5, spread = o.spread ?? 0.55, amount = o.amount ?? 1;
    sc.relight = L => {
        const clear = 1 - clamp((sc.atmos?.grey ?? 0) * 1.3 + L.veil);
        const g = (1 - smoothstep(0.08, width, Math.abs(L.sunElev + 0.03))) * clear * amount * (L.sunX > 0 || o.dawn !== false ? 1 : 0.9);
        L.skyTop = mix(L.skyTop, top, g * 0.85);
        L.skyHor = mix(L.skyHor, hor, g * 0.95);
        L.haze = mix(L.haze, haze, g * 0.7);
        L.cloudLit = mix(L.cloudLit, lit, g * 0.9);
        L.cloudDark = mix(L.cloudDark, dark, g * 0.8);
        L.sun = mix(L.sun, sun, g);
        L.tint = mix(L.tint, [L.tint[0] * tint[0], L.tint[1] * tint[1], L.tint[2] * tint[2]], g * 0.85);
        L.sunX *= spread;
    };
}

// Small flocks crossing the sky, wings flapping.
function birds(sc, rng, n, y0, y1) {
    const { W } = sc, ink = sc.slot({ k: 'mat', c: hex('#2a1e40'), d: 0.35 });
    const list = Array.from({ length: n }, () => ({ x: rng.range(0, W), y: rng.range(y0, y1), v: rng.range(3, 6), ph: rng() * 4 }));
    sc.addFn((f, t) => {
        for (const b of list) {
            const x = Math.round(((b.x + t * b.v) % (W + 20) + W + 20) % (W + 20)) - 10, up = Math.floor(t * 3 + b.ph) % 2, y = Math.round(b.y + Math.sin(t * 0.5 + b.ph) * 2);
            const put = (px, py) => { if (px >= 0 && px < W && py >= 0) f[py * W + px] = ink; };
            put(x, y); put(x - 2, y - (up ? 1 : 0)); put(x + 2, y - (up ? 1 : 0)); put(x - 1, y - (up ? 0 : 1)); put(x + 1, y - (up ? 0 : 1));
        }
    });
}

function pinks(sc, rng, hz, U) {
    stratus(sc, rng, { y0: hz * 0.25, y1: hz * 0.8, d: 0.1, speed: 0.6, cover: rng.range(0.35, 0.6), cells: 7, fy: 0.12 });
    if (rng.chance(0.7)) cumulus(sc, rng, { n: rng.int(2, 5), y0: hz * 0.45, y1: hz * 0.8, w0: 40, w1: 90, d: 0.12, speed: 0.5, tall: [0.14, 0.24] });
}

// A shrub: a few overlapping spheres of leaf tones sitting on the ground, ragged at the rim.
export function bush(b, cx, by, r, L, rng, deciduous = false) {
    const F = sphereField(Array.from({ length: rng.int(3, 6) }, (_, i) => ({ x: cx + (i ? rng.range(-r, r) : 0), y: by - r * (i ? rng.range(0.3, 0.8) : 0.5), r: r * (i ? rng.range(0.45, 0.75) : 0.85), z: i ? rng.range(0, r * 0.5) : 0 })));
    for (let j = 0; j < F.h; j++) {
        for (let i = 0; i < F.w; i++) {
            const o = j * F.w + i, x = F.x0 + i, y = F.y0 + j;
            if (F.id[o] < 0 || y > by) continue;
            const n = hash(x >> 1, y >> 1, F.id[o] + 3), jx = F.nx[o] + (n - 0.5) * 0.6, jy = F.ny[o] + (hash(x >> 1, y >> 1, 9) - 0.5) * 0.6;
            if (Math.hypot(F.nx[o], F.ny[o]) > 0.8 && n < 0.35) continue;
            b.set(x, y, L.at(clamp(jx, -1, 1), clamp(jy, -1, 1), 0.6, clamp(Math.round(1.6 - F.ny[o] * 1.6 + (n - 0.5) * 1.2), 0, 3)), 0, undefined, deciduous ? 1 + Math.floor(n * 254) : 0);
        }
    }
}

// ---------------------------------------------------------------- peaks

function peaks(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.64, 0.72));
    groups(sc);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['mixed', 2.4], ['streaks', 1.8], ['scattered', 1.6], ['towering', 1]], 0.25);
    glowLight(sc, { spread: 0.55 });
    const notch = 0.5 + 0.44 * 0.55 * 0.97, mc = clamp(notch + rng.pick([-1, 1]) * rng.range(0.2, 0.3), 0.15, 0.85);
    // The sun sets in a notch between two great peaks.
    mountains(sc, rng, {
        d: 0.3, base: hz, top: Math.max(H * 0.03, hz - U * rng.range(0.66, 0.76)), ramp: Q.rock, snow: Q.snow, snowJag: 70, snowAt: rng.range(0.4, 0.55), sharp: 1.7, talus: 2, freq: rng.range(0.008, 0.012), mist: 22, spur: 40,
        env: u => (0.62 + 0.38 * (1 - smoothstep(0, 0.4, Math.abs(u - mc)))) * (0.04 + 0.96 * smoothstep(0, 0.2, Math.abs(u - notch))),
    });
    mountains(sc, rng, { d: 0.2, base: hz + 1, top: hz - U * rng.range(0.26, 0.36), ramp: Q.rockFar, snow: Q.snow, snowAt: 0.18, sharp: 1.3, talus: 1.7, freq: rng.range(0.012, 0.02), mist: 14, env: u => 0.15 + 0.85 * smoothstep(0, 0.35, Math.abs(u - notch)) });
    const F = sc.ramp(P.forest, 0.04), s = seedOf(rng), ridge = new Buf(W, H);
    for (let x = 0; x < W; x++) {
        const top = Math.round(hz - 3 - 6 * fbm1(x * 0.05, s, 3));
        for (let y = top; y <= hz + 1; y++) ridge.set(x, y, F.flat(0));
    }
    for (let x = -3; x < W + 3; x += rng.range(1.5, 3)) {
        const by = hz + 1, hh = rng.range(4, 12) * (0.6 + fbm1(x * 0.03, s + 4));
        conifer(ridge, x, by, hh, F, rng);
    }
    sc.addStatic(ridge);
    water(sc, rng, { y0: hz + 1, ramp: Q.lake, mix: 0.3, fres: 0, glassy: true, waves: 0.05, speed: 2, glitter: true, d: 0.02 });
    // Dark pine banks in front.
    const b = new Buf(W, H), sb = new Buf(W, H, { sway: true }), D = sc.ramp(P.forest, 0), T = sc.ramp(P.trunk, 0), trees = [];
    for (const side of [-1, 1]) {
        const reach = W * rng.range(0.16, 0.3), top = hz + rng.range(16, 34), ss = s + side;
        const edge = y => reach * (0.3 + 0.7 * ((y - top) / (H - top)) ** 0.8) + (fbm1(y * 0.06, ss) - 0.5) * 14;
        for (let y = Math.ceil(top); y < H; y++) {
            for (let x = 0; x < edge(y); x++) b.set(side < 0 ? x : W - 1 - x, y, D.face(-side, hash(x, y, ss) < 0.15 ? 1 : 0));
        }
        for (let i = rng.int(3, 7); i > 0; i--) {
            // Rooted on the bank: how far it reaches at this depth, less a margin for the trunk.
            const by = rng.range(top + 6, H + 4), room = Math.max(0, edge(Math.min(by, H - 1)) - 5), inset = rng.range(-6, room);
            trees.push({ x: side < 0 ? inset : W - 1 - inset, by, h: U * rng.range(0.2, 0.7) * (0.5 + 0.5 * (by - top) / (H - top)) });
        }
    }
    trees.sort((a, c) => a.by - c.by).forEach(t => conifer(sb, t.x, t.by, t.h, D, rng, { sway: 0.5, trunk: T }));
    sc.addStatic(b);
    sc.addSway(sb, 0.6);
    birds(sc, rng, rng.int(2, 6), hz * 0.35, hz * 0.7);
}

// ---------------------------------------------------------------- lavender

// A stretch of lavender from the line `top` down: broad patches of light sweeping across it, and spikes
// everywhere that grow with nearness, so the far field is fine texture rather than flat bands.
// `mid` adds what stands in the field (below row `split`, spikes grow in front of it).
function lavenderField(sc, rng, top, { d = 0, dir = 1, split = Infinity, mid = null } = {}) {
    const { W, H } = sc, s = seedOf(rng), b = new Buf(W, H), back = new Buf(W, H, { sway: true }), front = new Buf(W, H, { sway: true });
    const G = sc.ramp(Q.lav, d), Y = sc.ramp(Q.lavHi, d), B = sc.ramp(Q.lav, d, 'blade'), BY = sc.ramp(Q.lavHi, d, 'blade');
    for (let x = 0; x < W; x++) {
        const t = top(x), y0 = Math.ceil(t);
        for (let y = Math.max(0, y0); y < H; y++) {
            const dy = y - t, p = clamp(dy / (H - t)), v = fbm2(x * 0.012 + dy * 0.02 * dir, dy * 0.035, s, 3), hi = v + (hash(x, y, s) - 0.5) * 0.14 > 0.56;
            b.set(x, y, hi ? Y.flat(clamp(Math.floor(v * 2.4 - 0.6), 0, 1)) : G.flat(clamp(Math.floor(v * 4 - 0.6 + (hash(x, y, s + 1) - 0.5) * 0.8), 0, 3)));
            if (rng() < 0.42 * (0.3 + 0.7 * p)) blades(y < split ? back : front, rng, x, y, 2 + p * 13, hi ? [BY.flat(0), BY.flat(rng.chance(0.5) ? 2 : 3)] : [B.flat(1), B.flat(rng.chance(0.5) ? 2 : 3)], null);
        }
    }
    sc.addStatic(b);
    sc.addSway(back, 0.7);
    mid?.();
    sc.addSway(front, 0.7);
}

function lavender(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.46, 0.54));
    groups(sc);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['mixed', 2], ['scattered', 2], ['streaks', 1.5], ['sparse', 1.2]], 0.3);
    glowLight(sc, { spread: 0.7 });
    const mc = rng.range(0.25, 0.7), mw = rng.range(0.22, 0.34), s = seedOf(rng);
    mountains(sc, rng, { d: 0.34, base: hz + 8, top: Math.max(H * 0.04, hz - U * rng.range(0.6, 0.72)), ramp: Q.rock, snow: Q.snow, snowJag: 70, snowAt: rng.range(0.4, 0.55), sharp: 1.5, talus: 1.8, freq: rng.range(0.007, 0.011), mist: 16, spur: 36, env: u => 0.5 + 0.5 * (1 - smoothstep(0, mw, Math.abs(u - mc))) });
    mountains(sc, rng, { d: 0.2, base: hz + 8, top: hz - U * rng.range(0.16, 0.28), ramp: Q.rockFar, snow: Q.snow, snowAt: 0.1, sharp: 1.2, talus: 1.5, freq: rng.range(0.01, 0.018), mist: 8, env: envelope(rng) });
    // Dark pines along the foot of the range hide where it meets the field.
    coniferRidge(sc, rng, { d: 0.2, base: hz + 8, top: hz - rng.range(1, 5), ramp: Q.pine, tmin: 3, tmax: rng.range(6, 10), density: rng.range(0.7, 1.2) });
    const dir = rng.chance(0.5) ? 1 : -1;
    lavenderField(sc, rng, x => hz + 2 + (fbm1(x * 0.014, s, 3) - 0.5) * 12, { d: 0.14, dir });
    // The near slope, rising to one side. A pale tree or two and some shrubs stand in it, spikes growing up in front.
    const top = x => lerp(hz + 24, H * 0.72, smoothstep(0, 1, dir > 0 ? x / W : 1 - x / W) ** 0.9) + (fbm1(x * 0.012, s + 1) - 0.5) * 12;
    const tx = Math.round(W * (dir > 0 ? rng.range(0.1, 0.26) : rng.range(0.74, 0.9))), by = top(tx) + rng.range(16, 26);
    lavenderField(sc, rng, top, {
        dir, split: by - 2,
        mid: () => {
            const tb = new Buf(W, H, { sway: true, rank: true }), rb = new Buf(W, H), L = sc.leaves(Q.gold, 0, 1), Tk = sc.ramp(Q.trunk, 0), Sh = sc.leaves(Q.oak, 0.02, 0);
            const crowns = [blobTree(tb, tx, by, U * rng.range(0.5, 0.62), L, Tk, rng, { sway: 1 })], feet = [{ x: tx, by, w: crowns[0].w, h: U * 0.55 }];
            if (rng.chance(0.5)) {
                const x2 = tx + dir * rng.range(30, 50), by2 = top(x2) + rng.range(10, 16), c = blobTree(tb, x2, by2, U * rng.range(0.24, 0.32), L, Tk, rng, { sway: 1 });
                crowns.push(c); feet.push({ x: x2, by: by2, w: c.w, h: U * 0.28 });
            }
            for (let i = rng.int(3, 6); i > 0; i--) {
                const x = rng.range(0, W), y = top(clamp(Math.round(x), 0, W - 1)) + rng.range(8, 40), r = rng.range(4, 9) * (0.6 + (y - hz) / (H - hz));
                bush(rb, x, y, r, Sh, rng);
                feet.push({ x, by: y, w: r, h: r * 1.6 });
            }
            treeShadows(sc, feet, sc.ramp(Q.lav, 0).flat(0));
            sc.addStatic(rb);
            sc.addSway(tb, 0.8);
            leafFall(sc, rng, crowns, L);
        },
    });
    birds(sc, rng, rng.int(0, 4), hz * 0.3, hz * 0.7);
}

// ---------------------------------------------------------------- country road

// Paints a convex polygon: put(x, y) for every pixel inside it.
function poly(pts, put) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), n = pts.length;
    const sign = Math.sign((pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0]));
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
        for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
            let inside = true;
            for (let i = 0; i < n && inside; i++) {
                const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
                if (((bx - ax) * (y - ay) - (by - ay) * (x - ax)) * sign < 0) inside = false;
            }
            if (inside) put(x, y);
        }
    }
}

// A timber hut seen from one corner: a long plank wall receding to the left with a door and a window, a
// lit gable end at the right, and a shingled roof whose ridge runs back parallel to the wall. `x, by`
// is the near corner at the ground and `s` the wall's length. Returns where the door is, and smoke's start.
export function hut(sc, b, x, by, s, rng, d = 0.1) {
    x = Math.round(x); by = Math.round(by);
    sc.groups.set(Q.barn, 'ground'); sc.groups.set(Q.plank, 'bark'); sc.groups.set(Q.footing, 'rock');
    const Pl = sc.ramp(Q.plank, d), Ro = sc.ramp(Q.barn, d), Ft = sc.ramp(Q.footing, d), ss = seedOf(rng);
    const lamp = sc.slot({ k: 'emit', c: hex(LIGHTS.warm), base: Pl.c[0], d, v: 1 });
    const wh = Math.round(s * 0.24), g = Math.round(s * 0.42), rh = Math.round(s * 0.27), far = [-s, -Math.round(s * 0.07)], end = [g, -Math.round(g * 0.22)];
    const C = [x, by], A = [x + far[0], by + far[1]], D = [x + end[0], by + end[1]];
    const Ct = [x, by - wh], At = [A[0], A[1] - (wh - 1)], Dt = [D[0], D[1] - wh];
    const E = [(Ct[0] + Dt[0]) / 2, (Ct[1] + Dt[1]) / 2 - rh], F = [E[0] + far[0], E[1] + far[1] + 1];
    const wallTop = px => lerp(At[1], Ct[1], (px - A[0]) / (C[0] - A[0]));
    const wallBot = px => lerp(A[1], C[1], (px - A[0]) / (C[0] - A[0]));
    // Long wall in vertical planks, on a stone footing, shaded under the eaves.
    poly([A, C, Ct, At], (px, py) => {
        const up = wallBot(px) - py, under = py - wallTop(px);
        if (up < 1.5) return b.set(px, py, Ft.flat(hash(px >> 1, py, ss) < 0.4 ? 1 : 2));
        const seam = (px - A[0]) % 4 === 0;
        b.set(px, py, Pl.face(-1, under < 2 || seam || hash(px, py >> 2, ss) < 0.12 ? 0 : 1));
    });
    // Gable end: wall and the triangle above it, planks again, facing the other way.
    const gable = (px, py) => b.set(px, py, Pl.face(1, (px - x) % 3 === 0 ? 0 : 1));
    poly([C, D, Dt, Ct], gable);
    poly([Ct, Dt, E], gable);
    for (let px = x; px <= D[0]; px++) { const y = Math.round(lerp(C[1], D[1], (px - x) / g)); b.set(px, y, Ft.flat(1)); b.set(px, y - 1, Ft.flat(2)); }
    // A door in the long wall, a window beside it, a small lit window up in the gable.
    const doorX = Math.round(x - s * 0.42), doorW = Math.max(3, Math.round(s * 0.09)), doorH = Math.round(wh * 0.72), base = Math.round(wallBot(doorX));
    for (let py = base - doorH; py <= base; py++) for (let k = 0; k < doorW; k++) b.set(doorX + k, py, k === 0 || k === doorW - 1 || py === base - doorH ? Pl.flat(2) : Pl.flat(0));
    const pane = (cx, cy, w, h) => {
        for (let py = cy - 1; py <= cy + h; py++) for (let k = -1; k <= w; k++) b.set(cx + k, py, Pl.flat(2));
        for (let py = cy; py < cy + h; py++) for (let k = 0; k < w; k++) b.set(cx + k, py, lamp);
    };
    const winX = Math.round(x - s * 0.74);
    pane(winX, Math.round(wallTop(winX) + wh * 0.28), Math.max(2, Math.round(s * 0.07)), Math.max(2, Math.round(wh * 0.3)));
    pane(Math.round(E[0] - 1), Math.round(Ct[1] - rh * 0.1 - 1), 2, 2);
    // Roof plane: shingle rows running with the eave, weathered in patches, with the overhang past each end.
    const o = 2, eaveA = [At[0] - o, At[1] + 1], eaveC = [Ct[0] + o - 1, Ct[1] + 2], ridgeF = [F[0] - o, F[1]], ridgeE = [E[0] + o - 1, E[1]];
    const rows = Math.round(rh / 2.5);
    poly([eaveA, eaveC, ridgeE, ridgeF], (px, py) => {
        const ey = lerp(eaveA[1], eaveC[1], (px - eaveA[0]) / (eaveC[0] - eaveA[0])), v = (py - ridgeF[1]) / Math.max(1, ey - ridgeF[1]);
        const row = Math.floor(v * rows), joint = (px + row * 3) % 5 === 0;
        b.set(px, py, Ro.face(1, v < 0.08 || (fbm2(px * 0.09, py * 0.25, ss + 1, 2) > 0.58 && v * rows % 1 >= 0.28 && !joint) ? 1 : 0));
    });
    // Barge boards down the gable's edges and a lit lip along the eave.
    for (const c of [[Ct[0] - 1, Ct[1] + 2], [Dt[0] + 2, Dt[1] + 2]]) {
        const n = Math.ceil(Math.hypot(c[0] - ridgeE[0], c[1] - ridgeE[1]));
        for (let k = 0; k <= n; k++) {
            const px = lerp(ridgeE[0], c[0], k / n), py = lerp(ridgeE[1], c[1], k / n);
            b.set(px, py, Ro.flat(2)); b.set(px, py + 1, Ro.flat(0));
        }
    }
    for (let k = 0, n = eaveC[0] - eaveA[0]; k <= n; k++) {
        const py = lerp(eaveA[1], eaveC[1], k / n);
        b.set(eaveA[0] + k, py, Ro.flat(1)); b.set(eaveA[0] + k, py + 1, Pl.flat(0));
    }
    // A stone chimney through the back of the roof.
    const chX = Math.round(lerp(F[0], E[0], 0.72)), chY = Math.round(lerp(F[1], E[1], 0.72)), chW = Math.max(3, Math.round(s * 0.07)), chH = Math.round(s * 0.14);
    for (let py = chY - chH; py <= chY + 2; py++) for (let k = 0; k < chW; k++) b.set(chX + k, py, py === chY - chH ? Ft.flat(3) : Ft.face(k < chW / 2 ? -1 : 1, hash(k, py, ss) < 0.3 ? 0 : 1));
    return { doorX: doorX + doorW / 2, doorY: base, smoke: [chX + chW / 2, chY - chH - 1], span: [A[0] - o, D[0] + o] };
}

// Woodsmoke: pale puffs that widen, thin out and lean with the wind.
export function smoke(sc, x, y, rise) {
    const { W, H } = sc, puff = sc.slot({ k: 'cloud', v: 0.75, d: 0.2 });
    sc.addFn((f, t) => {
        for (let i = 0; i < 12; i++) {
            const age = (t * 0.1 + i / 12) % 1, r = 0.5 + age * 2.6, px = x + age * rise * 0.5 + Math.sin(age * 7 + i) * 1.2, py = y - age * rise;
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                const ix = Math.round(px + dx), iy = Math.round(py + dy);
                if (dx * dx + dy * dy <= r * r && ix >= 0 && iy >= 0 && ix < W && iy < H && bayer(ix, iy) < (1 - age) * 0.8) f[iy * W + ix] = puff;
            }
        }
    });
}

function road(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.5, 0.58));
    groups(sc);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['mixed', 2], ['sparse', 2], ['scattered', 1.5], ['haze', 1.2]], 0.3);
    glowLight(sc, { spread: 0.45 });
    mountains(sc, rng, { d: 0.5, base: hz + 8, top: hz - U * rng.range(0.34, 0.46), ramp: Q.mist, freq: rng.range(0.006, 0.01), mist: 18, sharp: 1.2, env: envelope(rng) });
    mountains(sc, rng, { d: 0.36, base: hz + 8, top: hz - U * rng.range(0.16, 0.26), ramp: Q.mist, freq: rng.range(0.01, 0.016), mist: 12, sharp: 1, env: envelope(rng) });
    coniferRidge(sc, rng, { d: 0.28, base: hz + 8, top: hz - rng.range(0, 4), ramp: P.forest, tmin: 3, tmax: rng.range(7, 12), density: rng.range(0.5, 1) });
    const ty = meadow(sc, rng, { top: hz + 3, amp: 5, d: 0.08, flowers: 0.1, blades: rng.range(0.2, 0.34) });
    // A hut on the meadow, trees close behind it, smoke from the chimney.
    const hx = Math.round(W * rng.range(0.56, 0.7)), by = Math.round(ty[hx] + rng.range(18, 24)), s = Math.round(U * rng.range(0.2, 0.24));
    const back = new Buf(W, H, { sway: true }), D = sc.ramp(P.forest, 0.1), T = sc.ramp(P.trunk, 0.1);
    for (let i = rng.int(2, 4); i > 0; i--) conifer(back, hx + rng.range(-s * 1.1, s * 0.5), by - s * 0.14, U * rng.range(0.2, 0.34), D, rng, { sway: 0.3, trunk: T });
    sc.addSway(back, 0.4);
    const hb = new Buf(W, H), H0 = hut(sc, hb, hx, by, s, rng);
    treeShadows(sc, [{ x: (H0.span[0] + H0.span[1]) / 2, by: by + 1, w: (H0.span[1] - H0.span[0]) * 0.5, h: s * 0.4 }], sc.ramp(P.grass, 0).flat(0));
    sc.addStatic(hb);
    smoke(sc, H0.smoke[0], H0.smoke[1], U * 0.16);
    footTufts(sc, Array.from({ length: 6 }, (_, i) => ({ x: lerp(H0.span[0], H0.span[1], (i + 0.5) / 6), by: by + 1 - (i < 4 ? (3 - i) * s * 0.018 : 0), w: 7, h: 0 })), sc.ramp(P.grass, 0.04, 'blade'), 0.6);
    // A dirt road from the hut's door, a strip of grass between its two ruts further down.
    const rb = new Buf(W, H), rs = seedOf(rng), R = sc.ramp(Q.path, 0.02), Gr = sc.ramp(P.grass, 0.02), bend = rng.pick([-1, 1]);
    const y0 = Math.round(H0.doorY) + 1, vx = H0.doorX, ex = W * rng.range(0.4, 0.58);
    const cx = p => lerp(vx, ex, p) + bend * Math.sin(p * Math.PI) * W * 0.14 * (1 - p * 0.3), hw = p => 2 + (W * 0.17) * p ** 1.5;
    for (let y = y0; y < H; y++) {
        const p = (y - y0) / (H - y0), c = cx(p), w = hw(p), mw = p > 0.3 ? w * 0.2 : 0;
        for (let x = Math.floor(c - w); x <= c + w; x++) {
            const u = Math.abs(x - c);
            if (u > w - 2 && hash(x, y, rs + 3) < 0.4) continue;   // grass nibbles at the edge
            if (mw && u < mw) { rb.set(x, y, Gr.flat(hash(x, y, rs) < 0.3 ? 3 : 2)); continue; }
            const n = fbm2(x * 0.05, y * 0.12, rs, 3);
            rb.set(x, y, R.flat(u > w - 3 ? 1 : clamp(Math.floor(n * 3.4 + (hash(x, y, rs + 1) - 0.5) * 0.7), 1, 3)));
        }
    }
    sc.addStatic(rb);
    // A fence along the far verge with a rail, a boulder, and a scatter of flowers.
    const fb = new Buf(W, H), post = sc.ramp(P.trunk, 0.06), fl = FLOWERS.map(c => sc.slot({ k: 'mat', c: hex(c), d: 0 })), rx = Math.round(W * 0.2), ry = Math.round(H * 0.84), rr = 10;
    const feet = [];
    let prev = null;
    for (let i = 0; i < 7; i++) {
        const q = i / 6, x = Math.round(W * (0.18 + 0.2 * q)), y = Math.round(lerp(by + 6, by + 1, q)), ph = Math.round(lerp(8, 5, q));
        for (let k = 0; k < ph; k++) { fb.set(x, y - k, post.face(-1, 0)); fb.set(x + 1, y - k, post.face(1, 0)); }
        if (prev) { const n = x - prev[0]; for (let k = 1; k < n; k++) fb.set(prev[0] + k, lerp(prev[1], y - ph + 2, k / n), post.flat(1)); }
        prev = [x, y - ph + 2];
        feet.push({ x, by: y, w: 2, h: ph });
    }
    rock(fb, rx, ry, rr, sc.ramp(P.rock, 0.02), rng);
    feet.push({ x: rx, by: ry, w: rr, h: rr * 1.3 });
    for (let i = 0; i < 90; i++) {
        const x = rng.int(0, W - 1), y = rng.int(Math.round(H * 0.7), H - 1), p = (y - y0) / (H - y0);
        if (Math.abs(x - cx(p)) > hw(p) + 4) fb.set(x, y, rng.pick(fl));
    }
    sc.addStatic(fb);
    // The great tree at the edge of the picture, its shade the colour of the dusk.
    const sb = new Buf(W, H, { sway: true, rank: true }), L = sc.leaves(Q.oak, 0, 0), Tk = sc.ramp(Q.trunk, 0), tx = W * rng.range(0.06, 0.16), tb = H - 3, th = U * rng.range(1.0, 1.15);
    const crown = blobTree(sb, tx, tb, th, L, Tk, rng, { sway: 1 });
    feet.push({ x: tx, by: tb, w: crown.w, h: th });
    treeShadows(sc, feet, sc.ramp(P.grass, 0).flat(0));
    sc.addSway(sb, 0.8);
    footTufts(sc, feet, sc.ramp(P.grass, 0, 'blade'));
    leafFall(sc, rng, [crown], L);
    birds(sc, rng, rng.int(1, 4), hz * 0.3, hz * 0.7);
}

// ---------------------------------------------------------------- dusk lake

// Utility poles striding off into the distance, three wires sagging between them.
function poles(sc, list) {
    const { W, H } = sc, b = new Buf(W, H), Pm = sc.ramp(Q.pole, 0.02), arms = [];
    for (const { x, by, h } of list) {
        const w = h > 60 ? 3 : h > 25 ? 2 : 1, aw = h * 0.16, ay = Math.round(by - h + h * 0.05);
        for (let y = Math.round(by - h); y <= by; y++) for (let k = 0; k < w; k++) b.set(x + k, y, Pm.face(k < w / 2 ? -1 : 1, 0));
        for (let i = -aw; i <= aw; i++) { b.set(x + i, ay, Pm.flat(1)); if (h > 25) b.set(x + i, ay + 1, Pm.flat(0)); }
        const ay2 = ay + Math.round(h * 0.12);
        for (let i = -aw * 0.6; i <= aw * 0.6; i++) b.set(x + i, ay2, Pm.flat(1));
        arms.push({ x: x + w / 2, ay, ay2, aw });
    }
    for (let i = 0; i + 1 < arms.length; i++) {
        const a = arms[i], c = arms[i + 1], dist = Math.hypot(c.x - a.x, c.ay - a.ay);
        for (const [oa, oc, yy] of [[-a.aw, -c.aw, 'ay'], [a.aw, c.aw, 'ay'], [0, 0, 'ay2']]) {
            const x0 = a.x + oa, x1 = c.x + oc, y0 = a[yy], y1 = c[yy], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.2);
            for (let k = 0; k <= n; k++) {
                const u = k / n;
                b.set(lerp(x0, x1, u), lerp(y0, y1, u) + dist * 0.05 * 4 * u * (1 - u), Pm.flat(0));
            }
        }
    }
    sc.addStatic(b);
}

function dusklake(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.6, 0.66));
    groups(sc);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['mixed', 2.4], ['scattered', 2], ['streaks', 1.4], ['towering', 0.8]], 0.25);
    glowLight(sc, { spread: 0.3 });
    pinks(sc, rng, hz, U);
    const lightU = 0.5 + 0.44 * 0.3 * 0.97, peakU = clamp(lightU - rng.range(0.2, 0.3), 0.2, 0.5), s = seedOf(rng);
    // One broad hill, glowing pink, with the sun going down behind its right shoulder.
    mountains(sc, rng, { d: 0.3, base: hz + 2, top: hz - U * rng.range(0.4, 0.5), ramp: Q.blush, sharp: 0.9, talus: 0.8, freq: 0.006, mist: 8, env: u => 0.08 + 0.92 * (1 - smoothstep(0, 0.34, u < peakU ? (peakU - u) * 0.7 : (u - peakU) * 1.5)) });
    // The far shore: woods with a village in them, windows coming on at dusk.
    canopyRidge(sc, rng, { d: 0.3, base: hz + 2, top: hz - 7, bottom: hz + 2, ramp: Q.pine, rmin: 2, rmax: 5, rows: 2 });
    const vb = new Buf(W, H), lamp = sc.slot({ k: 'emit', c: hex(LIGHTS.warm), base: hex('#3e3a68'), d: 0.3, v: 1 });
    for (let i = rng.int(18, 36); i > 0; i--) {
        const x = Math.round(W * (peakU + rng.range(-0.2, 0.42))), y = Math.round(hz - rng.range(0, 4));
        vb.set(x, y, lamp);
        if (hash(x, y, s + 1) < 0.5) vb.set(x + 1, y, lamp);
    }
    sc.addStatic(vb);
    water(sc, rng, { y0: hz + 1, ramp: Q.lake, mix: 0.3, fres: 0, glassy: true, waves: 0.04, speed: 2, glitter: true, d: 0.03 });
    // The near bank fills the left, running away to the far shore. Its poles and road both aim for one
    // point on the horizon, so the line recedes properly and every pole stands on land.
    const G = sc.ramp(Q.shore, 0), bb = new Buf(W, H), y0 = hz + 1, span = H - y0, nearY = H - 2;
    const vx = W * 0.36, x0 = W * 0.07, lineX = y => vx + (y - hz) * (x0 - vx) / (nearY - hz);
    const shoreBend = rng.range(0.03, 0.07), edgeAt = y => { const q = clamp((y - y0) / span); return lerp(W * 0.44, W * 0.74, q ** 1.3) + Math.sin(q * 6.5 + s) * W * shoreBend * q ** 0.7 + (fbm1(y * 0.06, s + 6, 3) - 0.5) * 14 * clamp((y - y0) / 20); };
    const fl = ['#e8f0ff', '#bfd0ff', '#ffffff'].map(c => sc.slot({ k: 'mat', c: hex(c), d: 0 }));
    const rvx = W * 0.39, roadAt = q => rvx + (W * 0.31 - rvx) * q ** 1.15 + Math.sin(q * 3) * 8 * q, roadW = q => 0.6 + q * 13;
    const grass = new Buf(W, H, { sway: true }), GB = sc.ramp(Q.shore, 0, 'blade'), Dk = sc.ramp(Q.pole, 0.02);
    for (let y = y0; y < H; y++) {
        const e = edgeAt(y), q = (y - y0) / span;
        for (let x = 0; x < e; x++) {
            const rim = e - x < 1 + q * 3, n = fbm2(x * 0.03 + y * 0.02, y * 0.07, s + 7, 3);
            bb.set(x, y, rim ? Dk.flat(1) : G.flat(clamp(Math.floor(n * 4.4 - 0.5 + (hash(x, y, s) - 0.5) * 0.9), 0, 3)));
            if (rim || Math.abs(x - roadAt(q)) < roadW(q) + 1) continue;
            if (rng() < 0.2 * q) blades(grass, rng, x, y, 2 + q * 9, [GB.flat(n > 0.5 ? 2 : 1), GB.flat(n > 0.5 ? 3 : 2)], null);
            if (hash(x >> 1, y >> 1, s + 2) < 0.035 * q * (n > 0.48 ? 2 : 0.4)) grass.set(x, y - 1, rng.pick(fl));
        }
        // Reeds at the water's edge.
        for (let k = 0; k < 2; k++) if (rng() < 0.35 * q + 0.03) blades(grass, rng, Math.round(e - rng.range(0, 3 + q * 8)), y, 3 + q * 13, [Dk.flat(2), Dk.flat(3)], null);
    }
    const Pa = sc.ramp(Q.path, 0.1);
    for (let y = y0 + 2; y < H; y++) {
        const q = (y - y0) / span, c = roadAt(q), w = roadW(q);
        for (let x = Math.floor(c - w); x <= c + w; x++) if (Math.abs(x - c) < w - 1 || hash(x, y, s + 9) < 0.5) bb.set(x, y, Pa.flat(clamp(Math.floor(fbm2(x * 0.1, y * 0.2, s + 8, 2) * 3), 0, 2)));
    }
    sc.addStatic(bb);
    // Dark woods behind the poles along the outer side of the bank, with shrubs round their feet.
    const sb = new Buf(W, H, { sway: true, rank: true }), rb = new Buf(W, H), Tk = sc.ramp(Q.trunk, 0.05), Sh = [0.22, 0.12, 0.04].map(d => sc.leaves(Q.leafTeal, d, 0));
    const trees = [], feet = [];
    for (let i = 16; i > 0; i--) {
        const y = hz + 3 + rng() ** 1.4 * (H * 0.86 - hz), q = (y - hz) / (nearY - hz), x = rng.range(-W * 0.06, lineX(y) - 4 - q * 18);
        trees.push({ x, y, q, h: q * U * 0.92 * rng.range(0.85, 1.25) + 5 });
    }
    trees.sort((a, c) => a.y - c.y).forEach(t => {
        const L = Sh[t.q < 0.2 ? 0 : t.q < 0.5 ? 1 : 2], c = blobTree(sb, t.x, t.y, t.h, L, Tk, rng, { sway: 0.8 });
        feet.push({ x: t.x, by: t.y, w: c.w, h: t.h });
        for (let i = rng.int(2, 4); i > 0; i--) bush(rb, t.x + rng.range(-c.w, c.w), t.y + rng.range(0, 3), 2 + t.h * rng.range(0.07, 0.14), L, rng);
    });
    treeShadows(sc, feet, G.flat(0));
    sc.addSway(sb, 0.7);
    sc.addStatic(rb);
    sc.addSway(grass, 0.7);
    const list = [];
    for (let d = 1; d < 6; d += 1.6) list.push({ x: Math.round(vx + (x0 - vx) / d), by: Math.round(hz + (nearY - hz) / d), h: U * 0.92 / d });
    poles(sc, list);
    birds(sc, rng, rng.int(2, 7), hz * 0.3, hz * 0.7);
}

// ---------------------------------------------------------------- autumn path

function autumn(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.5, 0.58));
    groups(sc);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['haze', 2], ['mixed', 1.5], ['sparse', 1.5], ['fog', 1.2]], 0.3);
    glowLight(sc, { top: '#e8a088', hor: '#ffd08a', haze: '#f0b88a', cloudLit: '#ffd2a0', cloudDark: '#a8707c', tint: [1.08, 0.86, 0.64], width: 0.75, amount: 0.9, spread: 0.3 });
    hill(sc, rng, { d: 0.5, y: hz - 8, amp: 14, freq: 0.01, ramp: Q.amberFar, bottom: hz + 8 });
    // The forest floor in soft patches, and the path running through it to the gap at the far end.
    const s = seedOf(rng), gb = new Buf(W, H), R = sc.ramp(Q.litter, 0.04), Pa = sc.ramp(Q.sandy, 0.03), y0 = hz + 4;
    const fallen = ['#f0841e', '#d4561c', '#ffb030'].map(c => sc.slot({ k: 'mat', c: hex(c), d: 0.04 }));
    const ph = rng() * 6, bend = rng.pick([-1, 1]), cx = p => W / 2 + bend * Math.sin(p * 2.8 + ph) * W * 0.1 * p ** 0.6, hw = p => 1 + W * 0.15 * p ** 1.5;
    const vx = cx(0);
    for (let y = y0; y < H; y++) {
        const p = (y - y0) / (H - y0), c = cx(p), w = hw(p);
        for (let x = 0; x < W; x++) {
            const n = fbm2(x * 0.016 + (y - y0) * 0.012, (y - y0) * 0.05, s, 3), u = Math.abs(x - c) + (hash(x, y, s + 3) - 0.5) * (1 + w * 0.3);
            if (u < w) gb.set(x, y, hash(x, y, s + 4) < 0.05 + 0.06 * p ? fallen[hash(x, y, s + 5) * 3 | 0] : Pa.flat(clamp(Math.floor(fbm2(x * 0.05, y * 0.14, s + 1, 2) * 3 + 0.5), 1, 3)));
            else gb.set(x, y, hash(x, y, s + 4) < 0.05 * (1 + p) ? fallen[hash(x, y, s + 5) * 3 | 0] : R.flat(clamp(Math.floor(n * 3.6 + (hash(x, y, s + 2) - 0.5) * 0.9), 0, 3)));
        }
    }
    sc.addStatic(gb);
    // Trees from the hazy far end, where they leave the gap open, to big ones at the picture's edge. A few
    // depth levels share their colours, since every distinct shade costs palette slots.
    const list = [];
    for (let x = -6; x < W + 6; x += rng.range(7, 13)) {
        const by = y0 + rng.range(0, 6), gap = W * 0.05 + (by - y0) * 1.5;
        if (Math.abs(x - vx) > gap) list.push({ x, by, h: rng.range(22, 40), lv: 0 });
    }
    for (let k = 1; k < 6; k++) {
        const q = k / 5;
        for (const side of [-1, 1]) {
            for (let i = rng.int(1, 2); i > 0; i--) {
                const qq = clamp(q + rng.range(-0.08, 0.08)), by = lerp(y0 + 8, H + 8, qq ** 1.5), p = clamp((by - y0) / (H - y0));
                list.push({ x: cx(p) + side * (hw(p) + W * 0.09 + W * 0.36 * qq ** 1.1 + rng.range(-6, 14) * (0.4 + qq)), by, h: lerp(U * 0.24, U * 1.0, qq ** 1.2) * rng.range(0.8, 1.1), lv: qq < 0.3 ? 1 : qq < 0.6 ? 2 : 3 });
            }
        }
    }
    const Lv = [0.3, 0.2, 0.1, 0].map(d => [sc.leaves(Q.leaf, d, 0), sc.ramp(Q.trunk, d)]);
    const sb = new Buf(W, H, { sway: true, rank: true }), crowns = [], feet = [];
    list.sort((a, c) => a.by - c.by).forEach(t => {
        const [L, Tk] = Lv[t.lv], c = blobTree(sb, t.x, t.by, t.h, L, Tk, rng, { sway: 0.8 });
        feet.push({ x: t.x, by: t.by, w: c.w, h: t.h });
        if (t.lv) crowns.push(c);
    });
    treeShadows(sc, feet, R.flat(0), 0.3);
    sc.addSway(sb, 0.7);
    footTufts(sc, feet.filter(f => f.h > U * 0.3), sc.ramp(Q.litter, 0, 'blade'));
    leafFall(sc, rng, crowns, Lv[3][0]);
}

export const SUNSETS = { peaks, lavender, road, dusklake, autumn };
export const SUNSET_HOURS = { peaks: 17.7, lavender: 17.5, road: 17.45, dusklake: 17.7, autumn: 17.1 };
