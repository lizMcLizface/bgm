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
// It also listens for silence: a run of quanta with nothing in them (below
// -100 dB) that ends is posted as { silence: seconds } - a gap in the sound
// the page can log (src/audio/silenceLog.js).
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
        this.silentFrames = 0;
    }

    process(inputs) {
        let peak = 0;
        const input = inputs[0] || [];
        for (let c = 0; c < input.length; c++) {
            const data = input[c];
            for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
        }
        if (peak < 1e-5) {
            this.silentFrames += 128;
        } else {
            if (this.silentFrames >= sampleRate * 0.1) this.port.postMessage({ silence: this.silentFrames / sampleRate });
            this.silentFrames = 0;
        }
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
