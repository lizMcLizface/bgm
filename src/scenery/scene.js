// Indexed-colour compositor. Every layer is a buffer of palette slots; each
// frame the slots are coloured from the current lighting and the layers are
// stamped back to front, so relighting and animation never redraw shapes.
import { applyAtmos, lightAt, hex, mix, mul } from './lighting.js';
import { bayer, clamp, fbm2 } from './noise.js';
import { leafColor, seasonAt, seasonColor } from './seasons.js';

// Slots at or above this index are water-reflected copies of the slot below it.
export const REFLECT = 4096;
// Each veil level (1, 2) adds VEIL to an index: the same colour seen through
// thin or thick fog/dust, which is how banks stay translucent.
export const VEIL = 8192;

export class Buf {
    // `rank` buffers hold deciduous foliage: a pixel with rank r > 0 shows only
    // while the trees still have more than r/255 of their leaves; `un` keeps
    // the wood a leaf was painted over, which shows once the leaf has dropped.
    constructor(w, h, { wrap = false, sway = false, rank = false } = {}) {
        this.w = w; this.h = h; this.wrap = wrap;
        this.d = new Uint16Array(w * h);
        this.rk = rank ? new Uint8Array(w * h) : null;
        this.un = rank ? new Uint16Array(w * h) : null;
        this.wt = sway ? new Uint8Array(w * h) : null;
        this.ax = sway ? new Int16Array(w * h) : null;   // x the wind is sampled at
    }

    // `ax` anchors a pixel to its object so a whole branch moves as one.
    set(x, y, v, wt = 0, ax, rk = 0) {
        x = Math.round(x); y = Math.round(y);
        if (y < 0 || y >= this.h) return;
        if (this.wrap) x = ((x % this.w) + this.w) % this.w;
        else if (x < 0 || x >= this.w) return;
        const i = y * this.w + x;
        if (this.rk) {
            if (!rk) this.un[i] = 0;
            else if (!this.rk[i] && this.d[i]) this.un[i] = this.d[i];
            this.rk[i] = rk;
        }
        this.d[i] = v;
        if (this.wt) { this.wt[i] = wt; this.ax[i] = ax ?? x; }
    }

    get(x, y) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
        return this.d[y * this.w + x];
    }

    rows() {
        let y0 = this.h, y1 = 0;
        for (let y = 0; y < this.h; y++) {
            const row = this.d.subarray(y * this.w, (y + 1) * this.w);
            if (row.some(v => v)) { if (y < y0) y0 = y; y1 = y + 1; }
        }
        return y0 < y1 ? [y0, y1] : [0, 0];
    }
}

// Horizontal wind displacement in pixels-per-unit-weight; gusts roll across.
export function wind(x, t) {
    const gust = Math.max(0, Math.sin(t * 0.31 - x * 0.006)) ** 6 * 1.6;
    return Math.sin(t * 1.7 + x * 0.07) * 0.45 + Math.sin(t * 0.73 - x * 0.021) * 0.55 + gust;
}

// Order in which a drifting layer's pixels appear as a weather fades in:
// blotchy, so clouds form and thin out in patches rather than evenly.
function dissolveRank(w, h) {
    const r = new Uint8Array(w * h), cells = Math.max(1, Math.round(w / 20));
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const n = fbm2(x * cells / w, y * 0.08, 77, 3, cells);
            r[y * w + x] = Math.min(255, clamp((n - 0.25) * 2) * 0.85 * 256 + bayer(x, y) * 0.15 * 256);
        }
    }
    return r;
}

const byte = v => (v <= 0 ? 0 : v >= 255 ? 255 : v | 0);
const pack = c => ((255 << 24) | (byte(c[2]) << 16) | (byte(c[1]) << 8) | byte(c[0])) >>> 0;
const WHITE = [244, 246, 255];

export class Scene {
    constructor(W, H) {
        this.W = W; this.H = H;
        this.horizon = Math.round(H * 0.6);
        this.bias = 0;           // keeps noon from lighting both faces equally
        this.defs = [null];
        this.keyed = new Map();
        this.layers = [];
        this.frame = new Uint16Array(W * H);
        this.lut = new Uint32Array(VEIL * 3);
        this.water = null;
        this.reflectMix = 0.4;
        this.atmos = null;       // weather adjustments to the lighting
        this.flash = null;       // t -> lightning flash in [0, 1]
        this.occluders = [];     // solid static layers that can hide the sun
        this.veil = null;        // { def, amounts: [thin, thick] }
        this.presence = 1;       // how much of a fading weather group shows
        this.update = null;      // t -> void, runs before each frame is coloured
        this.groups = new Map(); // palette array -> season group (grass, rock...)
        this.year = 1;           // time of year, see seasons.js
        this.climate = null;     // 'dry': no snow, see seasons.js
        this.S = seasonAt(1);
        this.leafCut = 255;
    }

    slot(def) {
        const key = JSON.stringify(def);
        let s = this.keyed.get(key);
        if (s === undefined) {
            s = this.defs.length;
            if (s >= REFLECT) throw new Error('scenery: out of palette slots');
            this.defs.push(def);
            this.keyed.set(key, s);
        }
        return s;
    }

    // Four-tone material: flat(lv) is tone lv; face(side, lv) blends tone lv
    // (shadow) with tone lv + 2 (lit) by how much a face pointing left (-1) or
    // right (+1) faces the current light.
    // `g` names the season group; by default it is looked up from the palette.
    ramp(colors, d = 0, g = this.groups.get(colors)) {
        const c = colors.map(hex);
        d = Math.min(0.92, d);
        const G = g ? { g } : {};
        return {
            c, d,
            regroup: g2 => this.ramp(colors, d, g2),
            flat: lv => this.slot({ k: 'mat', c: c[lv], d, ...G }),
            face: (s, lv) => this.slot({ k: 'face', a: c[lv], b: c[lv + 2], s, d, ...G }),
        };
    }

    // Foliage tones that follow the light: each slot stores a quantised surface
    // normal and an occlusion level (0 deep inside the crown .. 3 exposed). The
    // colour is picked from the ramp each frame by how much that normal faces
    // the sun or moon, snapped to a tone so the pixel art stays crisp.
    // `v` is the tree's leaf variant (how it turns in autumn, see seasons.js).
    leaves(colors, d = 0, v = 0) {
        const c = colors.map(hex);
        d = Math.min(0.92, d);
        const q = v => Math.round(clamp(v, -1, 1) * 2) / 2;
        return {
            c, d,
            at: (nx, ny, nz, o) => {
                const x = q(nx), y = q(ny), z = Math.sqrt(Math.max(0.1, 1 - x * x - y * y)), n = Math.hypot(x, y, z);
                return this.slot({ k: 'leaf', c, n: [x / n, y / n, z / n], o, d, v });
            },
        };
    }

    color(def, L) {
        switch (def.k) {
            case 'sky': return mix(L.skyTop, L.skyHor, def.v);
            case 'mat': return this.lit(this.tone(def.c, def.g), def.d, L);
            case 'face': {
                const lx = clamp(L.lightX * 1.6 + this.bias, -1, 1);
                return this.lit(mix(this.tone(def.a, def.g), this.tone(def.b, def.g), 0.5 + 0.5 * def.s * lx * L.contrast), def.d, L);
            }
            case 'cloud': return mix(mix(L.cloudDark, L.cloudLit, def.v), L.skyHor, def.d);
            case 'sun': return mix(L.sun, WHITE, 0.35);
            case 'glow': return mix(L.skyHor, L.sun, def.v);
            case 'moon': return mix([150, 166, 204], [236, 240, 255], def.v);
            case 'star': return mix(L.skyTop, WHITE, L.stars * def.v);
            case 'emit': return mix(this.lit(def.base, def.d, L), def.c, L.lights * def.v);
            case 'flame': return def.c;
            case 'leaf': {
                const lx = clamp(L.lightX * 1.6 + this.bias, -1, 1) * 0.9;
                const up = 0.4 + 0.6 * Math.abs(L.sunElev), ln = Math.hypot(lx, up, 0.6);
                const diff = Math.max(0, (def.n[0] * lx - def.n[1] * up + def.n[2] * 0.6) / ln);
                let v = (0.1 + 0.9 * diff) * [0.3, 0.55, 0.8, 1][def.o];
                v = 0.3 + (v - 0.3) * L.contrast;
                return this.lit(leafColor(def.c, clamp(Math.round(v * (def.c.length - 1)), 0, def.c.length - 1), def.v ?? 0, this.S), def.d, L);
            }
            case 'fx': return mix(L.haze, mul(def.c, L.tint), def.a);
            default: return [255, 0, 255];
        }
    }

    tone(c, g) { return g ? seasonColor(c, g, this.S) : c; }

    // Fog thickens the haze with distance but still veils the foreground a little.
    lit(c, d, L) {
        const f = L.fog * (0.35 + 0.65 * Math.min(1, Math.sqrt(d / 0.6)));
        return mix(mul(c, L.tint), L.haze, d + (1 - d) * f);
    }

    addStatic(buf, { sky = false } = {}) {
        const [y0, y1] = buf.rows(), src = buf.d, rk = buf.rk, un = buf.un, W = this.W;
        if (!sky) this.occluders.push(buf);
        this.layers.push(f => {
            const cut = this.leafCut;
            for (let i = y0 * W, e = y1 * W; i < e; i++) {
                const v = src[i];
                if (!v) continue;
                if (!rk || rk[i] <= cut) f[i] = v;
                else if (un[i]) f[i] = un[i];
            }
        });
    }

    addDrift(buf, speed) {
        const [y0, y1] = buf.rows(), src = buf.d, W = this.W, bw = buf.w;
        let rank = null;
        this.layers.push((f, t) => {
            const pr = this.presence;
            if (pr <= 0) return;
            if (pr < 1) rank ||= dissolveRank(bw, buf.h);
            const cut = pr * 256;
            const off = (((Math.floor(-t * speed) % bw) + bw) % bw);
            for (let y = y0; y < y1; y++) {
                const row = y * bw, o = y * W;
                for (let x = 0; x < W; x++) {
                    let sx = x + off;
                    if (sx >= bw) sx -= bw;
                    const v = src[row + sx];
                    if (v && (pr >= 1 || rank[row + sx] < cut)) f[o + x] = v;
                }
            }
        });
    }

    addSway(buf, amp) {
        const [y0, y1] = buf.rows(), src = buf.d, wt = buf.wt, ax = buf.ax, rk = buf.rk, un = buf.un, W = this.W;
        this.layers.push((f, t) => {
            const cut = this.leafCut;
            for (let y = y0; y < y1; y++) {
                const o = y * W;
                for (let x = 0; x < W; x++) {
                    let v = src[o + x];
                    if (!v) continue;
                    if (rk && rk[o + x] > cut) {
                        // Bare wood does not sway with the foliage.
                        if (un[o + x]) f[o + x] = un[o + x];
                        continue;
                    }
                    const w = wt[o + x];
                    const nx = w ? x + Math.round(wind(ax[o + x], t) * amp * w / 255) : x;
                    if (nx >= 0 && nx < W) f[o + nx] = v;
                }
            }
        });
    }

    // Drifting translucent bank: buf holds veil levels 1/2, not palette slots.
    addVeil(buf, speed) {
        const [y0, y1] = buf.rows(), src = buf.d, W = this.W, bw = buf.w;
        let rank = null;
        this.layers.push((f, t) => {
            const pr = this.presence;
            if (pr <= 0) return;
            if (pr < 1) rank ||= dissolveRank(bw, buf.h);
            const cut = pr * 256;
            const off = (((Math.floor(-t * speed) % bw) + bw) % bw);
            for (let y = y0; y < y1; y++) {
                const row = y * bw, o = y * W;
                for (let x = 0; x < W; x++) {
                    let sx = x + off;
                    if (sx >= bw) sx -= bw;
                    const v = src[row + sx];
                    if (!v || (pr < 1 && rank[row + sx] >= cut)) continue;
                    const cur = f[o + x], lv = Math.floor(cur / VEIL);
                    if (v > lv) f[o + x] = cur % VEIL + v * VEIL;
                }
            }
        });
    }

    addFn(fn) { this.layers.push(fn); }

    render(t, hour, out) {
        this.S = seasonAt(this.year, this.climate);
        this.leafCut = Math.round(this.S.leafy * 255);
        this.update?.(t);
        const L = lightAt(hour), { W, H } = this;
        if (this.atmos) applyAtmos(L, this.atmos, this.flash ? this.flash(t) : 0);
        const hz = this.horizon;
        L.sunPx = [W / 2 + L.sunX * W * 0.44, hz - L.sunElev * hz * 0.85];
        L.moonPx = [W / 2 + L.moonX * W * 0.44, hz - L.moonElev * hz * 0.85];
        L.sunHidden = L.veil > 0.6 || this.occluders.some(b => b.get(L.sunPx[0], L.sunPx[1]));
        this.L = L;

        const n = this.defs.length, lut = this.lut;
        const wc = this.water && this.color(this.water, L);
        const vc = this.veil && this.color(this.veil.def, L), [va, vb] = this.veil?.amounts ?? [];
        for (let s = 1; s < n; s++) {
            const c = this.color(this.defs[s], L);
            const r = wc && mix(mul(c, [0.86, 0.9, 0.93]), wc, this.reflectMix);
            lut[s] = pack(c);
            if (r) lut[s + REFLECT] = pack(r);
            if (vc) {
                lut[s + VEIL] = pack(mix(c, vc, va)); lut[s + 2 * VEIL] = pack(mix(c, vc, vb));
                if (r) { lut[s + REFLECT + VEIL] = pack(mix(r, vc, va)); lut[s + REFLECT + 2 * VEIL] = pack(mix(r, vc, vb)); }
            }
        }

        const f = this.frame;
        for (const layer of this.layers) layer(f, t, L, this);
        out ||= new Uint32Array(W * H);
        for (let i = 0; i < f.length; i++) out[i] = lut[f[i]];
        return out;
    }
}
