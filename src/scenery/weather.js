// Weather: cloud cover drawn behind the land, lighting adjustments (sc.atmos),
// and overlays drawn in front of everything (rain, snow, fog banks, dust).
// Each weather kind is built lazily as its own group of layers; changing
// weather cross-fades two groups (clouds dissolve in patches, rain thins out,
// light and fog blend). Uses its own random streams so terrain never moves.
import { Buf } from './scene.js';
import { hex, mix } from './lighting.js';
import { bayer, clamp, fbm2, hash, makeRng } from './noise.js';
import { cumulus, seedOf, stratus } from './shapes.js';

export const WEATHER = {
    clear: 'Clear',
    sparse: 'Sparse clouds',
    scattered: 'Scattered clouds',
    dense: 'Dense clouds',
    towering: 'Towering clouds',
    streaks: 'High streaks',
    mixed: 'Streaks and puffs',
    overcast: 'Overcast',
    rain: 'Rain',
    storm: 'Thunderstorm',
    snow: 'Snow',
    fog: 'Fog',
    haze: 'Haze',
    dust: 'Dust storm',
};
const KINDS = Object.keys(WEATHER);

export const DEFAULT_WEATHER = [['clear', 1], ['sparse', 1.5], ['scattered', 3], ['dense', 1], ['towering', 1.2], ['streaks', 0.7], ['mixed', 0.8], ['overcast', 0.6], ['rain', 0.4], ['storm', 0.2], ['fog', 0.4], ['haze', 0.4], ['snow', 0.8]];

const ATMOS = {
    dense: { grey: 0.15 },
    overcast: { grey: 0.55, dark: 0.12, veil: 0.8 },
    rain: { grey: 0.6, dark: 0.25, veil: 0.9, fog: 0.15 },
    storm: { grey: 0.7, dark: 0.45, veil: 1, fog: 0.1 },
    snow: { grey: 0.6, dark: 0.05, veil: 0.9, fog: 0.25 },
    fog: { grey: 0.6, veil: 0.5, fog: 0.6, tint: hex('#dde2e8'), tintAmt: 0.65 },
    haze: { grey: 0.1, fog: 0.35, tint: hex('#e8dcc0'), tintAmt: 0.35 },
    dust: { grey: 0.15, veil: 0.5, fog: 0.6, tint: hex('#d39a5a'), tintAmt: 0.75 },
};

// Plausible next states when the weather wanders on its own.
const NEXT = {
    clear: ['sparse', 'haze', 'fog', 'streaks', 'snow'],
    sparse: ['clear', 'scattered', 'streaks'],
    scattered: ['sparse', 'dense', 'towering', 'mixed'],
    dense: ['scattered', 'overcast', 'towering'],
    towering: ['scattered', 'dense', 'storm'],
    streaks: ['sparse', 'mixed', 'clear'],
    mixed: ['streaks', 'scattered', 'overcast'],
    overcast: ['dense', 'rain', 'snow', 'fog', 'mixed'],
    rain: ['overcast', 'storm'],
    storm: ['rain'],
    snow: ['overcast', 'fog', 'sparse'],
    fog: ['clear', 'haze', 'overcast'],
    haze: ['clear', 'sparse', 'dust', 'fog'],
    dust: ['haze'],
};

// How the time of year shifts the odds: snow only in winter (where it
// replaces rain), thunderstorms mostly in summer, fog mostly in autumn.
function seasonal(kind, S) {
    switch (kind) {
        case 'snow': return S.snow > 0.3 ? 3 : 0;
        case 'rain': return S.snow > 0.3 ? 0.15 : 1;
        case 'storm': return S.snow > 0.3 ? 0 : S.dry > 0.2 || (S.y > 1 && S.y < 2) ? 2.2 : 0.5;
        case 'fog': return S.autumn > 0.4 ? 2 : 1;
        case 'dust': return S.snow > 0.3 ? 0.2 : 1;
        default: return 1;
    }
}

function pickKind(rng, opts) {
    let r = rng() * opts.reduce((s, o) => s + o[1], 0);
    for (const [v, w] of opts) if ((r -= w) < 0) return v;
    return opts[opts.length - 1][0];
}

const NONE = { grey: 0, dark: 0, veil: 0, fog: 0, tintAmt: 0 };
function blendAtmos(a, b, p) {
    a = { ...NONE, ...a }; b = { ...NONE, ...b };
    const out = {};
    for (const k of ['grey', 'dark', 'veil', 'fog']) out[k] = a[k] + (b[k] - a[k]) * p;
    out.tint = a.tint && b.tint ? mix(a.tint, b.tint, p) : a.tint || b.tint;
    out.tintAmt = (a.tint ? a.tintAmt : 0) * (1 - p) + (b.tint ? b.tintAmt : 0) * p;
    return out;
}

// Lightning: in each 5 s window there may be one strike, flickering twice.
const strike = (t, seed) => {
    const k = Math.floor(t / 5);
    if (hash(k, 0, seed) > 0.55) return null;
    const dt = t - (k * 5 + hash(k, 1, seed) * 4);
    if (dt < 0 || dt > 0.6) return null;
    const v = dt < 0.07 ? 1 : dt < 0.14 ? 0.25 : dt < 0.24 ? 0.85 : (0.6 - dt) * 1.4;
    return { k, dt, v };
};

function clouds(sc, rng, kind, g) {
    const { H } = sc, hz = sc.horizon;
    const far = n => n && cumulus(sc, rng, { n, y0: hz * 0.6, y1: hz - 4, w0: 16, w1: 44, d: 0.4, speed: 0.8, tall: [0.18, 0.3] });
    const mid = (n, w0 = 30, w1 = 85) => n && cumulus(sc, rng, { n, y0: H * 0.06, y1: hz * 0.72, w0, w1, d: 0.1, speed: 1.6, tall: [0.3, 0.45] });
    const deck = (cover, d = 0.1) => {
        stratus(sc, rng, { y0: -hz * 0.6, y1: hz * 1.05, d, speed: 1.2, cover, cells: 7 });
        stratus(sc, rng, { y0: hz * 0.35, y1: hz, d: d + 0.2, speed: 2.2, cover: cover * 0.7, fy: 0.16 });
    };
    switch (kind) {
        case 'clear': far(rng.int(0, 2)); break;
        case 'sparse': far(rng.int(2, 5)); mid(rng.int(0, 2), 20, 50); break;
        case 'scattered': far(rng.int(4, 12)); mid(rng.int(3, 7)); break;
        case 'dense': far(rng.int(10, 18)); mid(rng.int(16, 24), 50, 120); break;
        case 'towering':
            far(rng.int(2, 8));
            cumulus(sc, rng, { n: rng.int(2, 4), y0: hz * 0.5, y1: hz * 0.85, w0: 80, w1: 140, d: 0.08, speed: 1.1, tall: [0.45, 0.6] });
            break;
        case 'streaks': stratus(sc, rng, { y0: -4, y1: hz * rng.range(0.6, 0.9), d: 0.08, speed: 1.3, cover: rng.range(0.4, 0.8) }); break;
        case 'mixed':
            stratus(sc, rng, { y0: -4, y1: hz * 0.45, d: 0.06, speed: 1.4, cover: rng.range(0.3, 0.55) });
            far(rng.int(3, 9)); mid(rng.int(1, 3));
            break;
        case 'overcast': case 'rain': case 'snow': deck(1); break;
        case 'storm': deck(1.1, 0.05); bolt(sc, rng, g); break;
        case 'fog': far(rng.int(0, 3)); break;
        case 'haze': far(rng.int(1, 5)); mid(rng.int(0, 2)); break;
    }
}

function bolt(sc, rng, g) {
    const seed = seedOf(rng), { W } = sc, hz = sc.horizon;
    const core = sc.slot({ k: 'flame', c: hex('#f6f4ff') }), edge = sc.slot({ k: 'flame', c: hex('#b8b8f0') });
    g.flash = t => strike(t, seed)?.v ?? 0;
    sc.addFn((f, t) => {
        const s = strike(t, seed);
        if (!s || s.dt > 0.3 || s.v < 0.5 || sc.presence < 0.7) return;
        const put = (x, y, v) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y <= hz) f[y * W + x] = v; };
        const walk = (x, y, end, branch) => {
            let n = 0;
            while (y < end) {
                const ny = y + 2 + hash(n, s.k * 31 + branch, seed) * 3, nx = x + (hash(n, s.k * 17 + branch, seed) - 0.5) * 7;
                for (let u = 0; u <= 1; u += 0.2) { put(x + (nx - x) * u, y + (ny - y) * u, core); put(x + (nx - x) * u + 1, y + (ny - y) * u, edge); }
                if (!branch && hash(n, s.k, seed + 9) < 0.12) walk(nx, ny, ny + 12 + hash(n, 3, seed) * 14, n + 1);
                x = nx; y = ny; n++;
            }
        };
        walk(W * (0.1 + 0.8 * hash(s.k, 2, seed)), 0, hz - hash(s.k, 3, seed) * 10, 0);
    });
}

// Drifting banks (fog, dust) baked once into a wrapping buffer: solid thin
// and thick layers with only a sliver of dither at their edges.
function bank(sc, rng, { y0, y1, speed, fy, cells, density, profile }) {
    const { W, H } = sc, bw = W * 2, b = new Buf(bw, H, { wrap: true }), seed = seedOf(rng), fx = cells / bw;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, y1); y++) {
        const p = profile((y - y0) / (y1 - y0));
        for (let x = 0; x < bw; x++) {
            const v = fbm2(x * fx, y * fy, seed, 3, cells) * p * density + (bayer(x, y) - 0.5) * 0.04;
            if (v > 0.6) b.set(x, y, 2);
            else if (v > 0.48) b.set(x, y, 1);
        }
    }
    sc.addVeil(b, speed);
}

function overlay(sc, rng, kind, g) {
    const { W, H } = sc, hz = sc.horizon;
    if (kind === 'rain' || kind === 'storm') {
        const far = sc.slot({ k: 'fx', c: hex('#c4d0e4'), a: 0.3 }), near = sc.slot({ k: 'fx', c: hex('#dce4f2'), a: 0.55 });
        const drops = Array.from({ length: kind === 'storm' ? 340 : 200 }, () => ({ x: rng() * W, y: rng() * H, v: rng.range(170, 260), l: rng.int(2, 5), near: rng.chance(0.3) }));
        sc.addFn((f, t) => {
            const n = Math.floor(drops.length * sc.presence);
            for (let i = 0; i < n; i++) {
                const d = drops[i];
                const y = ((d.y + t * d.v) % (H + 8)) - 4;
                const x = ((d.x + y * 0.22 + t * 14) % W + W) % W;
                const len = d.near ? d.l + 2 : d.l;
                for (let k = 0; k < len; k++) {
                    const px = Math.round(x + k * 0.22) % W, py = Math.round(y + k);
                    if (py >= 0 && py < H) f[py * W + px] = d.near ? near : far;
                }
            }
        });
    } else if (kind === 'snow') {
        const flake = [sc.slot({ k: 'fx', c: hex('#f4f6ff'), a: 0.6 }), sc.slot({ k: 'fx', c: hex('#ffffff'), a: 0.9 })];
        const flakes = Array.from({ length: 220 }, () => ({ x: rng() * W, y: rng() * H, v: rng.range(8, 28), ph: rng() * 6, big: rng.chance(0.25) }));
        sc.addFn((f, t) => {
            const n = Math.floor(flakes.length * sc.presence);
            for (let i = 0; i < n; i++) {
                const s = flakes[i];
                const y = Math.round((s.y + t * s.v) % H);
                const x = Math.round((((s.x + Math.sin(t * 0.7 + s.ph) * 3 + t * s.v * 0.3) % W) + W) % W);
                f[y * W + x] = flake[s.big ? 1 : 0];
                if (s.big && x + 1 < W) f[y * W + x + 1] = flake[1];
            }
        });
    } else if (kind === 'fog') {
        g.veil = { def: { k: 'fx', c: hex('#eef2f6'), a: 0.6 }, amounts: [0.3, 0.55] };
        const profile = u => clamp(Math.sin(Math.PI * Math.min(1, u * 1.6)) * 1.3);
        bank(sc, rng, { y0: hz - 18, y1: H, speed: 3, fy: 0.07, cells: 6, density: 1.1, profile });
        bank(sc, rng, { y0: hz + 10, y1: H + 20, speed: 6, fy: 0.05, cells: 5, density: 0.9, profile });
    } else if (kind === 'dust') {
        g.veil = { def: { k: 'fx', c: hex('#d0a068'), a: 0.6 }, amounts: [0.3, 0.55] };
        bank(sc, rng, { y0: hz * 0.4, y1: H, speed: 26, fy: 0.12, cells: 8, density: 1, profile: u => 0.6 + 0.5 * u });
        bank(sc, rng, { y0: hz * 0.8, y1: H, speed: 44, fy: 0.18, cells: 10, density: 0.9, profile: u => 0.4 + 0.7 * u });
    }
}

export class Weather {
    // `fixed` holds one kind; without it the weather wanders, starting from a
    // seeded pick weighted by `auto` and moving along NEXT every few minutes.
    constructor(sc, auto, fixed) {
        this.sc = sc;
        this.auto = new Map(auto);
        this.rng = sc.wrng;
        this.seed = seedOf(this.rng);
        this.groups = new Map();
        this.cur = fixed ?? pickKind(this.rng, this.weighted([...this.auto.keys()]));
        this.prev = null;
        this.p = 1;
        this.changing = !fixed;
        this.startAt = 0;
        this.dur = 1;
        this.next = null;
        this.now = 0;
        this.skyLayer = (f, t, L) => this.draw('sky', f, t, L);
        this.overLayer = (f, t, L) => this.draw('over', f, t, L);
    }

    group(kind) {
        let g = this.groups.get(kind);
        if (g) return g;
        const sc = this.sc, saved = sc.layers, rng = makeRng(this.seed + KINDS.indexOf(kind) * 7919);
        g = { atmos: ATMOS[kind] ?? null, flash: null, veil: null };
        sc.layers = [];
        clouds(sc, rng, kind, g);
        g.sky = sc.layers;
        sc.layers = [];
        overlay(sc, rng, kind, g);
        g.over = sc.layers;
        sc.layers = saved;
        this.groups.set(kind, g);
        return g;
    }

    // 'auto' resumes wandering; a kind fades to it and holds.
    set(kind, dur = 8) {
        if (kind === 'auto') { this.changing = true; this.next = this.now + this.rng.range(30, 90); return; }
        this.changing = false;
        this.go(kind, dur);
    }

    go(kind, dur) {
        if (kind === this.cur) return;
        if (this.prev && this.p < 0.5) this.cur = this.prev;   // a reversal mid-fade keeps the dominant group
        this.prev = this.cur;
        this.cur = kind;
        this.p = 0;
        this.startAt = this.now;
        this.dur = dur;
    }

    weighted(kinds) {
        return kinds.map(k => [k, (this.auto.get(k) ?? 0) * seasonal(k, this.sc.S)]).filter(([, w]) => w > 0);
    }

    pickNext() {
        const opts = this.weighted(NEXT[this.cur]);
        return pickKind(this.rng, opts.length ? opts : this.weighted([...this.auto.keys()]));
    }

    update(t) {
        this.now = t;
        if (this.changing) {
            this.next ??= t + this.rng.range(60, 150);
            if (t >= this.next) {
                this.go(this.pickNext(), this.rng.range(25, 45));
                this.next = t + this.rng.range(90, 240);
            }
        }
        if (this.prev) {
            this.p = clamp((t - this.startAt) / this.dur);
            if (this.p >= 1) this.prev = null;
        }
        const c = this.group(this.cur), pv = this.prev && this.group(this.prev), p = this.prev ? this.p : 1;
        const sc = this.sc;
        sc.atmos = pv ? blendAtmos(pv.atmos, c.atmos, p) : c.atmos;
        sc.flash = tt => Math.max((c.flash?.(tt) ?? 0) * p, (pv?.flash?.(tt) ?? 0) * (1 - p));
        const veiled = [[c, p], [pv, 1 - p]].filter(([g]) => g?.veil).sort((a, b) => b[1] - a[1])[0];
        sc.veil = veiled ? { def: veiled[0].veil.def, amounts: veiled[0].veil.amounts.map(a => a * veiled[1]) } : null;
    }

    draw(part, f, t, L) {
        const sc = this.sc, p = this.prev ? this.p : 1;
        for (const [kind, pres] of [[this.prev, 1 - p], [this.cur, p]]) {
            if (!kind || pres <= 0) continue;
            sc.presence = pres;
            for (const layer of this.group(kind)[part]) layer(f, t, L, sc);
        }
        sc.presence = 1;
    }
}

// Cloud cover and atmosphere. Call where the clouds belong in the layer stack.
export function weatherSky(sc, hz, auto = DEFAULT_WEATHER) {
    const wx = sc.wx = new Weather(sc, auto, sc.weatherFixed);
    sc.update = t => wx.update(t);
    sc.addFn(wx.skyLayer);
}

// Effects in front of the landscape. Call after the biome is built.
export function weatherOverlay(sc) {
    if (sc.wx) sc.addFn(sc.wx.overLayer);
}
