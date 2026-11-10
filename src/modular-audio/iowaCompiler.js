import {heldModel,heldVoice,decayModel,decayVoice} from '../app/engine/iowaModel/model';
import {PATCHES} from '../app/engine/iowaModel/patches';
import LEVELS from '../library/iowaLevels.json';
import {validateIowaConfig} from './iowaConfig';
const fields=['frequency','amplitude','phase','rise','early','late'];
export const iowaStrength=velocity=>Math.max(1,Math.round(Math.round(velocity*12)/12*127));
// Reproduce the legacy strict comparison against the end of a 128-frame block,
// including floating-point boundary cases. Actual events are explicit frames.
export function iowaFrame(seconds,rate){let q=Math.max(0,Math.floor(seconds*rate/128));if(q>0&&seconds<(q-1)*128/rate+128/rate)q--;else if(seconds>=q*128/rate+128/rate)q++;return q*128;}
export function prepareIowaBank(table,midi,velocity,rate,vibrato=1,id=1){
 const v=iowaStrength(velocity),seed=midi*31+v,model=table.decay?decayModel(table,midi,v):heldModel(table,midi,v);if(!model)throw Error('Captured Iowa note is outside its measured range');
 const s=table.decay?decayVoice(model,rate,seed):heldVoice(model,rate,{vibrato,seed});
 const bank=table.decay?{id,kind:'decay',seconds:s.seconds,burst:Array.from(s.burst??[]),...Object.fromEntries(fields.map(k=>[k,Array.from(s[k])]))}:{id,kind:'held',f0:s.f0,rate:s.rate,depth:s.depth,tremolo:s.tremolo,pitchWander:s.pitchWander,levelWander:s.levelWander,times:s.times.slice(),tables:s.tables.map(a=>Array.from(a)),envTimes:s.envTimes.slice(),envDb:s.envDb.slice(),relTimes:s.relTimes.slice(),relDb:s.relDb.slice(),noise:Array.from(s.noise??[]),burst:Array.from(s.burst??[])};
 return {bank,level:table.decay?0:s.level};
}
export function compileIowaNotes(source,notes,rate=48000){
 const p=source.patch;if(p?.version!==1||!p.table||!Number.isInteger(rate)||rate<8000||rate>192000)throw Error('Missing captured Iowa source');
 if(!Array.isArray(notes)||notes.length>2000||notes.some(n=>!Number.isFinite(n.midi)||n.midi<0||n.midi>127||!Number.isFinite(n.velocity)||n.velocity<0||n.velocity>1||!Number.isFinite(n.time)||n.time<0||!Number.isFinite(n.duration)||n.duration<=0||n.time+n.duration>120))throw Error('Invalid captured Iowa notes');
 const patch=PATCHES.find(s=>s.id===p.id);if(!patch)throw Error('Unknown captured Iowa patch');
 const banks=[],prepared=[],events=[],keys=new Map();let tail=1;
 notes.forEach((n,i)=>{const midi=Math.round(n.midi),v=iowaStrength(n.velocity),key=`${midi}:${v}`;let data=keys.get(key);if(!data){if(banks.length>=96)throw Error('Iowa preview exceeds 96 prepared note layers');data=(source.prepareIowaBank??prepareIowaBank)(p.table,midi,n.velocity,rate,p.vibrato,banks.length+1);keys.set(key,data);banks.push(data.bank);}
  const trim=(LEVELS[p.id]?.trim??0)+(LEVELS[p.id]?.curve?.[midi]??0),roll=patch.roll?structuredClone(p.table.roll):null;
  if(patch.roll&&!roll)throw Error('Missing measured Iowa roll timing');
  prepared.push({id:i+1,bank:data.bank.id,midi,velocity:n.velocity,gain:10**((data.level+trim)/20),tune:2**((p.tune??0)/1200),ring:!!patch.ring,roll,slide:null});
  events.push({kind:'note',target:1,owner:1,event:0,note:i+1,frame:iowaFrame(n.time,rate),a:midi,b:n.velocity},{kind:'note',target:1,owner:1,event:1,note:i+1,frame:iowaFrame(n.time+n.duration,rate),a:0,b:0});
  tail=Math.max(tail,data.bank.kind==='held'?data.bank.relTimes.at(-1)+.02:data.bank.seconds+.4);
 });
 return {config:validateIowaConfig({version:1,sampleRate:rate,quantumFrames:128,voices:32,banks,notes:prepared}),events,tail};
}
