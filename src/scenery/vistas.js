// Draft scene templates, in review in tools/scenery.html: a blossom garden, a rainy neon
// street and a train window. The street is drawn in one-point perspective with the wet
// ground mirroring it; the train's landscape scrolls past in layers, stopping at stations.
import { Buf, REFLECT } from './scene.js';
import { hex, mul } from './lighting.js';
import { bayer, clamp, fbm1, fbm2, hash, lerp, noise1, noise2, smoothstep } from './noise.js';
import { blades, blobTree, canopyRidge, celestial, conifer, mountains, seedOf, sky, water } from './shapes.js';
import { LIGHTS, P, envelope, ground, house, leafFall, leafVariant, pick, weather } from './biomes.js';

const Q = {
    vermilion: ['#6a1a12', '#8a2618', '#c8432a', '#ea6a3e'],
    plaster: ['#8a8478', '#a8a292', '#e2dac6', '#f8f2e0'],
    tile: ['#1e2229', '#282d36', '#434b58', '#5a6474'],
    lanternStone: ['#4e4c46', '#625f56', '#8e897a', '#b0aa98'],
    moss: ['#2a4a26', '#365a2c', '#4e7a36', '#6a9440'],
    pad: ['#1e4424', '#2c5e2e', '#4a843a', '#6ea24a'],
    gravel: ['#8a8478', '#9e988a', '#bcb5a4', '#d4ccb8'],
};

const putter = (f, W, H) => (x, y, v) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H) f[y * W + x] = v;
};

// ---------------------------------------------------------------- blossom garden

// A roof with upturned eaves: from the eave line at `y` (width w, centred on cx) up to a
// ridge of width `top` at height h. The corners lift by `lift` pixels.
function eaveRoof(b, cx, y, w, top, h, lift, R) {
    for (let x = Math.floor(cx - w / 2); x <= cx + w / 2; x++) {
        const u = (x - cx) / (w / 2), up = Math.abs(u) ** 4 * lift;
        // The roof's outline: concave flanks sweeping up to the ridge.
        const ridge = Math.abs(x - cx) <= top / 2 ? h : h * (1 - ((Math.abs(x - cx) - top / 2) / (w / 2 - top / 2)) ** 0.6);
        for (let yy = Math.round(y - Math.max(ridge, up + 1)); yy <= y - up; yy++) {
            const edge = yy >= y - up - 1;
            b.set(x, yy, R.face(u < 0 ? -1 : 1, edge ? 0 : (x + yy) % 3 === 0 ? 0 : 1));
        }
    }
}

// A pagoda: tiers of vermilion and white under dark eaves, shrinking upward, a spire on top.
function pagoda(b, cx, by, s, Rv, Rp, Rt, lamp, rng) {
    const tiers = rng.chance(0.6) ? 5 : 3, w0 = 18 * s, bh = 6 * s;
    for (let y = by; y > by - 2 * s; y--) for (let x = cx - w0 * 0.75; x <= cx + w0 * 0.75; x++) b.set(x, y, Rp.face(x < cx ? -1 : 1, 0));
    let y = by - 2 * s;
    for (let i = 0; i < tiers; i++) {
        const w = w0 * (1 - i * 0.11), h = i ? bh * 0.8 : bh;
        for (let yy = Math.round(y - h); yy <= y; yy++) for (let x = Math.round(cx - w / 2); x <= cx + w / 2; x++) {
            const k = Math.abs(x - cx) / (w / 2), pillar = k > 0.8 || Math.abs(k - 0.3) < 0.08;
            b.set(x, yy, pillar ? Rv.face(x < cx ? -1 : 1, 1) : Rp.face(x < cx ? -1 : 1, 1));
        }
        // A lit window in the middle of each tier at night.
        for (let yy = Math.round(y - h * 0.7); yy <= y - h * 0.25; yy++) for (let x = Math.round(cx - s); x <= cx + s; x++) b.set(x, yy, lamp);
        y -= h;
        eaveRoof(b, cx, y, w * 1.55, w * 0.55, 3.5 * s, 2.5 * s, Rt);
        y -= 3 * s;
    }
    // The spire with its rings.
    for (let j = 0; j < 12 * s; j++) for (let k = -Math.max(0.5, s * 0.6); k <= s * 0.6; k++) b.set(cx + k, y - j, j % Math.max(2, Math.round(2 * s)) ? Rt.flat(2) : Rv.flat(3));
    return y - 12 * s;
}

// A temple hall: a stone plinth, a vermilion colonnade, a great hipped roof.
function hall(b, cx, by, s, Rv, Rp, Rt, lamp) {
    const w = 46 * s, h = 11 * s;
    for (let y = by; y > by - 3 * s; y--) for (let x = cx - w * 0.6; x <= cx + w * 0.6; x++) b.set(x, y, Rp.face(x < cx ? -1 : 1, y === Math.round(by - 3 * s + 1) ? 1 : 0));
    const y0 = by - 3 * s;
    for (let y = Math.round(y0 - h); y <= y0; y++) for (let x = Math.round(cx - w / 2); x <= cx + w / 2; x++) {
        const col = ((x - cx + w / 2) % (7 * s)) < 1.6 * s;
        const door = !col && y > y0 - h * 0.7 && Math.abs(x - cx) < w * 0.32;
        b.set(x, y, col ? Rv.face(x < cx ? -1 : 1, 1) : door ? lamp : Rp.face(x < cx ? -1 : 1, 1));
    }
    eaveRoof(b, cx, y0 - h, w * 1.35, w * 0.5, 14 * s, 4 * s, Rt);
}

// A stone lantern: base, post, a light box that glows at night, a curved cap.
function lantern(b, cx, by, s, R, lamp) {
    const rect = (x0, x1, y0, y1, lv) => { for (let y = Math.round(y0); y <= y1; y++) for (let x = Math.round(cx + x0); x <= cx + x1; x++) b.set(x, y, R.face(x < cx ? -1 : 1, lv)); };
    rect(-3 * s, 3 * s, by - 1.5 * s, by, 0);
    rect(-1 * s, 1 * s, by - 7 * s, by - 1.5 * s, 1);
    rect(-2.5 * s, 2.5 * s, by - 8 * s, by - 7 * s, 1);
    rect(-2 * s, 2 * s, by - 11.5 * s, by - 8 * s, 1);
    for (let y = Math.round(by - 10.8 * s); y <= by - 8.6 * s; y++) for (let x = Math.round(cx - s); x <= cx + s; x++) b.set(x, y, lamp);
    eaveRoof(b, cx, by - 11.5 * s, 8 * s, 1.5 * s, 3 * s, 1.2 * s, R);
    rect(-0.6 * s, 0.6 * s, by - 15.5 * s, by - 14.2 * s, 1);
}

// The arched bridge: a vermilion deck in a high arc, posts and rails along it, knobbed
// newel posts at the ends. Returns its pixels so the pond can mirror them.
function bridge(b, x0, x1, yb, s, R, Rd) {
    const span = x1 - x0, rise = span * 0.2, px = [];
    const deck = x => yb - Math.sin(Math.PI * clamp((x - x0) / span)) * rise;
    const put = (x, y, v) => { b.set(x, y, v); px.push(Math.round(x), Math.round(y), v); };
    for (let x = Math.round(x0); x <= x1; x++) {
        const y = deck(x);
        for (let j = 0; j < 2.5 * s; j++) put(x, y + j, j < 1 ? Rd.flat(3) : Rd.face(1, j > 1.5 * s ? 0 : 1));
        put(x, y - 4 * s, R.flat(3));
        if (Math.round(x - x0) % Math.round(6 * s) === 0) for (let j = 1; j < 4 * s; j++) put(x, y - j, R.face(-1, 1));
        put(x, y - 2 * s, R.flat(1));
    }
    for (const x of [x0, x1]) {
        const y = deck(x);
        for (let j = 0; j < 5.5 * s; j++) for (let k = -0.6 * s; k <= 0.6 * s; k++) put(x + k, y - j, R.face(k < 0 ? -1 : 1, 1));
        for (let k = -s; k <= s; k++) put(x + k, y - 5.5 * s - 1, Rd.flat(3));
    }
    // The piers under the arch, standing in the water.
    for (const u of [0.22, 0.78]) {
        const x = x0 + span * u;
        for (let y = Math.round(deck(x) + 2.5 * s); y <= yb + 1; y++) for (let k = -0.8 * s; k <= 0.8 * s; k++) put(x + k, y, Rd.face(k < 0 ? -1 : 1, 0));
    }
    return px;
}

function garden(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.44, 0.54)), s = U / 216;
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['fog', 0.8], ['mixed', 1.2]]);
    // A lone volcano far off, snow on its shoulders, or a range of blue peaks.
    if (rng.chance(0.55)) {
        const px = W * rng.range(0.2, 0.8), hw = U * rng.range(0.5, 0.75), hp = U * rng.range(0.22, 0.32), ms = seedOf(rng);
        const R = sc.ramp(P.blueRock, 0.6), Sn = sc.ramp(P.snow, 0.55), b = new Buf(W, H);
        for (let x = Math.floor(px - hw); x <= px + hw; x++) {
            const u = Math.abs(x - px) / hw, top = hz + 2 - hp * Math.min(1, (1 - u) ** 1.8 * 1.12);
            for (let y = Math.round(top); y <= hz + 2; y++) {
                const snowy = (y - top) < hp * 0.35 * (1 - u) + (noise2(x * 0.3, y * 0.15, ms) - 0.5) * 5 && u < 0.6;
                const gully = noise2(x * 0.25, y * 0.04, ms + 1) > 0.6;
                b.set(x, y, (snowy ? Sn : R).face(x < px ? -1 : 1, gully ? 0 : 1));
            }
        }
        sc.addStatic(b);
    } else mountains(sc, rng, { d: 0.55, base: hz + 2, top: hz - U * rng.range(0.1, 0.2), ramp: P.blueRock, freq: 0.012, mist: 8, env: envelope(rng) });
    canopyRidge(sc, rng, { d: 0.32, base: hz + 8, top: hz - U * 0.03, bottom: hz + 20, ramp: P.canopy, rmin: 3, rmax: 6, rows: 2 });
    // The far bank: the temple stands back from it.
    const bankY = Math.round(hz + (H - hz) * rng.range(0.24, 0.32));
    ground(sc, hz + 14, P.hill, 0.25);
    const tb = new Buf(W, H, { rank: true });
    const Rv = sc.ramp(Q.vermilion, 0.18), Rp = sc.ramp(Q.plaster, 0.18), Rt = sc.ramp(Q.tile, 0.18, 'ground');
    const lamp = sc.slot({ k: 'emit', c: hex(LIGHTS.warm), base: hex(Q.plaster[1]), d: 0.18, v: 1 });
    const templeX = Math.round(W * rng.range(0.2, 0.8)), templeY = bankY - Math.round(U * 0.06);
    if (rng.chance(0.6)) {
        pagoda(tb, templeX, templeY, s * 1.5, Rv, Rp, Rt, lamp, rng);
        if (rng.chance(0.6)) hall(tb, Math.round(templeX + (templeX < W / 2 ? 1 : -1) * U * rng.range(0.45, 0.6)), templeY + 2, s * 1.2, Rv, Rp, Rt, lamp);
    } else hall(tb, templeX, templeY, s * 1.6, Rv, Rp, Rt, lamp);
    sc.addStatic(tb);
    // The bank itself: lawn, clipped shrubs, stone lanterns, cherries and maples.
    const bb = new Buf(W, H), Gr = sc.ramp(P.hill, 0.12), Sh = sc.ramp(P.canopy, 0.12), Rs = sc.ramp(Q.lanternStone, 0.12, 'rock'), gs = seedOf(rng);
    for (let x = 0; x < W; x++) for (let y = templeY - 1; y <= bankY + 2; y++) bb.set(x, y, Gr.face(1, fbm2(x * 0.05, y * 0.2, gs, 2) > 0.5 ? 1 : 0));
    const fb = new Buf(W, H, { sway: true, rank: true }), crowns = [], T = sc.ramp(P.trunk, 0.12);
    const trees = Array.from({ length: rng.int(4, 8) }, () => ({ x: rng.range(-0.05, 1.05) * W, cherry: rng.chance(0.6) })).filter(t => Math.abs(t.x - templeX) > U * 0.12);
    for (const t of trees) {
        const by = bankY - rng.range(0, 5), R = sc.leaves(P.leaf, 0.12, t.cherry ? 4 : 2);
        const c = blobTree(fb, t.x, by, U * (t.cherry ? rng.range(0.24, 0.34) : rng.range(0.16, 0.24)), R, T, rng, { sway: 0.4 });
        if (t.cherry) crowns.push(c);
    }
    for (let x = rng.range(0, 20); x < W; x += rng.range(14, 40)) {
        // Shrubs clipped into mounds.
        const r = U * rng.range(0.025, 0.045), by = bankY + 1 - rng.range(0, 3);
        for (let dy = -r; dy <= 0; dy++) for (let dx = -r * 1.5; dx <= r * 1.5; dx++) if ((dx / 1.5) ** 2 + dy * dy <= r * r) bb.set(x + dx, by + dy, Sh.face(dx < 0 ? -1 : 1, dy < -r * 0.5 ? 1 : 0));
    }
    const lampL = sc.slot({ k: 'emit', c: hex(LIGHTS.warm), base: hex(Q.lanternStone[0]), d: 0.12, v: 1 });
    for (let i = rng.int(1, 3); i > 0; i--) lantern(bb, Math.round(rng.range(0.08, 0.92) * W), bankY + 1, s * 0.9, Rs, lampL);
    sc.addStatic(bb);
    sc.addSway(fb, 0.5);
    // Paper lanterns strung along the bank, glowing after dark.
    if (rng.chance(0.45)) {
        const pb = new Buf(W, H), cord = sc.slot({ k: 'mat', c: hex('#2a2420'), d: 0.12 }), ly = bankY - U * rng.range(0.12, 0.18), sag = U * 0.03;
        const paper = ['#ff6a4a', '#ffd890'].map(c => sc.slot({ k: 'emit', c: hex(c), base: hex(c === '#ff6a4a' ? '#a8402a' : '#d8c8a0'), d: 0.12, v: 1 }));
        for (let x = 0; x < W; x++) {
            const u = (x % 60) / 60, y = ly + Math.sin(Math.PI * u) * sag;
            pb.set(x, y, cord);
            if (x % 15 === 7) for (let j = 1; j <= 4 * s + 1; j++) for (let k = -1.4 * s; k <= 1.4 * s; k++) pb.set(x + k, y + j, paper[(x / 15 | 0) % 2]);
        }
        sc.addStatic(pb);
    }
    // The pond: a still strip of mirror below the far bank, reaching toward us in an inlet
    // under the bridge, whose feet rest on the near shore.
    const bx0 = W * rng.range(0.08, 0.4), bx1 = bx0 + W * rng.range(0.32, 0.5), byb = Math.round(bankY + (H - bankY) * rng.range(0.24, 0.34)), span = bx1 - bx0;
    const ps = seedOf(rng), deep = Math.min(H - U * 0.08, byb + U * rng.range(0.16, 0.26)), nearY = Float32Array.from({ length: W }, (_, x) => {
        const u = (x - bx0) / span, inlet = u > 0.04 && u < 0.96 ? Math.sin(Math.PI * (u - 0.04) / 0.92) ** 0.8 : 0;
        return byb + 3 + (fbm1(x * 0.03, ps, 2) - 0.5) * 4 + (deep - byb) * inlet * (0.9 + 0.2 * fbm1(x * 0.05, ps + 1, 2));
    });
    const mask = new Buf(W, H);
    for (let x = 0; x < W; x++) for (let y = bankY + 1; y < nearY[x]; y++) mask.set(x, y, 1);
    water(sc, rng, { y0: bankY + 1, ramp: P.lake, mix: 0.35, fres: 0.2, waves: 0.03, speed: 1, mask });
    // The bridge across the inlet, mirrored in the water beneath.
    const Rb = sc.ramp(Q.vermilion, 0.06), brb = new Buf(W, H), bpx = bridge(brb, bx0, bx1, byb, s * 1.2, Rb, Rb);
    sc.addFn((f, t) => {
        for (let i = 0; i < bpx.length; i += 3) {
            const x = bpx[i], y = 2 * byb - bpx[i + 1] + 2;
            const rx = x + Math.round(Math.sin(y * 0.7 + t * 1.3) * 0.8);
            if (y < H && mask.get(rx, y) && bayer(rx, y) < 0.8) f[y * W + rx] = bpx[i + 2] + REFLECT;
        }
    });
    // Lily pads, a few in flower, sinking from sight in winter; koi under the surface.
    const lb = new Buf(W, H, { rank: true }), Pd = sc.ramp(Q.pad, 0.05), lotus = sc.slot({ k: 'mat', c: hex('#f4b4c8'), d: 0.05 });
    for (let i = rng.int(6, 16); i > 0; i--) {
        const x = rng.range(0, W), y = rng.range(bankY + 4, H);
        if (!mask.get(x, y) || !mask.get(x, y + 3)) continue;
        const r = (2 + (y - bankY) / (H - bankY) * 5) * s, rk = rng.int(60, 250);
        for (let dy = -r * 0.4; dy <= r * 0.4; dy++) for (let dx = -r; dx <= r; dx++) {
            if ((dx / r) ** 2 + (dy / (r * 0.4)) ** 2 > 1 || (dx > 0 && Math.abs(dy) < 0.6 && dx < r * 0.6)) continue;
            lb.set(x + dx, y + dy, Pd.flat(dy < 0 ? 2 : 1), 0, undefined, rk);
        }
        if (rng.chance(0.3)) lb.set(x, y - r * 0.4 - 1, lotus, 0, undefined, Math.max(rk, 200));
    }
    sc.addStatic(lb);
    const koiC = [['#e8662a', '#fff2e4'], ['#fff2e4', '#d8342a'], ['#f0a030', '#f0a030']].map(p => p.map(c => sc.slot({ k: 'mat', c: mul(hex(c), [0.8, 0.85, 0.9]), d: 0.08 })));
    const koi = Array.from({ length: rng.int(4, 9) }, () => ({ x: rng.range(0, W), y: rng.range(bankY + 6, H), r: rng.range(8, 30) * s, sp: rng.range(0.05, 0.12) * (rng.chance(0.5) ? 1 : -1), ph: rng() * 6, c: rng.pick(koiC) }));
    sc.addFn((f, t) => {
        const put = putter(f, W, H);
        for (const k of koi) {
            const a = t * k.sp + k.ph, x = k.x + Math.cos(a) * k.r * 1.6, y = k.y + Math.sin(a) * k.r * 0.4, dx = -Math.sin(a) * Math.sign(k.sp);
            const len = Math.max(3, Math.round(4 * s));
            for (let j = 0; j < len; j++) if (mask.get(x - dx * j, y)) put(x - dx * j, y, k.c[j === 1 ? 1 : 0]);
        }
    });
    // Blossom on the water in spring.
    const petal = sc.slot({ k: 'mat', c: hex('#f6c4d6'), d: 0.05 });
    const floats = Array.from({ length: 120 }, () => ({ x: rng.range(0, W), y: rng.range(bankY + 2, H), ph: rng() }));
    sc.addFn((f, t) => {
        const n = Math.floor(floats.length * sc.S.bloom);
        for (let i = 0; i < n; i++) {
            const p = floats[i], x = Math.round((p.x + t * 0.6 + Math.sin(t * 0.2 + p.ph * 6) * 2) % W), y = Math.round(p.y);
            if (mask.get(x, y)) f[y * W + x] = petal;
        }
    });
    sc.addStatic(brb);
    // The near shore: moss, stepping stones, irises at the water's edge.
    const nb = new Buf(W, H), Mo = sc.ramp(Q.moss, 0.02, 'grass'), St = sc.ramp(Q.lanternStone, 0.02, 'rock'), ns = seedOf(rng);
    for (let x = 0; x < W; x++) for (let y = Math.round(nearY[x]); y < H; y++) {
        const edge = y - nearY[x] < 1.5;
        nb.set(x, y, edge ? St.flat(1) : Mo.face(1, fbm2(x * 0.06, y * 0.12, ns, 2) > 0.5 ? 1 : 0));
    }
    // Stepping stones winding from the foreground to one foot of the bridge, larger as they near.
    const foot = rng.chance(0.5) ? bx0 : bx1, from = clamp(foot + (foot === bx0 ? -1 : 1) * W * rng.range(0.05, 0.25), W * 0.05, W * 0.95), wig = rng() * 6;
    for (let u = 0; u < 1;) {
        const y = lerp(byb + 4, H + 2, u), x = lerp(foot, from, u * u) + Math.sin(u * 5 + wig) * U * 0.03 * u, r = U * (0.012 + 0.04 * u);
        if (y > nearY[clamp(Math.round(x), 0, W - 1)] + 1) for (let dy = -r * 0.45; dy <= r * 0.45; dy++) for (let dx = -r; dx <= r; dx++) if ((dx / r) ** 2 + (dy / (r * 0.45)) ** 2 <= 1) nb.set(x + dx, y + dy, St.face(dx < 0 ? -1 : 1, dy < 0 ? 1 : 0));
        u += (r * 1.3 + 2) / (H - byb);
    }
    sc.addStatic(nb);
    const ib = new Buf(W, H, { sway: true, rank: true }), Ir = sc.ramp(Q.moss, 0, 'blade'), iris = ['#6a4ac8', '#8a6ae0'].map(c => sc.slot({ k: 'mat', c: hex(c), d: 0 }));
    for (let x = 0; x < W; x++) {
        if (!rng.chance(0.18)) continue;
        const y = nearY[x] + rng.range(0, 4);
        blades(ib, rng, x, y, 6 + 6 * s, [Ir.flat(2), Ir.flat(3)], rng.chance(0.3) ? iris : null);
    }
    sc.addSway(ib, 0.6);
    // A great cherry at the side, its branches framing the view, shedding petals.
    if (rng.chance(0.75)) {
        const sb = new Buf(W, H, { sway: true, rank: true }), R = sc.leaves(P.leaf, 0, 4), side = rng.chance(0.5);
        const c = blobTree(sb, side ? rng.range(-W * 0.06, W * 0.06) : rng.range(W * 0.94, W * 1.06), H + rng.range(4, 14), U * rng.range(0.75, 0.95), R, sc.ramp(P.trunk, 0), rng, { sway: 0.6 });
        sc.addSway(sb, 0.7);
        leafFall(sc, rng, [c], R);
    }
    if (crowns.length) leafFall(sc, rng, crowns, sc.leaves(P.leaf, 0.12, 4));
}

// ---------------------------------------------------------------- rainy neon street

const NEON = ['#ff4fa8', '#3ef0ff', '#b26bff', '#ff9a3c', '#5dff8a', '#ff3b4a', '#ffe45a', '#e8e4ff'];
const FACADES = [
    ['#24222a', '#302d38', '#4c4858', '#625e72'],
    ['#33251f', '#42302a', '#664a3e', '#825e50'],
    ['#202a33', '#2a3540', '#425262', '#5a6c7e'],
    ['#302e24', '#403c2e', '#625c48', '#7e765e'],
    ['#38222a', '#462c36', '#6a4652', '#86606c'],
];
const ASPHALT = ['#121418', '#181b21', '#22262e', '#2e333c'];
const PAVING = ['#24262c', '#2e3038', '#42454e', '#585b64'];

// Made-up glyphs on a 5x5 grid: a few strokes each, so signs read as lettering without
// being any real script.
function glyphSet(rng) {
    return Array.from({ length: 24 }, () => {
        const g = new Uint8Array(25);
        for (let k = rng.int(2, 4); k > 0; k--) {
            const at = rng.int(0, 4), a = rng.int(0, 2), b = rng.int(a + 2, 4), across = rng.chance(0.5);
            for (let i = a; i <= b; i++) g[across ? at * 5 + i : i * 5 + at] = 1;
        }
        return g;
    });
}

// A city street at night in the rain, seen down its length: shopfronts and windows lit,
// neon signs jutting from the walls, cables and lanterns strung across, all of it
// mirrored in the wet road. People under umbrellas, steam from a grate.
function street(sc, rng) {
    const { W, H, U } = sc, vy = sc.horizon = sc.horizonAt(rng.range(0.44, 0.52)), vx = Math.round(W * rng.range(0.4, 0.6));
    sky(sc);
    celestial(sc, rng, { count: 30 });
    weather(sc, vy, [['rain', 4], ['storm', 0.6], ['overcast', 1.5], ['fog', 1], ['clear', 0.5]], 0.15);
    const cam = 1.6, f = (H - vy) / cam * 0.5, XL = rng.range(7, 9), XR = rng.range(7, 9), road = rng.range(3.6, 4.6), zEnd = rng.range(55, 80);
    const sx = (X, z) => vx + X * f / z, sy = (Y, z) => vy + (cam - Y) * f / z;
    const gl = glyphSet(rng);
    // Slots by depth band, so the far end of the street fades into the wet haze.
    const band = z => Math.min(7, Math.floor(clamp(z / zEnd) * 8)), memo = new Map();
    const at = (key, z, make) => { const k = key + '|' + band(z); let v = memo.get(k); if (v === undefined) memo.set(k, v = make(band(z) / 8 * 0.75)); return v; };
    const wall = (p, z) => at('w' + p, z, d => sc.ramp(FACADES[p], d));
    const emit = (c, base, z, v = 1) => at(['e', c, base, v].join(), z, d => sc.slot({ k: 'emit', c: hex(c), base: hex(base), d, v }));
    const glass = z => at('g', z, d => sc.slot({ k: 'mat', c: hex('#14161c'), d }));
    const WIN = [LIGHTS.warm, LIGHTS.warm, LIGHTS.cool, '#7af0e0', '#ff9ad0', LIGHTS.white];
    // The buildings: a row of fronts along each side, then a far block across the end.
    const row = () => {
        const out = [];
        for (let z = 0.3; z < zEnd + 20;) {
            const len = rng.range(5, 14);
            const h = rng.range(7, 30), bb = h > 10 && rng.chance(0.55) && { a0: rng.range(0.5, Math.max(0.6, len - 5)), w: rng.range(2.5, Math.min(6, len - 1)), y0: rng.range(5.5, h - 4), h: rng.range(1.6, 3.2), c: rng.pick(NEON), c2: rng.pick(NEON), lit: rng.chance(0.5) };
            out.push({ z0: z, z1: z + len, h, bb, p: rng.int(0, FACADES.length - 1), shop: rng.pick(NEON), kind: pick(rng, ['store', 3], ['shutter', 1.2], ['bar', 1.5]), tone: rng.pick(WIN),
                floor: rng.range(2.9, 3.4), bay: rng.range(1.6, 2.6), s: rng.int(1, 1e6), neonBand: rng.chance(0.5) });
            z += len;
        }
        return out;
    };
    const rows = { [-1]: row(), [1]: row() }, segAt = (side, z) => rows[side].find(g => z < g.z1) ?? rows[side].at(-1);
    const far = Array.from({ length: 6 }, () => ({ h: rng.range(10, 34), p: rng.int(0, FACADES.length - 1), shop: rng.pick(NEON), kind: 'store', tone: rng.pick(WIN), floor: 3.2, bay: 2, s: rng.int(1, 1e6), neonBand: true }));
    const farAt = X => far[clamp(Math.floor((X + 20) / 8), 0, far.length - 1)];
    // One point of a building's face: `a` metres along it, Y up; `face` is which way it is lit.
    const facade = (g, a, Y, z, face, len) => {
        const R = wall(g.p, z);
        if (a < 0.25 || len - a < 0.25) return R.face(face, 0);
        if (Y > g.h - 0.5) return R.face(face, 1);
        if (Y < 3) {
            if (Y < 0.25 || Y > 2.75) return R.face(face, 0);
            // Closed for the night behind a ribbed roller shutter.
            if (g.kind === 'shutter') return at('r', z, d => sc.ramp(PAVING, d)).flat(Y % 0.18 < 0.05 ? 1 : 3);
            if (a % 1.3 < 0.12) return R.face(face, 0);
            // A bar: dim inside, a neon sign glowing in the window.
            if (g.kind === 'bar') {
                const u = a % 1.3, n = Math.abs(Y - 1.6) < 0.35 && u > 0.3 && u < 1.0 && (Math.abs(Y - 1.6) > 0.25 || u < 0.38 || u > 0.92 || hash(Math.floor(u * 8), Math.floor(Y * 8), g.s) < 0.3);
                return n ? emit(g.shop, '#14161a', z) : emit('#8a4a3a', '#101216', z, 0.3);
            }
            // A store, lit inside: ceiling lights, then racks of stock in front of a bright back wall.
            const rack = Y < 2.2 && (Y % 0.55 < 0.07 || (Y % 0.55 > 0.18 && hash(Math.floor(a * 6), Math.floor(Y / 0.55), g.s) < 0.55));
            return Y > 2.45 ? emit(LIGHTS.white, '#1a1c22', z, 0.85) : emit(g.tone, '#1a1c22', z, rack ? 0.3 : 0.6);
        }
        if (Y < 3.9) {
            // The shop's sign: lettering lit on a dark board, or dark on a lit one.
            const cw = 0.8, cell = Math.floor(a / cw), gx = Math.floor((a % cw) / cw * 6) - 0.5, gy = Math.floor((Y - 3.05) / 0.75 * 6) - 0.5;
            const on = gx >= 0 && gx < 5 && gy >= 0 && gy < 5 && gl[hash(cell, 1, g.s) * gl.length | 0][(4 - Math.round(gy)) * 5 + Math.round(gx)];
            if (Y < 3.1 || Y > 3.82) return R.face(face, 0);
            return g.neonBand === !!on ? glass(z) : emit(g.shop, '#30303a', z, 0.9);
        }
        // A billboard on the upper floors: a neon-edged panel of lettering.
        const bb = g.bb;
        if (bb && a > bb.a0 && a < bb.a0 + bb.w && Y > bb.y0 && Y < bb.y0 + bb.h) {
            const u = a - bb.a0, v = Y - bb.y0;
            if (u < 0.12 || v < 0.12 || bb.w - u < 0.12 || bb.h - v < 0.12) return emit(bb.c, '#2a2a32', z);
            const cs = bb.h * 0.42, row = Math.floor((v - 0.2) / cs), gx = Math.floor(((u - 0.25) % cs) / cs * 6), gy = Math.floor(((v - 0.2) % cs) / cs * 6);
            const on = row < 2 && u > 0.25 && u < bb.w - 0.25 && gx < 5 && gy < 5 && gl[hash(Math.floor((u - 0.25) / cs), row, g.s) * gl.length | 0][(4 - gy) * 5 + gx];
            return bb.lit ? (on ? at('k', z, d => sc.slot({ k: 'mat', c: hex('#101014'), d })) : emit(bb.c, '#2a2a32', z, 0.8)) : on ? emit(bb.c2, '#2a2a32', z) : at('k', z, d => sc.slot({ k: 'mat', c: hex('#101014'), d }));
        }
        const fy = (Y - 4.4) % g.floor, bx = a % g.bay;
        if (Y > 4.4 && fy > 0.7 && fy < 2.1 && bx > 0.45 && bx < g.bay - 0.45) {
            // Windows: a frame and a glazing bar; lit ones with curtains drawn to the sides.
            const ix = Math.floor(a / g.bay), iy = Math.floor((Y - 4.4) / g.floor), lit = hash(ix, iy, g.s), w = g.bay - 0.9, u = (bx - 0.45) / w;
            if (fy < 0.8 || fy > 2.0 || u < 0.06 || u > 0.94 || Math.abs(u - 0.5) < 0.04) return R.face(face, 0);
            if (lit >= 0.42) return glass(z);
            const c = lit < 0.08 ? WIN[Math.floor(lit / 0.08 * WIN.length)] : g.tone, curtain = Math.abs(u - 0.5) > 0.32 - hash(ix, iy + 9, g.s) * 0.15;
            return emit(c, '#16181e', z, curtain ? 0.4 : 0.75);
        }
        // Air conditioners under some windows.
        if (Y > 4.4 && fy < 0.6 && fy > 0.15 && bx > 0.55 && bx < 1.15 && hash(Math.floor(a / g.bay), Math.floor((Y - 4.4) / g.floor), g.s + 5) < 0.3) return at('ac', z, d => sc.ramp(PAVING, d)).flat(fy > 0.5 ? 3 : 2);
        return R.face(face, (Math.floor(Y * 3) + Math.floor(a * 1.5)) % 7 === 0 ? 0 : 1);
    };
    // Every pixel: the wall at its column, the front of a taller building beyond, the far
    // block, the ground. Ground pixels remember which row of the wall they mirror.
    const b = new Buf(W, H), refl = [], As = sc.ramp(ASPHALT, 0), ws = seedOf(rng), zc = rng.range(8, 20);
    const wet = (X, z) => fbm2(X * 0.45, z * 0.22, ws, 3);
    for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - vx, side = dx < 0 ? -1 : 1, Xw = side < 0 ? XL : XR;
        let zf = Xw * f / Math.abs(dx);
        const farCol = zf > zEnd;
        if (farCol) zf = zEnd;
        const g0 = vy + cam * f / zf;
        for (let y = 0; y < H; y++) {
            if (y >= g0) {
                const z = cam * f / (y + 0.5 - vy), X = (x + 0.5 - vx) * z / f, ax = Math.abs(X), d = band(z) / 8 * 0.75;
                let v, thr;
                if (ax < road) {
                    const R = at('a', z, d => sc.ramp(ASPHALT, d)), paint = at('p', z, d => sc.slot({ k: 'mat', c: hex('#8a8c90'), d }));
                    const dash = ax < 0.07 && z % 6 < 3, zebra = z > zc && z < zc + 3 && (X + 20) % 1 < 0.5;
                    v = dash || zebra ? paint : R.flat(noise2(X * 3, z * 0.8, ws + 1) > 0.6 ? 1 : 0);
                    thr = wet(X, z) > 0.52 || ax > road - 0.4 ? 1 : 0.25;
                } else if (ax < road + 0.18) {
                    v = at('c', z, d => sc.slot({ k: 'mat', c: hex('#5a5c62'), d })); thr = 0.2;
                } else {
                    const R = at('s', z, d => sc.ramp(PAVING, d)), seam = z % 1.2 < 0.06 || ax % 1.2 < 0.05;
                    v = R.flat(seam ? 0 : 1); thr = wet(X, z) > 0.58 ? 1 : 0.2;
                }
                b.set(x, y, v);
                const my = Math.round(2 * g0 - y);
                if (my >= 0) refl.push(y * W + x, my * W + x, Math.round(thr * 16));
                continue;
            }
            const Y = cam - (y + 0.5 - vy) * zf / f;
            if (farCol) {
                const X = (x + 0.5 - vx) * zf / f, g = farAt(X);
                if (Y <= g.h) b.set(x, y, facade(g, (X + 20) % 8, Y, zf, 1, 8));
                continue;
            }
            const g = segAt(side, zf);
            if (Y <= g.h) { b.set(x, y, facade(g, zf - g.z0, Y, zf, -side, g.z1 - g.z0)); continue; }
            // Above a lower roof: the end wall of a taller building further along.
            for (const n of rows[side]) {
                if (n.z0 <= zf || n.z0 > zEnd) continue;
                const Yn = cam - (y + 0.5 - vy) * n.z0 / f;
                if (Yn <= n.h) { b.set(x, y, facade(n, Math.abs((x + 0.5 - vx) * n.z0 / f) - Xw, Yn, n.z0, 0, 30)); break; }
            }
        }
    }
    // Far towers in the gap of sky, before the street so it covers them.
    const tb = new Buf(W, H), Tw = sc.ramp(P.struct, 0.6), twin = sc.slot({ k: 'emit', c: hex(LIGHTS.warm), base: hex(P.struct[1]), d: 0.6, v: 0.6 });
    const beacons = [];
    for (let i = rng.int(4, 9); i > 0; i--) {
        const cx = vx + rng.range(-0.25, 0.25) * W, w = rng.range(6, 22) * U / 216, top = vy - U * rng.range(0.1, 0.55);
        for (let x = Math.round(cx - w / 2); x <= cx + w / 2; x++) for (let y = Math.round(top); y <= vy; y++) tb.set(x, y, (x % 3 === 0 && y % 3 === 0 && hash(x, y, 4) < 0.35) ? twin : Tw.flat(x < cx ? 0 : 1));
        beacons.push([Math.round(cx), Math.round(top) - 1]);
    }
    sc.addStatic(tb);
    sc.addStatic(b);
    // Blade signs jutting from the walls, facing down the street toward us, farthest first.
    const sb = new Buf(W, H), flick = [];
    const signs = [];
    for (const side of [-1, 1]) for (let i = rng.int(4, 9); i > 0; i--) signs.push({ side, z: rng.range(1.5, zEnd * 0.6), yb: rng.range(3.9, 5), h: rng.range(2.5, 7), w: rng.range(0.6, 1.1), c: rng.pick(NEON), c2: rng.pick(NEON), fl: rng.chance(0.25), s: rng.int(1, 1e6) });
    signs.sort((a, c) => c.z - a.z);
    for (const g of signs) {
        const Xw = g.side < 0 ? -XL : XR, x0 = sx(Xw - g.side * 0.15, g.z), x1 = sx(Xw - g.side * (0.15 + g.w), g.z);
        const xa = Math.round(Math.min(x0, x1)), xb = Math.round(Math.max(x0, x1)), ya = Math.round(sy(g.yb + g.h, g.z)), yb = Math.round(sy(g.yb, g.z));
        const neon = emit(g.c, '#3a3842', g.z), lettering = emit(g.c2, '#2a2a32', g.z), halo = emit(g.c, '#1c1c24', g.z, 0.28), board = at('k', g.z, d => sc.slot({ k: 'mat', c: hex('#101014'), d }));
        const bw = Math.max(1, Math.round(0.08 * f / g.z)), list = [];
        for (let y = ya - 2; y <= yb + 2; y++) for (let x = xa - 2; x <= xb + 2; x++) {
            const out = y < ya || y > yb || x < xa || x > xb;
            if (out) { if (bayer(x, y) < 0.5 && !sb.get(x, y)) sb.set(x, y, halo); continue; }
            const edge = y - ya < bw || yb - y < bw || x - xa < bw || xb - x < bw;
            let v = edge ? neon : board;
            if (!edge && xb - xa > 4) {
                // Lettering down the board, one glyph per cell.
                const cw = xb - xa - 2 * bw, cell = Math.floor((y - ya - bw) / cw), u = ((x - xa - bw) / cw) * 7 - 1, w2 = ((y - ya - bw) % cw) / cw * 7 - 1;
                if (u >= 0 && u < 5 && w2 >= 0 && w2 < 5 && gl[hash(cell, 2, g.s) * gl.length | 0][Math.floor(w2) * 5 + Math.floor(u)]) v = lettering;
            } else if (!edge) v = neon;
            sb.set(x, y, v);
            if (g.fl && v !== board) list.push(y * W + x);
        }
        if (list.length) flick.push({ list, s: g.s });
    }
    sc.addStatic(sb);
    // Cables strung across, some hung with paper lanterns.
    const cb = new Buf(W, H), cable = sc.slot({ k: 'mat', c: hex('#0c0c10'), d: 0.1 });
    for (let i = rng.int(3, 6); i > 0; i--) {
        const z = rng.range(4, zEnd * 0.5), Y = rng.range(6, 9), sag = rng.range(0.3, 0.9), xa = sx(-XL, z), xb = sx(XR, z), lan = rng.chance(0.4);
        const red = emit('#ff5a3c', '#5a2a24', z), gold = emit('#ffd27a', '#5a4a30', z), lr = Math.max(1, 0.25 * f / z);
        for (let x = Math.ceil(xa); x <= xb; x++) {
            const u = (x - xa) / (xb - xa), yy = sy(Y - sag * 4 * u * (1 - u), z);
            cb.set(x, yy, cable);
            if (lan && Math.round(x - xa) % Math.max(3, Math.round(1.6 * f / z)) === 0 && u > 0.05 && u < 0.95) {
                for (let dy = 0; dy <= lr * 2.4; dy++) for (let dx = -lr; dx <= lr; dx++) if ((dx / lr) ** 2 + ((dy - lr * 1.2) / (lr * 1.2)) ** 2 <= 1) cb.set(x + dx, yy + 1 + dy, (x / 7 | 0) % 2 ? red : gold);
            }
        }
    }
    sc.addStatic(cb);
    // The traffic light at the end of the street, signs that stutter, red lights atop the towers.
    const tz = zEnd - 3, tx = vx, ty = Math.round(sy(5.5, tz)), lamps = [['#ff3b30', '#401010'], ['#ffb02e', '#402a10'], ['#4aff8a', '#104020']].map(([c, base]) => emit(c, base, tz)), dim = at('k', tz, d => sc.slot({ k: 'mat', c: hex('#101014'), d }));
    const off = sc.slot({ k: 'mat', c: hex('#1a1a20'), d: 0.1 }), beacon = sc.slot({ k: 'flame', c: hex('#ff3b30') });
    sc.addFn((f2, t, L) => {
        const ph = t % 30, on = ph < 12 ? 2 : ph < 15 ? 1 : 0;
        for (let k = 0; k < 3; k++) for (let dx = -1; dx <= 1; dx++) f2[(ty + k * 2) * W + tx + dx] = dx === 0 && k === on ? lamps[2 - k] : dim;
        for (const g of flick) {
            const ff = hash(Math.floor(t * 8), 3, g.s);
            if (ff < 0.12 || (Math.floor(t / 4 + g.s) % 7 === 0 && ff < 0.6)) for (const i of g.list) f2[i] = off;
        }
        if (L.lights > 0.2 && Math.floor(t * 0.8) % 2) for (const [x, y] of beacons) if (x >= 0 && x < W && y >= 0) f2[y * W + x] = beacon;
    });
    // The wet street mirrors everything above it, rippling where the rain lands.
    sc.water = { k: 'mat', c: hex(ASPHALT[1]), d: 0.1 };
    sc.reflectMix = 0.5;
    const R = Int32Array.from(refl);
    sc.addFn((f2, t) => {
        for (let k = 0; k < R.length; k += 3) {
            const i = R[k], y = (i / W) | 0, x = i - y * W;
            if (bayer(x, y) * 16 >= R[k + 2]) continue;
            const j = R[k + 1] + Math.round(Math.sin(y * 0.9 + t * 2.1) * 0.7 + Math.sin(y * 0.31 - t * 1.3) * 0.5);
            const v = f2[j];
            if (v && v < REFLECT) f2[i] = v + REFLECT;
        }
    });
    // Steam rising from a grate in the road.
    const gz = rng.range(6, 14), gx = rng.range(-1.5, 1.5), steam = [sc.slot({ k: 'fx', c: hex('#c8ccd8'), a: 0.45 }), sc.slot({ k: 'fx', c: hex('#e0e4ee'), a: 0.6 })];
    const grate = sc.slot({ k: 'mat', c: hex('#0a0a0c'), d: 0.1 }), gk = f / gz;
    for (let k = -0.5 * gk; k <= 0.5 * gk; k++) for (let j = -0.12 * gk; j <= 0.12 * gk; j++) b.set(sx(gx, gz) + k, sy(0, gz) + j, (Math.round(k) % 2) ? grate : b.get(sx(gx, gz) + k, sy(0, gz) + j));
    sc.addFn((f2, t) => {
        const put = putter(f2, W, H), x0 = sx(gx, gz), y0 = sy(0, gz);
        for (let i = 0; i < 60; i++) {
            const age = (t * 0.25 + i / 60) % 1, r = gk * (0.15 + age * 0.9);
            const x = x0 + Math.sin(i * 2.4 + t * 0.6) * r + age * gk * 0.6, y = y0 - age * gk * 3;
            if (bayer(Math.round(x), Math.round(y)) < (1 - age) * 0.8) { put(x, y, steam[age < 0.4 ? 1 : 0]); put(x + 1, y, steam[0]); }
        }
    });
    // People walking under umbrellas, their reflections broken in the puddles.
    const brolly = ['#2a2a34', '#3a5ab0', '#c03a5a', '#e8e8f0', '#3a9a7a', '#e0b030'].map(c => sc.slot({ k: 'emit', c: hex(c), base: mul(hex(c), [0.7, 0.7, 0.7]), d: 0.05, v: 0.7 }));
    const coat = ['#1c1c22', '#2a2420', '#22283a', '#3a3030'].map(c => sc.slot({ k: 'emit', c: mul(hex(c), [1.6, 1.6, 1.8]).map(v => Math.min(255, v)), base: hex(c), d: 0.05, v: 0.3 }));
    const people = Array.from({ length: rng.int(4, 9) }, () => {
        const side = rng.chance(0.5) ? -1 : 1, Xw = side < 0 ? XL : XR;
        return { X: side * rng.range(road + 0.6, Xw - 0.5), z0: rng.range(1.5, 30), v: rng.range(0.6, 1.3) * (rng.chance(0.5) ? 1 : -1), u: rng.pick(brolly), c: rng.pick(coat), ph: rng() * 6 };
    });
    sc.addFn((f2, t) => {
        const put = putter(f2, W, H), span = 28;
        const now = people.map(p => ({ p, z: 1.5 + ((((p.z0 - 1.5 + p.v * t) % span) + span) % span) })).sort((a, c) => c.z - a.z);
        for (const { p, z } of now) {
            const k = f / z, x = sx(p.X, z), feet = sy(0, z), step = Math.sin(t * 5 * Math.abs(p.v) + p.ph);
            const dot = (px, py, v) => { put(px, py, v); const ry = Math.round(2 * feet - py) + 1; if (ry < H && bayer(Math.round(px), ry) < 0.4) put(px, ry, v + REFLECT); };
            for (let y = feet - 1.55 * k; y <= feet - 0.45 * k; y++) for (let dx = -0.22 * k; dx <= 0.22 * k; dx++) dot(x + dx, y, p.c);
            for (let y = feet - 0.45 * k; y <= feet; y++) { dot(x - 0.1 * k + step * 0.06 * k, y, p.c); dot(x + 0.1 * k - step * 0.06 * k, y, p.c); }
            const ur = 0.55 * k, uy = feet - 2.05 * k;
            for (let dy = 0; dy <= ur * 0.5; dy++) for (let dx = -ur; dx <= ur; dx++) if ((dx / ur) ** 2 + ((ur * 0.5 - dy) / (ur * 0.5)) ** 2 <= 1) dot(x + dx, uy + dy, p.u);
            for (let y = uy + ur * 0.5; y < feet - 1.5 * k; y++) dot(x, y, coat[0]);
        }
    });
}

// ---------------------------------------------------------------- train window

const CROPS = {
    wheat: ['#7a6a30', '#968440', '#bca458', '#dcc678'],
    rape: ['#5a6a2a', '#6e8234', '#8ea044', '#aec05a'],
    soil: ['#4a3424', '#5c4230', '#7a5a40', '#94704e'],
};
const CYCLE = 200;   // seconds: pull away, run, brake, wait at the station

// The landscape out of a train window, in layers that slide past at their own pace: far
// mountains barely moving, hills and farms, then fields and hedges, the embankment and
// telegraph poles whipping by. Every few minutes the train slows into a small station and
// waits; now and then it runs through a tunnel. The carriage is drawn in front of it all.
function train(sc, rng) {
    const { W, H, U } = sc, s = U / 216, wy1 = Math.round(H * 0.76), hz = sc.horizon = Math.round(lerp(H * 0.12, wy1, rng.range(0.42, 0.52) - (H - U) / H * 0.2));
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz);
    // Where the train is along the line at time t, in pixels of the nearest layer.
    const vmax = U * rng.range(0.45, 0.6), dt = 0.05, n = CYCLE / dt, table = new Float32Array(n + 1);
    const speedIn = tc => (tc < 14 ? smoothstep(0, 14, tc) : tc < 160 ? 1 : 1 - smoothstep(160, 178, tc));
    for (let i = 1; i <= n; i++) table[i] = table[i - 1] + speedIn((i - 0.5) * dt) * vmax * dt;
    const D = table[n], t0 = rng() * CYCLE;
    const pos = t => { const tt = t + t0, k = Math.floor(tt / CYCLE), r = (tt - k * CYCLE) / dt, i = Math.floor(r); return k * D + table[i] + (table[Math.min(n, i + 1)] - table[i]) * (r - i); };
    const speed = t => speedIn(((t + t0) % CYCLE + CYCLE) % CYCLE);
    // A layer that wraps around and slides by k times the train's travel.
    const slide = (buf, k) => {
        const [y0, y1] = buf.rows(), src = buf.d, bw = buf.w;
        sc.addFn((f, t) => {
            const off = ((Math.floor(pos(t) * k) % bw) + bw) % bw;
            for (let y = y0; y < y1; y++) {
                const row = y * bw, o = y * W;
                for (let x = 0; x < W; x++) {
                    let sx = x + off;
                    if (sx >= bw) sx -= bw;
                    const v = src[row + sx];
                    if (v) f[o + x] = v;
                }
            }
        });
    };
    // Wrapping layers are a whole number of noise cells wide, so their noise wraps too.
    const wide = m => Math.ceil(W * m / 64) * 64;
    // Far mountains.
    {
        const bw = wide(4), b = new Buf(bw, H, { wrap: true }), R = sc.ramp(P.blueRock, 0.55), Sn = rng.chance(0.5) && sc.ramp(P.snow, 0.5), ms = seedOf(rng), c = bw / 64;
        const h = x => hz + 2 - U * (0.05 + 0.2 * fbm1(x / 64, ms, 3, c) ** 1.4), snowLine = hz - U * 0.19;
        for (let x = 0; x < bw; x++) {
            const top = h(x);
            for (let y = Math.round(top); y <= hz + 2; y++) {
                // Lit by which way the slope faces a little below the crest, so ridges and gullies run down the flanks.
                const lean = h(x + 3 + (y - top) * 0.4) - h(x - 3 - (y - top) * 0.4), side = lean + (fbm2(x / 16, y * 0.08, ms + 1, 2, bw / 16) - 0.5) * 8 > 0 ? 1 : -1;
                const snowy = Sn && y < snowLine + (noise2(x * 0.2, y * 0.2, ms + 2) - 0.5) * 6;
                b.set(x, y, (snowy ? Sn : R).face(side, y - top < 1.2 ? 1 : 0));
            }
        }
        slide(b, 0.012);
    }
    // Rolling hills with woods and farms.
    {
        const bw = wide(3), b = new Buf(bw, H, { wrap: true }), R = sc.ramp(P.hill, 0.3), hs = seedOf(rng), c = bw / 64, T = sc.ramp(P.trunk, 0.3), Fo = sc.ramp(P.forest, 0.3);
        const h = x => hz + 4 - U * 0.06 * fbm1(x / 64, hs, 3, c);
        for (let x = 0; x < bw; x++) for (let y = Math.round(h(x)); y <= hz + 16; y++) b.set(x, y, R.face(h(x + 2) - h(x - 2) > 0 ? 1 : -1, fbm2(x / 32, y * 0.1, hs + 1, 2, bw / 32) > 0.55 ? 1 : 0));
        for (let x = rng.range(0, 20); x < bw; x += rng.range(6, 40)) {
            const y = h(x) + rng.range(1, 6);
            if (rng.chance(0.3)) conifer(b, x, y, rng.range(7, 13) * s, Fo, rng);
            else blobTree(b, x, y, rng.range(7, 13) * s, sc.leaves(P.leaf, 0.3, leafVariant(rng)), T, rng);
        }
        const wall = sc.ramp(P.wall, 0.3), roof = sc.ramp(P.roof, 0.3);
        for (let i = rng.int(2, 5); i > 0; i--) { const x = rng.range(0, bw); house(sc, b, x, h(x) + 6, Math.round(rng.range(7, 11) * s), Math.round(rng.range(4, 6) * s), wall, roof, () => rng.chance(0.6)); }
        slide(b, 0.06);
    }
    // Fields running up to hedgerows, sheep in the pasture.
    const fieldTop = hz + Math.round(U * 0.05), nearTop = Math.round(hz + (wy1 - hz) * rng.range(0.6, 0.72));
    {
        const bw = wide(3), b = new Buf(bw, H, { wrap: true }), fs = seedOf(rng), Hd = sc.ramp(P.canopy, 0.15), T = sc.ramp(P.trunk, 0.15);
        const kinds = [[P.grass, 'grass', 3], [CROPS.wheat, 'wheat', 2], [CROPS.rape, 'rape', 1], [CROPS.soil, 'soil', 1]];
        const sheep = sc.slot({ k: 'mat', c: hex('#e8e4da'), d: 0.12 }), sheepD = sc.slot({ k: 'mat', c: hex('#3a3430'), d: 0.12 });
        for (let x0 = 0; x0 < bw;) {
            const w = Math.min(bw - x0, Math.round(rng.range(50, 150) * s)), [pal, g] = pick(rng, ...kinds.map(([p, g, wt]) => [[p, g], wt])), R = sc.ramp(pal, 0.15, g), sl = rng.range(-1.2, 1.2);
            for (let y = fieldTop; y < nearTop + 4; y++) for (let x = x0 + Math.round((y - fieldTop) * 0.6), e = x + w; x < e; x++) {
                const rowLine = ((x + (y - fieldTop) * sl) % 5 + 5) % 5 < 1 && g !== 'grass';
                b.set(x, y, R.flat(rowLine ? 0 : fbm2(x / 16, y * 0.15, fs, 2, bw / 16) > 0.55 ? 2 : 1));
            }
            if (g === 'grass') for (let i = Math.round(w / 12); i > 0; i--) { const x = x0 + rng.range(4, w - 4), y = rng.range(fieldTop + 4, nearTop); b.set(x, y, sheep); b.set(x + 1, y, sheep); b.set(x + 2, y, sheepD); }
            x0 += w;
        }
        // The hedge along the far edge of the fields, trees standing out of it.
        for (let x = 0; x < bw; x++) {
            const top = fieldTop - 2 - 3 * noise1(x / 8, fs + 2, bw / 8);
            for (let y = Math.round(top); y <= fieldTop + 1; y++) b.set(x, y, Hd.face(1, y - top < 1.5 ? 1 : 0));
        }
        for (let x = rng.range(0, 30); x < bw; x += rng.range(20, 90)) blobTree(b, x, fieldTop + 1, rng.range(18, 30) * s, sc.leaves(P.leaf, 0.15, leafVariant(rng)), T, rng);
        slide(b, 0.25);
    }
    // The embankment rushing past, blurred to streaks, and the rails of the other line.
    {
        const bw = wide(2), b = new Buf(bw, H, { wrap: true }), G = sc.ramp(P.grass, 0.02, 'blade'), es = seedOf(rng), Ba = sc.ramp(Q.gravel, 0.02), rail = sc.slot({ k: 'mat', c: hex('#b8b8c0'), d: 0.02 });
        const rails = wy1 - Math.round(U * 0.03);
        for (let x = 0; x < bw; x++) {
            const top = nearTop + 3 * fbm1(x / 32, es, 2, bw / 32);
            for (let y = Math.round(top); y < H; y++) {
                if (y > rails - 3) { b.set(x, y, y === rails || y === rails + Math.round(U * 0.03) ? rail : Ba.flat(fbm2(x / 4, y * 0.5, es + 1, 2, bw / 4) > 0.5 ? 1 : 2)); continue; }
                b.set(x, y, G.flat(clamp(Math.floor(fbm2(x / 64, y * 0.35, es + 2, 3, bw / 64) * 4 + (y - top < 1 ? 1 : 0)), 0, 3)));
            }
        }
        slide(b, 1);
    }
    // Telegraph poles and their sagging wires.
    const PS = Math.round(U * 1.4), Tr = sc.ramp(P.trunk, 0), Tp = [Tr.face(-1, 1), Tr.face(1, 1), Tr.flat(1)], wire = sc.slot({ k: 'mat', c: hex('#1a1a1e'), d: 0.02 }), ins = sc.slot({ k: 'mat', c: hex('#c8d0d8'), d: 0.02 });
    const poleTop = hz - Math.round(U * 0.3);
    // The station: a platform, a canopy on columns, the booking hall behind, lamps and a clock.
    const SW = Math.round(Math.max(W * 1.3, U * 2.4)), stb = new Buf(SW, H);
    {
        const plat = Math.round(nearTop + (H - nearTop) * 0.25), Pv = sc.ramp(Q.gravel, 0.04), edge = sc.slot({ k: 'mat', c: hex('#e8c840'), d: 0.04 });
        const brick = sc.ramp(rng.pick([P.roof, P.wall, Q.plaster]), 0.08), Cv = sc.ramp(['#24303c', '#2e3c4a', '#4a5e72', '#627890'], 0.05);
        const posterC = ['#c84a3a', '#3a7ac0', '#e0c050', '#4aa070'].map(c => sc.slot({ k: 'mat', c: hex(c), d: 0.06 }));
        const glow = sc.slot({ k: 'emit', c: hex(LIGHTS.warm), base: hex('#3a3a40'), d: 0.06, v: 1 }), white = sc.slot({ k: 'mat', c: hex('#f0eee8'), d: 0.05 }), ink = sc.slot({ k: 'mat', c: hex('#1a2230'), d: 0.05 });
        const roofY = poleTop + Math.round(U * 0.04), hallTop = roofY;
        for (let x = 0; x < SW; x++) {
            // The booking hall's wall with tall windows, its slate roof, the canopy over the platform.
            const u = x / SW, inHall = u > 0.3 && u < 0.7;
            if (inHall) {
                const bay = Math.round(U * 0.16), wx = (x - Math.round(SW * 0.3)) % bay, k = Math.floor((x - SW * 0.3) / bay), door = hash(k, 1, 77) < 0.3;
                const wTop = door ? plat - Math.round(U * 0.14) : roofY + Math.round(U * 0.07), wBot = door ? plat : wTop + Math.round(U * 0.09);
                for (let y = hallTop; y < plat; y++) {
                    // Windows and doors in frames, posters between them, brick all round.
                    const inW = wx > bay * 0.25 && wx < bay * 0.75 && y > wTop && y < wBot, rim = inW && (wx < bay * 0.25 + 2 || wx > bay * 0.75 - 2 || y < wTop + 2 || (!door && (y > wBot - 2 || Math.abs(wx - bay / 2) < 1 || Math.abs(y - (wTop + wBot) / 2) < 1)));
                    const poster = !inW && wx > bay * 0.78 && wx < bay * 0.95 && y > wTop + U * 0.02 && y < wTop + U * 0.08;
                    stb.set(x, y, rim ? Cv.flat(3) : inW ? (door ? Cv.flat(1) : glow) : poster ? posterC[k % posterC.length] : brick.face(1, (y % 4 === 0 || (x + (y >> 2) * 3) % 8 === 0) ? 0 : 1));
                }
            }
            for (let y = roofY - Math.round(U * 0.025); y <= roofY; y++) stb.set(x, y, Cv.flat(y === roofY ? 0 : 2));
            // Valance of the canopy: a scalloped wooden edge.
            if (x % 4 < 3) stb.set(x, roofY + 1, Cv.flat(1));
            if (x % Math.round(U * 0.45) < Math.max(2, 2.5 * s)) for (let y = roofY; y < plat; y++) stb.set(x, y, Cv.face(1, 1));
            for (let y = plat; y < H; y++) stb.set(x, y, y - plat < Math.max(2, 2 * s) ? edge : Pv.flat(y - plat < 4 * s ? 3 : (x + y) % 9 === 0 ? 1 : 2));
        }
        // The nameboard, a clock, lamps hanging under the canopy, benches.
        const nb = Math.round(SW * rng.range(0.3, 0.6)), ny = roofY + Math.round(U * 0.07), nw = Math.round(U * 0.22), nh = Math.round(U * 0.05);
        for (let y = ny; y < ny + nh; y++) for (let x = nb; x < nb + nw; x++) {
            const inner = y > ny && y < ny + nh - 1 && x > nb && x < nb + nw - 1, ch = Math.floor((x - nb - 3) / 4);
            stb.set(x, y, !inner ? ink : y > ny + 2 && y < ny + nh - 3 && x > nb + 3 && x < nb + nw - 4 && (x - nb - 3) % 4 < 3 && hash(ch, y, 9) < 0.6 ? ink : white);
        }
        const cx = Math.round(SW * 0.5 + (nb < SW / 2 ? 1 : -1) * U * 0.3), cy = roofY + Math.round(U * 0.06), cr = Math.max(3, Math.round(U * 0.025));
        for (let y = -cr; y <= cr; y++) for (let x = -cr; x <= cr; x++) { const d = Math.hypot(x, y); if (d <= cr) stb.set(cx + x, cy + y, d > cr - 1 ? ink : (x === 0 && y < 0 && y > -cr + 1) || (y === 0 && x > 0 && x < cr - 1) ? ink : white); }
        for (let x = Math.round(U * 0.22); x < SW; x += Math.round(U * 0.45)) { for (let j = 1; j < U * 0.04; j++) stb.set(x, roofY + j, wire); stb.set(x, roofY + Math.round(U * 0.04), glow); stb.set(x + 1, roofY + Math.round(U * 0.04), glow); }
        for (let i = rng.int(1, 3); i > 0; i--) {
            const bx = Math.round(rng.range(0.1, 0.9) * SW), bw2 = Math.round(U * 0.09), by = plat - 1;
            for (let x = bx; x < bx + bw2; x++) { stb.set(x, by - Math.round(U * 0.03), Cv.flat(3)); stb.set(x, by - Math.round(U * 0.045), Cv.flat(2)); }
            for (const lx of [bx + 1, bx + bw2 - 2]) for (let y = by - Math.round(U * 0.045); y <= by; y++) stb.set(lx, y, Cv.flat(0));
        }
    }
    sc.addFn((f, t) => {
        const p = pos(t), put = putter(f, W, H);
        for (let j = Math.floor((p - SW) / D); j <= Math.ceil((p + W) / D); j++) {
            const x0 = Math.round(j * D + W / 2 - SW / 2 - p);
            if (x0 >= W || x0 + SW <= 0) continue;
            for (let y = 0; y < H; y++) for (let x = Math.max(0, x0); x < Math.min(W, x0 + SW); x++) { const v = stb.d[y * SW + x - x0]; if (v) f[y * W + x] = v; }
        }
        // Poles, skipped where the station stands.
        for (let j = Math.floor(p / PS) - 1; j <= Math.ceil((p + W) / PS) + 1; j++) {
            const x = Math.round(j * PS - p), nx = Math.round((j + 1) * PS - p), st = Math.round((j * PS) / D) * D + W / 2;
            if (Math.abs(j * PS - st) < SW / 2 + PS) continue;
            for (let y = poleTop; y < H; y++) for (let k = 0; k < Math.max(2, 3 * s); k++) put(x + k, y, Tp[k ? 1 : 0]);
            for (let k = -6 * s; k <= 7 * s; k++) put(x + k, poleTop + 3, Tp[2]);
            for (const a of [-5 * s, 6 * s]) put(x + a, poleTop + 2, ins);
            if (Math.abs((j + 1) * PS - (Math.round(((j + 1) * PS) / D) * D + W / 2)) < SW / 2 + PS) continue;
            for (const a of [-5 * s, 6 * s]) for (let xx = x; xx <= nx; xx++) { const u = (xx - x) / (nx - x); put(xx + a, poleTop + 2 + U * 0.08 * 4 * u * (1 - u), wire); }
        }
    });
    // Tunnels: the mouth slides in, then dark walls with lamps flicking by. Drawn in front
    // of the rain, and they turn the carriage lights on.
    const ts = rng.int(1, 1e6), tunnelAt = k => (hash(k, 3, ts) < 0.45 ? [k * D + D * 0.45, k * D + D * 0.45 + U * 8] : null);
    const inTunnel = t => {
        const p = pos(t), k = Math.floor(p / D), tn = tunnelAt(k);
        return tn ? clamp(Math.min(p + W - tn[0], tn[1] - p) / W) : 0;
    };
    sc.relight = (L, t) => { const k = inTunnel(t); if (k > 0) { L.lights = Math.max(L.lights, k); L.tint = L.tint.map(v => v * (1 - 0.7 * k)); } };
    sc.foreground.push(() => {
        const wallT = ['#0c0d0e', '#16181a', '#202326'].map(c => sc.slot({ k: 'flame', c: hex(c) })), Sr = sc.ramp(Q.lanternStone, 0), stone = [Sr.flat(0), Sr.face(1, 0), Sr.face(1, 1)];
        const lampT = ['#ffe6b0', '#c89850', '#5a4a34'].map(c => sc.slot({ k: 'flame', c: hex(c) })), ly = hz - Math.round(U * 0.1), gap = Math.round(U * 0.9);
        sc.addFn((f, t) => {
            const p = pos(t), tn = tunnelAt(Math.floor(p / D));
            if (!tn) return;
            for (let x = 0; x < W; x++) {
                const w = p + x;
                if (w < tn[0] || w > tn[1]) continue;
                const face = w - tn[0] < U * 0.12 || tn[1] - w < U * 0.12, wi = Math.floor(w);
                // Lamps on the wall go by as streaks, lighting a patch of wall round them.
                const dl = Math.abs((wi % gap) - gap / 2) - gap / 2 + 8, near = dl > 0 ? dl / 8 : 0;
                for (let y = 0; y < H; y++) {
                    let v;
                    if (face) v = y % 6 === 0 || (wi + ((y / 6 | 0) % 2) * 5) % 10 === 0 ? stone[0] : stone[(wi + y) % 7 ? 2 : 1];
                    else if (near > 0.4 && Math.abs(y - ly) <= 1) v = lampT[Math.abs(y - ly) ? 1 : 0];
                    else v = wallT[near > 0 && Math.abs(y - ly) < 12 * near && bayer(x, y) < near ? 2 : (wi >> 2) % 5 === 0 && y % 9 < 1 ? 1 : 0];
                    f[y * W + x] = v;
                }
            }
        });
    });
    sc.foreground.push(() => carriage(sc, rng, speed));
}

// The carriage around the window: panelled walls, a rounded window in a rubber-sealed frame
// with a vent light at the top, a little table with a cup on it, seat backs in patterned
// moquette at the corners, a luggage rack above. Rain streaks back along the glass at speed.
function carriage(sc, rng, speed) {
    const { W, H, U } = sc, warm = c => mul(c, [1.25, 1.05, 0.8]).map(v => Math.min(255, v));
    const shades = (c, v) => [0.62, 0.78, 1, 1.15].map(k => sc.slot({ k: 'room', c: mul(hex(c), [k, k, k]), lamp: warm(mul(hex(c), [k, k, k])), v }));
    const upper = shades(pick(rng, ['#c8bca4', 1], ['#a8b4b8', 1], ['#c0a890', 0.8]), 0.7), lower = shades(pick(rng, ['#5a3a32', 1], ['#2e3e5a', 1], ['#3e4a3a', 0.8]), 0.6);
    const metal = shades('#9aa0a8', 0.7), rubber = shades('#1c1c20', 0.5), table = shades(pick(rng, ['#7a5a3e', 1], ['#9a6a40', 1], ['#5a3e2c', 0.8]), 0.7);
    const m = Math.round(Math.min(W, H) * 0.1), wx0 = Math.round(Math.max(m, W * 0.1)), wx1 = W - wx0, wy0 = Math.round(H * 0.12), wy1 = Math.round(H * 0.76), r = Math.round(U * 0.07);
    const inWin = (x, y) => {
        const cx = clamp(x, wx0 + r, wx1 - r), cy = clamp(y, wy0 + r, wy1 - r);
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= wx0 && x <= wx1 && y >= wy0 && y <= wy1;
    };
    const b = new Buf(W, H), ft = Math.max(3, Math.round(U * 0.018)), ventY = Math.round(wy0 + (wy1 - wy0) * 0.2), belt = wy1 + ft * 3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (inWin(x, y)) {
            // The vent light's frame across the top of the glass.
            if (Math.abs(y - ventY) < Math.max(1, ft / 2)) b.set(x, y, metal[y < ventY ? 3 : 1]);
            continue;
        }
        const near = inWin(x + 1, y) || inWin(x - 1, y) || inWin(x, y + 1) || inWin(x, y - 1) || inWin(x + 2, y) || inWin(x - 2, y) || inWin(x, y + 2) || inWin(x, y - 2);
        const frame = !near && [3, 4, 5].some(k => inWin(x + k, y) || inWin(x - k, y) || inWin(x, y + k) || inWin(x, y - k));
        if (near) { b.set(x, y, rubber[1]); continue; }
        if (frame) { b.set(x, y, metal[y < wy0 + r ? 3 : 2]); continue; }
        // Panels: light above the belt line, dark below it, a seam between panels; a heater grille low down.
        const P2 = y < belt ? upper : lower, seam = (x === Math.round(wx0 / 2) || x === Math.round(W - wx0 / 2)) || y === belt;
        const grille = y > H - U * 0.12 && y < H - U * 0.04 && x > W * 0.2 && x < W * 0.8 && Math.abs(x - W / 2) > W * 0.04;
        b.set(x, y, P2[seam ? 0 : grille ? (y % 3 === 0 ? 0 : 3) : y < 4 ? 1 : 2]);
    }
    // The bay in perspective, eye level a little below the middle of the window: Y is height
    // below the eye and z depth, both in screen pixels at the window wall (z = 1), which
    // lies at a depth of 1; nearer things have z < 1 and grow by 1 / z.
    const vx = W / 2, vy = Math.round(lerp(wy0, wy1, 0.45)), ty = wy1 + ft + 1, B = ty - vy;
    const proj = (X, Y, z) => [vx + X / z, vy + Y / z];
    // The table: its top runs from the wall toward us, a thick front edge, one pedestal.
    const Xt = W * 0.19, zt = Math.max(0.45, B / (H - vy + B * 0.15)), edge = Math.max(2, ft * 0.8);
    const items = new Buf(W, H), cup = shades(rng.pick(['#f0ece4', '#c84a3a', '#3a5a8a']), 0.75), book = shades(rng.pick(['#6a2a2a', '#2a4a6a', '#5a6a3a']), 0.7);
    const cupAt = { X: -Xt * rng.range(0.3, 0.6), z: rng.range(0.75, 0.88) }, bookAt = { X: Xt * rng.range(0.15, 0.4), z: rng.range(0.7, 0.85), w: Xt * 0.45, d: 0.1 };
    const [px, py] = proj(0, B * 1.6, 0.8);
    for (let y = Math.round(py); y < H; y++) for (let x = Math.round(px - W * 0.025); x <= px + W * 0.025; x++) b.set(x, y, metal[x < px ? 1 : 2]);
    // Wood grain running the length of the table, two seams between its boards.
    const gs = seedOf(rng), grain = (u, v) => { const n = noise2(u, v, gs); return n > 0.66 ? 3 : n < 0.32 ? 1 : 2; };
    for (let y = ty; y < H; y++) {
        const z = B / (y - vy);
        for (let x = 0; x < W; x++) {
            const X = (x - vx) * z;
            if (z >= zt && Math.abs(X) <= Xt) {
                const onBook = Math.abs(X - bookAt.X - bookAt.w / 2) < bookAt.w / 2 && Math.abs(z - bookAt.z) < bookAt.d / 2;
                b.set(x, y, onBook ? book[Math.abs(z - bookAt.z) > bookAt.d / 2 - 0.012 ? 1 : 3] : table[z > 0.985 ? 1 : Math.abs(X) > Xt - 2 * z ? 3 : Math.abs(Math.abs(X) - Xt / 3) < 0.7 * z ? 0 : grain(X * 0.15, z * 5)]);
            } else if (z < zt) {
                // The front edge, seen face on below the top.
                const ye = vy + B / zt;
                if (y >= ye && y < ye + edge / zt && Math.abs(x - vx) <= Xt / zt) b.set(x, y, table[y < ye + 1 ? 3 : y > ye + edge / zt - 2 ? 0 : grain(x * 0.04, y * 0.5) === 3 ? 2 : 1]);
            }
        }
    }
    // The cup stands on the table, sized by how near it is.
    const [cx, cy] = proj(cupAt.X, B, cupAt.z), mh = Math.max(4, Math.round(U * 0.045 / cupAt.z)), mr = mh * 0.4;
    for (let j = 0; j < mh; j++) for (let k = -mr; k <= mr; k++) items.set(cx + k, cy - 1 - j, cup[j === mh - 1 ? 3 : k < -mr * 0.3 ? 1 : 2]);
    for (let j = 1; j < mh - 1; j++) items.set(cx + Math.round(mr) + 1, cy - 1 - j, cup[1]);
    const mx = cx, steamY = cy - mh;
    // Seat backs either side of the bay: slabs from the wall toward us, their tops dropping
    // away as they near, patterned moquette with a headrest cloth along the top.
    const moq = shades(pick(rng, ['#3a2a5a', 1], ['#7a2a2a', 1], ['#2a4a5a', 1]), 0.6), dots = shades(pick(rng, ['#d8a040', 1], ['#40a0c0', 1], ['#c04080', 1]), 0.6), cloth = shades('#e8e4dc', 0.6);
    const Xs = W * 0.33, A = B * 0.25, th = W * 0.035, cloth0 = B * 0.14;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = Math.abs(x - vx);
        // The inner face, at |X| = Xs.
        const z = Xs / dx;
        if (z <= 1) {
            const Y = (y - vy) * z;
            if (Y >= A) {
                const u = Y - A;
                const v = u < cloth0 ? cloth[u < 2 * z ? 3 : z > 0.97 ? 1 : 2]
                    : (Math.floor(Xs / z / 7) + Math.floor(u / 7)) % 2 === 0 && Math.floor(Xs / z / 3.5) % 2 === 0 && Math.floor(u / 3.5) % 2 === 0 ? dots[2] : moq[z > 0.97 ? 0 : (Math.floor(u / 7) % 2 ? 2 : 3)];
                items.set(x, y, v);
                continue;
            }
        }
        // The top of the back, seen from above.
        if (y > vy) {
            const zt2 = A / (y - vy), X = dx * zt2;
            if (zt2 <= 1 && X >= Xs && X <= Xs + th) items.set(x, y, cloth[X > Xs + th - 1.5 * zt2 ? 1 : 3]);
        }
    }
    // The luggage rack: two rails across the top.
    for (const ry of [Math.round(wy0 * 0.35), Math.round(wy0 * 0.6)]) for (let x = 0; x < W; x++) b.set(x, ry, metal[ry < wy0 * 0.5 ? 3 : 2]);
    for (let x = Math.round(W * 0.05); x < W; x += Math.round(W * 0.2)) for (let y = 0; y < wy0 * 0.6; y++) b.set(x, y, metal[1]);
    sc.addStatic(b);
    sc.addStatic(items);
    // Steam from the cup; raindrops on the glass, swept back as the train runs.
    const steam = sc.slot({ k: 'room', c: [200, 200, 205], lamp: [230, 226, 220], v: 0.4 }), drop = sc.slot({ k: 'mat', c: hex('#c8d8e8'), d: 0 }), trail = sc.slot({ k: 'mat', c: hex('#8aa0b8'), d: 0 });
    const drops = Array.from({ length: 90 }, () => ({ x: rng.range(wx0, wx1), y: rng.range(wy0, wy1), v: rng.range(0.6, 1.4), ph: rng() * 10 }));
    sc.addFn((f, t) => {
        const put = putter(f, W, H);
        for (let i = 0; i < 6; i++) {
            const age = (t * 0.3 + i / 6) % 1;
            if (bayer(i, Math.floor(t * 4)) < 1 - age) put(mx + Math.sin(age * 6 + i) * 1.5, steamY - 2 - age * mh * 2.5, steam);
        }
        const wx = sc.wx, wet = k => k === 'rain' || k === 'storm';
        const rain = wx ? (wet(wx.cur) ? (wx.prev ? wx.p : 1) : 0) + (wx.prev && wet(wx.prev) ? 1 - wx.p : 0) : 0;
        if (rain <= 0) return;
        const sp = speed(t), ww = wx1 - wx0, wh = wy1 - wy0;
        for (let i = 0, n = Math.floor(drops.length * rain); i < n; i++) {
            const d = drops[i], run = (t * d.v + d.ph);
            const x = wx0 + ((((d.x - wx0) - run * sp * 40) % ww) + ww) % ww, y = wy0 + (((d.y - wy0) + run * (2 + (1 - sp) * 4)) % wh);
            if (!inWin(x, y) || Math.abs(y - ventY) < ft) continue;
            put(x, y, drop);
            for (let j = 1; j < 4; j++) put(x + j * sp * 2, y - j * (1 - sp * 0.7), trail);
        }
    });
}

export const VISTAS = { garden, street, train };
export const VISTA_HOURS = { garden: 16, street: 22, train: 15 };
