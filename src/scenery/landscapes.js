// More scene templates: farmland, savanna, woodland and river valley. They
// share helpers and palettes with biomes.js.
import { Buf } from './scene.js';
import { hex } from './lighting.js';
import { bayer, clamp, fbm1, fbm2, hash, lerp, noise1, smoothstep } from './noise.js';
import { blades, blobTree, canopyRidge, celestial, conifer, hill, mountains, seedOf, sky, water } from './shapes.js';
import { P, coniferRidge, envelope, ground, house, leafFall, leafVariant, meadow, mesa, pick, reeds, rock, shimmer, weather } from './biomes.js';

const Q = {
    wheat: ['#8a6a2e', '#a8863a', '#d0ae50', '#ecd078'],
    rape: ['#4a6428', '#5a7830', '#76963a', '#96b04a'],
    soil: ['#43301f', '#57402a', '#755636', '#8e6c46'],
    savanna: ['#7a5a26', '#9a7634', '#c49a48', '#e2c068'],
    savannaHi: ['#a88a44', '#c8a656', '#e6c874', '#f6e09a'],
    river: ['#1c4e6a', '#28688a', '#3c88aa', '#8ac4dc'],
    barn: ['#5e221c', '#7a2c22', '#a8402e', '#c45a40'],
    sail: ['#9a948a', '#b8b2a6', '#e4ded2', '#f8f4ea'],
};

function groups(sc) {
    sc.groups.set(Q.wheat, 'wheat');
    sc.groups.set(Q.rape, 'rape');
    sc.groups.set(Q.soil, 'soil');
    sc.groups.set(Q.savanna, 'savanna');
    sc.groups.set(Q.savannaHi, 'savanna');
    sc.groups.set(Q.river, 'water');
    sc.groups.set(Q.barn, 'ground');
}

// ---------------------------------------------------------------- farmland

// Windmill: tapering tower and cap, sails turning in the wind.
function windmill(sc, b, x, by, h, d) {
    const { W, H } = sc, wall = sc.ramp(P.wall, d), roof = sc.ramp(P.slate, d), sail = sc.ramp(Q.sail, d);
    for (let y = Math.round(by - h); y <= by; y++) {
        const u = (by - y) / h, hw = lerp(h * 0.2, h * 0.11, u);
        for (let k = -hw; k <= hw; k++) b.set(x + k, y, wall.face(k < 0 ? -1 : 1, 1));
    }
    for (let k = 0; k < h * 0.14; k++) for (let i = -h * 0.13 + k; i <= h * 0.13 - k; i++) b.set(x + i, by - h - k, roof.face(i < 0 ? -1 : 1, 1));
    const hub = [x, Math.round(by - h * 0.92)], len = h * 0.62, spar = sail.flat(0), cloth = sail.face(1, 1);
    sc.addFn((f, t) => {
        const put = (px, py, v) => { px = Math.round(px); py = Math.round(py); if (px >= 0 && py >= 0 && px < W && py < H) f[py * W + px] = v; };
        for (let s = 0; s < 4; s++) {
            const a = t * 0.45 + s * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
            for (let r = 1; r < len; r++) {
                put(hub[0] + ca * r, hub[1] + sa * r, spar);
                if (r > len * 0.25) for (let w = 1; w <= Math.max(1, len * 0.12); w++) put(hub[0] + ca * r - sa * w, hub[1] + sa * r + ca * w, cloth);
            }
        }
        put(hub[0], hub[1], spar);
    });
}

export function farmland(sc, rng) {
    const { W, H } = sc, hz = sc.horizon = Math.round(H * rng.range(0.42, 0.56));
    groups(sc);
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz);
    if (rng.chance(0.5)) mountains(sc, rng, { d: 0.5, base: hz + 2, top: hz - H * rng.range(0.06, 0.16), ramp: P.blueRock, freq: 0.01, mist: 8, env: envelope(rng) });
    else hill(sc, rng, { d: 0.45, y: hz + 3, amp: rng.range(4, 10), freq: 0.012, ramp: P.hill, bottom: hz + 20 });
    ground(sc, hz + 1, P.hill, 0.3);

    // Patchwork: bands that grow toward the viewer, cut into fields by lines
    // converging on a vanishing point; furrows run toward it.
    const b = new Buf(W, H), s = seedOf(rng);
    const vx = W * rng.range(0.3, 0.7), vy = hz - rng.range(20, 50);
    const n = rng.int(4, 7), bands = Array.from({ length: n + 1 }, (_, k) => hz + 1 + (H - hz) * (k / n) ** 1.7);
    const cuts = [-W];
    for (let x = -W; x < 2 * W;) cuts.push(x += rng.range(60, 220));
    const crops = [[Q.wheat, 3], [Q.rape, 1.2], [Q.soil, 1], [P.grass, 1.6]];
    const field = new Map();
    const cropOf = (k, i) => {
        const key = k * 100 + i;
        if (!field.has(key)) field.set(key, { pal: pick(rng, ...crops), across: rng.chance(0.3), fine: rng.range(0.7, 1.4) });
        return field.get(key);
    };
    for (let y = hz + 1; y < H; y++) {
        const k = Math.min(n - 1, bands.findIndex(v => v > y) - 1), p = (y - hz) / (H - hz), d = Math.round(0.32 * (1 - p) ** 1.5 * 25) / 25;
        for (let x = 0; x < W; x++) {
            const bx = vx + (x - vx) * (H - vy) / (y - vy);    // where this pixel's line meets the bottom edge
            let i = 0;
            while (i + 1 < cuts.length && cuts[i + 1] < bx) i++;
            const fc = cropOf(k, i), R = sc.ramp(fc.pal, d);
            const edge = Math.min(bx - cuts[i], cuts[i + 1] - bx) < 3 || y - bands[k] < 1;
            const stripe = fc.across ? Math.floor((y - bands[k]) / Math.max(1, p * 4 * fc.fine)) % 2 : Math.floor(bx / (6 * fc.fine)) % 2;
            const lv = edge ? 0 : stripe ? 1 : 2 + (hash(x, y, s) < 0.12 ? 1 : 0);
            b.set(x, y, R.flat(lv));
        }
    }
    sc.addStatic(b);

    // Hedgerows along some field boundaries, a farmstead in a middle band.
    const hedge = new Buf(W, H, { rank: true }), T = sc.ramp(P.trunk, 0.2);
    for (let k = 1; k < n; k++) {
        if (!rng.chance(0.55)) continue;
        const y = bands[k], p = (y - hz) / (H - hz), d = 0.32 * (1 - p) ** 1.5, L = sc.leaves(P.leaf, d, leafVariant(rng));
        const x0 = rng.range(-20, W * 0.5), x1 = rng.range(x0 + W * 0.3, W + 20);
        for (let x = x0; x < x1; x += rng.range(2, 4) * (0.6 + p * 2)) blobTree(hedge, x, y + 1, (6 + p * 22) * rng.range(0.6, 1.1), L, T, rng);
    }
    sc.addStatic(hedge);
    const kf = rng.int(1, Math.max(1, n - 3)), fy = (bands[kf] + bands[kf + 1]) / 2, fp = (fy - hz) / (H - hz), fd = 0.3 * (1 - fp) ** 1.5;
    const fx = W * rng.range(0.15, 0.85), scale = 6 + fp * 26, farm = new Buf(W, H);
    const wall = sc.ramp(P.wall, fd), roof = sc.ramp(rng.chance(0.5) ? P.roof : P.slate, fd), barn = sc.ramp(Q.barn, fd);
    house(sc, farm, fx, fy, Math.round(scale * 1.1), Math.round(scale * 0.5), wall, roof, () => rng.chance(0.7));
    house(sc, farm, fx + scale * 1.4, fy + 1, Math.round(scale * 1.5), Math.round(scale * 0.7), barn, sc.ramp(P.slate, fd), () => false);
    sc.addStatic(farm);
    if (rng.chance(0.65)) {
        const mill = new Buf(W, H);
        windmill(sc, mill, Math.round(fx + scale * rng.range(-3, -1.8)), Math.round(fy), Math.round(scale * 1.7), fd);
        sc.addStatic(mill);
    }

    // Foreground: grass verge with a fence.
    const verge = H - rng.range(10, 22), sb = new Buf(W, H, { sway: true }), G = sc.ramp(P.grass, 0), B = sc.ramp(P.grass, 0, 'blade');
    const vb = new Buf(W, H);
    for (let x = 0; x < W; x++) {
        const ty = verge + (fbm1(x * 0.02, s + 3) - 0.5) * 6;
        for (let y = Math.ceil(ty); y < H; y++) vb.set(x, y, G.flat(fbm2(x * 0.05, y * 0.2, s + 4, 2) > 0.5 ? 1 : 2));
        for (let y = Math.ceil(ty) - 1; y < H; y += 2) if (rng.chance(0.3)) blades(sb, rng, x, y, 2 + rng.range(2, 8), [B.flat(2), B.flat(3)], null);
    }
    if (rng.chance(0.7)) {
        const wood = sc.ramp(P.trunk, 0), y0 = verge - 2;
        for (let x = rng.int(0, 10); x < W; x += rng.int(22, 34)) for (let k = 0; k < 14; k++) { vb.set(x, y0 - k, wood.face(-1, 1)); vb.set(x + 1, y0 - k, wood.face(1, 0)); }
        for (const ry of [y0 - 10, y0 - 5]) for (let x = 0; x < W; x++) vb.set(x, ry + Math.round(Math.sin(x * 0.05) * 0.6), wood.flat(1));
    }
    sc.addStatic(vb);
    sc.addSway(sb, 0.8);
}

// ---------------------------------------------------------------- savanna

export function savanna(sc, rng) {
    const { W, H } = sc, hz = sc.horizon = Math.round(H * rng.range(0.55, 0.68));
    groups(sc);
    sc.climate = 'dry';
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['clear', 3], ['sparse', 2.5], ['scattered', 1.5], ['towering', 2], ['haze', 1.5], ['storm', 0.6], ['dust', 0.5]], 0.2);
    if (rng.chance(0.35)) {
        // A lone snow-capped massif on the horizon.
        const c = rng.range(0.2, 0.8), w = rng.range(0.15, 0.3);
        mountains(sc, rng, { d: 0.55, base: hz + 2, top: hz - H * rng.range(0.18, 0.3), ramp: P.blueRock, snow: P.snow, snowAt: 0.2, sharp: 0.8, freq: 0.006, mist: 10, env: u => 1 - smoothstep(w * 0.3, w, Math.abs(u - c)) });
    } else if (rng.chance(0.6)) {
        mesa(sc, rng, { d: 0.5, base: hz + 2, top: hz - H * rng.range(0.06, 0.14), ramp: P.mesa, cover: rng.range(0.15, 0.35), freq: 0.016 });
    }
    ground(sc, hz + 1, Q.savanna, 0.35);
    shimmer(sc, hz - 24, hz + 8);
    const ty = meadow(sc, rng, { top: hz + rng.range(2, 6), pal: [Q.savanna, Q.savannaHi], blade: 'savanna', tall: 1.6, blades: rng.range(0.25, 0.4), flowers: 0 });
    // Distant trees stand in the grass, so they go on after it.
    const T = sc.ramp(P.trunk, 0.3), mid = new Buf(W, H, { rank: true });
    for (let i = rng.int(6, 24); i > 0; i--) {
        const y = hz + rng.range(3, 24), p = (y - hz) / (H - hz), d = 0.4 * (1 - p * 2);
        const L = sc.leaves(P.leaf, Math.max(0.08, d), leafVariant(rng));
        if (rng.chance(0.7)) blobTree(mid, rng.range(0, W), y, rng.range(8, 20) * (1 + p * 3), L, T, rng, { shape: 'umbrella' });
        else blobTree(mid, rng.range(0, W), y, rng.range(4, 8) * (1 + p * 3), L, T, rng);
    }
    sc.addStatic(mid);
    const sb = new Buf(W, H, { sway: true, rank: true }), crowns = [];
    for (let i = pick(rng, [0, 1], [1, 2], [2, 1]); i > 0; i--) {
        const x = Math.round(W * rng.range(0.1, 0.9)), L = sc.leaves(P.leaf, 0, leafVariant(rng));
        crowns.push(blobTree(sb, x, Math.min(H + 2, ty[x] + rng.range(10, 30)), H * rng.range(0.45, 0.7), L, sc.ramp(P.trunk, 0), rng, { sway: 0.6, shape: 'umbrella' }));
    }
    sc.addSway(sb, 0.7);
}

// ---------------------------------------------------------------- woodland

export function woodland(sc, rng) {
    const { W, H } = sc, hz = sc.horizon = Math.round(H * rng.range(0.5, 0.62));
    groups(sc);
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['fog', 1], ['overcast', 0.9]]);
    if (rng.chance(0.4)) mountains(sc, rng, { d: 0.55, base: hz, top: hz - H * rng.range(0.1, 0.22), ramp: P.mossRock, freq: 0.012, mist: 8, env: envelope(rng) });
    canopyRidge(sc, rng, { d: 0.42, base: hz + 4, top: hz - rng.range(6, 14), bottom: hz + 6, ramp: P.canopy, rmin: 2, rmax: 5, rows: 2 });
    ground(sc, hz + 2, P.hill, 0.3);
    const clear = W * rng.range(0.3, 0.7), conif = rng.range(0, 0.7);
    // The clearing's grass runs right up to the far forest; the tree rows
    // then stand in it.
    meadow(sc, rng, { top: hz + 3, flowers: rng.range(0.03, 0.12), blades: rng.range(0.15, 0.3) });
    if (rng.chance(0.6)) {
        // A dirt path winding out of the clearing toward the viewer.
        const pb = new Buf(W, H), Sd = sc.ramp(Q.soil, 0), s = seedOf(rng), y0 = hz + 8;
        const end = W * rng.range(0.35, 0.65), wiggle = rng.range(8, 24), ph = rng() * 6;
        for (let y = y0; y < H; y++) {
            const p = (y - y0) / (H - y0), cx = lerp(clear, end, p ** 0.8) + Math.sin(p * 5 + ph) * wiggle * p, w = 0.8 + p ** 1.2 * 30;
            for (let x = Math.floor(cx - w - 1); x <= cx + w + 1; x++) {
                const e = w - Math.abs(x - cx);
                if (e < 0 && bayer(x, y) > 0.5 + e) continue;   // soft, grassy edges
                pb.set(x, y, Sd.flat(e < 1.5 ? 1 : hash(x >> 1, y, s) < 0.12 ? 3 : 2));
            }
        }
        sc.addStatic(pb);
    }
    // Rows of trees closing in from the sides, leaving a clearing that widens toward the viewer.
    const rows = rng.int(2, 3);
    for (let r = 0; r < rows; r++) {
        const p = (r + 1) / (rows + 1), b = new Buf(W, H, { rank: true }), y0 = hz + 3 + p * 18, d = 0.32 * (1 - p);
        const gap = W * (0.08 + p * 0.25) * rng.range(0.7, 1.3);
        const Dr = sc.ramp(P.forest, d), Tr = sc.ramp(P.trunk, d);
        const trees = [];
        for (let x = -10; x < W + 10; x += rng.range(5, 12) * (0.6 + p)) {
            if (Math.abs(x - clear) < gap) continue;
            trees.push({ x, by: y0 + rng.range(0, 6), h: rng.range(20, 40) * (0.6 + p * 1.2) });
        }
        trees.sort((a, c) => a.by - c.by).forEach(t => {
            if (rng() < conif) conifer(b, t.x, t.by, t.h * 1.2, Dr, rng, { trunk: Tr });
            else blobTree(b, t.x, t.by, t.h, sc.leaves(P.leaf, d, leafVariant(rng)), Tr, rng);
        });
        sc.addStatic(b);
    }
    // Big framing trees on either side, crowns running off the top.
    const sb = new Buf(W, H, { sway: true, rank: true }), crowns = [], Tf = sc.ramp(P.trunk, 0), Df = sc.ramp(P.forest, 0);
    for (const side of [-1, 1]) {
        for (let i = rng.int(1, 2); i > 0; i--) {
            const x = side < 0 ? rng.range(-W * 0.05, W * 0.16) : rng.range(W * 0.84, W * 1.05), by = H + rng.range(-6, 10);
            if (rng() < conif) conifer(sb, x, by, H * rng.range(0.9, 1.2), Df, rng, { sway: 0.8, trunk: Tf });
            else crowns.push(blobTree(sb, x, by, H * rng.range(0.85, 1.15), sc.leaves(P.leaf, 0, leafVariant(rng)), Tf, rng, { sway: 0.8 }));
        }
    }
    sc.addSway(sb, 0.8);
    if (crowns.length) leafFall(sc, rng, crowns, sc.leaves(P.leaf, 0, 1));
}

// ---------------------------------------------------------------- river valley

export function river(sc, rng) {
    const { W, H } = sc, hz = sc.horizon = Math.round(H * rng.range(0.45, 0.58));
    groups(sc);
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['fog', 0.8]]);
    const vx = rng.range(0.35, 0.65);
    if (rng.chance(0.5)) mountains(sc, rng, { d: 0.5, base: hz + 2, top: hz - H * rng.range(0.12, 0.25), ramp: P.rock, snow: rng.chance(0.5) && P.snow, freq: 0.012, mist: 10, env: envelope(rng) });
    // Valley sides: hills rising toward both edges, nearer ones steeper.
    for (const [d, rise] of [[0.4, 0.14], [0.24, 0.24]]) {
        mountains(sc, rng, { d, base: hz + 4, top: hz - H * rise * rng.range(0.7, 1.2), ramp: P.mossRock, sharp: 1, talus: 0.6, spur: 14, freq: 0.01, mist: 6, env: u => smoothstep(0.06, 0.45, Math.abs(u - vx)) });
    }
    ground(sc, hz + 2, P.hill, 0.25);
    meadow(sc, rng, { top: hz + 3, flowers: rng.range(0, 0.1), blades: rng.range(0.12, 0.25) });

    // The river: a ribbon winding from a thread at the horizon to the foreground.
    const mask = new Buf(W, H), bank = new Buf(W, H), mud = sc.ramp(Q.soil, 0.1), s = seedOf(rng);
    const turns = rng.range(3, 7), ph = rng() * 6, endX = W * rng.range(0.25, 0.75), centres = [];
    for (let y = hz + 1; y < H; y++) {
        const p = (y - hz) / (H - hz);
        const cx = lerp(W * vx, endX, p) + Math.sin(p * turns + ph) * W * 0.2 * p ** 0.8 + (fbm1(y * 0.05, s) - 0.5) * 6 * p;
        const w = 0.6 + p ** 1.4 * W * rng.range(0.11, 0.13);
        centres.push({ y, cx, w, p });
        for (let x = Math.floor(cx - w - 3 - p * 3); x <= cx + w + 3 + p * 3; x++) {
            const e = Math.abs(x - cx) - w;
            if (e <= 0) mask.set(x, y, 1);
            else if (e < 1 + p * 3) bank.set(x, y, mud.flat(e < 1 ? 0 : 1));
        }
    }
    sc.addStatic(bank);
    water(sc, rng, { y0: hz + 1, ramp: Q.river, mix: 0.45, fres: 0.6, waves: 0.06, speed: 3, mask });

    // Trees along the banks, smaller with distance.
    const tb = new Buf(W, H, { rank: true }), T = sc.ramp(P.trunk, 0.1);
    for (const c of centres) {
        if (!rng.chance(0.04 + c.p * 0.04)) continue;
        const side = rng.chance(0.5) ? -1 : 1, x = c.cx + side * (c.w + rng.range(4, 14) * (0.5 + c.p * 3)), d = 0.3 * (1 - c.p);
        if (rng.chance(0.25)) conifer(tb, x, c.y, (8 + c.p * 50) * rng.range(0.7, 1.2), sc.ramp(P.forest, d), rng, { trunk: T });
        else blobTree(tb, x, c.y, (6 + c.p * 46) * rng.range(0.7, 1.2), sc.leaves(P.leaf, d, leafVariant(rng)), T, rng, { shape: rng.chance(0.2) ? 'tall' : 'dome' });
    }
    sc.addStatic(tb);
    if (rng.chance(0.4)) {
        // A stone arch bridge across the middle distance.
        const c = centres[Math.floor(centres.length * rng.range(0.25, 0.5))], st = sc.ramp(P.stone, 0.15), bb = new Buf(W, H);
        // Deck across the river; the arch's underside drops from the crown to the water at each end.
        const span = c.w * 2 + 10 + c.p * 20, deck = c.y - 3 - c.p * 10, th = 2 + c.p * 4, archH = c.y + 2 - (deck + th);
        for (let x = c.cx - span / 2; x <= c.cx + span / 2; x++) {
            const u = (x - c.cx) / (span / 2), under = deck + th + archH * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
            for (let y = Math.round(deck); y <= under; y++) bb.set(x, y, st.face(u < 0 ? -1 : 1, y - deck < 1 ? 1 : 0));
        }
        sc.addStatic(bb);
    }
    reeds(sc, rng, hz);
}
