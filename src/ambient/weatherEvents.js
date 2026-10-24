import { random, Lowpass, Pink } from './rainModel.js';

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const rise = x => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };
const interval = rng => -Math.log(Math.max(1e-9, rng()));

// Four damped, mixed delay lines: a generated diffuse tail, with no recorded IR.
// The orthogonal feedback mix spreads reflections instead of repeating one echo.
export class DiffuseTail {
    constructor(rate) {
        this.lines = [.137, .193, .271, .367].map(seconds => ({ buffer: new Float32Array(Math.round(rate * seconds)), at: 0, low: 0 }));
        this.left = this.right = 0; this.set(rate, .65, .6);
    }
    set(rate, decay, distance) {
        this.feedback = .5 + .3 * decay;
        this.damping = 1 - Math.exp(-2 * Math.PI * (900 - 650 * distance) / rate);
    }
    tick(left, right) {
        const lines = this.lines;
        for (const line of lines) line.low += this.damping * (line.buffer[line.at] - line.low);
        const a = lines[0].low, b = lines[1].low, c = lines[2].low, d = lines[3].low, f = this.feedback * .5;
        lines[0].buffer[lines[0].at] = left * .22 + (a + b + c + d) * f;
        lines[1].buffer[lines[1].at] = right * .22 + (a - b + c - d) * f;
        lines[2].buffer[lines[2].at] = left * .16 + (a + b - c - d) * f;
        lines[3].buffer[lines[3].at] = right * .16 + (a - b - c + d) * f;
        for (const line of lines) if (++line.at >= line.buffer.length) line.at = 0;
        this.left = (a + c) * .7; this.right = (b + d) * .7;
    }
}

export class ThunderEvents {
    constructor(rate, environment, seed) {
        this.rate = rate; this.rng = random(seed); this.noise = random(seed ^ 0x4165);
        this.voices = Array.from({ length: 4 }, () => ({ remaining: 0,
            dc: new Lowpass(rate, 14), low: [new Lowpass(rate, 85), new Lowpass(rate, 85)],
            body: [new Lowpass(rate, 190), new Lowpass(rate, 190)],
            crack: new Lowpass(rate, 1100),
            fronts: Array.from({ length: 5 }, () => ({ at: 0, width: 0, amp: 0 })),
            parts: Array.from({ length: 6 }, () => ({ at: 0, attack: 0, decay: 0, amp: 0 })) }));
        this.echo = new DiffuseTail(rate); this.echoLevel = 0; this.events = 0; this.skipped = 0;
        this.next = Infinity; this.environment = {}; this.setEnvironment(environment);
    }
    setEnvironment(e) {
        if (!(this.environment.thunderActivity > 0) && e.thunderActivity > 0) this.next = this.rate * (1.5 + this.rng() * 2);
        if (e.thunderActivity === 0) this.next = Infinity;
        this.environment = e; this.echo.set(this.rate, e.thunderDecay, e.thunderDistance);
    }
    trigger() {
        const v = this.voices.find(v => v.remaining <= 0); if (!v) { this.skipped++; return false; }
        const r = this.rng, e = this.environment, distance = clamp(e.thunderDistance + (r() - .5) * .14, 0, 1);
        v.age = 0; v.roll = v.rollTarget = 0; v.control = 0;
        v.rollRise = 1 - Math.exp(-1 / (this.rate * .025));
        v.gain = (.18 + .14 * e.thunderPower) * (.9 + r() * .2) / (1 + distance * .45);
        v.crackGain = .35 + .65 * (1 - distance);
        v.attack = this.rate * (.035 + .07 * distance);
        // Compact bipolar pressure fronts, rather than sustained broadband hiss.
        // Every front has zero-area positive/negative lobes and a finite support.
        let frontAt = .012 + .025 * distance;
        for (let i = 0; i < v.fronts.length; i++) {
            const f = v.fronts[i];
            f.width = .00055 + .0021 * distance + r() * .00065;
            f.at = Math.max(frontAt, f.width * 5); f.amp = i ? (.16 + .2 * r()) * (i % 2 ? -1 : 1) : 1;
            frontAt += .008 + r() * (.014 + .018 * distance);
        }
        v.boomAt = .09 + .12 * distance; v.boomWidth = .018 + .018 * distance;
        v.crack.set(650 + 1100 * (1 - distance)); v.crack.y = 0;
        const rollSeconds = .85 + 1.7 * e.thunderDecay;
        const pan = (r() * 2 - 1) * .65; v.left = Math.sqrt((1 - pan) * .5); v.right = Math.sqrt((1 + pan) * .5);
        let at = .025 + .06 * distance;
        for (let i = 0; i < v.parts.length; i++) {
            if (i) at += .25 + r() * (.35 + .7 * e.thunderDecay);
            const part = v.parts[i]; part.at = at; part.amp = i ? .2 + r() * .45 : 1;
            part.attack = .12 + distance * .22 + r() * .2; part.decay = rollSeconds * (.7 + r() * .45);
        }
        v.remaining = Math.ceil((at + rollSeconds * 8) * this.rate);
        v.dc.y = 0; for (const f of [...v.low, ...v.body]) f.y = 0;
        v.noiseGain = Math.sqrt(this.rate / 48000);
        this.events++; this.lastVoice = v; return true;
    }
    process(outputs, offset = 6) {
        const n = outputs[offset][0].length, r = this.noise;
        for (let i = 0; i < n; i++) {
            if (--this.next <= 0) {
                this.trigger(); const activity = this.environment.thunderActivity;
                this.next = this.rate * (9 + (1 - activity) * 18 + interval(this.rng) * (7 + 60 * (1 - activity)));
            }
            let crackL = 0, crackR = 0, rollL = 0, rollR = 0;
            for (const v of this.voices) {
                if (v.remaining <= 0) continue;
                const t = v.age / this.rate, white = r() * 2 - 1;
                if (v.control-- <= 0) {
                    v.rollTarget = 0;
                    for (const part of v.parts) {
                        const dt = t - part.at;
                        if (dt >= 0) v.rollTarget += part.amp * (1 - Math.exp(-dt / part.attack)) ** 2 * Math.exp(-dt / part.decay);
                    }
                    v.control = 31;
                }
                v.roll += v.rollRise * (v.rollTarget - v.roll);
                let front = 0;
                for (const f of v.fronts) {
                    const u = (t - f.at) / f.width;
                    if (Math.abs(u) < 5) front += f.amp * (1 - u * u) * Math.exp(-.5 * u * u);
                }
                const bu = (t - v.boomAt) / v.boomWidth;
                const boom = Math.abs(bu) < 5 ? (1 - bu * bu) * Math.exp(-.5 * bu * bu) : 0;
                const crack = v.crack.tick(front * 1.3 + boom * .7) * v.crackGain * v.gain;
                const dry = white - v.dc.tick(white);
                const deep = v.low[1].tick(v.low[0].tick(dry));
                const body = v.body[1].tick(v.body[0].tick(dry));
                const roll = (deep * 10 + body * .9) * v.noiseGain * v.roll * v.gain;
                crackL += crack * v.left; crackR += crack * v.right;
                // The low body spreads less than the direct crack.
                rollL += roll * (.65 + .35 * v.left); rollR += roll * (.65 + .35 * v.right);
                v.age++; v.remaining--;
            }
            this.echo.tick(crackL + .55 * rollL, crackR + .55 * rollR);
            outputs[offset][0][i] = crackL; outputs[offset][1][i] = crackR;
            outputs[offset + 1][0][i] = rollL; outputs[offset + 1][1][i] = rollR;
            outputs[offset + 2][0][i] = this.echo.left; outputs[offset + 2][1][i] = this.echo.right;
            this.echoLevel += .001 * ((Math.abs(this.echo.left) + Math.abs(this.echo.right)) * .5 - this.echoLevel);
        }
    }
    stats() {
        const active = this.voices.filter(v => v.remaining > 0).length, v = this.lastVoice;
        return { events: this.events, active, skipped: this.skipped,
            phase: active ? (v?.age < v?.attack * 3 ? 'crack' : 'rolling') : this.echoLevel > .00001 ? 'echoes' : 'quiet' };
    }
}

export class SurfEvents {
    constructor(rate, environment, seed) {
        this.rate = rate; this.rng = random(seed); this.noise = random(seed ^ 0x93672);
        this.voices = Array.from({ length: 8 }, () => ({ remaining: 0,
            pink: new Pink(), leftPink: new Pink(), rightPink: new Pink(),
            low: new Lowpass(rate, 180), dc: new Lowpass(rate, 45),
            leftWater: new Lowpass(rate, 2600), rightWater: new Lowpass(rate, 2600),
            motion: new Lowpass(rate, 3) }));
        this.events = 0; this.skipped = 0; this.next = Infinity; this.environment = {}; this.setEnvironment(environment);
    }
    setEnvironment(e) {
        if (!(this.environment.surfLevel > 0) && e.surfLevel > 0) this.next = this.rate * (.15 + this.rng() * .5);
        if (e.surfLevel === 0) this.next = Infinity;
        this.environment = e;
    }
    trigger(manual = false) {
        const v = this.voices.find(v => v.remaining <= 0); if (!v) { this.skipped++; return false; }
        const e = this.environment, r = this.rng;
        v.age = 0; v.size = (.35 + .9 * e.waveSize) * (.8 + .4 * r());
        v.level = (.18 + .16 * v.size) * (manual ? Math.max(.65, e.surfLevel) : e.surfLevel);
        v.build = 1.5 + 1.6 * v.size; v.foamTime = 1.6 + 2.5 * e.waveFoam + .7 * v.size;
        const pan = (r() * 2 - 1) * .22; v.left = Math.sqrt((1 - pan) * .5); v.right = Math.sqrt((1 + pan) * .5);
        v.washStart = v.build + .8; v.handoff = 3 + e.waveFoam * 1.5;
        v.remaining = Math.ceil((v.build + v.foamTime * 8) * this.rate);
        v.low.y = v.dc.y = v.leftWater.y = v.rightWater.y = v.motion.y = 0;
        v.pink = new Pink(); v.leftPink = new Pink(); v.rightPink = new Pink();
        v.motionGain = Math.sqrt(this.rate / 48000) * 65;
        this.events++; this.lastVoice = v; return true;
    }
    process(outputs, offset = 9) {
        const n = outputs[offset][0].length, r = this.noise;
        for (let i = 0; i < n; i++) {
            if (--this.next <= 0) {
                this.trigger();
                this.next = this.rate * (15 - 10 * this.environment.wavePace) * (.78 + .44 * this.rng());
            }
            let surgeL = 0, surgeR = 0, breakL = 0, breakR = 0, washL = 0, washR = 0;
            for (const v of this.voices) {
                if (v.remaining <= 0) continue;
                const t = v.age / this.rate, dt = t - v.build;
                const envelope = rise(t / v.build) * Math.exp(-Math.max(0, dt) / v.foamTime);
                // Partition ONE coherent water event. The weights sum to one;
                // no separate noise burst, filter sweep or new excitation at a handoff.
                const breaking = rise((dt + .7) / 1.8), retreat = rise((t - v.washStart) / v.handoff);
                const approachWeight = 1 - breaking, breakWeight = breaking * (1 - retreat), washWeight = breaking * retreat;
                const common = r() * 2 - 1, left = r() * 2 - 1, right = r() * 2 - 1, pink = v.pink.tick(common);
                const dry = pink - v.dc.tick(pink), deep = v.low.tick(dry);
                const turbulence = 1 + .14 * Math.tanh(v.motion.tick(common) * v.motionGain);
                const l = v.leftWater.tick(.65 * dry + .35 * v.leftPink.tick(left));
                const rr = v.rightWater.tick(.65 * dry + .35 * v.rightPink.tick(right));
                const gain = envelope * turbulence * v.level;
                const waterL = (l * 1.5 + deep * .9) * gain * v.left;
                const waterR = (rr * 1.5 + deep * .9) * gain * v.right;
                surgeL += waterL * approachWeight; surgeR += waterR * approachWeight;
                breakL += waterL * breakWeight; breakR += waterR * breakWeight;
                washL += waterL * washWeight; washR += waterR * washWeight;
                v.age++; v.remaining--;
            }
            outputs[offset][0][i] = surgeL; outputs[offset][1][i] = surgeR;
            outputs[offset + 1][0][i] = breakL; outputs[offset + 1][1][i] = breakR;
            outputs[offset + 2][0][i] = washL; outputs[offset + 2][1][i] = washR;
        }
    }
    stats() {
        const active = this.voices.filter(v => v.remaining > 0).length, v = this.lastVoice, t = v ? v.age / this.rate - v.build : 0;
        return { events: this.events, active, skipped: this.skipped, phase: active ? t < 0 ? 'approaching' : t < 1.7 ? 'breaking' : 'receding' : 'quiet' };
    }
}
