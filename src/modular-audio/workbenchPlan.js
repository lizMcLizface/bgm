import {projectStepEvents} from '../seq/notes';
import {placedChordEvents} from '../synths/all/placedChords';
import {seeded} from '../app/random';
import {parameterTriples} from '../synth-lab/patch';
import {fmPacket} from '../synth-lab/fmPatch';
import {sanitizeNoteBehavior} from '../synth-lab/noteBehavior';
import {patchColourTail} from '../synth-lab/voiceColour';
export const WORKBENCH_SOURCE_BUDGET=Object.freeze({sampleRate:48000,blockFrames:512,poolBlocks:6,scheduling:'message',maxNotes:2000,maxSeconds:120});
export function compileWorkbenchSource({project,part,role,bpm,source,tune=n=>n,muted=false}){
 if(!project?.patterns?.[role]||role==='perc'||!['subtractive','fm'].includes(source?.kind))throw Error('Rust preview requires a pitched core/FM sequence.');
 if(muted)throw Error('The selected sequencer is muted or excluded by solo.');
 if(!Number.isInteger(project.stepsPerBar)||project.stepsPerBar<1||project.stepsPerBar>64||!Number.isInteger(part?.startBar)||part.startBar<0||!Number.isInteger(part.bars)||part.bars<1||part.bars>16||!Number.isFinite(bpm)||bpm<50||bpm>200)throw Error('Unsupported preview progression/tempo bounds.');
 const rate=48000,stepSec=60/bpm/4,start=part.startBar*project.stepsPerBar,length=part.bars*project.stepsPerBar,preroll=.125,random=seeded(project.seed??0x4a11),notes=[];
 if(!Number.isInteger(project.bars)||start+length>project.bars*project.stepsPerBar)throw Error('Preview progression is outside the song.');
 const p={key:project.key,leader:-1,sequencers:[{pattern:structuredClone(project.patterns[role]),mute:false}]};
 for(let i=0;i<length;i++){const absolute=start+i,ctx={time:preroll+i*stepSec,stepSec,swing:.5,flam:.5,count:i,cycle:0,length,random};for(const e of [...projectStepEvents(p,absolute,ctx),...placedChordEvents(p.sequencers[0].pattern,absolute,{...ctx,key:p.key,track:0})]){const midi=tune(e.note);if(!Number.isFinite(midi)||midi<0||midi>127||!Number.isFinite(e.time)||!Number.isFinite(e.duration)||e.duration<=0||!Number.isFinite(e.velocity)||e.velocity<0||e.velocity>1)throw Error('Invalid captured source note');notes.push({midi,time:Math.max(0,e.time),duration:e.duration,velocity:e.velocity});if(notes.length>WORKBENCH_SOURCE_BUDGET.maxNotes)throw Error('Source preview note capacity exceeded');}}
 if(!notes.length)throw Error('The selected progression has no notes for this sequencer.');
 const patch=structuredClone(source.patch),fm=source.kind==='fm',release=Math.max(0,...(fm?patch.operators.slice(0,patch.global.operators).map(o=>o.release):patch.layers.slice(0,patch.global.model===2?2:1).map(l=>l.release))),tail=Math.max(1,release+patchColourTail(patch)+1),seconds=Math.max(preroll+length*stepSec,...notes.map(n=>n.time+n.duration))+tail;
 if(tail>30||!Number.isFinite(seconds)||seconds>WORKBENCH_SOURCE_BUDGET.maxSeconds)throw Error('Source preview duration exceeds 120 seconds');
 const events=notes.flatMap((n,i)=>[{kind:'note',target:1,owner:1,event:0,note:i+1,frame:Math.round(n.time*rate),a:n.midi,b:n.velocity},{kind:'note',target:1,owner:1,event:1,note:i+1,frame:Math.round((n.time+n.duration)*rate),a:0,b:0}]);
 const graph={version:1,modules:[{id:1,type:fm?'legacy.fm':'legacy.core',version:1,parameters:{gain:1},config:{version:1,patch:fm?fmPacket(patch):parameterTriples(patch),performance:sanitizeNoteBehavior(patch.performance),events:[],edits:[]}},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:18,port:'program.in'}}],events};
 return {version:1,role,part:structuredClone(part),bpm,sampleRate:rate,preroll,tailSeconds:tail,endFrame:Math.ceil(seconds*rate),noteCount:notes.length,notes,graph};
}
