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
});

const fraction = (x) => x - Math.floor(x);
const slot = (role, kind) => WANDER_ROLES.indexOf(role) * KINDS.length + KINDS.indexOf(kind);

/** A voice's phase for a kind of movement, 0..1 of a round (fixed). */
export const wanderPhase = (role, kind) => fraction(slot(role, kind) * 0.618034 + 0.17);

/** Seconds per round: the setting's period times a factor 0.85 .. 1.15 per voice and kind. */
export const wanderPeriod = (period, role, kind) => period * (0.85 + 0.3 * fraction(slot(role, kind) * 0.381966 + 0.43));

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
 * A slow sine, ±1, scaled by `depth.gain` (0 until set).
 * @param {object} options - period (seconds), phase (0..1), offset (seconds elapsed)
 */
export function wanderLfo(ctx, { period, phase, offset = 0 }) {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(sineWave(ctx, phase + offset / period));
    osc.frequency.value = 1 / period;
    const depth = ctx.createGain();
    depth.gain.value = 0;
    osc.connect(depth);
    osc.start();
    return {
        osc,
        depth,
        setPeriod: (seconds) => { osc.frequency.value = 1 / seconds; },
        dispose: () => {
            try { osc.stop(); } catch (e) { /* already stopped */ }
            osc.disconnect();
            depth.disconnect();
        },
    };
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
        this.volumeLfo = wanderLfo(ctx, { period: 60, phase: wanderPhase(role, 'volume'), offset });
        this.panLfo = wanderLfo(ctx, { period: 60, phase: wanderPhase(role, 'pan'), offset });
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
        this.output = ctx.createGain();
        this.input.connect(splitter);
        [-1, 1].forEach((side, channel) => {
            const gain = ctx.createGain();
            gain.gain.value = 0;
            const shaper = ctx.createWaveShaper();
            shaper.curve = balanceCurve(side);
            pan.connect(shaper);
            shaper.connect(gain.gain);
            splitter.connect(gain, channel);
            gain.connect(merger, 0, channel);
        });
        merger.connect(this.output);
        this.nodes = [pan, splitter, merger];
    }

    /** @param {object} wander - settings.wander */
    apply(wander) {
        const on = wanders(wander, this.role);
        const { min, max } = wander.pan;
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
        this.volumeLfo.dispose();
        this.panLfo.dispose();
        try { this.panCentre.stop(); } catch (e) { /* already stopped */ }
        this.panCentre.disconnect();
        this.input.disconnect();
        this.nodes.forEach((node) => node.disconnect());
        this.output.disconnect();
    }
}
