// A held note, sample by sample: wavetables that morph through the measured attack into the steady spectrum, with vibrato, tremolo and the
// slow wandering a player cannot avoid, noise from a shaped loop, and the measured envelopes. Used by iowa.worklet.js and, without a browser, by tools/checkIowa.mjs.
export const SIZE = 2048;                  // samples in one wavetable cycle
const MASK = SIZE - 1;
const cubic = (table, x) => {
    const i = Math.floor(x), t = x - i, a = table[(i - 1) & MASK], b = table[i & MASK], c = table[(i + 1) & MASK], d = table[(i + 2) & MASK];
    return b + .5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
};
const OPEN_SECONDS = .005, JOIN_SECONDS = .02;     // a note opens over this long, so its first sample cannot click; one joined to the note before fades in with that note still sounding
const curve = (times, values, t) => {
    if (t <= times[0]) return values[0];
    for (let i = 1; i < times.length; i++) if (t <= times[i]) return values[i - 1] + (values[i] - values[i - 1]) * (t - times[i - 1]) / (times[i] - times[i - 1]);
    return values[values.length - 1];
};

export class HeldVoice {
    /** `slide` { cents, seconds }: starts that far from its pitch and glides there, as one breath or bow with the note before: already past its attack. */
    constructor(spec, rate, gain, seed = 12345, tune = 1, slide = null) {
        Object.assign(this, { spec, rate, gain, tune, slide });
        this.age = slide ? spec.times[spec.times.length - 1] : 0; this.played = 0; this.opening = slide ? JOIN_SECONDS : OPEN_SECONDS; this.phase = 0; this.noiseAt = seed % 4096; this.releasedAt = -1;
        this.lfo = seed % 7; this.seed = seed >>> 0 || 1;
        this.pitchNow = 0; this.pitchGoal = 0; this.levelNow = 0; this.levelGoal = 0; this.last = 0;
        this.done = false;
    }
    random() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 2147483648 - 1; }
    release() { if (this.releasedAt < 0) this.releasedAt = this.age; }
    /** The level at time t, linear. */
    levelAt(t) {
        const s = this.spec;
        let dB = curve(s.envTimes, s.envDb, t);
        if (this.releasedAt >= 0) {
            const after = t - this.releasedAt;
            if (after >= s.relTimes[s.relTimes.length - 1]) { this.done = true; return 0; }
            dB += curve(s.relTimes, s.relDb, after);
        }
        return 10 ** (dB / 20);
    }
    /** How many cents off its pitch a sliding note still is, `played` seconds in. */
    glideAt(played) {
        const { slide } = this;
        if (!slide || played >= slide.seconds) return 0;
        const x = played / slide.seconds;
        return slide.cents * (1 - x * x * (3 - 2 * x));
    }
    /** Adds `n` samples to out. */
    render(out, n) {
        const s = this.spec, dt = 1 / this.rate, { tables, times, noise, burst } = s;
        const t0 = this.age, t1 = t0 + n * dt;
        // Every block: where the morph is, the envelope at both ends, and the slow movements.
        let slice = 0;
        while (slice < times.length - 1 && t0 >= times[slice + 1]) slice++;
        const lower = tables[slice], upper = tables[Math.min(slice + 1, tables.length - 1)];
        const span = times[Math.min(slice + 1, times.length - 1)] - times[slice] || 1;
        const mix0 = Math.max(0, Math.min(1, (t0 - times[slice]) / span)), mix1 = Math.max(0, Math.min(1, (t1 - times[slice]) / span));
        const grown = Math.max(0, Math.min(1, (t0 - .15) / .45));         // vibrato comes in once the note has settled
        if (Math.floor(t1 * 4) !== Math.floor(t0 * 4)) { this.pitchGoal = this.random() * s.pitchWander * 1.4; this.levelGoal = this.random() * s.levelWander * 1.4; }
        const follow = 1 - Math.exp(-n * dt / .12);
        this.pitchNow += (this.pitchGoal - this.pitchNow) * follow;
        this.levelNow += (this.levelGoal - this.levelNow) * follow;
        const lfoStep = 2 * Math.PI * s.rate * dt, depth = s.depth * grown, tremolo = s.tremolo * grown;
        const wander = 10 ** (this.levelNow / 20) * this.gain, fromGain = this.levelAt(t0), toGain = this.levelAt(t1);
        const burstFrom = burst ? Math.exp(-t0 / .045) : 0, burstTo = burst ? Math.exp(-t1 / .045) : 0;
        const rise = Math.min(1, t0 / .002), played1 = this.played + n * dt;
        const glide0 = this.glideAt(this.played), glide1 = this.glideAt(played1), open0 = Math.min(1, this.played / this.opening), open1 = Math.min(1, played1 / this.opening);
        for (let i = 0; i < n; i++) {
            const u = i / n;
            this.lfo += lfoStep;
            const wave = Math.sin(this.lfo), cents = depth * wave + this.pitchNow + glide0 + (glide1 - glide0) * u;
            this.phase += s.f0 * this.tune * 2 ** (cents / 1200) * dt;
            if (this.phase >= 1) this.phase -= Math.floor(this.phase);
            const x = this.phase * SIZE, mix = mix0 + (mix1 - mix0) * u, a = cubic(lower, x);
            let sample = lower === upper ? a : a + (cubic(upper, x) - a) * mix;
            sample *= 1 + .115 * tremolo * wave;                          // dB to a linear swing, near enough for a dB or two
            const level = fromGain + (toGain - fromGain) * u;
            sample *= level;
            this.noiseAt++;
            if (noise) sample += noise[this.noiseAt & (noise.length - 1)] * level;
            if (burst) sample += burst[this.noiseAt & (burst.length - 1)] * (burstFrom + (burstTo - burstFrom) * u) * rise;
            out[i] += sample * wander * (open0 + (open1 - open0) * u);
        }
        this.age = t1; this.played = played1;
        return !this.done;
    }
}

const SILENT = 1e-6;       // a partial below this has gone

/**
 * A struck or plucked note, live: every partial is a rotating phasor that shrinks a little each sample, a few multiplications however it decays, so nothing has
 * to be rendered ahead and a note sounds at once. Partials are dropped as they die, so a note gets cheaper as it rings.
 */
export class DecayVoice {
    constructor(spec, rate, gain, tune = 1) {
        const count = spec.frequency.length;
        Object.assign(this, { spec, rate, gain, count, age: 0, burstAt: 0, damping: false, damp: 1 });
        this.x = new Float64Array(count); this.y = new Float64Array(count); this.c = new Float64Array(count); this.s = new Float64Array(count);
        this.rise = new Float64Array(count); this.knee = new Float64Array(count); this.lateScale = new Float64Array(count);
        for (let i = 0; i < count; i++) {
            const shrink = 10 ** (spec.early[i] / 20 / rate), turn = 2 * Math.PI * spec.frequency[i] * tune / rate;
            this.x[i] = spec.amplitude[i] * Math.cos(spec.phase[i]); this.y[i] = spec.amplitude[i] * Math.sin(spec.phase[i]);
            this.c[i] = shrink * Math.cos(turn); this.s[i] = shrink * Math.sin(turn);
            this.rise[i] = spec.rise[i]; this.knee[i] = spec.rise[i] + .25;
            this.lateScale[i] = 10 ** ((spec.late[i] - spec.early[i]) / 20 / rate);
        }
    }
    /** A hand on the string. */
    release() { this.damping = true; }
    render(out, n) {
        const dt = 1 / this.rate, t0 = this.age, fadeFrom = this.spec.seconds - .05;
        for (let p = 0; p < this.count; p++) {
            let x = this.x[p], y = this.y[p], c = this.c[p], s = this.s[p];
            if (t0 >= this.knee[p]) {                    // the second decay rate, once
                c *= this.lateScale[p]; s *= this.lateScale[p]; this.c[p] = c; this.s[p] = s; this.knee[p] = Infinity;
            }
            const rise = this.rise[p];
            if (rise > 0 && t0 < rise) {
                for (let i = 0; i < n; i++) {
                    out[i] += y * this.gain * Math.min(1, (t0 + i * dt) / rise);
                    const nx = x * c - y * s; y = x * s + y * c; x = nx;
                }
            } else {
                const gain = this.gain;
                for (let i = 0; i < n; i++) {
                    out[i] += y * gain;
                    const nx = x * c - y * s; y = x * s + y * c; x = nx;
                }
            }
            if (Math.abs(x) + Math.abs(y) < SILENT && t0 >= rise) {
                const last = --this.count;
                for (const a of [this.x, this.y, this.c, this.s, this.rise, this.knee, this.lateScale]) a[p] = a[last];
                p--;
                continue;
            }
            this.x[p] = x; this.y[p] = y;
        }
        const { burst } = this.spec;
        if (burst && this.burstAt < burst.length) {
            for (let i = 0; i < n && this.burstAt < burst.length; i++, this.burstAt++) {
                const t = this.burstAt * dt;
                out[i] += burst[this.burstAt] * Math.exp(-t / .008) * Math.min(1, t / .0005) * this.gain;
            }
        }
        // Damped, or at the end of what was measured: the level goes down block by block, about 50 ms to fall by two thirds.
        if (this.damping || this.age >= fadeFrom) {
            this.gain *= Math.exp(-n * dt / .05);
            if (this.gain < 1e-5) return false;
        }
        this.age = t0 + n * dt;
        return !(this.count === 0 && (!burst || this.burstAt >= burst.length)) && this.age < this.spec.seconds + .3;
    }
}

/** A held key on a mallet instrument: the strike again and again, at the measured rate and as unevenly as the player's two hands. The hits ring on after the key comes up. */
export class RollVoice {
    constructor(spec, rate, gain, roll, seed = 1, tune = 1) {
        Object.assign(this, { spec, rate, gain, roll, tune, seed: seed >>> 0 || 1, hits: [], next: 0, age: 0, stopped: false });
    }
    random() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 2147483648 - 1; }
    release() { this.stopped = true; }
    render(out, n) {
        const dt = 1 / this.rate, end = this.age + n * dt, buffer = this.buffer?.length === n ? this.buffer : (this.buffer = new Float32Array(n));
        if (!this.stopped && this.age >= this.next) {
            this.hits.push(new DecayVoice(this.spec, this.rate, this.gain * 10 ** (this.random() * this.roll.level / 20), this.tune));
            if (this.hits.length > 12) this.hits.shift();
            // no steadier than measured, but a measured spread above a fifth is missed hits in the recording, not the player
            this.next = this.age + (1 + this.random() * Math.min(.2, this.roll.timing)) / this.roll.rate;
        }
        this.hits = this.hits.filter((hit) => { buffer.fill(0); const alive = hit.render(buffer, n); for (let i = 0; i < n; i++) out[i] += buffer[i]; return alive; });
        this.age = end;
        return !this.stopped || this.hits.length > 0;
    }
}
