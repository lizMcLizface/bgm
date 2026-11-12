import {AudioConstructorJournal,settleAudioCleanup} from '../audio/constructorJournal.js';
import {observeProcessorModule} from '../audio/processorModuleObservation.js';
import {ProcessorRetirements} from '../audio/processorRetirements.js';
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
        this.ownership=new AudioConstructorJournal({capacity:2,label:'Native Space private gains'});this.disposed=false;this.failure=null;this.disposal=null;
        try {
        this.sources=new ProcessorRetirements(AC,{label:'Native '+processor});
        this.AC = AC;
        this.input = this.ownership.create('input',()=>AC.createGain(),node=>node.disconnect());
        this.output = this.ownership.create('output',()=>AC.createGain(),node=>node.disconnect());
        this.input.connect(this.output);
        this.settings = settings;
        this.processor = processor;
        this.node = null;this.ready=Promise.resolve(this);
        }catch(error){throw this.fail(error);}
    }
    check(){if(this.disposed||this.failure)throw this.failure??Object.assign(Error('Native Space disposed'),{code:'AUDIO_OWNER_DISPOSED'});this.sources.check();}
    fail(error){this.failure??=error;const prior=error.cleanupReady;error.cleanupReady=settleAudioCleanup('Native Space failed setup',[()=>prior,()=>this.closeOwned()]);error.cleanupReady.catch(cleanupError=>{error.cleanupError??=cleanupError;});return error;}
    closeOwned(){if(this.disposal)return this.disposal;this.disposed=true;this.moduleObservation?.cancel();let resolve,reject;this.disposal=new Promise((yes,no)=>{resolve=yes;reject=no;});this.disposal.catch(()=>{});settleAudioCleanup('Native Space ownership',[()=>this.sources?.dispose(),()=>this.ownership.retire()]).then(resolve,reject);return this.disposal;}
    cleanupStatus(){return{profile:'native-space-owned-lifetime-v1',disposed:this.disposed,error:this.failure?String(this.failure):null,moduleError:this.moduleError?String(this.moduleError):null,readyScope:'owner module/setup observation, not a processor initialization or Rust-DSP proof',gains:this.ownership.status(),sources:this.sources?.status()??null};}

    ensure() {
        this.check();
        if (this.loading || !this.AC.audioWorklet) return;
        const { AC, processor } = this;
        this.loading = true;
        try {this.moduleObservation=observeProcessorModule(loadModule(AC));}
        catch(error){throw this.fail(error);}
        this.ready=this.moduleObservation.promise.then(result=>{
            if(this.disposed||result.cancelled)return this;
            if(!result.loaded){this.moduleError=result.error;console.warn(`The ${processor} effect could not be loaded; playing dry.`,result.error);return this;}
            try {
            this.node = this.sources.create('worklet',()=>new AudioWorkletNode(AC, processor, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }));
            this.node.port.postMessage({ type: 'set', ...this.settings });
            this.input.disconnect(this.output);
            this.input.connect(this.node);
            this.node.connect(this.output);
            return this;
            }catch(error){throw this.fail(error);}
        });this.ready.catch(()=>{});
    }

    getNode = () => this.input;
    connect = (destination) => {this.check();return [].concat(destination).forEach((d) => this.output.connect(d));};
    set(values) {
        this.check();
        Object.assign(this.settings, values);
        if (this.settings.mix > 0) this.ensure();
        this.node?.port.postMessage({ type: 'set', ...values });
    }
    clear = () => {this.check();return this.node?.port.postMessage({ type: 'clear' });};
    dispose() { return this.closeOwned(); }
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
