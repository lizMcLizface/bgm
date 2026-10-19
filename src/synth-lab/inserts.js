import {kernelAsset} from './kernelAssets';
import {insertsPacket} from './insertsConfig';
let modulePromise,memoryPromise;const registrations=new WeakMap();
export const insertsModule=()=>modulePromise??=fetch(kernelAsset('inserts','inserts.wasm')).then(async r=>{if(!r.ok)throw Error('Instrument inserts kernel unavailable.');return WebAssembly.compile(await r.arrayBuffer());}).catch(e=>{modulePromise=null;throw e;});
export const insertsMemoryBytes=()=>memoryPromise??=insertsModule().then(module=>new WebAssembly.Instance(module,{}).exports.memory.buffer.byteLength);
export async function createInstrumentInserts(context,settings,{onStats=()=>{},onError=()=>{}}={}){
 const module=await insertsModule();if(!registrations.has(context))registrations.set(context,context.audioWorklet.addModule(kernelAsset('inserts','inserts-processor.js')));await registrations.get(context);
 let stats=null,error=null;
 const node=new AudioWorkletNode(context,'calmbgm-inserts',{numberOfInputs:1,numberOfOutputs:1,channelCount:2,channelCountMode:'explicit',outputChannelCount:[2],processorOptions:{module,parameters:insertsPacket(settings),endFrame:Number.isFinite(context.length)?context.length:null}});
 const fail=e=>{error=e;onError(e);};
 node.port.onmessage=({data})=>{if(data.type==='stats'){stats={...data,reportedAt:context.currentTime};onStats(data);}if(data.type==='error')fail(Error(data.message));};node.onprocessorerror=()=>fail(Error('Instrument inserts worklet failed.'));
 return {input:node,node,get stats(){return stats;},get error(){return error;},connect:target=>node.connect(target),patch:p=>node.port.postMessage({type:'parameters',values:insertsPacket(p)}),clear:()=>node.port.postMessage({type:'clear'}),dispose(){node.port.postMessage({type:'dispose'});node.disconnect();node.port.onmessage=null;setTimeout(()=>node.port.close(),250);}};
}
export function renderInserts(module,channels,rate,settings,{edits=[],chunk=2048}={}){
 const e=new WebAssembly.Instance(module,{}).exports;e.inserts_init(rate);insertsPacket(settings).forEach(p=>e.inserts_param(...p));e.inserts_settle();const out=channels.map(ch=>new Float32Array(ch.length));let at=0,next=0;
 while(at<channels[0].length){while(next<edits.length&&edits[next].frame===at){const edit=edits[next++];insertsPacket(edit.settings).forEach(p=>e.inserts_param(...p));}const count=Math.min(chunk,2048,channels[0].length-at,(edits[next]?.frame??channels[0].length)-at);if(count<=0)throw Error('Insert edits must be ordered and in range.');for(let ch=0;ch<2;ch++)new Float32Array(e.memory.buffer,e.inserts_input(ch),count).set(channels[ch].subarray(at,at+count));e.inserts_render(count);for(let ch=0;ch<2;ch++)out[ch].set(new Float32Array(e.memory.buffer,e.inserts_output(ch),count),at);at+=count;}return out;
}
