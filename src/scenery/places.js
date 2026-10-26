// Draft scene templates, in review in tools/scenery.html: a harbour town, a jungle, a
// castle on a hill, a glowworm cavern, a window view and an underwater reef. The window
// frames another landscape: it builds it, then draws the room in front of its weather
// (sc.foreground).
import { Buf } from './scene.js';
import { hex, mix, mul } from './lighting.js';
import { bayer, clamp, fbm1, fbm2, hash, lerp, noise1, noise2, smoothstep } from './noise.js';
import { blades, blobTree, canopyRidge, celestial, conifer, hill, mountains, seedOf, sky, water } from './shapes.js';
import { BIOMES, LIGHTS, P, envelope, ground, loneTrees, meadow, pick, rock, weather } from './biomes.js';

const Q = {
    walls: [['#c8b49a', '#d8c6aa', '#f0e2c6', '#fff4dc'], ['#b07a64', '#c48c72', '#e0aa8a', '#f2c4a2'], ['#7a94a8', '#8aa6ba', '#aac6d6', '#c8e0ea'], ['#c0a050', '#d0b264', '#e8cc84', '#f6e0a2'], ['#a8a8a0', '#bcbcb2', '#dcdcd0', '#f2f2e8']],
    terracotta: ['#6a2e1e', '#843a26', '#b05a3a', '#cc7650'],
    hulls: [['#1c3a6a', '#24508a', '#3a72b4', '#5a96d4'], ['#7a1c1c', '#9a2a24', '#c84434', '#e46a4e'], ['#c8c4b8', '#d8d4ca', '#ecebe4', '#ffffff'], ['#1e4a2e', '#28643c', '#3a8a52', '#56a86a']],
    jungleLeaf: ['#0c2a14', '#124020', '#1c5a28', '#2c7a30', '#4a9a38', '#78bc44', '#a8d860'],
    broad: ['#123a1c', '#1a5226', '#2e7a32', '#56a040'],
    vine: ['#1a3a1c', '#24502a', '#3a6e34', '#5a8e44'],
    mossStone: ['#4a4a40', '#5e5e52', '#868672', '#a6a68e'],
    ice: ['#1e2c48', '#2c4468', '#5a86ae', '#a4d4ec'],
    cave: ['#263034', '#344246', '#52666a', '#74898c'],
    sand: ['#6a6450', '#827a60', '#a89c78', '#c8bc94'],
    coral: [['#7a2a4a', '#a83a62', '#d85a84', '#f08aa8'], ['#8a4a1a', '#b46424', '#e08a3a', '#f8b464'], ['#4a2a7a', '#6a3aa8', '#9a5ad8', '#c08af0']],
    kelp: ['#1e3a1c', '#2c5228', '#4a7a32', '#78a044'],
};

const putter = (f, W, H) => (x, y, v) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H) f[y * W + x] = v;
};

// ---------------------------------------------------------------- harbour town

// A building: storeys of windows (some lit at night), and a gable, hipped or flat roof.
// `foot(x)` is the ground under column x: where it falls away the walls go down to meet it.
function building(b, x, by, w, storeys, wall, roof, win, dark, rng, foot) {
    const h = storeys * 4 + 1;
    for (let k = 0; k < w; k++) for (let y = by - h, end = Math.max(by, foot(x + k)); y <= end; y++) b.set(x + k, y, wall.face(k < w / 2 ? -1 : 1, y > by ? 0 : 1));
    for (let st = 0; st < storeys; st++) for (let k = 1 + (w % 2 ? 0 : 1) * (st % 2); k < w - 1; k += 2) {
        if (rng.chance(0.25)) continue;
        b.set(x + k, by - 2 - st * 4, rng.chance(0.4) ? rng.pick(win) : dark);
    }
    const kind = pick(rng, ['gable', 2], ['hip', 1], ['flat', 1]), top = by - h;
    if (kind === 'flat') {
        for (let k = -1; k <= w; k++) b.set(x + k, top, wall.flat(3));
    } else {
        const rh = Math.ceil(w * (kind === 'gable' ? 0.38 : 0.25));
        for (let j = 0; j < rh; j++) {
            const inset = kind === 'gable' ? j : Math.min(j * 1.6, w / 2 - 1);
            for (let k = -1 + inset; k <= w - inset; k++) b.set(x + k, top - 1 - j, roof.face(k < w / 2 ? -1 : 1, j === 0 ? 0 : 1));
        }
    }
    if (rng.chance(0.3)) for (let j = 0; j < 3; j++) b.set(x + Math.round(w * 0.75), top - 2 - j, roof.flat(0));
    return top;
}

function harbour(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.56, 0.66));
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['fog', 0.7], ['scattered', 3], ['sparse', 2], ['streaks', 1]]);
    // A bay with the town round both shores, a steep hillside town, or a long waterfront.
    const layout = pick(rng, ['bay', 1.2], ['hillside', 1], ['waterfront', 1]), side = rng.chance(0.5) ? -1 : 1, s = seedOf(rng);
    const lift = u => layout === 'bay' ? smoothstep(0.18, 0.5, Math.abs(u - 0.5)) * 1.1
        : layout === 'hillside' ? smoothstep(0.3, 0.95, side < 0 ? 1 - u : u) * 1.3 + 0.05
            : 0.35 + 0.25 * fbm1(u * 3, s + 4, 2);
    // Land rises from the water; where it doesn't, the sea runs out to the horizon.
    const land = Float32Array.from({ length: W }, (_, x) => {
        const u = x / W, a = lift(u);
        return a < 0.06 ? Infinity : hz - U * 0.42 * a * (0.75 + 0.5 * fbm1(x * 0.012, s, 3));
    });
    if (rng.chance(0.5)) mountains(sc, rng, { d: 0.55, base: hz - 2, top: hz - U * rng.range(0.32, 0.5), ramp: P.blueRock, freq: 0.01, mist: 10, env: u => 0.3 + 0.7 * lift(u) });
    const hb = new Buf(W, H), G = sc.ramp(P.hill, 0.28);
    for (let x = 0; x < W; x++) {
        if (land[x] === Infinity) continue;
        const slope = (land[Math.min(W - 1, x + 3)] ?? land[x]) - (land[Math.max(0, x - 3)] ?? land[x]);
        for (let y = Math.max(0, Math.ceil(land[x])); y <= hz; y++) hb.set(x, y, G.face(slope >= 0 ? 1 : -1, fbm2(x * 0.03, y * 0.08, s + 1, 2) > 0.52 || y - land[x] < 1.2 ? 1 : 0));
    }
    sc.addStatic(hb);

    // The town: rows of buildings climbing the land, thinning out higher up, broken by gardens.
    const b = new Buf(W, H), roofs = [sc.ramp(Q.terracotta, 0.22), sc.ramp(P.slate, 0.22), sc.ramp(P.roof, 0.22)];
    const dark = sc.slot({ k: 'mat', c: hex('#1a1820'), d: 0.22 }), trees = sc.ramp(P.forest, 0.24), leafy = sc.ramp(P.canopy, 0.24);
    const win = [LIGHTS.warm, LIGHTS.amber, LIGHTS.white].map(c => sc.slot({ k: 'emit', c: hex(c), base: hex('#3a3430'), d: 0.22, v: 1 }));
    const reach = rng.range(0.55, 0.95), townTop = x => land[x] === Infinity ? Infinity : hz - (hz - land[x]) * reach * (0.6 + 0.4 * fbm1(x * 0.02, s + 2, 2));
    const roofOf = rng.chance(0.6) ? 0 : rng.int(0, 2), rowH = 5;
    // The ground under a column: the land's surface, or the quay where there is only water.
    const foot = x => { const g = land[clamp(Math.round(x), 0, W - 1)]; return g === Infinity ? hz - 2 : Math.round(g) + 2; };
    const tops = [];
    for (let row = Math.ceil(U * 0.5 / rowH); row >= 0; row--) {
        const by = hz - 3 - row * rowH;
        for (let x = rng.range(-6, 0); x < W;) {
            const w = rng.int(5, 14), xi = clamp(Math.round(x + w / 2), 0, W - 1);
            if (by - 3 < townTop(xi) || by > hz - 3 + 1) { x += w; continue; }
            if (noise2(x * 0.05, row * 0.7, s + 3) < 0.3) {
                // A garden: a cypress or a round tree.
                if (rng.chance(0.6) && foot(xi) <= by) {
                    if (rng.chance(0.5)) conifer(b, x + w / 2, by, rng.range(7, 14), trees, rng);
                    else for (let dy = -3; dy <= 0; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy * 2 < 10) b.set(x + w / 2 + dx, by - 3 + dy, leafy.face(dx < 0 ? -1 : 1, dy < -1 ? 1 : 0));
                }
                x += w; continue;
            }
            const storeys = clamp(Math.round(1 + rng() * 2.6 * (1 - row / 14)), 1, 4);
            tops.push({ x: x + w / 2, y: building(b, Math.round(x), by, w, storeys, sc.ramp(rng.pick(Q.walls), 0.22), roofs[rng.chance(0.8) ? roofOf : rng.int(0, 2)], win, dark, rng, foot) });
            x += w + (rng.chance(0.15) ? rng.int(1, 3) : 0);
        }
    }
    // Landmarks over the roofs: a domed church, a bell tower, a fort on the heights.
    const white = sc.ramp(Q.walls[4], 0.22), dome = sc.ramp(rng.chance(0.5) ? P.slate : Q.terracotta, 0.22);
    const landX = () => { for (let i = 0; i < 40; i++) { const x = Math.round(rng.range(0, W)); if (land[x] !== Infinity && townTop(x) < hz - 10) return x; } return -1; };
    for (const kind of ['dome', 'tower', 'fort'].filter(() => rng.chance(0.6))) {
        const x = landX();
        if (x < 0) continue;
        if (kind === 'fort') {
            // Its walls stand on the land only, and reach down the slope to meet it.
            const top = Math.round(land[x]) - 6, w = rng.int(18, 34), Fs = sc.ramp(P.stone, 0.24);
            for (let k = 0; k < w; k++) {
                const col = Math.round(x - w / 2 + k);
                if (col < 0 || col >= W || land[col] === Infinity) continue;
                for (let yy = top; yy <= foot(col); yy++) b.set(col, yy, Fs.face(k < w / 2 ? -1 : 1, yy - top < 6 ? 1 : 0));
                if (k % 2 === 0) b.set(col, top - 1, Fs.flat(3));
            }
            continue;
        }
        const by = Math.round(Math.min(hz - 4, townTop(x) + 6));
        if (kind === 'dome') {
            const r = rng.int(5, 8);
            building(b, x - r, by, r * 2 + 1, 2, white, dome, win, dark, rng, foot);
            for (let dy = 0; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) b.set(x + dx, by - 9 - dy, dome.face(dx < 0 ? -1 : 1, dy > r * 0.4 ? 1 : 0));
            for (let j = 0; j < 3; j++) b.set(x, by - 10 - r - j, white.flat(3));
        } else {
            const tw = 5, th = rng.int(18, 30);
            for (let k = 0; k < tw; k++) for (let y = by - th, end = Math.max(by, foot(x + k)); y <= end; y++) b.set(x + k, y, white.face(k < 2.5 ? -1 : 1, 1));
            for (let y = by - th + 2; y < by - th + 6; y++) for (let k = 1; k < tw - 1; k++) b.set(x + k, y, dark);
            for (let j = 0; j < 4; j++) for (let k = j * 0.6; k <= tw - j * 0.6; k++) b.set(x + k - 0.5, by - th - 1 - j, dome.face(k < 2.5 ? -1 : 1, 1));
        }
    }
    // The quay along each waterfront, with lamps.
    const st = sc.ramp(P.stone, 0.18), lamp = sc.slot({ k: 'emit', c: hex(LIGHTS.amber), base: hex('#5a5048'), d: 0.18, v: 1 }), post = sc.slot({ k: 'mat', c: hex('#2a2628'), d: 0.18 });
    for (let x = 0; x < W; x++) {
        if (land[x] === Infinity) continue;
        for (let y = hz - 2; y <= hz + 1; y++) b.set(x, y, st.face(1, y === hz - 2 ? 1 : (x + (y % 2) * 4) % 8 === 0 ? 0 : 1));
        if (x % 23 === 7) { for (let j = 1; j < 7; j++) b.set(x, hz - 2 - j, post); b.set(x, hz - 9, lamp); }
    }
    sc.addStatic(b);
    water(sc, rng, { y0: hz + 2, ramp: P.sea, mix: 0.5, fres: 0.6, waves: 0.05, speed: 1.5 });

    // A breakwater reaching into the water, a lighthouse at its end sweeping the night.
    const bw = new Buf(W, H), lights = [];
    if (rng.chance(0.65)) {
        const from = rng.chance(0.5) ? -1 : 1, y = Math.round(hz + (H - hz) * rng.range(0.12, 0.3)), len = W * rng.range(0.25, 0.5), x1 = from < 0 ? len : W - len;
        for (let x = from < 0 ? 0 : Math.round(x1); x < (from < 0 ? x1 : W); x++) for (let j = 0; j < 3; j++) bw.set(x, y - j, st.face(1, j === 2 ? 1 : 0));
        const lh = Math.round(U * 0.12), red = sc.ramp(['#7a1c1c', '#9a2a24', '#c84434', '#e46a4e'], 0.1);
        for (let j = 0; j < lh; j++) for (let k = -2; k <= 2; k++) bw.set(x1 + k, y - 3 - j, (Math.floor(j / 4) % 2 ? red : white).face(k < 0 ? -1 : 1, 1));
        lights.push({ x: x1, y: y - 4 - lh, beam: true });
    }
    sc.addStatic(bw);
    // Boats: fishing boats at their moorings, small yachts with sails.
    const boats = Array.from({ length: rng.int(3, 9) }, () => {
        const y = hz + 4 + (H - hz - 6) * rng.range(0.03, 0.85) ** 1.2, s2 = 0.6 + (y - hz) / (H - hz) * 2.6, R = sc.ramp(rng.pick(Q.hulls), 0);
        return { x: rng.range(8, W - 8), y, s: s2, sail: rng.chance(0.4), hull: [R.face(-1, 0), R.face(1, 1)], cabin: sc.ramp(Q.walls[4], 0).face(1, 1), cloth: sc.ramp(Q.walls[4], 0).face(-1, 1), mast: post, ph: rng() * 6, drift: rng.chance(0.3) ? rng.range(-1.5, 1.5) : 0 };
    });
    boats.sort((a, c) => a.y - c.y);
    const beamC = sc.slot({ k: 'emit', c: hex('#fff2c0'), base: hex('#3a3a44'), d: 0, v: 0.7 }), glowC = sc.slot({ k: 'flame', c: hex('#fff6d0') });
    sc.addFn((f, t, L) => {
        const put = putter(f, W, H);
        for (const l of lights) {
            put(l.x, l.y, glowC); put(l.x - 1, l.y, glowC); put(l.x + 1, l.y, glowC);
            if (L.lights < 0.3) continue;
            // The lamp turns: a beam swinging out over the water and back.
            const a = Math.sin(t * 0.5) * 1.4, len = W * 0.45 * Math.abs(Math.cos(t * 0.5));
            for (let r = 3; r < len; r++) for (let w = -r * 0.04; w <= r * 0.04; w++) {
                const x = l.x + Math.sin(a) * r + w, y = l.y - Math.cos(a) * r * 0.15;
                if (bayer(Math.round(x), Math.round(y)) < (1 - r / len) * 0.6 * L.lights) put(x, y, beamC);
            }
        }
        for (const bt of boats) {
            const span = W + 40, x = bt.drift ? ((bt.x + t * bt.drift) % span + span) % span - 20 : bt.x;
            const y = bt.y + Math.sin(t * 1.4 + bt.ph) * 0.6, tilt = Math.sin(t * 1.1 + bt.ph) * 0.06, len = 6 * bt.s, hh = 2 * bt.s;
            for (let j = 0; j < hh; j++) {
                const w = len * (1 - j / hh * 0.25);
                for (let k = -w; k <= w; k++) put(x + k, y - hh + j + k * tilt, bt.hull[k < 0 ? 0 : 1]);
            }
            if (bt.sail) {
                const mh = 9 * bt.s;
                for (let j = 0; j < mh; j++) {
                    put(x - j * tilt * 2, y - hh - j, bt.mast);
                    for (let k = 1; k < (mh - j) * 0.55; k++) put(x + k - j * tilt * 2, y - hh - j, bt.cabin);
                    for (let k = 1; k < (mh - j) * 0.3 && j < mh * 0.8; k++) put(x - k - j * tilt * 2, y - hh - j, bt.cloth);
                }
            } else {
                for (let j = 0; j < 2 * bt.s; j++) for (let k = -len * 0.5; k < len * 0.05; k++) put(x + k, y - hh - 1 - j - k * tilt, bt.cabin);
                for (let j = 0; j < 7 * bt.s; j++) put(x + len * 0.35 - j * tilt * 2, y - hh - j, bt.mast);
            }
        }
    });
}

// ---------------------------------------------------------------- jungle

// A big broad leaf on its stalk: a pointed oval with a pale midrib, torn into
// strips at the edges like a banana leaf.
function broadLeaf(b, x, y, ang, len, R, wt) {
    const ca = Math.cos(ang), sa = Math.sin(ang), wd = len * 0.22;
    for (let s = 0; s < len; s++) {
        const u = s / len, half = wd * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (u < 0.1 ? u * 10 : 1);
        const cx = x + ca * s, cy = y + sa * s + u * u * len * 0.25;
        for (let k = -half; k <= half; k++) {
            if (Math.abs(k) > half * 0.4 && (Math.floor(s / 3) + (k < 0 ? 1 : 0)) % 4 === 0) continue;
            const v = Math.abs(k) < 0.7 ? R.flat(3) : R.face(k < 0 ? -1 : 1, Math.abs(k) < half * 0.6 ? 1 : 0);
            b.set(cx - sa * k, cy + ca * k * 0.7, v, Math.round(wt * (0.3 + 0.7 * u)), Math.round(x));
        }
    }
}

function jungle(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.5, 0.6));
    sc.climate = 'wet';
    sc.bias = rng.range(-0.3, 0.3);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['fog', 2], ['rain', 1.6], ['towering', 1.8], ['storm', 0.6], ['haze', 1]], 0.4);
    // Ridge after ridge of canopy fading into the mist.
    for (const [d, lift] of [[0.62, 0.3], [0.48, 0.2], [0.34, 0.1]]) {
        canopyRidge(sc, rng, { d, base: hz - U * lift + 10, top: hz - U * lift - rng.range(4, 12), bottom: hz + 2, ramp: P.canopy, rmin: 2, rmax: 5 + (0.6 - d) * 10, rows: 2 });
    }
    // Emergent trees standing above the nearest canopy.
    const em = new Buf(W, H), Te = sc.ramp(P.trunk, 0.3);
    for (let i = rng.int(2, 6); i > 0; i--) {
        const x = rng.range(0, W), by = hz - U * 0.1 + rng.range(4, 12);
        blobTree(em, x, by, U * rng.range(0.18, 0.3), sc.leaves(Q.jungleLeaf, 0.3, 0), Te, rng);
    }
    sc.addStatic(em);
    // A mossy outcrop in the middle distance, a waterfall pouring off it into a pool.
    const cTop = hz - U * rng.range(0.1, 0.2), cBase = hz + (H - hz) * rng.range(0.2, 0.3), s = seedOf(rng), R = sc.ramp(P.mossRock, 0.16);
    // Dense forest filling the ground up to the outcrop's foot.
    ground(sc, hz + 1, P.canopy, 0.3);
    canopyRidge(sc, rng, { d: 0.26, base: cBase, top: hz - 2, bottom: cBase + 2, ramp: P.canopy, rmin: 3, rmax: 7, rows: 3 });
    const cw = W * rng.range(0.4, 0.65), c0 = clamp(W * rng.range(0.1, 0.9) - cw / 2, -cw * 0.2, W - cw * 0.8), c1 = c0 + cw;
    const fx = lerp(c0, c1, rng.range(0.3, 0.7)), fw = Math.max(3, U * rng.range(0.04, 0.07)), cliff = new Buf(W, H);
    const edge = new Float32Array(W).fill(Infinity);
    for (let x = Math.max(0, Math.floor(c0)); x < Math.min(W, c1); x++) {
        const u = (x - c0) / cw, shoulder = 1 - Math.min(1, Math.min(u, 1 - u) / 0.2);
        edge[x] = cTop + shoulder * shoulder * (cBase - cTop) * 0.85 + (fbm1(x * 0.04, s, 3) - 0.5) * 8 + (Math.abs(x - fx) < fw * 1.4 ? 3 : 0);
        for (let y = Math.ceil(edge[x]); y <= cBase; y++) {
            const streak = noise2(x * 0.25, y * 0.05, s + 1), strata = noise2(x * 0.04, y * 0.4, s + 3) > 0.62;
            cliff.set(x, y, R.face(streak > 0.5 ? 1 : -1, y - edge[x] < 1.5 || streak > 0.72 || strata ? 1 : 0));
        }
    }
    // Moss and creepers hanging down the face, canopy crowding its top.
    const Mo = sc.ramp(P.hill, 0.14), Cn = sc.ramp(P.canopy, 0.16);
    for (let i = Math.round(cw / 4); i > 0; i--) {
        const x = Math.round(rng.range(c0, c1));
        if (x < 0 || x >= W || Math.abs(x - fx) < fw + 1) continue;
        const len = rng.range(4, (cBase - edge[x]) * 0.7);
        for (let j = 0; j < len; j++) if (hash(x, j, s) < 0.85) cliff.set(x, edge[x] + j, Mo.flat(j < 2 ? 2 : 1));
    }
    for (let x = Math.floor(c0); x < c1; x += rng.range(2, 5)) {
        const xi = clamp(Math.round(x), 0, W - 1), r = rng.range(3, 7);
        if (Math.abs(x - fx) < fw * 1.2 || edge[xi] === Infinity) continue;
        for (let dy = -r; dy <= r * 0.4; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) cliff.set(x + dx, edge[xi] + dy, Cn.face(dx < 0 ? -1 : 1, dy < -r * 0.3 ? 1 : 0));
    }
    sc.addStatic(cliff);
    const pool = new Buf(W, H), pr = fw * rng.range(4, 7);
    for (let y = Math.round(cBase - 2); y < cBase + pr * 0.4; y++) for (let x = Math.floor(fx - pr * 2); x <= fx + pr * 2; x++) {
        if (Math.hypot((x - fx) / (pr * 2), (y - cBase) / (pr * 0.4)) < 1 + (noise1(x * 0.2, s + 4) - 0.5) * 0.2) pool.set(x, y, 1);
    }
    ground(sc, cBase, P.hill, 0.15);
    meadow(sc, rng, { top: cBase + 1, flowers: 0.04, blades: rng.range(0.15, 0.3), tall: 1.6 });
    water(sc, rng, { y0: Math.round(cBase - 2), ramp: P.lake, mix: 0.4, fres: 0.5, waves: 0.08, speed: 2, mask: pool });
    const foam = ['#ffffff', '#d8eef4', '#a4ccd8', '#6aa0b4'].map(c => sc.slot({ k: 'mat', c: hex(c), d: 0.12 }));
    const lip = Math.round(edge[clamp(Math.round(fx), 0, W - 1)]);
    sc.addFn((f, t) => {
        const put = putter(f, W, H);
        for (let y = lip - 1; y < cBase; y++) {
            const u = (y - lip) / (cBase - lip), w = fw * (1 + u * 0.35);
            for (let x = Math.floor(fx - w); x <= fx + w; x++) {
                const n = noise2(x * 0.5, y * 0.1 - t * 4.5, s + 2), e = Math.abs(x - fx) > w - 1;
                put(x, y, foam[e ? (n > 0.5 ? 2 : 3) : n > 0.6 ? 0 : n > 0.38 ? 1 : 2]);
            }
        }
        // Spray billowing at the foot of the fall.
        for (let i = 0; i < 70; i++) {
            const a = hash(i, 1, s) * Math.PI, age = (t * 0.5 + hash(i, 2, s)) % 1, r = fw * (1 + age * 4);
            const x = fx + Math.cos(a) * r * (hash(i, 3, s) < 0.5 ? -1 : 1), y = cBase - Math.sin(a) * r * 0.6 - age * 6;
            if (bayer(Math.round(x), Math.round(y)) < 1 - age) { put(x, y, foam[age < 0.4 ? 0 : 1]); if (age < 0.5) put(x + 1, y, foam[1]); }
        }
    });
    // Big trees at the sides, creepers hanging from above, ferns and broad leaves in front.
    const sb = new Buf(W, H, { sway: true }), T = sc.ramp(P.trunk, 0);
    for (const side of [-1, 1]) {
        if (rng.chance(0.3)) continue;
        const x = side < 0 ? rng.range(-W * 0.16, -W * 0.02) : rng.range(W * 1.02, W * 1.16);
        blobTree(sb, x, H + rng.range(0, 8), U * rng.range(0.9, 1.1), sc.leaves(Q.jungleLeaf, 0, 0), T, rng, { sway: 0.4 });
    }
    const Vn = sc.ramp(Q.vine, 0);
    for (let i = rng.int(5, 12); i > 0; i--) {
        const x0 = rng.chance(0.7) ? (rng.chance(0.5) ? rng.range(0, W * 0.3) : rng.range(W * 0.7, W)) : rng.range(0, W), len = rng.range(U * 0.2, U * 0.65), sw = rng.range(4, 14), ph = rng() * 6;
        for (let j = 0; j < len; j++) {
            const x = Math.round(x0 + Math.sin(j / len * Math.PI) * sw * Math.sin(ph)), wt = Math.round(255 * j / len);
            sb.set(x, j, Vn.flat(1), wt, Math.round(x0));
            if (j % 5 === 0 && j > 3) {
                const dir = j % 10 ? 1 : -1;
                sb.set(x + dir, j, Vn.flat(3), wt, Math.round(x0)); sb.set(x + dir * 2, j + 1, Vn.flat(2), wt, Math.round(x0)); sb.set(x + dir, j + 1, Vn.flat(2), wt, Math.round(x0));
            }
        }
    }
    const L = sc.ramp(Q.broad, 0);
    for (let x = rng.range(-10, 0); x < W + 10; x += rng.range(8, 20)) {
        const up = -Math.PI / 2 + rng.range(-0.9, 0.9);
        broadLeaf(sb, x, H + rng.range(-2, 6), up, U * rng.range(0.08, 0.18), L, 160);
    }
    for (let i = rng.int(3, 7); i > 0; i--) {
        const left = rng.chance(0.5), x = left ? rng.range(-10, W * 0.25) : rng.range(W * 0.75, W + 10), y = H + rng.range(-4, 8);
        const ang = left ? -rng.range(0.4, 1.3) : -Math.PI + rng.range(0.4, 1.3);
        broadLeaf(sb, x, y, ang, U * rng.range(0.25, 0.45), L, 200);
    }
    sc.addSway(sb, 0.7);
}

// ---------------------------------------------------------------- castle on the hill

// Rows of ashlar: dark mortar joints, staggered row to row.
const masonry = (x, y, R, side, lv = 1) => (y % 4 === 0 && (x + y) % 3 ? R.flat(0) : (x + (Math.floor(y / 4) % 2) * 3) % 7 === 0 && y % 4 ? R.flat(0) : R.face(side, lv));

// A castle drawn into b on the ground line g (an array of ground heights): a curtain wall
// along the crest, a square keep, round towers with conical roofs or battlements, a
// gatehouse. Ruined, the tops are broken and the roofs gone. Returns where the flags fly.
function castle(sc, b, cx, g, s, R, roof, lamp, dark, rng, ruined) {
    const { W } = sc, flags = [], es = seedOf(rng);
    const ground = x => g[clamp(Math.round(x), 0, W - 1)];
    const broken = (x, top, h) => ruined ? top + h * 0.35 * Math.max(0, fbm1(x * 0.15, es, 2) * 1.6 - 0.5) : top;
    const merlons = (x0, x1, y) => {
        if (ruined) return;
        for (let x = Math.round(x0); x <= x1; x++) if (Math.floor((x - x0) / Math.max(2, Math.round(2 * s))) % 2 === 0) for (let j = 1; j <= Math.max(2, s * 2); j++) b.set(x, y - j, R.face(x < cx ? -1 : 1, 1));
    };
    const windows = (x0, x1, y0, y1, step) => {
        for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step * 0.8) {
            if (rng.chance(0.4)) continue;
            const lit = rng.chance(0.45);
            for (let j = 0; j < Math.max(2, s * 2.4); j++) b.set(x, y + j, lit ? lamp : dark);
        }
    };
    const box = (x0, w, h, crown) => {
        const base = Math.max(ground(x0), ground(x0 + w)) + 2;
        for (let x = Math.round(x0); x < x0 + w; x++) {
            const top = broken(x, base - h, h);
            // Down to the hill under each column, so nothing hangs over a slope.
            for (let y = Math.round(top), end = Math.max(base, ground(x) + 4); y <= end; y++) b.set(x, y, masonry(x, y, R, x < x0 + w / 2 ? -1 : 1));
        }
        if (crown) merlons(x0 - 1, x0 + w, base - h);
        windows(x0 + 2 * s, x0 + w - 2 * s, base - h + 4 * s, base - 4 * s, 6 * s);
        return base - h;
    };
    const round = (x, r, h, capped) => {
        const base = ground(x) + 3, top = base - h;
        for (let k = -r; k <= r; k++) {
            const u = k / r, t2 = broken(x + k, top, h);
            // Shaded like a cylinder: the side toward the light lit, the far side and rim dark.
            for (let y = Math.round(t2), end = Math.max(base, ground(x + k) + 4); y <= end; y++) b.set(x + k, y, masonry(Math.round(x + k), y, R, u < -0.2 ? -1 : u > 0.2 ? 1 : -1, Math.abs(u) > 0.8 ? 0 : 1));
        }
        if (capped && !ruined) {
            const rh = r * 2.4;
            for (let j = 0; j < rh; j++) for (let k = -(r + 1) * (1 - j / rh); k <= (r + 1) * (1 - j / rh); k++) b.set(x + k, top - j, roof.face(k < 0 ? -1 : 1, Math.abs(k) < r * 0.5 * (1 - j / rh) ? 1 : 0));
            flags.push({ x, y: top - rh });
        } else merlons(x - r - 1, x + r + 1, top);
        windows(x - r * 0.3, x + r * 0.3, top + 4 * s, base - 5 * s, 7 * s);
    };
    // Curtain wall along the crest between the outer towers.
    const half = rng.range(34, 52) * s, wallH = 12 * s;
    for (let x = Math.round(cx - half); x <= cx + half; x++) {
        const base = ground(x) + 3, top = Math.round(broken(x, base - wallH, wallH));
        for (let y = top; y <= base; y++) b.set(x, y, masonry(x, y, R, x < cx ? -1 : 1));
        // Battlements ride the wall's own top as it follows the crest.
        if (!ruined && Math.floor((x - cx + half) / Math.max(2, Math.round(2 * s))) % 2 === 0) for (let j = 1; j <= Math.max(2, s * 2); j++) b.set(x, top - j, R.face(x < cx ? -1 : 1, 1));
    }
    const kw = rng.range(18, 26) * s, kx = cx + rng.range(-0.3, 0.3) * half - kw / 2, keepTop = box(kx, kw, rng.range(30, 40) * s, true);
    if (!ruined) flags.push({ x: kx + kw / 2, y: keepTop - 2 * s });
    for (const k of [-1, 1]) round(cx + k * half, rng.range(5, 8) * s, rng.range(24, 34) * s, !!roof);
    if (rng.chance(0.7)) round(cx + rng.range(-0.7, 0.7) * half, rng.range(4, 6) * s, rng.range(30, 44) * s, !!roof);
    // The gatehouse: two squat towers either side of an arch.
    const gx = cx + rng.range(-0.5, 0.5) * half, gw = 14 * s, gb = ground(gx) + 3;
    box(gx - gw / 2, gw, 20 * s, true);
    const aw = 3 * s;
    for (let k = -aw; k <= aw; k++) for (let y = Math.round(gb - 6 * s - Math.sqrt(Math.max(0, aw * aw - k * k))); y <= gb; y++) b.set(gx + k, y, dark);
    return flags;
}

function ruins(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.6, 0.7));
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['fog', 1.2], ['overcast', 1], ['mixed', 1.2], ['towering', 1]]);
    if (rng.chance(0.6)) mountains(sc, rng, { d: 0.55, base: hz + 2, top: hz - U * rng.range(0.1, 0.22), ramp: P.blueRock, snow: rng.chance(0.4) && P.snow, freq: 0.01, mist: 8, env: envelope(rng) });
    // The castle's hill: a broad rise in the middle distance.
    const cx = Math.round(W * rng.range(0.32, 0.68)), crest = hz - U * rng.range(0.1, 0.18), spread = W * rng.range(0.22, 0.34), s = U / 216 * rng.range(0.9, 1.3);
    const hs = seedOf(rng), Hl = sc.ramp(P.hill, 0.2), hb = new Buf(W, H, { rank: true });
    const g = Float32Array.from({ length: W }, (_, x) => {
        const u = (x - cx) / spread;
        return hz + 4 - (hz + 4 - crest) * Math.exp(-u * u * 1.6) - (fbm1(x * 0.02, hs, 3) - 0.5) * 6 + Math.abs(u) * 2;
    });
    for (let x = 0; x < W; x++) {
        const slope = g[Math.min(W - 1, x + 3)] - g[Math.max(0, x - 3)];
        for (let y = Math.max(0, Math.ceil(g[x])); y <= hz + 8; y++) hb.set(x, y, Hl.face(slope >= 0 ? 1 : -1, fbm2(x * 0.03, y * 0.06, hs + 1, 2) > 0.5 || y - g[x] < 1.2 ? 1 : 0));
    }
    sc.addStatic(hb);
    const ruined = rng.chance(0.3), cb = new Buf(W, H, { rank: true });
    const R = sc.ramp(P.stone, 0.2), roof = !ruined && rng.chance(0.75) && sc.ramp(P.slate, 0.2);
    const lamp = sc.slot({ k: 'emit', c: hex(LIGHTS.warm), base: hex(P.stone[0]), d: 0.2, v: 1 }), dark = sc.slot({ k: 'mat', c: hex('#1a1820'), d: 0.2 });
    const flags = castle(sc, cb, cx, g, s, R, roof, lamp, dark, rng, ruined);
    // Ivy over the walls, more of it on a ruin.
    const iv = sc.ramp(P.hill, 0.18), is = seedOf(rng);
    for (let y = 0; y < hz + 8; y++) for (let x = 0; x < W; x++) {
        const v = cb.get(x, y);
        if (v && v !== lamp && fbm2(x * 0.06, y * 0.05, is, 2) > (ruined ? 0.58 : 0.68) && y > g[x] - U * 0.12) cb.set(x, y, iv.face(x < cx ? -1 : 1, hash(x, y, is) < 0.5 ? 1 : 0), 0, undefined, 1 + Math.floor(hash(x, y, is + 1) * 200));
    }
    sc.addStatic(cb);
    ground(sc, hz + 6, P.hill, 0.15);
    const ty = meadow(sc, rng, { top: hz + 7, flowers: rng.range(0.04, 0.14), blades: rng.range(0.15, 0.3) });
    // A path winding up toward the gate.
    const pb = new Buf(W, H), Sd = sc.ramp(P.sand, 0.05), ps = seedOf(rng), end = W * rng.range(0.3, 0.7);
    for (let y = hz + 7; y < H; y++) {
        const p = (y - hz - 7) / (H - hz - 7), x0 = lerp(cx, end, p) + Math.sin(p * 4 + ps) * W * 0.06 * p, w = 0.6 + p * U * 0.06;
        for (let x = Math.floor(x0 - w - 1); x <= x0 + w + 1; x++) {
            const e = w - Math.abs(x - x0);
            if (e < 0 && bayer(x, y) > 0.5 + e) continue;
            pb.set(x, y, Sd.flat(e < 1 ? 0 : hash(x >> 1, y, ps) < 0.1 ? 2 : 1));
        }
    }
    sc.addStatic(pb);
    loneTrees(sc, rng, pick(rng, [0, 1], [1, 2], [2, 1.5]), ty, rng.chance(0.3) ? 'conifer' : 'leafy');
    // Banners flying from the roofs.
    const cloth = sc.slot({ k: 'mat', c: hex(rng.pick(['#b02a2a', '#2a4ab0', '#d0a020'])), d: 0.2 }), pole = sc.slot({ k: 'mat', c: hex('#2a2628'), d: 0.2 });
    sc.addFn((f, t) => {
        const put = putter(f, W, H);
        for (const fl of flags) {
            const ph = Math.max(3, 4 * s);
            for (let j = 0; j < ph; j++) put(fl.x, fl.y - j, pole);
            for (let k = 1; k <= ph * 1.2; k++) for (let j = 0; j < ph * 0.45; j++) put(fl.x + k, fl.y - ph + j + Math.sin(t * 4 - k * 0.6) * k * 0.12, cloth);
        }
    });
}

// ---------------------------------------------------------------- glowworm cavern

// A grotto: a roof spangled with glowworms over a still underground lake that mirrors
// them, pillars of rock fading into the dark, glowing fungi on the shore, and by day a
// shaft of sunlight through a hole in the roof. In ice, the walls glow pale blue.
function cave(sc, rng) {
    const { W, H, U } = sc, lake = sc.horizon = sc.horizonAt(rng.range(0.58, 0.68)), icy = rng.chance(0.3), s = seedOf(rng);
    sc.climate = 'dry';
    const dim = icy ? [0.5, 0.58, 0.7] : [0.46, 0.52, 0.56];
    sc.relight = (L) => {
        L.skyTop = icy ? [6, 12, 26] : [5, 9, 12]; L.skyHor = icy ? [18, 36, 58] : [14, 30, 34];
        L.haze = L.skyHor; L.tint = mix(dim, mul(dim, [1.5, 1.45, 1.35]), L.day * 0.4);
        L.stars = 0; L.fog = 0; L.veil = 1; L.contrast = 0.6;
    };
    sky(sc);
    const R = sc.ramp(icy ? Q.ice : Q.cave, 0);
    // Pillars and walls in layers, the farther ones fading into the dark.
    for (const [d, n] of [[0.7, rng.int(2, 4)], [0.45, rng.int(1, 3)], [0.22, rng.int(0, 2)]]) {
        const b = new Buf(W, H), Rd = sc.ramp(icy ? Q.ice : Q.cave, d);
        for (let i = 0; i < n; i++) {
            const x0 = rng.range(-0.1, 1.1) * W, w = U * rng.range(0.04, 0.1) * (1.4 - d), ws = seedOf(rng);
            // Wide where they meet roof and floor, pinched at the waist.
            for (let y = 0; y <= lake; y++) {
                const u = y / lake, waist = 0.45 + 0.55 * Math.abs(u - 0.5) * 2;
                const hw = w * waist * (0.8 + 0.4 * fbm1(y * 0.05, ws, 2)), cx = x0 + (fbm1(y * 0.02, ws + 1, 2) - 0.5) * w;
                for (let x = Math.floor(cx - hw); x <= cx + hw; x++) b.set(x, y, Rd.face(x < cx ? -1 : 1, (x - cx) / hw > -0.3 && noise2(x * 0.2, y * 0.05, ws) > 0.45 ? 1 : 0));
            }
        }
        sc.addStatic(b);
    }
    // The roof: a heavy ceiling bulging down in broad, rounded swells of flowstone.
    const roof = new Buf(W, H), roofY = Float32Array.from({ length: W }, (_, x) => H * 0.08 + U * 0.14 * fbm1(x * 0.015, s, 3));
    const hole = rng.chance(0.75) && { x: W * rng.range(0.2, 0.8), r: U * rng.range(0.04, 0.07) };
    for (let x = 0; x < W; x++) {
        const drape = Math.max(0, fbm1(x * 0.025, s + 1, 2) - 0.45) * U * 0.35;
        for (let y = 0; y < roofY[x] + drape; y++) {
            if (hole && Math.hypot(x - hole.x, (y - roofY[x] * 0.5) * 1.6) < hole.r) continue;
            const edge = roofY[x] + drape - y < 2;
            roof.set(x, y, R.face(noise2(x * 0.15, y * 0.1, s + 3) > 0.5 ? 1 : -1, edge ? 1 : 0));
        }
    }
    sc.addStatic(roof);
    // Daylight through the hole: a bright opening and a shaft falling to the water.
    if (hole) {
        const sun = sc.slot({ k: 'day', base: [8, 10, 14], c: [250, 244, 220], v: 1 }), shaft = [0.25, 0.45].map(v => sc.slot({ k: 'day', base: icy ? [18, 36, 58] : [10, 18, 22], c: [210, 220, 200], v }));
        const hb = new Buf(W, H), lean = rng.range(-0.25, 0.25);
        for (let y = 0; y < roofY[Math.round(clamp(hole.x, 0, W - 1))]; y++) for (let x = Math.floor(hole.x - hole.r); x <= hole.x + hole.r; x++) if (!roof.get(x, y)) hb.set(x, y, sun);
        sc.addStatic(hb);
        const motes = Array.from({ length: 40 }, () => ({ u: rng(), v: rng(), ph: rng() * 6 }));
        sc.addFn((f, t, L) => {
            if (L.day < 0.05) return;
            const put = putter(f, W, H), y0 = roofY[Math.round(clamp(hole.x, 0, W - 1))];
            for (let y = Math.round(y0); y < lake; y++) {
                const p = (y - y0) / (lake - y0), w = hole.r * (1 + p * 1.2), cx = hole.x + lean * (y - y0);
                for (let x = Math.floor(cx - w); x <= cx + w; x++) {
                    const e = Math.abs(x - cx) / w;
                    if (bayer(x, y) < (1 - e) * (1 - p * 0.6) * 0.7 * L.day) f[y * W + x] = shaft[e < 0.45 ? 1 : 0];
                }
            }
            for (const m of motes) {
                const y = y0 + ((m.v + t * 0.01) % 1) * (lake - y0), p = (y - y0) / (lake - y0);
                put(hole.x + lean * (y - y0) + (m.u - 0.5) * hole.r * 2 * (1 + p) + Math.sin(t * 0.5 + m.ph), y, sun);
            }
        });
    }
    // Glowworms on the roof and the pillars' upper reaches, each twinkling, a silk thread under some.
    const worms = [], glow = [icy ? '#a8f0ff' : '#7af8e0', icy ? '#5ab8e0' : '#3ab8a0'].map(c => sc.slot({ k: 'flame', c: hex(c) })), silk = sc.slot({ k: 'flame', c: hex(icy ? '#1e3450' : '#14302c') });
    for (let i = 0; i < Math.round(W * 2.4); i++) {
        const x = rng.int(0, W - 1), y = Math.round(rng.range(0, Math.min(lake - 8, roofY[x] + U * 0.25 * rng() ** 2)));
        worms.push({ x, y, b: rng.chance(0.25), ph: rng() * 20, thread: rng.chance(0.2) ? rng.int(2, 6) : 0 });
    }
    sc.addFn((f, t) => {
        const put = putter(f, W, H);
        worms.forEach((w, i) => {
            if (hash(i, Math.floor(t * 0.4 + w.ph), s) < 0.1) return;
            for (let j = 1; j <= w.thread; j++) put(w.x, w.y + j, silk);
            put(w.x, w.y, glow[w.b ? 0 : 1]);
        });
    });
    // The still lake mirrors it all.
    water(sc, rng, { y0: lake + 1, ramp: icy ? Q.ice : ['#0a1a1c', '#12282a', '#1e3c3c', '#2e5452'], mix: 0.15, fres: 0.2, waves: 0.015, speed: 0.4 });
    // Shore rocks on either side, glowing fungi on them.
    const sb = new Buf(W, H), fungi = [icy ? '#c0f4ff' : '#c8ff8a', icy ? '#6ac0e0' : '#7ac850'].map(c => sc.slot({ k: 'flame', c: hex(c) }));
    for (const side of [-1, 1]) {
        if (rng.chance(0.25)) continue;
        const w = W * rng.range(0.15, 0.35), x0 = side < 0 ? 0 : W - w, top = lake + (H - lake) * rng.range(0.1, 0.5);
        for (let x = Math.floor(x0); x < x0 + w; x++) {
            const u = side < 0 ? (x - x0) / w : 1 - (x - x0) / w, yTop = top + (H - top) * smoothstep(0.55, 1, u) + (fbm1(x * 0.06, s + side, 3) - 0.5) * 8;
            for (let y = Math.round(yTop); y < H; y++) sb.set(x, y, R.face(noise2(x * 0.08, y * 0.12, s + 5) > 0.5 ? side : -side, y - yTop < 1.5 || noise2(x * 0.2, y * 0.3, s + 6) > 0.7 ? 1 : 0));
            // Clusters of little glowing caps along the shore.
            if (rng.chance(0.04)) for (let c = rng.int(1, 4); c > 0; c--) {
                const fx = x + rng.range(-3, 3), fy = Math.round(yTop) + rng.range(0, 2), r = rng.range(0.8, 2);
                sb.set(fx, fy, fungi[1]); sb.set(fx, fy - 1, fungi[1]);
                for (let k = -r; k <= r; k++) for (let j = 0; j <= r * 0.6; j++) if ((k / r) ** 2 + (j / (r * 0.6 + 0.5)) ** 2 <= 1) sb.set(fx + k, fy - 2 - j, fungi[0]);
            }
        }
    }
    sc.addStatic(sb);
}

// ---------------------------------------------------------------- window view

function room(sc, rng) {
    BIOMES[pick(rng, ['lake', 1], ['hills', 1], ['river', 1], ['seaside', 0.8], ['industrial', 1.2], ['farmland', 0.8], ['woodland', 0.8])].build(sc, rng);
    sc.foreground.push(() => roomFrame(sc, rng));
}

function roomFrame(sc, rng) {
    const { W, H } = sc, warm = c => mul(c, [1.25, 1.02, 0.72]).map(v => Math.min(255, v));
    const roomSlot = (c, v) => sc.slot({ k: 'room', c, lamp: warm(c), v });
    const shades = (c, v) => [0.62, 0.78, 1, 1.15].map(k => roomSlot(mul(hex(c), [k, k, k]), v));
    const wallC = pick(rng, ['#8a7a64', 1], ['#6e7e6a', 1], ['#6a7488', 1], ['#7a5a4a', 0.8]), woodC = pick(rng, ['#6a4a32', 1], ['#e8e0d4', 0.7], ['#3a3a42', 0.6]);
    const lampSide = rng.chance(0.5) ? -1 : 1, lx = lampSide < 0 ? W * 0.08 : W * 0.92, ly = H * 0.8;
    // The lamp's light falls off across the room in a few dithered steps.
    const level = (x, y) => clamp(Math.floor((1 - Math.hypot(x - lx, (y - ly) * 1.2) / (W * 0.85)) * 3 + bayer(x, y) * 0.9), 0, 3);
    const wall = [0.25, 0.45, 0.65, 0.85].map(v => shades(wallC, v)), wood = [0.3, 0.5, 0.7, 0.9].map(v => shades(woodC, v));
    const wx0 = Math.round(W * rng.range(0.26, 0.34)), wx1 = Math.round(W - W * rng.range(0.26, 0.34)), wy0 = Math.round(H * rng.range(0.1, 0.16)), wy1 = Math.round(H * rng.range(0.66, 0.74));
    const ft = Math.max(3, Math.round(W * 0.014)), b = new Buf(W, H), ws = seedOf(rng), stripes = rng.chance(0.5);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const inWin = x >= wx0 && x <= wx1 && y >= wy0 && y <= wy1;
        if (inWin) continue;
        // Wallpaper: a faint stripe, or a sparse diamond print.
        const lv = level(x, y), pat = stripes ? x % 10 === 0 : (x + y) % 12 === 0 && (x - y) % 24 === 0;
        b.set(x, y, wall[lv][pat ? 1 : 2]);
    }
    // The frame, its glazing bars and the sill.
    const frame = (x, y, side, lit) => b.set(x, y, wood[level(x, y)][lit ? 3 : side < 0 ? 1 : 2]);
    for (let y = wy0 - ft; y <= wy1 + ft; y++) for (let x = wx0 - ft; x <= wx1 + ft; x++) {
        const e = x < wx0 || x > wx1 || y < wy0 || y > wy1;
        const midX = Math.abs(x - (wx0 + wx1) / 2) < ft / 2, barY = Math.abs(y - (wy0 + (wy1 - wy0) * 0.36)) < ft / 3;
        if (e || midX || barY) frame(x, y, x < (wx0 + wx1) / 2 ? -1 : 1, y === wy0 - ft || (barY && y < wy0 + (wy1 - wy0) * 0.36));
    }
    const sy = wy1 + ft;
    for (let y = sy; y < sy + ft + 2; y++) for (let x = wx0 - ft * 3; x <= wx1 + ft * 3; x++) frame(x, y, 1, y === sy);
    // Curtains on a rod, gathered in folds over the edges of the window: in front of the sill and what stands on it.
    const cb = new Buf(W, H);
    const curtC = pick(rng, ['#8a3a3a', 1], ['#3a5a7a', 1], ['#c8b890', 1], ['#5a6a3a', 0.8]), curt = [0.3, 0.5, 0.7, 0.9].map(v => shades(curtC, v));
    const cw = (wx1 - wx0) * rng.range(0.16, 0.26);
    for (let y = wy0 - ft * 3; y < sy + ft * 4; y++) for (const side of [-1, 1]) {
        const xa = side < 0 ? wx0 - ft * 4 : wx1 - cw, xb = side < 0 ? wx0 + cw : wx1 + ft * 4;
        for (let x = Math.round(xa); x <= xb; x++) {
            const ph = Math.sin((x - xa) * 0.45 + y * 0.01), fold = ph > 0.55 ? 3 : ph > -0.3 ? 2 : 1;
            cb.set(x, y, curt[level(x, y)][fold]);
        }
    }
    for (let x = wx0 - ft * 5; x <= wx1 + ft * 5; x++) cb.set(x, wy0 - ft * 3 - 1, wood[level(x, wy0)][0]);
    // On the sill, in the open middle between the curtains: a plant, a mug that steams, a few books.
    const open0 = wx0 + cw + ft * 2, open1 = wx1 - cw - ft * 2;
    const items = new Buf(W, H), pot = shades('#a85a3a', 0.6), leaf = shades('#3a6a34', 0.6), mug = shades(rng.pick(['#e8e0d0', '#4a6a8a', '#b04a3a']), 0.7);
    const ph = Math.max(4, ft * 2), px = lerp(open0, open1, rng.range(0, 0.25)) + ph;
    for (let j = 0; j < ph; j++) for (let k = -ph * 0.4 + j * 0.1; k <= ph * 0.4 - j * 0.1; k++) items.set(px + k, sy - 1 - (ph - 1 - j), pot[j < 1 ? 3 : k < 0 ? 1 : 2]);
    for (let i = 0; i < ph * 6; i++) {
        const a = -Math.PI * rng.range(0.05, 0.95), r = rng.range(0.3, 1) * ph * 1.4;
        items.set(px + Math.cos(a) * r, sy - ph - 1 + Math.sin(a) * r, leaf[rng.int(1, 3)]);
    }
    const mx = lerp(open0, open1, rng.range(0.45, 0.65)), mh = Math.max(3, ft * 1.4);
    for (let j = 0; j < mh; j++) for (let k = -mh * 0.45; k <= mh * 0.45; k++) items.set(mx + k, sy - 1 - j, mug[k < 0 ? 1 : 2]);
    for (let j = 1; j < mh - 1; j++) items.set(mx + mh * 0.45 + 1, sy - 1 - j, mug[1]);
    const bx = open1 - ft * 2, books = ['#6a2a2a', '#2a4a6a', '#5a6a3a', '#8a7a4a'].map(c => shades(c, 0.6));
    for (let i = 0, y = sy - 1; i < rng.int(1, 4); i++) {
        const bh = Math.max(2, Math.round(ft * 0.7)), bw = ft * rng.range(3, 5);
        for (let j = 0; j < bh; j++) for (let k = -bw / 2; k <= bw / 2; k++) items.set(bx - bw / 2 + k, y - j, books[i % 4][j === bh - 1 ? 3 : 1]);
        y -= bh;
    }
    sc.addStatic(b);
    sc.addStatic(items);
    sc.addStatic(cb);
    // Steam from the mug, and rain running down the glass when it rains outside.
    const steam = roomSlot([200, 200, 205], 0.4), drop = sc.slot({ k: 'mat', c: hex('#c8d8e8'), d: 0 }), trail = sc.slot({ k: 'mat', c: hex('#8aa0b8'), d: 0 });
    const drops = Array.from({ length: 70 }, () => ({ x: rng.int(wx0, wx1), y: rng.range(wy0, wy1), v: rng.range(0.5, 6), ph: rng() * 10 }));
    sc.addFn((f, t) => {
        const put = putter(f, W, H);
        for (let i = 0; i < 6; i++) {
            const age = (t * 0.3 + i / 6) % 1;
            if (bayer(i, Math.floor(t * 4)) < 1 - age) put(mx + Math.sin(age * 6 + i) * 1.5, sy - mh - 2 - age * mh * 2.5, steam);
        }
        const wx = sc.wx, wet = kind => kind === 'rain' || kind === 'storm';
        const rain = wx ? (wet(wx.cur) ? (wx.prev ? wx.p : 1) : 0) + (wx.prev && wet(wx.prev) ? 1 - wx.p : 0) : 0;
        if (rain <= 0) return;
        const n = Math.floor(drops.length * rain);
        for (let i = 0; i < n; i++) {
            const d = drops[i], y = wy0 + ((d.y - wy0 + t * d.v + d.ph) % (wy1 - wy0));
            if (Math.abs(d.x - (wx0 + wx1) / 2) < ft || Math.abs(y - (wy0 + (wy1 - wy0) * 0.36)) < ft / 2) continue;
            put(d.x, y, drop);
            if (d.v > 2) for (let j = 1; j < 4; j++) put(d.x, y - j, trail);
        }
    });
}

// ---------------------------------------------------------------- underwater

function reef(sc, rng) {
    const { W, H, U } = sc, floorY = sc.horizon = sc.horizonAt(rng.range(0.66, 0.76));
    sc.climate = 'dry';
    // Light from the surface, the water deepening to blue below and with distance.
    sc.relight = (L) => {
        const day = L.day;
        L.skyTop = mix([10, 30, 60], [110, 210, 220], day);
        L.skyHor = mix([4, 10, 30], [20, 80, 130], day);
        L.haze = mix([4, 12, 32], [24, 96, 140], day);
        L.tint = mix([0.25, 0.32, 0.5], [0.7, 0.92, 1], day);
        L.stars = 0; L.fog = 0.18; L.veil = 1;
    };
    sky(sc);
    const ray = sc.slot({ k: 'sky', v: -0.35 }), surf = sc.slot({ k: 'sky', v: -0.6 }), s = seedOf(rng);
    sc.addFn((f, t, L) => {
        // The rippling surface, and shafts of light swaying down from it.
        const put = putter(f, W, H);
        for (let x = 0; x < W; x++) {
            const y = 3 + Math.sin(x * 0.12 + t * 1.3) * 1.3 + Math.sin(x * 0.05 - t * 0.7) * 1.5;
            for (let j = 0; j <= y; j++) put(x, j, surf);
        }
        if (L.day < 0.1) return;
        for (let i = 0; i < 6; i++) {
            const x0 = W * hash(i, 1, s) + Math.sin(t * 0.2 + i) * 10, w = 4 + hash(i, 2, s) * 12, slope = 0.25 + hash(i, 3, s) * 0.2;
            for (let y = 4; y < floorY; y++) {
                const fade = (1 - y / floorY) * L.day * (0.5 + 0.5 * Math.sin(t * 0.4 + i * 2));
                for (let k = 0; k < w; k++) {
                    const x = Math.round(x0 + y * slope + k);
                    if (x >= 0 && x < W && bayer(x, y) < fade * 0.45 * Math.sin(Math.PI * k / w)) f[y * W + x] = ray;
                }
            }
        }
    });
    // Far rocks fading into the blue.
    mountains(sc, rng, { d: 0.6, base: floorY + 2, top: floorY - U * rng.range(0.08, 0.2), ramp: P.rock, freq: 0.015, mist: 10, env: envelope(rng) });
    ground(sc, floorY, Q.sand, 0.1);
    const sand = new Buf(W, H), S = sc.ramp(Q.sand, 0.05);
    for (let y = floorY; y < H; y++) {
        const z = Math.log(1 + (y - floorY) * 0.15) * 6;
        for (let x = 0; x < W; x++) sand.set(x, y, S.flat(clamp(Math.floor(fbm2(x * 0.03, z, s + 1, 3) * 4.2 - 0.6 + Math.sin(x * 0.2 + z * 3) * 0.3), 0, 3)));
    }
    sc.addStatic(sand);
    // Caustics: the surface's light shimmering on the sand.
    const glint = S.flat(3);
    sc.addFn((f, t, L) => {
        if (L.day < 0.15) return;
        for (let y = floorY + 1; y < H; y++) for (let x = 0; x < W; x++) {
            const n = Math.abs(noise2(x * 0.12, (y - floorY) * 0.3 + t * 0.4, s + 2) - noise2(x * 0.09 - t * 0.3, (y - floorY) * 0.22, s + 3));
            if (n < 0.03 && bayer(x, y) < L.day) f[y * W + x] = glint;
        }
    });
    // Coral and rocks on the floor, kelp swaying above them.
    const cb = new Buf(W, H), sb = new Buf(W, H, { sway: true });
    for (let i = rng.int(14, 28); i > 0; i--) {
        const p = rng.range(0.05, 1), x = rng.range(0, W), by = floorY + (H - floorY) * p, sz = (5 + p * U * 0.2) * rng.range(0.6, 1.2), C = sc.ramp(rng.pick(Q.coral), 0.25 * (1 - p));
        const kind = pick(rng, ['branch', 1.2], ['fan', 1], ['brain', 1], ['rock', 0.35]);
        if (kind === 'rock') rock(cb, x, by, sz * 0.6, sc.ramp(P.rock, 0.25 * (1 - p)), rng);
        else if (kind === 'brain') {
            for (let y = -sz * 0.6; y <= 0; y++) for (let k = -sz * 0.7; k <= sz * 0.7; k++) if ((k / (sz * 0.7)) ** 2 + (y / (sz * 0.6)) ** 2 <= 1) cb.set(x + k, by + y, C.face(k < 0 ? -1 : 1, Math.sin(k * 1.3 + Math.cos(y * 0.9) * 2) > 0 ? 1 : 0));
        } else if (kind === 'fan') {
            for (let a = -Math.PI; a < 0; a += 0.04) for (let r = 0; r < sz; r += 1) if ((Math.round(r) % 3 === 0 || Math.round(a * 20) % 3 === 0) && hash(Math.round(a * 30), Math.round(r), 5) < 0.9) cb.set(x + Math.cos(a) * r * 0.8, by + Math.sin(a) * r, C.face(Math.cos(a) < 0 ? -1 : 1, r > sz * 0.5 ? 1 : 0));
        } else {
            const branch = (bx, byy, a, len, w, dpt) => {
                for (let k = 0; k <= len; k++) for (let i2 = 0; i2 < w; i2++) cb.set(bx + Math.cos(a) * k + i2, byy + Math.sin(a) * k, C.face(i2 ? 1 : -1, k > len * 0.6 ? 1 : 0));
                if (dpt > 0) for (let j = rng.int(2, 3); j > 0; j--) branch(bx + Math.cos(a) * len, byy + Math.sin(a) * len, a + rng.range(-0.6, 0.6), len * 0.65, Math.max(1, w - 1), dpt - 1);
            };
            branch(x, by, -Math.PI / 2 + rng.range(-0.3, 0.3), sz * 0.45, Math.max(1, Math.round(sz / 8)), 3);
        }
    }
    const K = sc.ramp(Q.kelp, 0);
    for (let i = rng.int(6, 16); i > 0; i--) {
        const x = Math.round(rng.range(0, W)), p = rng.range(0.2, 1), by = floorY + (H - floorY) * p, len = U * rng.range(0.3, 0.8) * (0.4 + p * 0.6), w = Math.max(1, Math.round(p * 3));
        // A stalk with blade-like fronds, thicker nearer the viewer.
        for (let j = 0; j < len; j++) {
            const wt = Math.round(255 * j / len), cx = x + Math.sin(j * 0.12 + i) * 2;
            for (let k = 0; k < w; k++) sb.set(cx + k, by - j, K.face(k < w / 2 ? -1 : 1, 1), wt, x);
            if (j % 4 === 1 && j > 2) {
                const dir = (j >> 2) % 2 ? 1 : -1, fl = 2 + p * 6 * (1 - j / len * 0.5);
                for (let l = 1; l <= fl; l++) sb.set(cx + (dir > 0 ? w - 1 : 0) + dir * l, by - j - l * 0.6, K.flat(l < fl * 0.5 ? 2 : 3), wt, x);
            }
        }
    }
    sc.addStatic(cb);
    sc.addSway(sb, 1.2);
    // Shoals crossing, bubbles rising, and at night jellyfish glowing.
    const fishC = ['#f0c040', '#ff8a4a', '#a0e0ff', '#ffffff'].map(c => sc.slot({ k: 'mat', c: hex(c), d: 0.1 })), bub = sc.slot({ k: 'mat', c: hex('#d8f4ff'), d: 0 });
    const jelly = [sc.slot({ k: 'flame', c: hex('#ff8ad8') }), sc.slot({ k: 'flame', c: hex('#8a4a9a') })];
    const shoals = Array.from({ length: rng.int(1, 3) }, () => ({ y: floorY * rng.range(0.3, 0.9), v: rng.range(4, 10) * (rng.chance(0.5) ? 1 : -1), ph: rng() * W, c: rng.pick(fishC), n: rng.int(6, 16), sp: rng() * 100 }));
    const vents = Array.from({ length: rng.int(1, 3) }, () => ({ x: rng.range(0, W), y: floorY + (H - floorY) * rng.range(0.1, 0.8) }));
    const jellies = Array.from({ length: rng.int(2, 5) }, () => ({ x: rng.range(0, W), y: rng.range(floorY * 0.2, floorY * 0.9), ph: rng() * 6 }));
    sc.addFn((f, t, L) => {
        const put = putter(f, W, H);
        for (const sh of shoals) {
            const cx = ((sh.ph + t * sh.v) % (W + 60) + W + 60) % (W + 60) - 30, dir = Math.sign(sh.v);
            for (let i = 0; i < sh.n; i++) {
                const x = cx + (hash(i, 1, sh.sp) - 0.5) * 30 + Math.sin(t * 2 + i) * 1.5, y = sh.y + (hash(i, 2, sh.sp) - 0.5) * 14 + Math.sin(t * 1.3 + i) * 1;
                put(x, y, sh.c); put(x - dir, y, sh.c); put(x - 2 * dir, y - 1, sh.c); put(x - 2 * dir, y + 1, sh.c);
            }
        }
        for (const v of vents) for (let i = 0; i < 6; i++) {
            const age = (t * 0.25 + i / 6 + v.x) % 1;
            put(v.x + Math.sin(age * 12 + i) * 2, v.y - age * v.y, bub);
        }
        if (L.day > 0.5) return;
        for (const j of jellies) {
            const y = j.y + Math.sin(t * 0.3 + j.ph) * 8, x = j.x + Math.sin(t * 0.1 + j.ph) * 6, pulse = 2.5 + Math.sin(t * 2 + j.ph) * 0.6;
            for (let k = -pulse; k <= pulse; k++) for (let m = 0; m < pulse * 0.7; m++) if ((k / pulse) ** 2 + (m / (pulse * 0.7)) ** 2 <= 1) put(x + k, y - m, jelly[0]);
            for (let k = -2; k <= 2; k += 2) for (let m = 1; m < 6; m++) put(x + k + Math.sin(t * 2 + m + k) * 0.6, y + m, jelly[1]);
        }
    });
}

export const PLACES = { harbour, jungle, ruins, cave, room, reef };
export const PLACE_HOURS = { harbour: 20.5, jungle: 9.5, ruins: 17.5, cave: 13, room: 20, reef: 11 };
