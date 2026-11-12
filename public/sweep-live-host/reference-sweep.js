// A sweepable high-pass / low-pass on the whole mix, for the sequencer's moves (sequencer.js): a riser that
// thins the mix, a breakdown that closes down. Off means out of the way: the low-pass wide open and the
// high-pass below hearing. Built the first time a move asks for it, so a setup without one pays nothing.
export const SWEEP_OPEN = { lowpass: 22000, highpass: 10, resonance: Math.SQRT1_2 };

export class SweepFilter {
    constructor(context) {
        this.context = context;
        this.high = context.createBiquadFilter();
        this.high.type = 'highpass';
        this.low = context.createBiquadFilter();
        this.low.type = 'lowpass';
        this.high.connect(this.low);
        this.set(SWEEP_OPEN, 0);
        this.input = this.high;
        this.output = this.low;
    }

    /** Glides to { lowpass, highpass, resonance } (Hz, Hz, Q) with the given time constant in seconds. */
    set({ lowpass = SWEEP_OPEN.lowpass, highpass = SWEEP_OPEN.highpass, resonance = SWEEP_OPEN.resonance }, tc = 0.1) {
        const now = this.context.currentTime;
        for (const [param, value] of [[this.low.frequency, lowpass], [this.high.frequency, highpass], [this.low.Q, resonance], [this.high.Q, Math.SQRT1_2]]) {
            if (tc > 0) param.setTargetAtTime(value, now, tc); else param.setValueAtTime(value, now);
        }
    }

    /** Whether it is wide open (so it could be taken out of the chain). */
    get isOpen() {
        return this.low.frequency.value >= SWEEP_OPEN.lowpass * 0.95 && this.high.frequency.value <= SWEEP_OPEN.highpass * 1.5;
    }
}
