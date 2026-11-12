/** Bind receipt is a MessagePort lifecycle fence, not an audio/render callback.
 * Cold Offline preparation must prove this receipt before attaching program. */
export function attachClockedDynamics(stage,clock){
 const receive=stage.inner.receive.bind(stage.inner),close=stage.dispose.bind(stage);let lease,disposal,timer,settled=false,resolveBind,rejectBind;
 const binding=new Promise((resolve,reject)=>{resolveBind=resolve;rejectBind=reject;});binding.catch(()=>{});
 const settle=(error=null)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)rejectBind(error);else resolveBind(stage);};
 timer=setTimeout(()=>{const error=Error('Clocked dynamics typed binding receipt timed out');settle(error);if(!stage.disposed)stage.fail(error);},5000);
 stage.clockBinding=binding;
 stage.dispose=()=>{if(disposal)return disposal;settle(Error('Clocked dynamics disposed before binding receipt'));let closed;try{closed=Promise.resolve(close());}catch(e){closed=Promise.reject(e);}disposal=(async()=>{const errors=[];try{await closed;}catch(e){errors.push(e);}try{await lease?.release();}catch(e){errors.push(e);}for(const error of[stage.cleanupError,stage.inner?.cleanupError])if(error)errors.push(Error(error));if(errors.length)throw new AggregateError(errors,'Clocked dynamics owner cleanup failed');})();disposal.catch(()=>{});return disposal;};
 stage.inner.receive=data=>{
  if(data?.kind==='native-clock-bound'){if(data.generation!==lease?.spec.generation){const error=Error('Dynamics clock binding generation differs');settle(error);if(!stage.disposed)stage.fail(error);else stage.cleanupError=String(error);return;}settle();return;}
  if(data?.kind!=='native-clock-retired')return receive(data);
  if(data.generation!==lease?.spec.generation){const error=Error('Retired dynamics clock generation differs');settle(error);if(!stage.disposed)stage.fail(error);else stage.cleanupError=String(error);return;}
  stage.inner.clockRetirement={generation:data.generation,error:data.error};stage.inner.error??=data.error;stage.inner.healthy=false;
  if(data.stats){stage.inner.cached=data.stats;stage.inner.failureState??={diagnostics:data.stats.diagnostics};}stage.inner.resolveHealth({error:data.error});settle(Error(data.error));if(!stage.disposed)stage.fail(Error(data.error));
 };
 try{
  lease=clock.connect(stage.inner.node,{onError:error=>{settle(error);stage.fail(error);}});
  const prepare=stage.prepareInitial.bind(stage);
  stage.prepareInitial=async(...args)=>{try{clock.check();await binding;clock.check();}catch(error){if(!stage.disposed)stage.fail(error);throw error;}return prepare(...args);};
  for(const key of['patch','patchSpec','writeLane','arm','setHostAwake','resetCold']){const original=stage[key].bind(stage);stage[key]=(...args)=>{try{clock.check();}catch(error){stage.fail(error);throw error;}return original(...args);};}
  stage.ready=Promise.all([stage.ready,lease.ready,binding]).then(()=>stage);stage.ready.catch(()=>{});stage.clockSnapshot=()=>clock.snapshot();return stage;
 }catch(error){settle(error);stage.dispose().catch(e=>stage.cleanupError=String(e));throw error;}
}
