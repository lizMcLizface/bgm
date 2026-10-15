// Noise source (white / pink / brown) feeding a stable gain node.
//
// The generator node only exists while the noise is in use (setActive) -
// a noise processor that keeps running at 0% mix still costs audio-thread
// time on every voice (docs/DESIGN.md §5). Processors stop for
// real on a 'stop' message (their process() returns false). The worklet
// modules are loaded once per AudioContext, and the ScriptProcessorNode
// fallback (main thread - prone to dropouts) is only used where
// AudioWorklet is missing or failed to load.

const PROCESSORS = { white: 'white-noise-processor', pink: 'pink-noise-processor', brown: 'brown-noise-processor' };

// AudioContext -> Promise of its modules being loaded (rejects on failure).
const moduleLoads = new WeakMap();
function loadModules(AC) {
    if (!moduleLoads.has(AC)) {
        // Relative to the site's base path (vite.config.js `base`), not the
        // domain root. BASE_URL ends with a slash.
        moduleLoads.set(AC, Promise.all(Object.values(PROCESSORS).map((name) =>
            AC.audioWorklet.addModule(`${import.meta.env.BASE_URL}${name}.js`))));
    }
    return moduleLoads.get(AC);
}

/** Resolves once the noise processors are loaded into AC (or failed to). */
export const noiseReady = (AC) => (AC.audioWorklet ? loadModules(AC).catch(() => {}) : Promise.resolve());

class NoiseGenerator {
    constructor(AC) {
        this.AC = AC;
        this.workletNode = null;
        this.gainNode = new GainNode(AC, { gain: 1 }); // Start with gain 1, mixer will control it
        this.currentNoiseType = 'white';
        this.usingFallback = false;
        this.silentGain = null; // Track silent connection for cleanup
        this.active = false;
        this.workletState = AC.audioWorklet ? 'loading' : 'unsupported';

        if (AC.audioWorklet) {
            loadModules(AC).then(
                () => {
                    this.workletState = 'ready';
                    if (this.active && !this.workletNode) this.createNode();
                },
                (error) => {
                    console.error('Failed to initialize noise worklets, using fallback:', error);
                    this.workletState = 'unsupported';
                    if (this.active && !this.workletNode) this.createNode();
                },
            );
        }
    }

    /** Runs the noise source only while it can be heard. */
    setActive(active) {
        if (active === this.active) return;
        this.active = active;
        if (active) this.createNode();
        else this.cleanupCurrentNode();
    }

    createNode() {
        this.cleanupCurrentNode();
        if (this.workletState === 'loading') return; // created once the modules load
        if (this.workletState === 'ready') {
            try {
                this.workletNode = new AudioWorkletNode(this.AC, PROCESSORS[this.currentNoiseType] || PROCESSORS.white);
                this.workletNode.connect(this.gainNode);
                this.usingFallback = false;
                return;
            } catch (error) {
                console.error('Failed to create noise worklet, using fallback:', error);
            }
        }
        this.initializeFallback();
    }

    initializeFallback() {
        // Fallback using ScriptProcessorNode for browsers without AudioWorklet
        const bufferSize = 4096;
        this.workletNode = this.AC.createScriptProcessor(bufferSize, 0, 1);

        this.workletNode.onaudioprocess = (event) => {
            const outputData = event.outputBuffer.getChannelData(0);
            // Simplified pink/brown for the fallback: scaled white noise
            const scale = { white: 1, pink: 0.5, brown: 0.3 }[this.currentNoiseType] || 0;
            for (let i = 0; i < outputData.length; i++) {
                outputData[i] = (Math.random() * 2 - 1) * scale;
            }
        };

        this.workletNode.connect(this.gainNode);

        // ScriptProcessorNode needs to be connected to destination to actually process
        // Create a silent connection to ensure processing happens
        this.silentGain = this.AC.createGain();
        this.silentGain.gain.value = 0;
        this.workletNode.connect(this.silentGain);
        this.silentGain.connect(this.AC.destination);

        this.usingFallback = true;
    }

    cleanupCurrentNode() {
        if (this.workletNode) {
            try {
                if (this.usingFallback) {
                    this.workletNode.onaudioprocess = null;
                } else {
                    this.workletNode.port.postMessage('stop');
                }
                this.workletNode.disconnect();
            } catch (error) {
                console.warn('Error disconnecting noise node:', error);
            }
            this.workletNode = null;
        }

        // Clean up silent connection for fallback
        if (this.silentGain) {
            try {
                this.silentGain.disconnect();
            } catch (error) {
                console.warn('Error disconnecting silent gain:', error);
            }
            this.silentGain = null;
        }
    }

    setNoiseType(type) {
        if (this.currentNoiseType === type) return;
        this.currentNoiseType = type;
        if (this.active) this.createNode();
    }

    setGain(gain) {
        try {
            this.gainNode.gain.setValueAtTime(gain, this.AC.currentTime);
        } catch (error) {
            console.warn('Error setting noise gain:', error);
        }
    }

    connect(destination) {
        this.gainNode.connect(destination);
    }

    disconnect() {
        this.gainNode.disconnect();
    }

    // Cleanup method to properly dispose of resources
    destroy() {
        this.active = false;
        this.cleanupCurrentNode();
        try {
            this.gainNode.disconnect();
        } catch (error) {
            console.warn('Error disconnecting gain node:', error);
        }
    }

    getNode() {
        return this.gainNode;
    }
}

export default NoiseGenerator;
