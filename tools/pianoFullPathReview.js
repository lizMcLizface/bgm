import {createHost} from '../src/synths/all/host';
import {BROWSABLE_SCENES} from '../src/app/scenes';
import {createWorkbenchPreview} from '../src/modular-audio/workbenchPreview';
import {createWorkbenchTestSuite} from '../src/modular-audio/workbenchTestSuite';
const roles=['lead','counter','rhythm','pad','bass','perc'],status=document.querySelector('#path-status'),report=document.querySelector('#path-report'),batch=document.querySelector('#batch'),listen=document.querySelector('#listen');
let host=null,pending=null,active=null,epoch=0;
const copy=document.querySelector('#copy'),summary=document.querySelector('#path-summary');
copy.onclick=async()=>{try{await navigator.clipboard.writeText(summary.textContent);copy.textContent='Copied compact result';}catch{copy.textContent='Copy unavailable; expand diagnostics';}};
const selections=[['lead','poly','Soft Pad'],['counter','fm','FM Rhodes'],['rhythm','piano','Felt Keys (updated)'],['pad','piano','Starmap Piano'],['bass','piano','Studio Grand'],['perc','kit','hand']];
const fixedScope={selections,voiceWander:'disabled only in this isolated host',songAndSettings:'All storage unchanged',worker:{blockFrames:512,poolBlocks:12,scheduling:'message'}};
async function prepare(){
 if(pending)return pending;
 pending=(async()=>{const base={...BROWSABLE_SCENES[0],voices:{},layerVoices:{},percussion:null};host=createHost(base,{seed:109});
  if(host.context.sampleRate!==48000)throw Error('This fixed batch requires 48 kHz.');
  await host.wake();
  for(const [role,kind,name]of selections){status.textContent=`Preparing ${name}`;await host.setSound(role,{synth:kind,name});}
  for(const role of roles){const i=host.g.roles[role].instrument,native=i?.voice?.native??(i?.synthMix?i:null);if(!native)continue;native.setWander({filter:0,pitch:0,periods:{filter:60,pitch:60},phases:{filter:0,pitch:0},immediate:true});native.setFilterWanderConnected(false);native.setVibratoConnected(false);}
  for(const role of roles){const s=host.sourcePreviewStatus(role);if(!s.eligible)throw Error(`${role}: ${s.reason}`);}
  await host.setupMixer();return host;
 })().catch(e=>{host?.dispose();host=null;pending=null;throw e;});return pending;
}
function project(){return {bars:1,stepsPerBar:16,seed:109,key:{tonic:0,scale:[0,2,4,5,7,9,11]},patterns:Object.fromEntries(roles.map((role,j)=>[role,role==='perc'?{mode:'drums',length:16,steps:Array.from({length:16},(_,i)=>i%4===0?{hits:[{drum:i%8===0?0:1,velocity:.3,duration:1,vary:0}]}:null)}:{mode:'note',follow:'off',length:16,steps:Array.from({length:16},(_,i)=>[0,8].includes(i)?{n:[{midi:[72,64,60,55,36][j]}],len:4,gate:1,vel:.4}:null)}]))};}
async function run(audible){
 const mine=++epoch;batch.disabled=listen.disabled=document.querySelector('#run').disabled=true;copy.disabled=true;report.textContent=summary.textContent='';try{const h=await prepare();if(mine!==epoch)return;await h.wake();
  let done;const finished=new Promise(r=>{done=r;});const common={host:h,project:project(),part:{startBar:0,bars:1},roles,bpm:120,onState:(phase,p)=>{status.textContent=p?.label?`${phase}: ${p.label}`:phase;},onDone:r=>{
   report.textContent=JSON.stringify({fixedScope,...r},null,2);
   const compact={kind:'piano.fixed-full-path',version:1,engineVersion:r.engineVersion,reason:r.reason,error:r.error,checksPassed:r.suite?.checksPassed??r.pass,listening:'not assessed',cases:(r.trials??[r]).map(t=>({mode:t.mode,material:t.material,actual:t.executor?.actual,frames:t.stats?.output?.sourceFrame,underruns:t.stats?.output?.queue?.underrunFrames??null,late:t.stats?.output?.queue?.lateBlocks??null,pass:t.pass,stems:t.stems?.map(s=>({role:s.role,kind:s.kind,sourcePeak:s.peaks.source,channelPeak:s.peaks.channel})),masterPeak:t.peaks?.master}))};
   summary.textContent=JSON.stringify(compact,null,2);copy.disabled=false;copy.textContent='Copy compact result';done(r);}};
  active=audible?createWorkbenchPreview({...common,audition:true,mode:'worker',workerPoolBlocks:12}):createWorkbenchTestSuite(common);
  await active.ready;const result=await finished;status.textContent=audible?result.pass?'Audition completed; listening judgement still yours.':'Audition stopped; inspect report.':result.suite?.checksPassed?'All four full-path checks passed.':'Full-path checks stopped; inspect report.';
 }catch(e){status.textContent=String(e);}finally{active=null;batch.disabled=listen.disabled=document.querySelector('#run').disabled=false;}
}
batch.onclick=()=>run(false);listen.onclick=()=>run(true);document.querySelector('#stop').onclick=()=>{epoch++;void active?.stop();};
window.addEventListener('pagehide',()=>{epoch++;void active?.stop();host?.dispose();});
