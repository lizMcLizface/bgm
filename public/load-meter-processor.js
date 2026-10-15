// Estimates how busy the audio thread is (src/audio/loadMeter.js).
//
// The browser renders audio in bursts: when the output device asks for a
// buffer, it renders several 128-frame quanta back to back, then idles
// until the next request. This node has no outputs, so it is processed
// after everything else in each quantum; the wall-clock time between two
// of its calls inside a burst is how long the next quantum took to render.
// Gaps longer than a quantum are the idle time between bursts and are
// skipped. Worklets only have Date.now() (whole milliseconds), but the
// rounding averages out over a second of quanta.
//
// Posts { load } about once per second: average render time per quantum
// as a share of the quantum's real duration (1 = the thread is always
// busy; above that, audio drops out). null when no burst had two quanta.

class LoadMeterProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.quantumMs = (128 / sampleRate) * 1000;
        this.last = 0;
        this.busy = 0;
        this.count = 0;
        this.windowStart = currentTime;
    }

    process() {
        const now = Date.now();
        const gap = now - this.last;
        this.last = now;
        // + 1: a gap under one quantum can read as up to a millisecond more
        if (gap <= this.quantumMs + 1) {
            this.busy += gap;
            this.count++;
        }
        if (currentTime - this.windowStart >= 1) {
            this.port.postMessage({ load: this.count ? this.busy / this.count / this.quantumMs : null });
            this.busy = 0;
            this.count = 0;
            this.windowStart = currentTime;
        }
        return true;
    }
}

registerProcessor('load-meter', LoadMeterProcessor);
