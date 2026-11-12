export const PREPARED_SWEEP_OPEN_HOST='5d0df54e500f5e1a';
export const PREPARED_SWEEP_OPEN_BOUNDS=Object.freeze({maxAbsolute:1e-4,relativeRms:1e-4});
const insist=(value,message)=>{if(!value)throw Error(message);};
/** OPEN ACK is not a rendered OPEN value. Intrinsics remain350/Q1 while
 * the physically absent program has never pulled the filter DSP. */
export function verifyPreparedSweepOpenWitness(snapshot){
 const stats=snapshot?.cached,k=stats?.kernel,values=stats?.observed?.values;
 insist(snapshot?.identity?.hostVersion===PREPARED_SWEEP_OPEN_HOST,'Unexpected prepared Sweep identity');
 insist(snapshot.hostAwake===false&&snapshot.inputConnected===false&&snapshot.mode===0,'Sweep program input was not physically isolated');
 insist(k?.commands===1&&k.renderedFrames===0&&k.unpulledFrames>0&&k.calls>0&&k.rejected===0,'Missing actual single-OPEN zero-DSP preparation witness');
 insist(Array.isArray(values)&&values.length===4&&values.every((v,i)=>Object.is(v,[350,350,1,1][i])),'Preparation rendered parameter values instead of retaining Native defaults');
 insist(snapshot.history?.length===1&&snapshot.history[0].tc===0&&snapshot.history[0].lowpass===22000&&snapshot.history[0].highpass===10&&snapshot.history[0].resonance===Math.SQRT1_2,'An extra or substituted constructor event was authored');
 insist(snapshot.transport?.sequence===0&&stats.transport?.sequence===0,'Unexpected prebirth live control publication');
 return true;
}
export function verifyPreparedSweepOpenCase(row){
 insist(row?.hostVersion===PREPARED_SWEEP_OPEN_HOST,'Unexpected Sweep profile in result');
 insist(row.nativeEarlyLate?.differingWords===0,'Early Native OPEN is not identical to literal late Native construction');
 insist(row.independence?.differingWords===0,'Independent owned Sweep playback differs');
 for(const actual of row.ownedLate??[])insist(actual.maxAbsoluteError<=PREPARED_SWEEP_OPEN_BOUNDS.maxAbsolute&&actual.relativeRms<=PREPARED_SWEEP_OPEN_BOUNDS.relativeRms,'Owned early OPEN differs from original Native late construction');
 insist(row.ownedLate?.length===2&&row.nativePeak>1e-6,'Missing audible comparison planes');
 insist(row.callsFrozen&&row.sourceCursor?.differingWords===0,'Authored Native epoch or actual shared program cursor differs');
 insist(row.prebirthZeroWords===0,'Program audio leaked through an unborn prepared Sweep');
 insist(row.before?.length===2,'Both independent prepared witnesses required');for(const witness of row.before)verifyPreparedSweepOpenWitness(witness);
 insist(row.nativeBefore?.length===2&&row.nativeBefore.every(values=>values.length===4&&values.every((v,i)=>Object.is(v,[350,350,1,1][i]))),'Original Native intrinsics were not unrendered defaults before first use');
 insist(row.after?.length===2&&row.after.every(snapshot=>snapshot.cached?.kernel?.commands===2&&!snapshot.error),'Extra OPEN/control or owned failure after first use');
 if(row.variant==='prepared-open-offroute-after-preparation-v2'){
  insist(row.beforeGap?.length===2&&row.offroute?.outputsDetached===true,'Preparation outputs were not actually detached before first use');for(const witness of row.beforeGap)verifyPreparedSweepOpenWitness(witness);
  insist(row.offroute.firstPulledFrames?.length===2&&row.offroute.firstPulledFrames.every(frame=>frame===row.birthFrame),'Actual first input pull differs from the frozen Native birth epoch');
 }
 insist(!row.errors?.length,'Sweep runtime errors occurred');return true;
}
