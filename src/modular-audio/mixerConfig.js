import {cleanDesk,faderGain,ceilingDb} from '../synths/all/mixerAudio.js';
export const MIXER_KINDS=Object.freeze(['strip','matrix','fader','limiter']);
const finite=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const integer=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b;
const bounds=(kind,rate)=>kind==='strip'?[[0,64],[0,rate/2],[0,rate/2],[-12,12],[-12,12],[-12,12],[-1,1],[0,4]]:kind==='matrix'?[[0,2],[-1,1]]:kind==='limiter'?[[0,1],[.05,1]]:[[0,4]];
export function validateMixerConfig(raw){
 const c=JSON.parse(JSON.stringify(raw));
 if(c?.version!==1||!MIXER_KINDS.includes(c.kind)||!finite(c.sampleRate,8000,192000)||typeof c.settled!=='boolean'||!Array.isArray(c.parameters)||!Array.isArray(c.events)||c.events.length>512)throw Error('Invalid mixer configuration');
 const b=bounds(c.kind,c.sampleRate);
 if(c.parameters.length!==b.length||c.parameters.some((v,i)=>!finite(v,...b[i])||c.kind==='limiter'&&i===0&&!Number.isInteger(v)))throw Error('Invalid mixer parameter');
 for(const e of c.events)if(!integer(e.frame,0,Number.MAX_SAFE_INTEGER)||!integer(e.owner,1,0xffffffff)||!integer(e.parameter,0,b.length-1)||!finite(e.value,...b[e.parameter])||c.kind==='limiter'&&e.parameter===0&&!Number.isInteger(e.value))throw Error('Invalid mixer timestamped event');
 return c;
}
export const saveMixerConfig=config=>JSON.stringify(validateMixerConfig(config),null,2)+'\n';
export const loadMixerConfig=text=>validateMixerConfig(JSON.parse(text));
const log=(v,lo,hi)=>lo*(hi/lo)**v;
export function compileDeskMixer(state,roles,{sampleRate=48000,auxiliary=true,trimRoles=false,settled=false}={}){
 if(!Array.isArray(roles)||!roles.length||roles.length>16||new Set(roles).size!==roles.length||roles.some(id=>typeof id!=='string'||!id||['ambience','headroom'].includes(id))||!finite(sampleRate,8000,192000)||typeof auxiliary!=='boolean'||typeof trimRoles!=='boolean'||typeof settled!=='boolean')throw Error('Invalid mixer desk topology');
 const ids=[...roles,...(auxiliary?['ambience','headroom']:[])],clean=cleanDesk(state,ids),solo=ids.filter(id=>clean.strips[id].solo),config=(kind,parameters)=>validateMixerConfig({version:1,kind,sampleRate,settled,parameters,events:[]});
 return {version:1,sampleRate,roles:roles.slice(),ids,strips:Object.fromEntries(ids.map(id=>{
  const s=clean.strips[id],selected=!solo.length||s.solo||id==='headroom'&&solo.some(r=>roles.includes(r))||roles.includes(id)&&clean.strips.headroom?.solo,silent=s.mute||!selected;
  return [id,config('strip',[(trimRoles||!roles.includes(id))?10**((-12+48*s.gain)/20):1,s.hpOn?log(s.hp,20,600):0,s.lpOn?Math.min(sampleRate*.49,log(s.lp,1000,20000)):sampleRate/2,(s.lo-.5)*24,(s.mid-.5)*24,(s.hi-.5)*24,s.pan*2-1,silent?0:faderGain(s.vol)])];
 })),matrix:config('matrix',[clean.master.mono?0:clean.master.width*2,clean.master.bal*2-1]),fader:config('fader',[faderGain(clean.master.vol)*(clean.master.dim?.1:1)]),limiter:config('limiter',[Number(clean.master.limit),10**(ceilingDb(clean.master.ceil)/20)]),external:{topology:'Host retains role/subgroup connections, effect returns and summing order',masterInsert:'Between matrix and fader',limiter:{kind:'host.desk-limiter',enabled:clean.master.limit,ceiling:10**(ceilingDb(clean.master.ceil)/20)},stripEffects:Object.fromEntries(ids.map(id=>[id,Object.fromEntries(['rev','revSize','dly','dlyTime','dlyFb'].map(k=>[k,clean.strips[id][k]]))]))},capturedState:clean};
}
