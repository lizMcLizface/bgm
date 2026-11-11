import {validateClassicConfig} from './classicConfig';
export {validateClassicConfig,CLASSIC_MODELS} from './classicConfig';
const finite=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
/** Actual classic worklet timing rounds timestamps to individual samples. */
function compileSlot(source,notes,rate,noteIds){
 const p=source.patch;if(!p||!Number.isInteger(rate)||rate<8000||rate>192000)throw Error('Missing captured classic source');
 const config=validateClassicConfig({version:p.version,model:p.model,parameters:p.parameters.map(a=>a.slice()),polyphony:p.polyphony,...(p.waves?{waves:Array.from(p.waves)}:{})});
 if(!Array.isArray(notes)||notes.length>2000)throw Error('Classic preview exceeds its bounded event queue');
 const events=[],controls=p.controls??[];
 if(!Array.isArray(controls)||controls.length>7||new Set(controls.map(p=>p[0])).size!==controls.length)throw Error('Invalid captured classic controls');
 for(const c of controls){if(!Array.isArray(c)||c.length!==2||!Number.isInteger(c[0])||c[0]<0||c[0]>6||!finite(c[1],-128,128)||c[0]===5&&c[1]!==0)throw Error('Unsupported captured classic control or held sustain');events.push({kind:'classic',target:1,owner:1,event:2,id:c[0],a:c[1],b:0,frame:0});}
 notes.forEach((n,i)=>{
  const expression=n.expression??{},gate=expression.gateScale??1,detune=n.detune??0,bend=expression.bend??0;
  if(!finite(n.midi,0,127)||!finite(n.velocity,0,1)||!finite(n.time,0,120)||!finite(n.duration,Number.MIN_VALUE,120)||!finite(gate,Number.MIN_VALUE,16)||!finite(detune,-12800,12800)||!finite(bend,-128,128)||n.time+n.duration*gate>120||expression.pressure!==undefined&&!finite(expression.pressure,0,1))throw Error('Invalid captured classic note');
  const id=noteIds?.[i]??i+1,frame=Math.round(n.time*rate),midi=Math.max(0,Math.min(127,n.midi+detune/100+bend));
  events.push({kind:'classic',target:1,owner:1,event:0,id,a:midi,b:n.velocity,frame},{kind:'classic',target:1,owner:1,event:1,id,a:0,b:0,frame:Math.round((n.time+n.duration*gate)*rate)});
  if(expression.pressure!==undefined)events.push({kind:'classic',target:1,owner:1,event:3,id,a:expression.pressure,b:0,frame});
 });
 if(events.length>4000)throw Error('Classic preview exceeds its bounded event queue');
 // Stable sort preserves receive order when off/on/pressure share a frame.
 events.sort((a,b)=>a.frame-b.frame);
 return {config,events,tail:Math.max(1,Math.min(120,Number.isFinite(p.tailSeconds)?p.tailSeconds:120))};
}
export function compileClassicNotes(source,notes,rate=48000){return compileSlot(source,notes,rate);}

export const CLASSIC_STACK_ALLOCATION='first-free-then-earliest-gate-v1';
/** Fresh finite capture of the actual mono-stack host, in scheduleNote receive order. */
export function compileClassicCompositeNotes(source,notes,rate=48000,{sourceIds,otherSourceCount=0}={}){
 const p=source.patch,count=p?.slots?.length;
 if(p?.version!==1||p.allocation!==CLASSIC_STACK_ALLOCATION||!Number.isInteger(count)||count<2||count>8||!Number.isInteger(otherSourceCount)||otherSourceCount<0||otherSourceCount+count>8||!Array.isArray(notes)||notes.length>2000)throw Error('Unsupported classic composite source budget');
 sourceIds??=Array.from({length:count},(_,i)=>i+1);
 if(!Array.isArray(sourceIds)||sourceIds.length!==count||new Set(sourceIds).size!==count||sourceIds.some(id=>!Number.isInteger(id)||id<1||id>8))throw Error('Invalid classic composite output bindings');
 // Validate all note semantics before using their gates in the host allocator.
 compileSlot({patch:p.slots[0]},notes,rate);
 const freeAt=Array(count).fill(0),perSlot=Array.from({length:count},()=>[]),ids=Array.from({length:count},()=>[]),allocation=[];
 notes.forEach((n,i)=>{const end=n.time+n.duration*(n.expression?.gateScale??1);let slot=freeAt.findIndex(t=>t<=n.time);if(slot<0)slot=freeAt.indexOf(Math.min(...freeAt));freeAt[slot]=end;perSlot[slot].push(n);ids[slot].push(i+1);allocation.push({note:i+1,slot,start:n.time,end});});
 const sources=p.slots.map((patch,slot)=>{const c=compileSlot({patch},perSlot[slot],rate,ids[slot]),sourceId=sourceIds[slot];return {slot,sourceId,noteCount:perSlot[slot].length,...c,events:c.events.map(e=>({...e,target:sourceId,owner:sourceId}))};});
 const events=sources.flatMap(s=>s.events).sort((a,b)=>a.frame-b.frame);if(events.length>4000)throw Error('Classic composite exceeds its bounded graph event queue');
 const modules=sources.map(s=>({id:s.sourceId,type:'legacy.classic',version:1,parameters:{gain:1},config:s.config})),connections=[];
 const edge=(from,to,port)=>connections.push({id:connections.length+1,kind:'audio',from:{module:from,port:'audio.out'},to:{module:to,port}});
 let sum=sourceIds[0];for(let i=1;i<count;i++){const id=10+i;modules.push({id,type:'ref.mix',version:1,parameters:{gain:1}});edge(sum,id,'a.in');edge(sourceIds[i],id,'b.in');sum=id;}modules.push({id:18,type:'ref.output',version:1,parameters:{}});edge(sum,18,'program.in');
 return {sources,bindings:sources.map(({slot,sourceId})=>({slot,sourceId})),events,allocation,tail:Math.max(...sources.map(s=>s.tail)),referenceGraph:{version:1,modules,connections,events}};
}
