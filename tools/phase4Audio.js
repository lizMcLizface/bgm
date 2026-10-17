import {slideNotes} from '../src/app/composition/noteSlides';
import {stringPatch} from '../src/app/engine/stringPatches';
import {pianoPatch} from '../src/app/engine/pianoPatches';
import Instrument from '../src/app/engine/Instrument';
import {ROLES} from '../src/app/Generator';
import {SCENES,sceneSlug,sceneSettings} from '../src/app/scenes';
import {findPreset} from '../src/app/editor/presetStore';
import {soundContext} from '../src/app/soundGenV3';
import {prepareSound} from '../src/app/engine/prepareSound';
import {noiseReady} from '../src/nodes/noiseGenerator';
import {bitCrusherReady} from '../src/nodes/bitcrusher';
import {expressNotes,expressHeldNotes,connectWindNotes,timeSoundNotes} from '../src/app/composition/noteExpression';
import {AUDIT_CASES,auditCase,measureAudio,windowRms,auditWarnings} from './audioAudit';
export const SOUND_ROLES=['lead','counter','pad','bass'];
export const MODES={connections:'Optional held pad / bass connections',reference:'Earlier patches / fixed articulation',current:'Current expression · full tails',tight:'Optional beat / gate timing',slides:'Optional continuous pitch motion'};
export async function reviewSounds(options,mode='current') {
 const scene=SCENES.find(s=>sceneSlug(s.name)===options.preset);if(!scene)throw Error('Choose a musical preset.');
 const settings=sceneSettings(scene,options.seed??42),sounds={};
 for(const role of SOUND_ROLES) {
  if(options.sound==='generated') sounds[role]=await prepareSound({version:3,role,ensemble:options.soundSeed??12345,...soundContext(settings,scene,role)},mode==='reference'?'legacy':'latest',{voiceColour:false,stringResonance:false,pianoResonance:false});
  else {const v=scene.voices[role]??ROLES[role].preset;
   if(typeof v==='string'){const preset=findPreset(v);sounds[role]={name:v,preset:mode==='reference'?{...preset}:pianoPatch(v,stringPatch(v,{...preset},'latest',{resonance:false}),'latest',{resonance:false})};}
   else sounds[role]={name:v.name,preset:{...v.synth}};
  }
  if(!sounds[role].preset)throw Error('Sound is unavailable: '+sounds[role].name);
 }
 return {sounds,settings};
}
export function applyExpression(events,voice,role,bpm,unitsPerBeat,mode,caseId) {
 if(mode==='reference')return events;
 const unit=60/(bpm*unitsPerBeat),voices={[role]:voice};
 // Synthetic audit events have seconds, not transport units.
 const notes=events.map(e=>({...e,role,beat:e.time/unit,length:e.duration/unit}));
 expressNotes(notes,{voices,secondsPerBeat:unit,units:4*unitsPerBeat});
 expressHeldNotes(notes,{voices,secondsPerBeat:unit});connectWindNotes(notes,{voices,secondsPerBeat:unit,units:4*unitsPerBeat});
 if(mode==='slides') {
  slideNotes(notes,{secondsPerBeat:unit,noteSlides:!['chord-slide','held-glide'].includes(caseId),padMotion:caseId!=='chord-slide',bassMotion:caseId!=='chord-slide',chordSlides:caseId==='chord-slide'});
  // Force explicit per-note bends in the reuse/cancellation stress cases,
  // whose overlapping gates intentionally do not qualify as melodic joins.
  if(['steal','cancel','resume'].includes(caseId))notes.forEach((n,i)=>{
   const from=i?notes[i-1].midi:caseId==='resume'&&n.time>1.6?n.midi-2:undefined;
   if(from!==undefined&&from!==n.midi)n.expression={...n.expression,slideFromMidi:from,slideSeconds:Math.min(.3,n.duration*.4)};
  });
 }
 if(mode==='slides'&&caseId==='held-glide')for(const n of notes)n.expression={...n.expression,pitchTargets:n.pitchTargets};
 if(mode==='tight')timeSoundNotes(notes,{voices,bpm,tempoEffects:true,gateEnvelopes:true});
 return notes;
}
const ready=async inst=>{const deadline=Date.now()+7000;while(!inst.reverb.settled&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));if(!inst.reverb.settled)throw Error('Reverb did not become ready.');};
/** Raw floating point, real role polyphony and role gain; no export fade, matching or soft limiter. */
export async function renderAuditCase({sound,role,id,mode='current',bpm=90,unitsPerBeat=1,volume=.7}) {
 const fixture=auditCase(id,role),sampleRate=48000;
 const seconds=fixture.lastGate+(id==='silence'?2:20);
 const ctx=new OfflineAudioContext({numberOfChannels:2,length:Math.ceil(seconds*sampleRate),sampleRate});
 let inst;
 try {
  inst=new Instrument({polyphony:ROLES[role].polyphony,preset:sound.preset,context:ctx});inst.scheduleSleep=()=>{};
  inst.tempoTailReserve=mode==='tight';const gain=ctx.createGain();gain.gain.value=volume;gain.connect(ctx.destination);inst.connect(gain);
  await Promise.all([noiseReady(ctx),bitCrusherReady(ctx),ready(inst)]);
  let steals=0;const allocate=inst.allocateVoice.bind(inst);inst.allocateVoice=time=>{const result=allocate(time);if(result.steal)steals++;return result;};
  const voice={name:sound.name,preset:inst.preset};
  const notes=applyExpression(fixture.notes,voice,role,bpm,unitsPerBeat,mode,id);
  for(const n of notes)inst.scheduleNote(n.midi,n.time,n.duration,n.velocity,0,n.expression);
  const reductions=[],actionErrors=[];
  const checkpoints=new Map();
  for(let t=.125;t<seconds-.01;t+=.25)checkpoints.set(t,()=>reductions.push({time:t,limiter:inst.limiter.getNode().reduction,mix:inst.synthMix.getNode().reduction}));
  for(const action of fixture.actions)checkpoints.set(action.time,()=>{
   if(action.type==='cancel')inst.silence();
   else if(action.type==='flush')inst.flushTails();
   else {const [n]=applyExpression([action.note],voice,role,bpm,unitsPerBeat,mode);inst.scheduleNote(n.midi,n.time,n.duration,n.velocity,0,n.expression);}
  });
  for(const [time,act]of [...checkpoints].sort((a,b)=>a[0]-b[0]))ctx.suspend(time).then(()=>{try{act();}catch(error){actionErrors.push(error.message);}finally{ctx.resume();}});
  const buffer=await ctx.startRendering(),channels=[buffer.getChannelData(0),buffer.getChannelData(1)];
  if(actionErrors.length)throw Error(actionErrors.join('; '));
  const result={id,role,mode,sound:sound.name,model:inst.preset.stringModel,...measureAudio(channels,sampleRate,{lastGate:fixture.lastGate}),steals,
   limiterMin:Math.min(0,...reductions.map(r=>r.limiter)),mixMin:Math.min(0,...reductions.map(r=>r.mix)),reductionSamples:reductions.length,
   afterCancelRms:id==='cancel'?windowRms(channels,sampleRate,2,3):null,
   resumedRms:id==='resume'?windowRms(channels,sampleRate,1.65,2.05):null,
   movingNotes:notes.filter(n=>n.expression?.pitchMotion).length,
   slidingNotes:notes.filter(n=>n.expression?.slideFromMidi!==undefined).length,roleGain:volume,tailWindow:seconds-fixture.lastGate};
  result.warnings=auditWarnings(result);if(id==='resume'&&result.resumedRms<1e-6)result.warnings.push('Resume did not sound');return result;
 } finally {inst?.dispose();}
}
export async function runSoundAudit(options,onProgress=()=>{}) {
 const role=options.auditRole??'lead',modes=options.modes??['reference','current'],cases=options.cases??[...AUDIT_CASES,...(modes.includes('slides')?[role==='pad'?'chord-slide':'lead-slide']:[])],rows=[];
 for(const mode of modes) {const {sounds,settings}=await reviewSounds(options,mode);
  for(const id of cases) {onProgress({mode,id,done:rows.length,total:modes.length*cases.length});
   rows.push(await renderAuditCase({sound:sounds[role],role,id,mode,bpm:settings.bpm,unitsPerBeat:settings.meter==='6/8'?3:1,volume:settings.volumes[role]}));}
 }
 return {options,rows,warningCount:rows.filter(r=>r.warnings.length).length,created:new Date().toISOString(),sampleRate:48000};
}
