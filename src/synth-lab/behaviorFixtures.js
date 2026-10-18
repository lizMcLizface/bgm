import {RECIPES,clonePatch} from './patch';
import {FM_RECIPES,cloneFM} from './fmPatch';
import {sanitizeNoteBehavior} from './noteBehavior';
export const BEHAVIOR_SOUNDS=[['silk','Dual-VCO silk'],['bass','Resonant bass'],['noir','Layered noir'],['reed','FM hollow reed'],['glass','FM bowed glass']];
export const BEHAVIOR_EXAMPLES=[['overlap','Overlapping melody'],['priority','Return to a held key'],['gaps','Separated notes'],['pedal','Sustain pedal'],['patch','Held sound · patch edits']];
const number=(v,lo,hi,d)=>v!==''&&Number.isFinite(Number(v))?Math.max(lo,Math.min(hi,Number(v))):d;
export function behaviorConfig(raw={}){return {sound:BEHAVIOR_SOUNDS.some(([s])=>s===raw.sound)?raw.sound:'silk',rate:[44100,48000,96000].includes(Number(raw.rate))?Number(raw.rate):48000,example:BEHAVIOR_EXAMPLES.some(([s])=>s===raw.example)?raw.example:'overlap',mode:Math.round(number(raw.mode,0,2,2)),portamento:number(raw.portamento,0,3,.18),glide:raw.glide==='always'?'always':'overlap',transition:number(raw.transition,.016,2,.25)};}
export function behaviorFixture(raw={}){
 const config=behaviorConfig(raw),fm=['reed','glass'].includes(config.sound),kind=fm?'fm':'subtractive',patch=fm?cloneFM(FM_RECIPES[config.sound==='reed'?7:4]):clonePatch(RECIPES[{silk:1,bass:4,noir:2}[config.sound]]),beat=60/96,bars=4,scoreSeconds=.05+bars*4*beat,notes=[],events=[];
 if(!fm)patch.global.chorus=0;patch.performance=sanitizeNoteBehavior();
 if(fm){patch.global.vibrato=2;for(const op of patch.operators){op.attack=Math.min(op.attack,.12);op.release=.5;}}
 else for(const p of patch.layers){p.attack=config.sound==='bass'?.012:.1;p.release=.5;p.body=0;p.bow=0;p.breath=0;}
 const add=(midi,time,duration,velocity=.65)=>notes.push({midi,time:.05+time*beat,duration:duration*beat,velocity});
 if(config.example==='patch')for(const midi of [48,55,60,64])add(midi,0,15);
 else for(let bar=0;bar<4;bar+=2){const base=bar*4,offset=config.sound==='bass'?-12:0;
  if(config.example==='priority'){add(60+offset,base,3.8);add(64+offset,base+.75,1.5);add(67+offset,base+1.25,.55);add(62+offset,base+2.65,.6);}
  else if(config.example==='pedal'){events.push([2,0,Math.round((.05+base*beat)*config.rate),1,0],[2,0,Math.round((.05+(base+3.5)*beat)*config.rate),0,0]);for(const [i,midi]of [60,64,67,62].entries())add(midi+offset,base+i*.75,.45);}
  else [60,64,67,65,62,64,59,60].forEach((midi,i)=>add(midi+offset,base+i*.5,config.example==='gaps'?.3:.67));
 }
 events.push(...notes.flatMap((n,i)=>[[0,i+1,Math.round(n.time*config.rate),n.midi,n.velocity],[1,i+1,Math.round((n.time+n.duration)*config.rate),0,0]]));events.sort((a,b)=>a[2]-b[2]);
 const alternate=(discrete=false)=>{const p=fm?cloneFM(patch):clonePatch(patch);if(fm){p.global.index=discrete?.5:1.8;p.global.feedback=discrete?.02:.12;for(const [i,op]of p.operators.entries()){op.level*=i%2? .8:1.3;if(discrete)op.wave=0;}}else for(const l of p.layers){l.cutoff=discrete?700:3200;l.resonance=discrete?.1:.35;l.filterAmount=discrete?.5:2;if(discrete){l.waveA=2;l.waveB=4;}}return p;};
 const patchRows=config.example==='patch';
 const variants=patchRows?[['instant','Immediate edits',0],['smooth','60 ms smoothing',.06],['morph',`${config.transition.toFixed(2)} s morph`,config.transition]]:[['poly','Polyphonic reference',0],['retrigger','Mono retrigger · no glide',1],['selected',`${['Polyphonic','Mono retrigger','Mono legato'][config.mode]} · ${config.portamento.toFixed(2)} s ${config.glide} glide`,config.mode]];
 const rows=variants.map(([id,name,value])=>{const p=fm?cloneFM(patch):clonePatch(patch);p.performance=patchRows?sanitizeNoteBehavior():sanitizeNoteBehavior({mode:value,portamento:id==='selected'?config.portamento:0,glide:config.glide});const patches=patchRows?[{frame:Math.round((.05+4*beat)*config.rate),patch:alternate(),seconds:value},{frame:Math.round((.05+12*beat)*config.rate),patch:alternate(true),seconds:value}]:[];return {id,name,patch:p,events,patches};});
 return {config,kind,patch,rows,notes,events,bars,bpm:96,scoreSeconds,seconds:scoreSeconds+(fm?Math.max(...patch.operators.map(o=>o.release)):Math.max(...patch.layers.map(l=>l.release)))+.25};
}
