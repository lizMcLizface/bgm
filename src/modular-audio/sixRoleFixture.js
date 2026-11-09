import {RECIPES,clonePatch,parameterTriples} from '../synth-lab/patch';
import {FM_RECIPES,cloneFM,fmPacket} from '../synth-lab/fmPatch';
import {defaultInserts,insertsPacket} from '../synth-lab/insertsConfig';
import {defaultEffects} from '../synth-lab/effectsConfig';

export const SIX_ROLES=['lead','second','rhythm','pad','bass','drums'];
const copy=x=>JSON.parse(JSON.stringify(x));
export function makeSixRoleFixture(){
 const bpm=100,ppq=96,bars=4,preroll=.25;
 let seed=0x53a6c91d;
 const rng=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const patches=[clonePatch(RECIPES[6]),cloneFM(FM_RECIPES[0]),clonePatch(RECIPES[4]),clonePatch(RECIPES[8]),cloneFM(FM_RECIPES[2])];
 Object.assign(patches[0].global,{polyphony:8,unison:2,gain:.28});
 Object.assign(patches[0].layers[0],{attack:.02,release:.55});
 patches[1].global.polyphony=8;patches[1].global.quality=1;
 patches[2].global.polyphony=8;patches[2].layers[0].release=.25;
 Object.assign(patches[3].global,{polyphony:12,unison:2,chorus:0});
 Object.assign(patches[3].layers[0],{attack:.5,release:1.6});
 patches[4].global.polyphony=3;patches[4].global.quality=1;
 const locals=[{saturation:.12,drive:7,midGain:1.5},{highGain:-1},{phaser:.14,phaserRate:.22},{chorus:.24,chorusRate:.31},{},{}];
 const gains=[.38,.40,.34,.40,.45,.19],pans=[-.14,.24,.10,-.20,0,0];
 const parts=SIX_ROLES.map((role,i)=>({id:`six-v1-${role}`,role,kind:i===5?'percussion':i===1||i===4?'fm':'core',name:i===5?'808-inspired real percussion':patches[i].name,
  capacity:i===5?64:patches[i].global.polyphony,packet:i===5?null:i===1||i===4?fmPacket(patches[i]):parameterTriples(patches[i]),
  performance:{mode:0,portamento:0,glide:'overlap'},inserts:{...defaultInserts(),...locals[i]},
  channel:{gain:.25,hpOn:false,hp:.2,lpOn:false,lp:.9,hi:.5,mid:.5,lo:.5,pan:(pans[i]+1)/2,vol:.75,mute:false,solo:false,rev:0,dly:0},trim:gains[i],notes:[],hits:[],controls:[],edits:[]}));
 let id=0;
 const note=(part,tick,length,midi,velocity)=>part.notes.push({id:++id,tick,length,midi,velocity});
 const chords=[[48,55,60,64],[45,52,57,60],[41,48,53,57],[43,50,55,59]];
 for(let bar=0;bar<bars;bar++){
  const root=bar*4*ppq,chord=chords[bar];
  for(let s=0;s<8;s++)note(parts[0],root+s*48,38,chord[(s+bar)%4]+24,.58+rng()*.17);
  if(bar===2)for(const midi of chord)note(parts[0],root+288,78,midi+24,.6);
  for(let s=0;s<4;s++)for(const midi of chord.slice(0,3))note(parts[1],root+s*96+24,54,midi+12,.48+rng()*.14);
  for(let s=0;s<8;s++)note(parts[2],root+s*48+12,24,chord[s%4],.55+rng()*.13);
  for(const midi of chord)note(parts[3],root,360,midi,.58);
  for(let s=0;s<4;s++)note(parts[4],root+s*96,72,chord[0]-12+(s===3?12:0),.72);
  for(let s=0;s<16;s++){
   const add=(drum,velocity)=>parts[5].hits.push({id:1000+parts[5].hits.length,tick:root+s*24,drum,velocity,duration:.5,vary:(rng()-.5)*.3,tone:0,decay:1,model:1});
   if(s%4===0)add(0,.78);
   if(s%8===4)add(1,.64);
   if(s%2===0)add(4,.28+(s%4===0?.1:0));
   if(s===14&&bar===3)add(5,.34);
  }
 }
 parts[3].controls=[{tick:12*ppq,kind:2,value:1},{tick:16*ppq-12,kind:2,value:0}];
 parts[1].controls=[{tick:6*ppq,kind:3,value:.3},{tick:10*ppq,kind:3,value:0}];
 const edited=copy(patches[0]);edited.layers[0].cutoff=1100;edited.layers[0].filterAmount=2;
 parts[0].edits=[{tick:8*ppq,seconds:.06,packet:parameterTriples(edited)}];
 return {version:1,id:'six-role-reference-v1',scoreSeed:0x53a6c91d,bpm,ppq,bars,preroll,scoreSeconds:bars*4*60/bpm,totalSeconds:17.5,
  initialization:'Independent legacy Wasm instances with their deterministic built-in init seeds; no public synth seed override. Score RNG is separate.',
  sourcePolicy:'Scalar core/fm kernels, FM quality=1; no bank/SIMD or prepared sampled substitutes.',
  parts,master:{...defaultEffects(),decay:1.4,reverb:.12,delay:.08,delayMs:300,feedback:.23,delayToReverb:.15,quality:1},
  mixerMaster:{vol:.70,width:.5,bal:.5,limit:true,ceil:.85,mono:false,dim:false},
  compressor:{threshold:-24,ratio:4,knee:6,attack:.005,release:.12,output:0,blend:.75,detectorHp:30,keyMode:1,bypass:0},
  keyTap:'Actual kick voices: post source-mute, pre solo/fader. No duplicate kick synth.',
  variants:['current','keyed'],notes:'Finite captured score. Kernel timings and browser routing timings are different measurements; no worker capacity claim.'};
}
export const tickFrame=(f,tick,rate)=>Math.round((f.preroll+tick/f.ppq*60/f.bpm)*rate);
export const fmSpecForPart=(f,p,rate)=>({version:1,patch:p.packet,performance:p.performance,events:partEvents(f,p,rate),edits:p.edits.map(e=>({patch:e.packet,performance:e.performance??p.performance,frame:tickFrame(f,e.tick,rate),seconds:e.seconds}))});
export const coreSpecForPart=fmSpecForPart;
export function partEvents(f,p,rate){return [...p.notes.flatMap(n=>[[0,n.id,tickFrame(f,n.tick,rate),n.midi,n.velocity],[1,n.id,tickFrame(f,n.tick+n.length,rate),0,0]]),...p.controls.map(c=>[c.kind,0,tickFrame(f,c.tick,rate),c.value,0])];}
export function drumEvents(f,p,rate){return p.hits.map(h=>({frame:tickFrame(f,h.tick,rate),target:101,owner:6,kind:'hit',drum:h.drum,velocity:h.velocity,duration:h.duration,vary:h.vary,tone:h.tone,decay:h.decay,hit:h.id,model:h.model}));}
export function percussionPatch(f,rate){return {version:1,modules:[{id:101,type:'legacy.percussion',version:1,parameters:{gain:1}},{id:102,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:101,port:'audio.out'},to:{module:102,port:'program.in'}}],events:drumEvents(f,f.parts[5],rate)};}
export function compressorPatch(f){return {version:1,modules:[{id:201,type:'host.audio',version:1,parameters:{}},{id:202,type:'host.audio',version:1,parameters:{}},{id:203,type:'graph.compressor',version:1,parameters:copy(f.compressor)},{id:204,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:201,port:'audio.out'},to:{module:203,port:'program.in'}},{id:2,kind:'audio',from:{module:202,port:'audio.out'},to:{module:203,port:'detector.in'}},{id:3,kind:'audio',from:{module:203,port:'audio.out'},to:{module:204,port:'program.in'}}],events:[]};}
export function validateSixFixture(f){
 if(f?.version!==1||f.id!=='six-role-reference-v1'||f.parts?.length!==6||f.bpm!==100||f.ppq!==96||f.totalSeconds!==17.5)throw Error('Unsupported six-role fixture');
 if(JSON.stringify(f.parts.map(p=>p.role))!==JSON.stringify(SIX_ROLES)||new Set(f.parts.map(p=>p.id)).size!==6)throw Error('Six distinct role identities required');
 for(const p of f.parts){if(!['core','fm','percussion'].includes(p.kind)||!Number.isFinite(p.trim)||p.trim<0||p.trim>1)throw Error('Invalid source contract');
  for(const n of p.notes)if(!Number.isInteger(n.id)||!Number.isInteger(n.tick)||n.tick<0||!Number.isInteger(n.length)||n.length<1||!Number.isInteger(n.midi)||n.midi<0||n.midi>127||!Number.isFinite(n.velocity)||n.velocity<=0||n.velocity>1)throw Error('Invalid note');
  if(p.kind==='percussion'&&(p.hits.length>256||!p.hits.some(h=>h.drum===0)))throw Error('Invalid real drum/key workload');
  if(p.kind!=='percussion'&&!p.notes.length)throw Error('Empty pitched role');
 }
 return f;
}
export {insertsPacket};
