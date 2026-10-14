import Gain from './gain';

// Bitcrusher with a dry/wet mix. The crushing node only exists while the
// wet amount is above 0, and runs as an AudioWorklet (public/
// bitcrusher-processor.js): the ScriptProcessorNode it used to be ran on
// the main thread with a 256-frame buffer, so any main-thread work (UI
// redraws) could make the audio output miss its deadline and crackle
// (docs/DESIGN.md §5). ScriptProcessorNode remains the fallback
// where AudioWorklet is unavailable.

// AudioContext -> Promise of the processor module being loaded.
const moduleLoads = new WeakMap();
function loadModule(AC) {
    if (!moduleLoads.has(AC)) {
        moduleLoads.set(AC, AC.audioWorklet.addModule(`${import.meta.env.BASE_URL}bitcrusher-processor.js`));
    }
    return moduleLoads.get(AC);
}

class BitCrusher {
    constructor(AC) {
        this.AC = AC;
        this.bufferSize = 256;
        this.bits = 8;
        this.normfreq = 0.25;
        this.amount = 0;

        this.dryGain = new Gain(this.AC);
        this.wetGain = new Gain(this.AC);
        // Stable input for the wet path; the crusher is attached behind it.
        this.wetInput = new Gain(this.AC);
        this.node = null;
        this.workletState = AC.audioWorklet ? 'loading' : 'unsupported';

        if (AC.audioWorklet) {
            loadModule(AC).then(
                () => { this.workletState = 'ready'; this.updateNode(); },
                () => { this.workletState = 'unsupported'; this.updateNode(); },
            );
        }

        this.setAmount(0);
    }

    connect = destination => {
        if (Array.isArray(destination)) {
            destination.forEach((dest) => {
                this.dryGain.connect(dest);
                this.wetGain.connect(dest);
            });
        } else {
            this.dryGain.connect(destination);
            this.wetGain.connect(destination);
        }
    }

    // Getters
    getNode = () => [this.dryGain.getNode(), this.wetInput.getNode()];
    getBitDepth = () => this.bits;
    getAmount = () => this.wetGain.getGain();

    // Creates the crushing node when wet > 0, removes it at 0.
    updateNode() {
        const wanted = this.amount > 0;
        if (!wanted && this.node) {
            if (this.node.port) this.node.port.postMessage('stop');
            else this.node.onaudioprocess = null;
            this.wetInput.getNode().disconnect();
            this.node.disconnect();
            this.node = null;
        } else if (wanted && !this.node && this.workletState !== 'loading') {
            this.node = this.workletState === 'ready'
                ? new AudioWorkletNode(this.AC, 'bitcrusher-processor', { parameterData: { bits: this.bits, normfreq: this.normfreq } })
                : this.createScriptProcessor();
            this.wetInput.connect(this.node);
            this.node.connect(this.wetGain.getNode());
        }
    }

    createScriptProcessor() {
        const node = this.AC.createScriptProcessor(this.bufferSize, 1, 1);
        let phaser = 0;
        let last = 0;
        node.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const output = e.outputBuffer.getChannelData(0);
            const step = Math.pow(0.75, this.bits);
            for (let i = 0; i < this.bufferSize; i++) {
                phaser += this.normfreq;
                if (phaser >= 1.0) {
                    phaser -= 1.0;
                    last = step * Math.floor(input[i] / step + 0.5);
                }
                output[i] = last;
            }
        };
        return node;
    }

    // Setters
    setBitDepth = bitDepth => {
        if (bitDepth === this.bits) return false;
        this.bits = bitDepth; // between 1 and 16
        if (this.node && this.node.parameters) {
            this.node.parameters.get('bits').setValueAtTime(bitDepth, this.AC.currentTime);
        }
    }

    setAmount = val => {
        this.amount = val;
        if (val < 0.5) {
            this.dryGain.setGain(1);
            this.wetGain.setGain(val * 2);
        } else {
            this.dryGain.setGain(1 - ((val - 0.5) * 2));
            this.wetGain.setGain(1);
        }
        this.updateNode();
    }
}

export default BitCrusher;
