// Streaming, asset-free DSP shared by the AudioWorklet and offline probes.
// This is a perceptual model, not a fluid solver or a model fitted to recordings.
export const LAYERS = ['rumble', 'body', 'mist', 'sheet', 'hiss', 'drops'];
export const DEFAULT_ENVIRONMENT = { rainIntensity: .5, windChaos: .3, indoorFilter: 0, surfaceType: 'mixed', correlation: .75, impactTexture: .9 };
export const MATERIALS = {
    // Broad noise colour, not a bank of pitched oscillators. Even rigid surfaces
    // use short, heavily damped responses so the impact dominates the resonance.
    leaves: { hz: 3200, q: .65, body: 470, brightness: .85, tail: .8 },
    concrete: { hz: 1400, q: .55, body: 260, brightness: .55, tail: .6 },
    glass: { hz: 2900, q: 1.1, body: 620, brightness: 1.1, tail: .7 },
    tin: { hz: 2100, q: 1.5, body: 430, brightness: 1.05, tail: .9 },
    puddle: { hz: 1600, q: .7, body: 320, brightness: .7, tail: 1.2 },
};
const MIXED_SURFACES = ['leaves', 'leaves', 'concrete', 'puddle', 'puddle'];
const TAU = 2 * Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function sanitizeEnvironment(value = {}) {
    const e = { ...DEFAULT_ENVIRONMENT };
    for (const key of ['rainIntensity', 'windChaos', 'indoorFilter', 'correlation', 'impactTexture']) {
        if (Number.isFinite(value[key])) e[key] = clamp(value[key], 0, 1);
    }
    if (value.surfaceType === 'mixed' || Object.hasOwn(MATERIALS, value.surfaceType)) e.surfaceType = value.surfaceType;
    return e;
}
export function random(seed) {
    let state = seed >>> 0 || 1;
    return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
export class Lowpass {
    constructor(rate, hz) { this.rate = rate; this.y = 0; this.set(hz); }
    set(hz) { this.a = 1 - Math.exp(-TAU * hz / this.rate); }
    tick(x) { this.y += this.a * (x - this.y); return this.y; }
}
export class Bandpass {
    constructor(rate, hz, q) {
        this.rate = rate; this.set(hz, q); this.clear();
    }
    set(hz, q) {
        const w = TAU * Math.min(hz, this.rate * .43) / this.rate, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
        this.b = alpha / a0; this.a1 = -2 * Math.cos(w) / a0; this.a2 = (1 - alpha) / a0;
    }
    clear() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
    tick(x) {
        const y = this.b * (x - this.x2) - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
    }
}
export class Pink {
    constructor() { this.a = this.b = this.c = 0; }
    tick(w) {
        this.a = .99765 * this.a + .099046 * w;
        this.b = .963 * this.b + .2965164 * w;
        this.c = .57 * this.c + 1.0526913 * w;
        return (this.a + this.b + this.c + .1848 * w) * .13;
    }
}
// Independent smooth random scales; no loop buffer or periodic LFO.
class Weather {
    constructor(rng) { this.rng = rng; this.scales = [.43, 2.7, 13].map(period => ({ period, t: 0, a: rng() * 2 - 1, b: rng() * 2 - 1 })); }
    tick(dt) {
        let sum = 0, weight = 1, norm = 0;
        for (const s of this.scales) {
            s.t += dt / s.period;
            while (s.t >= 1) { s.t -= 1; s.a = s.b; s.b = this.rng() * 2 - 1; }
            const u = s.t * s.t * (3 - 2 * s.t);
            sum += (s.a + (s.b - s.a) * u) * weight; norm += weight; weight *= 1.7;
        }
        return sum / norm;
    }
}
// Unresolved rain is still made of impacts. These random energy packets overlap
// into a continuous texture, retaining sub-millisecond edges and 5–30 ms tails.
// Summing packet *energy* approximates many independent, overlapping noise bursts.
class ImpactCloud {
    constructor(rate, rng, splash) {
        this.rng = rng; this.splash = splash; this.hazard = -Math.log(Math.max(1e-9, rng()));
        this.fast = this.tail = this.attack = 0;
        this.fastDecay = Math.exp(-1 / (rate * (splash ? .0014 : .014)));
        this.tailDecay = Math.exp(-1 / (rate * (splash ? .009 : .036)));
        this.rise = 1 - Math.exp(-1 / (rate * (splash ? .00012 : .0045)));
        this.tailMix = splash ? .25 : .45;
    }
    tick(ratePerSample) {
        this.hazard -= ratePerSample;
        while (this.hazard <= 0) {
            const draw = this.rng();
            // Distant body is many small, softened puffs, not rare explosive hits.
            const amplitude = this.splash ? .25 + 3 * draw ** 3 : .45 + 1.05 * draw ** 1.7;
            this.fast += amplitude * amplitude; this.tail += amplitude * amplitude * this.tailMix;
            this.hazard += -Math.log(Math.max(1e-9, this.rng()));
        }
        this.fast *= this.fastDecay; this.tail *= this.tailDecay;
        this.attack += this.rise * (this.fast + this.tail - this.attack);
        return Math.sqrt(this.attack);
    }
}
export class RainModel {
    constructor(rate = 48000, environment = {}, seed = 731) {
        if (!Number.isFinite(rate) || rate < 8000 || rate > 192000) throw Error('Unsupported sample rate');
        this.rate = rate; this.rng = random(seed); this.environment = sanitizeEnvironment(environment);
        this.eventRng = random(seed ^ 0x5327ab); this.impactRng = random(seed ^ 0x27183);
        this.clusterRng = random(seed ^ 0x81435);
        this.intensity = this.environment.rainIntensity; this.wind = this.environment.windChaos;
        this.correlation = this.environment.correlation; this.texture = this.environment.impactTexture;
        this.weather = new Weather(random(seed ^ 0x13579));
        this.channels = [0, 1].map(c => ({ pink: new Pink(), body: new Bandpass(rate, 310, .55),
            impactBody: new Bandpass(rate, 300, .5), bodyDamp: [new Lowpass(rate, 750), new Lowpass(rate, 750)],
            mist: new Bandpass(rate, 1200, .85), mistMotion: new Lowpass(rate, 5), mistSoft: new Lowpass(rate, 3400),
            sheet: new Bandpass(rate, 3500, 1.1), air: new Lowpass(rate, Math.min(5300, rate * .32)),
            sizzle: new Bandpass(rate, 8500, .6), fryDepth: new Bandpass(rate, 2400, .6), fryTail: new Lowpass(rate, 22),
            nearDamp: [new Lowpass(rate, 2300), new Lowpass(rate, 2300)],
            bodyCloud: new ImpactCloud(rate, random((seed ^ 0x37913) + c * 8731), false),
            splashCloud: new ImpactCloud(rate, random((seed ^ 0x71237) + c * 4517), true) }));
        this.brown = 0; this.dc = new Lowpass(rate, 18); this.rumble = new Lowpass(rate, 65);
        this.voices = Array.from({ length: 96 }, () => ({ remaining: 0,
            colour: new Bandpass(rate, 2200, .7), body: new Bandpass(rate, 400, .6),
            air: new Lowpass(rate, Math.min(4200, rate * .3)),
            fragments: Array.from({ length: 3 }, () => ({ at: 0, amp: 0 })) }));
        this.hazard = -Math.log(Math.max(1e-9, this.eventRng())); this.countdown = 0; this.events = 0; this.stolen = 0;
        this.clusterHazard = -Math.log(Math.max(1e-9, this.clusterRng())); this.cluster = 0;
        this.smooth = 1 - Math.exp(-1 / (.035 * rate)); this.rateNow = 0; this.heave = 1;
    }
    setEnvironment(patch) { this.environment = sanitizeEnvironment({ ...this.environment, ...patch }); }
    control() {
        const gust = this.weather.tick(64 / this.rate), depth = this.correlation * (.22 + .78 * this.wind);
        this.heave = Math.exp(depth * gust * .85);
        this.rateNow = this.intensity * (7 + 140 * this.intensity ** 1.5) * Math.exp(depth * gust * 2.6);
        this.rumble.set(60 + 30 * this.wind * gust);
        const dt = 64 / this.rate;
        // Short patches of splatter within the slower weather: not just a gust LFO.
        this.cluster *= Math.exp(-dt / .055);
        this.clusterHazard -= (5 + 13 * this.intensity) * dt;
        while (this.clusterHazard <= 0) {
            this.cluster += .35 + this.clusterRng() * 1.4;
            this.clusterHazard += -Math.log(Math.max(1e-9, this.clusterRng()));
        }
        const patch = .55 + Math.min(3, this.cluster) * .85;
        this.bodyRate = this.intensity * (14 + 175 * this.intensity ** .8) * this.heave * patch / this.rate;
        this.splashRate = this.intensity * (75 + 680 * this.intensity ** 1.2) * this.heave * patch / this.rate;
        this.bodyLevel = .4 * this.intensity ** .8 * this.heave;
        this.mistLevel = .6 * this.intensity ** .8 * this.heave;
        this.sheetLevel = .9 * this.intensity ** 1.1 * this.heave;
        this.hissLevel = .55 * this.intensity ** 2 * this.heave;
        this.bodyImpactLevel = .16 * this.intensity ** .45;
        this.splashImpactLevel = .035 * this.intensity ** .6;
    }
    drop() {
        let v = this.voices.find(v => v.remaining <= 0);
        if (!v) { this.stolen++; return; } // Fixed CPU/memory budget; never allocate nodes per impact.
        const r = this.eventRng;
        const material = this.environment.surfaceType === 'mixed' ? MIXED_SURFACES[Math.floor(r() * MIXED_SURFACES.length)] : this.environment.surfaceType;
        const spec = MATERIALS[material], size = .55 + r() * 1.25, pan = (r() * 2 - 1) * .85;
        v.left = Math.cos((pan + 1) * Math.PI / 4); v.right = Math.sin((pan + 1) * Math.PI / 4);
        const strength = r(), intensityGain = .6 + .4 * this.intensity;
        v.amp = (.065 + .22 * strength ** 4) * intensityGain;
        // The foreground should sit inside the patter: less contrast between
        // small/large hits, without changing their contributions to the other beds.
        v.nearAmp = (.085 + .065 * strength ** 2) * intensityGain;
        v.age = 0; v.remaining = Math.ceil(this.rate * .14);
        v.material = material; v.brightness = spec.brightness;
        v.attack = Math.max(1, this.rate * (.00015 + r() * .00065));
        v.nearAttack = this.rate * (.002 + .0025 * size);
        v.distantAttack = this.rate * (.004 + .003 * size);
        v.envelope = v.bodyEnvelope = 1; v.splashEnvelope = v.nearSplash = 0;
        v.nearSplashRise = 1 - Math.exp(-1 / (this.rate * .0025));
        v.decay = Math.exp(-1 / (this.rate * (.007 + r() * .007) * Math.sqrt(size)));
        v.bodyDecay = Math.exp(-1 / (this.rate * (.006 + r() * .008) * size));
        v.splashDecay = Math.exp(-1 / (this.rate * .004 * size * spec.tail));
        v.hz = Math.min(spec.hz / size * (.8 + r() * .4), this.rate * .4);
        v.colour.set(v.hz, spec.q); v.colour.clear();
        v.body.set(spec.body / Math.sqrt(size), .55); v.body.clear(); v.air.y = 0;
        let at = .001;
        for (const f of v.fragments) {
            at += .001 + r() * .008 * spec.tail;
            f.at = Math.round(at * this.rate); f.amp = .25 + r() * .7;
        }
        this.events++;
    }
    // outputs: six stereo Float32Array pairs. State survives arbitrary block boundaries.
    process(outputs) {
        const n = outputs[0][0].length, r = this.rng, sr = this.rate;
        for (let i = 0; i < n; i++) {
            this.intensity += this.smooth * (this.environment.rainIntensity - this.intensity);
            this.wind += this.smooth * (this.environment.windChaos - this.wind);
            this.correlation += this.smooth * (this.environment.correlation - this.correlation);
            this.texture += this.smooth * (this.environment.impactTexture - this.texture);
            if (this.countdown-- <= 0) { this.control(); this.countdown = 63; }
            const w = r() * 2 - 1;
            this.brown = .999 * this.brown + .014 * w;
            const bass = this.rumble.tick(this.brown - this.dc.tick(this.brown)) * .75 * this.intensity * this.heave;
            for (let c = 0; c < 2; c++) {
                const ch = this.channels[c], white = r() * 2 - 1, pink = ch.pink.tick(white);
                outputs[0][c][i] = bass;
                const bodyGrain = ch.bodyCloud.tick(this.bodyRate), splashGrain = ch.splashCloud.tick(this.splashRate);
                const bodyWash = ch.body.tick(pink) * this.bodyLevel;
                outputs[1][c][i] = bodyWash * (1 - .82 * this.texture)
                    + ch.impactBody.tick(white * bodyGrain) * this.bodyImpactLevel * this.texture;
                const mistMotion = ch.mistMotion.tick(Math.min(1.8, bodyGrain));
                outputs[2][c][i] = ch.mistSoft.tick(ch.mist.tick(pink)) * this.mistLevel
                    * (1 - .13 * this.texture + .12 * this.texture * mistMotion);
                outputs[3][c][i] = ch.sheet.tick(pink) * this.sheetLevel * (1 - .5 * this.texture + .22 * this.texture * splashGrain);
                // A small air floor under many tiny spatters, not a steady high-pass hiss.
                const air = pink - ch.air.tick(pink);
                const fryTail = ch.fryTail.tick(splashGrain);
                const sizzle = ch.sizzle.tick(white * splashGrain);
                const fryDepth = ch.fryDepth.tick(white * (.5 * splashGrain + .5 * fryTail));
                outputs[4][c][i] = air * this.hissLevel * (1 - .9 * this.texture)
                    + (.9 * sizzle + .5 * fryDepth) * this.splashImpactLevel * this.texture;
                outputs[5][c][i] = 0;
            }
            // Integrate a changing intensity (Cox process). Constant rate reduces to Poisson.
            this.hazard -= this.rateNow / sr;
            while (this.hazard <= 0) { this.drop(); this.hazard += -Math.log(Math.max(1e-9, this.eventRng())); }
            for (const v of this.voices) {
                if (v.remaining <= 0) continue;
                const noise = this.impactRng() * 2 - 1;
                const attack = Math.min(1, v.age / v.attack);
                for (const f of v.fragments) if (v.age === f.at) v.splashEnvelope += f.amp;
                if (v.material === 'puddle' && (v.age & 63) === 0) {
                    // Weak, broad falling colour inside the noise; no audible sine tail.
                    v.colour.set(v.hz * (1 - .18 * Math.min(1, v.age / (sr * .02))), .7);
                }
                const nearU = Math.min(1, v.age / v.nearAttack), nearAttack = nearU * nearU * (3 - 2 * nearU);
                const impact = v.colour.tick(noise) * v.envelope * nearAttack;
                const body = v.body.tick(noise) * v.bodyEnvelope * attack;
                const air = noise - v.air.tick(noise);
                const splash = air * v.splashEnvelope * v.brightness;
                v.nearSplash += v.nearSplashRise * (v.splashEnvelope - v.nearSplash);
                const softSplash = air * v.nearSplash * v.brightness;
                const x = (impact * 1.25 + body * nearAttack * .4 + softSplash * .18) * v.nearAmp;
                outputs[5][0][i] += x * v.left; outputs[5][1][i] += x * v.right;
                for (let c = 0; c < 2; c++) {
                    const pan = c === 0 ? v.left : v.right;
                    const u = Math.min(1, v.age / v.distantAttack), roundedAttack = u * u * (3 - 2 * u);
                    outputs[1][c][i] += body * roundedAttack * v.amp * pan * this.texture * .35;
                    outputs[4][c][i] += splash * v.amp * pan * this.texture * .18;
                }
                v.envelope *= v.decay; v.bodyEnvelope *= v.bodyDecay; v.splashEnvelope *= v.splashDecay;
                v.age++; v.remaining--;
            }
            // Apply after summing cloud and foreground puffs, so no sharp route
            // bypasses the body's dull, distant response. Keep near drops separate.
            for (let c = 0; c < 2; c++) {
                const damp = this.channels[c].bodyDamp;
                outputs[1][c][i] = damp[1].tick(damp[0].tick(outputs[1][c][i]));
                const nearDamp = this.channels[c].nearDamp;
                outputs[5][c][i] = nearDamp[1].tick(nearDamp[0].tick(outputs[5][c][i]));
            }
        }
    }
}
