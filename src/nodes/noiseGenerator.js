import {ProcessorRetirements} from '../audio/processorRetirements.js';
import {observeProcessorModule} from '../audio/processorModuleObservation.js';
import {AudioConstructorJournal,settleAudioCleanup} from '../audio/constructorJournal.js';
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
        this.AC=AC;this.disposed=false;this.failure=null;this.disposal=null;this.workletNode=null;this.silentGain=null;this.usingFallback=false;this.active=false;this.currentNoiseType='white';
        this.sources=new ProcessorRetirements(AC,{label:'Native Noise'});this.ownership=new AudioConstructorJournal({capacity:1,label:'Native Noise stable output'});
        try {
            this.gainNode=this.ownership.create('gain',()=>new GainNode(AC,{gain:1}),node=>node.disconnect());
            this.workletState=AC.audioWorklet?'loading':'unsupported';this.ready=Promise.resolve(this);
            if(AC.audioWorklet){this.moduleObservation=observeProcessorModule(loadModules(AC));this.ready=this.moduleObservation.promise.then(result=>{if(this.disposed||result.cancelled)return this;this.moduleError=result.error??null;this.workletState=result.loaded?'ready':'unsupported';if(!result.loaded)console.error('Failed to initialize noise worklets, using fallback:',result.error);if(this.active&&!this.workletNode)this.createNode();return this;});this.ready.catch(error=>{this.failure??=error;const earlier=error.cleanupReady;error.cleanupReady=settleAudioCleanup('Native Noise preparation',[()=>earlier,()=>this.destroy()]);error.cleanupReady.catch(cleanupError=>{error.cleanupError??=cleanupError;});});}
        }catch(error){this.disposed=true;this.moduleObservation?.cancel();const earlier=error.cleanupReady;error.cleanupReady=settleAudioCleanup('Native Noise constructor',[()=>earlier,()=>this.sources.dispose(),()=>this.ownership.retire()]);error.cleanupReady.catch(cleanupError=>{error.cleanupError??=cleanupError;});throw error;}
    }
    check(){if(this.disposed||this.failure)throw this.failure??Error('Native Noise disposed');this.sources.check();}
    setActive(active){this.check();if(active===this.active)return;if(active)this.sources.preflight();this.active=active;if(active)this.createNode();else this.cleanupCurrentNode();}
    createNode(){
        this.check();this.sources.preflight();this.cleanupCurrentNode();if(this.workletState==='loading')return;
        let node;
        if(this.workletState==='ready')try{node=this.sources.create('worklet',()=>new AudioWorkletNode(this.AC,PROCESSORS[this.currentNoiseType]||PROCESSORS.white));this.workletNode=node;node.connect(this.gainNode);this.usingFallback=false;return;}catch(error){if(node||error.cleanupReady){this.workletNode=null;this.failure??=error;const earlier=error.cleanupReady;error.cleanupReady=settleAudioCleanup('Native Noise partial worklet',[()=>earlier,()=>this.destroy()]);error.cleanupReady.catch(cleanupError=>{error.cleanupError??=cleanupError;});throw error;}console.error('Failed to create noise worklet, using fallback:',error);}
        try{this.initializeFallback();}catch(error){this.failure??=error;const earlier=error.cleanupReady;error.cleanupReady=settleAudioCleanup('Native Noise partial fallback',[()=>earlier,()=>this.destroy()]);error.cleanupReady.catch(cleanupError=>{error.cleanupError??=cleanupError;});throw error;}
    }
    initializeFallback() {
        // Fallback using ScriptProcessorNode for browsers without AudioWorklet
        const bufferSize = 4096;
        this.workletNode = this.sources.create('script',()=>this.AC.createScriptProcessor(bufferSize, 0, 1));

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
        this.silentGain = this.sources.ownExtra(this.workletNode,this.AC.createGain());
        this.silentGain.gain.value = 0;
        this.workletNode.connect(this.silentGain);
        this.silentGain.connect(this.AC.destination);

        this.usingFallback = true;
    }


    cleanupCurrentNode(){const node=this.workletNode;this.workletNode=null;this.silentGain=null;if(!node)return Promise.resolve();const pending=this.sources.retire(node);pending.catch(error=>{this.failure??=error;});return pending;}
    setNoiseType(type){this.check();if(this.currentNoiseType===type)return;if(this.active)this.sources.preflight();this.currentNoiseType=type;if(this.active)this.createNode();}
    setGain(gain) {
        this.check();
        try {
            this.gainNode.gain.setValueAtTime(gain, this.AC.currentTime);
        } catch (error) {
            console.warn('Error setting noise gain:', error);
        }
    }

    connect(destination) {
        this.check();
        this.gainNode.connect(destination);
    }

    disconnect() {
        this.gainNode.disconnect();
    }


    destroy(){if(this.disposal)return this.disposal;this.disposed=true;this.active=false;this.moduleObservation?.cancel();this.workletNode=null;this.silentGain=null;this.disposal=settleAudioCleanup('Native Noise disposal',[()=>this.sources.dispose(),()=>this.ownership.retire()]);this.disposal.catch(error=>{this.cleanupError??=error;});return this.disposal;}
    dispose=()=>this.destroy();
    sourceActors=()=>this.sources.actors();
    disposalStatus=()=>({profile:'native-noise-owner-lifecycle-v1',backend:'native-js',disposed:this.disposed,moduleState:this.workletState,moduleError:this.moduleError?String(this.moduleError):null,error:this.failure?String(this.failure):this.cleanupError?String(this.cleanupError):null,processors:this.sources.status(),stable:this.ownership.status()});
    getNode(){return this.gainNode;}
}
export default NoiseGenerator;
