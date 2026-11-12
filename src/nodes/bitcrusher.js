import {ProcessorRetirements} from '../audio/processorRetirements.js';
import {observeProcessorModule} from '../audio/processorModuleObservation.js';
import {AudioConstructorJournal,settleAudioCleanup} from '../audio/constructorJournal.js';
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

/** Resolves once the processor is loaded into AC (or failed to). */
export const bitCrusherReady = (AC) => (AC.audioWorklet ? loadModule(AC).catch(() => {}) : Promise.resolve());

class BitCrusher {
    constructor(AC){this.AC=AC;this.bufferSize=256;this.bits=8;this.normfreq=.25;this.amount=0;this.node=null;this.disposed=false;this.failure=null;this.disposal=null;this.sources=new ProcessorRetirements(AC,{label:'Native BitCrusher'});this.ownership=new AudioConstructorJournal({capacity:3,label:'Native BitCrusher stable gains'});
        try{this.dryGain=this.ownership.create('dry',()=>new Gain(AC),gain=>gain.getNode().disconnect());this.wetGain=this.ownership.create('wet',()=>new Gain(AC),gain=>gain.getNode().disconnect());this.wetInput=this.ownership.create('input',()=>new Gain(AC),gain=>gain.getNode().disconnect());this.workletState=AC.audioWorklet?'loading':'unsupported';this.ready=Promise.resolve(this);
            if(AC.audioWorklet){this.moduleObservation=observeProcessorModule(loadModule(AC));this.ready=this.moduleObservation.promise.then(result=>{if(this.disposed||result.cancelled)return this;this.moduleError=result.error??null;this.workletState=result.loaded?'ready':'unsupported';this.updateNode();return this;});this.ready.catch(error=>{this.failure??=error;const earlier=error.cleanupReady;error.cleanupReady=settleAudioCleanup('Native BitCrusher preparation',[()=>earlier,()=>this.dispose()]);error.cleanupReady.catch(cleanupError=>{error.cleanupError??=cleanupError;});});}
            this.setAmount(0);
        }catch(error){this.disposed=true;this.moduleObservation?.cancel();const earlier=error.cleanupReady;error.cleanupReady=settleAudioCleanup('Native BitCrusher constructor',[()=>earlier,()=>this.sources.dispose(),()=>this.ownership.retire()]);error.cleanupReady.catch(cleanupError=>{error.cleanupError??=cleanupError;});throw error;}
    }
    check(){if(this.disposed||this.failure)throw this.failure??Error('Native BitCrusher disposed');this.sources.check();}
    connect = destination => {this.check();if(Array.isArray(destination))destination.forEach(dest=>{this.dryGain.connect(dest);this.wetGain.connect(dest);});else{this.dryGain.connect(destination);this.wetGain.connect(destination);}};
    getNode = () => [this.dryGain.getNode(),this.wetInput.getNode()];
    getBitDepth = () => this.bits;
    getAmount = () => this.wetGain.getGain();
    updateNode(){this.check();const wanted=this.amount>0;if(!wanted&&this.node){const node=this.node;this.node=null;this.sources.retire(node).catch(error=>{this.failure??=error;});}else if(wanted&&!this.node&&this.workletState!=='loading'){
            this.sources.preflight();let node;try{node=this.sources.create(this.workletState==='ready'?'worklet':'script',()=>this.workletState==='ready'?new AudioWorkletNode(this.AC,'bitcrusher-processor',{parameterData:{bits:this.bits,normfreq:this.normfreq}}):this.createScriptProcessor(),{beforeDisconnect:()=>this.wetInput.getNode().disconnect()});this.node=node;this.wetInput.connect(node);node.connect(this.wetGain.getNode());}catch(error){this.node=null;this.failure??=error;const earlier=error.cleanupReady;error.cleanupReady=settleAudioCleanup('Native BitCrusher partial processor',[()=>earlier,()=>this.dispose()]);error.cleanupReady.catch(cleanupError=>{error.cleanupError??=cleanupError;});throw error;}
        }}
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
        this.check();
        if (bitDepth === this.bits) return false;
        this.bits = bitDepth; // between 1 and 16
        if (this.node && this.node.parameters) {
            this.node.parameters.get('bits').setValueAtTime(bitDepth, this.AC.currentTime);
        }
    }

    setAmount = val => {
        this.check();if(val>0&&!this.node&&this.workletState!=='loading')this.sources.preflight();
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
    dispose(){if(this.disposal)return this.disposal;this.disposed=true;this.moduleObservation?.cancel();this.node=null;this.disposal=settleAudioCleanup('Native BitCrusher disposal',[()=>this.sources.dispose(),()=>this.ownership.retire()]);this.disposal.catch(error=>{this.cleanupError??=error;});return this.disposal;}
    sourceActors=()=>this.sources.actors();
    disposalStatus=()=>({profile:'native-bitcrusher-owner-lifecycle-v1',backend:'native-js',disposed:this.disposed,moduleState:this.workletState,moduleError:this.moduleError?String(this.moduleError):null,error:this.failure?String(this.failure):this.cleanupError?String(this.cleanupError):null,processors:this.sources.status(),stable:this.ownership.status()});
}
export default BitCrusher;
