// Actual pre-rendered wind/fire/vinyl sources before native Ambience host chains.
import {renderParams,LAYERS}from '../app/engine/ambienceSynth.js';
export const AMBIENCE_LOOP_KINDS=Object.freeze(['wind','fire','vinyl']);
export const AMBIENCE_LOOP_KEYS=Object.freeze({wind:['speed','gusts'],fire:['crackle','roar'],vinyl:['crackle','hiss']});
export function validateAmbienceLoopSpec(p){if(p?.version!==1||!AMBIENCE_LOOP_KINDS.includes(p.kind)||!Number.isInteger(p.sampleRate)||p.sampleRate<8000||p.sampleRate>192000||!p.parameters||Object.keys(p.parameters).length!==2||!AMBIENCE_LOOP_KEYS[p.kind].every(k=>typeof p.parameters[k]==='number'&&Number.isFinite(p.parameters[k])&&p.parameters[k]>=0&&p.parameters[k]<=1&&p.parameters[k]===Math.round(p.parameters[k]*10)/10))throw Error('Invalid ambience loop specification');return p;}
export function ambienceLoopSpec(kind,sampleRate,shape={}){if(!AMBIENCE_LOOP_KINDS.includes(kind))throw Error('Unsupported ambience loop material');for(const key of AMBIENCE_LOOP_KEYS[kind])if(shape[key]!==undefined&&(typeof shape[key]!=='number'||!Number.isFinite(shape[key])||shape[key]<0||shape[key]>1))throw Error('Invalid ambience loop shape');return validateAmbienceLoopSpec({version:1,kind,sampleRate,parameters:renderParams(kind,shape)});}
export const saveAmbienceLoopSpec=p=>JSON.stringify(validateAmbienceLoopSpec(p),null,2)+'\n';
export const loadAmbienceLoopSpec=s=>validateAmbienceLoopSpec(JSON.parse(s));
export class OwnedAmbienceLoop{
 constructor(engine,spec){this.e=engine;this.spec=loadAmbienceLoopSpec(saveAmbienceLoopSpec(spec));if(engine.ambience_loop_api()!==1)throw Error('Ambience loop ABI mismatch');const p=this.spec;this.handle=engine.ambience_loop_new(AMBIENCE_LOOP_KINDS.indexOf(p.kind),p.sampleRate,...AMBIENCE_LOOP_KEYS[p.kind].map(k=>p.parameters[k]));if(!this.handle)throw Error('Ambience loop preparation rejected');try{this.length=engine.ambience_loop_len(this.handle);if(this.length!==Math.round(LAYERS[p.kind].seconds*p.sampleRate))throw Error('Ambience loop length differs');this.refresh();}catch(error){this.dispose();throw error;}}
 alive(){if(!this.handle)throw Error('Disposed ambience loop');}
 refresh(){this.alive();this.memory=this.e.memory.buffer;this.pcm=[0,1].map(ch=>new Float32Array(this.memory,this.e.ambience_loop_pcm(this.handle,ch),this.length));this.output=[0,1].map(ch=>new Float32Array(this.memory,this.e.ambience_loop_output(this.handle,ch),2048));}
 render(n){this.alive();if(!Number.isInteger(n)||n<0||n>2048)throw Error('Invalid ambience loop render bounds');if(this.memory!==this.e.memory.buffer)throw Error('Ambience loop memory grew; refresh outside render');if(!this.e.ambience_loop_render(this.handle,n))throw Error('Ambience loop render rejected');}
 reset(){this.alive();this.e.ambience_loop_reset(this.handle);}
 stats(){this.alive();const s=i=>this.e.ambience_loop_stat(this.handle,i);return {frame:s(0),cursor:s(1),normalizationGain:s(2),kind:this.spec.kind,sampleRate:s(4),parameters:AMBIENCE_LOOP_KEYS[this.spec.kind].map((key,i)=>[key,s(5+i)]),loopFrames:this.length};}
 dispose(){if(this.handle){this.e.ambience_loop_free(this.handle);this.handle=0;this.pcm=this.output=this.memory=null;}}
}
