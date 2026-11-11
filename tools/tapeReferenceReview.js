import {runTapeShaperReference}from './tapeShaperReferenceVerification.js';
import {runTapeFullReference,TAPE_LOW_RATE_CASES}from './tapeFullReferenceVerification.js';
import {runTapeDelayReference}from './tapeDelayReferenceVerification.js';
import {runTapeClockCapture}from './tapeClockCaptureVerification.js';
const status=document.querySelector('#status'),summary=document.querySelector('#summary'),report=document.querySelector('#report'),copy=document.querySelector('#copy');let compact;
const controls=['run','full','diagnostic','clock','lowrate'].map(id=>document.getElementById(id));
async function execute(kind){for(const b of controls)b.disabled=true;copy.disabled=true;try{
 const progress={onProgress:text=>status.textContent=`Running ${text}`};
 const result=await(kind==='clock'?runTapeClockCapture(progress):kind==='diagnostic'?runTapeDelayReference(progress):kind==='lowrate'?runTapeFullReference({...progress,rates:[8000,24000],cases:TAPE_LOW_RATE_CASES,durationSeconds:2,label:'low-rate-tone-carry'}):kind==='full'?runTapeFullReference(progress):runTapeShaperReference(progress));
 report.value=JSON.stringify(result,null,2);
 if(kind==='clock'){compact={...result,resources:result.resources.map(({table,...resource})=>({...resource,samples:table.length}))};status.textContent='Native clock resources and instance variability captured';}
 else if(kind==='diagnostic'){compact=result;status.textContent='Delay/control diagnostic captured; parity limits unchanged';}
 else{const full=kind!=='run';compact={kind:result.kind,version:result.version,label:result.label,stage:result.stage,profile:result.profile,chromiumRevision:result.chromiumRevision,engineVersion:result.engineVersion,pass:result.pass,comparisons:result.comparisons??result.stageComparisons,cases:result.cases,bounds:result.bounds,maxAbsoluteError:result.maxAbsoluteError,maxRelativeRmsError:result.maxRelativeRmsError,...(full?{}:{impulseGroupDelayAgrees:result.trials.filter(t=>t.material==='impulse').every(t=>t.nativePeakFrame===t.portablePeakFrame)}),failed:result.trials.filter(t=>!t.pass).map(t=>full?{id:t.id,rate:t.rate,channels:t.channels,stages:t.stages.filter(s=>!s.pass)}:{curve:t.curve,drive:t.drive,material:t.material,rate:t.rate,channels:t.channels,maxAbsoluteError:t.maxAbsoluteError,relativeRmsError:t.relativeRmsError,maxDifference:t.maxDifference})};status.textContent=result.pass?'All selected reference checks passed':'Pinned profile differs beyond its fixed bound';}
 summary.textContent=JSON.stringify(compact,null,2);copy.disabled=false;
 }catch(e){status.textContent=String(e);summary.textContent=String(e);}finally{for(const b of controls)b.disabled=false;}}
for(const b of controls)b.onclick=()=>execute(b.id);
copy.onclick=()=>navigator.clipboard.writeText(JSON.stringify(compact,null,2));
