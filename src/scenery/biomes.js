// Scene templates. Each biome is a menu of optional elements (backdrops,
// framing, landmarks, foregrounds, weather); the seed picks from the menu and
// then varies every element's shape and placement.
import { Buf, Scene, wind } from './scene.js';
import { hex } from './lighting.js';
import { bayer, clamp, fbm1, fbm2, hash, lerp, makeRng, noise1, noise2, smoothstep } from './noise.js';
import { blades, blobTree, canopyRidge, celestial, conifer, cumulus, hill, mountains, seedOf, sky, sphereField, water } from './shapes.js';
import { DEFAULT_WEATHER, weatherOverlay, weatherSky } from './weather.js';
import { seasonAt } from './seasons.js';
import { BIOME_NAMES, DRAFT_BIOME_NAMES } from './catalog.js';
import { embers, fireflies, valleyMist } from './effects.js';
import { farmland, river, savanna, woodland } from './landscapes.js';
import { WILDS, WILD_HOURS } from './wilds.js';
import { PLACES, PLACE_HOURS } from './places.js';
import { VISTAS, VISTA_HOURS } from './vistas.js';
import { SKYLINES, SKYLINE_HOURS } from './skyline.js';
import { NOOKS, NOOK_HOURS } from './nooks.js';

// Four tones per material: two shadow tones, then their lit counterparts.
export const P = {
    rock: ['#3a4566', '#4c5a80', '#6e7fa6', '#93a4c6'],
    snow: ['#8fa2c4', '#b3c4de', '#e4edf6', '#ffffff'],
    mossRock: ['#28463d', '#335447', '#4b7659', '#69966f'],
    blueRock: ['#294d88', '#4e5f92', '#3b78c6', '#5590da'],
    forest: ['#152c22', '#1d3a2b', '#2a5539', '#3a6d45'],
    canopy: ['#1d5848', '#256a52', '#3a9663', '#58b473'],
    leaf: ['#0e2619', '#163a22', '#215529', '#317232', '#4f923a', '#86bb4c', '#c2dc6a'],
    grass: ['#3a6e3c', '#4a8a45', '#6cae55', '#9ccc68'],
    grassHi: ['#9fc25c', '#bfd672', '#e2e294', '#f2ecae'],
    hill: ['#2a5638', '#376842', '#4c8650', '#68a05e'],
    trunk: ['#30231d', '#463225', '#6b4a33', '#8a6242'],
    lake: ['#17646e', '#24878e', '#3caaa6', '#86dccf'],
    sea: ['#1a4c84', '#2564a2', '#4590c6', '#a8d8f2'],
    canal: ['#0f1a30', '#17253f', '#24365a', '#3d527c'],
    sand: ['#b5804c', '#cc9b60', '#e3bb7a', '#f3d899'],
    mesa: ['#76382a', '#924c37', '#c26b44', '#e0905c'],
    stone: ['#5a4a44', '#6e5c52', '#a08672', '#c2a88e'],
    cliff: ['#4f4a58', '#625c6a', '#958a8a', '#bbb0a2'],
    cactus: ['#264c30', '#356538', '#55904e', '#79b062'],
    wall: ['#8a7660', '#a08a70', '#d2c0a0', '#ece0c4'],
    roof: ['#5a2f2a', '#6e3a30', '#a85a44', '#c8745a'],
    slate: ['#33384e', '#3e4560', '#5f6a8e', '#7a87ac'],
    struct: ['#10162a', '#171f36', '#212b48', '#2e3a5e'],
    ground: ['#0e1323', '#141a2d', '#1b2338', '#232d46'],
};
export const FLOWERS = ['#e77fa0', '#f4e6a2', '#a9baff', '#ffffff'];
export const LIGHTS = { warm: '#ffcf7a', amber: '#ffa64d', cool: '#bfe6ff', white: '#fff4d6', red: '#ff3b30' };

// Season group of each palette (see seasons.js).
function seasonGroups(sc) {
    const g = (name, ...pals) => pals.forEach(p => sc.groups.set(p, name));
    g('grass', P.grass, P.grassHi, P.hill);
    g('conifer', P.forest);
    g('canopy', P.canopy);
    g('moss', P.mossRock);
    g('rock', P.rock, P.blueRock, P.cliff, P.stone);
    g('water', P.lake, P.canal);
    g('ground', P.ground, P.roof, P.slate);
    g('bark', P.trunk);
}

export const leafVariant = rng => pick(rng, [0, 1], [1, 1], [2, 1], [3, 0.6]);

// Weighted choice: pick(rng, [value, weight], ...).
export const pick = (rng, ...opts) => {
    let r = rng() * opts.reduce((s, o) => s + o[1], 0);
    for (const [v, w] of opts) if ((r -= w) < 0) return v;
    return opts[opts.length - 1][0];
};

// ---------------------------------------------------------------- shared

// Weather picks from its own random stream. `kinds` override the default
// weights for auto choice; every other default is scaled by `rest`.
export const weather = (sc, hz, kinds = [], rest = 1) => weatherSky(sc, hz, [...DEFAULT_WEATHER.filter(([k]) => !kinds.some(([q]) => q === k)).map(([k, w]) => [k, w * rest]), ...kinds]);

// Plain ground from y down, so no layer combination can leave sky showing through.
export function ground(sc, y, ramp, d) {
    const { W, H } = sc, b = new Buf(W, H), v = sc.ramp(ramp, d).flat(1);
    for (let yy = Math.round(y); yy < H; yy++) for (let x = 0; x < W; x++) b.set(x, yy, v);
    sc.addStatic(b);
}

// Envelope for a range: where along the width the mountains stand tall.
export function envelope(rng) {
    const c = rng.range(0.2, 0.8), w = rng.range(0.15, 0.4);
    return pick(rng,
        [() => 1, 2],
        [u => 0.3 + 0.7 * u ** 1.2, 1],
        [u => 0.3 + 0.7 * (1 - u) ** 1.2, 1],
        [u => 0.25 + 0.75 * smoothstep(0, 0.5, Math.abs(u - c)), 1.5],    // valley
        [u => 0.2 + 0.8 * (1 - smoothstep(0, w, Math.abs(u - c))), 1.5],  // single massif
    );
}

export function coniferRidge(sc, rng, o) {
    const { W } = sc, b = new Buf(W, sc.H), R = sc.ramp(o.ramp, o.d), s = seedOf(rng);
    const h = Float32Array.from({ length: W }, (_, x) => o.base - (o.base - o.top) * (0.2 + 0.8 * fbm1(x * 0.02, s, 3)));
    for (let x = 0; x < W; x++) {
        for (let y = Math.ceil(h[x]); y <= o.base; y++) b.set(x, y, R.flat(hash(x, y, s) < 0.15 ? 1 : 0));
    }
    const trees = [];
    for (let x = -4; x < W + 4; x += rng.range(1.5, 3.5) / (o.density ?? 1)) {
        trees.push({ x, by: h[clamp(Math.round(x), 0, W - 1)] + rng.range(1, 4), h: rng.range(o.tmin, o.tmax) });
    }
    trees.sort((a, c) => a.by - c.by).forEach(t => conifer(b, t.x, t.by, t.h, R, rng));
    sc.addStatic(b);
}

// Boulders: squashed sphere clusters lit like everything else.
export function rock(b, cx, by, r, R, rng) {
    const spheres = Array.from({ length: rng.int(1, 3) }, (_, i) => ({ x: cx + (i ? rng.range(-r, r) * 0.7 : 0), y: by - r * 0.5, r: r * (i ? rng.range(0.5, 0.8) : 1), z: 0 }));
    const F = sphereField(spheres);
    for (let j = 0; j < F.h; j++) {
        for (let i = 0; i < F.w; i++) {
            const o = j * F.w + i, y = F.y0 + j;
            if (F.id[o] < 0 || y > by) continue;
            b.set(F.x0 + i, y, R.face(F.nx[o] < 0 ? -1 : 1, F.ny[o] < -0.35 ? 1 : 0));
        }
    }
}

// Cottage with a gable roof and windows that light up at dusk.
export function house(sc, b, cx, by, w, h, wall, roof, lights) {
    cx = Math.round(cx); by = Math.round(by);
    const x0 = cx - (w >> 1), rh = Math.ceil(w * 0.45);
    for (let y = by - h; y <= by; y++) for (let x = x0; x < x0 + w; x++) b.set(x, y, wall.face(x < cx ? -1 : 1, y === by - h ? 1 : 0));
    for (let k = 0; k <= rh; k++) {
        const y = by - h - k, hw = w / 2 + 1 - k * (w / 2 + 1) / rh;
        for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) b.set(x, y, roof.face(x < cx ? -1 : 1, k === 0 ? 0 : 1));
    }
    const win = sc.slot({ k: 'emit', c: hex(LIGHTS.warm), base: wall.c[0], d: wall.d, v: 1 });
    for (let x = x0 + 1; x < x0 + w - 1; x += 3) if (lights()) b.set(x, by - Math.ceil(h / 2), win);
}

// ---------------------------------------------------------------- lake

function bank(sc, rng, side, wl, kind) {
    const { W, H } = sc, b = new Buf(W, H), sb = new Buf(W, H, { sway: true, rank: true });
    const G = sc.ramp(P.hill, 0.04), B = sc.ramp(P.hill, 0.04, 'blade'), F = sc.ramp(P.forest, 0), T = sc.ramp(P.trunk, 0), s = seedOf(rng);
    const L = sc.leaves(P.leaf, 0, leafVariant(rng)), crowns = [];
    const xTop = W * (side > 0 ? rng.range(0.6, 0.85) : rng.range(0.15, 0.4));
    const xBot = W * (side > 0 ? rng.range(0.3, 0.55) : rng.range(0.45, 0.7));
    const yTop = wl + rng.range(3, 14);
    const edge = y => lerp(xTop, xBot, ((y - yTop) / (H - yTop)) ** 0.75) + (fbm1(y * 0.07, s) - 0.5) * 16;
    for (let y = Math.ceil(yTop); y < H; y++) {
        const ex = edge(y);
        for (let x = 0; x < W; x++) {
            const e = (x - ex) * side;
            if (e < 0) continue;
            const lv = fbm2(x * 0.04 + y * 0.03 * side, y * 0.1, s + 1, 3) > 0.52 ? 1 : 0;
            b.set(x, y, e < 1.5 ? F.flat(0) : e < 3 && bayer(x, y) < 0.5 ? F.flat(1) : G.face(-side, lv));
            if (e > 2 && rng.chance(0.05 + 0.18 * (y - yTop) / (H - yTop))) {
                blades(sb, rng, x, y, 2 + 6 * (y - yTop) / (H - yTop), [B.face(-side, 1), B.flat(3)], null);
            }
        }
    }
    const far = side > 0 ? W - 1 : 0;
    const spot = (by, inset = 6) => lerp(edge(by) + side * inset, far - side * 4, rng());
    const trees = [];
    for (let i = rng.int(1, 4); i > 0; i--) {
        const by = rng.range(yTop + 12, H * 0.95);
        trees.push({ x: spot(by, 10), by, h: sc.U * (i === 1 ? rng.range(0.6, 0.92) : rng.range(0.3, 0.65)) });
    }
    for (let i = rng.int(0, 7); i > 0; i--) {
        const by = rng.range(yTop + 2, yTop + 20);
        trees.push({ x: spot(by, 3), by, h: rng.range(12, 34) });
    }
    for (let i = rng.int(0, 4); i > 0; i--) {
        const by = rng.range(yTop + 6, H - 2);
        rock(b, spot(by, 4), by, rng.range(2, 6), sc.ramp(P.cliff, 0.02), rng);
    }
    trees.sort((a, c) => a.by - c.by).forEach(t => {
        if (kind === 'conifer' || (kind === 'mixed' && rng.chance(0.5))) conifer(sb, t.x, t.by, t.h, F, rng, { sway: Math.min(1, t.h / sc.U), trunk: T });
        else crowns.push(blobTree(sb, t.x, t.by, t.h * 0.75, L, T, rng, { sway: Math.min(1, t.h / sc.U) }));
    });
    sc.addStatic(b);
    sc.addSway(sb, 0.9);
    leafFall(sc, rng, crowns, L);
}

export function reeds(sc, rng, wl) {
    const { W, H } = sc, sb = new Buf(W, H, { sway: true }), G = sc.ramp(P.hill, 0, 'blade');
    for (let c = rng.int(1, 3); c > 0; c--) {
        const cx = rng.pick([rng.range(0, W * 0.25), rng.range(W * 0.75, W)]), cy = rng.range(H * 0.85, H + 4);
        for (let i = rng.int(20, 50); i > 0; i--) blades(sb, rng, Math.round(cx + rng.range(-18, 18)), Math.round(cy + rng.range(-4, 4)), rng.range(8, 22), [G.flat(1), G.flat(3)], null);
    }
    sc.addSway(sb, 1);
}

function lake(sc, rng) {
    const { H, U } = sc;
    const side = pick(rng, [1, 2], [-1, 2], [0, 1]);
    const wl = sc.horizon = sc.horizonAt(rng.range(0.5, 0.66));
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, wl, [['fog', 0.8]]);
    const snowy = rng.chance(0.75);
    mountains(sc, rng, { d: 0.48, base: wl, top: lerp(Math.max(H * 0.06, wl - U * 0.54), wl - U * 0.18, rng() ** 1.5), ramp: P.rock, snow: snowy && P.snow, freq: rng.range(0.007, 0.015), mist: 16, snowAt: rng.range(0.25, 0.5), env: envelope(rng) });
    if (rng.chance(0.45)) cumulus(sc, rng, { n: rng.int(2, 6), y0: wl - 26, y1: wl - 10, w0: 30, w1: 60, d: 0.45, speed: 0.7, tall: [0.12, 0.2] });
    if (rng.chance(0.8)) mountains(sc, rng, { d: 0.26, base: wl, top: wl - U * rng.range(0.12, 0.32), ramp: rng.chance(0.7) ? P.mossRock : P.rock, freq: rng.range(0.012, 0.022), mist: 12, env: envelope(rng) });
    if (rng.chance(0.65)) coniferRidge(sc, rng, { d: 0.14, base: wl + 1, top: wl - rng.range(3, 10), ramp: P.forest, tmin: 4, tmax: rng.range(8, 16), density: rng.range(0.5, 1.2) });
    else canopyRidge(sc, rng, { d: 0.14, base: wl + 1, top: wl - 5, bottom: wl + 1, ramp: P.canopy, rmin: 2, rmax: 5, rows: 1 });
    water(sc, rng, { y0: wl + 1, ramp: P.lake, mix: rng.range(0.3, 0.5), fres: 0.8, waves: rng.range(0.04, 0.1) });
    if (side) bank(sc, rng, side, wl, pick(rng, ['conifer', 3], ['leafy', 1.7], ['mixed', 1]));
    else reeds(sc, rng, wl);
}

// ---------------------------------------------------------------- grassland & hills

// `pal` is [base, highlight] grass palettes; `tall` scales the blades.
export function meadow(sc, rng, { top, amp = 3, d = 0, flowers = 0.06, blades: density = 0.22, pal = [P.grass, P.grassHi], tall = 1, blade = 'blade' }) {
    const { W, H } = sc, b = new Buf(W, H), sb = new Buf(W, H, { sway: true, rank: true });
    const G = sc.ramp(pal[0], d), Y = sc.ramp(pal[1], d), B = sc.ramp(pal[0], d, blade), s = seedOf(rng);
    const fl = FLOWERS.map(c => sc.slot({ k: 'mat', c: hex(c), d }));
    const hiAt = rng.range(0.55, 0.72);
    const ty = Float32Array.from({ length: W }, (_, x) => top + (fbm1(x * 0.01, s) - 0.5) * amp * 2);
    for (let x = 0; x < W; x++) {
        for (let y = Math.ceil(ty[x]); y < H; y++) {
            const dy = y - ty[x], z = Math.log(1 + dy * 0.12) * 6;
            const v = fbm2(x * 0.012 + z * 0.2, z * 1.1, s + 1, 3);
            let lv = clamp(Math.floor((v * 1.6 - 0.3) * 4 + (hash(x, y, s) - 0.5) * 0.5), 0, 3);
            if (dy < 1) lv = 3;
            b.set(x, y, (fbm2(x * 0.02, z * 1.4, s + 2, 3) > hiAt ? Y : G).flat(lv));
        }
    }
    for (let y = Math.round(top + (H - top) * 0.35); y < H; y++) {
        const p = (y - top) / (H - top);
        for (let x = 0; x < W; x++) {
            if (rng() < density * p * p) blades(sb, rng, x, y, 2 + p * 8 * tall, [B.flat(2), B.flat(3)], rng.chance(flowers * 12) ? fl : null);
        }
    }
    sc.addStatic(b);
    sc.addSway(sb, 0.8);
    return ty;
}

function village(sc, rng, h, d, y0) {
    const { W, H } = sc, b = new Buf(W, H), wall = sc.ramp(P.wall, d), roof = sc.ramp(rng.chance(0.5) ? P.roof : P.slate, d);
    const cx = rng.range(W * 0.15, W * 0.85), n = rng.int(2, 6), s = 6 + (1 - d) * 4;
    for (let i = 0; i < n; i++) {
        const x = Math.round(clamp(cx + rng.range(-1, 1) * n * s, 4, W - 5));
        house(sc, b, x, (h ? h[x] : y0) + rng.range(1, 4), Math.round(s * rng.range(0.8, 1.2)), Math.round(s * 0.45), wall, roof, () => rng.chance(0.6));
    }
    sc.addStatic(b);
}

// Leaves shaken loose from foreground crowns, tumbling downwind to the ground; from
// blossoming trees (leaf variant 3, 4) petals too in spring, slower and further.
export function leafFall(sc, rng, crowns, R) {
    if (!crowns.length) return;
    const { W, H } = sc, slots = [R.at(0, -0.5, 0.8, 3), R.at(-0.5, 0, 0.8, 2), R.at(0.5, 0.5, 0.7, 2)];
    const petals = R.v >= 3 && ['#f6c4d6', '#fff0f4', '#e49ab4'].map(c => sc.slot({ k: 'mat', c: hex(c), d: 0 }));
    const leaves = [];
    for (const c of crowns) {
        for (let i = Math.round(0.6 * c.w); i > 0; i--) {
            leaves.push({ x: c.x + rng.range(-1, 1) * c.w, y: c.y + rng.range(-0.6, 0.8) * c.h, fall: c.by - c.y + c.h, period: rng.range(7, 16), ph: rng(), slot: rng.pick(slots), big: rng.chance(0.3) });
        }
    }
    sc.addFn((f, t) => {
        const S = sc.S, n = Math.floor(leaves.length * clamp(0.2 + S.autumn * 0.8) * Math.min(1, S.leafy * 3));
        for (let i = 0; i < n; i++) {
            const l = leaves[i], age = (t / l.period + l.ph) % 1;
            const x = Math.round(l.x + age * 40 + Math.sin(age * 9 + l.ph * 6) * 3 + wind(l.x, t) * 2);
            const y = Math.round(l.y + age * l.fall);
            if (x < 0 || y < 0 || x >= W - 1 || y >= H) continue;
            f[y * W + x] = l.slot;
            if (l.big && (age * 9) % 1 < 0.5) f[y * W + x + 1] = l.slot;
        }
        const m = petals ? Math.floor(leaves.length * 1.6 * S.bloom) : 0;
        for (let i = 0; i < m; i++) {
            const l = leaves[i % leaves.length], age = (t / (l.period * 1.5) + l.ph + (i >= leaves.length ? 0.5 : 0)) % 1;
            const x = Math.round(l.x + age * 70 + Math.sin(age * 7 + l.ph * 6) * 6 + wind(l.x, t) * 3), y = Math.round(l.y + age * l.fall * 1.1);
            if (x >= 0 && y >= 0 && x < W && y < H) f[y * W + x] = petals[i % 3];
        }
    });
}

export function loneTrees(sc, rng, n, h, kind) {
    if (!n) return;
    const { W, H } = sc, sb = new Buf(W, H, { sway: true, rank: true });
    const D = sc.ramp(P.forest, 0), T = sc.ramp(P.trunk, 0), crowns = [];
    let F;
    for (let i = 0; i < n; i++) {
        // A single tree is often the hero of the picture: big and off-centre.
        const hero = n === 1 && rng.chance(0.6);
        const x = hero ? Math.round(W * (rng.chance(0.5) ? rng.range(0.2, 0.38) : rng.range(0.62, 0.8))) : rng.int(10, W - 11);
        const by = hero ? Math.min(H + 4, h[x] + rng.range(20, 40)) : h[x] + rng.range(6, 20), th = hero ? sc.U * rng.range(0.55, 0.8) : rng.range(28, 60);
        if (kind === 'conifer') conifer(sb, x, by, th * 1.4, D, rng, { sway: 0.6, trunk: T });
        else crowns.push(blobTree(sb, x, by, th, F = sc.leaves(P.leaf, 0, leafVariant(rng)), T, rng, { sway: 1 }));
    }
    sc.addSway(sb, 0.8);
    if (F) leafFall(sc, rng, crowns, F);
}

function grassland(sc, rng) {
    const { W, H } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.42, 0.6));
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz);
    const back = pick(rng, ['blue', 2], ['snow', 1], ['hills', 1], ['none', 1]);
    if (back === 'blue') mountains(sc, rng, { d: 0.32, base: hz + 8, top: hz - sc.U * rng.range(0.1, 0.3), ramp: P.blueRock, freq: rng.range(0.006, 0.014), mist: 10, env: envelope(rng) });
    if (back === 'snow') mountains(sc, rng, { d: 0.42, base: hz + 8, top: hz - sc.U * rng.range(0.15, 0.32), ramp: P.rock, snow: P.snow, freq: rng.range(0.008, 0.014), mist: 10, env: envelope(rng) });
    if (back === 'hills') hill(sc, rng, { d: 0.45, y: hz + 4, amp: 10, freq: 0.01, ramp: P.hill, bottom: hz + 30 });
    const mid = pick(rng, ['canopy', 3], ['conifer', 1], ['open', 1.2]);
    const midTop = hz + rng.range(0, 8);
    ground(sc, midTop + 4, P.hill, 0.25);
    if (mid === 'canopy') canopyRidge(sc, rng, { d: 0.14, base: midTop + 14, top: midTop, bottom: H - 1, ramp: P.canopy, rmin: 3, rmax: rng.range(5, 9), rows: 3 });
    if (mid === 'conifer') coniferRidge(sc, rng, { d: 0.16, base: midTop + 14, top: midTop + 4, ramp: P.forest, tmin: 6, tmax: 14 });
    if (mid === 'open') hill(sc, rng, { d: 0.22, y: midTop + 8, amp: 6, freq: 0.012, ramp: P.hill, bottom: H - 1 });
    const top = midTop + rng.range(9, 13);
    if (rng.chance(0.4)) village(sc, rng, null, 0.12, top - 1);
    const ty = meadow(sc, rng, { top, flowers: rng.range(0, 0.12), blades: rng.range(0.1, 0.3) });
    loneTrees(sc, rng, pick(rng, [0, 3], [1, 2], [2, 1], [3, 0.5]), ty, pick(rng, ['leafy', 3.5], ['conifer', 1]));
}

function hills(sc, rng) {
    const { W, H } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.5, 0.68));
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz);
    if (rng.chance(0.3)) mountains(sc, rng, { d: 0.6, base: hz + 4, top: hz - sc.U * rng.range(0.08, 0.2), ramp: P.blueRock, freq: 0.01, mist: 8, env: envelope(rng) });
    ground(sc, hz + 4, P.hill, 0.6);
    const n = rng.int(3, 6), span = H * 0.92 - hz, density = rng.range(0, 1);
    const kind = pick(rng, ['leafy', 3.6], ['conifer', 1]);
    const villageAt = rng.chance(0.3) ? rng.int(1, n - 2) : -1;
    let last;
    for (let k = 0; k < n; k++) {
        const p = k / (n - 1), d = 0.62 * (1 - p), fg = k === n - 1;
        const D = sc.ramp(P.forest, d), T = sc.ramp(P.trunk, d);
        last = hill(sc, rng, {
            d, y: hz + (k / n) * span + 4, amp: 5 + p * rng.range(10, 22), freq: rng.range(0.006, 0.013) * (1 - p * 0.4), ramp: P.hill,
            mist: fg ? null : [10 + k * 4, 18 + k * 4],
            trees: !fg && k > 0 ? (b, h) => {
                for (let i = Math.round(density * rng.range(2, 12)); i > 0; i--) {
                    const x = rng.int(0, W - 1), s = 4 + p * 14 * rng.range(0.7, 1.2);
                    if (kind === 'conifer') conifer(b, x, h[x] + rng.range(2, 8), s * 1.4, D, rng);
                    else blobTree(b, x, h[x] + rng.range(2, 8), s, sc.leaves(P.leaf, d, leafVariant(rng)), T, rng);
                }
            } : null,
        });
        if (k === villageAt) village(sc, rng, last, d, 0);
    }
    const G = sc.ramp(P.grass, 0, 'blade'), sb = new Buf(W, H, { sway: true });
    for (let x = 0; x < W; x++) {
        for (let y = Math.ceil(last[x]); y < H; y += 2) {
            const p = (y - last[x]) / (H - last[x]);
            if (rng() < 0.05 + 0.2 * p) blades(sb, rng, x, y, 2 + p * 7, [G.flat(2), G.flat(3)], null);
        }
    }
    sc.addSway(sb, 0.8);
    loneTrees(sc, rng, pick(rng, [0, 2], [1, 2], [2, 1], [3, 0.4]), last, kind);
}

// ---------------------------------------------------------------- desert

export function mesa(sc, rng, o) {
    const { W } = sc, b = new Buf(W, sc.H), R = sc.ramp(o.ramp, o.d), s = seedOf(rng);
    const raw = Float32Array.from({ length: W }, (_, x) => fbm1(x * (o.freq ?? 0.011), s, 3));
    let lo = Infinity, hi = -Infinity;
    for (const v of raw) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const h = raw.map((v, x) => {
        const m = clamp(((v - lo) / (hi - lo) - (1 - o.cover)) * 8);
        return o.base - (o.base - o.top) * (0.1 + 0.9 * m) + noise1(x * 0.4, s + 1) * 1.5;
    });
    // Each plateau's left half faces left and right half faces right.
    const sideOf = new Int8Array(W);
    for (let x = 0; x < W;) {
        let e = x;
        const tall = h[x] < o.base - (o.base - o.top) * 0.4;
        while (e < W && (h[e] < o.base - (o.base - o.top) * 0.4) === tall) e++;
        for (let i = x; i < e; i++) sideOf[i] = tall ? (i < (x + e) / 2 ? -1 : 1) : (h[Math.min(W - 1, i + 2)] - h[Math.max(0, i - 2)] >= 0 ? 1 : -1);
        x = e;
    }
    for (let x = 0; x < W; x++) {
        const flatTop = Math.abs(h[Math.min(W - 1, x + 1)] - h[Math.max(0, x - 1)]) < 2.5;
        for (let y = Math.max(0, Math.floor(h[x])); y <= o.base; y++) {
            const dd = y - h[x];
            if (dd < 1.5 && flatTop) { b.set(x, y, R.flat(3)); continue; }
            const band = Math.floor((y + noise1(x * 0.08, s + 2) * 3) / 3) % 3 === 0;
            b.set(x, y, R.face(sideOf[x], band ? 0 : 1));
        }
    }
    sc.addStatic(b);
}

function cactus(b, x, by, h, C, rng) {
    const top = by - h;
    for (let y = Math.round(top); y <= by; y++) {
        const cap = y === Math.round(top);
        if (!cap) b.set(x - 1, y, C.face(-1, 1));
        b.set(x, y, C.face(-1, y % 3 ? 1 : 0));
        if (!cap) b.set(x + 1, y, C.face(1, 0));
    }
    for (let a = rng.int(0, 2); a > 0; a--) {
        const dir = rng.chance(0.5) ? -1 : 1, ay = Math.round(by - h * rng.range(0.3, 0.6));
        const reach = rng.int(2, 3), up = rng.int(3, Math.max(3, Math.round(h * 0.4)));
        for (let k = 1; k <= reach; k++) { b.set(x + dir * (1 + k), ay, C.face(dir, 0)); b.set(x + dir * (1 + k), ay - 1, C.face(dir, 1)); }
        for (let k = 0; k < up; k++) {
            b.set(x + dir * (reach + 1), ay - 1 - k, C.face(-1, 1));
            b.set(x + dir * (reach + 2), ay - 1 - k, C.face(1, 0));
        }
    }
}

// Rows of dunes: long windward slopes, steep slip faces that run diagonally
// down from each crest, wind ripples on the flats between.
function dune(sc, rng, o) {
    const { W, H } = sc, b = new Buf(W, H), s = seedOf(rng);
    const dir = rng.chance(0.5) ? 1 : -1;
    const C = sc.ramp(P.cactus, 0), St = sc.ramp(P.stone, 0);
    for (let k = 0; k < o.rows; k++) {
        const p = o.rows > 1 ? k / (o.rows - 1) : 1;
        const R = sc.ramp(o.ramp, o.d * (1 - p * 0.7));
        const y0 = lerp(o.y0, o.y1, p), amp = lerp(o.amp * 0.5, o.amp, p);
        const f = rng.range(0.005, 0.01) / (0.6 + p), ks = s + k * 17;
        const h = Float32Array.from({ length: W }, (_, x) => {
            const u = x * f * dir + fbm1(x * 0.01, ks, 2) * 2.5, fr = u - Math.floor(u);
            const c = fr < 0.7 ? fr / 0.7 : (1 - fr) / 0.3;
            return y0 - amp * (0.25 + 0.75 * c ** 1.5);
        });
        for (let x = 0; x < W; x++) {
            for (let y = Math.max(0, Math.ceil(h[x])); y < H; y++) {
                const dd = y - h[x];
                const jx = clamp(Math.round(x - dir * dd * 0.9), 1, W - 2);
                const slope = h[jx + 1] - h[jx - 1];
                const onFace = dd < amp * 1.2 && Math.abs(slope) > 0.05;
                const rip = Math.sin(x * 0.4 + y * 1.5 + fbm2(x * 0.03, y * 0.05, ks + 1, 2) * 8) > 0.74;
                b.set(x, y, onFace ? R.face(slope >= 0 ? 1 : -1, dd < 1 || rip ? 1 : 0) : R.flat(rip ? 2 : 1));
            }
        }
        if (k === o.rows - 1) {
            for (let i = o.cacti; i > 0; i--) {
                const x = rng.int(6, W - 7);
                cactus(b, x, h[x] + rng.range(4, 22), rng.range(8, 26), C, rng);
            }
            for (let i = o.rocks; i > 0; i--) {
                const x = rng.int(4, W - 5);
                rock(b, x, h[x] + rng.range(4, 30), rng.range(2, 7), St, rng);
            }
        }
    }
    sc.addStatic(b);
}

// Heat haze: wobble rows near the horizon sideways.
export function shimmer(sc, y0, y1) {
    const { W } = sc, tmp = new Uint16Array(W);
    sc.addFn((f, t, L) => {
        if (L.day < 0.5) return;
        for (let y = Math.max(0, y0); y < y1; y++) {
            const k = Math.sin(Math.PI * (y - y0) / (y1 - y0));
            const dx = Math.round(Math.sin(y * 1.3 + t * 3.4) * 0.7 * k + Math.sin(y * 0.37 - t * 1.9) * 0.5 * k);
            if (!dx) continue;
            const row = f.subarray(y * W, (y + 1) * W);
            tmp.set(row);
            for (let x = 0; x < W; x++) row[x] = tmp[clamp(x - dx, 0, W - 1)];
        }
    });
}

function desert(sc, rng) {
    const { H } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.5, 0.66));
    sc.bias = rng.range(-0.5, 0.5);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['clear', 3], ['sparse', 2], ['scattered', 1.5], ['haze', 1.2], ['dust', 0.8], ['towering', 0.5]], 0.3);
    if (rng.chance(0.4)) mountains(sc, rng, { d: 0.55, base: hz + 2, top: hz - sc.U * rng.range(0.1, 0.22), ramp: P.mesa, freq: rng.range(0.008, 0.016), mist: 10, env: envelope(rng) });
    ground(sc, hz + 1, P.sand, 0.35);
    const layers = pick(rng, [0, 1], [1, 2], [2, 2]);
    for (let k = 0; k < layers; k++) {
        const near = k === layers - 1 && layers > 1;
        mesa(sc, rng, {
            d: near ? 0.24 : 0.45, base: hz + (near ? 8 : 2), top: hz - sc.U * rng.range(near ? 0.18 : 0.1, near ? 0.36 : 0.22),
            ramp: P.mesa, cover: rng.range(0.15, 0.55), freq: pick(rng, [0.011, 3], [0.025, 1]),
        });
    }
    shimmer(sc, hz - 34, hz + 10);
    dune(sc, rng, { d: 0.2, y0: hz + 12, y1: H * rng.range(0.84, 0.94), amp: rng.range(10, 24), rows: rng.int(2, 5), ramp: P.sand, cacti: pick(rng, [0, 1], [rng.int(1, 3), 2], [rng.int(4, 9), 1]), rocks: rng.int(0, 6) });
}

// ---------------------------------------------------------------- seaside

function cliff(sc, rng, side, hz, lighthouse) {
    const { W, H } = sc, b = new Buf(W, H), R = sc.ramp(P.cliff, 0.1), G = sc.ramp(P.grass, 0.1), s = seedOf(rng);
    const edge = W * (side > 0 ? rng.range(0.6, 0.85) : rng.range(0.15, 0.4));
    const top = lerp(Math.max(H * 0.18, hz - sc.U * 0.4), hz - 8, rng.range(0, 0.7));
    const foot = x => hz + 12 + noise1(x * 0.1, s + 3) * 4;
    const inland = x => (x - edge) * side + (noise1(x * 0.05, s) - 0.5) * 10;
    const h = Float32Array.from({ length: W }, (_, x) => {
        const u = inland(x);
        if (u < 0) return Infinity;
        return lerp(foot(x), top + (fbm1(x * 0.02, s + 1, 3) - 0.5) * 14 - u * 0.08, smoothstep(0, 9, u));
    });
    for (let x = 0; x < W; x++) {
        if (!isFinite(h[x])) continue;
        const fy = foot(x), steep = Math.abs(h[Math.min(W - 1, x + 1)] - h[Math.max(0, x - 1)]) > 3;
        for (let y = Math.max(0, Math.floor(h[x])); y <= fy; y++) {
            const dd = y - h[x];
            const grass = dd < 3 + noise1(x * 0.2, s + 2) * 4 && !steep;
            const streak = noise2(x * 0.7, y * 0.05, s + 4);
            const strata = Math.floor((y + noise1(x * 0.06, s + 6) * 4) / 5) % 2 === 0;
            // The face looks out to sea, so it darkens when the sun is behind the cliff.
            let v = R.face(-side, streak > 0.6 || (strata && streak > 0.4) ? 1 : 0);
            if (streak < 0.22 || fy - y < 3 + noise1(x * 0.3, s + 7) * 3) v = R.flat(0);
            b.set(x, y, grass ? G.face(-side, dd < 1 ? 1 : 0) : v);
        }
    }
    let beacon = null;
    if (lighthouse) {
        const W1 = sc.ramp(['#a8a4a8', '#c4c0c4', '#eeeae4', '#ffffff'], 0.1), Rd = sc.ramp(['#7a2a26', '#8e3430', '#c44a40', '#de6a5a'], 0.1);
        // Stand it on the plateau: past the edge's slope, on the lowest ground under its footprint.
        let lx = Math.round(edge);
        while (lx >= 0 && lx < W && [0, 1, 2, 3, 4].some(k => inland(lx + k * side) < 11)) lx += side;
        lx = clamp(lx + side * rng.int(2, 14), 2, W - 3);
        const ly = Math.round(Math.max(...[-1, 0, 1, 2].map(k => h[clamp(lx + k, 0, W - 1)]))) + 1, lh = rng.int(14, 22);
        for (let y = ly - lh; y <= ly; y++) {
            const band = Math.floor((y - ly) / 4) % 2 === 0;
            for (let k = -1; k <= 2; k++) b.set(lx + k, y, (band ? Rd : W1).face(k < 1 ? -1 : 1, 1));
        }
        for (let k = -2; k <= 3; k++) b.set(lx + k, ly - lh - 1, R.flat(0));
        beacon = { x: lx, y: ly - lh - 3, slot: sc.slot({ k: 'emit', c: hex(LIGHTS.white), base: R.c[1], d: 0.1, v: 1 }) };
        for (let k = 0; k <= 1; k++) b.set(lx + k, ly - lh - 4, R.flat(0));
    }
    sc.addStatic(b);
    const foam = sc.slot({ k: 'mat', c: hex('#f2f8ff'), d: 0.1 });
    sc.addFn((f, t, L) => {
        for (let x = 0; x < W; x++) {
            if (!isFinite(h[x])) continue;
            const y = Math.round(foot(x));
            if (y < H && noise2(x * 0.3, t * 0.8, s + 5) > 0.55) f[y * W + x] = foam;
        }
        if (beacon) {
            const on = (t % 4) < 2.4;
            if (on) { f[beacon.y * W + beacon.x] = beacon.slot; f[beacon.y * W + beacon.x + 1] = beacon.slot; }
            // At night a beam sweeps out from the lamp.
            if (on && L.lights > 0.4) {
                const dir = Math.cos(t * Math.PI / 2) > 0 ? 1 : -1, reach = 30 + 40 * Math.abs(Math.cos(t * Math.PI / 2));
                for (let k = 2; k < reach; k++) {
                    const x = beacon.x + dir * k, spread = k * 0.08;
                    for (let dy = -spread; dy <= spread; dy++) {
                        const y = Math.round(beacon.y + dy);
                        if (x >= 0 && x < W && y >= 0 && bayer(x, y) < 0.45 * (1 - k / reach)) f[y * W + x] = beacon.slot;
                    }
                }
            }
        }
    });
}

function beach(sc, rng, top, rocky) {
    const { W, H } = sc, b = new Buf(W, H), R = sc.ramp(P.sand, 0), S = sc.ramp(P.sea, 0), St = sc.ramp(P.cliff, 0), s = seedOf(rng);
    const foam = sc.slot({ k: 'mat', c: hex('#f4fbff'), d: 0 });
    const ty = Float32Array.from({ length: W }, (_, x) => top + (fbm1(x * 0.01, s) - 0.5) * 8);
    for (let x = 0; x < W; x++) {
        for (let y = Math.ceil(ty[x]); y < H; y++) {
            const rip = Math.sin(x * 0.3 + y * 1.4 + fbm1(x * 0.05, s + 1) * 6) > 0.8;
            b.set(x, y, R.flat(rip ? 2 : 3));
        }
    }
    sc.addStatic(b);
    const wetSand = R.flat(1), shallow = S.flat(2), surf = S.flat(3);
    sc.addFn((f, t) => {
        for (let x = 0; x < W; x++) {
            const reach = (0.5 + 0.5 * Math.sin(t * 0.5 + fbm1(x * 0.008, s + 2) * 3)) * 8 + noise1(x * 0.06 + t * 0.3, s + 3) * 2;
            const y0 = Math.ceil(ty[x]), edge = Math.round(ty[x] + reach), wet = ty[x] + 10 + noise1(x * 0.05, s + 4) * 3;
            for (let y = y0; y < Math.min(H, wet); y++) {
                let v = wetSand;
                if (y < edge) v = y > edge - 3 ? surf : shallow;
                else if (y === edge) v = foam;
                f[y * W + x] = v;
            }
        }
    });
    if (rocky) {
        const rb = new Buf(W, H);
        for (let i = rng.int(4, 12); i > 0; i--) {
            const x = rng.int(0, W - 1);
            rock(rb, x, ty[x] + rng.range(2, H - ty[x]), rng.range(3, 10), St, rng);
        }
        sc.addStatic(rb);
    }
}

function boats(sc, rng, hz, n) {
    if (!n) return;
    const { W, H } = sc;
    const hull = sc.slot({ k: 'mat', c: hex('#4a3226'), d: 0.2 }), sail = sc.ramp(['#b8b2a8', '#d4cec2', '#f4f0e6', '#ffffff'], 0.2);
    const sailLit = sail.face(1, 1), sailShade = sail.face(-1, 0);   // made now: a slot made mid-frame has no colour yet
    const list = Array.from({ length: n }, () => ({ x: rng.range(0, W), y: hz + rng.range(3, (H - hz) * 0.45), v: rng.range(0.4, 1.6) * (rng.chance(0.5) ? 1 : -1) }));
    list.forEach(b => { b.s = 0.6 + (b.y - hz) / (H - hz) * 2.4; });
    sc.addFn((f, t) => {
        for (const b of list) {
            const span = W + 30, x = Math.round(((b.x + t * b.v) % span + span) % span) - 15;
            const y = Math.round(b.y + Math.sin(t * 1.3 + b.x) * 0.5), len = Math.round(4 * b.s), sh = Math.round(5 * b.s);
            const put = (px, py, v) => { if (px >= 0 && py >= 0 && px < W && py < H) f[py * W + px] = v; };
            for (let k = -len; k <= len; k++) put(x + k, y, hull);
            for (let k = 1 - len; k < len; k++) put(x + k, y + 1, hull);
            for (let r = 1; r <= sh; r++) {
                const w = Math.round((sh - r) * 0.6) + 1;
                for (let k = 0; k < w; k++) put(x + k, y - r, sailLit);
                if (r < sh * 0.7) for (let k = 1; k < w * 0.6; k++) put(x - k, y - r, sailShade);
            }
        }
    });
}

function seaside(sc, rng) {
    const { W, H } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.42, 0.58));
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz);
    const far = pick(rng, ['none', 1], ['left', 1], ['right', 1], ['islands', 1.5]);
    if (far === 'left' || far === 'right') {
        const r = far === 'left';
        mountains(sc, rng, { d: 0.5, base: hz, top: hz - rng.range(8, 24), ramp: P.mossRock, freq: 0.02, env: u => 1 - smoothstep(rng.range(0.1, 0.25), 0.45, r ? u : 1 - u) });
    }
    if (far === 'islands') {
        const isles = Array.from({ length: rng.int(1, 3) }, () => ({ c: rng.range(0.05, 0.95), w: rng.range(0.03, 0.12) }));
        mountains(sc, rng, { d: 0.5, base: hz, top: hz - rng.range(6, 20), ramp: P.mossRock, freq: 0.03, env: u => Math.max(...isles.map(i => 1 - smoothstep(i.w * 0.4, i.w, Math.abs(u - i.c)))) });
    }
    water(sc, rng, { y0: hz, ramp: P.sea, mix: 0.55, fres: 0.95, waves: rng.range(0.08, 0.15), speed: 4, glitter: true });
    boats(sc, rng, hz, pick(rng, [0, 2], [1, 2], [2, 1], [3, 0.5]));
    const cliffs = pick(rng, [[], 1], [[1], 1.2], [[-1], 1.2], [[1, -1], 0.4]);
    const lh = cliffs.length && rng.chance(0.4) ? rng.pick(cliffs) : 0;
    cliffs.forEach(side => cliff(sc, rng, side, hz, side === lh));
    const shore = pick(rng, ['sand', 3], ['rocky', 1.2], ['open', 0.8]);
    if (shore !== 'open') beach(sc, rng, H * rng.range(0.78, 0.9), shore === 'rocky');
}

// ---------------------------------------------------------------- industrial

function industrial(sc, rng) {
    const { W, H } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.6, 0.76));
    sc.bias = rng.range(-0.3, 0.3);
    sky(sc);
    celestial(sc, rng, { count: 60 });
    weather(sc, hz, [['streaks', 3], ['mixed', 2], ['overcast', 1], ['haze', 1], ['rain', 0.6], ['fog', 0.6]], 0.3);

    const lights = [];
    const emit = (R, c, v = 1) => sc.slot({ k: 'emit', c: hex(c), base: R.c[2], d: R.d, v });
    const light = (x, y, slot, blink = 0) => lights.push({ x: Math.round(x), y: Math.round(y), slot, blink, phase: rng() * 4 });

    const far = new Buf(W, H), FR = sc.ramp(P.struct, 0.55), farDensity = rng.range(0.3, 1);
    for (let x = 0; x < W; x += rng.range(2, 9) / farDensity) {
        const w = rng.int(3, 14), h = rng.int(1, 7), by = hz + rng.int(0, 2);
        for (let y = by - h; y <= by; y++) for (let k = 0; k < w; k++) far.set(x + k, y, FR.flat(0));
        for (let k = 0; k < w; k += 2) if (rng.chance(0.3)) light(x + k, by - rng.int(0, h), emit(FR, rng.pick([LIGHTS.warm, LIGHTS.cool, LIGHTS.white]), 0.8));
    }
    sc.addStatic(far);

    const G = sc.ramp(P.ground, 0), gs = seedOf(rng), ground = new Buf(W, H);
    for (let y = hz + 1; y < H; y++) {
        const p = (y - hz) / (H - hz);
        for (let x = 0; x < W; x++) ground.set(x, y, G.flat(clamp(Math.floor((fbm2(x * 0.008, y * 0.35, gs, 3) * 1.2 - p * 0.75 + 0.15) * 4), 0, 3)));
    }
    sc.addStatic(ground);

    const near = new Buf(W, H), S = sc.ramp(P.struct, 0.2);
    const box = (x0, y0, w, h, lvTop = 1) => {
        for (let y = Math.round(y0); y <= y0 + h; y++) {
            for (let x = Math.round(x0); x < x0 + w; x++) near.set(x, y, S.face(x < x0 + w / 2 ? -1 : 1, y < y0 + 1 ? lvTop : 0));
        }
    };
    const stacks = [], plumes = [], cables = [];
    const depth = rng.range(8, 20);
    const items = [];
    for (let i = rng.int(8, 34); i > 0; i--) items.push({ x: rng.range(4, W - 4), by: hz + rng.range(1, depth), type: pick(rng, ['chimney', 2], ['tank', 1], ['block', 2.5], ['pipe', 1]) });
    for (let i = pick(rng, [0, 1.2], [1, 1], [2, 0.6], [3, 0.3]); i > 0; i--) items.push({ x: rng.range(10, W - 10), by: hz + rng.range(2, depth), type: 'tower' });
    items.sort((a, c) => a.by - c.by);
    for (const it of items) {
        const { x, by } = it;
        if (it.type === 'chimney') {
            const w = rng.int(2, 4), h = rng.range(12, 46);
            box(x, by - h, w, h);
            box(x - 1, by - h, w + 2, 1, 1);
            stacks.push({ x: x + w / 2, y: by - h - 1, h });
            light(x + w / 2, by - h - 1, emit(S, rng.chance(0.5) ? LIGHTS.red : LIGHTS.amber), rng.chance(0.5) ? rng.range(1.6, 3) : 0);
            for (let y = by - h + 8; y < by - 3; y += rng.int(7, 12)) light(x - 1, y, emit(S, LIGHTS.amber, 0.8));
        } else if (it.type === 'tank') {
            const w = rng.int(8, 16), h = rng.int(4, 9);
            box(x + 1, by - h - 1, w - 2, 1, 1);
            box(x, by - h, w, h);
            for (let k = 1; k < w - 1; k += 3) if (rng.chance(0.4)) light(x + k, by - h + 2, emit(S, LIGHTS.warm, 0.8));
        } else if (it.type === 'block') {
            const w = rng.int(6, 22), h = rng.int(4, 16);
            box(x, by - h, w, h);
            for (let yy = by - h + 2; yy < by - 1; yy += 3) {
                for (let k = 1; k < w - 1; k += 2) if (rng.chance(0.28)) light(x + k, yy, emit(S, rng.pick([LIGHTS.warm, LIGHTS.warm, LIGHTS.cool, LIGHTS.white])));
            }
        } else if (it.type === 'tower') {
            // Cooling tower: hyperbolic waist, flared lip, big plume.
            const w = rng.int(14, 24), h = rng.int(18, 32);
            for (let y = by - h; y <= by; y++) {
                const p = (y - (by - h)) / h, hw = w / 2 * (0.68 + 0.32 * ((p - 0.35) / (p < 0.35 ? 0.35 : 0.65)) ** 2 * (p < 0.35 ? 0.5 : 1));
                for (let k = -hw; k <= hw; k++) near.set(x + k, y, S.face(k < 0 ? -1 : 1, p < 0.04 ? 1 : 0));
            }
            plumes.push({ x, y: by - h - 1, r: w * 0.35, rise: rng.range(40, 70) });
            light(x, by - h, emit(S, LIGHTS.red), 2.4);
        } else {
            const len = rng.int(10, 40), y = by - rng.int(2, 7);
            for (let k = 0; k < len; k++) near.set(x + k, y, S.flat(1));
        }
    }

    // Pylons striding across the plain, wires sagging between them.
    if (rng.chance(0.4)) {
        const by = hz + rng.range(4, depth + 6), ph = rng.int(18, 30), gap = rng.range(60, 120);
        const tops = [];
        for (let x = rng.range(-gap, 0); x < W + gap; x += gap) {
            for (let k = 0; k <= ph; k++) {
                const hw = (ph - k) / ph * ph * 0.18 + 1;
                near.set(x - hw, by - k, S.flat(1)); near.set(x + hw, by - k, S.flat(1));
                if (k % 4 === 0) for (let i = -hw; i <= hw; i++) if (bayer(Math.round(x + i), by - k) < 0.6) near.set(x + i, by - k, S.flat(0));
            }
            for (const [arm, aw] of [[ph * 0.75, ph * 0.35], [ph * 0.92, ph * 0.25]]) for (let i = -aw; i <= aw; i++) near.set(x + i, by - arm, S.flat(1));
            tops.push({ x, y: by - ph * 0.75, aw: ph * 0.35 });
        }
        for (let i = 0; i + 1 < tops.length; i++) {
            const a = tops[i], c = tops[i + 1];
            for (const off of [-a.aw, a.aw]) {
                for (let x = a.x + off; x <= c.x + off; x++) {
                    const u = (x - a.x - off) / (c.x - a.x);
                    near.set(x, lerp(a.y, c.y, u) + 1 + 6 * 4 * u * (1 - u), S.flat(0));
                }
            }
        }
    }

    const crane = (cx, dir) => {
        const cBase = hz + rng.range(6, depth + 4), cTop = Math.round(cBase - sc.U * rng.range(0.25, 0.45));
        for (let y = cTop; y <= cBase; y++) {
            near.set(cx, y, S.flat(1)); near.set(cx + 4, y, S.flat(1));
            const k = (y - cTop) % 5;
            if (k === 0) for (let i = 1; i < 4; i++) near.set(cx + i, y, S.flat(1));
            else near.set(cx + (Math.floor((y - cTop) / 5) % 2 ? 5 - k : k), y, S.flat(0));
        }
        const jib = rng.int(30, 64), rise = rng.range(0, 0.6), back = rng.int(8, 14);
        for (let k = -back; k <= jib; k++) {
            const x = cx + 2 + dir * k, y = cTop - Math.max(0, k) * rise;
            near.set(x, y, S.flat(1));
            near.set(x, y + 3, S.flat(1));
            if (((k % 4) + 4) % 4 < 3) near.set(x, y + 1 + (((k % 4) + 4) % 4), S.flat(0));
        }
        for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) near.set(cx + 2 - dir * (back - i), cTop + 4 + k, S.flat(0));
        const tip = { x: cx + 2 + dir * jib, y: Math.round(cTop - jib * rise) + 3 };
        light(cx + 2, cTop - 1, emit(S, LIGHTS.red), 2.2);
        light(tip.x, tip.y - 4, emit(S, LIGHTS.red), 2.2);
        cables.push({ ...tip, len: rng.int(14, Math.round(cBase - tip.y - 6)), phase: rng() * 6 });
    };
    for (let i = pick(rng, [0, 1.4], [1, 1.6], [2, 0.8], [3, 0.2]); i > 0; i--) crane(Math.round(rng.range(0.06, 0.9) * W), rng.chance(0.5) ? 1 : -1);
    sc.addStatic(near);

    stacks.sort((a, c) => c.h - a.h);
    const flares = stacks.slice(0, pick(rng, [0, 1], [1, 2], [2, 0.6]));
    for (const st of stacks.slice(flares.length, flares.length + rng.int(0, 3))) plumes.push({ x: st.x, y: st.y, r: 2.6, rise: 34 });
    const flame = ['#fff4c8', '#ffc45c', '#ff7a2c'].map(c => sc.slot({ k: 'flame', c: hex(c) }));
    embers(sc, flares);
    const steam = sc.slot({ k: 'cloud', v: 0.55, d: 0.3 });
    const cable = S.flat(1), fs = seedOf(rng);
    sc.addFn((f, t) => {
        const put = (x, y, v) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H) f[y * W + x] = v; };
        for (const pl of plumes) {
            for (let i = 0; i < 14; i++) {
                const age = (t * 0.15 + i / 14) % 1, r = 0.6 + age * pl.r;
                const px = pl.x + age * pl.rise * 0.45 + Math.sin(age * 6 + i) * 1.5, py = pl.y - 1 - age * pl.rise;
                for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy <= r * r && bayer(Math.round(px + dx), Math.round(py + dy)) < (1 - age) * 0.8) put(px + dx, py + dy, steam);
                }
            }
        }
        lights.forEach((l, i) => {
            if (l.blink ? (t + l.phase) % l.blink > l.blink * 0.45 : hash(i, Math.floor(t / 5 + l.phase), fs) < 0.05) return;
            put(l.x, l.y, l.slot);
        });
        flares.forEach((fl, j) => {
            const hh = 5 + Math.floor(noise1(t * 7 + j * 9, fs) * 6);
            for (let k = 0; k < hh; k++) {
                const wob = (noise1(t * 9 + k * 0.35 + j * 5, fs + 1) - 0.5) * 3 * k / hh;
                const c = k < hh * 0.35 ? 0 : k < hh * 0.7 ? 1 : 2;
                put(fl.x + wob, fl.y - k, flame[c]);
                if (k < hh * 0.5) put(fl.x + wob + 1, fl.y - k, flame[Math.min(2, c + 1)]);
            }
        });
        for (const c of cables) {
            const sway = Math.sin(t * 0.6 + c.phase) * 1.4;
            for (let k = 0; k < c.len; k++) put(c.x + sway * k / c.len, c.y + k, cable);
            put(c.x + sway - 1, c.y + c.len, cable); put(c.x + sway, c.y + c.len, cable); put(c.x + sway, c.y + c.len + 1, cable);
        }
    });
    // A canal in front mirrors the works and their lights.
    if (rng.chance(0.35)) water(sc, rng, { y0: Math.round(hz + depth + rng.range(3, 12)), ramp: P.canal, mix: 0.35, fres: 0.5, waves: 0.06, speed: 2 });
}

export const BIOMES = {
    lake: { name: BIOME_NAMES.lake, hour: 15.5, build: lake },
    grassland: { name: BIOME_NAMES.grassland, hour: 11, build: grassland },
    hills: { name: BIOME_NAMES.hills, hour: 9.5, build: hills },
    desert: { name: BIOME_NAMES.desert, hour: 17.6, build: desert },
    seaside: { name: BIOME_NAMES.seaside, hour: 13, build: seaside },
    industrial: { name: BIOME_NAMES.industrial, hour: 19.9, build: industrial },
    farmland: { name: BIOME_NAMES.farmland, hour: 10.5, build: farmland },
    savanna: { name: BIOME_NAMES.savanna, hour: 17.2, build: savanna },
    woodland: { name: BIOME_NAMES.woodland, hour: 9, build: woodland },
    river: { name: BIOME_NAMES.river, hour: 15, build: river },
    // Built in wilds.js, places.js, vistas.js and nooks.js; a name in DRAFT_BIOME_NAMES keeps one in review (tools/scenery.html only).
    ...Object.fromEntries([...Object.entries(WILDS), ...Object.entries(PLACES), ...Object.entries(VISTAS), ...Object.entries(NOOKS), ...Object.entries(SKYLINES)].map(([k, build]) => [k, { name: BIOME_NAMES[k] ?? DRAFT_BIOME_NAMES[k], hour: WILD_HOURS[k] ?? PLACE_HOURS[k] ?? VISTA_HOURS[k] ?? NOOK_HOURS[k] ?? SKYLINE_HOURS[k], build, draft: k in DRAFT_BIOME_NAMES }])),
};

// `look` pins choices a seed would otherwise roll: { icy } for the cavern, { lanterns } for the garden,
// { world, open } for the starship (the planet's kind; open space with no deck).
export function createScene(biome, seed, weather = 'auto', year = 1, W = 384, H = 216, look = null) {
    const sc = new Scene(W, H);
    sc.look = look || {};
    sc.year = year;
    sc.S = seasonAt(year);
    seasonGroups(sc);
    sc.weatherFixed = weather === 'auto' ? null : weather;
    sc.wrng = makeRng(seed ^ 0x5bd1e995);
    sc.frng = makeRng(seed ^ 0x2f6b9a31);
    sc.biome = biome;
    BIOMES[biome].build(sc, makeRng(seed));
    valleyMist(sc);
    fireflies(sc);
    weatherOverlay(sc);
    for (const build of sc.foreground) build();
    return sc;
}
