import {kernelAsset} from './kernelAssets';
import {effectTriples,sanitizeEffects} from './effectsConfig';
import {EffectsLifecycle}from'./effectsLifecycle';
let modulePromise;let memoryPromise;const registrations=new WeakMap();
export function effectsModule(){return modulePromise??=fetch(kernelAsset('effects','effects.wasm')).then(async r=>{if(!r.ok)throw Error('Effects kernel unavailable. Run npm run synth:build.');return WebAssembly.compile(await r.arrayBuffer());}).catch(e=>{modulePromise=null;throw e;});}
export function effectsMemoryBytes(){return memoryPromise??=effectsModule().then(m=>new WebAssembly.Instance(m,{}).exports.memory.buffer.byteLength);}
export async function createEffectsBus(context,settings,{onStats=()=>{},onError=()=>{}}={}){
 const module=await effectsModule();if(!registrations.has(context)){const registration=context.audioWorklet.addModule(kernelAsset('effects','effects-processor.js')+'&lifecycle=1');registrations.set(context,registration);registration.catch(()=>{if(registrations.get(context)===registration)registrations.delete(context);});}await registrations.get(context);
 let stats=null,error=null,node,input,disposed=false,disposal;
 const endFrame=Number.isFinite(context.length)?context.length:null,lifecycle=new EffectsLifecycle({endFrame,onRelease:released=>{if(released){released.port.onmessage=null;released.onprocessorerror=null;}if(node===released)node=null;}}),fail=e=>{error=e;onError(e);};
 try{node=new AudioWorkletNode(context,'calmbgm-effects',{numberOfInputs:3,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{module,parameters:effectTriples(settings),endFrame}});lifecycle.bind(node);
  node.port.onmessage=({data})=>{if(lifecycle.receive(data))return;if(data.type==='error'){fail(Error(data.message));lifecycle.fail(error);}if(data.type==='stats'){stats={...data,reportedAt:context.currentTime};onStats(data);}};
  node.onprocessorerror=()=>{fail(Error('Effects worklet failed. Reload the instrument.'));lifecycle.fail(error);};input=context.createGain();for(let i=0;i<3;i++)input.connect(node,0,i);
 }catch(primary){try{input?.disconnect();node?.disconnect();await lifecycle.close();}catch(cleanupError){primary.cleanupError=cleanupError;}throw primary;}
 return{input,get node(){return node;},kind:'fdn',get stats(){return stats;},get error(){return error;},get disposed(){return disposed;},get disposalCapability(){return lifecycle.capability;},lifecycleReady:lifecycle.ready,disposalStatus:()=>lifecycle.status(),connect:dest=>node.connect(dest),
  patch:p=>{if(disposed)throw Error('Effects bus disposed');node.port.postMessage({type:'parameters',values:effectTriples(p)});},clear:()=>{if(disposed)return;node.port.postMessage({type:'clear'});},
  dispose(){if(disposal)return disposal;disposed=true;const errors=[];try{input.disconnect();}catch(e){errors.push(e);}try{node?.disconnect();}catch(e){errors.push(e);}disposal=Promise.allSettled([lifecycle.close()]).then(([closed])=>{if(closed.status==='rejected')errors.push(closed.reason);if(errors.length)throw new AggregateError(errors,'Effects source/routing cleanup failed');return closed.value;});disposal.catch(e=>{error??=e;});return disposal;},settings:sanitizeEffects(settings),memoryBytes:0};
}