const loads=new WeakMap();
export async function createOutputMonitor(context,onLevel){
 if(!loads.has(context))loads.set(context,context.audioWorklet.addModule(`${import.meta.env.BASE_URL}synths/output-scope.js?v=stereo-2`).catch(error=>{loads.delete(context);throw error;}));
 await loads.get(context);
 const node=new AudioWorkletNode(context,'calmbgm-output-scope',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
 const pending=new Map();let sequence=0,disposed=false;
 const cancel=id=>{const p=pending.get(id);if(p){clearTimeout(p.timer);pending.delete(id);}};
 const requestScope=(n,next,{stereo=false,consumer}={})=>{
  if(disposed)return ()=>{};
  if(consumer!==undefined)for(const [id,p]of pending)if(p.consumer===consumer)cancel(id);
  if(pending.size>=8){queueMicrotask(()=>{if(stereo&&!disposed)next(null);});return ()=>{};}
  const id=++sequence,timer=setTimeout(()=>{cancel(id);if(stereo&&!disposed)next(null);},500);pending.set(id,{next,timer,consumer});
  node.port.postMessage({type:'scope',id,n:Math.max(0,Math.min(65536,Math.floor(n)||0)),stereo});return ()=>cancel(id);
 };
 node.port.onmessage=({data})=>{
  if(disposed)return;
  if(data.type==='scope'){const p=pending.get(data.id);cancel(data.id);p?.next(data);}
  else if(data.type==='level')onLevel?.(data.peak);
 };
 return {node,requestScope,requestStereoScope:(n,next,consumer)=>requestScope(n,next,{stereo:true,consumer}),dispose(){if(disposed)return;disposed=true;for(const id of pending.keys())cancel(id);node.disconnect();node.port.onmessage=null;node.port.close();}};
}
