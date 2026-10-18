// Sampling attribution, not instrumented function timing. Inclusive rows overlap.
export function summarizeCpuProfile(profile){
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parent=new Map();for(const n of nodes.values())for(const id of n.children??[])parent.set(id,n.id);
 const self=new Map(),inclusive=new Map();let totalUs=0,activeUs=0;
 const label=n=>n.callFrame.functionName||`${n.callFrame.url}:${n.callFrame.lineNumber}`;
 for(let i=0;i<(profile.samples?.length??0);i++){
  const id=profile.samples[i],us=profile.timeDeltas?.[i]??0,node=nodes.get(id);if(!node)continue;totalUs+=us;
  const name=label(node);if(['(idle)','(program)','(root)'].includes(name))continue;activeUs+=us;self.set(name,(self.get(name)??0)+us);
  const seen=new Set();for(let at=id;at!==undefined;at=parent.get(at)){const n=nodes.get(at);if(!n)break;const key=label(n);if(!seen.has(key)){inclusive.set(key,(inclusive.get(key)??0)+us);seen.add(key);}}
 }
 const rows=map=>[...map].map(([functionName,us])=>({functionName,ms:us/1000,activePercent:activeUs?100*us/activeUs:0})).sort((a,b)=>b.ms-a.ms).slice(0,30);
 return {samples:profile.samples?.length??0,totalMs:totalUs/1000,activeMs:activeUs/1000,self:rows(self),inclusive:rows(inclusive),limits:'Sampling estimates include profiling overhead; inlined routines can be charged to their caller. Inclusive percentages overlap. Do not substitute these times for unprofiled medians.'};
}
