import {kernelAsset} from './kernelAssets';
import {sanitizeNoteBehavior} from './noteBehavior';
import {parameterTriples,legacyPreset} from './patch';
import Instrument from '../app/engine/Instrument';
import {noiseReady} from '../nodes/noiseGenerator';
import {bitCrusherReady} from '../nodes/bitcrusher';
export {synthModule} from './coreModule';
import {synthModule} from './coreModule';
const registrations=new WeakMap();
export async function makeWasmNode(context,patch,{auditStats=false,patches=[],events=[],offline=false,dry=false,stopFrame=Number.isFinite(context.length)?context.length:null,onStats=()=>{},onError=()=>{}}={}){
 const module=await synthModule(patch);let registered=registrations.get(context);if(!registered){registered=context.audioWorklet.addModule(kernelAsset('core','processor.js'));registrations.set(context,registered);}await registered;
 const values=parameterTriples(patch);if(dry)values.find(([scope,index])=>scope===0&&index===8)[2]=0;
 const node=new AudioWorkletNode(context,'calmbgm-subtractive',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module,parameters:values,events,offline,stopFrame,auditStats,performance:sanitizeNoteBehavior(patch.performance),patches:patches.map(p=>({...p,values:parameterTriples(p.patch),performance:sanitizeNoteBehavior(p.patch.performance)}))}});
 node.port.onmessage=({data})=>{if(data.type==='stats')onStats(data);if(data.type==='error')onError(Error(data.message));};node.onprocessorerror=()=>onError(Error('Audio worklet stopped after an error. Reload the engine.'));
 return node;
}
export class WasmBackend {
 constructor(context,node){this.context=context;this.node=node;this.kind='wasm';this.nextId=1;this.starts=new Map();}
 static async create(context,patch,options){return new WasmBackend(context,await makeWasmNode(context,patch,options));}
 connect(destination){this.node.connect(destination);}
 patch(p,{seconds=.06,time}={}){this.node.port.postMessage({type:'parameters',values:parameterTriples(p),performance:sanitizeNoteBehavior(p.performance),seconds,frame:Number.isFinite(time)?Math.round(time*this.context.sampleRate):undefined});}
 events(values){this.node.port.postMessage({type:'events',values});}
 on(midi,velocity,time=this.context.currentTime+.025){const id=this.nextId++,frame=Math.round(time*this.context.sampleRate);this.starts.set(id,frame);this.events([[0,id,frame,midi,velocity]]);return id;}
 off(id,time=this.context.currentTime+.01){const frame=Math.max(Math.round(time*this.context.sampleRate),(this.starts.get(id)??0)+1);this.starts.delete(id);this.events([[1,id,frame,0,0]]);}
 sustain(on){this.events([[2,0,Math.round((this.context.currentTime+.01)*this.context.sampleRate),on?1:0,0]]);}
 pressure(value,id=0){this.events([[3,id,Math.round((this.context.currentTime+.01)*this.context.sampleRate),value,0]]);}
 retune(id,midi,seconds=.8,time=this.context.currentTime+.025){this.events([[5,id,Math.round(time*this.context.sampleRate),midi,seconds]]);}
 panic(){this.starts.clear();this.node.port.postMessage({type:'panic'});}
 dispose(){this.node.port.postMessage({type:'dispose'});this.node.disconnect();this.node.port.onmessage=null;const port=this.node.port;setTimeout(()=>port.close(),250);}
}
const settled=async inst=>{await Promise.all([noiseReady(inst.AC),bitCrusherReady(inst.AC)]);};
export class CurrentBackend {
 constructor(context,inst){this.context=context;this.inst=inst;this.kind='current';this.held=new Map();this.pedal=false;this.pending=[];}
 static async create(context,patch){const inst=new Instrument({context,polyphony:patch.global.polyphony,preset:legacyPreset(patch)});await settled(inst);return new CurrentBackend(context,inst);}
 connect(destination){this.inst.connect(destination);}
 patch(p){this.inst.applyPreset(legacyPreset(p));}
 on(midi,velocity){const id=this.inst.startNote(midi,velocity);this.held.set(id,midi);return id;}
 off(id){if(this.pedal)this.pending.push(id);else{this.inst.stopNote(id);this.held.delete(id);}}
 sustain(on){this.pedal=on;if(!on){for(const id of this.pending)this.off(id);this.pending=[];}}
 pressure(){} // Current Instrument has no continuous per-note pressure contract.
 panic(){this.pending=[];this.held.clear();this.pedal=false;this.inst.silence();this.inst.flushTails();}
 dispose(){this.panic();this.inst.dispose();}
}
