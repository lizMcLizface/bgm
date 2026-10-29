// The voices of the real-time string (realtime.js): a single-cycle wavetable per note, played with vibrato, an attack that opens up from
// dark to bright, a release, and a little bow noise. Everything the body does to the sound happens after the sum of the voices (a
// convolver), so a voice costs two table reads per sample. Messages: { on, id, table, dark, f0, gain, noise, vibrato, release } and { off, id }.
const SIZE = 4096, MAX_VOICES = 24;
const cubic = (table, x) => {
    const i = Math.floor(x), t = x - i, a = table[(i - 1) & (SIZE - 1)], b = table[i & (SIZE - 1)], c = table[(i + 1) & (SIZE - 1)], d = table[(i + 2) & (SIZE - 1)];
    return b + .5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
};
const interpolate = (times, values, t) => {
    if (t <= times[0]) return values[0];
    for (let i = 1; i < times.length; i++) if (t <= times[i]) return values[i - 1] + (values[i] - values[i - 1]) * (t - times[i - 1]) / (times[i] - times[i - 1]);
    return values[values.length - 1];
};

class StringVoices extends AudioWorkletProcessor {
    constructor() {
        super();
        this.voices = new Map();
        this.seed = 12345;
        this.port.onmessage = ({ data }) => {
            if (data.on) {
                if (this.voices.size >= MAX_VOICES) this.voices.delete(this.voices.keys().next().value);
                this.voices.set(data.id, { ...data, phase: 0, age: 0, n: 0, lfo: Math.random() * 2 * Math.PI, wander: 0, wanderTarget: 0, lp: 0, releasedAt: -1, gain: data.gain });
            } else if (data.off) {
                const v = this.voices.get(data.id);
                if (v && v.releasedAt < 0) v.releasedAt = v.age;
            } else if (data.panic) this.voices.clear();
        };
    }
    random() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 2147483648 - 1; }
    process(_inputs, outputs) {
        const out = outputs[0][0], n = out.length, dt = 1 / sampleRate;
        out.fill(0);
        for (const [id, v] of this.voices) {
            const { table, dark, vibrato, release } = v;
            let done = false;
            for (let i = 0; i < n; i++) {
                const t = v.age;
                // vibrato: depth in cents grows over the first seconds; a slow irregular drift of a cent or two keeps the pitch from being a pure sine
                const depth = vibrato ? interpolate(vibrato.times, vibrato.depths, t) : 0;
                v.lfo += 2 * Math.PI * (vibrato ? vibrato.rate : 0) * dt;
                if ((v.n++ & 2047) === 0) v.wanderTarget = this.random() * 1.5;
                v.wander += (v.wanderTarget - v.wander) * .0004;
                const cents = depth * Math.sin(v.lfo) + v.wander;
                v.phase += v.f0 * Math.pow(2, cents / 1200) * dt;
                if (v.phase >= 1) v.phase -= Math.floor(v.phase);
                const x = v.phase * SIZE, bright = Math.min(1, t / v.open), mix = bright * bright * (3 - 2 * bright);
                let s = cubic(table, x) * mix + cubic(dark, x) * (1 - mix);
                // bow noise: white through a one-pole low-pass, loud with the attack and settling to its steady level
                v.lp += (this.random() - v.lp) * .35;
                s += v.lp * v.noise * (1 + v.hiss * Math.exp(-t / .12));
                // attack: raised cosine; release: the measured curve
                const rise = Math.min(1, t / v.attack), env = rise * rise * (3 - 2 * rise);
                let rel = 1;
                if (v.releasedAt >= 0) {
                    const r = t - v.releasedAt;
                    if (r >= release.seconds * v.relScale) { done = true; break; }
                    rel = interpolate(release.times, release.gains, r / v.relScale);
                }
                out[i] += s * env * rel * v.gain;
                v.age += dt;
            }
            if (done) this.voices.delete(id);
        }
        return true;
    }
}
registerProcessor('string-voices', StringVoices);
