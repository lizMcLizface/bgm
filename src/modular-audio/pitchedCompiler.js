// Prepare legacy transition semantics as bounded Rust keyframes, never in process().
import {validateCoreSpec} from './ownedCore.js';
import {validateFmSpec} from './ownedFm.js';
import {PatchTransition,flattenFM,coreDiscrete,coreLog,fmDiscrete,fmLog} from './legacyPatchTransition.js';
export function validatePitchedConfig(raw,fm){const p=(fm?validateFmSpec:validateCoreSpec)(raw);if(p.events.length)throw Error('Pitched notes belong in graph events');return p;}
export function compilePitched(raw,fm,rate){
 const p=validatePitchedConfig(raw,fm),flat=fm?flattenFM:p=>p,base=flat(p.patch),points=[],gains=[];let cursor=0,lastGain=1;
 const push=(rows,row)=>{if(points.length+gains.length>=65536)throw Error('Pitched automation capacity exceeded');if(!Number.isSafeInteger(row[0]))throw Error('Pitched automation frame overflow');rows.push(row);};
 const t=new PatchTransition(base,p.performance,(scope,index,value)=>push(points,[cursor,scope,index,value,0]),(perf)=>push(points,[cursor,4,perf.mode,perf.portamento,Number(perf.glide==='always')]),fm?fmDiscrete:coreDiscrete,fm?fmLog:coreLog,rate);
 for(const edit of p.edits){if(!Number.isSafeInteger(edit.frame+Math.ceil(edit.seconds*rate)+2048))throw Error('Pitched transition frame overflow');t.schedule(flat(edit.patch),edit.performance,edit.frame,edit.seconds);}
 while(t.pending.length||t.active||t.outputGain!==1){
  if(!t.active&&t.outputGain===1&&t.pending[0]?.frame>cursor)cursor=t.pending[0].frame;
  t.tick(cursor);push(points,[cursor,6,0,0,0]);
  const span=t.span(cursor,2048);
  if(t.active||t.outputGain!==1)for(let i=0;i<span;i++){const gain=t.gain(cursor+i);if(gain!==lastGain){push(gains,[cursor+i,5,0,gain,0]);lastGain=gain;}}
  cursor+=span;
 }
 return {base,performance:p.performance,points,gains};
}
