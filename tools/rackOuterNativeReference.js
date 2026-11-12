/** Review-only, independently copied literal graph.js three-Gain authoring.
 * Never imports the owned planner, kernel, coefficient/state or gain values. */
export function patchRackOuterNativeReference(context,nodes,m,{initial=false,busy=false,trace=[]}={}){
 const wrap=(param,stage,slot)=>({setValueAtTime(value,seconds){trace.push({stage,slot,op:'set',value,seconds,tau:0});return param.setValueAtTime(value,seconds);},setTargetAtTime(value,seconds,tau){trace.push({stage,slot,op:'target',value,seconds,tau});return param.setTargetAtTime(value,seconds,tau);}}),trim={gain:wrap(nodes.trim.gain,'trim',0)},processed={gain:wrap(nodes.processed.gain,'mix',0)},bypass={gain:wrap(nodes.bypass.gain,'mix',1)};
 const set=(param,v)=>initial?param.setValueAtTime(v,context.currentTime):param.setTargetAtTime(v,context.currentTime,.012);
 set(trim.gain,10**(m.input/20));set(processed.gain,m.enabled&&!busy?m.mix*10**(m.output/20):0);set(bypass.gain,m.enabled?(1-m.mix)*10**((m.input+m.output)/20):1);
 return trace;
}
