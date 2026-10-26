// Draft scene templates, in review in tools/scenery.html: alpine peaks, tundra, swamp,
// volcano, a synthwave horizon, an alien planet and a campfire clearing. They share helpers and
// palettes with biomes.js and landscapes.js.
import { Buf } from './scene.js';
import { hex, mix } from './lighting.js';
import { bayer, clamp, fbm1, fbm2, hash, lerp, noise1, noise2, smoothstep } from './noise.js';
import { blades, blobTree, canopyRidge, celestial, conifer, cumulus, mountains, seedOf, sky, water } from './shapes.js';
import { P, LIGHTS, coniferRidge, envelope, ground, house, leafFall, leafVariant, meadow, pick, reeds, rock, weather } from './biomes.js';
import { embers, skyEffects } from './effects.js';

const Q = {
    tundra: ['#4e5a3c', '#5e6c46', '#7c8a58', '#9ca870'],
    tundraHi: ['#8a8452', '#a29a5e', '#c4b878', '#dcd296'],
    chalet: ['#4a2e1e', '#5e3a24', '#8a5a36', '#a8744a'],
    mud: ['#2a2c1c', '#383a24', '#525632', '#6c7040'],
    bog: ['#1a2a22', '#22382c', '#36543c', '#6e8e62'],
    cypress: ['#0e1e14', '#16301c', '#1f4224', '#2c5a2c', '#447432', '#68903e', '#94b058'],
    mossHang: ['#5a6a4e', '#6e7e5e', '#8a9a74', '#a8b48c'],
    basalt: ['#1c191c', '#282327', '#443b3c', '#5e5254'],
    ash: ['#262222', '#332d2c', '#4a4240', '#625855'],
    tent: ['#5a3a1e', '#7a4e26', '#b07a3a', '#d09a52'],
    tentGreen: ['#26381e', '#324a26', '#4e6e36', '#6a8c48'],
    alien: {
        rust: ['#3e1a16', '#58241c', '#86402e', '#b0603c'],
        grey: ['#2e2e36', '#42424a', '#66666e', '#8c8c94'],
        violet: ['#281f38', '#382c4e', '#584876', '#7a689c'],
    },
    dome: ['#4a5260', '#5e6878', '#9aa6b8', '#c8d2e0'],
};

function groups(sc) {
    sc.groups.set(Q.tundra, 'grass');
    sc.groups.set(Q.tundraHi, 'grass');
    sc.groups.set(Q.chalet, 'bark');
    sc.groups.set(Q.mud, 'moss');
    sc.groups.set(Q.bog, 'water');
    sc.groups.set(Q.basalt, 'rock');
    sc.groups.set(Q.ash, 'ground');
}

const putter = (f, W, H) => (x, y, v) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H) f[y * W + x] = v;
};

// A dead tree: a trunk forking into bare, crooked limbs.
function snag(b, x, by, h, T, rng) {
    const limb = (x0, y0, a, len, w, depth) => {
        const n = Math.ceil(len);
        for (let k = 0; k <= n; k++) {
            const px = x0 + Math.cos(a) * k, py = y0 + Math.sin(a) * k;
            for (let i = 0; i < w; i++) b.set(px + i - (w >> 1), py, T.face(i < w / 2 ? -1 : 1, 0));
        }
        if (depth <= 0 || len < 3) return;
        const ex = x0 + Math.cos(a) * len, ey = y0 + Math.sin(a) * len;
        for (let i = rng.int(1, 3); i > 0; i--) limb(ex, ey, a + rng.range(-0.9, 0.9), len * rng.range(0.4, 0.7), Math.max(1, w - 1), depth - 1);
    };
    limb(x, by, -Math.PI / 2 + rng.range(-0.15, 0.15), h * 0.55, Math.max(1, Math.round(h / 14)), h < 25 ? 2 : 3);
}

// ---------------------------------------------------------------- alpine peaks

function alpine(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.56, 0.68));
    groups(sc);
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['fog', 0.9], ['towering', 1.6], ['snow', 1]]);
    // A great snowy massif, then a nearer, rockier range under it.
    const mc = rng.range(0.2, 0.8), mw = rng.range(0.25, 0.5);
    mountains(sc, rng, { d: 0.42, base: hz, top: Math.max(H * 0.03, hz - U * rng.range(0.56, 0.72)), ramp: P.rock, snow: P.snow, snowAt: rng.range(0.45, 0.6), sharp: 1.35, freq: rng.range(0.006, 0.01), mist: 18, env: u => 0.3 + 0.7 * (1 - smoothstep(0, mw, Math.abs(u - mc))) });
    if (rng.chance(0.5)) cumulus(sc, rng, { n: rng.int(2, 5), y0: hz - U * 0.2, y1: hz - U * 0.08, w0: 30, w1: 70, d: 0.4, speed: 0.6, tall: [0.12, 0.2] });
    mountains(sc, rng, { d: 0.24, base: hz + 2, top: hz - U * rng.range(0.2, 0.34), ramp: rng.chance(0.6) ? P.rock : P.mossRock, snow: P.snow, snowAt: rng.range(0.15, 0.3), sharp: 1.3, freq: rng.range(0.01, 0.018), mist: 12, env: envelope(rng) });
    coniferRidge(sc, rng, { d: 0.15, base: hz + 3, top: hz - rng.range(2, 8), ramp: P.forest, tmin: 4, tmax: rng.range(8, 14), density: rng.range(0.4, 1) });
    ground(sc, hz + 3, P.hill, 0.2);
    const ty = meadow(sc, rng, { top: hz + 4, amp: 5, flowers: rng.range(0.08, 0.2), blades: rng.range(0.15, 0.3) });
    // A green shoulder of the mountain rising out of the meadow at one side.
    if (rng.chance(0.6)) {
        const left = rng.chance(0.5), reach = rng.range(0.25, 0.45);
        mountains(sc, rng, { d: 0.08, base: hz + rng.range(10, 22), top: hz - U * rng.range(0.1, 0.2), ramp: P.mossRock, sharp: 1, talus: 0.8, freq: 0.012, mist: 0, env: u => (1 - smoothstep(0, reach, left ? u : 1 - u)) ** 0.8 });
    }
    // A chalet on the meadow, and boulders the glacier left behind.
    const b = new Buf(W, H);
    if (rng.chance(0.6)) {
        const x = Math.round(W * rng.range(0.15, 0.85)), p = rng.range(0.1, 0.35), by = Math.round(ty[x] + (H - ty[x]) * p), s = 8 + p * 22;
        house(sc, b, x, by, Math.round(s * 1.3), Math.round(s * 0.55), sc.ramp(Q.chalet, 0.15 * (1 - p)), sc.ramp(P.slate, 0.15 * (1 - p)), () => rng.chance(0.7));
    }
    for (let i = rng.int(1, 6); i > 0; i--) {
        const x = rng.range(0, W), p = rng.range(0.2, 1), by = ty[clamp(Math.round(x), 0, W - 1)] + (H - hz) * p;
        rock(b, x, by, 2 + p * 10, sc.ramp(P.rock, 0.1 * (1 - p)), rng);
    }
    sc.addStatic(b);
    const sb = new Buf(W, H, { sway: true }), D = sc.ramp(P.forest, 0), T = sc.ramp(P.trunk, 0);
    for (let i = pick(rng, [0, 1], [1, 1.5], [2, 1], [3, 0.6]); i > 0; i--) {
        const x = rng.chance(0.5) ? rng.range(-W * 0.04, W * 0.22) : rng.range(W * 0.78, W * 1.04), p = rng.range(0.5, 1);
        conifer(sb, x, ty[clamp(Math.round(x), 0, W - 1)] + (H - hz) * p + 6, U * p * rng.range(0.5, 0.85), D, rng, { sway: 0.5, trunk: T });
    }
    sc.addSway(sb, 0.6);
}

// ---------------------------------------------------------------- tundra

function tundra(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.5, 0.62));
    groups(sc);
    sc.climate = 'cold';
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng, { count: 120 });
    weather(sc, hz, [['snow', 1.6], ['clear', 1.6], ['overcast', 1], ['fog', 0.8], ['streaks', 1.2]], 0.5);
    if (rng.chance(0.75)) mountains(sc, rng, { d: 0.5, base: hz + 2, top: hz - U * rng.range(0.06, 0.18), ramp: P.rock, snow: P.snow, snowAt: 0.85, freq: rng.range(0.008, 0.014), mist: 8, env: envelope(rng) });
    coniferRidge(sc, rng, { d: 0.3, base: hz + 2, top: hz - rng.range(1, 4), ramp: P.forest, tmin: 3, tmax: rng.range(5, 9), density: rng.range(0.15, 0.5) });
    ground(sc, hz + 2, Q.tundra, 0.2);
    const ty = meadow(sc, rng, { top: hz + 3, amp: 2, flowers: 0.02, blades: rng.range(0.05, 0.14), pal: [Q.tundra, Q.tundraHi], tall: 0.6 });
    // A frozen lake in the middle distance: open water in the short summer.
    if (rng.chance(0.55)) {
        const mask = new Buf(W, H), cx = W * rng.range(0.25, 0.75), cy = hz + (H - hz) * rng.range(0.12, 0.3), rx = W * rng.range(0.2, 0.45), ry = (H - hz) * rng.range(0.05, 0.12), s = seedOf(rng);
        for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 3; y++) {
            for (let x = Math.floor(cx - rx - 8); x <= cx + rx + 8; x++) {
                const d = Math.hypot((x - cx) / rx, (y - cy) / ry) + (noise1(x * 0.05 + y, s) - 0.5) * 0.3;
                if (d < 1 && y > hz + 1) mask.set(x, y, 1);
            }
        }
        water(sc, rng, { y0: Math.ceil(cy - ry - 3), ramp: P.lake, mix: 0.35, fres: 0.4, waves: 0.03, speed: 1, mask });
    }
    // Lone stunted spruces, smaller with distance.
    const b = new Buf(W, H, { sway: true }), D = sc.ramp(P.forest, 0), T = sc.ramp(P.trunk, 0);
    const trees = [];
    for (let i = rng.int(3, 14); i > 0; i--) {
        const x = rng.range(-4, W + 4), p = rng.range(0.02, 1) ** 1.6;
        trees.push({ x, by: ty[clamp(Math.round(x), 0, W - 1)] + (H - hz) * p, h: (6 + p * U * 0.55) * rng.range(0.6, 1.2), p });
    }
    trees.sort((a, c) => a.by - c.by).forEach(t => conifer(b, t.x, t.by, t.h, t.p > 0.4 ? D : sc.ramp(P.forest, 0.25 * (1 - t.p)), rng, { sway: t.p * 0.5, trunk: T }));
    for (let i = rng.int(0, 5); i > 0; i--) {
        const x = rng.range(0, W), p = rng.range(0.1, 1);
        rock(b, x, ty[clamp(Math.round(x), 0, W - 1)] + (H - hz) * p, 2 + p * 8, sc.ramp(P.rock, 0.1 * (1 - p)), rng);
    }
    sc.addSway(b, 0.5);
}

// ---------------------------------------------------------------- swamp

function swamp(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.48, 0.6));
    groups(sc);
    sc.bias = rng.range(-0.3, 0.3);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['fog', 2.6], ['haze', 1.2], ['overcast', 1.2], ['rain', 0.8]], 0.5);
    canopyRidge(sc, rng, { d: 0.45, base: hz + 3, top: hz - rng.range(6, 14), bottom: hz + 4, ramp: P.canopy, rmin: 2, rmax: 6, rows: 2 });
    // Far trees stand before the water so the water mirrors them.
    const far = new Buf(W, H, { rank: true }), Tf = sc.ramp(P.trunk, 0.35);
    for (let i = rng.int(3, 9); i > 0; i--) {
        const x = rng.range(0, W), by = hz + rng.range(1, 4), h = rng.range(12, 26);
        if (rng.chance(0.35)) snag(far, x, by, h, Tf, rng);
        else blobTree(far, x, by, h, sc.leaves(Q.cypress, 0.35, leafVariant(rng)), Tf, rng, { shape: 'tall' });
    }
    sc.addStatic(far);
    ground(sc, hz + 2, Q.mud, 0.2);
    // Hummocks of mud and moss between the channels, in perspective.
    const land = new Buf(W, H), mask = new Buf(W, H), M = sc.ramp(Q.mud, 0.08), s = seedOf(rng), wet = rng.range(0.45, 0.62);
    for (let y = hz + 2; y < H; y++) {
        const p = (y - hz) / (H - hz), z = Math.log(1 + (y - hz) * 0.12) * 5;
        for (let x = 0; x < W; x++) {
            const n = fbm2((x - W / 2) * 0.012 / (0.15 + p) + 50, z * 0.6, s, 3);
            if (n < wet) mask.set(x, y, 1);
            else land.set(x, y, M.flat(n < wet + 0.02 ? 3 : clamp(Math.floor((fbm2(x * 0.05, z * 2, s + 1, 2) - 0.2) * 4), 0, 2)));
        }
    }
    sc.addStatic(land);
    const gb = new Buf(W, H, { sway: true }), Gb = sc.ramp(P.grass, 0, 'blade');
    for (let y = hz + 4; y < H; y += 2) {
        const p = (y - hz) / (H - hz);
        for (let x = 0; x < W; x++) if (land.get(x, y) && rng() < 0.04 + 0.16 * p) blades(gb, rng, x, y, 2 + p * 9, [Gb.flat(1), Gb.flat(3)], null);
    }
    sc.addSway(gb, 0.6);
    water(sc, rng, { y0: hz + 1, ramp: Q.bog, mix: 0.5, fres: 0.55, waves: 0.03, speed: 0.6, mask });
    // Duckweed and lily pads drift on the still water.
    const pads = new Buf(W, H), Lp = sc.ramp(P.grass, 0.05);
    for (let i = rng.int(20, 90); i > 0; i--) {
        const x = rng.range(0, W), y = rng.range(hz + 4, H), p = (y - hz) / (H - hz), r = 0.6 + p * 4;
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r * 0.35; dy <= r * 0.35; dy++) if (mask.get(x + dx, y + dy)) pads.set(x + dx, y + dy, Lp.flat(dy < 0 ? 2 : 1));
        }
    }
    sc.addStatic(pads);
    reeds(sc, rng, hz);
    // Near trees: cypresses on their roots, snags, curtains of hanging moss.
    const sb = new Buf(W, H, { sway: true, rank: true }), T = sc.ramp(P.trunk, 0), Hm = sc.ramp(Q.mossHang, 0), crowns = [];
    const near = [];
    for (let i = rng.int(3, 7); i > 0; i--) near.push({ x: rng.chance(0.7) ? (rng.chance(0.5) ? rng.range(-10, W * 0.3) : rng.range(W * 0.7, W + 10)) : rng.range(0, W), p: rng.range(0.25, 1) });
    near.sort((a, c) => a.p - c.p).forEach(t => {
        const by = hz + (H - hz) * t.p, h = U * (0.25 + t.p * 0.65) * rng.range(0.8, 1.1);
        if (rng.chance(0.2)) { snag(sb, t.x, by, h * 0.8, T, rng); return; }
        // Roots arching out of the water around the trunk's foot.
        const tw = Math.max(1, Math.round(h / 11));
        for (let r = rng.int(3, 6); r > 0; r--) {
            const dir = rng.chance(0.5) ? -1 : 1, spread = h * rng.range(0.06, 0.16), top = h * rng.range(0.08, 0.16);
            for (let k = 0; k <= 12; k++) {
                const u = k / 12, x = t.x + dir * (tw * 0.5 + spread * u), y = by - top * (1 - u) - Math.sin(u * Math.PI) * top * 0.4;
                sb.set(x, y, T.face(dir, 0));
            }
        }
        const c = blobTree(sb, t.x, by, h, sc.leaves(Q.cypress, 0, leafVariant(rng)), T, rng, { sway: 0.4, shape: rng.chance(0.5) ? 'tall' : 'dome' });
        crowns.push(c);
        // Hanging moss: ragged wisps of uneven length, in clumps.
        for (let k = Math.round(c.w * 0.5); k > 0; k--) {
            const cx0 = c.x + rng.range(-1, 1) * c.w * 0.85, y0 = c.y + c.h * rng.range(0.2, 0.7);
            for (let w = rng.int(1, 4); w > 0; w--) {
                const x = Math.round(cx0 + rng.range(-2, 2)), len = rng.range(2, 3 + c.h * 0.55) * rng() ** 0.5;
                for (let j = 0; j < len; j++) if (hash(x, j, k) < 0.9 - j / len * 0.5) sb.set(x, y0 + j, Hm.flat(j < len * 0.4 ? 2 : 1), Math.round(255 * (j + 1) / len), x, rng.int(1, 120));
            }
        }
    });
    sc.addSway(sb, 0.5);
    if (crowns.length) leafFall(sc, rng, crowns, sc.leaves(Q.cypress, 0, 1));
}

// ---------------------------------------------------------------- volcano

function volcano(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.6, 0.7));
    groups(sc);
    sc.bias = rng.range(-0.3, 0.3);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['haze', 1.6], ['overcast', 1], ['dust', 0.5], ['storm', 0.6], ['snow', 0.3]], 0.4);
    if (rng.chance(0.5)) mountains(sc, rng, { d: 0.55, base: hz + 2, top: hz - U * rng.range(0.08, 0.18), ramp: P.blueRock, freq: 0.012, mist: 10, env: envelope(rng) });
    // The cone: steep flanks under a broken crater rim, gullies running down from it.
    const cx = W * rng.range(0.3, 0.7), hw = Math.min(W * 0.55, U * rng.range(0.9, 1.3)), top = Math.max(H * 0.05, hz - U * rng.range(0.42, 0.58));
    const crater = rng.range(0.05, 0.1), s = seedOf(rng), R = sc.ramp(Q.basalt, 0.3), M = sc.ramp(Q.basalt, 0.5);
    const b = new Buf(W, H), h = new Float32Array(W);
    for (let x = 0; x < W; x++) {
        const u = Math.abs(x - cx) / hw;
        const f = u < crater ? 0.97 - (crater - u) / crater * 0.05 : Math.max(0, 1 - (u - crater) / (1 - crater)) ** 1.4;
        h[x] = hz + 2 - (hz + 2 - top) * f + (fbm1(x * 0.06, s, 3) - 0.5) * 4 * f + (fbm1(x * 0.015, s + 4, 2) - 0.5) * U * 0.1 * f;
    }
    const craterY = Math.round(h[Math.round(cx)]);
    for (let x = 0; x < W; x++) {
        for (let y = Math.max(0, Math.floor(h[x])); y <= hz + 2; y++) {
            const dy = y - craterY + 6, ang = (x - cx) / Math.max(4, dy);
            const gully = noise1(ang * 9, s + 1) + (noise2(x * 0.08, y * 0.05, s + 2) - 0.5) * 0.45 + (hash(x >> 1, y >> 1, s) - 0.5) * 0.3;
            const lv = y - h[x] < 1.2 || gully > 0.6 ? 1 : 0;
            const misty = y > hz - 10 && bayer(x, y) < (y - (hz - 10)) / 12;
            b.set(x, y, (misty ? M : R).face(x < cx ? -1 : 1, lv));
        }
    }
    sc.addStatic(b);
    // The night sky glows over the crater.
    sc.relight = (L) => {
        const g = 0.25 + 0.4 * L.lights;
        L.skyHor = mix(L.skyHor, [150, 52, 30], g * 0.5);
        L.haze = mix(L.haze, [120, 46, 32], g * 0.35);
    };
    ground(sc, hz + 2, Q.ash, 0.3);
    // A lava field: dark crust with cracks that glow at night.
    const field = new Buf(W, H), A = sc.ramp(Q.ash, 0.05), fs = seedOf(rng);
    const crack = [0.6, 1].map(v => sc.slot({ k: 'emit', c: hex('#ff6a28'), base: A.c[0], d: 0.05, v }));
    for (let y = hz + 3; y < H; y++) {
        const z = Math.log(1 + (y - hz) * 0.15) * 6;
        for (let x = 0; x < W; x++) {
            const n = fbm2(x * 0.02, z * 0.8, fs, 3), c = Math.abs(noise2(x * 0.06, z * 1.4, fs + 1) - 0.5);
            field.set(x, y, c < 0.012 && fbm2(x * 0.01, z * 0.4, fs + 2, 2) > 0.42 ? crack[c < 0.006 ? 1 : 0] : A.flat(clamp(Math.floor(n * 4.4 - 0.6), 0, 3)));
        }
    }
    sc.addStatic(field);
    // Lava flows down the flanks, the crater seethes, ash rises and drifts downwind.
    const lava = ['#fff0a0', '#ffc040', '#ff7a24', '#c83a18', '#6a1e14'].map(c => sc.slot({ k: 'flame', c: hex(c) }));
    const flows = Array.from({ length: pick(rng, [1, 1], [2, 1.2], [3, 0.6]) }, () => ({ a: rng.range(-0.55, 0.55), w: rng.range(0.8, 1.8), s: seedOf(rng), len: rng.range(0.5, 1) }));
    const ash = [0.15, 0.35, 0.55].map(v => sc.slot({ k: 'cloud', v, d: 0.05 }));
    // Low in the plume the ash is lit from below by the crater.
    const lit = [0.5, 0.85].map(v => sc.slot({ k: 'emit', c: hex('#c0502a'), base: hex('#5a5050'), d: 0.05, v }));
    const wind = rng.chance(0.5) ? 1 : -1, puffs = 26;
    embers(sc, [{ x: cx, y: craterY + 2 }, { x: cx + 2, y: craterY + 2 }]);
    sc.addFn((f, t) => {
        const put = putter(f, W, H);
        for (const fl of flows) {
            const end = craterY + (hz + 2 - craterY) * fl.len;
            for (let y = craterY; y <= end; y++) {
                const dy = y - craterY, x = cx + fl.a * dy + (fbm1(dy * 0.08, fl.s, 2) - 0.5) * dy * 0.25;
                const w = fl.w * (0.6 + dy / 30);
                for (let k = -w; k <= w; k++) {
                    const heat = clamp(1 - dy / (end - craterY + 1)) * 0.7 + 0.3 * noise2((x + k) * 0.3, y * 0.25 - t * 1.4, fl.s);
                    put(x + k, y, lava[clamp(Math.floor((1 - heat) * 4.2 + Math.abs(k) / (w + 1)), 0, 4)]);
                }
            }
        }
        // The crater's glow, flickering over the rim.
        const cw = Math.max(1.5, hw * crater * 0.5);
        for (let k = -cw; k <= cw; k++) {
            const flick = noise1(t * 4 + k * 0.6, s + 3) * (1 - Math.abs(k) / (cw + 1));
            for (let j = 0; j < flick * 4.5 - 0.8; j++) put(cx + k, craterY - j, lava[j === 0 ? 1 : flick > 0.6 ? 0 : 2]);
        }
        for (let i = 0; i < puffs; i++) {
            const age = (t * 0.035 + i / puffs) % 1, r = 1.5 + age * U * 0.09;
            const px = cx + wind * age * age * U * 0.9 + Math.sin(age * 7 + i) * 3, py = craterY - 2 - age * U * 0.5;
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                const X = Math.round(px + dx), Y = Math.round(py + dy);
                if (bayer(X, Y) >= (1 - age) * 0.9) continue;
                put(X, Y, age < 0.22 && dy > -r * 0.2 ? lit[age < 0.1 ? 1 : 0] : ash[dy < -r * 0.3 ? 2 : dy < r * 0.3 ? 1 : 0]);
            }
        }
    });
    const sb = new Buf(W, H), T = sc.ramp(P.trunk, 0);
    for (let i = rng.int(0, 4); i > 0; i--) {
        const p = rng.range(0.3, 1);
        snag(sb, rng.range(0, W), hz + (H - hz) * p, U * p * rng.range(0.25, 0.5), T, rng);
    }
    for (let i = rng.int(1, 5); i > 0; i--) {
        const p = rng.range(0.2, 1);
        rock(sb, rng.range(0, W), hz + (H - hz) * p, 2 + p * 9, sc.ramp(Q.basalt, 0.1 * (1 - p)), rng);
    }
    sc.addStatic(sb);
}

// ---------------------------------------------------------------- synthwave

// Neon sunset palettes: the sky (top, horizon), the sun from top to bottom, its halo,
// and the grid's lines.
const SYNTH = {
    sunset: { top: '#140a24', hor: '#5a1e56', dayTop: '#2a1040', dayHor: '#a0386a', sun: ['#ffe070', '#ffb444', '#ff8034', '#f04a56', '#c42a74'], halo: '#8a2a5e', grid: ['#ff4fc8', '#c23aa8', '#7a2478'] },
    magenta: { top: '#08082e', hor: '#2a1a7a', dayTop: '#1a1050', dayHor: '#5a2a9a', sun: ['#ff60ff', '#ff3cf0', '#f028dc', '#d818c8', '#b414b4'], halo: '#6a1a9a', grid: ['#c050ff', '#8a38e0', '#4a2aa8'] },
    rose: { top: '#0c0a22', hor: '#5a2e5e', dayTop: '#20143a', dayHor: '#9a4a74', sun: ['#ffe0d0', '#ffc0b0', '#ff9c98', '#f07888', '#d05878'], halo: '#8a3e66', grid: ['#ff8ab0', '#d0608e', '#7a3a66'] },
};

function synth(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.58, 0.66));
    sc.climate = 'dry';
    const pal = SYNTH[pick(rng, ['sunset', 1.2], ['magenta', 1], ['rose', 1])], C = c => hex(c);
    const neon = c => sc.slot({ k: 'flame', c: C(c) });
    // A stylised sky at every hour: dusk colours by day, deep night after dark.
    sc.relight = (L) => {
        L.skyTop = mix(C(pal.top), C(pal.dayTop), L.day * 0.8);
        L.skyHor = mix(C(pal.hor), C(pal.dayHor), L.day * 0.8);
        L.haze = L.skyHor; L.stars = 1 - L.day * 0.45; L.fog = 0; L.veil = 0;
    };
    sky(sc);
    // Thin glowing bands across the lower sky.
    const bands = new Buf(W, H), glowRow = sc.slot({ k: 'sky', v: 1.12 }), bs = seedOf(rng);
    for (let y = Math.round(hz - U * 0.55); y < hz; y++) {
        const p = 1 - (hz - y) / (U * 0.55);
        if (hash(y, 0, bs) > 0.12 + p * 0.35) continue;
        for (let x = 0; x < W; x++) if (noise1(x * 0.03, bs + y) > 0.35 - p * 0.2) bands.set(x, y, glowRow);
    }
    sc.addStatic(bands, { sky: true });

    // Stars, cyan sparkles that twinkle, sometimes a crescent moon.
    const dim = sc.slot({ k: 'star', v: 0.55 }), bright = sc.slot({ k: 'star', v: 1 }), cyan = neon('#5ff6ff');
    const stars = Array.from({ length: 150 }, () => ({ x: rng.int(0, W - 1), y: Math.floor(rng() ** 1.3 * (hz - 4)), b: rng.chance(0.2), c: rng.chance(0.07) }));
    const moon = rng.chance(0.45) && { x: W * rng.range(0.1, 0.35) * (rng.chance(0.5) ? 1 : 2.6), y: hz * rng.range(0.15, 0.35), r: rng.range(4, 7), slot: neon(pal.sun[1]) };
    sc.addFn((f, t) => {
        const put = putter(f, W, H);
        stars.forEach((s, i) => {
            if (hash(i, Math.floor(t * 1.1 + i * 0.37), bs) < 0.12) return;
            if (s.c) { put(s.x, s.y, cyan); put(s.x + 1, s.y, cyan); put(s.x, s.y + 1, cyan); put(s.x + 1, s.y + 1, cyan); }
            else put(s.x, s.y, s.b ? bright : dim);
        });
        if (moon) {
            for (let y = -moon.r; y <= moon.r; y++) for (let x = -moon.r; x <= moon.r; x++) {
                if (x * x + y * y <= moon.r * moon.r && (x - moon.r * 0.45) ** 2 + (y + moon.r * 0.25) ** 2 > (moon.r * 0.85) ** 2) put(moon.x + x, moon.y + y, moon.slot);
            }
        }
    });
    skyEffects(sc);

    // The sun: big, striped in its lower half, the stripes drifting down; a soft halo round it.
    const vx = Math.round(W / 2), r = U * rng.range(0.2, 0.26), cy = hz - r * rng.range(0.15, 0.55);
    const sunC = pal.sun.map(neon), halo = neon(pal.halo);
    sc.addFn((f, t) => {
        for (let y = Math.max(0, Math.floor(cy - r * 1.4)); y < hz; y++) {
            for (let x = Math.max(0, Math.floor(vx - r * 1.4)); x <= Math.min(W - 1, vx + r * 1.4); x++) {
                const d = Math.hypot(x - vx, y - cy) / r;
                if (d > 1) {
                    if (d < 1.4 && bayer(x, y) < (1.4 - d) / 0.4 * 0.55) f[y * W + x] = halo;
                    continue;
                }
                const v = (y - cy) / r;
                if (v > -0.35 && ((v * 8 - t * 0.12) % 1 + 1) % 1 < (v + 0.35) * 0.42) continue;
                f[y * W + x] = sunC[clamp(Math.floor((v + 1) * 2.5), 0, 4)];
            }
        }
    });

    // The middle ground: a city, wireframe pyramids and ridges, or banks of cloud.
    const mid = pick(rng, ['city', 1], ['pyramids', 1.1], ['clouds', 0.9]);
    const b = new Buf(W, H), ink = sc.slot({ k: 'mat', c: C('#0c0818'), d: 0 }), edge = neon('#4ff4ff'), ms = seedOf(rng);
    // A low jagged range all along the horizon, edged in cyan.
    if (mid !== 'city' || rng.chance(0.4)) {
        const amp = U * rng.range(0.04, 0.09);
        for (let x = 0; x < W; x++) {
            const h = hz - amp * (0.3 + 0.7 * Math.abs(fbm1(x * 0.02, ms, 2) * 2 - 1) * (0.5 + noise1(x * 0.08, ms + 1)));
            for (let y = Math.ceil(h); y <= hz; y++) b.set(x, y, y === Math.ceil(h) ? edge : ink);
        }
    }
    if (mid === 'pyramids') {
        const facesLit = ['#2a4aff', '#4a6aff', '#a040ff', '#ff40d0'].map(neon);
        const list = Array.from({ length: rng.int(2, 4) }, (_, i) => ({ x: vx + (i === 0 ? rng.range(-0.15, 0.15) : rng.range(-0.45, 0.45)) * W, h: Math.min(U, W * 0.7) * (i === 0 ? rng.range(0.24, 0.34) : rng.range(0.1, 0.22)) }));
        list.sort((a, c) => a.h - c.h);
        for (const p of list) {
            const ay = hz - p.h, slope = rng.range(0.9, 1.3);
            for (let y = Math.round(ay); y <= hz; y++) {
                const half = (y - ay) * slope;
                for (let x = Math.round(p.x - half); x <= p.x + half; x++) {
                    // The sunward face is striped with its light; edges and ridge are neon.
                    const e = Math.abs(x - p.x), u = (y - ay) / p.h;
                    let v = x > p.x && y % 3 === 0 ? facesLit[clamp(Math.floor(u * 4), 0, 3)] : ink;
                    if (e >= half - 1 || e < 0.5) v = edge;
                    b.set(x, y, v);
                }
            }
        }
    } else if (mid === 'city') {
        const win = [neon('#ff6ad0'), neon('#5ff6ff'), neon('#ffd06a')], rim = neon(pal.grid[2]);
        for (let x = -2; x < W;) {
            const w = rng.int(5, 16), centre = 1 - Math.abs(x / W * 2 - 1) * 0.6, h = Math.round(U * rng.range(0.05, 0.3) * centre);
            for (let y = hz - h; y <= hz; y++) for (let k = 0; k < w; k++) b.set(x + k, y, y === hz - h ? rim : ink);
            if (rng.chance(0.3)) for (let j = 0; j < h * 0.25; j++) b.set(x + (w >> 1), hz - h - j, ink);
            for (let y = hz - h + 3; y < hz - 2; y += 3) for (let k = 1; k < w - 1; k += 2) if (rng.chance(0.08)) b.set(x + k, y, rng.pick(win));
            x += w + (rng.chance(0.25) ? rng.int(1, 4) : 0);
        }
    } else {
        // Puffs heaped either side of the sun, their tops rimmed with its light.
        const rimC = neon(pal.halo), body = sc.slot({ k: 'mat', c: C('#1a1236'), d: 0 }), shade = sc.slot({ k: 'mat', c: C('#120c28'), d: 0 });
        const puffs = [];
        for (const side of [-1, 1]) {
            for (let i = rng.int(8, 16); i > 0; i--) {
                const u = rng.range(0.12, 1) ** 0.8, x = vx + side * (r * 0.6 + u * W * 0.55), pr = U * rng.range(0.03, 0.08) * (0.6 + u);
                puffs.push({ x, y: hz - pr * rng.range(0.1, 1.4) * (0.4 + u), r: pr });
            }
        }
        for (const p of puffs) {
            for (let y = Math.floor(p.y - p.r); y <= Math.min(hz, p.y + p.r); y++) for (let x = Math.floor(p.x - p.r); x <= p.x + p.r; x++) {
                const dx = (x - p.x) / p.r, dy = (y - p.y) / p.r, d = dx * dx + dy * dy;
                if (d > 1) continue;
                const lit = dy < -0.3 && d > 0.62 + (x - vx) * dx / W * 0.2;
                b.set(x, y, lit ? rimC : dy > 0.3 ? shade : body);
            }
        }
        for (let x = 0; x < W; x++) for (let y = hz - 2; y <= hz; y++) if (!b.get(x, y)) b.set(x, y, body);
    }
    sc.addStatic(b);

    // The grid floor scrolls toward us; near the horizon its lines crowd into a glow.
    const floor = ['#06041a', '#0e0828', '#1c0c3a', '#3a1450'].map(c => sc.slot({ k: 'mat', c: C(c), d: 0 }));
    const line = pal.grid.map(neon), hzLine = neon(pal.sun[3]);
    const road = pick(rng, ['none', 1], ['line', 0.8], ['wind', 1]);
    const roadC = ['#5ff6ff', '#3ab0ff', '#2a6aff'].map(neon), roadBed = sc.slot({ k: 'mat', c: C('#0c1438'), d: 0 }), rs = seedOf(rng), rph = rng() * 6;
    const spacing = U * rng.range(0.12, 0.2), speed = rng.range(0.6, 1.1);
    sc.addFn((f, t) => {
        const put = putter(f, W, H), cam = t * speed;
        for (let y = hz + 1; y < H; y++) {
            const p = (y - hz) / (H - hz), p1 = (y + 1 - hz) / (H - hz), o = y * W;
            // Where several lines would share a row they blur into a dithered haze instead.
            const crowded = 1 / p - 1 / p1 > 0.9;
            const row = !crowded && (Math.floor(1 / p + cam) !== Math.floor(1 / p1 + cam) || (p > 0.55 && Math.floor(1 / p + cam) !== Math.floor((H - hz) / (y + 2 - hz) + cam)));
            const lc = line[p < 0.3 ? 0 : p < 0.6 ? 1 : 2];
            for (let x = 0; x < W; x++) {
                const a = Math.floor((x - vx) / (spacing * p)), b2 = Math.floor((x + 1 - vx) / (spacing * p));
                const fx = clamp(Math.floor((1 - p) ** 3 * 4 + bayer(x, y) * 0.9 - 0.45), 0, 3);
                f[o + x] = crowded ? (bayer(x, y) < 0.35 + 0.4 * (1 - p * 8) ? line[2] : floor[3]) : row || a !== b2 ? lc : floor[fx];
            }
        }
        for (let x = 0; x < W; x++) put(x, hz + 1, hzLine);
        if (road === 'line') {
            for (let y = hz + 1; y < H; y++) {
                const p = (y - hz) / (H - hz);
                for (let k = -p * 2; k <= p * 2; k++) put(vx + k, y, Math.abs(k) < p ? roadC[0] : line[0]);
            }
            put(vx, hz, roadC[0]); put(vx, hz - 1, hzLine);
        } else if (road === 'wind') {
            // A glowing road winding over the grid, coming toward us.
            for (let y = hz + 2; y < H; y++) {
                const p = (y - hz) / (H - hz), zw = 1 / p + cam;
                const xw = Math.sin(zw * 0.35 + rph) * 1.6 + Math.sin(zw * 0.13 + rs) * 1.1;
                const x = vx + xw * p * W * 0.07, w = Math.max(0.6, p * U * 0.05);
                for (let k = -w; k <= w; k++) {
                    const a = Math.abs(k), rim = a > w - Math.max(1, w * 0.12);
                    put(x + k, y, rim ? roadC[p < 0.4 ? 0 : 1] : Math.floor(zw * 2) % 2 && a < Math.max(0.5, w * 0.06) ? roadC[0] : w < 2 ? roadC[1] : roadBed);
                }
            }
        }
    });
}

// ---------------------------------------------------------------- alien planet

function planet(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.56, 0.7));
    sc.bias = rng.range(-0.4, 0.4);
    sc.climate = 'dry';
    // No air: a black sky in daylight too, every star out, nothing to haze the distance.
    sc.relight = (L) => {
        L.skyTop = [3, 3, 10]; L.skyHor = mix([8, 8, 20], L.sun, 0.06 * L.day); L.haze = [10, 10, 22];
        L.stars = 1; L.fog = 0; L.veil = 0; L.glow = 0.3;
    };
    sky(sc);
    celestial(sc, rng, { count: 260 });
    // A ringed giant hangs over the horizon, with a small moon.
    const gb = new Buf(W, H), px = W * rng.range(0.15, 0.85), py = hz * rng.range(0.22, 0.5), pr = U * rng.range(0.1, 0.2);
    const hues = pick(rng, [['#d8b48a', '#b88a62', '#e8d2a8', '#9a6a4a'], 1], [['#8ab4d8', '#6a8ab8', '#b8d4ec', '#4a6a98'], 1], [['#c89ac8', '#9a6aa8', '#e2c4e2', '#6a4a88'], 0.8]);
    const band = hues.map(c => [0.35, 0.65, 1].map(v => sc.slot({ k: 'flame', c: mix([4, 4, 12], hex(c), v) })));
    const ringC = [0.4, 0.7].map(v => sc.slot({ k: 'flame', c: mix([4, 4, 12], hex(hues[2]), v) }));
    const tilt = rng.range(-0.35, 0.35), ps = seedOf(rng), lx = rng.chance(0.5) ? -1 : 1;
    const ring = (front) => {
        for (let a = 0; a < Math.PI * 2; a += 0.004) {
            const sa = Math.sin(a);
            if ((sa > 0) !== front) continue;
            for (let r = pr * 1.35; r < pr * 2.1; r += 0.6) {
                if (r > pr * 1.65 && r < pr * 1.72) continue;
                const ex = Math.cos(a) * r, ey = sa * r * 0.22;
                const x = px + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = py + ex * Math.sin(tilt) + ey * Math.cos(tilt);
                gb.set(x, y, ringC[r < pr * 1.65 ? 1 : 0]);
            }
        }
    };
    ring(false);
    for (let y = Math.floor(py - pr); y <= py + pr; y++) {
        for (let x = Math.floor(px - pr); x <= px + pr; x++) {
            const dx = (x - px) / pr, dy = (y - py) / pr, d = dx * dx + dy * dy;
            if (d > 1) continue;
            const lit = 0.55 + 0.6 * (lx * dx * 0.8 - dy * 0.3) + (bayer(x, y) - 0.5) * 0.3;
            const k = Math.floor(fbm1((dy * Math.cos(tilt) - dx * Math.sin(tilt)) * 5 + 10, ps, 3) * 4.2) % 4;
            if (lit < 0.05) continue;
            gb.set(x, y, band[k][lit < 0.4 ? 0 : lit < 0.8 ? 1 : 2]);
        }
    }
    ring(true);
    const mx = px + rng.range(-1, 1) * pr * 3, my = py - rng.range(0.5, 1.5) * pr, mr = rng.range(2, 5), moon = [0.4, 0.85].map(v => sc.slot({ k: 'flame', c: mix([4, 4, 12], [200, 200, 210], v) }));
    for (let y = Math.floor(my - mr); y <= my + mr; y++) for (let x = Math.floor(mx - mr); x <= mx + mr; x++) {
        const dx = x - mx, dy = y - my;
        if (dx * dx + dy * dy <= mr * mr) gb.set(x, y, moon[lx * dx > 0 ? 1 : 0]);
    }
    sc.addStatic(gb, { sky: true });

    const pal = Q.alien[pick(rng, ['rust', 1.2], ['grey', 1], ['violet', 0.8])];
    mountains(sc, rng, { d: 0.3, base: hz + 2, top: hz - U * rng.range(0.06, 0.2), ramp: pal, sharp: 1.6, freq: rng.range(0.01, 0.02), mist: 0, env: envelope(rng) });
    ground(sc, hz + 2, pal, 0.1);
    // Dust plains pocked with craters.
    const g = new Buf(W, H), G = sc.ramp(pal, 0), s = seedOf(rng);
    for (let y = hz + 2; y < H; y++) {
        const z = Math.log(1 + (y - hz) * 0.12) * 6;
        for (let x = 0; x < W; x++) g.set(x, y, G.flat(clamp(Math.floor(fbm2(x * 0.02, z, s, 3) * 4.2 - 0.6), 0, 3)));
    }
    for (let i = rng.int(4, 14); i > 0; i--) {
        const p = rng.range(0.05, 1) ** 1.3, cy = hz + 2 + (H - hz) * p, cx = rng.range(0, W), rx = (3 + rng.range(4, 26) * p) * rng.range(0.7, 1.3), ry = rx * (0.18 + 0.2 * p);
        for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
            const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
            if (d > 1.15) continue;
            const far = y < cy;
            // Inside: the near wall catches the light, the far wall is in shadow; a bright rim.
            g.set(x, y, d > 0.95 ? G.flat(far ? 3 : 2) : G.face(far ? -1 : 1, far ? 0 : 1));
        }
    }
    sc.addStatic(g);
    const rb = new Buf(W, H);
    for (let i = rng.int(2, 10); i > 0; i--) {
        const p = rng.range(0.1, 1);
        rock(rb, rng.range(0, W), hz + (H - hz) * p, 1.5 + p * 8, sc.ramp(pal, 0.05 * (1 - p)), rng);
    }
    // A small outpost: domes with lit windows and a mast blinking red.
    const lights = [];
    if (rng.chance(0.6)) {
        const D = sc.ramp(Q.dome, 0.08), bx = W * rng.range(0.15, 0.85), by = hz + (H - hz) * rng.range(0.08, 0.25), sz = rng.range(5, 10);
        const win = sc.slot({ k: 'emit', c: hex(LIGHTS.cool), base: D.c[1], d: 0.08, v: 1 });
        for (let i = rng.int(2, 4); i > 0; i--) {
            const x = bx + rng.range(-3, 3) * sz, r = sz * rng.range(0.6, 1.2);
            for (let y = Math.floor(by - r); y <= by; y++) for (let k = -r; k <= r; k++) {
                const d = Math.hypot(k / r, (y - by) / r);
                if (d <= 1) rb.set(x + k, y, D.face(k < 0 ? -1 : 1, d > 0.8 ? 0 : 1));
            }
            for (let k = -r * 0.5; k <= r * 0.5; k += 2) rb.set(x + k, by - 1, win);
        }
        const mh = sz * 3;
        for (let j = 0; j < mh; j++) rb.set(bx + sz * 3.5, by - j, D.flat(0));
        lights.push({ x: bx + sz * 3.5, y: by - mh, slot: sc.slot({ k: 'flame', c: hex(LIGHTS.red) }) });
    }
    sc.addStatic(rb);
    sc.addFn((f, t) => { for (const l of lights) if ((t % 2) < 0.5) putter(f, W, H)(l.x, l.y, l.slot); });
}

// ---------------------------------------------------------------- campfire clearing

function camp(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.48, 0.58));
    groups(sc);
    sc.bias = rng.range(-0.3, 0.3);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['clear', 2], ['sparse', 1.6], ['fog', 0.8]], 0.5);
    canopyRidge(sc, rng, { d: 0.42, base: hz + 4, top: hz - rng.range(8, 16), bottom: hz + 6, ramp: rng.chance(0.5) ? P.canopy : P.forest, rmin: 2, rmax: 5, rows: 2 });
    ground(sc, hz + 2, P.hill, 0.3);
    meadow(sc, rng, { top: hz + 3, flowers: rng.range(0.02, 0.08), blades: rng.range(0.12, 0.24) });
    // Trees close around the clearing.
    const conif = rng.range(0.2, 0.9);
    for (let r = 0; r < 2; r++) {
        const p = (r + 1) / 3, b = new Buf(W, H, { rank: true }), y0 = hz + 3 + p * 14, d = 0.3 * (1 - p);
        const Dr = sc.ramp(P.forest, d), Tr = sc.ramp(P.trunk, d), gap = W * (0.15 + p * 0.2), mid = W * 0.5, trees = [];
        for (let x = -10; x < W + 10; x += rng.range(5, 11) * (0.6 + p)) {
            if (Math.abs(x - mid) < gap) continue;
            trees.push({ x, by: y0 + rng.range(0, 5), h: rng.range(22, 42) * (0.6 + p * 1.2) });
        }
        trees.sort((a, c) => a.by - c.by).forEach(t => {
            if (rng() < conif) conifer(b, t.x, t.by, t.h * 1.2, Dr, rng, { trunk: Tr });
            else blobTree(b, t.x, t.by, t.h, sc.leaves(P.leaf, d, leafVariant(rng)), Tr, rng);
        });
        sc.addStatic(b);
    }
    // The fire, with a pool of its light on the grass and a ring of stones.
    const fx = Math.round(W * rng.range(0.35, 0.65)), fp = rng.range(0.45, 0.7), fy = Math.round(hz + (H - hz) * fp), k = 0.8 + fp * 1.2;
    const pool = new Buf(W, H), warm = hex('#ff9a48');
    const glow = [0.25, 0.5, 0.8].map(v => sc.slot({ k: 'emit', c: warm, base: hex(P.grass[1]), d: 0, v }));
    const rx = 34 * k, ry = 11 * k;
    for (let y = Math.floor(fy - ry); y <= fy + ry; y++) for (let x = Math.floor(fx - rx); x <= fx + rx; x++) {
        const d = Math.hypot((x - fx) / rx, (y - fy) / ry);
        if (d < 1 && bayer(x, y) < (1 - d) * 1.1) pool.set(x, y, glow[d < 0.3 ? 2 : d < 0.6 ? 1 : 0]);
    }
    sc.addStatic(pool);
    const props = new Buf(W, H), St = sc.ramp(P.stone, 0), T = sc.ramp(P.trunk, 0);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
        if (Math.sin(a) < -0.2) continue;
        rock(props, fx + Math.cos(a) * 6 * k, fy + Math.sin(a) * 2 * k, 1.5 * k, St, rng);
    }
    for (const [dx, sl] of [[-1, 0.35], [1, -0.35]]) {
        for (let j = -5 * k; j <= 5 * k; j++) props.set(fx + j, fy - 1 + j * sl * dx * 0.3, T.face(dx, 1));
    }
    // A log to sit on, and a tent.
    const lx = fx + (rng.chance(0.5) ? -1 : 1) * rng.range(14, 22) * k, ly = fy + rng.range(2, 6) * k;
    for (let j = -8 * k; j <= 8 * k; j++) for (let i = 0; i < 2.2 * k; i++) props.set(lx + j, ly - i, T.face(i < k ? 1 : -1, i < 1 ? 1 : 0));
    if (rng.chance(0.75)) {
        const tx = fx + (lx > fx ? -1 : 1) * rng.range(28, 40) * k, ty = fy - rng.range(2, 6) * k, tw = 11 * k, th = 10 * k;
        const C = sc.ramp(rng.chance(0.5) ? Q.tent : Q.tentGreen, 0), door = sc.ramp(P.struct, 0);
        for (let j = 0; j <= th; j++) {
            const hwj = tw * j / th;
            for (let i = -hwj; i <= hwj; i++) {
                const inDoor = Math.abs(i) < hwj * 0.35 && j > th * 0.35;
                props.set(tx + i, ty - th + j, inDoor ? door.flat(0) : C.face(i < 0 ? -1 : 1, j < 1 ? 1 : 0));
            }
        }
    }
    sc.addStatic(props);
    const flame = ['#fff6c8', '#ffd060', '#ff9a30', '#e05a1c'].map(c => sc.slot({ k: 'flame', c: hex(c) }));
    const s = seedOf(rng), fw = Math.round(3 * k), fh = 9 * k;
    embers(sc, [{ x: fx, y: fy - 2 }, { x: fx - 1, y: fy - 2 }]);
    sc.addFn((f, t) => {
        const put = putter(f, W, H);
        for (let i = -fw; i <= fw; i++) {
            const hh = fh * (1 - Math.abs(i) / (fw + 1)) * (0.55 + 0.6 * noise1(t * 6 + i * 1.7, s));
            for (let j = 0; j < hh; j++) {
                const wob = (noise1(t * 8 + j * 0.4 + i, s + 1) - 0.5) * 2 * j / fh;
                const u = j / hh;
                put(fx + i + wob, fy - 2 - j, flame[u < 0.3 ? 0 : u < 0.55 ? 1 : u < 0.8 ? 2 : 3]);
            }
        }
    });
    // Big framing trees.
    const sb = new Buf(W, H, { sway: true, rank: true }), crowns = [], Df = sc.ramp(P.forest, 0);
    for (const side of [-1, 1]) {
        if (rng.chance(0.3)) continue;
        const x = side < 0 ? rng.range(-W * 0.06, W * 0.1) : rng.range(W * 0.9, W * 1.06), by = H + rng.range(-4, 10);
        if (rng() < conif) conifer(sb, x, by, U * rng.range(0.9, 1.2), Df, rng, { sway: 0.7, trunk: T });
        else crowns.push(blobTree(sb, x, by, U * rng.range(0.85, 1.1), sc.leaves(P.leaf, 0, leafVariant(rng)), T, rng, { sway: 0.7 }));
    }
    sc.addSway(sb, 0.7);
    if (crowns.length) leafFall(sc, rng, crowns, sc.leaves(P.leaf, 0, 1));
}

export const WILDS = { alpine, tundra, swamp, volcano, synth, planet, camp };
export const WILD_HOURS = { alpine: 10, tundra: 23, swamp: 19.2, volcano: 20.5, synth: 21, planet: 14, camp: 22 };
