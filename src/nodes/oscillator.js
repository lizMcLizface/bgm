import { dutyCycleCurve } from './pulseCurve';
const MAX_FREQ = 44100;

// Waveforms beyond the built-in four, as harmonic amplitudes (sine terms,
// fundamental first) - organ drawbars, a hollow clarinet-like odd series, a
// soft "ah", sparse glassy partials, a reed. Built once per context.
export const PERIODIC_WAVES = {
    organ: [1, 0.8, 0.6, 0.5, 0, 0.3, 0, 0.25],
    hollow: [1, 0, 0.5, 0, 0.3, 0, 0.18, 0, 0.1, 0, 0.05],
    choir: [1, 0.7, 0.9, 0.5, 0.3, 0.25, 0.15, 0.2, 0.18, 0.1, 0.06, 0.04],
    glass: [1, 0, 0, 0.35, 0, 0, 0, 0, 0.2, 0, 0, 0, 0.1],
    reed: Array.from({ length: 16 }, (_, i) => (i % 2 ? 0.7 : 1) / Math.pow(i + 1, 1.3)),
};
const periodicCache = new WeakMap();
function periodicWave(AC, type) {
    let waves = periodicCache.get(AC);
    if (!waves) periodicCache.set(AC, (waves = {}));
    if (!waves[type]) {
        const amps = PERIODIC_WAVES[type];
        const real = new Float32Array(amps.length + 1);
        const imag = new Float32Array(amps.length + 1);
        amps.forEach((a, i) => { imag[i + 1] = a; });
        waves[type] = AC.createPeriodicWave(real, imag);
    }
    return waves[type];
}

class Oscillator {
    constructor(AC) {
        this.AC = AC;
        this.WAVEFORMS = ['off', 'sine', 'triangle', 'square', 'sawtooth', 'square_dc', ...Object.keys(PERIODIC_WAVES)];
        this.node = this.AC.createOscillator();
        // Detune only carries vibrato: once per 128-frame block is smooth
        // for a few-Hz LFO and costs half as much as per sample
        // (docs/DESIGN.md §5). Firefox lacks automationRate; harmless there.
        this.node.detune.automationRate = 'k-rate';
        this.waveShaper = null;
        
        // Create a stable output buffer node that never changes
        this.outputBuffer = this.AC.createGain();
        this.outputBuffer.gain.value = 1.0; // Unity gain, just acts as a buffer
        
        this.currentType = 'sine';
        this.dutyCycle = 0.5; // Default 50% duty cycle
        
        // Initially connect oscillator directly to output buffer
        this.node.connect(this.outputBuffer);
    }

    connect = (destination) => {
        if (Array.isArray(destination)) {
            destination.forEach((dest) => this.outputBuffer.connect(dest));
        } else {
            this.outputBuffer.connect(destination);
        }
    }
    
    disconnect = () => {
        try {
            this.outputBuffer.disconnect();
        } catch (e) {
            console.warn('Failed to disconnect Oscillator:', e);
        }
    }
    
    start = (when) => {console.log("Starting oscillator at:", when); this.node.start(when);}

    // Getters
    getNode = () => this.outputBuffer; // Always return the stable output buffer
    getOscillatorNode = () => this.node; // Return the actual oscillator for modulation
    getType = () => this.currentType;
    getFreq = () => this.node.frequency.value;
    getDutyCycle = () => this.dutyCycle;

    // Create waveshaper curve for duty cycle square wave
    createDutyCycleCurve = dutyCycleCurve;

    // Setters
    setType = (type) => {
        if (!this.WAVEFORMS.includes(type)) return false;
        
        this.currentType = type;
        
        if (type === 'off') {
            // Disconnect everything when off
            this.node.disconnect();
            if (this.waveShaper) {
                this.waveShaper.disconnect();
            }
            // Set gain to 0 to silence the oscillator
            this.outputBuffer.gain.value = 0;
        } else if (type === 'square_dc') {
            // Ensure gain is back to 1 when not off
            this.outputBuffer.gain.value = 1.0;
            
            // Use waveshaper for duty cycle control
            if (!this.waveShaper) {
                this.waveShaper = this.AC.createWaveShaper();
            }
            
            // Disconnect current setup and reconnect through waveshaper
            this.node.disconnect();
            this.node.type = 'triangle'; // Use triangle as source
            
            // Update the curve with current duty cycle
            this.waveShaper.curve = this.createDutyCycleCurve(this.dutyCycle);
            
            // Connect: oscillator -> waveshaper -> output buffer
            this.node.connect(this.waveShaper);
            this.waveShaper.disconnect(); // Clear any existing connections
            this.waveShaper.connect(this.outputBuffer);
        } else {
            // Ensure gain is back to 1 when not off
            this.outputBuffer.gain.value = 1.0;
            
            // Use built-in waveforms
            // Disconnect waveshaper if it exists
            if (this.waveShaper) {
                this.node.disconnect();
                this.waveShaper.disconnect();
            }
            
            // Set built-in waveform and connect directly to output buffer
            if (PERIODIC_WAVES[type]) this.node.setPeriodicWave(periodicWave(this.AC, type));
            else this.node.type = type;
            this.node.connect(this.outputBuffer);
        }
    }
    
    setDutyCycle = (dutyCycle) => {
        this.dutyCycle = Math.max(0.01, Math.min(0.99, dutyCycle)); // Clamp between 1% and 99%
        
        if (this.currentType === 'square_dc' && this.waveShaper) {
            this.waveShaper.curve = this.createDutyCycleCurve(this.dutyCycle);
        }
    }
    
    setFreq = (freq, time = 0, startTime = null) => {
        if (freq < 0 || freq > MAX_FREQ) return false;
        
        // Use provided startTime or current time + small offset to ensure simultaneous scheduling
        const scheduledTime = startTime !== null ? startTime : (this.AC.currentTime + 0.001);
        
        try {
            if (time > 0) {
                // Cancel any pending frequency changes to prevent conflicts
                this.node.frequency.cancelScheduledValues(scheduledTime);
                // Set current value first, then ramp
                this.node.frequency.setValueAtTime(this.node.frequency.value, scheduledTime);
                // Use linear ramp for smooth frequency transitions (prevents clicks)
                this.node.frequency.linearRampToValueAtTime(freq, scheduledTime + time);
            } else {
                // Cancel any pending changes and set immediately
                this.node.frequency.cancelScheduledValues(scheduledTime);
                this.node.frequency.setValueAtTime(freq, scheduledTime);
            }
        } catch (e) {
            console.warn('Failed to set oscillator frequency:', e);
            // Fallback: try simple immediate set
            try {
                this.node.frequency.setValueAtTime(freq, scheduledTime);
            } catch (fallbackError) {
                console.warn('Fallback frequency set also failed:', fallbackError);
            }
        }
    }
}

export default Oscillator;
