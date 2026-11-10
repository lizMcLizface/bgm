import {createHost} from '../src/synths/all/host';
import {BROWSABLE_SCENES} from '../src/app/scenes';
import {createWorkbenchPreview} from '../src/modular-audio/workbenchPreview';
import {createWorkbenchTestSuite} from '../src/modular-audio/workbenchTestSuite';
const roles=['lead','counter','rhythm','pad','bass','perc'],status=document.querySelector('#path-status'),report=document.querySelector('#path-report'),batch=document.querySelector('#batch'),listen=document.querySelector('#listen'),stress=document.querySelector('#stress');
let host=null,pending=null,active=null,epoch=0;
const copy=document.querySelector('#copy'),summary=document.querySelector('#path-summary');
copy.onclick=async()=>{try{await navigator.clipboard.writeText(summary.textContent);copy.textContent='Copied compact result';}catch{copy.textContent='Copy unavailable; expand diagnostics';}};
const selections=[['lead','poly','Soft Pad'],['counter','fm','FM Rhodes'],['rhythm','piano','Ambient Piano'],['pad','piano','Soft Piano'],['bass','piano','Studio Concert'],['perc','kit','hand']];
const fixedScope={profileRevision:'piano-matched-controls-steals-v1',selections,voiceWander:'captured sine on Rhythm, captured Brownian on Pad; live vibrato/filter LFO on Bass',pianoPolyphony:{rhythm:1,pad:2},songAndSettings:'All storage unchanged',worker:{blockFrames:512,poolBlocks:12,scheduling:'message'}};
async function prepare(){
 if(pending)return pending;
 pending=(async()=>{const base={...BROWSABLE_SCENES[0],voices:{},layerVoices:{},percussion:null};host=createHost(base,{seed:109});
  if(host.context.sampleRate!==48000)throw Error('This fixed batch requires 48 kHz.');
  await host.wake();
  for(const [role,kind,name]of selections){status.textContent=`Preparing ${name}`;await host.setSound(role,{synth:kind,name});}
  for(const role of ['rhythm','pad','bass']){const i=host.g.roles[role].instrument,native=i?.voice?.native??(i?.synthMix?i:null);if(!native)throw Error('Missing native piano in fixed profile');native.setWander({filter:role==='bass'?0:480,pitch:role==='bass'?0:5,periods:{filter:15,pitch:18},phases:{filter:.2,pitch:.3},seeds:{filter:109,pitch:137},mode:role==='pad'?'brownian':'sine',offset:13.25,immediate:false});if(role==='bass'){native.set('vibratoDepth',6);native.set('vibratoRate',4);native.set('filterLfoDepth',300);native.set('filterLfoRate',.7);}}
  for(const [role,count]of Object.entries(fixedScope.pianoPolyphony)){const i=host.g.roles[role].instrument,native=i?.voice?.native??i;native.polyphony=count;}
  for(const role of roles){const s=host.sourcePreviewStatus(role);if(!s.eligible)throw Error(`${role}: ${s.reason}`);}
  await host.setupMixer();return host;
 })().catch(e=>{host?.dispose();host=null;pending=null;throw e;});return pending;
}
function project(){return {bars:1,stepsPerBar:16,seed:109,key:{tonic:0,scale:[0,2,4,5,7,9,11]},patterns:Object.fromEntries(roles.map((role,j)=>[role,role==='perc'?{mode:'drums',length:16,steps:Array.from({length:16},(_,i)=>i%4===0?{hits:[{drum:i%8===0?0:1,velocity:.3,duration:1,vary:0}]}:null)}:{mode:'note',follow:'off',length:16,steps:Array.from({length:16},(_,i)=>(role==='rhythm'?[0,4,8,12]:[0,8]).includes(i)?{n:[{midi:[72,64,60,55,36][j]}],len:4,gate:1,vel:.4}:null)}]))};}
async function run(audible,audition=true){
 const mine=++epoch;batch.disabled=listen.disabled=stress.disabled=document.querySelector('#run').disabled=true;copy.disabled=true;report.textContent=summary.textContent='';try{const h=await prepare();if(mine!==epoch)return;await h.wake();
  let done;const finished=new Promise(r=>{done=r;});const common={host:h,project:project(),part:{startBar:0,bars:1},roles,bpm:120,onState:(phase,p)=>{status.textContent=p?.label?`${phase}: ${p.label}`:phase;},onDone:r=>{
   report.textContent=JSON.stringify({fixedScope,...r},null,2);
   const compact={profileRevision:fixedScope.profileRevision,kind:'piano.fixed-full-path',version:1,engineVersion:r.engineVersion,reason:r.reason,error:r.error,muted:r.suite?.muted??false,checksPassed:r.suite?.checksPassed??r.pass,listening:'not assessed',cases:(r.trials??[r]).map(t=>({material:t.material,executor:t.executor?.actual,frames:t.stats?.output?.sourceFrame,underruns:t.stats?.output?.queue?.underrunFrames??null,late:t.stats?.output?.queue?.lateBlocks??null,pianoSteals:Object.fromEntries(['rhythm','pad','bass'].map(role=>[role,(t.stats?.worker??t.stats?.output?.serial)?.roles?.[roles.indexOf(role)]?.steals??null])),checksPassed:r.suite?.checks.find(c=>c.runId===t.runId)?.pass??t.pass,...(!t.diagnosticProbe?{stems:t.stems?.map(s=>({role:s.role,kind:s.kind,sourcePeak:s.peaks.source,channelPeak:s.peaks.channel})),masterPeak:t.peaks?.master}:{})}))};
   summary.textContent=JSON.stringify(compact,null,2);copy.disabled=false;copy.textContent='Copy compact result';done(r);}};
  active=audible?createWorkbenchPreview({...common,audition,mode:'worker',workerPoolBlocks:12}):createWorkbenchTestSuite(common);
  await active.ready;const result=await finished;status.textContent=audible?result.pass?'Audition completed; listening judgement still yours.':'Audition stopped; inspect report.':result.suite?.checksPassed?'All four full-path checks passed.':'Full-path checks stopped; inspect report.';
 }catch(e){status.textContent=String(e);}finally{active=null;batch.disabled=listen.disabled=stress.disabled=document.querySelector('#run').disabled=false;}
}
batch.onclick=()=>run(false);listen.onclick=()=>run(true);stress.onclick=()=>run(true,false);document.querySelector('#stop').onclick=()=>{epoch++;void active?.stop();for(const player of document.querySelectorAll('#audio audio'))player.pause();};
window.addEventListener('pagehide',()=>{epoch++;void active?.stop();host?.dispose();});
