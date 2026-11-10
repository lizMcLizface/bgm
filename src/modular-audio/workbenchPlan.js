import {projectStepEvents} from '../seq/notes';
import {placedChordEvents} from '../synths/all/placedChords';
import {seeded} from '../app/random';
import {parameterTriples} from '../synth-lab/patch';
import {fmPacket} from '../synth-lab/fmPatch';
import {sanitizeNoteBehavior} from '../synth-lab/noteBehavior';
import {patchColourTail} from '../synth-lab/voiceColour';
export const WORKBENCH_SOURCE_BUDGET=Object.freeze({sampleRate:48000,blockFrames:512,poolBlocks:6,scheduling:'message',maxNotes:2000,maxSeconds:120});
// Hash only the captured source/score, not executor capacity or later counters.
// Missing Web Crypto leaves identity unknown; it must not invent a match.
export async function hashWorkbenchPlan(plan){
 try{const bytes=new TextEncoder().encode(JSON.stringify(plan)),digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');}catch{return null;}
}
export function compileWorkbenchSource({project,part,role,bpm,source,tune=n=>n,muted=false,allowEmpty=false}){
 if(!project?.patterns||(!project.patterns[role]&&!allowEmpty)||role==='perc'||!['subtractive','fm'].includes(source?.kind))throw Error('Rust preview requires a pitched core/FM sequence.');
 if(muted)throw Error('The selected sequencer is muted or excluded by solo.');
 if(!Number.isInteger(project.stepsPerBar)||project.stepsPerBar<1||project.stepsPerBar>64||!Number.isInteger(part?.startBar)||part.startBar<0||!Number.isInteger(part.bars)||part.bars<1||part.bars>16||!Number.isFinite(bpm)||bpm<50||bpm>200)throw Error('Unsupported preview progression/tempo bounds.');
 const rate=48000,stepSec=60/bpm/4,start=part.startBar*project.stepsPerBar,length=part.bars*project.stepsPerBar,preroll=.125,random=seeded(project.seed??0x4a11),notes=[];
 if(!Number.isInteger(project.bars)||start+length>project.bars*project.stepsPerBar)throw Error('Preview progression is outside the song.');
 const pattern=project.patterns[role]??{mode:'note',follow:'off',length:project.bars*project.stepsPerBar,steps:[]},p={key:project.key,leader:-1,sequencers:[{pattern:structuredClone(pattern),mute:false}]};
 for(let i=0;i<length;i++){const absolute=start+i,ctx={time:preroll+i*stepSec,stepSec,swing:.5,flam:.5,count:i,cycle:0,length,random};for(const e of [...projectStepEvents(p,absolute,ctx),...placedChordEvents(p.sequencers[0].pattern,absolute,{...ctx,key:p.key,track:0})]){const midi=tune(e.note);if(!Number.isFinite(midi)||midi<0||midi>127||!Number.isFinite(e.time)||!Number.isFinite(e.duration)||e.duration<=0||!Number.isFinite(e.velocity)||e.velocity<0||e.velocity>1)throw Error('Invalid captured source note');notes.push({midi,time:Math.max(0,e.time),duration:e.duration,velocity:e.velocity});if(notes.length>WORKBENCH_SOURCE_BUDGET.maxNotes)throw Error('Source preview note capacity exceeded');}}
 if(!notes.length&&!allowEmpty)throw Error('The selected progression has no notes for this sequencer.');
 const patch=structuredClone(source.patch),fm=source.kind==='fm',release=Math.max(0,...(fm?patch.operators.slice(0,patch.global.operators).map(o=>o.release):patch.layers.slice(0,patch.global.model===2?2:1).map(l=>l.release))),tail=Math.max(1,release+patchColourTail(patch)+1),seconds=Math.max(preroll+length*stepSec,...notes.map(n=>n.time+n.duration))+tail;
 if(tail>30||!Number.isFinite(seconds)||seconds>WORKBENCH_SOURCE_BUDGET.maxSeconds)throw Error('Source preview duration exceeds 120 seconds');
 const events=notes.flatMap((n,i)=>[{kind:'note',target:1,owner:1,event:0,note:i+1,frame:Math.round(n.time*rate),a:n.midi,b:n.velocity},{kind:'note',target:1,owner:1,event:1,note:i+1,frame:Math.round((n.time+n.duration)*rate),a:0,b:0}]);
 const graph={version:1,modules:[{id:1,type:fm?'legacy.fm':'legacy.core',version:1,parameters:{gain:1},config:{version:1,patch:fm?fmPacket(patch):parameterTriples(patch),performance:sanitizeNoteBehavior(patch.performance),events:[],edits:[]}},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:18,port:'program.in'}}],events};
 return {version:1,role,part:structuredClone(part),bpm,sampleRate:rate,preroll,tailSeconds:tail,endFrame:Math.ceil(seconds*rate),noteCount:notes.length,notes,graph};
}
export const WORKBENCH_PITCHED_ROLES=Object.freeze(['lead','counter','rhythm','pad','bass']);
export function compileWorkbenchSet({project,part,bpm,sources}){
 if(!Array.isArray(sources)||!sources.length||sources.length>5||new Set(sources.map(s=>s.role)).size!==sources.length||sources.some(s=>!WORKBENCH_PITCHED_ROLES.includes(s.role)))throw Error('Select one to five distinct pitched roles.');
 const modules=[],connections=[],events=[],captured=[];let noteCount=0,endFrame=0;
 for(const s of sources){let p;try{p=compileWorkbenchSource({project,part,bpm,...s,allowEmpty:true});}catch(e){throw Error(`${s.role}: ${e.message}`);}const sourceId=WORKBENCH_PITCHED_ROLES.indexOf(s.role)+1;modules.push({...p.graph.modules[0],id:sourceId});events.push(...p.graph.events.map(e=>({...e,target:sourceId,owner:sourceId})));captured.push({role:s.role,sourceId,kind:s.source.kind,noteCount:p.noteCount,notes:p.notes,tailSeconds:p.tailSeconds,endFrame:p.endFrame});noteCount+=p.noteCount;endFrame=Math.max(endFrame,p.endFrame);}
 if(!noteCount)throw Error('The selected pitched set has no notes.');
 if(noteCount>WORKBENCH_SOURCE_BUDGET.maxNotes)throw Error('Pitched set exceeds combined 2,000-note capacity.');
 const edge=(from,to,port)=>connections.push({id:connections.length+1,kind:'audio',from:{module:from,port:'audio.out'},to:{module:to,port}});let sum=captured[0].sourceId;
 for(let i=1;i<captured.length;i++){const id=10+i;modules.push({id,type:'ref.mix',version:1,parameters:{gain:1}});edge(sum,id,'a.in');edge(captured[i].sourceId,id,'b.in');sum=id;}
 modules.push({id:18,type:'ref.output',version:1,parameters:{}});edge(sum,18,'program.in');
 return {version:1,role:'pitched-set',roles:captured.map(s=>s.role),part:structuredClone(part),bpm,sampleRate:48000,endFrame,noteCount,sources:captured,graph:{version:1,modules,connections,events}};
}
// Explicit diagnostic material; never reads or edits the user's song. Current
// patches and tuning still pass through exactly the same source compiler.
export function compileWorkbenchAudition({sources}){
 if(!Array.isArray(sources)||!sources.length||sources.length>5)throw Error('Select one to five pitched voices for audition.');
 const pitches={lead:72,counter:64,rhythm:60,pad:55,bass:36},overlap=sources.length*6,length=overlap+16;
 const patterns=Object.fromEntries(sources.map((s,i)=>{const steps=Array(length).fill(null);steps[i*6]={n:[{midi:pitches[s.role]}],len:4,gate:1,vel:.45};steps[overlap]={n:[{midi:pitches[s.role]}],len:16,gate:1,vel:.35};return [s.role,{mode:'note',follow:'off',gate:1,length,steps}];}));
 const plan=compileWorkbenchSet({project:{bars:1,stepsPerBar:length,key:{tonic:0,scale:[0,2,4,5,7,9,11]},patterns},part:{startBar:0,bars:1},bpm:120,sources});
 return {...plan,audition:{version:1,material:'diagnostic-test-notes',schedule:'individual-attacks-then-overlap',songUnchanged:true,soloSlotFrames:36000,soloGateFrames:24000,overlapFrame:6000+overlap*6000,overlapGateFrames:96000}};
}
