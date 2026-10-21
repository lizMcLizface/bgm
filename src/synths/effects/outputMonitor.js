export async function createOutputMonitor(context,onLevel){
 await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}synths/output-scope.js`);
 const node=new AudioWorkletNode(context,'calmbgm-output-scope',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
 let handler=null;
 node.port.onmessage=({data})=>{
  if(data.type==='scope'){const next=handler;handler=null;next?.(data);}
  else if(data.type==='level')onLevel?.(data.peak);
 };
 return {node,requestScope(n,next){handler=next;node.port.postMessage({type:'scope',n});},dispose(){handler=null;node.disconnect();node.port.onmessage=null;node.port.close();}};
}
