import {NORMAL_FILTER_HOST_RATES} from './normalFilterActivity.js';

const MAX_STAGES=64, MAX_ID=160;
const text=x=>typeof x==='string'&&x.length>0&&x.length<=MAX_ID;
const freeze=x=>Object.freeze(x);
export class FilterRackAdmissionError extends Error {
 constructor(code,message){super(message);this.name='FilterRackAdmissionError';this.code=code;}
}
function refuse(code,message){throw new FilterRackAdmissionError(code,message);}
function record(x){return x&&typeof x==='object'&&!Array.isArray(x);}
function sourceContract(raw,rate){
 if(!record(raw)||raw.version!==1||raw.authority!=='active-program'||!text(raw.identity)||!Number.isSafeInteger(raw.revision)||raw.revision<0||raw.rate!==rate||![1,2].includes(raw.channels)||raw.gate!==1||raw.lease!=='none'||raw.layout!=='fixed')
  refuse('SOURCE_ACTIVITY','Filter requires an explicitly active program, fixed layout, gate1 and no source lease.');
 return freeze({version:1,authority:'active-program',identity:raw.identity,revision:raw.revision,rate,channels:raw.channels,gate:1,lease:'none',layout:'fixed'});
}
/**
 * Pure admission only. The source and prefix declarations are caller assertions,
 * not inferred from a Rust backend name, PCM samples or connected node counts.
 * This module does not make an arbitrary native stage satisfy those assertions.
 */
export function planFilterRackActivity({rate,source,stages,stageContracts=[]}={}){
 if(!Array.isArray(stages)||stages.length>MAX_STAGES)refuse('TOPOLOGY','Rack stage bound exceeded.');
 const ids=new Set(),ordered=stages.map(stage=>{
  if(!record(stage)||!text(stage.id)||!text(stage.kind)||ids.has(stage.id))refuse('TOPOLOGY','Rack requires unique concrete stage IDs and kinds.');
  ids.add(stage.id);return freeze({id:stage.id,kind:stage.kind});
 });
 const filters=ordered.filter(s=>s.kind==='filter');
 // Unselected/native-only racks are outside this owned Filter policy.
 if(!filters.length)return freeze({version:1,rate,source:null,stages:freeze(ordered),filters:freeze([]),contracts:freeze([])});
 if(!NORMAL_FILTER_HOST_RATES.includes(rate))refuse('RATE','Owned normal Filter supports44100/48000/96000/192000 only.');
 const declared=sourceContract(source,rate);
 if(!Array.isArray(stageContracts)||stageContracts.length>MAX_STAGES)refuse('PREFIX_ACTIVITY','Prefix contract bound exceeded.');
 const contracts=new Map();
 for(const c of stageContracts){
  if(!record(c)||!text(c.id)||!text(c.kind)||!text(c.identity)||contracts.has(c.id)||!ids.has(c.id)||c.version!==1||c.input!=='active-program'||c.output!=='active-program'||!['preserve','mono','stereo'].includes(c.layout))
   refuse('PREFIX_ACTIVITY','Prefix requires a unique identity-bound active-program contract.');
  if(ordered.find(s=>s.id===c.id).kind!==c.kind)refuse('PREFIX_ACTIVITY','Prefix contract kind differs from the proposed stage.');
  contracts.set(c.id,freeze({version:1,id:c.id,kind:c.kind,identity:c.identity,input:c.input,output:c.output,layout:c.layout}));
 }
 const lastFilter=ordered.findLastIndex(s=>s.kind==='filter'),admitted=[],used=[];let channels=declared.channels;
 for(let i=0;i<=lastFilter;i++){
  const stage=ordered[i];
  if(stage.kind==='filter'){
   admitted.push(freeze({id:stage.id,activityAuthority:'continuous-program',channels,sourceRevision:declared.revision}));
  }else{
   const c=contracts.get(stage.id);
   if(!c)refuse('PREFIX_ACTIVITY','No active-program authority for prefix stage '+stage.id+'.');
   channels=c.layout==='preserve'?channels:c.layout==='mono'?1:2;used.push(c);
  }
 }
 return freeze({version:1,rate,source:declared,stages:freeze(ordered),filters:freeze(admitted),contracts:freeze(used)});
}
/** Run BEFORE changing settings, wiring, gate values, leases or creating a stage. */
export function preflightFilterRackTransition(current,proposal){
 const next=planFilterRackActivity(proposal);
 if(current?.filters?.length&&next.filters.length&&current.source.identity===next.source.identity&&next.source.revision<current.source.revision)
  refuse('STALE_SOURCE','Source revision moved backwards.');
 return next;
}
/** Source owners invoke this BEFORE silencing the original source or injecting a lease. */
export function assertFilterSourceLeaseAllowed(plan){
 if(plan?.filters?.length)refuse('SOURCE_LEASE','Stop or remove owned Filter before replacing its declared active program.');
}
