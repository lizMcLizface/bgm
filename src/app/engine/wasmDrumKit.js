import {PercussionLifecycle} from './percussionLifecycle';
import DrumKit from './drumKit';
import {audioContext} from '../../audio/context';
import {makeDrumRoom} from './fdnRoom';
import {DRUMS, defaultDrumKit} from '../percussion';
import {kernelAsset} from '../../synth-lab/kernelAssets';
import {drumForVoice,percussionVoice} from '../percussionVoices';

let modulePromise;
const registrations = new WeakMap();
export function percussionModule() {
    return modulePromise ??= fetch(kernelAsset('percussion', 'percussion.wasm')).then(async response => {
        if (!response.ok) throw Error('Percussion kernel unavailable. Run npm run synth:build.');
        return WebAssembly.compile(await response.arrayBuffer());
    }).catch(error => {modulePromise = null; throw error;});
}

/** Same public routing/lifecycle as DrumKit, with a single persistent source.
 * The room is the Wasm FDN room (fdnRoom.js), or the original convolution where that cannot run.
 * Native remains the default; loading errors are surfaced before playback.
 */
export default class WasmDrumKit extends DrumKit {
    constructor({context = audioContext, reverbHub = null, externalEffects = false, model = 'wasm', fdnRoomFactory = null} = {}) {
        // Reuse the lifecycle methods, without constructing the native kit's
        // 14 strips, sources or a second convolution bus.
        super({context, externalEffects:true, sourceOnly:true, fdnRoomFactory});
        try{
        this.model = model === '808' ? '808' : 'wasm';
        this.kind = 'percussion';
        this.pending = [];
        this.stats = null;
        this.error = null;
        this.disposed = false;
        this.lifecycle = new PercussionLifecycle({onRelease:node=>{if(node){node.port.onmessage=null;node.onprocessorerror=null;}if(this.node===node)this.node=null;this.module=null;}});
        this.lifecycleReady = this.lifecycle.ready;
        this.polyphony = 64;
        if (!externalEffects) {
            this.bus.disconnect();
            this.reverb = this.fdnConstruction?this.fdnConstruction.createOwner('kit FDN room',()=>makeDrumRoom(context,reverbHub,fdnRoomFactory,{onError:error=>{this.error??=error;}}),room=>room.dispose()):makeDrumRoom(context, reverbHub);
            this.reverb.defer();
            this.reverb.setType('reverb3');
            [].concat(this.reverb.getNode()).forEach(node => this.bus.connect(node));
            this.reverb.connect(this.output);
        }
        this.setKit(defaultDrumKit());
        this.ready = this.fdnConstruction?this.init().catch(error=>{error.cleanupReady=this.dispose();error.cleanupReady.catch(()=>{});throw error;}):this.init();
        // Prevent unhandled rejection if a page is opened without pressing Play.
        this.ready.catch(error => {this.error = error;});
        }catch(error){if(this.fdnConstruction){const primary=this.fdnConstruction.failure(error);if(this.lifecycle){const outer=primary.cleanupReady;primary.cleanupReady=Promise.allSettled([outer,this.lifecycle.close()]).then(results=>{const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);if(errors.length)throw new AggregateError(errors,'Prepared kit constructor cleanup failed');return{clean:true,profile:'prepared-fdn-kit-constructor-v1'};});primary.cleanupReady.catch(()=>{});}throw primary;}throw error;}
    }
    async init() {
        const module = await percussionModule();
        if (!registrations.has(this.AC)) registrations.set(this.AC, this.AC.audioWorklet.addModule(kernelAsset('percussion', 'percussion-processor.js')+'&lifecycle=1').catch(error => {registrations.delete(this.AC); throw error;}));
        await registrations.get(this.AC);
        if (this.disposed) return;
        this.module = module;
        // OfflineAudioContext can race port messages with its first render.
        // Install its complete event list synchronously in the constructor.
        if (!Number.isFinite(this.AC.length)) this.createNode([]);
    }
    createNode(messages) {
        const node = new AudioWorkletNode(this.AC, 'calmbgm-percussion', {numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module:this.module,messages,endFrame:Number.isFinite(this.AC.length) ? this.AC.length : null}});
        this.node = node;
        this.lifecycle.bind(node);
        node.port.onmessage = ({data}) => {
            if (this.lifecycle.receive(data)) return;
            if (this.disposed) return;
            if (data.type === 'stats') this.stats = {...data,reportedAt:this.AC.currentTime};
            if (data.type === 'error') this.error = Error(data.message);
        };
        node.onprocessorerror = () => {this.error = Error('Percussion worklet failed. Reload the page.');this.lifecycle.fail(this.error);};
        node.connect(this.bus);
        for (const message of this.pending) node.port.postMessage(message);
        this.pending = [];
    }
    prepareOffline() {
        if (!Number.isFinite(this.AC.length) || this.node || this.disposed) return;
        const messages = this.pending;
        this.pending = [];
        this.createNode(messages);
    }
    send(message) {
        if (this.disposed) return;
        if (this.node) this.node.port.postMessage(message);
        else if (this.pending) this.pending.push(message);
    }
    setKit(kit) {
        if(this.fdnRoomFactory){if(this.disposed||this.error)throw this.error??Error('Prepared FDN kit disposed');this.reverb?.preflightPreset?.({reverbAmount:kit.room},['reverbAmount']);}
        this.kit = kit;
        this.send({type:'kit',values:DRUMS.map(name => [kit[name].on ? kit[name].level : 0,kit[name].tone,kit[name].decay])});
        if (this.reverb && this.reverb.amount !== kit.room) this.reverb.setAmount(kit.room);
    }
    setVoicePreset(id) {
        this.voicePreset = percussionVoice(id).id;
        this.model = percussionVoice(id).model;
        this.preset = {...this.preset,name:percussionVoice(id).name,kind:'percussion',voice:this.voicePreset};
        this.send({type:'voice-preset',value:{felt:1,crisp:2,tr808:3,hand:4}[this.voicePreset]});
    }
    scheduleNote(drum, time, duration = 0.25, velocity = 0.7, vary = 0) {
        const name = DRUMS[drumForVoice(drum,this.voicePreset)];
        if (this.disposed || !name || !Number.isFinite(time) || !this.kit[name].on) return;
        const {tone, decay} = this.kit[name];
        this.hitCount++;
        this.send({type:'hit',values:[drum,Math.max(0, Math.round(time * this.AC.sampleRate)),duration,velocity,vary,tone,decay,this.hitCount,({current:0,wasm:0,'808':1,hand:2})[this.model] ?? 0]});
        this.soundUntil = Math.max(this.soundUntil, time + 8.1);
        this.wake();
    }
    silence(time = this.AC.currentTime) {
        if (this.disposed) return;
        this.send({type:'silence',frame:Math.round(time * this.AC.sampleRate)});
        this.soundUntil = time + 0.02;
        this.scheduleSleep();
    }
    get disposalCapability(){return this.lifecycle.capability;}
    disposalStatus(){return this.lifecycle.status();}
    dispose() {
        if (this.disposed) return this.disposal;
        this.disposed = true;
        clearTimeout(this.sleepTimer);this.sleepTimer=null;this.pending=[];
        const errors=[],pending=[],clean=action=>{try{const result=action();if(result?.then)pending.push(result);}catch(error){errors.push(error);}};
        clean(()=>this.node?.disconnect());if(!this.fdnConstruction){clean(()=>this.output.disconnect());clean(()=>this.bus.disconnect());}
        clean(()=>this.reverb?.setAwake?.(false));if(this.fdnConstruction)clean(()=>this.fdnConstruction.close());else{clean(()=>this.reverb?.dispose?.());clean(()=>this.reverb?.disconnect?.());}
        this.destinations=[];this.awake=false;
        const sourceClosing=this.lifecycle.close();this.disposal=Promise.allSettled([sourceClosing,...pending]).then(results=>{for(const r of results)if(r.status==='rejected')errors.push(r.reason);if(errors.length)throw new AggregateError(errors,'Percussion source/routing cleanup failed');return results[0].value;});
        this.disposal.catch(error=>{this.disposalError=error;});return this.disposal;
    }
}