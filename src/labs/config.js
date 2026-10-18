import {voiceById,voicesFor} from './catalog';
import {FAMILIES,familyRole} from './families';
import {runnerVoiceIds} from './contexts';
export const clamp=(v,lo,hi,d)=>Number.isFinite(Number(v))?Math.max(lo,Math.min(hi,Number(v))):d;
const roles=['pad','lead','counter','bass'];
export const NEUTRAL_EXPRESSION={pressure:0,brightness:0,texture:0,motion:0,bend:0,level:1};
export function familyVoice(config,family,role){const id=config.familyVoices?.[family]?.[role];return voiceById(id)?.family===family?id:voicesFor(family)[0].id;}
export function rememberFamilyVoice(config,family,role,id){
 const familyVoices=voiceById(id)?.family===family?{...config.familyVoices,[family]:{...config.familyVoices?.[family],[role]:id}}:config.familyVoices;
 const familyRoles=voiceById(id)?.family===family?{...config.familyRoles,[family]:role}:config.familyRoles;
 return {...config,voices:{...config.voices,[role]:id},familyVoices,familyRoles};
}
export function restoreLab(family,sharedStored,familyStored,search=''){
 let shared;try{shared=JSON.parse(sharedStored);}catch{}
 const validShared=shared&&typeof shared==='object'&&!Array.isArray(shared);
 let config=initialLab(family,validShared?sharedStored:familyStored,search);
 if(validShared&&shared.family!==family&&family!=='all'){
  config={...config,armed:config.familyRoles?.[family]??familyRole(family)};
  let prior;try{prior=JSON.parse(familyStored);}catch{}
  const saved=prior?.voices?.[config.armed],id=config.familyVoices?.[family]?.[config.armed]??(voiceById(saved)?.family===family?saved:familyVoice(config,family,config.armed));
  config=rememberFamilyVoice(config,family,config.armed,id);
 }
 return rememberFamilyVoice(config,family,config.armed,config.voices[config.armed]);
}
export function labDefaults(family){
 const runner=family==='organs'?'organ':family==='keys'?'keys':'held',armed=familyRole(family);
 const startingFamily=family==='all'?'strings':family;
 return {runner,seed:42,bpm:family==='organs'?72:family==='keys'?88:64,octave:4,armed,voices:{...runnerVoiceIds(runner),[armed]:voicesFor(startingFamily)[0].id},enabled:{pad:armed==='pad',lead:armed==='lead',counter:false,bass:armed==='bass',perc:false},velocity:{curve:1,floor:.12,ceiling:1,gain:1,fixed:false,keyboard:.7},controls:{...NEUTRAL_EXPRESSION},arp:{enabled:false,source:'captured',notes:[60,64,67],latch:true,followRoot:false,transpose:0,octaves:1,rate:.5,gate:.8,mode:'up',swing:0}};
}
export function initialLab(family,stored,search=''){
 const d=labDefaults(family),q=new URLSearchParams(search);let s={};try{s=JSON.parse(stored||'{}')??{};}catch{}
 const runner=q.get('runner')??s.runner,seed=q.get('seed')??s.seed;
 const number=(group,key,lo,hi)=>clamp(s[group]?.[key],lo,hi,d[group][key]);
 return {...d,runner:['held','sparse','keys','organ','motion'].includes(runner)?runner:d.runner,seed:Math.floor(clamp(seed,1,2147483647,42)),bpm:clamp(q.get('bpm')??s.bpm,40,180,d.bpm),octave:Math.floor(clamp(s.octave,1,6,4)),armed:roles.includes(s.armed)?s.armed:d.armed,
  familyVoices:Object.fromEntries(FAMILIES.map(([f])=>[f,Object.fromEntries(roles.filter(r=>voiceById(s.familyVoices?.[f]?.[r])?.family===f).map(r=>[r,s.familyVoices[f][r]]))])),
  familyRoles:Object.fromEntries(FAMILIES.filter(([f])=>roles.includes(s.familyRoles?.[f])).map(([f])=>[f,s.familyRoles[f]])),
  engines:Object.fromEntries(roles.map(r=>[r,s.engines?.[r]==='wasm'?'wasm':'previous'])),
  midi:{device:typeof s.midi?.device==='string'?s.midi.device.slice(0,256):'all',channel:s.midi?.channel==='all'||!Number.isInteger(Number(s.midi?.channel))||Number(s.midi?.channel)<1||Number(s.midi?.channel)>16?'all':String(s.midi.channel)},
  voices:Object.fromEntries(roles.map(r=>[r,voiceById(s.voices?.[r])?s.voices[r]:d.voices[r]])),
  enabled:Object.fromEntries(Object.keys(d.enabled).map(r=>[r,typeof s.enabled?.[r]==='boolean'?s.enabled[r]:d.enabled[r]])),
  controls:Object.fromEntries(Object.entries({pressure:[0,1],brightness:[-1,1],texture:[0,1],motion:[0,1],bend:[-2,2],level:[0,1]}).map(([k,[lo,hi]])=>[k,number('controls',k,lo,hi)])),
  velocity:{curve:number('velocity','curve',.4,2.5),floor:number('velocity','floor',0,.4),ceiling:1,gain:number('velocity','gain',.5,1.5),fixed:s.velocity?.fixed===true,keyboard:number('velocity','keyboard',.1,1)},
  // Never resume a running arpeggiator just because the page was reopened.
  arp:{...d.arp,source:['held','runner','captured'].includes(s.arp?.source)?s.arp.source:d.arp.source,notes:Array.isArray(s.arp?.notes)?[...new Set(s.arp.notes.filter(n=>Number.isInteger(n)&&n>=21&&n<=108))].slice(0,32):d.arp.notes,latch:s.arp?.latch!==false,followRoot:s.arp?.followRoot===true,transpose:Math.round(number('arp','transpose',-24,24)),octaves:Math.round(number('arp','octaves',1,3)),rate:[1,.5,.25,1/3].includes(s.arp?.rate)?s.arp.rate:.5,gate:number('arp','gate',.1,1.6),swing:number('arp','swing',0,.45),mode:['up','down','upDown','downUp','chord','random'].includes(s.arp?.mode)?s.arp.mode:'up'},
 };
}
