// Lookahead scheduler on the AudioContext clock (docs/DESIGN.md
// §2.4). A coarse timer wakes every `interval` ms and books every beat that
// starts within the next `lookahead` seconds at its exact audio time, so
// timer jitter never reaches the audio. Same model as metronome.js's
// scheduler, without coupling to the metronome singleton or its UI.

import { audioContext } from '../../audio/context';
import { isMobile } from '../../audio/performance';
import {startTicker,stopTicker} from '../../audio/ticker';

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
// If the page was frozen (a backgrounded phone, a stalled thread) the next beat
// can end up in the past. The beats it missed are not booked all at once - that
// plays the backlog as a burst ("really fast", all at once) - the music picks
// up where it left off, from now, as after a pause.
const LATE_LIMIT = 0.3;
// A tick books beats for at most this long (ms) once nothing is urgent, so
// filling a long lookahead window never holds the page up for long.
const TICK_BUDGET_MS = 25;
const URGENT = 0.5;

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
        // a beat's own tempo against bpm (rubato, set by the listener as the beat is booked)
        this.tempoScale = 1;
        this.baseLookahead = lookahead;
        this.interval = interval;
        this.listeners = new Set();
        this.timer = null;
        this.rebaseAt = null;
        // the longest stretch (audio seconds) lately between two ticks, while the page was hidden
        this.slowestGap = 0;
        this.lastTick = null;
        this.resetDiagnostics();
        // Fill the longer window before the first background timer wake can be
        // throttled. Returning to the page also checks the clock immediately.
        if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('visibilitychange', () => {
                if (!this.isRunning) return;
                this.wakeAudio();
                this.tick();
            });
        }
        if (this.AC && this.AC.addEventListener) this.AC.addEventListener('statechange', () => this.wakeAudio());
    }

    // The browser may suspend or interrupt the context while the page is away; while we are
    // playing and the page is visible, ask for it back.
    wakeAudio() {
        if (!this.isRunning || this.hidden || !this.AC.resume) return;
        if (this.AC.state === 'suspended' || this.AC.state === 'interrupted') this.AC.resume().catch(() => {});
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
        return 60 / (this.bpm * this.tempoScale);
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
        this.resetDiagnostics();
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
        if (this.lastTick !== null && this.AC.state === 'running') {
            const gap = now - this.lastTick;
            this.maxTickGap = Math.max(this.maxTickGap, gap);
            if (gap > Math.max(0.25, this.interval * 0.003)) this.recordDiagnostic({ type: 'wake-gap', gap, ahead: this.nextBeatTime - now });
            if (this.hidden) this.slowestGap = Math.max(gap, this.slowestGap * Math.pow(0.99, Math.max(0, gap)));
        }
        this.lastTick = now;
    }

    resetDiagnostics() {
        this.recoveries = 0;
        this.maxTickGap = 0;
        this.maxTickMs = 0;
        this.budgetHits = 0;
        this.recentDiagnostics = [];
    }

    recordDiagnostic(event) {
        this.recentDiagnostics.push({ audioTime: this.AC.currentTime, hidden: this.hidden, ...event });
        if (this.recentDiagnostics.length > 32) this.recentDiagnostics.shift();
    }

    get diagnostics() {
        return { running: this.isRunning, targetAhead: this.lookahead, nextBeatInSeconds: Number.isFinite(this.nextBeatTime) ? this.nextBeatTime - this.AC.currentTime : null,
            maxTickGap: this.maxTickGap, maxTickMs: this.maxTickMs, budgetHits: this.budgetHits, recoveries: this.recoveries, recent: this.recentDiagnostics.slice() };
    }

    tick() {
        this.watchGap();
        const now = this.AC.currentTime;
        if (this.nextBeatTime < now - LATE_LIMIT) {
            this.recoveries++;
            this.recordDiagnostic({ type: 'rebase', lateSeconds: now - this.nextBeatTime });
            this.nextBeatTime = now + 0.05;
        }
        const started = performance.now();
        let budgetHit = false;
        while (this.nextBeatTime < now + this.lookahead) {
            // (past the budget, what is left waits for the next tick - unless it is about to be heard)
            if (this.nextBeatTime > now + URGENT && performance.now() - started > TICK_BUDGET_MS) { budgetHit = true; break; }
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
        const ms = performance.now() - started;
        this.maxTickMs = Math.max(this.maxTickMs, ms);
        if (budgetHit) { this.budgetHits++; this.recordDiagnostic({ type: 'budget', ms, ahead: this.nextBeatTime - now, target: this.lookahead }); }
    }
}

export default Transport;
