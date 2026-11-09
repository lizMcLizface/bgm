import {coreSpecForPart,fmSpecForPart,partEvents} from './sixRoleFixture';
export function pitchedPatch(spec,fm){return {version:1,modules:[{id:1,type:fm?'legacy.fm':'legacy.core',version:1,parameters:{gain:1},config:{...spec,events:[]}},{id:2,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:2,port:'program.in'}}],events:spec.events.map(([event,note,frame,a,b])=>({kind:'note',target:1,owner:1,event,note,frame,a,b}))};}
export function sixSourceDag(f,rate){
 const modules=f.parts.map((p,i)=>({id:i+1,type:p.kind==='percussion'?'legacy.percussion':p.kind==='fm'?'legacy.fm':'legacy.core',version:1,parameters:{gain:1},...(p.kind==='percussion'?{}:{config:{...(p.kind==='fm'?fmSpecForPart:coreSpecForPart)(f,p,rate),events:[]}})})),connections=[];
 const edge=(from,to,port)=>connections.push({id:connections.length+1,kind:'audio',from:{module:from,port:'audio.out'},to:{module:to,port}});
 for(const [id,a,b,gain]of [[11,1,2,1],[12,3,4,1],[13,5,6,1],[14,11,12,1],[15,14,13,.125]]){modules.push({id,type:'ref.mix',version:1,parameters:{gain}});edge(a,id,'a.in');edge(b,id,'b.in');}
 modules.push({id:17,type:'graph.compressor',version:1,parameters:f.compressor},{id:18,type:'ref.output',version:1,parameters:{}});edge(15,17,'program.in');connections.push({id:connections.length+1,kind:'audio',from:{module:6,port:'kick.out'},to:{module:17,port:'detector.in'}});edge(17,18,'program.in');
 const events=f.parts.flatMap((p,i)=>p.kind==='percussion'?p.hits.map(h=>({frame:Math.round((f.preroll+h.tick/f.ppq*60/f.bpm)*rate),target:i+1,owner:i+1,kind:'hit',drum:h.drum,velocity:h.velocity,duration:h.duration,vary:h.vary,tone:h.tone,decay:h.decay,hit:h.id,model:h.model})):partEvents(f,p,rate).map(([event,note,frame,a,b])=>({kind:'note',target:i+1,owner:i+1,event,note,frame,a,b})));
 return {version:1,modules,connections,events};
}
