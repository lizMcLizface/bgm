import {PERFORMANCE} from '../audio/performance';
import {WasmRoomPool} from '../synth-lab/roomPool';
import {createWasmRoomRoute} from '../app/engine/wasmRoomRoute';
import Generator,{ROLES} from '../app/generator';
import {sceneBySlug,sceneSettings} from '../app/scenes';
import WasmInstrument from '../app/engine/wasmInstrument';
import {voiceById,voiceSpec,voiceEngine,voiceMetadata} from './catalog';
import {RUNNERS,roleSources,runnerScene} from './contexts';
export {RUNNERS} from './contexts';
export function runnerSettings(id='held',seed=42){const c=RUNNERS.find(r=>r.id===id)||RUNNERS[0],scene=sceneBySlug(c.scene),s=sceneSettings(scene,seed);s.bpm=c.bpm;s.sections={...s.sections,mode:'off'};s.playAmbience=false;s.ambience=Object.fromEntries(Object.keys(s.ambience).map(k=>[k,0]));s.drift={...s.drift,mode:'off'};if(c.held){s.padWeights=Object.fromEntries(Object.keys(s.padWeights).map(k=>[k,k==='sustain'?1:0]));s.barsPerChord=2;}return s;}
export function createLabRunner(id,seed){const g=new Generator(runnerSettings(id,seed));if(PERFORMANCE.sharedReverb)g.wasmRoomPool=new WasmRoomPool(g.AC,g.output);for(const role of Object.keys(g.roles))g.setRoleMix(role,{mute:role!=='pad'});return g;}
export async function replaceLabVoice(g,role,id,preferred='previous'){
 const entry=voiceById(id);if(!entry)throw Error('Unknown instrument');const r=g.roles[role],engine=voiceEngine(entry,preferred),key=id+':'+engine;
 if(r.labVoiceKey===key){if(r.labPendingKey&&r.labPendingKey!==key){r.labRevision=(r.labRevision??0)+1;r.labPendingKey=null;r.labPending=null;}return false;}if(r.labPendingKey===key)return r.labPending;
 const revision=(r.labRevision??0)+1;r.labRevision=revision;r.labPendingKey=key;
 const work=(async()=>{const polyphony=ROLES[role].polyphony,spec=voiceSpec(entry,preferred,polyphony),next=await WasmInstrument.create({context:g.AC,preset:voiceMetadata(spec),polyphony,spec,roomPool:g.wasmRoomPool});if(r.labRevision!==revision){next.dispose();return false;}let roomRoute;try{if(g.wasmRoomPool)roomRoute=createWasmRoomRoute(g.AC,next,{roleWander:r.wander,volume:r.volume,cutoff:r.tone.frequency.value});}catch(e){next.dispose();throw e;}const old=r.instrument;r.roomRoute?.dispose();r.roomRoute=roomRoute;r.instrument=next;r.presetName=entry.name;r.stringPatchBase=null;next.connect(r.tone);old.dispose();g.applyMix();r.labVoiceId=id;r.labEngine=engine;r.labVoiceKey=key;return true;})();
 r.labPending=work;try{return await work;}finally{if(r.labPending===work){r.labPendingKey=null;r.labPending=null;}}
}
export async function syncLabVoices(g,config){const sources=roleSources(config);return Promise.all(Object.entries(sources).map(([role,v])=>replaceLabVoice(g,role,v.id,v.engine)));}
export function selectRunner(g,id,seed,{resume=true}={}){const running=g.isRunning;if(running)g.stop();const muted=Object.fromEntries(Object.entries(g.roles).map(([r,v])=>[r,v.mute]));g.settings={...runnerSettings(id,seed),muted};if(!muted.perc&&g.settings.drums.style==='off')g.settings.drums.style='brushes';for(const [role,r]of Object.entries(g.roles))r.volume=g.settings.volumes[role]??r.volume;g.roles.perc.instrument.setKit(g.settings.drumKit);g.reset();g.applyMutes();g.planListeners.forEach(f=>f());if(running&&resume)return g.start();}
export function chordAt(g,time=g.AC.currentTime){let beat=g.position();const entry=[...g.beatLog].reverse().find(e=>e.time<=time);if(g.isRunning&&entry)beat=(entry.bar*entry.units)+entry.beatInBar+(time-entry.time)/entry.secondsPerBeat;const bar=Math.floor(beat/g.beatsPerBar);return g.plan.get(bar)??g.getPlan()[0];}
export function chordNotes(record){const pitches=record?.chord?.pitchClasses??[0,4,7];return pitches.map(pc=>48+pc);}
export function disposeRunner(g){g.audioEngineRevision=(g.audioEngineRevision??0)+1;g.stopAll();g.endStopFade();clearInterval(g.echoWatch);for(const r of Object.values(g.roles)){r.labRevision=(r.labRevision??0)+1;r.roomRoute?.dispose();r.instrument.dispose();r.wander.dispose();r.gain.disconnect();r.tone?.disconnect();}g.wasmRoomPool?.dispose();g.ambience.dispose?.();g.output.disconnect();g.ambienceOut.disconnect();}
