// Lookahead scheduler on the AudioContext clock (docs/DESIGN.md
// §2.4). A coarse timer wakes every `interval` ms and books every beat that
// starts within the next `lookahead` seconds at its exact audio time, so
// timer jitter never reaches the audio. Same model as metronome.js's
// scheduler, without coupling to the metronome singleton or its UI.

import { audioContext } from '../../audio/context';

class Transport {
    /**
     * @param {object} [options]
     * @param {number} [options.bpm=72]
     * @param {number} [options.beatsPerBar=4]
     * @param {number} [options.lookahead=0.4] - seconds booked ahead; larger
     *   tolerates more timer throttling, smaller reacts faster to changes
     * @param {number} [options.interval=50] - timer period, ms
     */
    constructor({ bpm = 72, beatsPerBar = 4, lookahead = 0.4, interval = 50, context = audioContext } = {}) {
        this.AC = context;
        this.bpm = bpm;
        this.beatsPerBar = beatsPerBar;
        this.lookahead = lookahead;
        this.interval = interval;
        this.listeners = new Set();
        this.timer = null;
        this.rebaseAt = null;
    }

    get secondsPerBeat() {
        return 60 / this.bpm;
    }

    get isRunning() {
        return this.timer !== null;
    }

    /**
     * @param {function} callback - called once per beat, ahead of time, with
     *   { beat, bar, beatInBar, time, secondsPerBeat }; book audio at `time`
     * @returns {function} unsubscribe
     */
    onBeat(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    // Takes effect from the next unbooked beat.
    setBpm(bpm) {
        this.bpm = bpm;
    }

    /** @param {number} [fromBeat=0] - the first beat's number (resuming mid-piece) */
    start(fromBeat = 0) {
        if (this.timer) return;
        this.beat = fromBeat;
        this.nextBeatTime = this.AC.currentTime + 0.1;
        this.tick();
        this.timer = setInterval(() => this.tick(), this.interval);
    }

    stop() {
        clearInterval(this.timer);
        this.timer = null;
        this.rebaseAt = null;
    }

    /**
     * A new bar length from beat `at` on (a time signature change at a bar
     * line): that beat is renumbered `to`, so bar numbers carry on.
     */
    rebase(at, to, beatsPerBar) {
        this.rebaseAt = { at, to, beatsPerBar };
    }

    tick() {
        while (this.nextBeatTime < this.AC.currentTime + this.lookahead) {
            const event = {
                beat: this.beat,
                bar: Math.floor(this.beat / this.beatsPerBar),
                beatInBar: this.beat % this.beatsPerBar,
                time: this.nextBeatTime,
                secondsPerBeat: this.secondsPerBeat,
            };
            this.listeners.forEach((listener) => listener(event));
            this.nextBeatTime += this.secondsPerBeat;
            this.beat++;
            if (this.rebaseAt && this.beat === this.rebaseAt.at) {
                this.beat = this.rebaseAt.to;
                this.beatsPerBar = this.rebaseAt.beatsPerBar;
                this.rebaseAt = null;
            }
        }
    }
}

export default Transport;
