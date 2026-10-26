// Draft scene templates, in review in tools/scenery.html: a starship observation deck, a
// snowy village and a café. The deck looks out through one great window onto
// space; the café frames the street outside its window (drawn in front of the weather).
import { Buf, REFLECT } from './scene.js';
import { hex, mix, mul } from './lighting.js';
import { bayer, clamp, fbm1, fbm2, hash, lerp, noise2, smoothstep } from './noise.js';
import { celestial, conifer, mountains, seedOf, sky } from './shapes.js';
import { LIGHTS, P, envelope, ground, pick, weather } from './biomes.js';

const putter = (f, W, H) => (x, y, v) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H) f[y * W + x] = v;
};
const flame = (sc, c) => sc.slot({ k: 'flame', c: typeof c === 'string' ? hex(c) : c });

// ---------------------------------------------------------------- observation deck

const NEBULAE = [
    ['#160a24', '#30124a', '#6a2a84', '#b85aac'],
    ['#061c26', '#0c3644', '#186472', '#38aaa8'],
    ['#24100a', '#4a1e10', '#8a3a1c', '#d8743a'],
];
const WORLDS = {
    terran: { mats: ['#123a6a', '#3a6a3a', '#8a7a4a', '#e8f0f4', '#f4f6fa'], glow: '#7ab8ff' },
    gas: { mats: ['#c8a070', '#e0c494', '#a46a44', '#f0e0c0', '#8a5434'], glow: '#f0d8a8' },
    ice: { mats: ['#8ab8d8', '#c4e0f0', '#5a88b0', '#f0f8ff', '#3a6a94'], glow: '#c0e8ff' },
    lava: { mats: ['#2a2224', '#4a3a36', '#ff7a2a', '#6a5a50', '#ffcc5a'], glow: '#ff9a5a' },
};

// Looking out of a starship's observation deck: a window from wall to wall onto a nebula and a field
// of stars drifting slowly past as the ship orbits a planet that turns beneath it (oceans,
// clouds and city lights, a banded giant with rings, ice or lava), a moon, the odd shuttle.
// The deck's lights follow the ship's day: bright by day, dim blue with warm lamps at night.
function starship(sc, rng) {
    const { W, H, U } = sc, s = U / 216;
    const vx = Math.round(W * rng.range(0.45, 0.55)), vy = sc.horizon = sc.horizonAt(rng.range(0.38, 0.46));
    const hw = Math.round(W * rng.range(0.3, 0.36)), hh = Math.round(Math.min(H * 0.32, hw * (W < H ? 1.5 : 0.75)));
    sc.climate = 'dry';
    sc.relight = L => {
        L.skyTop = [2, 3, 8]; L.skyHor = [4, 6, 14]; L.haze = [10, 12, 22];
        L.stars = 1; L.veil = 0; L.fog = 0; L.contrast = 0.7;
        L.tint = mix([0.34, 0.36, 0.56], [0.92, 0.94, 1], L.day);
    };
    // Space: black, a nebula and two depths of stars, each drifting at its own pace.
    const base = new Buf(W, H), black = flame(sc, '#020308');
    base.d.fill(black);
    sc.addStatic(base, { sky: true });
    const ns = seedOf(rng), neb = rng.pick(NEBULAE).map(c => flame(sc, c)), neb2 = rng.pick(NEBULAE).map(c => flame(sc, c)), bw = Math.ceil(W * 2 / 64) * 64;
    const nb = new Buf(bw, H, { wrap: true });
    for (let y = 0; y < H; y++) for (let x = 0; x < bw; x++) {
        const n = fbm2(x / 48, y / 48, ns, 4, bw / 48), band = Math.exp(-(((y - vy + (fbm1(x / 96, ns + 1, 2, bw / 96) - 0.5) * H * 0.6) / (H * 0.3)) ** 2));
        const v = smoothstep(0.42, 0.85, n) * band;
        const lv = Math.floor(v * 4.5 + (bayer(x, y) - 0.5) * 0.8);
        if (lv > 0) nb.set(x, y, (fbm2(x / 80, y / 80, ns + 2, 2, bw / 80) > 0.5 ? neb : neb2)[Math.min(3, lv - 1)]);
    }
    sc.addDrift(nb, 0.12);
    const starC = ['#ffffff', '#cfe0ff', '#ffe8c0', '#ffb8a0', '#a8c8ff'].map(c => flame(sc, c)), dim = flame(sc, '#6a7088');
    for (const [speed, count, bright] of [[0.25, W * H * 0.004, 0.04], [0.6, W * H * 0.0015, 0.2]]) {
        const sb = new Buf(bw, H, { wrap: true });
        for (let i = 0; i < count * 2; i++) {
            const x = rng.int(0, bw - 1), y = rng.int(0, H - 1), c = rng.pick(starC);
            if (rng.chance(bright)) { sb.set(x, y, c); sb.set(x + 1, y, dim); sb.set(x - 1, y, dim); sb.set(x, y + 1, dim); sb.set(x, y - 1, dim); }
            else sb.set(x, y, rng.chance(0.6) ? dim : c);
        }
        sc.addDrift(sb, speed);
    }
    // The planet: a texture of longitude and latitude, turning; lit from one side, the
    // night side dark (with cities on a living world), a glowing rim of air on the day side.
    // A preset can pin the world (sc.look.world) and show open space with no deck around it (sc.look.open).
    const rolled = pick(rng, ['terran', 3], ['gas', 2], ['ice', 1], ['lava', 1]), kind = WORLDS[sc.look.world] ? sc.look.world : rolled, Wd = WORLDS[kind], open = !!sc.look.open;
    const big = rng.chance(0.55), R = big ? hw * rng.range(0.9, 1.4) : hh * rng.range(0.35, 0.55);
    const pcx = vx + rng.range(-0.5, 0.5) * hw, pcy = big ? vy + hh + R * rng.range(0.25, 0.6) : vy + rng.range(-0.25, 0.3) * hh;
    const la = rng.range(0.4, 2.7) * (rng.chance(0.5) ? 1 : -1), ld = [Math.sin(la), -0.35, Math.cos(la)], ln = Math.hypot(...ld), Ld = ld.map(v => v / ln);
    const TW = 256, TH = 128, tex = new Uint8Array(TW * TH), cloud = new Uint8Array(TW * TH), ts = seedOf(rng);
    for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
        const lat = (j / TH - 0.5) * Math.PI, u = i / TW * 8, v = j / TH * 4, n = fbm2(u, v, ts, 5, 8);
        let m;
        if (kind === 'terran') m = Math.abs(lat) > 1.25 + (n - 0.5) * 0.3 ? 3 : n > 0.53 ? (n > 0.62 ? 2 : 1) : 0;
        else if (kind === 'gas') { const b = Math.sin(lat * 9 + (n - 0.5) * 3); m = b > 0.6 ? 1 : b > 0 ? 0 : b > -0.6 ? 2 : 4; if (hash(i >> 3, j >> 3, ts) < 0.004) m = 3; }
        else if (kind === 'ice') m = n > 0.6 ? 3 : n > 0.48 ? 1 : n > 0.4 ? 0 : 2;
        else m = Math.abs(fbm2(u * 2, v * 2, ts + 3, 3, 16) - 0.5) < 0.03 ? 2 : n > 0.55 ? 3 : n < 0.38 ? 0 : 1;
        tex[j * TW + i] = m;
        cloud[j * TW + i] = kind === 'terran' && fbm2(u * 1.5, v * 2, ts + 1, 4, 12) > 0.56 ? 1 : 0;
    }
    const shadeK = [0.12, 0.35, 0.68, 1];
    const mats = Wd.mats.map(c => shadeK.map(k => flame(sc, mul(hex(c), [k, k, k]))));
    const cityLight = flame(sc, '#ffd47a'), lavaGlow = flame(sc, '#ff6a20'), rim = [flame(sc, Wd.glow), flame(sc, mul(hex(Wd.glow), [0.5, 0.5, 0.6]))];
    // Every pixel of the disc keeps its position on the sphere; each frame only looks up the texture.
    const px = [], lon0 = [], latI = [], lit = [], rimPx = [];
    const inBack = (x, y) => open || Math.abs(y - vy) < hh;
    for (let y = Math.max(0, Math.floor(pcy - R - 3)); y < Math.min(H, pcy + R + 3); y++) for (let x = Math.max(0, Math.floor(pcx - R - 3)); x < Math.min(W, pcx + R + 3); x++) {
        if (!inBack(x, y)) continue;
        const nx = (x + 0.5 - pcx) / R, ny = (y + 0.5 - pcy) / R, r2 = nx * nx + ny * ny;
        if (r2 > 1) {
            const d = Math.sqrt(r2) - 1;
            if (d * R < 2.5 && nx * Ld[0] + ny * Ld[1] > -0.1) rimPx.push(y * W + x, d * R < 1.2 ? 0 : 1);
            continue;
        }
        const nz = Math.sqrt(1 - r2), tilt = 0.25, ty = ny * Math.cos(tilt) - nx * Math.sin(tilt), tx = nx * Math.cos(tilt) + ny * Math.sin(tilt);
        px.push(y * W + x); lon0.push(Math.atan2(tx, nz)); latI.push(Math.round((Math.asin(clamp(ty, -1, 1)) / Math.PI + 0.5) * (TH - 1)));
        const l = nx * Ld[0] + ny * Ld[1] + nz * Ld[2];
        lit.push(clamp(Math.floor((l + 0.15) * 3.2 + bayer(x, y) * 0.8), 0, 3));
    }
    const P0 = Int32Array.from(px), LO = Float32Array.from(lon0), LA = Int32Array.from(latI), LT = Uint8Array.from(lit), RP = Int32Array.from(rimPx), spin = rng.range(0.004, 0.01);
    // A ringed giant: the far half of the rings behind the disc, the near half in front.
    const rings = kind === 'gas' && rng.chance(0.6) && { tilt: rng.range(0.15, 0.3), r0: 1.35, r1: rng.range(1.9, 2.3), c: ['#d8c4a0', '#a8946c', '#ece0c4'].map(c => [0.35, 1].map(k => flame(sc, mul(hex(c), [k, k, k])))) };
    const ringPx = [];
    if (rings) for (let y = Math.max(0, Math.floor(pcy - R * rings.r1 * rings.tilt - 2)); y < Math.min(H, pcy + R * rings.r1 * rings.tilt + 2); y++) for (let x = Math.max(0, Math.floor(pcx - R * rings.r1)); x < Math.min(W, pcx + R * rings.r1); x++) {
        if (!inBack(x, y)) continue;
        const u = (x - pcx) / R, v = (y - pcy) / (R * rings.tilt), r = Math.hypot(u, v);
        if (r < rings.r0 || r > rings.r1) continue;
        const band = Math.floor((r - rings.r0) * 9), gap = Math.abs(r - (rings.r0 + rings.r1) * 0.55) < 0.04;
        if (gap) continue;
        const front = v > 0, shadow = u * Ld[0] < 0 && Math.abs(v * rings.tilt) < 1 && Math.abs(u) < 1.2 && !front;
        ringPx.push(y * W + x, front ? 1 : 0, rings.c[band % 3][shadow ? 0 : 1]);
    }
    const RG = Int32Array.from(ringPx);
    const drawRings = (f, front) => { for (let k = 0; k < RG.length; k += 3) if (RG[k + 1] === front) f[RG[k]] = RG[k + 2]; };
    sc.addFn((f, t) => {
        drawRings(f, 0);
        const rot = t * spin, crot = t * spin * 1.4;
        for (let k = 0; k < P0.length; k++) {
            const li = LA[k] * TW, lon = LO[k] + rot, i = ((Math.floor((lon / (Math.PI * 2)) * TW) % TW) + TW) % TW;
            let m = tex[li + i], sh = LT[k];
            if (kind === 'terran') { const ci = ((Math.floor(((LO[k] + crot) / (Math.PI * 2)) * TW) % TW) + TW) % TW; if (cloud[li + ci]) m = 4; }
            if (sh === 0 && kind === 'terran' && (m === 1 || m === 2) && hash(P0[k], i >> 2, ts) < 0.035) { f[P0[k]] = cityLight; continue; }
            if (kind === 'lava' && m === 2) { f[P0[k]] = lavaGlow; continue; }
            f[P0[k]] = mats[m][sh];
        }
        for (let k = 0; k < RP.length; k += 2) f[RP[k]] = rim[RP[k + 1]];
        drawRings(f, 1);
    });
    // A moon, and now and then a shuttle crossing with its lights blinking.
    if (rng.chance(0.7)) {
        const mr = Math.max(3, Math.round(U * rng.range(0.02, 0.045))), mx = vx + rng.range(-0.8, 0.8) * hw, my = vy - rng.range(0.3, 0.8) * hh, mb = new Buf(W, H), ms = seedOf(rng);
        const mc = shadeK.map(k => flame(sc, mul(hex('#c8c4bc'), [k, k, k])));
        for (let y = -mr; y <= mr; y++) for (let x = -mr; x <= mr; x++) {
            const r2 = (x * x + y * y) / (mr * mr);
            if (r2 > 1 || !inBack(mx + x, my + y)) continue;
            const nz = Math.sqrt(1 - r2), l = (x / mr) * Ld[0] + (y / mr) * Ld[1] + nz * Ld[2];
            mb.set(mx + x, my + y, mc[clamp(Math.floor((l + 0.15) * 3.2 + bayer(x, y) * 0.8) - (noise2(x * 0.5, y * 0.5, ms) > 0.62 ? 1 : 0), 0, 3)]);
        }
        sc.addStatic(mb, { sky: true });
    }
    const hull = flame(sc, '#9aa0aa'), hullD = flame(sc, '#4a505a'), blinkR = flame(sc, '#ff3b30'), blinkG = flame(sc, '#4aff8a'), engine = flame(sc, '#7ad8ff');
    const sseed = rng.int(1, 1e6);
    sc.addFn((f, t) => {
        const k = Math.floor(t / 80);
        if (hash(k, 1, sseed) > 0.6) return;
        const p = (t - k * 80) / 30;
        if (p > 1) return;
        const dir = hash(k, 2, sseed) < 0.5 ? 1 : -1, y = vy + (hash(k, 3, sseed) - 0.6) * hh * 1.2, x = dir > 0 ? lerp(-10, W + 10, p) : lerp(W + 10, -10, p);
        const put = (xx, yy, v) => { if (inBack(xx, yy)) putter(f, W, H)(xx, yy, v); }, L = Math.max(5, Math.round(7 * s));
        for (let i = 0; i < L; i++) { put(x - dir * i, y, hull); put(x - dir * i, y + 1, hullD); }
        put(x - dir * L, y, engine); put(x - dir * (L + 1), y, engine);
        if (Math.floor(t * 2) % 2) { put(x - dir * 2, y - 1, blinkR); put(x - dir * (L - 2), y - 1, blinkG); }
    });
    if (open) return;
    // The deck: one great window from floor to ceiling and wall to wall, in tall panes;
    // strip lights in the ceiling, a polished floor mirroring the view.
    const wall = sc.ramp(['#1a1e26', '#242a34', '#3a4250', '#4e5868'], 0), floorR = sc.ramp(['#14161c', '#1c2028', '#2a303a', '#3a4250'], 0);
    const strip = flame(sc, '#bfe8ff'), stripDim = flame(sc, '#5a7a90');
    const ib = new Buf(W, H), ft = Math.max(3, Math.round(U * 0.02)), pw = 2 * hw / rng.int(3, 5), floorPx = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x + 0.5 - vx, dy = y + 0.5 - vy;
        if (Math.abs(dy) <= hh) {
            const ey = hh - Math.abs(dy), m = (((dx + hw) % pw) + pw) % pw, sd = Math.min(m, pw - m);
            if (ey < ft) ib.set(x, y, wall.face(dy < 0 ? 1 : -1, ey < 1 ? 0 : 1));
            else if (sd < ft * 0.5) ib.set(x, y, wall.flat(sd < 1 ? 3 : 1));
            continue;
        }
        const z = hh / Math.abs(dy), d = 1 / z, X = dx * z / hw;
        if (dy < 0) {
            // Ceiling panels with two strips of light running along the deck.
            const st = Math.abs(Math.abs(X) - 0.5) < 0.05;
            ib.set(x, y, st ? ((d * 3) % 1 < 0.85 ? strip : stripDim) : wall.flat((d * 3) % 1 < 0.05 || (X * 4 + 40) % 1 < 0.04 * d ? 0 : 1));
        } else {
            ib.set(x, y, floorR.flat((d * 3) % 1 < 0.05 || (X * 3 + 30) % 1 < 0.05 * d ? 0 : Math.abs(X) < 0.3 ? 2 : 1));
            // Polished: it mirrors the window above its far edge.
            const my = Math.round(2 * (vy + hh) - y);
            if (my >= 0 && bayer(x, y) < 0.45) floorPx.push(y * W + x, my * W + x);
        }
    }
    sc.addStatic(ib);
    sc.water = { k: 'mat', c: hex('#1c2028'), d: 0 };
    sc.reflectMix = 0.7;
    const FP = Int32Array.from(floorPx);
    sc.addFn(f => { for (let k = 0; k < FP.length; k += 2) { const v = f[FP[k + 1]]; if (v && v < REFLECT) f[FP[k]] = v + REFLECT; } });
}

// ---------------------------------------------------------------- snowy village

// A cottage on sloping ground: walls down to the ground under every column, half-timbering
// or plaster, small windows that glow at night, a steep roof that holds snow, a chimney.
// Returns where its chimney smokes.
function cottage(b, cx, foot, w, h, R, roof, beam, win, rng, timbered) {
    const x0 = Math.round(cx - w / 2), x1 = x0 + w - 1, eave = Math.round(Math.min(foot(x0), foot(x1)) - h);
    for (let x = x0; x <= x1; x++) for (let y = eave; y <= foot(x) + 1; y++) {
        const k = x - x0, t = timbered && (k === 0 || k === w - 1 || y === eave || (y - eave) === Math.round(h * 0.5) || (k % 6 === 3 && (y - eave) < h * 0.5));
        b.set(x, y, t ? beam : R.face(x < cx ? -1 : 1, 1));
    }
    // Windows with a cross of glazing bars, a door.
    for (let k = 2; k < w - 3; k += 5) for (const wy of [eave + 2, eave + Math.round(h * 0.5) + 2]) {
        if (wy + 3 > foot(x0 + k) - 1 || rng.chance(0.25)) continue;
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) b.set(x0 + k + i, wy + j, i === 1 || j === 1 ? beam : win);
    }
    const dx = x0 + Math.round(w * rng.range(0.3, 0.7));
    for (let y = foot(dx) - 4; y <= foot(dx); y++) for (let i = 0; i < 3; i++) b.set(dx + i, y, beam);
    // The roof, steep and overhanging.
    const rh = Math.round(w * rng.range(0.5, 0.7)), roofAt = x => eave - rh * (1 - Math.abs(x - cx) / (w / 2 + 2));
    for (let j = 0; j <= rh; j++) {
        const hw = (w / 2 + 2) * (1 - j / rh);
        for (let x = Math.round(cx - hw); x <= cx + hw; x++) b.set(x, eave - j, roof.face(x < cx ? -1 : 1, j === 0 ? 0 : 1));
    }
    const chx = Math.round(cx + (rng.chance(0.5) ? -1 : 1) * w * 0.25), cht = Math.round(roofAt(chx)) - 3;
    for (let y = cht; y < roofAt(chx) + 2; y++) for (let i = 0; i < 2; i++) b.set(chx + i, y, beam);
    return { x: chx + 0.5, y: cht - 1 };
}

// A church: a nave like a big cottage, and a tower with a spire and a clock face.
function church(sc, b, cx, foot, k, wall, roof, beam, win, rng) {
    const nw = Math.round(34 * k), tx = Math.round(cx - nw * 0.6), th = Math.round(44 * k), tw = Math.round(9 * k);
    cottage(b, cx, foot, nw, Math.round(14 * k), wall, roof, beam, win, rng, false);
    const tb = Math.min(foot(tx - tw), foot(tx + tw));
    for (let y = tb - th; y <= Math.max(foot(tx - tw), foot(tx + tw)); y++) for (let i = -tw / 2; i <= tw / 2; i++) b.set(tx + i, y, wall.face(i < 0 ? -1 : 1, 1));
    const sp = Math.round(th * 0.6);
    for (let j = 0; j < sp; j++) for (let i = -(tw / 2 + 1) * (1 - j / sp); i <= (tw / 2 + 1) * (1 - j / sp); i++) b.set(tx + i, tb - th - j, roof.face(i < 0 ? -1 : 1, 1));
    const cr = Math.max(1.5, 2.2 * k), cy = tb - th + 5 * k, face = sc.slot({ k: 'emit', c: hex('#fff4d6'), base: hex('#e8e4dc'), d: 0.12, v: 0.8 });
    for (let j = -cr; j <= cr; j++) for (let i = -cr; i <= cr; i++) if (i * i + j * j <= cr * cr) b.set(tx + i, cy + j, (i === 0 && j <= 0) || (j === 0 && i >= 0 && i < cr) ? beam : face);
    for (let j = 0; j < 3 * k; j++) b.set(tx, tb - th - sp - j, beam);
    return nw;
}

// A village on a hillside in the snow: cottages climbing the slope with smoking chimneys
// and windows warm at night, a church with a steeple and clock, lamps along the lane
// throwing pools of light on the snow, snowy pines, mountains behind, a fence in front.
function village(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.42, 0.52)), s = U / 216;
    sc.bias = rng.range(-0.4, 0.4);
    sc.climate = 'cold';
    sky(sc);
    celestial(sc, rng);
    weather(sc, hz, [['snow', 2.5], ['clear', 1.2], ['overcast', 1.2], ['fog', 0.6]]);
    mountains(sc, rng, { d: 0.5, base: hz + 4, top: hz - U * rng.range(0.2, 0.36), ramp: P.rock, snow: P.snow, snowAt: 0.6, freq: 0.01, mist: 10, env: envelope(rng) });
    const ms = seedOf(rng);
    // Forest on the lower slopes behind the village.
    const fb = new Buf(W, H), Fo = sc.ramp(P.forest, 0.3), ridge = x => hz + 2 - U * 0.05 * fbm1(x * 0.02, ms + 1, 2);
    for (let x = 0; x < W; x++) for (let y = Math.round(ridge(x)); y < hz + U * 0.1; y++) fb.set(x, y, Fo.flat(0));
    for (let x = -4; x < W + 4; x += rng.range(2, 4)) conifer(fb, x, ridge(clamp(Math.round(x), 0, W - 1)) + rng.range(2, 6), rng.range(8, 16) * s, Fo, rng);
    sc.addStatic(fb);
    // The hillside the village stands on, rising to one side.
    const up = rng.chance(0.5) ? 1 : -1, gs = seedOf(rng);
    const slope = x => hz + U * 0.08 + up * (x / W - 0.5) * U * 0.14 + (fbm1(x * 0.012, gs, 2) - 0.5) * U * 0.05;
    ground(sc, hz + U * 0.06, P.hill, 0.2);
    const hb = new Buf(W, H), G = sc.ramp(P.hill, 0.15);
    for (let x = 0; x < W; x++) for (let y = Math.round(slope(x)); y < H; y++) hb.set(x, y, G.face(up, fbm2(x * 0.03, y * 0.08, gs + 1, 2) > 0.55 ? 1 : 0));
    sc.addStatic(hb);
    // Rows of cottages, back to front, larger as they come nearer; the church in the back row.
    const walls = [['#c8b8a0', '#d8c8b0', '#f0e4cc', '#fff8e8'], ['#b88a6a', '#c89a7a', '#e0b898', '#f0d0b0'], ['#a8b0b8', '#b8c0c8', '#d8e0e6', '#eef2f6'], ['#c8a868', '#d8b878', '#ecd098', '#f8e4b8']].map(p => sc.ramp(p, 0.12));
    const roofs = [P.roof, P.slate, ['#3a2a24', '#4a362e', '#6a4c40', '#86625a']].map(p => sc.ramp(p, 0.12, 'ground'));
    const beam = sc.slot({ k: 'mat', c: hex('#2e2420'), d: 0.12 }), win = sc.slot({ k: 'emit', c: hex(LIGHTS.warm), base: hex('#2a3040'), d: 0.12, v: 1 });
    const chimneys = [], lamps = [], vb = new Buf(W, H), rows = rng.int(2, 3);
    const rowY = r => x => slope(x) + U * 0.03 + r * U * 0.07;
    // Lanes: one along the front of each row of houses, wheel ruts in it, and lanes climbing
    // between the rows. Drawn before the houses, which stand on their back edge.
    const rb = new Buf(W, H), lane = sc.ramp(['#4e443c', '#5e5248', '#7e6e5e', '#9a8a76'], 0.12, 'ground'), rs = seedOf(rng);
    const laneW = r => (1.5 + 2.5 * r / Math.max(1, rows - 1)) * s, laneY = r => x => rowY(r)(x) + laneW(r) * 0.5 + 1;
    const paint = (x, yc, w) => {
        for (let y = Math.floor(yc - w / 2 - 1); y <= yc + w / 2 + 1; y++) {
            const e = w / 2 - Math.abs(y - yc);
            if (e < -0.5 && bayer(x, y) > 0.5 + e) continue;
            const rut = w >= 3 && Math.abs(Math.abs(y - yc) - w * 0.22) < 0.5;
            rb.set(x, y, lane.flat(rut ? 0 : e < 0.5 ? 1 : hash(x >> 1, y, rs) < 0.12 ? 3 : 2));
        }
    };
    for (let r = 0; r < rows; r++) for (let x = 0; x < W; x++) paint(x, laneY(r)(x), laneW(r));
    for (let r = 0; r + 1 < rows; r++) for (let i = rng.int(2, 3); i > 0; i--) {
        const x0 = rng.range(0.1, 0.9) * W, x1 = x0 + rng.range(-1, 1) * U * 0.12;
        for (let u = 0; u <= 1; u += 0.5 / U) {
            const x = lerp(x0, x1, u * u * (3 - 2 * u)), w = lerp(laneW(r), laneW(r + 1), u) * 0.8;
            paint(Math.round(x), lerp(laneY(r)(x), laneY(r + 1)(x), u), w);
        }
    }
    sc.addStatic(rb);
    for (let r = 0; r < rows; r++) {
        const k = (0.65 + 0.35 * r / Math.max(1, rows - 1)) * s, base = rowY(r), foot = xx => Math.round(base(clamp(xx, 0, W - 1)));
        const ch = r === 0 && rng.chance(0.75) ? W * rng.range(0.2, 0.8) : -1e9;
        for (let x = rng.range(-10, 20); x < W + 10;) {
            if (Math.abs(x - ch) < 30 * k) { x += church(sc, vb, Math.round(ch), foot, k, walls[2], roofs[1], beam, win, rng) + 8 * k; continue; }
            const w = Math.round(rng.range(14, 24) * k), h = Math.round(rng.range(9, 13) * k);
            // Houses gather in clusters with open ground between.
            if (noise2(x * 0.012, r * 3, gs + 5) < 0.42) { x += w; continue; }
            chimneys.push(cottage(vb, Math.round(x), foot, w, h, rng.pick(walls), rng.pick(roofs), beam, win, rng, rng.chance(0.5)));
            if (r === rows - 1 && rng.chance(0.5)) lamps.push({ x: Math.round(x + w * 0.7 + 3 * k), y: foot(x + w * 0.7) + Math.round(6 * k), k });
            x += w + rng.range(3, 14) * k;
        }
    }
    sc.addStatic(vb);
    // Snow-laden pines among the houses and at the edges.
    const pb = new Buf(W, H, { sway: true }), Pn = sc.ramp(P.forest, 0.08), T = sc.ramp(P.trunk, 0.08);
    for (let i = rng.int(3, 7); i > 0; i--) {
        const x = rng.chance(0.6) ? (rng.chance(0.5) ? rng.range(0, W * 0.15) : rng.range(W * 0.85, W)) : rng.range(0, W);
        conifer(pb, x, slope(clamp(Math.round(x), 0, W - 1)) + U * rng.range(0.1, 0.25), U * rng.range(0.18, 0.32), Pn, rng, { sway: 0.4, trunk: T });
    }
    sc.addSway(pb, 0.5);
    // Lamps along the lane, each with a pool of light on the snow below at night.
    const post = sc.slot({ k: 'mat', c: hex('#1e1e22'), d: 0.06 }), lampC = sc.slot({ k: 'emit', c: hex('#ffe0a0'), base: hex('#3a3a3a'), d: 0.06, v: 1 });
    const pool = sc.slot({ k: 'flame', c: hex('#f0d8a8') }), lb = new Buf(W, H), pools = [];
    for (const l of lamps) {
        const ph = Math.round(14 * l.k);
        for (let dy = -2; dy <= 3; dy++) for (let dx = -ph; dx <= ph; dx++) if ((dx / ph) ** 2 + (dy / 3) ** 2 < 1 && bayer(l.x + dx, l.y + dy) < 0.5 - Math.abs(dx / ph) * 0.45) pools.push(clamp(l.x + dx, 0, W - 1) + clamp(l.y + dy, 0, H - 1) * W);
        for (let y = l.y - ph; y <= l.y; y++) lb.set(l.x, y, post);
        for (const dx of [-1, 0, 1]) lb.set(l.x + dx, l.y - ph, lampC);
        lb.set(l.x, l.y - ph - 1, post);
    }
    sc.addStatic(lb);
    const PL = Int32Array.from(pools);
    sc.addFn((f, t, L) => { if (L.lights > 0.4) for (const i of PL) f[i] = pool; });
    // The snowy field in front, a fence running across it.
    const fy = lerp(rowY(rows)(W / 2), H, 0.4), ns = seedOf(rng), fl = new Buf(W, H), Gf = sc.ramp(P.grass, 0.02);
    const ty = Float32Array.from({ length: W }, (_, x) => fy + (fbm1(x * 0.01, ns) - 0.5) * 8);
    for (let x = 0; x < W; x++) for (let y = Math.round(ty[x]); y < H; y++) fl.set(x, y, Gf.flat(clamp(Math.floor(fbm2(x * 0.02, y * 0.06, ns + 1, 2) * 3.5), 0, 3)));
    // The lane out of the village, winding down from the front row through a gap in the
    // fence, in the same trodden colours as the lanes, widening as it comes nearer.
    const ps = seedOf(rng), pEnd = W * rng.range(0.3, 0.7), pStart = W * rng.range(0.35, 0.65), py0 = Math.round(laneY(rows - 1)(pEnd));
    const pathX = y => { const u = clamp((y - py0) / (H - py0)); return lerp(pEnd, pStart, u * u * (3 - 2 * u)) + Math.sin(u * 3 + ps) * U * 0.06 * u; };
    for (let y = py0; y < H; y++) {
        const u = clamp((y - py0) / (H - py0)), w = laneW(rows - 1) / 2 + u * U * 0.07, cx = pathX(y);
        for (let x = Math.floor(cx - w - 1); x <= cx + w + 1; x++) {
            const e = w - Math.abs(x - cx);
            if (e < -0.5 && bayer(x, y) > 0.5 + e) continue;
            const rut = w >= 2 && Math.abs(Math.abs(x - cx) - w * 0.45) < 0.5 + u;
            fl.set(x, y, lane.flat(rut ? 0 : e < 0.5 ? 1 : hash(x >> 1, y, ps) < 0.12 ? 3 : 2));
        }
    }
    sc.addStatic(fl);
    const gate = pathX(fy + U * 0.03), fen = new Buf(W, H), wood = sc.ramp(P.trunk, 0), cap = wood.regroup('snowcap').flat(1);
    for (let x = rng.range(0, 10); x < W; x += U * 0.09) {
        if (Math.abs(x - gate) < U * 0.06) continue;
        const y = Math.round(ty[clamp(Math.round(x), 0, W - 1)] + U * 0.03);
        for (let j = 0; j < U * 0.07; j++) fen.set(x, y - j, wood.face(1, 1));
        fen.set(x, y - Math.round(U * 0.07), cap);
    }
    for (let x = 0; x < W; x++) for (const h of [0.05, 0.025]) {
        if (Math.abs(x - gate) < U * 0.06) continue; const y = Math.round(ty[x] + U * 0.03 - U * h); fen.set(x, y, wood.flat(1)); fen.set(x, y - 1, cap); }
    sc.addStatic(fen);
    // A tall pine close by at one side.
    if (rng.chance(0.7)) {
        const nb = new Buf(W, H, { sway: true }), x = rng.chance(0.5) ? rng.range(W * 0.02, W * 0.12) : rng.range(W * 0.88, W * 0.98);
        conifer(nb, x, H + rng.range(0, 6), U * rng.range(0.7, 0.9), sc.ramp(P.forest, 0), rng, { sway: 0.8, trunk: sc.ramp(P.trunk, 0) });
        sc.addSway(nb, 0.6);
    }
    // Chimney smoke drifting downwind.
    const smoke = [sc.slot({ k: 'fx', c: hex('#c8ccd4'), a: 0.5 }), sc.slot({ k: 'fx', c: hex('#e4e8ee'), a: 0.65 })], cs = seedOf(rng);
    const lit = chimneys.filter(() => rng.chance(0.6));
    sc.addFn((f, t) => {
        // Fires are lit in the cold months; in summer only the odd stove.
        const S = sc.S, put = putter(f, W, H), cold = clamp(S.snow + S.autumn * 0.6 + 0.15);
        lit.forEach((c, n) => {
            if (hash(n, 2, cs) > cold) return;
            // Puffs that swell and thin as they drift off.
            for (let i = 0; i < 6; i++) {
                const age = (t * 0.07 + i / 6 + hash(n, 1, cs)) % 1;
                const x = c.x + age * 20 * s + Math.sin(t * 0.5 + i * 2 + n) * age * 3, y = c.y - age * 22 * s, r = 1 + age * 4 * s;
                for (let dy = -r * 0.7; dy <= r * 0.7; dy++) for (let dx = -r; dx <= r; dx++) {
                    if ((dx / r) ** 2 + (dy / (r * 0.7)) ** 2 > 1 || bayer(Math.round(x + dx), Math.round(y + dy)) > (1 - age) * 0.85) continue;
                    put(x + dx, y + dy, smoke[age < 0.25 ? 1 : 0]);
                }
            }
        });
    });
}

// ---------------------------------------------------------------- café

// Inside a café, looking toward its front window and the quiet street outside: the room is a
// box in one-point perspective (X across, Y down, z depth with the window wall at z = 1),
// furniture is boxes found per pixel by the nearest face a ray meets.
function cafe(sc, rng) {
    const { W, H, U } = sc, s = U / 216;
    const vx = Math.round(W * rng.range(0.44, 0.56)), vy = sc.horizon = sc.horizonAt(rng.range(0.4, 0.46));
    const hw = Math.round(W * rng.range(0.22, 0.27)), hh = Math.round(Math.min(H * 0.3, hw * 0.9));
    sc.bias = rng.range(-0.4, 0.4);
    sky(sc);
    celestial(sc, rng);
    weather(sc, vy, [['rain', 2.2], ['overcast', 1.2], ['snow', 0.6]]);
    // Across the street: house fronts with lit windows, a lamp post, the wet pavement.
    const street = Math.round(vy + hh * 0.42), ob = new Buf(W, H), os = seedOf(rng);
    const fronts = [['#8a6a5a', '#9a7a6a', '#c09a84', '#d8b49c'], ['#6a7a8a', '#7a8a9a', '#a0b0be', '#bccad6'], ['#a89870', '#b8a880', '#d8c8a0', '#ece0bc']].map(p => sc.ramp(p, 0.15));
    const owin = sc.slot({ k: 'emit', c: hex(LIGHTS.warm), base: hex('#283040'), d: 0.15, v: 1 }), odark = sc.slot({ k: 'mat', c: hex('#202830'), d: 0.15 });
    for (let x0 = vx - hw * 1.2; x0 < vx + hw * 1.2;) {
        const w = Math.round(rng.range(0.4, 0.8) * hw), top = Math.round(vy - hh * rng.range(0.2, 0.55)), R = rng.pick(fronts), bay = Math.max(9, Math.round(hw * 0.14));
        for (let x = Math.round(x0); x < x0 + w; x++) for (let y = top; y < street; y++) {
            const u = x - x0, v = y - top, win = u % bay > bay * 0.35 && u % bay < bay * 0.75 && v % 14 > 5 && v % 14 < 11 && u > 3 && u < w - 4;
            ob.set(x, y, v < 2 ? R.flat(3) : win ? (hash(Math.floor(u / bay), Math.floor(v / 14), os + x0 | 0) < 0.45 ? owin : odark) : R.face(1, u < 1 ? 0 : 1));
        }
        x0 += w;
    }
    const pave = sc.ramp(['#3a3c42', '#46484e', '#5a5c64', '#6e7078'], 0.08);
    for (let y = street; y < vy + hh + 2; y++) for (let x = vx - hw - 2; x <= vx + hw + 2; x++) ob.set(x, y, pave.flat(y === street ? 3 : y < street + 2 ? 0 : 1));
    sc.addStatic(ob);
    sc.foreground.push(() => cafeRoom(sc, rng, vx, vy, hw, hh));
}

function cafeRoom(sc, rng, vx, vy, hw, hh) {
    const { W, H, U } = sc;
    const warm = c => mul(c, [1.2, 1.0, 0.75]).map(v => Math.min(255, v));
    const shades = c => [0.62, 0.78, 1, 1.15].map(k => mul(c, [k, k, k]));
    // Each material: four lamp levels (how near a lamp the pixel is) of four tones.
    const M = (c, k = 1) => [0.25, 0.45, 0.65, 0.85].map(v => shades(mul(hex(c), [k, k, k])).map(cc => sc.slot({ k: 'room', c: cc, lamp: warm(cc), v })));
    const wallC = pick(rng, ['#c8b48a', 1], ['#8aa088', 1], ['#c08a6a', 1], ['#d8ccb4', 1]), woodC = pick(rng, ['#6a4430', 1], ['#9a6a40', 1], ['#3e2c24', 0.7]);
    const [fa, fb] = pick(rng, [['#e8e0d0', '#2a2a2e'], 1], [['#b8644a', '#e0cca8'], 1], [['#d8d0c0', '#5a6a7a'], 0.8]);
    const wallL = M(wallC, 0.9), wallR = M(wallC, 0.78), wallB = M(wallC, 1), wood = M(woodC), woodS = M(woodC, 0.75), ceil = M(woodC, 0.7);
    const floorA = M(fa, 0.9), floorB = M(fb, 0.9), board = M('#24302a'), chalk = M('#d8dcd0'), top = M('#e4e0d8'), steel = M('#a8acb4'), glass = M('#f0e0c0', 1.1);
    const items = ['#a83a2a', '#3a6a9a', '#d8b040', '#5a8a4a', '#8a5a9a', '#e0d8c8', '#c87a3a'].map(c => M(c));
    // Pendant lamps hanging down the room.
    const nl = rng.int(2, 4), lamps = Array.from({ length: nl }, (_, i) => ({ X: rng.range(-0.45, 0.25), z: lerp(0.5, 0.92, (i + rng.range(0.2, 0.8)) / nl), Y: rng.range(-0.38, -0.22) }));
    const lp = lamps.map(l => [vx + l.X * hw / l.z, vy + l.Y * hh / l.z]);
    const level = (x, y) => clamp(Math.floor(Math.max(...lp.map(([lx, ly]) => 1 - Math.hypot(x - lx, (y - ly) * 1.3) / (U * 0.75))) * 3.2 + bayer(x, y) * 0.9), 0, 3);
    // Wood, worked out in the room's own units so it keeps its scale with depth: grain
    // streaking along the boards, a lit edge along the top, the sides and undersides darker.
    // One pixel at depth z is z / hw across and z / hh down.
    const woody = (R, sd, along = 'x') => (f, X, Y, z, lv, B) => {
        const T = R[lv], ex = z / hw * 1.1, ey = z / hh * 1.1;
        const g = (u, v) => { const n = noise2(u, v, sd); return n > 0.68 ? 1 : n < 0.3 ? -1 : 0; };
        if (f === 'top') {
            if (z - B.z0 < ey * 1.2) return T[3];
            if (X - B.x0 < ex || B.x1 - X < ex || B.z1 - z < ey) return T[1];
            return T[2 + Math.min(1, Math.max(-1, along === 'x' ? g(X * 5, z * 90) : g(z * 5, X * 90)))];
        }
        if (f === 'front') {
            if (Y - B.y0 < ey) return T[3];
            if (B.y1 - Y < ey * 1.5 || X - B.x0 < ex || B.x1 - X < ex) return T[0];
            return T[1 + Math.max(0, g(X * 5, Y * 70))];
        }
        if (Y - B.y0 < ey) return T[2];
        if (B.y1 - Y < ey * 1.5 || z - B.z0 < ex || B.z1 - z < ex) return T[0];
        return T[Math.max(0, g(z * 5, Y * 70)) + (f === 'bottom' ? 0 : 1) - (f === 'bottom' ? 0 : 0)];
    };
    // The furniture.
    const boxes = [];
    const box = (x0, x1, y0, y1, z0, z1, paint) => boxes.push({ x0, x1, y0, y1, z0, z1, paint });
    const counterWood = woody(woodS, 11, 'z');
    box(0.6, 1, 0.22, 1, 0.3, 0.92, (f, X, Y, z, lv, B) => (f === 'top' ? top[lv][X > 0.62 ? 2 : 3] : f === 'side' && Math.round(z * 40) % 4 === 0 ? woodS[lv][0] : f === 'side' && Math.abs(Y - 0.3) < z / hh ? woodS[lv][3] : counterWood(f, X, Y, z, lv, B)));
    box(0.68, 0.94, -0.1, 0.22, 0.74, 0.86, (f, X, Y, z, lv) => (Y < -0.07 ? steel[lv][3] : Math.abs(Y - 0.1) < 0.025 ? steel[lv][0] : steel[lv][f === 'side' ? 1 : 2]));
    box(0.64, 0.97, 0.04, 0.22, 0.42, 0.62, (f, X, Y, z, lv) => (Y > 0.14 && Y < 0.2 && Math.round(z * 30) % 2 ? items[Math.round(z * 30) % items.length][lv][2] : glass[lv][f === 'top' ? 3 : 2]));
    const tables = [], cups = [];
    for (let i = 0; i < 12 && tables.length < 3; i++) {
        const cx = rng.range(-0.62, 0.25), cz = rng.range(0.45, 0.88);
        if (tables.some(t => Math.abs(t.cx - cx) < 0.55 && Math.abs(t.cz - cz) < 0.2)) continue;
        tables.push({ cx, cz });
        const tw = woody(wood, tables.length * 7 + 1);
        box(cx - 0.16, cx + 0.16, 0.4, 0.44, cz - 0.07, cz + 0.07, tw);
        box(cx - 0.02, cx + 0.02, 0.44, 1, cz - 0.01, cz + 0.01, tw);
        for (const side of [-1, 1]) {
            const sx = cx + side * 0.24;
            // A chair: seat, legs at the front, and a back of rails between two uprights.
            const cw2 = woody(wood, tables.length * 7 + side + 3, 'z'), bx = sx + side * 0.06;
            box(sx - 0.07, sx + 0.07, 0.68, 0.71, cz - 0.06, cz + 0.06, cw2);
            for (const lz of [cz - 0.055, cz + 0.045]) box(sx - side * 0.06 - 0.01, sx - side * 0.06 + 0.01, 0.71, 1, lz, lz + 0.01, cw2);
            for (const lz of [cz - 0.06, cz + 0.05]) box(bx - 0.012, bx + 0.012, 0.35, 1, lz, lz + 0.01, cw2);
            for (const ry of [0.37, 0.46, 0.55]) box(bx - 0.01, bx + 0.01, ry, ry + 0.035, cz - 0.05, cz + 0.05, cw2);
        }
        const cupX = cx + rng.range(-0.08, 0.08), cupZ = cz + rng.range(-0.03, 0.02), cupC = rng.pick(items);
        box(cupX - 0.022, cupX + 0.022, 0.355, 0.4, cupZ - 0.015, cupZ + 0.015, (f, X, Y, z, lv) => cupC[lv][f === 'top' ? 0 : 3]);
        cups.push([vx + cupX * hw / cupZ, vy + 0.35 * hh / cupZ]);
    }
    // Shelves along the left wall: boards jutting from it, books standing on them (spines
    // toward the room, tops in gilt bands), now and then a jar, gaps between.
    const shelf = [], shelfY = [-0.55, -0.3, -0.05, 0.2], cs = seedOf(rng), pages = M('#e8dcc0');
    for (const sy of shelfY) {
        shelf.push({ x0: -1, x1: -0.84, y0: sy, y1: sy + 0.028, z0: 0.42, z1: 1, paint: (f, X, Y, z, lv) => (f === 'bottom' ? wood[lv][0] : f === 'side' ? wood[lv][noise2(z * 6, sy * 9, 5) > 0.65 ? 2 : 3] : wood[lv][2]) });
        for (let z = 0.43; z < 0.99;) {
            const jar = rng.chance(0.06), w = jar ? 0.05 : rng.range(0.012, 0.026), h = jar ? rng.range(0.07, 0.1) : rng.range(0.15, 0.22), dep = jar ? 0.09 : rng.range(0.07, 0.1), C = rng.pick(items);
            if (z + w > 0.99) break;
            if (!rng.chance(0.07)) {
                const top = sy - h;
                shelf.push({ x0: -1, x1: -1 + dep, y0: top, y1: sy, z0: z, z1: z + w, paint: jar
                    ? (f, X, Y, z2, lv) => (Y < top + 0.02 ? steel[lv][1] : glass[lv][f === 'side' ? 2 : 1])
                    : (f, X, Y, z2, lv) => (f === 'side' ? C[lv][Y - top < 0.015 || sy - Y < 0.015 ? 3 : Math.abs(Y - top - h * 0.35) < 0.02 ? 1 : 2] : f === 'top' ? pages[lv][2] : f === 'front' && X > -1 + dep - 0.012 ? C[lv][3] : C[lv][f === 'bottom' ? 0 : 1]) });
            }
            z += w + (rng.chance(0.12) ? rng.range(0.01, 0.04) : 0.001);
        }
    }
    const withShelf = boxes.concat(shelf);
    const hit = (x, y) => {
        const rx = (x + 0.5 - vx) / hw, ry = (y + 0.5 - vy) / hh;
        let best = null;
        for (const B of rx < -0.7 ? withShelf : boxes) {
            const tryFace = (z, face) => {
                if (!(z > 0) || (best && z >= best.z)) return;
                const X = rx * z, Y = ry * z, e = 1e-6;
                if (X >= B.x0 - e && X <= B.x1 + e && Y >= B.y0 - e && Y <= B.y1 + e && z >= B.z0 - e && z <= B.z1 + e) best = { z, face, X, Y, B };
            };
            if (B.x0 > 0 && rx) tryFace(B.x0 / rx, 'side');
            if (B.x1 < 0 && rx) tryFace(B.x1 / rx, 'side');
            if (B.y0 > 0 && ry) tryFace(B.y0 / ry, 'top');
            if (B.y1 < 0 && ry) tryFace(B.y1 / ry, 'bottom');
            tryFace(B.z0, 'front');
        }
        return best;
    };
    const b = new Buf(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const rx = (x + 0.5 - vx) / hw, ry = (y + 0.5 - vy) / hh, lv = level(x, y);
        let zs, v = 0;
        if (Math.abs(rx) <= 1 && Math.abs(ry) <= 1) {
            zs = 1;
            // The front window in its frame, a transom bar, panelling under it.
            const win = Math.abs(rx) < 0.8 && ry > -0.7 && ry < 0.42, fr = 0.035;
            if (win) {
                const bar = Math.abs(rx) < fr * 0.5 || Math.abs(ry + 0.38) < fr * 0.5 || Math.abs(Math.abs(rx) - 0.8) < fr || Math.abs(ry + 0.7) < fr || Math.abs(ry - 0.42) < fr;
                v = bar ? wood[lv][Math.abs(ry - 0.42) < fr ? 3 : 1] : 0;
            } else v = ry > 0.5 ? wood[lv][Math.round(rx * 20) % 2 ? 1 : 2] : wallB[lv][2];
        } else if (Math.abs(rx) > Math.abs(ry)) {
            const z = 1 / Math.abs(rx), d = 1 / z, Y = ry * z;
            zs = z;
            if (rx < 0) {
                // Behind the shelves the wall lies in their shade.
                v = Y > 0.5 ? wood[lv][Math.round(d * 6) % 2 ? 0 : 1] : wallL[lv][d < 2.4 && Y > -0.8 && Y < 0.25 ? 1 : 2];
            } else {
                // A chalkboard menu above the counter.
                if (d > 1.12 && d < 1.95 && Y > -0.72 && Y < -0.22) {
                    const edge = d < 1.16 || d > 1.91 || Y < -0.69 || Y > -0.25, row = Math.floor((Y + 0.66) / 0.075);
                    v = edge ? wood[lv][2] : (Y + 0.66) % 0.075 < 0.025 && hash(Math.floor(d * 40), row, cs) < (d < 1.3 ? 0.9 : 0.55) && d < 1.85 - hash(row, 3, cs) * 0.4 ? chalk[lv][2] : board[lv][1];
                } else v = Y > 0.5 ? wood[lv][Math.round(d * 6) % 2 ? 0 : 1] : wallR[lv][2];
            }
        } else {
            const z = 1 / Math.abs(ry), d = 1 / z, X = rx * z;
            zs = z;
            if (ry < 0) v = Math.abs((d * 2.5) % 1) < 0.08 ? ceil[lv][0] : ceil[lv][Math.floor(X * 6 + 60) % 2 ? 1 : 2];
            else v = (Math.floor(X * 6 + 60) + Math.floor(d * 6)) % 2 ? floorA[lv][2] : floorB[lv][2];
        }
        const o = hit(x, y);
        if (o && o.z < zs) v = o.B.paint(o.face, o.X, o.Y, o.z, lv, o.B);
        if (v) b.set(x, y, v);
    }
    sc.addStatic(b);
    // The lamps: cords from the ceiling, dark shades, bulbs glowing below them.
    const lb = new Buf(W, H), cord = M('#1a1a1a')[0][1], shade = M(pick(rng, ['#2a4a3a', 1], ['#7a2a1a', 1], ['#c8a040', 1], ['#2a2a2e', 1]))[3], bulb = sc.slot({ k: 'emit', c: hex('#fff0c0'), base: hex('#8a8070'), d: 0, v: 1 });
    const glow = sc.slot({ k: 'emit', c: hex('#ffd890'), base: hex(wallC), d: 0, v: 0.5 }), glows = [];
    lamps.forEach((l, i) => {
        const [x, y] = lp[i], r = 0.11 * hw / l.z, top = vy - hh / l.z;
        for (let yy = Math.max(0, Math.round(top)); yy < y - r * 0.6; yy++) lb.set(x, yy, cord);
        for (let j = 0; j <= r * 0.7; j++) for (let k = -r * (0.35 + 0.65 * j / (r * 0.7)); k <= r * (0.35 + 0.65 * j / (r * 0.7)); k++) lb.set(x + k, y - r * 0.6 + j, shade[k < 0 ? 1 : 2]);
        for (let k = -r * 0.3; k <= r * 0.3; k++) lb.set(x + k, y + r * 0.15, bulb);
        for (let dy = 1; dy < r * 2.5; dy++) for (let k = -r * (0.4 + dy / r * 0.5); k <= r * (0.4 + dy / r * 0.5); k++) if (bayer(Math.round(x + k), Math.round(y + dy)) < 0.2 * (1 - dy / (r * 2.5))) glows.push(clamp(Math.round(x + k), 0, W - 1) + clamp(Math.round(y + r * 0.15 + dy), 0, H - 1) * W);
    });
    sc.addStatic(lb);
    const GL = Int32Array.from(glows);
    // At night the lamplight hangs in the air under each shade; steam from the cups and the machine.
    const steam = sc.slot({ k: 'room', c: [200, 200, 205], lamp: [235, 228, 215], v: 0.4 });
    const machine = [vx + 0.8 * hw / 0.74, vy - 0.1 * hh / 0.74];
    sc.addFn((f, t, L) => {
        if (L.lights > 0.4) for (const i of GL) f[i] = glow;
        const put = putter(f, W, H);
        [...cups, machine].forEach(([cx, cy], n) => {
            for (let i = 0; i < 6; i++) {
                const age = (t * 0.3 + i / 6 + n * 0.3) % 1;
                if (bayer(i, Math.floor(t * 4) + n) < 1 - age) put(cx + Math.sin(age * 6 + i + n) * 1.5, cy - 2 - age * U * 0.06, steam);
            }
        });
        // Rain on the front window.
        const wx = sc.wx, rain = wx && ['rain', 'storm'].includes(wx.cur) ? 1 : 0;
        if (!rain) return;
        for (let i = 0; i < 50; i++) {
            const x = vx + (hash(i, 1, cs) * 1.5 - 0.75) * hw, y = vy + (-0.66 + ((hash(i, 2, cs) + t * (0.02 + hash(i, 3, cs) * 0.08)) % 1) * 1.05) * hh;
            if (Math.abs(x - vx) < 2 || Math.abs(y - (vy - 0.38 * hh)) < 2) continue;
            put(x, y, chalk[2][3]);
            if (hash(i, 4, cs) < 0.4) { put(x, y - 1, chalk[1][1]); put(x, y - 2, chalk[1][1]); }
        }
    });
}

export const NOOKS = { starship, village, cafe };
export const NOOK_HOURS = { starship: 21, village: 18.5, cafe: 17 };
