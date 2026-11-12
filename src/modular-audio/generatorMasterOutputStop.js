import{generatorMasterOutputRoot}from'./generatorMasterOutputRoot.js';
/** Original Stop parent order around an explicitly reserved Rust master plan.
 * The Generator supplies its private intent/coordinator closures. */
export function stopWithGeneratorMasterOutput(g,options,{cancelIntent,cancelCoordinator,stopFadeMs}={}){
 const root=generatorMasterOutputRoot(g);if(!root||typeof cancelIntent!=='function'||typeof cancelCoordinator!=='function'||stopFadeMs!==500)throw Error('Selected Rust output root and original stop policy required');root.check();
 const hasPrepared=g.hasPreparedAmbienceStart();
 if(hasPrepared&&!g.isRunning&&!options?.preparedPartial){if(g.runtimeEnvironmentReady||hasPrepared)cancelIntent();return cancelCoordinator()??Promise.resolve();}
 const quick=g.quickStop,fade=Boolean(g.fadeTimer),operation=quick?'stop':fade?'tailResume':null;let heard,ending;
 const before=()=>{
  if(g.runtimeEnvironmentReady||hasPrepared)cancelIntent();cancelCoordinator();
  g.emitVisualNote({type:'clear'});heard=g.position();g.transport.stop();g.runPendingChange();g.flushPendingVoices();g.toneNow=null;ending=g.endBar!==null;g.endBar=null;
  if(g.quickStop!==quick||Boolean(g.fadeTimer)!==fade)throw Error('Master stop policy changed during synchronous parent publication');
  clearTimeout(g.fadeTimer);g.fadeTimer=null;clearTimeout(g.endTimer);g.endTimer=null;
  Object.values(g.roles).forEach(({instrument})=>instrument.silence());g.heldActiveRoles=new Set();delete g.heldResetBar;g.liveNotes?.clear();
 };
 const after=()=>{if(quick){clearTimeout(g.stopFade);g.stopFade=setTimeout(()=>g.endStopFade(),stopFadeMs);}g.pause(heard);if(ending)g.replan([]);g.notifyRunning();};
 if(operation){root.applyOperation(operation,{beforePublication:before,afterPublication:after});return;}
 try{root.check();before();after();}catch(error){root.quarantine(error);throw error;}
}
export function finishGeneratorMasterOutputStop(g){
 const root=generatorMasterOutputRoot(g);if(!root)throw Error('Selected Rust output root required');
 root.applyOperation('finishStop',{beforePublication:()=>{clearTimeout(g.stopFade);g.stopFade=null;Object.values(g.roles).forEach(({instrument})=>instrument.flushTails());if(g.reverbHub)g.reverbHub.flushTails();g.wasmRoomPool?.clear();}});
}
