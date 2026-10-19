// Slow wandering (docs/DESIGN.md §9): a voice's pan, volume, filter and
// pitch drift on very slow sine waves (a minute or so a round) instead of
// jumping at progression changes. The waves run on the audio thread as
// oscillators feeding AudioParams, so the movement is smooth, costs no
// timers, and an offline render can pick it up at any point in the piece
// (`offset`: seconds already elapsed) and get the same movement.
//
// Pan and volume sit after each role's mixer gain (RoleWander); filter
// cutoff and pitch are in cents on the instrument itself
// (Instrument.setWander), so they follow the sound, not the mix.
//
// Each voice and each kind of movement has its own period (the setting's,
// within about 15% either way) and phase, fixed by the voice and the kind -
// the voices never move together, and a render matches what was heard.
//
// Two kinds of movement (WANDER_MODES): smooth sine waves, or a bounded
// random walk ("brownian"): a seeded Ornstein-Uhlenbeck path, so over time
// it is normally distributed around the centre, is pulled back from the
// edges and is folded back at +-1. The walk is booked on a param as
// linear ramps between knots every WALK_STEP seconds - ahead of the clock
// while playing, all at once in an offline render - and the path is a
// pure function of its seed, so a render can start anywhere in it.

import { seeded, normal } from '../random';

export const WANDER_MODES = { sine: 'Smooth waves', brownian: 'Random walk' };

export const WANDER_ROLES = ['lead', 'counter', 'pad', 'bass', 'perc'];
const KINDS = ['pan', 'volume', 'filter', 'pitch'];

export const WANDER_LIMITS = {
    period: { min: 15, max: 300, step: 5 },
    pan: { min: -1, max: 1, step: 0.05 },
    volume: { min: 0, max: 0.6, step: 0.02 }, // +- fraction of the voice's level
    filter: { min: 0, max: 2, step: 0.05 }, // +- octaves of cutoff
    pitch: { min: 0, max: 30, step: 1 }, // +- cents
};

/** Fresh default wander settings: gentle, on for the melodic voices (not the bass or drums). */
export const defaultWander = () => ({
    period: 60,
    pan: { min: -0.6, max: 0.6 },
    volume: 0.12,
    filter: 0.35,
    pitch: 5,
    voices: { lead: true, counter: true, pad: true, bass: false, perc: false },
    mode: 'sine',
});

// The ambient bed's wander (engine/ambience.js): the whole bed's level and
// each layer's own drift by up to +- that fraction, on a slow round.
export const AMBIENCE_WANDER_LIMITS = {
    period: { min: 30, max: 600, step: 10 },
    total: { min: 0, max: 0.5, step: 0.01 },
    layers: { min: 0, max: 0.8, step: 0.01 },
};
export const defaultAmbienceWander = () => ({ mode: 'brownian', total: 0.08, layers: 0.2, period: 180 });

const fraction = (x) => x - Math.floor(x);
const slot = (role, kind) => WANDER_ROLES.indexOf(role) * KINDS.length + KINDS.indexOf(kind);

/** A voice's phase for a kind of movement, 0..1 of a round (fixed). */
export const wanderPhase = (role, kind) => fraction(slot(role, kind) * 0.618034 + 0.17);

/** Seconds per round: the setting's period times a factor 0.85 .. 1.15 per voice and kind. */
export const wanderPeriod = (period, role, kind) => period * (0.85 + 0.3 * fraction(slot(role, kind) * 0.381966 + 0.43));

/** The seed of a voice's walk for a kind of movement (fixed). */
export const wanderSeed = (role, kind) => 7919 + slot(role, kind) * 131;

const WALK_STEP = 2; // seconds between the walk's knots
const WALK_SIGMA = 0.4; // spread of the walk around the centre (the limits are +-1)
const WALK_AHEAD = 90; // seconds booked ahead while playing
const WALK_REFILL = 15000; // ms between top-ups

// Reflects x into -1..1.
const fold = (x) => {
    const y = (((x + 1) % 4) + 4) % 4;
    return (y <= 2 ? y : 4 - y) - 1;
};

/**
 * A seeded bounded random walk, -1..1: knots WALK_STEP seconds apart, straight
 * lines between them. Mean-reverting (over about `period / 4` seconds), so it
 * keeps coming back to the centre and, over a long time, spreads as a normal
 * distribution; reflected at the limits.
 */
export class WalkPath {
    constructor(seed, period) {
        this.rng = seeded(seed);
        this.knots = [normal(this.rng, WALK_SIGMA)];
        this.setPeriod(period);
    }

    /** Applies to knots not drawn yet. */
    setPeriod(period) {
        this.decay = Math.exp(-WALK_STEP / Math.max(WALK_STEP, period / 4));
    }

    knot(i) {
        const { knots, decay } = this;
        while (knots.length <= i) {
            const last = knots[knots.length - 1];
            knots.push(fold(last * decay + normal(this.rng, WALK_SIGMA * Math.sqrt(1 - decay * decay))));
        }
        return knots[i];
    }

    /** Value `t` seconds in. */
    valueAt(t) {
        const x = Math.max(0, t) / WALK_STEP;
        const i = Math.floor(x);
        const f = x - i;
        return this.knot(i) * (1 - f) + this.knot(i + 1) * f;
    }
}

const isOffline = (ctx) => typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;

// A walk as a signal: a constant source whose offset follows a WalkPath.
// `offset`: seconds of the piece already elapsed at context time 0
// (renders). Offline it books the whole context at once; live it keeps
// WALK_AHEAD seconds booked from a timer.
function walkSource(ctx, { seed, period, offset = 0 }) {
    const source = ctx.createConstantSource();
    source.offset.value = 0;
    source.start();
    const path = new WalkPath(seed, period);
    const origin = ctx.currentTime;
    const piece = (time) => offset + (time - origin);
    const offline = isOffline(ctx);
    let next = null; // index of the next knot to book
    const book = (until) => {
        const param = source.offset;
        if (next === null) {
            const now = ctx.currentTime;
            param.cancelScheduledValues(now);
            param.setValueAtTime(path.valueAt(piece(now)), now);
            next = Math.floor(piece(now) / WALK_STEP) + 1;
        }
        for (; origin + next * WALK_STEP - offset <= until; next++) {
            param.linearRampToValueAtTime(path.knot(next), Math.max(ctx.currentTime, origin + next * WALK_STEP - offset));
        }
    };
    let timer = null;
    return {
        node: source,
        start() {
            if (offline) {
                book(ctx.length / ctx.sampleRate + WALK_STEP);
            } else if (!timer) {
                book(ctx.currentTime + WALK_AHEAD);
                timer = setInterval(() => book(ctx.currentTime + WALK_AHEAD), WALK_REFILL);
            }
        },
        setPeriod: (seconds) => path.setPeriod(seconds),
        stop() {
            clearInterval(timer);
            timer = null;
            try { source.stop(); } catch (e) { /* already stopped */ }
            source.disconnect();
        },
    };
}

// sin(2π(t/period + phase)) as a wave table: sinφ·cos(ωt) + cosφ·sin(ωt).
function sineWave(ctx, phase) {
    const angle = 2 * Math.PI * fraction(phase);
    return ctx.createPeriodicWave(
        new Float32Array([0, Math.sin(angle)]),
        new Float32Array([0, Math.cos(angle)]),
        { disableNormalization: true },
    );
}

/**
 * A slow movement, ±1, scaled by `depth.gain` (0 until set): a sine wave,
 * or - in 'brownian' mode - a bounded random walk (setMode).
 * @param {object} options - period (seconds), phase (0..1, of the sine), offset
 *   (seconds elapsed), seed (of the walk), mode
 */
export function wanderLfo(ctx, { period, phase, offset = 0, seed = 1, mode = 'sine' }) {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(sineWave(ctx, phase + offset / period));
    osc.frequency.value = 1 / period;
    const depth = ctx.createGain();
    depth.gain.value = 0;
    osc.start();
    let walk = null;
    let walkGain = null;
    let current = null;
    const lfo = {
        osc,
        depth,
        setPeriod: (seconds) => {
            period = seconds;
            osc.frequency.value = 1 / seconds;
            if (walk) walk.setPeriod(seconds);
        },
        // Only the wave or the walk is wired into the depth at a time.
        setMode: (next) => {
            next = next === 'brownian' ? 'brownian' : 'sine';
            if (next === current) return;
            current = next;
            if (next === 'brownian') {
                if (!walk) {
                    walk = walkSource(ctx, { seed, period, offset });
                    walkGain = ctx.createGain();
                    walk.node.connect(walkGain);
                    walkGain.connect(depth);
                    walk.start();
                }
                walkGain.gain.value = 1;
                osc.disconnect();
            } else {
                if (walkGain) walkGain.gain.value = 0;
                osc.connect(depth);
            }
        },
        dispose: () => {
            try { osc.stop(); } catch (e) { /* already stopped */ }
            osc.disconnect();
            if (walk) { walk.stop(); walkGain.disconnect(); }
            depth.disconnect();
        },
    };
    lfo.setMode(mode);
    return lfo;
}

/** Whether a voice wanders at all. */
export const wanders = (wander, role) => Boolean(wander && wander.voices && wander.voices[role]);

/**
 * What Instrument.setWander takes for a role: cents of cutoff and pitch,
 * and each movement's period and phase. Off (or a drum): all zero.
 */
export function instrumentWander(wander, role, offset = 0) {
    const on = wanders(wander, role);
    return {
        filter: on ? wander.filter * 1200 : 0,
        pitch: on ? wander.pitch : 0,
        periods: { filter: wanderPeriod(wander.period, role, 'filter'), pitch: wanderPeriod(wander.period, role, 'pitch') },
        phases: { filter: wanderPhase(role, 'filter'), pitch: wanderPhase(role, 'pitch') },
        seeds: { filter: wanderSeed(role, 'filter'), pitch: wanderSeed(role, 'pitch') },
        mode: wander.mode || 'sine',
        offset,
    };
}

// Gain curves of a balance control, by pan -1..1: the side panned away
// from is turned down, the other left alone. (A StereoPannerNode folds the
// far channel into the near one on stereo input, which at hard pan doubles
// a centred sound and clips.)
const CURVE_POINTS = 2049;
const balanceCurve = (side) => Float32Array.from({ length: CURVE_POINTS }, (_, i) => {
    const pan = (2 * i) / (CURVE_POINTS - 1) - 1;
    return 1 - Math.max(0, side * pan);
});

/**
 * A role's pan and volume wander: audio goes into `input` and comes out of
 * `output`. Off, it is a plain pass-through.
 */
export class RoleWander {
    /**
     * @param {BaseAudioContext} ctx
     * @param {string} role
     * @param {object} [options]
     * @param {number} [options.offset] - seconds of the piece already elapsed (renders)
     * @param {boolean} [options.smooth=true] - ease changes in (live); renders set values at once
     */
    constructor(ctx, role, { offset = 0, smooth = true } = {}) {
        this.ctx = ctx;
        this.role = role;
        this.smooth = smooth;
        this.input = ctx.createGain(); // the volume
        this.volumeLfo = wanderLfo(ctx, { period: 60, phase: wanderPhase(role, 'volume'), seed: wanderSeed(role, 'volume'), offset });
        this.panLfo = wanderLfo(ctx, { period: 60, phase: wanderPhase(role, 'pan'), seed: wanderSeed(role, 'pan'), offset });
        this.volumeLfo.depth.connect(this.input.gain);

        // pan = centre + wave, shaped into a gain for each side
        this.panCentre = ctx.createConstantSource();
        this.panCentre.offset.value = 0;
        this.panCentre.start();
        const pan = ctx.createGain();
        this.panCentre.connect(pan);
        this.panLfo.depth.connect(pan);
        const splitter = ctx.createChannelSplitter(2);
        const merger = ctx.createChannelMerger(2);
        this.balanceShapers=[];this.followers=new Set();
        this.output = ctx.createGain();
        this.input.connect(splitter);
        [-1, 1].forEach((side, channel) => {
            const gain = ctx.createGain();
            gain.gain.value = 0;
            const shaper = ctx.createWaveShaper();
            shaper.curve = balanceCurve(side);
            this.balanceShapers.push(shaper);
            pan.connect(shaper);
            shaper.connect(gain.gain);
            splitter.connect(gain, channel);
            gain.connect(merger, 0, channel);
        });
        merger.connect(this.output);
        this.nodes = [pan, splitter, merger];
    }

    // Reuse the original control signals for an additional audio send. The
    // room route needs no second pair of oscillators, walkers or wave shapers.
    createFollower() {
        if(this.disposed)throw Error('Wander route is disposed.');
        const ctx=this.ctx,input=ctx.createGain(),output=ctx.createGain(),split=ctx.createChannelSplitter(2),merge=ctx.createChannelMerger(2),gains=[];
        this.volumeLfo.depth.connect(input.gain);input.connect(split);
        for(let ch=0;ch<2;ch++){const gain=ctx.createGain();gain.gain.value=0;this.balanceShapers[ch].connect(gain.gain);split.connect(gain,ch);gain.connect(merge,0,ch);gains.push(gain);}
        merge.connect(output);let disposed=false;
        const follower={input,output,dispose:()=>{if(disposed)return;disposed=true;this.volumeLfo.depth.disconnect(input.gain);for(let ch=0;ch<2;ch++)this.balanceShapers[ch].disconnect(gains[ch].gain);[input,output,split,merge,...gains].forEach(n=>n.disconnect());this.followers.delete(follower);}};
        this.followers.add(follower);return follower;
    }

    /** @param {object} wander - settings.wander */
    apply(wander) {
        const on = wanders(wander, this.role);
        const { min, max } = wander.pan;
        this.volumeLfo.setMode(wander.mode);
        this.panLfo.setMode(wander.mode);
        this.volumeLfo.setPeriod(wanderPeriod(wander.period, this.role, 'volume'));
        this.panLfo.setPeriod(wanderPeriod(wander.period, this.role, 'pan'));
        this.set(this.panCentre.offset, on ? (min + max) / 2 : 0);
        this.set(this.panLfo.depth.gain, on ? (max - min) / 2 : 0);
        this.set(this.volumeLfo.depth.gain, on ? wander.volume : 0);
    }

    set(param, value) {
        if (this.smooth) param.setTargetAtTime(value, this.ctx.currentTime, 0.4);
        else param.value = value;
    }

    dispose() {
        if(this.disposed)return;for(const follower of [...this.followers])follower.dispose();this.disposed=true;
        this.volumeLfo.dispose();
        this.panLfo.dispose();
        try { this.panCentre.stop(); } catch (e) { /* already stopped */ }
        this.panCentre.disconnect();
        this.input.disconnect();
        this.nodes.forEach((node) => node.disconnect());
        this.output.disconnect();
    }
}
