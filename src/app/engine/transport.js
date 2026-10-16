// Lookahead scheduler on the AudioContext clock (docs/DESIGN.md
// §2.4). A coarse timer wakes every `interval` ms and books every beat that
// starts within the next `lookahead` seconds at its exact audio time, so
// timer jitter never reaches the audio. Same model as metronome.js's
// scheduler, without coupling to the metronome singleton or its UI.

import { audioContext } from '../../audio/context';
import { isMobile } from '../../audio/performance';

// Hidden pages get their main-thread timers throttled to about once a
// second (or frozen), far past a 0.4 s window - so while hidden the window is
// this long instead, and the tick comes from a Worker, whose timers aren't
// throttled the same way.
const HIDDEN_LOOKAHEAD = isMobile() ? 20 : 10; // (a phone is the likelier to be locked)
// A locked phone may not run the tick for many seconds at a time, and the
// music then goes - 10 s of it, a gap, 10 s, a gap. So the hidden window also
// grows to cover the longest silence between ticks actually seen (twice that,
// and a margin), up to this much.
const MAX_HIDDEN_LOOKAHEAD = 45;

const TICK_WORKER_SOURCE = 'let id=null;onmessage=(e)=>{clearInterval(id);id=null;if(e.data>0)id=setInterval(()=>postMessage(0),e.data)};';

function startTicker(callback, interval) {
    try {
        const url = URL.createObjectURL(new Blob([TICK_WORKER_SOURCE], { type: 'text/javascript' }));
        const worker = new Worker(url);
        URL.revokeObjectURL(url);
        worker.onmessage = callback;
        worker.postMessage(interval);
        return { worker };
    } catch (e) {
        return { id: setInterval(callback, interval) };
    }
}

function stopTicker(ticker) {
    if (ticker.worker) {
        ticker.worker.postMessage(0);
        ticker.worker.terminate();
    } else {
        clearInterval(ticker.id);
    }
}

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
        this.baseLookahead = lookahead;
        this.interval = interval;
        this.listeners = new Set();
        this.timer = null;
        this.rebaseAt = null;
        // the longest stretch (audio seconds) lately between two ticks, while the page was hidden
        this.slowestGap = 0;
        this.lastTick = null;
    }

    get hidden() {
        return typeof document !== 'undefined' && document.visibilityState === 'hidden';
    }

    get lookahead() {
        if (!this.hidden) return this.baseLookahead;
        const observed = Math.min(MAX_HIDDEN_LOOKAHEAD, this.slowestGap * 2 + 2);
        return Math.max(this.baseLookahead, HIDDEN_LOOKAHEAD, observed);
    }

    set lookahead(seconds) {
        this.baseLookahead = seconds;
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
        this.lastTick = null;
        this.nextBeatTime = this.AC.currentTime + 0.1;
        this.tick();
        this.timer = startTicker(() => this.tick(), this.interval);
    }

    stop() {
        if (this.timer && this.timer !== 1) stopTicker(this.timer);
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

    // How long the timer left us since the last tick, in audio time: the slowest
    // lately (easing off by 1% a second) is what the hidden lookahead has to cover.
    watchGap() {
        const now = this.AC.currentTime;
        if (this.lastTick !== null && this.hidden && this.AC.state === 'running') {
            const gap = now - this.lastTick;
            this.slowestGap = Math.max(gap, this.slowestGap * Math.pow(0.99, Math.max(0, gap)));
        }
        this.lastTick = now;
    }

    tick() {
        this.watchGap();
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
