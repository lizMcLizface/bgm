// A warehouse yard at night: the long low shed of an out-of-town party, its big door glowing, light beams
// sweeping up out of the roof into the haze, a crowd of small dark figures nodding to the beat at the door,
// a chain-link fence and string lights in front, a dim industrial edge of town behind. Cool whites, teal and
// amber rather than neon pink and purple: the look of the techno, house and trance presets.
import { Buf } from './scene.js';
import { hex, mix } from './lighting.js';
import { bayer, hash, noise1 } from './noise.js';
import { celestial, seedOf, sky } from './shapes.js';
import { P, weather } from './biomes.js';

const COLD = { white: '#e8f4ff', teal: '#46e0d0', ice: '#8fc8ff', amber: '#ffb25c', warm: '#ffe2a8', green: '#7dff9c' };

function warehouse(sc, rng) {
    const { W, H, U } = sc, hz = sc.horizon = sc.horizonAt(rng.range(0.6, 0.68)), C = (c) => hex(c);
    sc.climate = 'dry';
    // Night leans toward a cold teal haze that the beams cut through.
    sc.relight = (L) => {
        const n = 1 - L.day;
        L.skyTop = mix(L.skyTop, C('#06141c'), 0.5 * n);
        L.skyHor = mix(L.skyHor, C('#1b4650'), 0.6 * n);
        L.haze = mix(L.haze, C('#16363f'), 0.55 * n);
    };
    sky(sc);
    celestial(sc, rng, { count: 45 });
    weather(sc, hz, [['haze', 2.5], ['fog', 1], ['overcast', 1]], 0.7);

    const emit = (R, c, v = 1) => sc.slot({ k: 'emit', c: C(c), base: R.c[2], d: R.d, v });
    const beat = Math.PI * 2 * (128 / 60);

    // The edge of town: low dark roofs and chimneys, a few lit windows.
    const far = new Buf(W, H), FR = sc.ramp(P.struct, 0.6), farLamp = emit(FR, COLD.amber, 0.8);
    for (let x = -4; x < W;) {
        const w = rng.int(5, 16), h = rng.int(2, 9), by = hz + rng.int(0, 1);
        for (let y = by - h; y <= by; y++) for (let k = 0; k < w; k++) far.set(x + k, y, FR.flat(0));
        if (rng.chance(0.25)) for (let y = by - h - rng.int(2, 5); y < by - h; y++) far.set(x + rng.int(1, w - 2), y, FR.flat(0));
        for (let k = 1; k < w - 1; k += 2) if (rng.chance(0.18)) far.set(x + k, by - rng.int(0, Math.max(0, h - 1)), farLamp);
        x += w + rng.int(0, 3);
    }
    sc.addStatic(far);

    // The yard: dark tarmac, lighter where the door spills.
    const G = sc.ramp(P.ground, 0), gs = seedOf(rng), ground = new Buf(W, H);
    for (let y = hz + 1; y < H; y++) {
        const p = (y - hz) / (H - hz);
        for (let x = 0; x < W; x++) ground.set(x, y, G.flat(Math.max(0, Math.min(3, Math.floor((noise1(x * 0.05 + y * 0.31, gs) * 1.1 - p * 0.6 + 0.35) * 4)))));
    }
    sc.addStatic(ground);

    // The shed: a long low box with a sawtooth roof, vents, strip windows and a big lit door.
    const S = sc.ramp(P.slate, 0.1), shed = new Buf(W, H);
    const x0 = Math.round(W * rng.range(0.2, 0.28)), x1 = Math.round(W * rng.range(0.72, 0.8)), by = hz + Math.round(U * 0.1);
    const wallTop = by - Math.round(U * rng.range(0.15, 0.2)), teeth = Math.max(3, Math.round((x1 - x0) / 24));
    for (let x = x0; x < x1; x++) {
        const t = ((x - x0) / (x1 - x0)) * teeth, saw = Math.round((t % 1) * 6), top = wallTop - 5 + saw;
        for (let y = top; y <= by; y++) shed.set(x, y, S.face(x < (x0 + x1) / 2 ? -1 : 1, y === top ? 1 : 0));
    }
    const lampWarm = emit(S, COLD.warm), lampCool = emit(S, COLD.ice, 0.9), lampTeal = emit(S, COLD.teal, 0.9);
    const doorW = Math.round((x1 - x0) * 0.2), doorX = Math.round((x0 + x1) / 2 - doorW / 2), doorH = Math.round((by - wallTop) * 0.8);
    // the roll-up door: bright slats with darker seams, and a hot strip along its foot
    const slat = emit(S, COLD.amber, 1), seam = S.flat(0);
    for (let y = by - doorH; y <= by; y++) for (let x = doorX; x < doorX + doorW; x++) shed.set(x, y, (y - by) % 3 === 0 ? slat : (x - doorX) % Math.max(4, doorW >> 2) === 0 && y < by - 1 ? seam : lampWarm);
    const windows = [];
    for (let x = x0 + 4; x < x1 - 4; x += 7) {
        if (x > doorX - 6 && x < doorX + doorW + 3) continue;
        const wy = wallTop + 2 + rng.int(0, 3);
        const slot = rng.chance(0.5) ? lampCool : lampTeal;
        for (let k = 0; k < 4; k++) shed.set(x + k, wy, slot);
        windows.push({ x, y: wy, n: windows.length });
    }
    // a vent and a flue on the roof, and the lamp over the door
    for (let k = 0; k < 4; k++) for (let y = wallTop - 11; y < wallTop - 6; y++) shed.set(x0 + 10 + k, y, S.flat(1));
    shed.set(doorX + (doorW >> 1), by - doorH - 2, lampWarm);
    sc.addStatic(shed);

    // The beams: slow sweeps out of the roof, a different colour and speed each, drawn thin and dithered.
    const beamSlots = [COLD.white, COLD.teal, COLD.green, COLD.ice].map((c) => sc.slot({ k: 'flame', c: C(c) }));
    const beams = Array.from({ length: rng.int(4, 6) }, (_, i) => ({
        ox: x0 + (x1 - x0) * (0.15 + 0.7 * ((i + rng.range(-0.2, 0.2)) / 5)), oy: wallTop - 4, a0: rng.range(-0.5, 0.5), amp: rng.range(0.25, 0.8),
        w: rng.range(0.18, 0.5), ph: rng.range(0, 6.28), slot: beamSlots[i % beamSlots.length],
    }));
    sc.addFn((f, t, L) => {
        if (L.lights < 0.05) return;
        const strength = L.lights * (1 - L.veil * 0.4), reach = H * 1.05;
        for (const b of beams) {
            const ang = Math.PI / 2 + b.a0 + Math.sin(t * b.w + b.ph) * b.amp, dx = Math.cos(ang), dy = -Math.sin(ang);
            for (let s = 3; s < reach; s += 0.7) {
                const x = Math.round(b.ox + dx * s), y = Math.round(b.oy + dy * s);
                if (x < 0 || x >= W || y < 0 || y >= H) break;
                if (bayer(x, y) < (1 - s / reach) ** 1.4 * 0.75 * strength) f[y * W + x] = b.slot;
            }
        }
    });

    // The crowd at the door: small dark figures that nod on the beat, some with a hand up.
    const crowd = sc.slot({ k: 'mat', c: C('#06090f'), d: 0.05 });
    const people = Array.from({ length: rng.int(26, 44) }, (_, i) => ({ x: i % 2 ? doorX + rng.range(1, doorW - 1) : doorX + rng.range(-doorW * 0.9, doorW * 1.9), y: by + (i % 2 ? rng.int(1, 3) : rng.int(2, Math.max(3, Math.round(U * 0.08)))), ph: rng.range(0, 6.28), up: rng.chance(0.3) }));
    // light spilling out of the door onto the tarmac
    const spill = sc.slot({ k: 'flame', c: C(COLD.warm) });
    sc.addFn((f, t, L) => {
        if (L.lights > 0.05) {
            for (let y = by + 1; y < Math.min(H, by + U * 0.16); y++) {
                const p = (y - by) / (U * 0.16), o = y * W;
                for (let x = doorX - 6; x < doorX + doorW + 6; x++) if (bayer(x, y) < (1 - p) ** 2 * 0.4 * L.lights * (1 - Math.abs((x - doorX - doorW / 2) / (doorW + 12)) * 1.4)) f[o + x] = spill;
            }
        }
        for (const p of people) {
            const bob = Math.sin(t * beat * 0.5 + p.ph) > 0.2 ? 1 : 0, x = Math.round(p.x), y = Math.round(p.y) - bob;
            for (let k = 0; k < 4; k++) f[(y - k) * W + x] = crowd;
            if (p.up && bob) f[(y - 4) * W + x + 1] = crowd;
        }
        // the strip windows pulse with the kick
        for (const w of windows) if (Math.sin(t * beat + w.n) < -0.6) for (let k = 0; k < 4; k++) f[w.y * W + w.x + k] = crowd;
    });

    // In front: a chain-link fence along the bottom, with string lights over the yard.
    const fence = new Buf(W, H), FN = sc.ramp(P.struct, 0), fy = H - Math.round(U * 0.09);
    for (let x = 0; x < W; x++) {
        if (x % 18 === 2) for (let y = fy - 6; y < H; y++) fence.set(x, y, FN.flat(2));
        if ((x + fy) % 2 === 0 && x % 18 !== 2) for (let y = fy - 4; y < fy + 8; y += 3) fence.set(x, y, FN.flat(1));
    }
    const bulb = emit(FN, COLD.warm, 1), bulbs = [];
    for (let k = 0; k < 3; k++) {
        const bx0 = (W * k) / 3, bx1 = (W * (k + 1)) / 3, sag = rng.range(5, 10), top = hz + Math.round(U * 0.12);
        for (let x = Math.round(bx0); x < bx1; x += 3) {
            const p = (x - bx0) / (bx1 - bx0), y = Math.round(top + Math.sin(p * Math.PI) * sag);
            fence.set(x, y, FN.flat(1));
            if (x % 6 === 0) bulbs.push({ x, y: y + 1, n: bulbs.length });
        }
    }
    sc.addStatic(fence);
    sc.addFn((f, t, L) => {
        if (L.lights < 0.08) return;
        for (const b of bulbs) if (hash(b.n, Math.floor(t * 0.6 + b.n * 0.37), 9) < 0.9) f[b.y * W + b.x] = bulb;
    });
}

export const WAREHOUSES = { warehouse };
export const WAREHOUSE_HOURS = { warehouse: 23 };
