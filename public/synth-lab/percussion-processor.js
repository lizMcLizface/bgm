// All future hits are data in the Rust queue. Rendering allocates no JS arrays.
class PercussionProcessor extends AudioWorkletProcessor {
    constructor({processorOptions: options}) {
        super();
        this.dsp = new WebAssembly.Instance(options.module, {}).exports;
        this.dsp.init(sampleRate);
        this.output = new Float32Array(this.dsp.memory.buffer, this.dsp.output_ptr(), 256);
        this.left = this.output.subarray(0, 128);
        this.right = this.output.subarray(128);
        this.offline = options.endFrame != null;
        this.endFrame = options.endFrame;
        this.clock = 0;
        this.aligned = false;
        this.disposed = false;
        this.nextStats = sampleRate;
        this.peak = 0;
        this.resyncs = 0;
        this.skippedFrames = 0;
        this.failed = false;
        this.port.onmessage = ({data}) => {
            if (data.type === 'dispose') { this.dsp.clear(); this.disposed = true; }
            if (data.type === 'hit') this.dsp.hit(...data.values);
            if (data.type === 'levels') data.values.forEach((level, drum) => this.dsp.level(drum, level));
            if (data.type === 'kit') data.values.forEach(([level,tone,decay], drum) => {this.dsp.level(drum,level);this.dsp.tone_param(drum,tone);this.dsp.decay_param(drum,decay);});
            if (data.type === 'voice-preset') this.dsp.voice_preset(data.value);
            if (data.type === 'silence') this.dsp.silence(data.frame);
            if (data.type === 'clear') this.dsp.clear();
        };
        for (const data of options.messages ?? []) this.port.onmessage({data});
    }
    process(inputs, outputs) {
        if (this.disposed || this.failed) return false;
        try {
            // Repeated older currentFrame stamps must never rewind source time.
            if (!this.offline && (!this.aligned || currentFrame > this.clock)) {
                if (this.aligned) { this.resyncs++; this.skippedFrames += currentFrame - this.clock; }
                this.clock = currentFrame;
                this.dsp.set_frame(this.clock);
                this.aligned = true;
            }
            const [left, right] = outputs[0];
            const length = left.length;
            // The voice pool can sleep while a large future queue waits.
            if (!this.dsp.stat(0) && !this.dsp.stat(1)) {
                this.dsp.set_frame(this.clock + length);
            } else {
                this.dsp.process(length);
                left.set(this.left);
                right?.set(this.right);
                if (!this.offline) for (let i = 0; i < length; i++) this.peak = Math.max(this.peak, Math.abs(left[i]), Math.abs(right?.[i] || 0));
            }
            this.clock += length;
            if (!this.offline && this.clock >= this.nextStats) {
                this.nextStats = this.clock + sampleRate;
                this.port.postMessage({type:'stats',kind:'percussion',active:this.dsp.stat(0),queued:this.dsp.stat(1),steals:this.dsp.stat(2),dropped:this.dsp.stat(3),late:this.dsp.stat(4),frame:this.dsp.stat(5),peakActive:this.dsp.stat(6),peak:this.peak,memory:this.dsp.memory.buffer.byteLength,resyncs:this.resyncs,skippedFrames:this.skippedFrames});
                this.peak = 0;
            }
            return !this.offline || this.clock < this.endFrame;
        } catch (error) {
            this.failed = true;
            this.port.postMessage({type:'error',message:String(error)});
            return false;
        }
    }
}
registerProcessor('calmbgm-percussion', PercussionProcessor);
