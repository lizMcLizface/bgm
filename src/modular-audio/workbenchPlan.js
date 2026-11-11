import {projectStepEvents} from '../seq/notes';
import {placedChordEvents} from '../synths/all/placedChords';
import {seeded} from '../app/random';
import {parameterTriples} from '../synth-lab/patch';
import {fmPacket} from '../synth-lab/fmPatch';
import {sanitizeNoteBehavior} from '../synth-lab/noteBehavior';
import {patchColourTail} from '../synth-lab/voiceColour';
import {compileWorkbenchDrums} from './workbenchDrums';
import {compilePianoNotes} from './pianoCompiler';
import {compileIowaNotes} from './iowaCompiler';
import {compileClassicNotes,compileClassicCompositeNotes} from './classicCompiler';
export const WORKBENCH_SOURCE_BUDGET=Object.freeze({sampleRate:48000,blockFrames:512,poolBlocks:6,scheduling:'message',maxNotes:2000,maxSeconds:120});
// Hash only the captured source/score, not executor capacity or later counters.
// Missing Web Crypto leaves identity unknown; it must not invent a match.
export async function hashWorkbenchPlan(plan){
 try{const bytes=new TextEncoder().encode(JSON.stringify(plan)),digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');}catch{return null;}
}
export function compileWorkbenchSource({project,part,role,bpm,source,tune=n=>n,muted=false,allowEmpty=false}){
 if(role==='perc')return compileWorkbenchDrums({project,part,bpm,source,muted,allowEmpty});
 if(!project?.patterns||(!project.patterns[role]&&!allowEmpty)||role==='perc'||!['subtractive','fm','piano','iowa','classic','classic-composite'].includes(source?.kind))throw Error('Rust preview requires a supported pitched source sequence.');
 if(muted)throw Error('The selected sequencer is muted or excluded by solo.');
 if(!Number.isInteger(project.stepsPerBar)||project.stepsPerBar<1||project.stepsPerBar>64||!Number.isInteger(part?.startBar)||part.startBar<0||!Number.isInteger(part.bars)||part.bars<1||part.bars>16||!Number.isFinite(bpm)||bpm<50||bpm>200)throw Error('Unsupported preview progression/tempo bounds.');
 const rate=48000,stepSec=60/bpm/4,start=part.startBar*project.stepsPerBar,length=part.bars*project.stepsPerBar,preroll=.125,random=seeded(project.seed??0x4a11),notes=[];
 if(!Number.isInteger(project.bars)||start+length>project.bars*project.stepsPerBar)throw Error('Preview progression is outside the song.');
 const pattern=project.patterns[role]??{mode:'note',follow:'off',length:project.bars*project.stepsPerBar,steps:[]},p={key:project.key,leader:-1,sequencers:[{pattern:structuredClone(pattern),mute:false}]};
 for(let i=0;i<length;i++){const absolute=start+i,ctx={time:preroll+i*stepSec,stepSec,swing:.5,flam:.5,count:i,cycle:0,length,random};for(const e of [...projectStepEvents(p,absolute,ctx),...placedChordEvents(p.sequencers[0].pattern,absolute,{...ctx,key:p.key,track:0})]){const midi=tune(e.note);if(!Number.isFinite(midi)||midi<0||midi>127||!Number.isFinite(e.time)||!Number.isFinite(e.duration)||e.duration<=0||!Number.isFinite(e.velocity)||e.velocity<0||e.velocity>1)throw Error('Invalid captured source note');notes.push({midi,time:Math.max(0,e.time),duration:e.duration,velocity:e.velocity});if(notes.length>WORKBENCH_SOURCE_BUDGET.maxNotes)throw Error('Source preview note capacity exceeded');}}
 if(!notes.length&&!allowEmpty)throw Error('The selected progression has no notes for this sequencer.');
 if(source.kind==='classic'||source.kind==='classic-composite'){
  const composite=source.kind==='classic-composite';if(composite&&source.patch.slots.length>5)throw Error('Classic preview exceeds five pitched source buses');
  const c=composite?compileClassicCompositeNotes(source,notes,rate):compileClassicNotes(source,notes,rate),seconds=Math.max(preroll+length*stepSec,...notes.map(n=>n.time+n.duration))+c.tail;
  if(!Number.isFinite(seconds)||seconds>120)throw Error('Classic preview exceeds120 seconds');
  return {version:1,role,part:structuredClone(part),bpm,sampleRate:rate,preroll,tailSeconds:c.tail,endFrame:Math.ceil(seconds*rate),noteCount:notes.length,notes,timingPolicy:'Exact native sample timestamps; source-local canonical128 callback partition',...(composite?{sources:c.sources.map(s=>({role,slot:s.slot,sourceId:s.sourceId,kind:'classic',noteCount:s.noteCount,notes:notes.filter((_,i)=>c.allocation[i].slot===s.slot),tailSeconds:s.tail,endFrame:Math.ceil(seconds*rate)})),bindings:c.bindings}:{}),graph:composite?c.referenceGraph:{version:1,modules:[{id:1,type:'legacy.classic',version:1,parameters:{gain:1},config:c.config},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:18,port:'program.in'}}],events:c.events}};
 }
 if(source.kind==='iowa'){
  notes.sort((a,b)=>a.time-b.time);const {config,events,tail}=compileIowaNotes(source,notes,rate),seconds=Math.max(preroll+length*stepSec,...notes.map(n=>n.time+n.duration))+tail;
  if(seconds>120)throw Error('Iowa preview exceeds 120 seconds');
  return {version:1,role,part:structuredClone(part),bpm,sampleRate:rate,preroll,tailSeconds:tail,endFrame:Math.ceil(seconds*rate),noteCount:notes.length,notes,preparation:source.preparation??{backend:'js-reference',engineVersion:null},timingPolicy:'Legacy 128-frame note ticks; requested times retained in notes',graph:{version:1,modules:[{id:1,type:'legacy.iowa',version:1,parameters:{gain:1},config},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:18,port:'program.in'}}],events}};
 }
 if(source.kind==='piano'){
  notes.sort((a,b)=>a.time-b.time);
  const {config,tail}=compilePianoNotes(source,notes,rate),seconds=Math.max(preroll+length*stepSec,...notes.map(n=>n.time+n.duration))+tail;
  if(seconds>120)throw Error('Piano preview exceeds 120 seconds');
  const events=notes.map((n,i)=>({kind:'note',target:1,owner:1,event:0,note:i+1,frame:Math.round(n.time*rate),a:n.midi,b:n.velocity}));
  return {version:1,role,part:structuredClone(part),bpm,sampleRate:rate,preroll,tailSeconds:tail,endFrame:Math.ceil(seconds*rate),noteCount:notes.length,notes,graph:{version:1,modules:[{id:1,type:'legacy.piano',version:config.version,parameters:{gain:1},config},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:18,port:'program.in'}}],events}};
 }
 const patch=structuredClone(source.patch),fm=source.kind==='fm',release=Math.max(0,...(fm?patch.operators.slice(0,patch.global.operators).map(o=>o.release):patch.layers.slice(0,patch.global.model===2?2:1).map(l=>l.release))),tail=Math.max(1,release+patchColourTail(patch)+1),seconds=Math.max(preroll+length*stepSec,...notes.map(n=>n.time+n.duration))+tail;
 if(tail>30||!Number.isFinite(seconds)||seconds>WORKBENCH_SOURCE_BUDGET.maxSeconds)throw Error('Source preview duration exceeds 120 seconds');
 const events=notes.flatMap((n,i)=>[{kind:'note',target:1,owner:1,event:0,note:i+1,frame:Math.round(n.time*rate),a:n.midi,b:n.velocity},{kind:'note',target:1,owner:1,event:1,note:i+1,frame:Math.round((n.time+n.duration)*rate),a:0,b:0}]);
 const graph={version:1,modules:[{id:1,type:fm?'legacy.fm':'legacy.core',version:1,parameters:{gain:1},config:{version:1,patch:fm?fmPacket(patch):parameterTriples(patch),performance:sanitizeNoteBehavior(patch.performance),events:[],edits:[]}},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:18,port:'program.in'}}],events};
 return {version:1,role,part:structuredClone(part),bpm,sampleRate:rate,preroll,tailSeconds:tail,endFrame:Math.ceil(seconds*rate),noteCount:notes.length,notes,graph};
}
export const WORKBENCH_PITCHED_ROLES=Object.freeze(['lead','counter','rhythm','pad','bass']);
export const WORKBENCH_SOURCE_ROLES=Object.freeze([...WORKBENCH_PITCHED_ROLES,'perc']);
export function compileWorkbenchSet({project,part,bpm,sources}){
 if(!Array.isArray(sources)||!sources.length||sources.length>6||new Set(sources.map(s=>s.role)).size!==sources.length||sources.some(s=>!WORKBENCH_SOURCE_ROLES.includes(s.role)))throw Error('Select one to six distinct source roles.');
 const counts=sources.map(s=>s.source.kind==='classic-composite'?s.source.patch?.slots?.length:1),physical=counts.reduce((n,c)=>n+c,0),pitched=sources.reduce((n,s,i)=>n+(s.role==='perc'?0:counts[i]),0);
 if(counts.some(c=>!Number.isInteger(c)||c<1)||physical>6||pitched>5)throw Error('Selected set exceeds six physical source buses (five pitched plus Drums)');
 const used=new Set(sources.map(s=>WORKBENCH_SOURCE_ROLES.indexOf(s.role)+1)),free=[1,2,3,4,5].filter(id=>!used.has(id));
 const modules=[],connections=[],events=[],captured=[];let noteCount=0,hitCount=0,endFrame=0;
 for(const s of sources){let p;try{p=compileWorkbenchSource({project,part,bpm,...s,allowEmpty:true});}catch(e){throw Error(`${s.role}: ${e.message}`);}
  const sourceId=WORKBENCH_SOURCE_ROLES.indexOf(s.role)+1,parts=p.sources??[{sourceId:p.graph.modules[0].id,role:s.role,kind:s.source.kind,noteCount:p.noteCount,notes:p.notes,tailSeconds:p.tailSeconds,endFrame:p.endFrame}],mapping=new Map(parts.map((part,i)=>[part.sourceId,i===0?sourceId:free.shift()]));
  for(const part of parts){const id=mapping.get(part.sourceId),module=p.graph.modules.find(m=>m.id===part.sourceId);modules.push({...module,id});captured.push({...part,role:s.role,sourceId:id,...(p.preparation?{preparation:p.preparation}:{}),...(s.role==='perc'?{hitCount:p.hitCount,audibleHitCount:p.audibleHitCount,hits:p.hits,kitVoice:p.kitVoice,hitIdPolicy:p.hitIdPolicy,expression:p.expression}:{})});}
  events.push(...p.graph.events.map(e=>({...e,target:mapping.get(e.target),owner:mapping.get(e.target)})));noteCount+=p.noteCount;hitCount+=p.hitCount??0;endFrame=Math.max(endFrame,p.endFrame);
 }
 if(!noteCount&&!hitCount)throw Error('The selected set has no notes or enabled kit hits.');
 if(noteCount>WORKBENCH_SOURCE_BUDGET.maxNotes)throw Error('Pitched set exceeds combined 2,000-note capacity.');
 if(events.length>4000)throw Error('Source set exceeds combined 4,000-event capacity.');
 const edge=(from,to,port)=>connections.push({id:connections.length+1,kind:'audio',from:{module:from,port:'audio.out'},to:{module:to,port}});let sum=captured[0].sourceId;
 for(let i=1;i<captured.length;i++){const id=10+i;modules.push({id,type:'ref.mix',version:1,parameters:{gain:1}});edge(sum,id,'a.in');edge(captured[i].sourceId,id,'b.in');sum=id;}
 modules.push({id:18,type:'ref.output',version:1,parameters:{}});edge(sum,18,'program.in');
 return {version:1,role:captured.some(s=>s.role==='perc')?'source-set':'pitched-set',roles:captured.map(s=>s.role),part:structuredClone(part),bpm,sampleRate:48000,endFrame,noteCount,...(hitCount?{hitCount}:{}),sources:captured,graph:{version:1,modules,connections,events}};
}
// Explicit diagnostic material; never reads or edits the user's song. Current
// patches and tuning still pass through exactly the same source compiler.
export function compileWorkbenchAudition({sources}){
 if(!Array.isArray(sources)||!sources.length||sources.length>6)throw Error('Select one to six sources for audition.');
 const pitches={lead:72,counter:64,rhythm:60,pad:55,bass:36},overlap=sources.length*6,length=overlap+16;
 const patterns=Object.fromEntries(sources.map((s,i)=>{const steps=Array(length).fill(null);if(s.role==='perc'){
  const add=(at,drum,velocity=.25)=>{(steps[at]??={hits:[]}).hits.push({drum,velocity,duration:2,vary:0});};
  [0,1,4,6].forEach((drum,k)=>add(i*6+k,drum,.35));
  for(let k=0;k<16;k+=2)add(overlap+k,4,.22);for(const k of [0,8])add(overlap+k,0,.35);for(const k of [4,12])add(overlap+k,1,.3);add(overlap,5,.2);
  return [s.role,{mode:'drums',length,steps}];
 }const midi=s.source.auditionMidi?.(pitches[s.role])??pitches[s.role];steps[i*6]={n:[{midi}],len:4,gate:1,vel:.45};steps[overlap]={n:[{midi}],len:16,gate:1,vel:.35};return [s.role,{mode:'note',follow:'off',gate:1,length,steps}];}));
 const plan=compileWorkbenchSet({project:{bars:1,stepsPerBar:length,key:{tonic:0,scale:[0,2,4,5,7,9,11]},patterns},part:{startBar:0,bars:1},bpm:120,sources});
 return {...plan,audition:{version:1,material:'diagnostic-test-notes',schedule:'individual-attacks-then-overlap',songUnchanged:true,soloSlotFrames:36000,soloGateFrames:24000,overlapFrame:6000+overlap*6000,overlapGateFrames:96000}};
}
