import {RECIPES,clonePatch} from './patch';
import {FM_RECIPES,cloneFM,topology} from './fmPatch';
import {PROCEDURAL_RECIPES,sanitizeProcedural,proceduralTail} from './proceduralPatch';
import {defaultEffects,sanitizeEffects} from './effectsConfig';
import {defaultInserts,sanitizeInserts} from './insertsConfig';
import {finalizeEnsemblePlan} from './ensemblePlan';
import {patchColourTail} from './voiceColour';
export const STRESS_DEFAULTS={filter:'svf',acoustic:false,family:'mixed',instruments:5,voices:8,unison:1,layers:1,operators:6,quality:1,rate:48000,inserts:'all',routing:'local',rooms:1,privateRoom:false,decay:8,roomQuality:1,expression:false,window:'fixed'};
const choice=(x,values,d)=>values.includes(Number(x))?Number(x):d;
export function stressConfig(raw={}){return {filter:raw.filter==='ladder'?'ladder':'svf',acoustic:raw.acoustic===true||raw.acoustic==='true'||raw.acoustic==='1',family:['mixed','subtractive','fm','piano','pluck','drums'].includes(raw.family)?raw.family:'mixed',instruments:choice(raw.instruments,[1,2,4,5,8],5),voices:choice(raw.voices,[2,4,8,16,32],8),unison:choice(raw.unison,[1,2,4],1),layers:choice(raw.layers,[1,2],1),operators:choice(raw.operators,[4,6],6),quality:choice(raw.quality,[0,1,2],1),rate:choice(raw.rate,[44100,48000,96000],48000),inserts:['off','tone','all'].includes(raw.inserts)?raw.inserts:'all',routing:['dry','local','separate'].includes(raw.routing)?raw.routing:'local',rooms:choice(raw.rooms,[1,2,4],1),privateRoom:raw.privateRoom===true||raw.privateRoom==='1'||raw.privateRoom==='true',decay:choice(raw.decay,[2,8,20],8),roomQuality:choice(raw.roomQuality,[0,1],1),expression:raw.expression===true||raw.expression==='1'||raw.expression==='true',window:raw.window==='tail'?'tail':'fixed'};}
const item=(id,name,suite,config)=>({id,name,suite,config:stressConfig({...STRESS_DEFAULTS,...config})});
export const STRESS_CASES=[
 item('sub-small','Subtractive · 1 × 4, dry','core',{family:'subtractive',instruments:1,voices:4,inserts:'off',routing:'dry'}),
 item('sub-voices','Subtractive · 4 × 8, dry','core',{family:'subtractive',instruments:4,voices:8,inserts:'off',routing:'dry'}),
 item('sub-layers','Subtractive · dual layer / 2 unison','core',{family:'subtractive',instruments:4,voices:8,layers:2,unison:2,inserts:'off',routing:'dry'}),
 item('fm-four','FM · four operators / 2×','core',{family:'fm',instruments:4,voices:8,operators:4,inserts:'off',routing:'dry'}),
 item('fm-six','FM · six operators / 2×','core',{family:'fm',instruments:4,voices:8,inserts:'off',routing:'dry'}),
 item('piano','Prepared piano · 4 × 8','core',{family:'piano',instruments:4,inserts:'off',routing:'dry'}),
 item('pluck','Prepared strings · 4 × 16','core',{family:'pluck',instruments:4,voices:16,inserts:'off',routing:'dry'}),
 item('drums','Native kits · 4 × 12 hits/s','core',{family:'drums',instruments:4,inserts:'off',routing:'dry'}),
 item('mixed-dry','Mixed · all five source families, dry','core',{inserts:'off',routing:'dry'}),
 item('mixed-inserts','Mixed · full instrument inserts','core',{routing:'dry'}),
 item('mixed-room','Mixed · inserts, local echoes, one room','core',{}),
 item('mixed-private','Mixed · two shared + private 20 s room','core',{rooms:2,privateRoom:true}),
 item('mixed-separate','Mixed · one effect processor per instrument','core',{routing:'separate'}),
 item('mixed-expression','Mixed · modulation, glides, held patch edits','core',{expression:true}),
 item('mixed-acoustic','Mixed · expression, air / vowels / bodies','core',{expression:true,acoustic:true}),
 item('sub-ladder','Subtractive · 4 × 8, ladder filter','quality',{family:'subtractive',filter:'ladder',instruments:4,voices:8,inserts:'off',routing:'dry'}),
 item('fm-one-x','FM · six operators / 1×','quality',{family:'fm',instruments:4,voices:8,quality:0,inserts:'off',routing:'dry'}),
 item('fm-four-x','FM · six operators / 4×','quality',{family:'fm',instruments:4,voices:8,quality:2,inserts:'off',routing:'dry'}),
 item('mixed-441','Mixed · 44.1 kHz','quality',{rate:44100}),
 item('mixed-96','Mixed · 96 kHz','quality',{rate:96000}),
 item('room-light','Mixed · 8-line room','quality',{roomQuality:0}),
 item('room-long','Mixed · 20 s room, same fixed window','quality',{decay:20}),
 item('boundary-fm','Boundary · 8 × 32 FM voices','boundary',{family:'fm',instruments:8,voices:32,routing:'dry'}),
 item('boundary-sub','Boundary · 4 × 16 dual-layer / 4 unison','boundary',{family:'subtractive',instruments:4,voices:16,layers:2,unison:4,routing:'dry'}),
 item('boundary-band','Boundary · 8 instruments, 16 voices, rooms','boundary',{instruments:8,voices:16,rooms:2,privateRoom:true}),
 item('tail-eight','Complete 8 s room tail','tails',{decay:8,window:'tail'}),
 item('tail-twenty','Complete 20 s room tail','tails',{decay:20,window:'tail'}),
];
export function stressCases(suite='core'){return STRESS_CASES.filter(c=>suite==='all'||c.suite===suite);}
export function stressPlan(raw={}){
 const c=stressConfig(raw),cycleSeconds=8,types=['fm','subtractive','piano','pluck','drums'],chord=[48,55,60,64,67,72,76,79],parts=Array.from({length:c.instruments},(_,id)=>{
  const family=c.family==='mixed'?types[id%types.length]:c.family,kind=['piano','pluck','drums'].includes(family)?'procedural':family,role=family==='drums'?'percussion':family==='piano'?'keys':family==='pluck'?'bass':family==='fm'?'pad':'lead';
  const patch=kind==='fm'?cloneFM(FM_RECIPES[4]):kind==='subtractive'?clonePatch(RECIPES[c.layers===2?2:1]):sanitizeProcedural(PROCEDURAL_RECIPES[{piano:0,pluck:4,drums:5}[family]]);
  patch.global.polyphony=c.voices;patch.global.gain=kind==='fm'?.13:kind==='subtractive'?.17:.3;
  if(kind==='fm'){Object.assign(patch.global,{operators:c.operators,quality:c.quality});Object.assign(patch,topology(c.operators,1));for(const op of patch.operators){op.release=.65;op.attack=Math.min(.15,op.attack);}}
  else if(kind==='subtractive'){patch.global.model=c.layers===2?2:c.filter==='ladder'?0:1;patch.global.unison=c.unison;patch.global.chorus=c.inserts==='off'?0:.18;for(const l of patch.layers){l.attack=.08;l.release=.65;if(c.layers!==2&&c.filter==='ladder'){l.filterFamily=1;l.filter=1;}}}
  else{patch.envelope.release=.65;patch.string.decay=4.8;patch.piano.decay=3;}
  patch.inserts=c.inserts==='off'?defaultInserts():sanitizeInserts({saturation:.15,drive:7,lowGain:1,midGain:-1,highGain:-1,phaser:c.inserts==='all'?.25:0,flanger:c.inserts==='all'?.2:0,chorus:c.inserts==='all'?.25:0,gain:-2});
  if(c.acoustic&&kind==='fm')Object.assign(patch.global,{breath:.15,formant:.4,body:.35,bodyType:3,bodyDecay:.3,noisePressure:.5});
  if(c.acoustic&&kind==='subtractive')for(const l of patch.layers)Object.assign(l,{bow:.2,formant:.25,body:.35,bodyType:1,bodyDecay:.3,airBrightness:2500,noisePressure:.5});
  const notes=[],retunes=[],controls=[],patches=[];
  if(family==='drums')for(let i=0;i<96;i++)notes.push({midi:[0,2,1,2,3,2][i%6],time:.05+i/12,duration:.08,velocity:i%6===0?.55:.3});
  else for(const start of family==='pluck'?[0,4]:[0])for(let v=0;v<c.voices;v++)notes.push({midi:chord[v%8]+(family==='pluck'?-12:0)+(Math.floor(v/8)%2?12:0),time:.05+start+v*.0005,duration:family==='pluck'?3.1:(c.expression||c.acoustic)&&kind!=='procedural'?5.1:7.1,velocity:.58});
  if(c.expression&&['fm','subtractive'].includes(kind)){
   if(kind==='fm')Object.assign(patch.global,{modSource1:3,modTarget1:2,modDepth1:.25,wanderCents:3});else for(const l of patch.layers)Object.assign(l,{modSource1:3,modTarget1:2,modDepth1:.15,wanderCents:3});
   for(let v=0;v<Math.min(4,notes.length);v++){retunes.push({id:v+1,time:1.5,midi:notes[v].midi+2,seconds:.7});controls.push({kind:3,id:v+1,time:2.5,a:.6,b:0});}
   const opened=structuredClone(patch);if(kind==='fm')opened.global.index=1.8;else opened.layers.forEach(l=>l.cutoff=3200);patches.push({time:2,seconds:.25,patch:opened},{time:4,seconds:.25,patch:structuredClone(patch)});
  }
  const release=kind==='fm'?Math.max(...patch.operators.map(o=>o.release))+patchColourTail(patch):kind==='subtractive'?Math.max(...patch.layers.map(l=>l.release))+patchColourTail(patch):proceduralTail(patch);
  return {id,kind,role,name:patch.name,family,patch,notes,retunes,controls,patches,release,gain:.5/Math.sqrt(c.instruments*Math.max(1,c.voices/4)),pan:family==='drums'?0:id%2?.2:-.2,sends:{dry:1,reverb:.65,delay:.6},room:id%c.rooms,voiceEffects:{delayMs:233+id*37,feedback:.4,tone:4500,send:.14,pingPong:id%2,roomSend:.2,room:c.privateRoom&&id===0?'private':'shared',roomDecay:20}};
 });
 const plan=finalizeEnsemblePlan({...c,count:c.instruments,bars:4,bpm:160,sampleRate:c.rate,quality:c.quality,scope:'full',master:.65},parts,cycleSeconds,sanitizeEffects({...defaultEffects(),quality:c.roomQuality,decay:c.decay,reverb:.2,delay:.14,delayMs:333,feedback:.4}));
 const fullSeconds=c.routing==='dry'?plan.sourceSeconds:plan.seconds;plan.seconds=c.window==='tail'?fullSeconds:8;plan.stress={fixtureVersion:2,config:c,window:c.window,fullSeconds,tailTruncated:plan.seconds<fullSeconds,nominalMelodicVoices:parts.filter(p=>p.family!=='drums').length*c.voices,drumHitsPerSecond:parts.filter(p=>p.family==='drums').length*12,subtractiveLanes:parts.filter(p=>p.kind==='subtractive').length*c.voices*c.unison*c.layers,fmOperatorLanes:parts.filter(p=>p.kind==='fm').length*c.voices*c.operators*[1,2,4][c.quality],notesPerCycle:parts.reduce((n,p)=>n+p.notes.length,0)};return plan;
}
