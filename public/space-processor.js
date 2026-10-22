// Shimmer and freeze for the calmbgm synth's effects (src/nodes/shimmer.js, freeze.js).
// Both add their sound to the dry signal, which passes unchanged. Settings arrive as port
// messages ({type:'set', ...}); {type:'clear'} drops what they are ringing with.

const TINY = 1e-18;

// A reverb whose tail is shifted up in pitch and fed back into itself, so every repeat climbs:
// four delay lines mixed by a Householder matrix (a small feedback delay network), damped in
// each line, with a two-tap pitch shifter between the network's output and its input.
class Shimmer extends AudioWorkletProcessor {
    constructor() {
        super();
        const sr = sampleRate;
        this.lengths = [47.3, 59.9, 71.1, 83.3].map((ms) => Math.round(ms * sr / 1000));
        this.lines = this.lengths.map((n) => new Float32Array(n));
        this.pos = [0, 0, 0, 0];
        this.lp = [0, 0, 0, 0];
        this.diffusers = [4.7, 11.3].map((ms) => ({ buf: new Float32Array(Math.round(ms * sr / 1000)), i: 0 }));
        this.window = Math.round(0.06 * sr);
        this.shiftBuf = new Float32Array(8192);
        this.shiftWrite = 0;
        this.phase = 0;
        this.hp = 0;
        this.hpIn = 0;
        this.energy = 0;
        this.set({ mix: 0, decay: 6, semitones: 12, climb: 0.5, tone: 7000 });
        this.port.onmessage = ({ data }) => {
            if (data.type === 'set') this.set(data);
            else if (data.type === 'clear') this.clear();
        };
    }

    set({ mix = this.mix, decay = this.decay, semitones = this.semitones, climb = this.climb, tone = this.tone }) {
        Object.assign(this, { mix, decay, semitones, climb, tone });
        const sr = sampleRate;
        this.gains = this.lengths.map((n) => 10 ** (-3 * n / (Math.max(0.3, decay) * sr)));
        this.damp = 1 - Math.exp(-2 * Math.PI * Math.min(16000, Math.max(500, tone)) / sr);
        this.step = (2 ** (semitones / 12) - 1) / this.window;
    }

    clear() {
        this.lines.forEach((l) => l.fill(0));
        this.diffusers.forEach((d) => d.buf.fill(0));
        this.shiftBuf.fill(0);
        this.lp.fill(0);
        this.hp = this.hpIn = this.energy = 0;
    }

    // a tap of the shifter's buffer `delay` samples back, linearly interpolated
    tap(delay) {
        const size = this.shiftBuf.length;
        let r = this.shiftWrite - delay;
        while (r < 0) r += size;
        const i = Math.floor(r), f = r - i;
        return this.shiftBuf[i % size] * (1 - f) + this.shiftBuf[(i + 1) % size] * f;
    }

    process(inputs, outputs) {
        const input = inputs[0], out = outputs[0];
        const inL = input[0], inR = input[1] ?? input[0];
        const n = out[0].length;
        let loud = 0;
        if (inL) for (let i = 0; i < n; i++) loud += Math.abs(inL[i]);
        if (!loud && this.energy < 1e-7) {
            for (let c = 0; c < out.length; c++) (inputs[0][c] ? out[c].set(inputs[0][c]) : out[c].fill(0));
            return true;
        }
        const { lines, lengths, pos, lp, gains, damp, window, shiftBuf } = this;
        const size = shiftBuf.length;
        const hpCoef = 0.985;
        let energy = 0;
        for (let i = 0; i < n; i++) {
            const dryL = inL ? inL[i] : 0, dryR = inR ? inR[i] : 0;
            // the shifted tail, high-passed and softly limited, back into the network
            this.phase -= this.step;
            if (this.phase < 0) this.phase += 1;
            const p2 = (this.phase + 0.5) % 1;
            const shifted = this.tap(this.phase * window + 1) * Math.sin(Math.PI * this.phase) + this.tap(p2 * window + 1) * Math.sin(Math.PI * p2);
            const hp = hpCoef * (this.hp + shifted - this.hpIn);
            this.hpIn = shifted;
            this.hp = hp;
            // the shifted tail takes the place of part of the feedback (not added to it), so the
            // loop never gains more than the decay allows
            // (an equal-power crossfade, so the tail lasts about `decay`; the mono tap goes into all
            // four lines alike, scaled so that even a part common to all of them gains no level)
            const climbed = Math.tanh(hp / 1.2);
            const c = this.climb * 0.8, keep = Math.sqrt(1 - c * c);
            let u = (dryL + dryR) * 0.25;
            for (const d of this.diffusers) {
                const delayed = d.buf[d.i], v = u + 0.6 * delayed;
                d.buf[d.i] = v;
                d.i = (d.i + 1) % d.buf.length;
                u = delayed - 0.6 * v;
            }
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                lp[k] += damp * (lines[k][pos[k]] - lp[k]) + TINY;
                sum += lp[k];
            }
            const half = sum * 0.5;
            for (let k = 0; k < 4; k++) {
                lines[k][pos[k]] = gains[k] * (keep * (lp[k] - half) + c * climbed) + u;
                pos[k] = (pos[k] + 1) % lengths[k];
            }
            const wetL = (lp[0] + lp[2]) * 0.6, wetR = (lp[1] + lp[3]) * 0.6;
            shiftBuf[this.shiftWrite] = (wetL + wetR) * 0.5;
            this.shiftWrite = (this.shiftWrite + 1) % size;
            energy += Math.abs(wetL) + Math.abs(wetR);
            out[0][i] = dryL + wetL * this.mix;
            if (out[1]) out[1][i] = dryR + wetR * this.mix;
        }
        this.energy = energy / n;
        return true;
    }
}

// Freeze: listens all the time; Hold takes the last `length` seconds and plays them on as a
// smooth, endless cloud of overlapping grains from random places in it. Releasing Hold fades the
// cloud out over `fade` seconds; holding again takes a new one and crossfades.
const GRAINS = 4;
const MAX_SECONDS = 4;
class Freeze extends AudioWorkletProcessor {
    constructor() {
        super();
        const sr = sampleRate;
        this.ring = [new Float32Array(Math.ceil((MAX_SECONDS + 0.5) * sr)), new Float32Array(Math.ceil((MAX_SECONDS + 0.5) * sr))];
        this.write = 0;
        this.clouds = [0, 1].map(() => ({ loop: [new Float32Array(MAX_SECONDS * sr), new Float32Array(MAX_SECONDS * sr)], length: 0, level: 0, target: 0, grains: [] }));
        this.current = null;
        this.waiting = false;
        this.retry = 0;
        this.mix = 0; this.hold = false; this.length = 2; this.fade = 1;
        this.port.onmessage = ({ data }) => {
            if (data.type === 'set') this.set(data);
            else if (data.type === 'clear') { for (const c of this.clouds) { c.level = c.target = 0; c.length = 0; } this.current = null; this.waiting = this.hold; }
        };
    }

    set({ mix = this.mix, hold = this.hold, length = this.length, fade = this.fade }) {
        const rising = hold && !this.hold;
        Object.assign(this, { mix, hold: !!hold, length: Math.min(MAX_SECONDS, Math.max(0.25, length)), fade: Math.max(0.02, fade) });
        if (rising) { this.waiting = true; this.waited = 0; this.retry = 0; }
        if (!this.hold) { this.waiting = false; for (const c of this.clouds) c.target = 0; this.current = null; }
    }

    // the last `length` seconds into a free cloud, if there is something in them
    capture() {
        const sr = sampleRate, n = Math.round(this.length * sr), size = this.ring[0].length;
        const cloud = this.clouds.find((c) => c !== this.current && c.level < 0.001) ?? this.clouds.find((c) => c !== this.current);
        // sound in every quarter of the window (a hold that starts with the music, or a part with
        // long rests, waits for it), or after two seconds of waiting, sound anywhere in it
        const quarters = [0, 0, 0, 0];
        for (let ch = 0; ch < 2; ch++) {
            const loop = cloud.loop[ch], ring = this.ring[ch];
            for (let i = 0; i < n; i++) {
                const x = ring[(this.write - n + i + size) % size];
                loop[i] = x;
                quarters[Math.min(3, Math.floor(4 * i / n))] += x * x;
            }
        }
        const floor = 1e-8 * n / 2;
        if (quarters.some((q) => q < floor) && !(this.waited > 8 && quarters.some((q) => q >= floor))) return false;
        cloud.length = n;
        const grain = Math.max(64, Math.min(Math.round(0.5 * n), Math.round(0.8 * sr)));
        cloud.grains = Array.from({ length: GRAINS }, (_, g) => ({ start: Math.floor(Math.random() * (n - grain)), t: Math.floor(g * grain / GRAINS), size: grain }));
        cloud.target = 1;
        if (this.current) this.current.target = 0;
        this.current = cloud;
        return true;
    }

    process(inputs, outputs) {
        const input = inputs[0], out = outputs[0];
        const inL = input[0], inR = input[1] ?? input[0];
        const n = out[0].length, size = this.ring[0].length;
        for (let i = 0; i < n; i++) {
            this.ring[0][this.write] = inL ? inL[i] : 0;
            this.ring[1][this.write] = inR ? inR[i] : 0;
            this.write = (this.write + 1) % size;
        }
        if (this.waiting && --this.retry <= 0) {
            this.retry = Math.round(0.25 * sampleRate / n);
            this.waited = (this.waited ?? 0) + 1;
            if (this.capture()) { this.waiting = false; this.waited = 0; }
        }
        const coef = 1 - Math.exp(-1 / (this.fade * sampleRate / 3));
        for (let i = 0; i < n; i++) {
            let l = 0, r = 0;
            for (const c of this.clouds) {
                if (c.level < 1e-5 && c.target === 0) { c.level = 0; continue; }
                c.level += (c.target - c.level) * coef;
                let gl = 0, gr = 0;
                for (const g of c.grains) {
                    const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * g.t / g.size), at = g.start + g.t;
                    gl += c.loop[0][at] * w;
                    gr += c.loop[1][at] * w;
                    if (++g.t >= g.size) { g.t = 0; g.start = Math.floor(Math.random() * (c.length - g.size)); }
                }
                l += gl * 0.5 * c.level;
                r += gr * 0.5 * c.level;
            }
            out[0][i] = (inL ? inL[i] : 0) + l * this.mix;
            if (out[1]) out[1][i] = (inR ? inR[i] : 0) + r * this.mix;
        }
        return true;
    }
}

registerProcessor('calmbgm-shimmer', Shimmer);
registerProcessor('calmbgm-freeze', Freeze);
