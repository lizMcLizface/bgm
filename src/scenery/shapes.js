// Procedural building blocks. Each adds one or more layers to a Scene.
import { Buf, REFLECT, VEIL } from './scene.js';
import { bayer, clamp, fbm1, fbm2, hash, noise1, noise2, quant } from './noise.js';

export const seedOf = rng => rng.int(0, 1e6);

export function sky(sc) {
    const { W, H } = sc, N = 8, b = new Buf(W, H);
    const slots = Array.from({ length: N }, (_, k) => sc.slot({ k: 'sky', v: k / (N - 1) }));
    for (let y = 0; y < H; y++) {
        const v = clamp(y / sc.horizon) ** 1.4;
        for (let x = 0; x < W; x++) b.set(x, y, slots[quant(v, N, x, y)]);
    }
    sc.addStatic(b, { sky: true });
}

function disc(f, W, H, cx, cy, r, fn) {
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
            const x = Math.round(cx) + dx, y = Math.round(cy) + dy;
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const v = fn(Math.hypot(dx, dy), dx, dy, x, y);
            if (v) f[y * W + x] = v;
        }
    }
}

export function celestial(sc, rng, { count = 90 } = {}) {
    const { W, H } = sc;
    const dim = sc.slot({ k: 'star', v: 0.5 }), bright = sc.slot({ k: 'star', v: 1 });
    const sun = sc.slot({ k: 'sun' });
    const glow = [sc.slot({ k: 'glow', v: 0.3 }), sc.slot({ k: 'glow', v: 0.6 })];
    const moon = [sc.slot({ k: 'moon', v: 0.3 }), sc.slot({ k: 'moon', v: 1 })];
    const stars = Array.from({ length: count }, () => ({
        x: rng.int(0, W - 1), y: Math.floor(rng() ** 1.4 * sc.horizon * 0.85), b: rng.chance(0.18),
    }));
    const seed = seedOf(rng);
    sc.addFn((f, t, L) => {
        if (L.stars > 0.02) {
            stars.forEach((s, i) => {
                if (hash(i, Math.floor(t * 1.3 + i * 0.37), seed) < 0.1) return;
                f[s.y * W + s.x] = s.b ? bright : dim;
            });
        }
        if (L.moonElev > -0.1 && L.veil < 0.6) {
            const [mx, my] = L.moonPx;
            disc(f, W, H, mx, my, 4.6, (d, dx, dy) => d <= 4.6 && (dx + dy > 2 || hash(dx, dy, 7) < 0.2 ? moon[0] : moon[1]));
        }
        // Skipped when covered: layers drawn after the water (cliffs) would
        // otherwise leave the sun in its mirror image.
        if (L.sunElev > -0.12 && L.veil < 0.6 && !L.sunHidden) {
            const [sx, sy] = L.sunPx, r = 5.2, rg = r * 2.6;
            disc(f, W, H, sx, sy, rg, (d, dx, dy, x, y) => {
                if (d <= r) return sun;
                const g = (1 - (d - r) / (rg - r)) * L.glow;
                return g > bayer(x, y) ? glow[g > 0.55 ? 1 : 0] : 0;
            });
        }
    });
}

// Union of spheres seen from the front: per-pixel depth, owning sphere and the
// surface normal. Creases between spheres shade themselves, which is what makes
// cumulus and leafy canopies read as clumps rather than flat blobs.
export function sphereField(spheres, light = [-0.35, -0.8, 0.5]) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of spheres) {
        x0 = Math.min(x0, s.x - s.r); y0 = Math.min(y0, s.y - s.r);
        x1 = Math.max(x1, s.x + s.r); y1 = Math.max(y1, s.y + s.r);
    }
    x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1;
    const w = Math.ceil(x1) - x0 + 2, h = Math.ceil(y1) - y0 + 2;
    const z = new Float32Array(w * h).fill(-1), id = new Int16Array(w * h).fill(-1);
    spheres.forEach((s, k) => {
        for (let j = Math.floor(s.y - s.r - y0); j <= Math.ceil(s.y + s.r - y0); j++) {
            for (let i = Math.floor(s.x - s.r - x0); i <= Math.ceil(s.x + s.r - x0); i++) {
                const dx = i + x0 - s.x, dy = j + y0 - s.y, q = s.r * s.r - dx * dx - dy * dy;
                if (q < 0 || i < 0 || j < 0 || i >= w || j >= h) continue;
                const zz = Math.sqrt(q) + (s.z || 0), o = j * w + i;
                if (zz > z[o]) { z[o] = zz; id[o] = k; }
            }
        }
    });
    const ln = Math.hypot(...light), L = light.map(v => v / ln);
    const nx = new Float32Array(w * h), ny = new Float32Array(w * h), shade = new Float32Array(w * h);
    const at = (i, j) => (i < 0 || j < 0 || i >= w || j >= h || z[j * w + i] < 0 ? 0 : z[j * w + i]);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const o = j * w + i;
            if (id[o] < 0) continue;
            const gx = (at(i + 1, j) - at(i - 1, j)) / 2, gy = (at(i, j + 1) - at(i, j - 1)) / 2;
            const n = Math.hypot(gx, gy, 1);
            nx[o] = -gx / n; ny[o] = -gy / n;
            shade[o] = nx[o] * L[0] + ny[o] * L[1] + L[2] / n;
        }
    }
    return { x0, y0, w, h, id, nx, ny, shade };
}

// Cumulus: a few big lobes along a flat base, cauliflower clumps on top.
function cloud(b, cx, base, w, h, slots, rng) {
    const lobes = [], nl = Math.max(2, Math.round(w / 20));
    for (let i = 0; i < nl; i++) {
        const u = (i + rng.range(0.2, 0.8)) / nl, bell = Math.sin(Math.PI * u);
        const r = Math.max(3, h * (0.35 + 0.65 * bell) * rng.range(0.7, 1));
        lobes.push({ x: cx - w / 2 + u * w, y: base - r * 0.4, r, z: 0 });
    }
    const spheres = [...lobes];
    for (let k = Math.round(w / 3); k > 0; k--) {
        const L = rng.pick(lobes), a = -Math.PI * rng.range(0.06, 0.94);
        spheres.push({ x: L.x + Math.cos(a) * L.r * 0.8, y: L.y + Math.sin(a) * L.r * 0.8, r: L.r * rng.range(0.2, 0.42), z: L.r * 0.55 });
    }
    const F = sphereField(spheres);
    for (let j = 0; j < F.h; j++) {
        const y = F.y0 + j;
        if (y > base) continue;
        for (let i = 0; i < F.w; i++) {
            const o = j * F.w + i;
            if (F.id[o] < 0) continue;
            const x = F.x0 + i;
            let v = 0.15 + F.shade[o] * 0.8 + (base - y) / h * 0.12 + (hash(x, y, 9) - 0.5) * 0.08;
            if (y > base - 2) v -= 0.25;
            b.set(x, y, slots[clamp(Math.floor(v * 4), 0, 3)]);
        }
    }
}

export function cumulus(sc, rng, { n, y0, y1, w0, w1, d = 0.2, speed = 1, tall = [0.3, 0.45] }) {
    const { W, H } = sc, b = new Buf(W * 2, H, { wrap: true });
    const slots = [0, 1, 2, 3].map(v => sc.slot({ k: 'cloud', v: v / 3, d }));
    for (let i = 0; i < n; i++) {
        const w = rng.range(w0, w1);
        cloud(b, rng() * W * 2, rng.range(y0, y1), w, w * rng.range(tall[0], tall[1]), slots, rng);
    }
    sc.addDrift(b, speed);
}

// Long wind-streaked cloud banks (dusk / overcast).
export function stratus(sc, rng, { y0, y1, d = 0.2, speed = 1, cover = 0.5, cells = 9, fy = 0.1 }) {
    const { W, H } = sc, bw = W * 2, b = new Buf(bw, H, { wrap: true });
    const slots = [0, 1, 2, 3].map(v => sc.slot({ k: 'cloud', v: v / 3, d }));
    const s = seedOf(rng), fx = cells / bw;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, y1); y++) {
        const band = Math.sin(Math.PI * (y - y0) / (y1 - y0));
        for (let x = 0; x < bw; x++) {
            const n = fbm2(x * fx, y * fy, s, 5, cells);
            const thr = 1 - cover * band;
            if (n * 0.5 + 0.5 * band * n < thr * 0.62) continue;
            const shade = fbm2(x * fx * 2, y * fy * 1.6 - 3, s + 5, 3, cells * 2);
            b.set(x, y, slots[quant(shade * 1.4 - 0.25 + (y - y0) / (y1 - y0) * 0.25, 4, x, y)]);
        }
    }
    sc.addDrift(b, speed);
}

function normalised(raw) {
    let lo = Infinity, hi = -Infinity;
    for (const v of raw) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    return raw.map(v => (v - lo) / (hi - lo || 1));
}

function blur(a, r) {
    return a.map((_, x) => {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) { const v = a[x + k]; if (v !== undefined) { s += v; n++; } }
        return s / n;
    });
}

// Mountain range. The skyline is noise with its slopes limited and tips
// rounded; faces are shaded from an elevation field in which the skyline's
// broad shape dominates near the top and spurs (stretched ridged noise, leaning
// downhill) take over lower down, so facets read as ridges and gullies.
export function mountains(sc, rng, o) {
    const { W, H } = sc, b = new Buf(W, H);
    const R = sc.ramp(o.ramp, o.d), M = sc.ramp(o.ramp, o.d + 0.25);
    const S = o.snow && sc.ramp(o.snow, o.d), SM = o.snow && sc.ramp(o.snow, o.d + 0.25);
    const s = seedOf(rng), f = o.freq ?? 0.012;
    const raw = Float32Array.from({ length: W }, (_, x) => {
        const broad = fbm1(x * f, s, 3);
        const ridged = 1 - Math.abs(2 * fbm1(x * f * 2.1, s + 1, 3) - 1);
        return 0.6 * broad + 0.4 * ridged;
    });
    let h = normalised(raw).map((v, x) => o.base - (o.base - o.top) * v ** (o.sharp ?? 1.15) * (o.env ? o.env(x / W) : 1));
    // Limit slopes (with a wandering limit so flanks aren't straight lines),
    // round the tips, then add shoulders and crags back onto the skyline.
    const talus = x => (o.talus ?? 1.2) * (0.6 + 0.9 * noise1(x * 0.04, s + 7));
    for (let x = 1; x < W; x++) h[x] = Math.max(h[x], h[x - 1] - talus(x));
    for (let x = W - 2; x >= 0; x--) h[x] = Math.max(h[x], h[x + 1] - talus(x));
    const crag = (o.base - o.top) * 0.07;
    h = blur(h, 3).map((v, x) => v + (fbm1(x * 0.07, s + 8, 3) - 0.5) * crag * 2 + (noise1(x * 0.5, s + 5) - 0.5) * 1.4);
    const hs = blur(h, 9);
    const spur = o.spur ?? 30;
    const elev = (x, y) => {
        const dd = y - h[clamp(x, 0, W - 1)];
        const lean = (hs[clamp(x + 3, 0, W - 1)] - hs[clamp(x - 3, 0, W - 1)]) / 6;
        const r = 1 - Math.abs(2 * fbm2((x - lean * dd * 0.9) * 0.05, y * 0.02, s + 2, 2) - 1);
        return -hs[clamp(x, 0, W - 1)] + spur * r * clamp(dd / 6);
    };
    const snowLine = o.top + (o.base - o.top) * (o.snowAt ?? 0.4);
    const mist = o.mist ?? 0;
    for (let x = 0; x < W; x++) {
        if (h[x] > o.base - 2.5) continue;
        for (let y = Math.max(0, Math.floor(h[x])); y <= Math.min(H - 1, o.base + 1); y++) {
            const dd = y - h[x];
            const gx = elev(x + 1, y) - elev(x - 1, y);
            const side = gx >= 0 ? -1 : 1;
            const lv = dd < 1 || Math.abs(gx) < 1.1 ? 1 : 0;
            const snowy = S && y < snowLine + (noise2(x * 0.12, y * 0.1, s + 6) - 0.5) * 10 && dd < (snowLine - h[x]) * 0.9 + 2;
            const m = mist ? (y - (o.base - mist)) / mist : -1;
            const misty = m > 0 && bayer(x, y) < m * 0.9;
            const ramp = snowy ? (misty ? SM : S) : (misty ? M : R);
            b.set(x, y, ramp.face(side, lv));
        }
    }
    sc.addStatic(b);
    return h;
}

// Smooth hill band with field stripes, a lit rim and valley mist at its foot.
export function hill(sc, rng, o) {
    const { W, H } = sc, b = new Buf(W, H, { rank: true });
    const R = sc.ramp(o.ramp, o.d), M = sc.ramp(o.ramp, o.d + 0.22);
    const s = seedOf(rng), f = o.freq ?? 0.008;
    const h = Float32Array.from({ length: W }, (_, x) => o.y - o.amp * (fbm1(x * f, s, 3) * 1.6 - 0.3));
    const bottom = Math.min(H - 1, o.bottom ?? H - 1);
    for (let x = 0; x < W; x++) {
        const slope = h[Math.min(W - 1, x + 3)] - h[Math.max(0, x - 3)];
        for (let y = Math.max(0, Math.ceil(h[x])); y <= bottom; y++) {
            const dd = y - h[x];
            const side = slope + (noise2(x * 0.04, y * 0.08, s + 2) - 0.5) * 0.9 >= 0 ? 1 : -1;
            let lv = fbm2(x * 0.025, dd * 0.16, s + 1, 3) > 0.55 ? 1 : 0;
            if (dd < 1.2) lv = 1;
            const m = o.mist ? (dd - o.mist[0]) / o.mist[1] : -1;
            b.set(x, y, (m > 0 && bayer(x, y) < m ? M : R).face(side, lv));
        }
    }
    o.trees?.(b, h);
    sc.addStatic(b);
    return h;
}

// Ridge made of round canopy bumps (deciduous forest seen from afar).
export function canopyRidge(sc, rng, o) {
    const { W, H } = sc, b = new Buf(W, H);
    const R = sc.ramp(o.ramp, o.d);
    const s = seedOf(rng);
    const h = Float32Array.from({ length: W }, (_, x) => o.base - (o.base - o.top) * (0.2 + 0.8 * fbm1(x * (o.freq ?? 0.015), s, 3)));
    for (let x = 0; x < W; x++) {
        for (let y = Math.ceil(h[x] + o.rmax * 0.4); y <= o.bottom; y++) b.set(x, y, R.flat(0));
    }
    const bumps = [];
    for (let row = 0; row < (o.rows ?? 3); row++) {
        for (let x = -o.rmax; x < W + o.rmax; x += rng.range(o.rmin * 0.7, o.rmax * 1.1)) {
            const r = rng.range(o.rmin, o.rmax);
            bumps.push({ x, y: h[clamp(Math.round(x), 0, W - 1)] + r * 0.5 + row * r * 1.1 + rng.range(-1, 2), r });
        }
    }
    bumps.sort((a, c) => a.y - c.y);
    for (const c of bumps) {
        const Rr = Math.ceil(c.r);
        for (let dy = -Rr; dy <= Rr; dy++) {
            for (let dx = -Rr; dx <= Rr; dx++) {
                const d2 = dx * dx + dy * dy;
                if (d2 > c.r * c.r) continue;
                const x = Math.round(c.x) + dx, y = Math.round(c.y) + dy;
                if (y > o.bottom) continue;
                const ny = dy / c.r;
                const lv = ny < -0.2 + (hash(x, y, s) - 0.5) * 0.5 ? 1 : 0;
                b.set(x, y, R.face(dx < 0 ? -1 : 1, lv));
            }
        }
    }
    sc.addStatic(b);
    return h;
}

export function conifer(b, cx, by, h, R, rng, { sway = 0, trunk } = {}) {
    const w = h * rng.range(0.3, 0.4);
    const tiers = Math.max(2, Math.round(h / rng.range(5, 9)));
    const th = Math.max(1, Math.round(h * 0.08));
    const top = by - h;
    const seams = Array.from({ length: tiers }, () => rng.range(-0.4, 0.4));
    for (let y = Math.round(top); y < by - th; y++) {
        const p = (y - top) / (h - th);
        const tier = Math.min(tiers - 1, Math.floor(p * tiers)), tp = (p * tiers) % 1;
        const hw = (0.1 + 0.9 * p) * w * 0.5 * (0.5 + 0.5 * tp) + (rng() - 0.5) * 1.3;
        const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
        // Whole tiers move together, so the bend steps where a narrow tier top
        // meets the skirt above it rather than tearing rows apart.
        const wt = sway ? Math.round(255 * Math.min(1, sway) * (1 - tier / tiers) ** 1.2) : 0;
        const seam = cx + seams[tier] * hw;
        for (let x = x0; x <= x1; x++) {
            const lv = tp < 0.3 || rng() < 0.12 ? 0 : 1;
            b.set(x, y, R.face(x < seam ? -1 : 1, lv), wt, cx);
        }
    }
    const tw = h > 50 ? 2 : 1;
    for (let y = Math.round(by - th); y <= by; y++) {
        for (let k = 0; k < tw; k++) b.set(Math.round(cx) + k - (tw >> 1), y, trunk ? trunk.face(k ? 1 : -1, 0) : R.flat(0));
    }
}

function limb(b, x0, y0, x1, y1, w, T, ax) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let k = 0; k <= n; k++) {
        const u = k / n, ww = Math.max(1, Math.round(w * (1 - u * 0.5)));
        const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
        for (let i = 0; i < ww; i++) b.set(x + i - (ww >> 1), y, T.face(i < ww / 2 ? -1 : 1, 0), 0, ax);
    }
}

// Leaf dab stamps by size: chunky clumps, a few leaning like single leaves.
const STAMPS = [
    [[[0, 0]]],
    [[[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 0]]],
    [[[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1]]],
    [[[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2], [2, 2]], [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]], [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2]], [[0, 0], [1, 0], [2, 0], [1, 1], [2, 1], [3, 1], [2, 2]]],
];

// Leafy tree (R from sc.leaves). A dome crown of clusters, each covered in
// leaf dabs that carry their surface normal so the crown relights with the
// sun. Inside is deep shade with branches showing through the gaps; the rim
// is ragged with dabs missing and a few strays. Each cluster sways as one.
// Returns the crown's extent (for falling leaves).
// `shape`: 'dome' (oak-like), 'umbrella' (acacia: tall bare trunk, wide flat
// crown) or 'tall' (poplar-like column).
export function blobTree(b, cx, by, h, R, T, rng, { sway = 0, shape = 'dome' } = {}) {
    cx = Math.round(cx);
    const umbrella = shape === 'umbrella', tall = shape === 'tall';
    const lean = rng.range(-0.15, 0.15), th = h * (umbrella ? rng.range(0.5, 0.62) : rng.range(0.28, 0.38));
    const cw = h * (umbrella ? rng.range(0.6, 0.8) : tall ? rng.range(0.16, 0.22) : rng.range(0.42, 0.56));
    const ch = h * (umbrella ? rng.range(0.12, 0.17) : tall ? rng.range(0.4, 0.48) : rng.range(0.3, 0.38));
    const ccx = cx + lean * th + rng.range(-0.1, 0.1) * cw, ccy = by - th - ch * 0.85;
    const clusters = [{ x: ccx, y: ccy, r: ch * 0.8, z: 0 }];
    for (let i = umbrella ? Math.round(cw / ch * 2.2) : clamp(Math.round(h / 7), 2, 13); i > 0; i--) {
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * 0.72;
        // An acacia's crown is a flat layer of overlapping pads.
        const r = umbrella ? ch * rng.range(0.75, 1.05) : (0.32 + 0.26 * rng()) * Math.min(cw, ch * 1.3);
        clusters.push({ x: ccx + Math.cos(a) * d * cw, y: ccy + Math.sin(a) * d * ch * (umbrella ? 0.4 : 0.85), r, z: rng.range(-0.25, 0.25) * cw });
    }
    const weight = c => (sway ? Math.round(255 * Math.min(1, sway) * clamp((by - th - c.y) / (ch * 2), 0.25, 1)) : 0);

    // Trunk: leaning, tapering, flared at the root.
    const tw = Math.max(1, Math.round(h / (umbrella ? 17 : 11))), crownBase = ccy + ch * 0.3;
    for (let y = Math.round(by); y >= crownBase; y--) {
        const u = (by - y) / (by - crownBase), w = Math.max(1, Math.round(tw * (1 - 0.4 * u))) + (by - y < 2 && h > 25 ? 2 : 0);
        const x0 = Math.round(cx + lean * (by - y) - w / 2);
        for (let k = 0; k < w; k++) b.set(x0 + k, y, T.face(k < w / 2 ? -1 : 1, k === 0 || k === w - 1 ? 0 : 1), 0, cx);
    }
    // Deep shade inside the crown, then limbs reaching into it.
    for (const c of clusters) {
        const r = c.r * 0.72, wt = weight(c);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const x = c.x + dx, y = c.y + dy * 0.9;
            b.set(x, y, R.at(dx / r, dy / r, 0.5, 0), wt, cx, 1 + Math.floor(hash(Math.round(x) >> 1, Math.round(y) >> 1, cx) * 254));
        }
    }
    // Branch skeleton: a limb to each cluster, forking into twigs that fill
    // it. Hidden in summer except through gaps; the silhouette in winter.
    if (h > 10) {
        const sx = cx + lean * th, sy = crownBase, cap = T.regroup?.('snowcap').flat(1), wood = [];
        // Twigs stay inside the cluster they grow into, so none poke out of a full crown.
        const grow = (x, y, a, len, w, depth, c) => {
            let ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
            while (len >= 2 && Math.hypot(ex - c.x, ey - c.y) > c.r * 0.85 && Math.hypot(x - c.x, y - c.y) <= c.r) {
                len *= 0.8; ex = x + Math.cos(a) * len; ey = y + Math.sin(a) * len;
            }
            const n = Math.ceil(len);
            for (let k = 0; k <= n; k++) {
                const u = k / n, ww = Math.max(1, Math.round(w * (1 - u * 0.35))), px = x + (ex - x) * u, py = y + (ey - y) * u;
                for (let i = 0; i < ww; i++) {
                    b.set(px + i - (ww >> 1), py, T.face(i < ww / 2 ? -1 : 1, 0), 0, cx);
                    wood.push(Math.round(px + i - (ww >> 1)), Math.round(py));
                }
            }
            if (depth <= 0 || len < 2.5) return;
            for (let k = rng.int(2, 3); k > 0; k--) grow(ex, ey, a + rng.range(-0.75, 0.75), len * rng.range(0.45, 0.65), Math.max(1, w * 0.65), depth - 1, c);
        };
        const depth = h < 30 ? 1 : h < 70 ? 2 : 3;
        for (const c of clusters.slice(1)) {
            const dx = c.x - sx, dy = c.y - sy, d = Math.hypot(dx, dy);
            grow(sx, sy, Math.atan2(dy, dx), d * 0.75, Math.max(1, tw * 0.6), depth, c);
        }
        grow(sx, sy, -Math.PI / 2 + rng.range(-0.2, 0.2), (sy - ccy) * 0.9, Math.max(1, tw * 0.7), depth, clusters[0]);
        // Snow settles on every branch pixel with open sky above it.
        if (cap) for (let i = 0; i < wood.length; i += 2) if (!b.get(wood[i], wood[i + 1] - 1)) b.set(wood[i], wood[i + 1] - 1, cap, 0, cx);
    }
    // Leaf dabs on each cluster's front surface, painted back to front.
    const ds = h < 18 ? 0 : h < 45 ? 1 : h < 100 ? 2 : 3, size = ds + 1, dabs = [];
    for (const c of clusters) {
        const top = clamp((ccy - c.y) / ch + 0.5);
        for (let k = Math.round(Math.PI * c.r * c.r / (size * size) * 0.9); k > 0; k--) {
            const nz = Math.sqrt(rng()), ph = rng() * Math.PI * 2, sn = Math.sqrt(1 - nz * nz);
            const nx = sn * Math.cos(ph), ny = sn * Math.sin(ph);
            if (nz < 0.3 && rng() < 0.3) continue;   // gaps at the rim
            const o = clamp(Math.round(0.6 + top * 1.4 + nz * 0.9 - ny * 0.7 + rng.range(-0.5, 0.5)), 0, 3);
            const rr = c.r * (1 + rng.range(-0.1, 0.14) * (1 - nz));
            dabs.push({ x: c.x + nx * rr, y: c.y + ny * rr * 0.9, z: c.z + nz * c.r, n: [nx + rng.range(-0.25, 0.25), ny + rng.range(-0.25, 0.25), nz], o, c });
        }
    }
    for (let k = Math.round(h / 6); k > 0; k--) {
        const c = rng.pick(clusters), a = rng() * Math.PI * 2, d = c.r * rng.range(1.02, 1.2);
        dabs.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d * 0.9, z: c.z, n: [Math.cos(a), Math.sin(a), 0.3], o: 2, c });
    }
    dabs.sort((a, c) => a.z - c.z);
    for (const d of dabs) {
        const slot = R.at(d.n[0], d.n[1], d.n[2], d.o), wt = weight(d.c), rk = rng.int(1, 255);
        for (const [px, py] of rng.pick(STAMPS[ds])) b.set(Math.round(d.x - size / 2) + px, Math.round(d.y - size / 2) + py, slot, wt, cx, rk);
    }
    return { x: ccx, y: ccy, w: cw, h: ch, by };
}

export function blades(sb, rng, x, groundY, maxH, slots, flowers) {
    const h = rng.int(2, Math.max(2, Math.round(maxH)));
    const lean = rng.chance(0.5) ? 1 : -1;
    for (let k = 0; k < h; k++) {
        const bx = x + (k > h * 0.6 && h > 4 ? lean : 0);
        sb.set(bx, groundY - k, slots[k >= h - 1 ? 1 : 0], Math.round(255 * (k + 1) / h));
    }
    // Flowers carry a high leaf rank, so they only show while the year is green.
    if (flowers && rng.chance(0.06)) sb.set(x, groundY - h, rng.pick(flowers), 255, undefined, rng.int(205, 255));
}

// Reflective water from y0 down: mirrored frame rows with ripple, Fresnel
// fade to the water's own colour near the viewer, and drifting highlights.
// `mask` (a Buf) limits the water to its nonzero pixels, e.g. a river.
export function water(sc, rng, { y0, ramp, mix = 0.4, fres = 0.7, waves = 0.08, speed = 3, glitter = false, d = 0.08, mask = null }) {
    const { W, H } = sc, R = sc.ramp(ramp, d), s = seedOf(rng);
    sc.water = { k: 'mat', c: R.c[1], d: d + 0.1 };
    sc.reflectMix = mix;
    const deep = [0, 1, 2, 3].map(R.flat);
    const sun = sc.slot({ k: 'sun' });
    sc.addFn((f, t, L) => {
        for (let y = y0; y < H; y++) {
            const dy = y - y0, p = dy / (H - y0), sy = y0 - 1 - dy;
            const amp = 0.4 + p * 1.8;
            const rx = Math.round(Math.sin(dy * 0.7 + t * 1.3) * amp * 0.6 + Math.sin(dy * 0.23 - t * 0.7) * amp * 0.5);
            const zx = 0.11 / (0.25 + p * 1.6), drift = t * speed * (0.3 + p);
            const gw = glitter && L.sunElev > -0.05 && !L.sunHidden ? 2 + p * 26 : 0;
            for (let x = 0; x < W; x++) {
                if (mask && !mask.d[y * W + x]) continue;
                let v;
                if (sy >= 0 && bayer(x, y) >= p * fres) {
                    v = f[sy * W + clamp(x + rx, 0, W - 1)] % VEIL;
                    if (v < REFLECT) v += REFLECT;
                } else v = deep[noise2(x * zx * 0.5, y * 0.4, s + 1) > 0.5 ? 1 : 0];
                const n = noise2((x + drift) * zx, y * 0.85, s);
                if (n > 1 - waves) v = deep[3];
                else if (n < waves * 0.7) v = deep[0];
                if (gw && Math.abs(x - L.sunPx[0]) < gw && n > 0.62 && hash(x, y, Math.floor(t * 4)) > 0.55) v = sun;
                f[y * W + x] = v;
            }
        }
    });
}
