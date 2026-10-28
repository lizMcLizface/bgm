// A floating island: a lens of rock and meadow hanging over a sea of cloud, a stream that
// runs across its top and spills off the edge as a waterfall into the clouds far below, smaller
// islets drifting in the haze, and a little magic (glowing crystals, rising motes, an old arch).
import { Buf } from './scene.js';
import { hex } from './lighting.js';
import { bayer, clamp, fbm1, fbm2, hash, lerp, noise1, noise2, smoothstep } from './noise.js';
import { blobTree, celestial, conifer, cumulus, seedOf, sky } from './shapes.js';
import { P, FLOWERS, leafVariant, pick, weather } from './biomes.js';

const Q = {
    // warm sandstone for the island's body, so it reads against the cool sky
    isle: ['#4a3a3e', '#62504c', '#9c8470', '#c4aa8e'],
    arch: ['#6a6270', '#807888', '#b4aab8', '#d8d0dc'],
    vine: ['#16341f', '#1f4a28', '#2f6a35', '#4a8c42'],
    crystal: { blue: '#7fd8ff', violet: '#c6a0ff', rose: '#ffa8d8' },
};

const putter = (f, W, H) => (x, y, v) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H) f[y * W + x] = v;
};

function seasonGroups(sc) {
    sc.groups.set(P.hill, 'grass');
    sc.groups.set(P.grass, 'grass');
    sc.groups.set(P.trunk, 'bark');
}

// The silhouette of one floating island: `top` is the far edge of its meadow against the sky, `front`
// the near lip where the rock begins (the two are `dd` apart at the middle, so the top is seen at a slant),
// and `bottom` a rough underside tapering to a few stalactites. A lens, thick in the middle.
function silhouette(cx, w, ty, rise, depth, s, rng, dd = 0) {
    const half = w / 2, spikes = Array.from({ length: rng.int(2, 4) }, () => ({ u: rng.range(-0.5, 0.5), len: rng.range(0.1, 0.28), wid: rng.range(0.04, 0.09) }));
    const u = x => (x - cx) / half;
    const hump = x => {
        const q = u(x);
        return rise * (1 - q * q) ** 0.8 + (fbm1(x * 0.05, s, 2) - 0.5) * rise * 0.5 * (1 - Math.abs(q)) - Math.abs(q) ** 7 * 3;
    };
    const roundness = x => Math.sqrt(Math.max(0, 1 - u(x) ** 2));
    const top = x => ty - hump(x) - dd * roundness(x);
    const front = x => ty - hump(x) * 0.55 + dd * roundness(x);
    const bottom = x => {
        const q = u(x), a = Math.abs(q);
        let y = front(x) + 2 + depth * (1 - a ** 2.1) ** 0.8 * (0.62 + 0.7 * fbm1(x * 0.04, s + 9, 3)) * (1 - a * 0.25);
        for (const k of spikes) y += depth * k.len * Math.max(0, 1 - Math.abs(q - k.u) / k.wid) * (1 - a);
        return y;
    };
    return { top, front, bottom, hump, x0: Math.floor(cx - half), x1: Math.ceil(cx + half) };
}

// A small, hazy islet far off.
function islet(b, cx, ty, w, depth, RR, GR, s, rng) {
    const sil = silhouette(cx, w, ty, w * 0.1, depth, s, rng);
    for (let x = sil.x0; x <= sil.x1; x++) {
        const t = Math.round(sil.top(x)), bt = Math.floor(sil.bottom(x)), u = (x - cx) / (w / 2);
        for (let y = t; y <= bt; y++) {
            if (y < t + 2) b.set(x, y, GR.face(u < 0 ? -1 : 1, y === t ? 1 : 0));
            else b.set(x, y, RR.face(u < 0 ? -1 : 1, noise2(x * 0.3, y * 0.4, s) > 0.62 ? 1 : 0));
        }
    }
    return sil;
}

function skyIsle(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.72, 0.8));
    seasonGroups(sc);
    sc.bias = rng.range(-0.3, 0.3);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['clear', 2], ['sparse', 2], ['scattered', 1.2], ['dense', 0.3], ['rain', 0.2]], 0.35);
    const s = seedOf(rng);

    // Distant islets, small and washed out by the air between.
    const farRock = sc.ramp(Q.isle, 0.5), farGrass = sc.ramp(P.hill, 0.5), far = new Buf(W, H);
    for (let i = rng.int(3, 6); i > 0; i--) {
        const w = rng.range(14, 44), cx = rng.range(-w * 0.2, W + w * 0.2), ty = hz - U * rng.range(0.16, 0.6);
        const sil = islet(far, cx, ty, w, w * rng.range(0.35, 0.7), farRock, farGrass, s + i, rng);
        // some carry a hair-thin fall of their own, dissolving before it reaches the cloud
        if (rng.chance(0.4)) {
            const fx = Math.round(cx + rng.range(-0.25, 0.25) * w), fy = Math.floor(sil.bottom(fx)) - 2, len = Math.min(hz - fy, U * rng.range(0.12, 0.25));
            for (let y = fy; y < fy + len; y++) if (bayer(fx, y) < 1 - (y - fy) / len) far.set(fx, y, farGrass.flat(3));
        }
    }
    sc.addStatic(far, { sky: true });

    // The sea of cloud: a billowing top edge, lit on top and shadowed below.
    const seaTone = [0, 0.15, 0.3].map(d => [0, 1, 2, 3].map(v => sc.slot({ k: 'cloud', v: v / 3, d })));
    const sea = new Buf(W, H);
    for (let x = 0; x < W; x++) {
        const edge = hz + (fbm1(x * 0.035, s + 3, 3) - 0.5) * 7 + Math.sin(x * 0.11 + s) * 1.2;
        for (let y = Math.max(0, Math.ceil(edge)); y < H; y++) {
            const p = (y - hz) / (H - hz), z = Math.log(1 + (y - hz) * 0.12) * 5;
            const n = fbm2(x * 0.02 / (0.5 + p), z, s + 5, 3), d = p < 0.12 ? 2 : p < 0.35 ? 1 : 0;
            const crest = y - edge < 2 ? 1 : 0;
            sea.set(x, y, seaTone[d][clamp(Math.floor(n * 3.6 + 0.4 + crest * 0.8 - p * 0.7), 0, 3)]);
        }
    }
    sc.addStatic(sea, { sky: true });
    cumulus(sc, rng, { n: rng.int(5, 9), y0: hz - 3, y1: hz + 14, w0: 50, w1: 120, d: 0.2, speed: 0.5, tall: [0.1, 0.2] });

    // ---- the great island, seen from a little above so its meadow shows
    const w = W * rng.range(0.4, 0.5), cx = W * rng.range(0.4, 0.62), ty = hz - U * rng.range(0.38, 0.44), rise = U * rng.range(0.03, 0.06), dd = U * rng.range(0.07, 0.1), depth = U * rng.range(0.28, 0.36);
    const sil = silhouette(cx, w, ty, rise, depth, s + 40, rng, dd), half = w / 2;
    const body = new Buf(W, H), R = sc.ramp(Q.isle, 0.04), Gr = sc.ramp(P.hill, 0.03), Gb = sc.ramp(P.grass, 0.03), Gd = sc.ramp(P.grass, 0.18);
    // a point on the meadow: x across, v from 0 (far edge) to 1 (near lip)
    const spot = (x, v) => sil.top(x) + (sil.front(x) - sil.top(x)) * v;
    for (let x = sil.x0; x <= sil.x1; x++) {
        const t = Math.ceil(sil.top(x)), f = Math.floor(sil.front(x)), bt = Math.floor(sil.bottom(x)), u = (x - cx) / half, side = Math.round(clamp(u * 1.5, -1, 1) * 2) / 2;
        // the meadow: broad patches of light and shade, lifted toward the far edge, with a bright rim there
        for (let y = t; y <= f; y++) {
            const v = (y - sil.top(x)) / Math.max(1, sil.front(x) - sil.top(x)), n = fbm2(x * 0.06, y * 0.16, s + 21, 3), slope = sil.hump(x + 2) - sil.hump(x - 2);
            if (y < t + 1) body.set(x, y, Gb.flat(3));
            else if (v > 0.9) body.set(x, y, Gr.face(side, 0));
            else body.set(x, y, (n + (1 - v) * 0.25 > 0.62 ? Gb : Gr).face(Math.round(clamp(slope * 0.6, -1, 1) * 2) / 2, n > 0.5 ? 1 : 0));
        }
        // grass overhanging the lip, ragged
        const lip = 2 + Math.round(noise1(x * 0.3, s + 11) * 3);
        for (let y = f + 1; y < f + 1 + lip; y++) body.set(x, y, Gd.face(side, y === f + 1 ? 1 : 0));
        // layered stone below: strata catch the light, cracks fall in shadow
        for (let y = f + 1 + lip; y <= bt; y++) {
            const strata = noise2(x * 0.05, y * 0.45, s + 3) > 0.64, crack = noise2(x * 0.35, y * 0.06, s + 5) > 0.74;
            body.set(x, y, R.face(crack ? -side : side, strata && !crack ? 1 : y > bt - 3 || crack ? 0 : (noise2(x * 0.2, y * 0.2, s) > 0.55 ? 1 : 0)));
        }
    }
    // roots and vines hanging from the underside
    const Vn = sc.ramp(Q.vine, 0.08);
    for (let i = Math.round(w / 6); i > 0; i--) {
        const x = Math.round(rng.range(sil.x0 + 4, sil.x1 - 4)), y0 = Math.floor(sil.bottom(x)) - 3, len = rng.range(4, 18) * (1 - Math.abs((x - cx) / half) * 0.6);
        for (let j = 0; j < len; j++) if (hash(x, j, s) < 0.9) body.set(x + Math.round(Math.sin(j * 0.5 + x) * 0.8), y0 + j, Vn.flat(j < 2 ? 2 : j > len - 3 ? 3 : 1));
    }
    sc.addStatic(body);

    // ---- on the meadow: a pond, a stream to the lip, shadows, then trees, an arch and crystals by depth
    const side = rng.chance(0.5) ? -1 : 1, lipX = Math.round(cx + side * w * rng.range(0.34, 0.4)), lipY = Math.round(sil.front(lipX)) + 1, fw = Math.max(2, Math.round(U * 0.022));
    const pondX = cx - side * w * rng.range(0.0, 0.12), pondRx = w * rng.range(0.09, 0.13), pondV = rng.range(0.4, 0.6), pondY = spot(pondX, pondV), pondRy = Math.max(2.5, (sil.front(pondX) - sil.top(pondX)) * 0.22);
    const pw = new Buf(W, H), Wt = sc.ramp(P.lake, 0.02);
    for (let y = Math.floor(pondY - pondRy - 2); y <= pondY + pondRy + 2; y++) for (let x = Math.floor(pondX - pondRx - 2); x <= pondX + pondRx + 2; x++) {
        const d = Math.hypot((x - pondX) / pondRx, (y - pondY) / pondRy);
        if (d <= 1.12 && d > 1) pw.set(x, y, Gd.flat(1));
        else if (d <= 1) pw.set(x, y, d > 0.82 ? Wt.flat(1) : y < pondY - pondRy * 0.35 ? Wt.flat(3) : Wt.flat(2));
    }
    // the stream: shallow water from the pond's edge across the meadow, then down over the lip
    const sx0 = pondX + side * pondRx * 0.85, steps = Math.max(1, Math.abs(lipX - sx0));
    for (let i = 0; i <= steps; i++) {
        const x = Math.round(lerp(sx0, lipX, i / steps)), vv = lerp(pondV, 0.9, smoothstep(0.35, 1, i / steps)), y = Math.round(spot(x, vv) + Math.sin(i * 0.3 + s) * 0.8);
        pw.set(x, y, Wt.flat(i % 5 < 2 ? 3 : 2)); pw.set(x, y + 1, Wt.flat(1));
    }
    sc.addStatic(pw);

    // everything standing on the meadow, drawn far to near
    const tb = new Buf(W, H, { sway: true }), sh = new Buf(W, H), T = sc.ramp(P.trunk, 0.04), ob = new Buf(W, H);
    const blossom = rng.chance(0.3), variant = blossom ? 3 : leafVariant(rng), A = sc.ramp(Q.arch, 0.05), lights = [];
    const stand = [];
    const clear = (x, v) => Math.abs(x - lipX) > fw * 3 && Math.hypot((x - pondX) / (pondRx * 1.25), (spot(x, v) - pondY) / (pondRy * 2.2)) > 1 && !stand.some(o => Math.abs(o.x - x) < o.r && Math.abs(o.v - v) < 0.3);
    const place = (kind, r, tries = 12) => {
        for (let k = 0; k < tries; k++) {
            const x = Math.round(cx + rng.range(-0.72, 0.72) * half), v = rng.range(0.12, 0.8);
            if (clear(x, v)) { stand.push({ kind, x, v, r }); return; }
        }
    };
    for (let i = rng.int(5, 9); i > 0; i--) place(rng.chance(0.3) ? 'conifer' : 'tree', 7);
    place('bigtree', 11, 30);
    if (rng.chance(0.75)) place('arch', 11, 30);
    for (let i = rng.int(2, 4); i > 0; i--) place('crystals', 5);
    for (let i = rng.int(4, 8); i > 0; i--) place('bush', 4);
    for (let i = rng.int(2, 5); i > 0; i--) place('rock', 3);
    const cr = pick(rng, [Q.crystal.blue, 1], [Q.crystal.violet, 1], [Q.crystal.rose, 0.6]);
    const shard = sc.slot({ k: 'emit', c: hex(cr), base: A.c[3], d: 0.04, v: 1 }), shardDark = sc.slot({ k: 'emit', c: hex(cr), base: A.c[1], d: 0.04, v: 0.7 });
    for (const o of stand.sort((p, q) => spot(p.x, p.v) - spot(q.x, q.v))) {
        const by = Math.round(spot(o.x, o.v)), near = 0.8 + o.v * 0.5, ho = 1 - Math.abs((o.x - cx) / half) * 0.35;
        const shade = rx => { for (let dx = -rx; dx <= rx; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx / rx) ** 2 + dy * dy <= 1.1) sh.set(o.x + dx + 2, by + dy, Gd.flat(0)); };
        if (o.kind === 'tree' || o.kind === 'conifer' || o.kind === 'bigtree') {
            const h = (o.kind === 'bigtree' ? U * rng.range(0.16, 0.21) : U * rng.range(0.09, 0.14)) * near * ho;
            shade(Math.max(2, Math.round(h * 0.28)));
            if (o.kind === 'conifer') conifer(tb, o.x, by + 1, h * 1.25, sc.ramp(P.forest, 0.04), rng, { sway: 0.5, trunk: T });
            else blobTree(tb, o.x, by + 1, h, sc.leaves(P.leaf, 0.04, variant), T, rng, { sway: o.kind === 'bigtree' ? 0.4 : 0.5 });
        } else if (o.kind === 'bush') {
            const r = rng.range(2.5, 4.5) * near, Lf = sc.leaves(P.leaf, 0.06, variant);
            shade(Math.round(r));
            for (let dy = -r; dy <= 0.6; dy++) for (let dx = -r * 1.3; dx <= r * 1.3; dx++) if ((dx / 1.3) ** 2 + dy * dy <= r * r) ob.set(o.x + dx, by + dy, Lf.at(dx / (r * 2), dy / r - 0.2, 0.8, dy < -r * 0.4 ? 3 : 2));
        } else if (o.kind === 'rock') {
            const r = rng.range(1.5, 3) * near;
            for (let dy = -r; dy <= 0.5; dy++) for (let dx = -r * 1.2; dx <= r * 1.2; dx++) if ((dx / 1.2) ** 2 + dy * dy <= r * r) ob.set(o.x + dx, by + dy, R.face(dx < 0 ? -1 : 1, dy < -r * 0.4 ? 1 : 0));
        } else if (o.kind === 'crystals') {
            for (let k = rng.int(2, 4); k > 0; k--) {
                const sx = o.x + rng.int(-3, 3), h = Math.round(rng.int(3, 8) * near);
                for (let j = 0; j < h; j++) {
                    const hw = Math.max(0, Math.round((1 - j / h) * 1.2));
                    for (let dx = -hw; dx <= hw; dx++) ob.set(sx + dx, by - j, dx > 0 || j > h * 0.6 ? shardDark : shard);
                }
                lights.push({ x: sx, y: by - h - 2 });
            }
        } else if (o.kind === 'arch') {
            const gap = Math.round(rng.int(7, 10) * near), ph = Math.round(rng.int(14, 19) * near), topY = by - ph;
            for (const k of [-1, 1]) {
                const px = o.x + k * (gap >> 1);
                for (let y = topY; y <= by; y++) for (let dx = -1; dx <= 1; dx++) ob.set(px + dx, y, A.face(dx < 0 ? -1 : dx > 0 ? 1 : k, y < topY + 2 ? 1 : 0));
            }
            for (let x = o.x - (gap >> 1) - 2; x <= o.x + (gap >> 1) + 2; x++) for (let y = topY - 2; y <= topY; y++) ob.set(x, y, A.face(x < o.x ? -1 : 1, y === topY - 2 ? 1 : 0));
            // a bright portal hanging in the arch, pale by day and glowing at night
            const glow = sc.slot({ k: 'emit', c: hex(pick(rng, [Q.crystal.blue, 1], [Q.crystal.violet, 1])), base: A.c[2], d: 0.05, v: 1 });
            for (let y = topY + 1; y < by; y++) for (let x = o.x - (gap >> 1) + 2; x <= o.x + (gap >> 1) - 2; x++) if (bayer(x, y) < 0.55) ob.set(x, y, glow);
        }
    }
    // flowers scattered on the grass
    for (let i = rng.int(20, 50); i > 0; i--) {
        const x = Math.round(cx + rng.range(-0.8, 0.8) * half), v = rng.range(0.1, 0.9);
        if (clear(x, v)) ob.set(x, spot(x, v), sc.slot({ k: 'mat', c: hex(FLOWERS[rng.int(0, 3)]), d: 0.04 }));
    }
    sc.addStatic(sh);
    sc.addStatic(ob);
    sc.addSway(tb, 1.1);

    // ---- the fall: water over the lip, down the island's flank and out into open air, into the cloud
    const foam = ['#ffffff', '#e0f2f8', '#a8d4e2', '#6aa6bc'].map(c => sc.slot({ k: 'mat', c: hex(c), d: 0.1 }));
    const endY = Math.round(hz + (H - hz) * 0.42);
    sc.addFn((f, t) => {
        const put = putter(f, W, H);
        for (let y = lipY; y < endY; y++) {
            const u = (y - lipY) / (endY - lipY), wd = fw * (1 + u * 0.7) + 0.5, fade = 1 - smoothstep(0.7, 1, u);
            for (let x = Math.floor(lipX - wd); x <= lipX + wd; x++) {
                const n = noise2(x * 0.55, y * 0.09 - t * 4.2, s + 2), edge = Math.abs(x - lipX) > wd - 1;
                if (bayer(x, y) > fade + 0.15) continue;
                put(x, y, foam[edge ? (n > 0.5 ? 2 : 3) : n > 0.6 ? 0 : n > 0.38 ? 1 : 2]);
            }
        }
        // spray where the water meets the cloud, rolling outward and up
        for (let i = 0; i < 90; i++) {
            const a = hash(i, 1, s) * Math.PI, age = (t * 0.45 + hash(i, 2, s)) % 1, r = fw * (1.5 + age * 6);
            const x = lipX + Math.cos(a) * r * (hash(i, 3, s) < 0.5 ? -1 : 1) * 1.3, y = endY - Math.sin(a) * r * 0.55 - age * 5;
            if (bayer(Math.round(x), Math.round(y)) < 1 - age) { put(x, y, foam[age < 0.4 ? 0 : 1]); if (age < 0.5) put(x + 1, y, foam[1]); }
        }
        // spill and drips leaving the lip
        for (let i = 0; i < 14; i++) {
            const age = (t * 0.8 + hash(i, 4, s)) % 1, x = lipX + (hash(i, 5, s) - 0.5) * fw * 2 + side * age * 3, y = lipY + age * (endY - lipY) * 0.55;
            if (hash(i, 6, s) < 0.7) put(x, y, foam[age < 0.5 ? 1 : 2]);
        }
    });

    // near clouds drifting across the bottom of the picture, in front of the fall
    cumulus(sc, rng, { n: rng.int(2, 4), y0: H - U * 0.12, y1: H - 2, w0: 90, w1: 190, d: 0, speed: 1.4, tall: [0.14, 0.26] });

    // motes of light rising off the island, and the crystals' shimmer
    const mote = [sc.slot({ k: 'flame', c: hex('#dff6ff') }), sc.slot({ k: 'flame', c: hex(cr) })];
    const motes = Array.from({ length: 46 }, (_, i) => ({ x: cx + (hash(i, 7, s) - 0.5) * w * 1.1, y: ty + (hash(i, 8, s) - 0.2) * depth, sp: 1.5 + hash(i, 9, s) * 3.5, ph: hash(i, 10, s) * 6.28, k: hash(i, 11, s) < 0.4 ? 1 : 0 }));
    sc.addFn((f, t) => {
        const put = putter(f, W, H);
        for (const m of motes) {
            const age = (t * m.sp * 0.1 + m.ph) % 1, y = m.y - age * U * 0.28, x = m.x + Math.sin(t * 0.7 + m.ph * 3) * 3 + age * 4;
            const tw = Math.sin(t * 3 + m.ph * 7);
            if (tw > -0.2 && age < 0.92) put(x, y, mote[m.k]);
        }
        for (const l of lights) if (Math.sin(t * 2.2 + l.x) > 0.7) { put(l.x, l.y, mote[0]); put(l.x, l.y - 1, mote[1]); put(l.x - 1, l.y, mote[1]); put(l.x + 1, l.y, mote[1]); }
    });
}

export const SKYISLES = { floating: skyIsle };
export const SKYISLE_HOURS = { floating: 10 };
