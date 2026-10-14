class WhiteNoiseProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        // 'stop' ends the processor for good (process() returns false)
        this.stopped = false;
        this.port.onmessage = (e) => { if (e.data === 'stop') this.stopped = true; };
    }

    process(inputs, outputs, parameters) {
        if (this.stopped) return false;
        const output = outputs[0];
        
        if (!output || output.length === 0) {
            return true;
        }
        
        for (let channel = 0; channel < output.length; channel++) {
            const outputChannel = output[channel];
            
            if (!outputChannel) {
                continue;
            }
            
            for (let i = 0; i < outputChannel.length; i++) {
                // White noise: random values between -1 and 1
                outputChannel[i] = (Math.random() * 2 - 1);
            }
        }
        
        return true;
    }
}

registerProcessor('white-noise-processor', WhiteNoiseProcessor);
