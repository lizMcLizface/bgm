import DrumKit from './drumKit';
import * as Nodes from '../../nodes';
import {audioContext} from '../../audio/context';
import {SendReverb} from '../../nodes/sharedReverb';
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
 * The room is intentionally the original convolution path for source A/B tests.
 * Native remains the default; loading errors are surfaced before playback.
 */
export default class WasmDrumKit extends DrumKit {
    constructor({context = audioContext, reverbHub = null, externalEffects = false, model = 'wasm'} = {}) {
        // Reuse the lifecycle methods, without constructing the native kit's
        // 14 strips, sources or a second convolution bus.
        super({context, externalEffects:true, sourceOnly:true});
        this.model = model === '808' ? '808' : 'wasm';
        this.kind = 'percussion';
        this.pending = [];
        this.stats = null;
        this.error = null;
        this.disposed = false;
        this.polyphony = 64;
        if (!externalEffects) {
            this.bus.disconnect();
            this.reverb = reverbHub ? new SendReverb(context, reverbHub) : new Nodes.Reverb(context);
            this.reverb.defer();
            this.reverb.setType('reverb3');
            [].concat(this.reverb.getNode()).forEach(node => this.bus.connect(node));
            this.reverb.connect(this.output);
        }
        this.setKit(defaultDrumKit());
        this.ready = this.init();
        // Prevent unhandled rejection if a page is opened without pressing Play.
        this.ready.catch(error => {this.error = error;});
    }
    async init() {
        const module = await percussionModule();
        if (!registrations.has(this.AC)) registrations.set(this.AC, this.AC.audioWorklet.addModule(kernelAsset('percussion', 'percussion-processor.js')).catch(error => {registrations.delete(this.AC); throw error;}));
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
        node.port.onmessage = ({data}) => {
            if (data.type === 'stats') this.stats = {...data,reportedAt:this.AC.currentTime};
            if (data.type === 'error') this.error = Error(data.message);
        };
        node.onprocessorerror = () => {this.error = Error('Percussion worklet failed. Reload the page.');};
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
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        clearTimeout(this.sleepTimer);
        this.sleepTimer = null;
        this.pending = [];
        if (this.node) {
            this.node.port.postMessage({type:'dispose'});
            this.node.disconnect();
            this.node.port.onmessage = null;
            const port = this.node.port;
            setTimeout(() => port.close(), 250);
        }
        this.output.disconnect();
        this.bus.disconnect();
        this.reverb?.setAwake?.(false);
        this.reverb?.disconnect?.();
        this.destinations = [];
        this.awake = false;
    }
}
