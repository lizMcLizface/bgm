// The ambient bed's sounds (engine/ambience.js), rendered sample by sample
// from noise. Pure: no Web Audio here, so it runs in a worker
// (ambience.worker.js) and in tests. Slow movement - gusts, swells,
// flicker, rolls - is computed every CONTROL samples, not every sample.

import { seeded } from '../random';

const CROSSFADE = 1; // seconds, across each loop point
const TWO_PI = 2 * Math.PI;
const CONTROL = 32;

// --- noise and filters, sample by sample ---------------------------------

const white = (rng) => rng() * 2 - 1;

// Paul Kellet's pink noise filter.
function pinkNoise(rng) {
    let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
    return () => {
        const w = white(rng);
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
        return out * 0.11;
    };
}

function brownNoise(rng) {
    let last = 0;
    return () => {
        last = (last + 0.02 * white(rng)) / 1.02;
        return last * 3.5;
    };
}

// One-pole lowpass; .high(x) gives the matching highpass.
function onePole(cutoff, sampleRate) {
    let y = 0;
    let a = 1 - Math.exp(-TWO_PI * cutoff / sampleRate);
    const low = (x) => {
        y += a * (x - y);
        return y;
    };
    low.high = (x) => x - low(x);
    low.setCutoff = (fc) => { a = 1 - Math.exp(-TWO_PI * fc / sampleRate); };
    return low;
}

// State-variable bandpass; setCutoff may be called as often as needed.
function bandpass(sampleRate, q) {
    let low = 0;
    let band = 0;
    let f = 0;
    const damping = 1 / q;
    const filter = (x) => {
        low += f * band;
        const high = x - low - damping * band;
        band += f * high;
        return band;
    };
    filter.setCutoff = (cutoff) => { f = 2 * Math.sin(Math.PI * Math.min(cutoff, sampleRate / 6) / sampleRate); };
    return filter;
}

// A smooth periodic curve over `period` seconds: a few sines with whole
// numbers of cycles per period, random phases, roughly within [-1, 1].
function periodicCurve(rng, period, harmonics) {
    const parts = harmonics.map(([cycles, weight]) => ({ cycles, weight, phase: rng() * TWO_PI }));
    const norm = parts.reduce((sum, p) => sum + p.weight, 0);
    return (t) => parts.reduce((sum, p) => sum + p.weight * Math.sin(TWO_PI * p.cycles * t / period + p.phase), 0) / norm;
}

// Adds a decaying noise burst (a click, a drop, a pop) at sample `at`.
function addBurst(channel, rng, at, length, amp) {
    const end = Math.min(channel.length, at + length);
    const factor = Math.exp(-4 / Math.max(4, length));
    let level = amp;
    for (let i = at; i < end; i++) {
        channel[i] += level * white(rng);
        level *= factor;
    }
}

// --- layers ------------------------------------------------------------
// Each returns [left, right] of `seconds + CROSSFADE` (looped layers) or
// `seconds` (thunder), at sampleRate.

export const LAYERS = {
    rain: {
        seconds: 19,
        level: 0.07,
        render(sampleRate, rng, n) {
            return [0, 1].map(() => {
                const out = new Float32Array(n);
                const pink = pinkNoise(rng);
                const hp = onePole(500, sampleRate);
                const lp1 = onePole(6500, sampleRate);
                const lp2 = onePole(6500, sampleRate);
                for (let i = 0; i < n; i++) out[i] = lp2(lp1(hp.high(pink()))) * 0.6;
                // drops: many tiny ticks, a few closer and louder ones
                const drops = new Float32Array(n);
                const count = Math.round(n / sampleRate * 260);
                for (let k = 0; k < count; k++) {
                    const amp = 0.04 + 0.6 * Math.pow(rng(), 5);
                    addBurst(drops, rng, Math.floor(rng() * n), Math.round(sampleRate * (0.0008 + 0.004 * rng())), amp);
                }
                const tick = onePole(1800, sampleRate);
                for (let i = 0; i < n; i++) out[i] += tick.high(drops[i]);
                return out;
            });
        },
    },

    wind: {
        seconds: 29,
        level: 0.06,
        render(sampleRate, rng, n, period) {
            const gust = periodicCurve(rng, period, [[2, 1], [5, 0.6], [11, 0.3], [17, 0.15]]);
            return [0, 0.35].map((lag) => {
                const out = new Float32Array(n);
                const pink = pinkNoise(rng);
                const brown = brownNoise(rng);
                const bp = bandpass(sampleRate, 1.4);
                const rumble = onePole(140, sampleRate);
                let g = 0;
                let level = 0;
                for (let i = 0; i < n; i++) {
                    if (i % CONTROL === 0) {
                        g = Math.max(0.08, 0.55 + 0.45 * gust(i / sampleRate - lag));
                        level = Math.pow(g, 1.5) * 2.2;
                        bp.setCutoff(220 + 750 * g * g);
                    }
                    out[i] = bp(pink()) * level + rumble(brown()) * 0.5 * g;
                }
                return out;
            });
        },
    },

    waves: {
        seconds: 31,
        level: 0.1,
        render(sampleRate, rng, n, period) {
            // 3-4 waves splitting the loop; each crashes in over ~2 s and
            // washes out. Wave tails reach into the next loop (k - 1 copy).
            const count = 3 + Math.floor(rng() * 2);
            const cuts = Array.from({ length: count }, () => 0.6 + rng() * 0.8);
            const sum = cuts.reduce((a, b) => a + b, 0);
            let at = rng() * 3;
            const waves = cuts.map((c) => {
                const wave = { at, rise: 1.4 + rng() * 1.2, decay: 2 + rng() * 2, size: 0.7 + rng() * 0.3 };
                at += (c / sum) * period;
                return wave;
            });
            const swell = (t) => {
                const tt = ((t % period) + period) % period;
                let level = 0.12;
                waves.forEach((w) => [w.at - period, w.at, w.at + period].forEach((start) => {
                    const d = tt - start;
                    if (d < 0) return;
                    const v = d < w.rise ? w.size * Math.pow(d / w.rise, 2) : w.size * Math.exp(-(d - w.rise) / w.decay);
                    level = Math.max(level, v);
                }));
                return level;
            };
            return [0, 0.45].map((lag) => {
                const out = new Float32Array(n);
                const brown = brownNoise(rng);
                const pink = pinkNoise(rng);
                const wash = onePole(400, sampleRate);
                const foam = onePole(1200, sampleRate);
                let s = 0;
                for (let i = 0; i < n; i++) {
                    if (i % CONTROL === 0) {
                        s = swell(i / sampleRate - lag);
                        wash.setCutoff(250 + 2600 * s * s);
                    }
                    out[i] = wash(brown() + pink() * 0.6) * s * 1.6 + foam.high(pink()) * s * s * s * 0.5;
                }
                return out;
            });
        },
    },

    fire: {
        seconds: 23,
        level: 0.05,
        render(sampleRate, rng, n, period) {
            const flicker = periodicCurve(rng, period, [[3, 1], [7, 0.7], [13, 0.5], [29, 0.3]]);
            const crackles = [new Float32Array(n), new Float32Array(n)];
            // clusters of pops, and now and then a bigger snap
            const clusters = Math.round(n / sampleRate * 3.5);
            for (let k = 0; k < clusters; k++) {
                const start = Math.floor(rng() * n);
                const pops = 1 + Math.floor(rng() * 6);
                const pan = 0.5 + (rng() - 0.5) * 0.6;
                for (let p = 0; p < pops; p++) {
                    const at = start + Math.floor(rng() * sampleRate * 0.15);
                    const amp = 0.05 + 0.6 * Math.pow(rng(), 3);
                    const length = Math.round(sampleRate * (0.0003 + 0.002 * rng()));
                    addBurst(crackles[0], rng, at, length, amp * (1 - pan) * 2);
                    addBurst(crackles[1], rng, at, length, amp * pan * 2);
                }
            }
            const snaps = Math.round(n / sampleRate * 0.25);
            for (let k = 0; k < snaps; k++) {
                const at = Math.floor(rng() * n);
                const length = Math.round(sampleRate * (0.003 + 0.004 * rng()));
                crackles.forEach((c) => addBurst(c, rng, at, length, 0.9));
            }
            return crackles.map((crackle) => {
                const out = new Float32Array(n);
                const brown = brownNoise(rng);
                const roar = onePole(220, sampleRate);
                const roar2 = onePole(220, sampleRate);
                const hiss = onePole(4000, sampleRate);
                const click = onePole(700, sampleRate);
                let f = 0;
                for (let i = 0; i < n; i++) {
                    if (i % CONTROL === 0) f = 0.65 + 0.35 * flicker(i / sampleRate);
                    out[i] = roar2(roar(brown())) * 1.4 * f + hiss.high(white(rng)) * 0.015 * f + click.high(crackle[i]);
                }
                return out;
            });
        },
    },

    vinyl: {
        // a multiple of one turn at 33 1/3 rpm (1.8 s): the scratch that
        // comes round every turn stays in step across the loop
        seconds: 18,
        level: 0.035,
        render(sampleRate, rng, n) {
            const clicks = new Float32Array(n);
            const count = Math.round(n / sampleRate * 28);
            for (let k = 0; k < count; k++) {
                addBurst(clicks, rng, Math.floor(rng() * n), Math.round(sampleRate * (0.0001 + 0.0004 * rng())), 0.03 + 0.25 * Math.pow(rng(), 4));
            }
            const pops = Math.round(n / sampleRate * 0.7);
            for (let k = 0; k < pops; k++) {
                addBurst(clicks, rng, Math.floor(rng() * n), Math.round(sampleRate * (0.0006 + 0.001 * rng())), 0.3 + 0.4 * rng());
            }
            for (let at = 0.37; at * sampleRate < n; at += 1.8) addBurst(clicks, rng, Math.floor(at * sampleRate), Math.round(sampleRate * 0.0012), 0.35);
            return [0, 1].map(() => {
                const out = new Float32Array(n);
                const lp = onePole(5000, sampleRate);
                const hp = onePole(700, sampleRate);
                const warm = onePole(6000, sampleRate);
                for (let i = 0; i < n; i++) out[i] = hp.high(lp(white(rng))) * 0.08 + warm(clicks[i]) * (0.9 + 0.2 * rng());
                return out;
            });
        },
    },
};

export const THUNDER = {
    seconds: 11,
    level: 0.5,
    variants: 3,
    render(sampleRate, rng, n) {
        // a few overlapping rolls: each swells in and dies away slowly
        const rolls = Array.from({ length: 3 + Math.floor(rng() * 4) }, (_, i) => ({
            at: i === 0 ? 0.05 : rng() * 3,
            attack: 0.08 + rng() * 0.35,
            decay: 0.8 + rng() * 2,
            amp: 0.4 + rng() * 0.6,
        }));
        const env = (t) => rolls.reduce((sum, r) => {
            const d = t - r.at;
            return d < 0 ? sum : sum + r.amp * (1 - Math.exp(-d / r.attack)) * Math.exp(-d / r.decay);
        }, 0);
        const cutoff = 120 + rng() * 130;
        return [0, 1].map(() => {
            const out = new Float32Array(n);
            const brown = brownNoise(rng);
            const lp1 = onePole(cutoff, sampleRate);
            const lp2 = onePole(cutoff, sampleRate);
            const mid = onePole(700, sampleRate);
            let e = 0;
            for (let i = 0; i < n; i++) {
                if (i % CONTROL === 0) e = env(i / sampleRate);
                const fade = Math.min(1, (n - i) / (sampleRate * 0.8));
                out[i] = (lp2(lp1(brown())) * 3 * e + mid(brown()) * 0.25 * e * e) * fade;
            }
            return out;
        });
    },
};

// --- buffers -------------------------------------------------------------

const rms = (channels) => {
    let sum = 0;
    let count = 0;
    channels.forEach((c) => c.forEach((x) => { sum += x * x; count++; }));
    return Math.sqrt(sum / count) || 1;
};

function toBuffer(context, channels, sampleRate) {
    const buffer = context.createBuffer(2, channels[0].length, sampleRate);
    channels.forEach((data, c) => buffer.copyToChannel(data, c));
    return buffer;
}

// Folds the CROSSFADE tail into the start (equal power: the two ends are
// uncorrelated noise), so the loop has no seam.
function seamless(channels, sampleRate) {
    const fade = Math.round(CROSSFADE * sampleRate);
    return channels.map((data) => {
        const length = data.length - fade;
        const out = data.slice(0, length);
        for (let i = 0; i < fade; i++) {
            const t = i / fade;
            out[i] = data[i] * Math.sin(t * Math.PI / 2) + data[length + i] * Math.cos(t * Math.PI / 2);
        }
        return out;
    });
}

/**
 * A layer's samples: [left, right] of a seamless loop, normalised to the
 * layer's level - or for 'thunder', one [left, right] per variant.
 */
export function renderLayer(id, sampleRate) {
    if (id === 'thunder') {
        return Array.from({ length: THUNDER.variants }, (_, v) => {
            const channels = THUNDER.render(sampleRate, seeded(0x7d4 + v), Math.round(THUNDER.seconds * sampleRate));
            let peak = 0;
            channels.forEach((c) => c.forEach((x) => { peak = Math.max(peak, Math.abs(x)); }));
            return channels.map((c) => c.map((x) => (x / (peak || 1)) * THUNDER.level));
        });
    }
    const layer = LAYERS[id];
    const n = Math.round((layer.seconds + CROSSFADE) * sampleRate);
    const channels = seamless(layer.render(sampleRate, seeded(id.length * 7919 + 17), n, layer.seconds), sampleRate);
    const gain = layer.level / rms(channels);
    return channels.map((c) => c.map((x) => Math.max(-0.95, Math.min(0.95, x * gain))));
}
