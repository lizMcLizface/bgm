// Estimates how busy the audio thread is (src/audio/loadMeter.js).
//
// Some browsers render audio in bursts: when the output device asks for a
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
// busy). This is an estimate, not a platform utilization counter. Paced or
// coarse-clock callbacks return null because their wait time cannot be separated.

class LoadMeterProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.quantumMs = (128 / sampleRate) * 1000;
        this.last = null;
        this.zeroFrames = 0;
        this.resetWindow();
        this.port.onmessage = ({data}) => { if(data.type==='reset'){this.last=null;this.zeroFrames=0;this.resetWindow();} if(data.type==='dispose'){this.disposed=true;this.port.onmessage=null;this.port.close();} };
        this.silentFrames = 0;
    }

    resetWindow(){this.busy=0;this.count=0;this.fast=0;this.idles=0;this.minimumPositive=Infinity;this.windowStart=currentTime;}

    process(inputs) {
        if(this.disposed)return false;
        let peak = 0;
        const input = inputs[0] || [];
        for (let c = 0; c < input.length; c++) {
            const data = input[c];
            for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
        }
        this.zeroFrames = peak===0 ? this.zeroFrames+128 : 0;
        if (peak < 1e-5) {
            this.silentFrames += 128;
        } else {
            if (this.silentFrames >= sampleRate * 0.1) this.port.postMessage({ silence: this.silentFrames / sampleRate });
            this.silentFrames = 0;
        }
        const now = Date.now();
        if(this.last!==null){
            const gap=now-this.last;
            if(gap>0)this.minimumPositive=Math.min(this.minimumPositive,gap);
            if(gap===0)this.fast++;
            if(gap>this.quantumMs+1)this.idles++;
            if(gap>=0&&gap<=this.quantumMs+1){this.busy+=gap;this.count++;}
        }
        this.last=now;
        if(currentTime-this.windowStart>=1){
            // A paced callback includes the device wait, not just DSP. Require
            // observable bursts and a millisecond clock; otherwise no estimate.
            const burst=this.fast>=2&&this.idles>0&&this.minimumPositive<=1&&this.count>=16;
            this.port.postMessage({load:burst?this.busy/this.count/this.quantumMs:null,loadReason:burst?'burst-estimate':'unavailable-pacing',idle:this.zeroFrames>=sampleRate});
            this.resetWindow();
        }
        return true;
    }
}

registerProcessor('load-meter', LoadMeterProcessor);
