import {kernelAsset} from './kernelAssets';
import {effectTriples,sanitizeEffects} from './effectsConfig';
let modulePromise;
let memoryPromise;
const registrations=new WeakMap();
export function effectsModule() {
 return modulePromise??=fetch(kernelAsset('effects','effects.wasm')).then(async r=>{
  if(!r.ok)throw Error('Effects kernel unavailable. Run npm run synth:build.');
  return WebAssembly.compile(await r.arrayBuffer());
 }).catch(e=>{modulePromise=null;throw e;});
}
export function effectsMemoryBytes(){return memoryPromise??=effectsModule().then(m=>new WebAssembly.Instance(m,{}).exports.memory.buffer.byteLength);}
export async function createEffectsBus(context,settings,{onStats=()=>{},onError=()=>{}}={}) {
 const module=await effectsModule();
 if(!registrations.has(context))registrations.set(context,context.audioWorklet.addModule(kernelAsset('effects','effects-processor.js')));
 await registrations.get(context);
 const node=new AudioWorkletNode(context,'calmbgm-effects',{numberOfInputs:3,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{module,parameters:effectTriples(settings),endFrame:Number.isFinite(context.length)?context.length:null}});
 node.port.onmessage=({data})=>{if(data.type==='error')onError(Error(data.message));if(data.type==='stats')onStats(data);};
 node.onprocessorerror=()=>onError(Error('Effects worklet failed. Reload the instrument.'));
 // This convenience input feeds all three sends. Other instruments can route
 // their own GainNodes to inputs 0/1/2 to share the bus with independent levels.
 const input=context.createGain();for(let i=0;i<3;i++)input.connect(node,0,i);
 return {input,node,kind:'fdn',connect:dest=>node.connect(dest),
  patch:p=>node.port.postMessage({type:'parameters',values:effectTriples(p)}),
  clear:()=>node.port.postMessage({type:'clear'}),
  dispose(){input.disconnect();node.port.postMessage({type:'dispose'});node.disconnect();node.port.onmessage=null;setTimeout(()=>node.port.close(),250);},
  settings:sanitizeEffects(settings),memoryBytes:0,
 };
}
