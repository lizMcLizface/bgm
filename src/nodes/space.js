// Shimmer and freeze (public/space-processor.js) as Instrument effect stages: input -> worklet ->
// output, with the dry sound passing straight through until the worklet has loaded (or where
// AudioWorklet is missing, for good). The worklet (and its buffers) is made once the effect is
// first mixed in.

const moduleLoads = new WeakMap();
function loadModule(AC) {
    if (!moduleLoads.has(AC)) moduleLoads.set(AC, AC.audioWorklet.addModule(`${import.meta.env.BASE_URL}space-processor.js`));
    return moduleLoads.get(AC);
}
/** Resolves once the processors are loaded into AC (or failed to): renders wait for it. */
export const spaceReady = (AC) => (AC.audioWorklet ? loadModule(AC).catch(() => {}) : Promise.resolve());

export const SHIMMER_INTERVALS = { fifth: 7, octave: 12, twelfth: 19, twoOctaves: 24 };

class SpaceStage {
    constructor(AC, processor, settings) {
        this.AC = AC;
        this.input = AC.createGain();
        this.output = AC.createGain();
        this.input.connect(this.output);
        this.settings = settings;
        this.processor = processor;
        this.node = null;
    }

    ensure() {
        if (this.loading || !this.AC.audioWorklet) return;
        const { AC, processor } = this;
        this.loading = true;
        loadModule(AC).then(() => {
            if (this.disposed) return;
            this.node = new AudioWorkletNode(AC, processor, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
            this.node.port.postMessage({ type: 'set', ...this.settings });
            this.input.disconnect(this.output);
            this.input.connect(this.node);
            this.node.connect(this.output);
        }, (error) => console.warn(`The ${processor} effect could not be loaded; playing dry.`, error));
    }

    getNode = () => this.input;
    connect = (destination) => [].concat(destination).forEach((d) => this.output.connect(d));
    set(values) {
        Object.assign(this.settings, values);
        if (this.settings.mix > 0) this.ensure();
        this.node?.port.postMessage({ type: 'set', ...values });
    }
    clear = () => this.node?.port.postMessage({ type: 'clear' });
    dispose() {
        this.disposed = true;
        this.input.disconnect();
        this.node?.disconnect();
        this.node?.port.close();
    }
}

export class Shimmer extends SpaceStage {
    constructor(AC) { super(AC, 'calmbgm-shimmer', { mix: 0, decay: 6, semitones: 12, climb: 0.5, tone: 7000 }); }
    setMix = (mix) => this.set({ mix: Math.min(1, Math.max(0, mix)) });
    setDecay = (decay) => this.set({ decay });
    setShift = (name) => this.set({ semitones: SHIMMER_INTERVALS[name] ?? 12 });
    setClimb = (climb) => this.set({ climb: Math.min(0.95, Math.max(0, climb)) });
    setTone = (tone) => this.set({ tone });
}

export class Freeze extends SpaceStage {
    constructor(AC) { super(AC, 'calmbgm-freeze', { mix: 0, hold: false, length: 2, fade: 1 }); }
    setMix = (mix) => this.set({ mix: Math.min(1, Math.max(0, mix)) });
    setHold = (hold) => this.set({ hold: !!hold });
    setLength = (length) => this.set({ length });
    setFade = (fade) => this.set({ fade });
}
