import {WasmBackend} from './backend';
import {FMBackend} from './fmBackend';
import {ProceduralBackend} from './proceduralBackend';
/** Source ownership is uniform; native sources deliberately do not pretend to
 * expose an AudioWorklet MessagePort or consume Wasm synthesis memory. */
export async function createLabSource(context,part,{events=[],signal,onProgress,...options}={}){
 if(!['fm','subtractive','procedural'].includes(part.kind))throw Error('Unknown lab source kind.');
 const Type=part.kind==='fm'?FMBackend:part.kind==='procedural'?ProceduralBackend:WasmBackend;
 const backend=await Type.create(context,part.patch,{...options,patches:options.patches??(options.offline?(part.patches??[]).map(p=>({...p,frame:Math.round(p.time*context.sampleRate)})):[]),events:part.kind==='procedural'?[]:events});
 try{if(backend.prepare)await backend.prepare(part.notes,{signal,onProgress});if(signal?.aborted)throw Error('Source preparation cancelled.');if(part.kind==='procedural'&&events.length)backend.events(events);return backend;}catch(e){backend.dispose();throw e;}
}
