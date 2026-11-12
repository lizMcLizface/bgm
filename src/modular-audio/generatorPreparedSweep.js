import{prepareSweepLive}from'../nodes/sweepRust.js';
import{isMainControlClockLease}from'./mainControlClockLease.js';
const owners=new WeakMap(),certificates=new WeakMap();
const refuse=(message,code='GENERATOR_PREPARED_SWEEP_REFUSED')=>Object.assign(Error(message),{code});
const normalized=issue=>issue instanceof Error?issue:Object.assign(Error('Prepared Sweep failed: '+String(issue)),{cause:issue});
const abort=()=>Object.assign(refuse('Prepared Sweep cancelled'),{name:'AbortError'});
const cleanSource=status=>status?.source?.released===true&&status.source.quarantined===false&&status.source.receipt?.type==='disposed'&&status.source.receipt.version===1&&status.source.receipt.released===true&&status.source.receipt.clean===true&&status.clockReleased===true;
function recordFor(g){return owners.get(g)??null;}
function actual(record){if(record.g.AC!==record.context||record.clockLease.status().closed||record.actor.clock!==record.clockLease.value||record.actor.getNode()!==record.input||record.actor.output!==record.output||record.actor.processor!==record.processor)throw refuse('Actual prepared Sweep context/clock/endpoints changed');record.clockLease.value.check();record.actor.alive();}
/** Low-level verification deliberately never calls parent.check: the parent
 * uses this authority during its own check, so recursive certification is absent. */
export function verifyGeneratorPreparedSweepRoute(g,{outputRoot,clock,from,to,sweep}={}){
 const r=recordFor(g);if(!r||r.state!=='published'||r.error||r.parent!==outputRoot||r.clockLease.value!==clock||r.from!==from||r.to!==to||r.facade!==sweep||g.sweep!==r.facade)throw refuse('An actual privately owned prepared Sweep route is required');actual(r);
 if(!r.certificate||certificates.get(r.certificate)!==r)throw refuse('Private prepared Sweep certificate missing');return r.certificate;
}
export function isGeneratorPreparedSweepFacade(g,value){const r=recordFor(g);return!!r&&r.state==='published'&&!r.error&&r.facade===value&&g.sweep===value;}
export function generatorPreparedSweepResources(g){const r=recordFor(g);return r?[r.owner,r.facade,r.input,r.output,r.processor]:[];}
export function isolateGeneratorPreparedSweep(g,{outputRoot}={}){
 const r=recordFor(g);if(!r||r.parent!==outputRoot)return;r.beginTerminal();
 if(!r.safeIsolation()){r.isolationDeferred=true;return;}r.isolationDeferred=false;const issues=[];
 for(const [from,to,disconnect]of[[r.from,r.input,r.fromDisconnect],[r.output,r.to,r.outputDisconnect]])if(from&&to&&disconnect)try{disconnect(to);}catch(issue){if(issue?.name!=='InvalidAccessError')issues.push(issue);}
 if(issues.length){r.isolationError??=new AggregateError(issues,'Prepared Sweep program isolation failed');throw r.isolationError;}
}
export const generatorPreparedSweep=g=>recordFor(g)?.owner??null;
export const generatorPreparedSweepHasRoute=g=>{const r=recordFor(g);return!!r?.certificate&&r.state!=='disposed';};
/** Only this trusted factory creates the record/actor. No imported family label,
 * user endpoint DTO or supplied node factory is a route capability. */
export async function createGeneratorPreparedSweep(g,{clockLease,outputRoot,scalarRoot,signal}={}){
 const context=g?.AC;if(owners.has(g)||!context||context.state!=='suspended'||context.currentTime!==0||!isMainControlClockLease(clockLease)||clockLease.context!==context||clockLease.status().closed||outputRoot?.context!==context||scalarRoot?.context!==context||outputRoot.status().state!=='cold'||scalarRoot.status().state!=='cold'||g.sweep)throw refuse('Actual cold roots and retained Main clock required');
 const r={g,context,clockLease,parent:outputRoot,scalar:scalarRoot,state:'preparing',actor:null,owner:null,input:null,output:null,processor:null,error:null,busy:false,from:null,to:null,fromDisconnect:null,outputDisconnect:null,certificate:null,parentBorrow:null,closing:null,armWork:null,sourceAttempted:false,sourceCleanup:null,sourceRetirement:null,sourceStarting:false,sourceStartError:null,isolationDeferred:false,pendingParentFailure:false,isolationError:null,contextRelease:null,originalDescriptor:Object.getOwnPropertyDescriptor(g,'sweep')};
 const snapshot=()=>({profile:'generator-prepared-rust-sweep-v1',state:r.state,error:r.error?String(r.error):null,busy:r.busy,selected:true,published:!!r.certificate,parentBorrowHeld:!!r.parentBorrow,clockClosed:r.clockLease.status().closed,armReceipt:r.armReceipt??null,armWitness:r.armWitness??null,actor:r.actor?.snapshot()??null,sourceCleanup:r.sourceCleanup,terminalStarted:!!r.sourceRetirement||r.sourceStarting,isolationDeferred:r.isolationDeferred,contextRelease:!!r.contextRelease});
 const safeIsolation=()=>{if(context.state==='closed'||!r.actor)return true;try{const gate=r.actor.snapshot().terminalGateAuthored;if(gate?.value===1&&Number.isSafeInteger(gate.frame)&&Number.isFinite(gate.seconds))return true;const source=r.actor.disposalStatus()?.source,receipt=source?.receipt;return source?.released===true&&receipt?.type==='disposed'&&receipt.version===1&&receipt.released===true&&typeof receipt.clean==='boolean';}catch{return false;}};
 const quarantineParent=()=>{try{r.parent.quarantine(r.error);}catch(callbackError){r.error.parentError??=callbackError;}};
 const afterTerminal=()=>{if(!safeIsolation())return;if(r.pendingParentFailure){r.pendingParentFailure=false;quarantineParent();}if(r.isolationDeferred)try{isolateGeneratorPreparedSweep(g,{outputRoot:r.parent});}catch(cleanupError){(r.error??=normalized(cleanupError)).isolationError??=cleanupError;}};
 function beginTerminal(){if(!['disposing','disposed','quarantined'].includes(r.state)){r.error??=normalized(g.runtimeEnvironmentError??refuse('Parent isolation permanently retired the prepared Sweep'));g.runtimeEnvironmentError??=r.error;r.state='quarantined';}if(!r.actor||r.sourceRetirement||r.sourceStarting)return;r.sourceStarting=true;let value;try{value=r.actor.dispose();}catch(issue){r.sourceStartError=normalized(issue);value=Promise.reject(r.sourceStartError);}r.sourceStarting=false;r.sourceRetirement=Promise.resolve(value);r.sourceRetirement.catch(()=>{});r.sourceRetirement.then(afterTerminal,afterTerminal).catch(issue=>{(r.error??=normalized(issue)).terminalObservationError??=issue;});}
 r.beginTerminal=beginTerminal;r.safeIsolation=safeIsolation;
 const fail=issue=>{r.error??=normalized(issue);if(r.state!=='disposed')r.state='quarantined';g.runtimeEnvironmentError??=r.error;beginTerminal();if(safeIsolation())quarantineParent();else r.pendingParentFailure=true;try{isolateGeneratorPreparedSweep(g,{outputRoot:r.parent});}catch(cleanupError){r.error.isolationError??=cleanupError;}return r.error;};
 function check(){if(r.error)throw r.error;if(signal?.aborted)throw fail(abort());if(!['armed','published'].includes(r.state)||r.busy)throw refuse('Prepared Sweep is not armed or is publishing');if(context.state!=='running')throw fail(refuse('Observed nonrunning prepared Sweep generation cannot resume'));try{actual(r);r.parent.check();r.scalar.check();}catch(issue){throw fail(issue);}return true;}
 const restorePointer=()=>{if(r.facade&&g.sweep!==undefined&&g.sweep!==r.facade)throw refuse('Foreign Sweep pointer cannot be restored');if(r.originalDescriptor)Object.defineProperty(g,'sweep',r.originalDescriptor);else delete g.sweep;};
 const releaseLeases=async()=>{const issues=[];if(r.parentBorrow)try{await r.parentBorrow.release();r.parentBorrow=null;}catch(issue){issues.push(issue);}try{await clockLease.release();}catch(issue){issues.push(issue);}if(issues.length)throw new AggregateError(issues,'Prepared Sweep dependency release failed');};
 const closed=()=>{if(context.state!=='closed'||r.contextRelease)return;afterTerminal();r.contextRelease=releaseLeases();r.contextRelease.catch(()=>{});context.removeEventListener?.('statechange',closed);};
 function dispose(){
  if(r.closing)return r.closing;if(r.busy)throw refuse('Finish synchronous Sweep publication before disposal');r.state='disposing';beginTerminal();r.closing=(async()=>{const issues=[];try{isolateGeneratorPreparedSweep(g,{outputRoot:r.parent});}catch(issue){issues.push(issue);}
   try{if(r.actor){await r.sourceRetirement;r.sourceCleanup=r.actor.disposalStatus();if(!cleanSource(r.sourceCleanup))throw refuse('Prepared Sweep lacks actual clean Source and wire release');isolateGeneratorPreparedSweep(g,{outputRoot:r.parent});}else if(r.sourceAttempted)throw refuse('No returned Sweep actor can certify its partial prefix');}catch(issue){issues.push(issue);}
   if(r.armWork)await Promise.allSettled([r.armWork]);if(r.isolationError&&!issues.includes(r.isolationError))issues.push(r.isolationError);
   if(!issues.length){try{restorePointer();if(r.certificate&&context.state==='running'&&!r.error&&!r.parent.status().error)r.from.connect(r.to);}catch(issue){issues.push(issue);}}
   if(!issues.length)try{await releaseLeases();}catch(issue){issues.push(issue);}
   if(issues.length){const cleanupError=new AggregateError(issues,'Prepared Sweep retirement uncertain; dependencies retained');if(r.error)r.error.cleanupError??=cleanupError;throw fail(cleanupError);}
   context.removeEventListener?.('statechange',closed);signal?.removeEventListener('abort',onAbort);r.state='disposed';return{profile:'generator-prepared-sweep-terminal-v1',released:true,clean:true,source:r.sourceCleanup,healthError:r.error?String(r.error):null};
  })();r.closing.catch(()=>{});return r.closing;
 }
 const set=(values,tc=.1)=>{check();if(r.state!=='published')throw refuse('First Sweep set requires the private route publication');r.actor.preflightSet(values,tc);r.busy=true;try{r.actor.set(values,tc);}catch(issue){throw fail(issue);}finally{r.busy=false;}};
 r.facade=Object.freeze({profile:'generator-prepared-rust-sweep-facade-v1',context,input:null,output:null,set,get isOpen(){throw refuse('Synchronous Sweep intrinsic getter is not implemented','GENERATOR_SWEEP_INTRINSIC_READ_UNSUPPORTED');}});
 const owner=Object.freeze({profile:'generator-prepared-rust-sweep-v1',context,
  arm(){if(r.error)return Promise.reject(r.error);if(r.state==='armed'||r.state==='published'){try{check();return r.armWork;}catch(issue){return Promise.reject(issue);}}if(r.armWork)return r.armWork;if(r.state!=='cold'||context.state!=='running')return Promise.reject(refuse('Resume and activate the parent roots before Sweep arm'));r.state='arming';r.armWork=(async()=>{try{r.parent.check();r.scalar.check();r.parentBorrow=r.parent.borrow();r.armReceipt=await r.actor.arm();if(r.state!=='arming'||signal?.aborted)throw abort();await r.actor.requestStats();const s=r.actor.snapshot();if(s.inputConnected||s.hostAwake||s.mode!==0||r.actor.edges.length||s.cached?.kernel?.commands!==1||s.cached.kernel.renderedFrames!==0||s.cached.kernel.calls<1||s.cached.observed.values.some((v,i)=>!Object.is(v,[350,350,1,1][i])))throw refuse('Actual OPEN zero-DSP/default-intrinsic arm proof differs');if(signal?.aborted||r.state!=='arming')throw abort();r.armWitness=s;actual(r);r.state='armed';return owner;}catch(issue){throw fail(issue);}})();r.armWork.catch(()=>{});return r.armWork;},
  apply(values,tc,{from,to}={}){
   check();if(r.state==='published'){set(values,tc);return r.facade;}
   if(from!==r.parent.postFadeOutput()||to!==r.scalar.trimDestination()||from?.context!==context||to?.context!==context||g.sweep)throw refuse('Exact unswept private parent route required');
   // One private synchronous writer. No await or exposed actor can consume
   // this capacity between admission and the original edge / first-set sequence.
   r.actor.preflightSet(values,tc);r.busy=true;r.from=from;r.to=to;r.fromDisconnect=from.disconnect.bind(from);r.outputDisconnect=r.actor.outputDisconnect;
   try{from.disconnect(to);from.connect(r.input);r.actor.connect(to);r.actor.setHostAwake(true);r.actor.set(values,tc);
    r.state='published';r.facade=Object.freeze({profile:'generator-prepared-rust-sweep-facade-v1',context,input:r.input,output:r.output,set,get isOpen(){throw refuse('Synchronous Sweep intrinsic getter is not implemented','GENERATOR_SWEEP_INTRINSIC_READ_UNSUPPORTED');}});g.sweep=r.facade;r.certificate=Object.freeze({profile:'generator-prepared-sweep-route-v1',context,parent:r.parent,input:r.input,output:r.output,from,to});certificates.set(r.certificate,r);return r.facade;
   }catch(issue){throw fail(issue);}finally{r.busy=false;}
  },
  async stats(){check();await r.actor.requestStats();check();return snapshot();},
  check,status:snapshot,dispose,facade:()=>r.facade
 });const onAbort=()=>{fail(abort());dispose().catch(()=>{});};r.owner=owner;owners.set(g,r);context.addEventListener?.('statechange',closed);signal?.addEventListener('abort',onAbort,{once:true});
 try{if(signal?.aborted)throw abort();const factory=await prepareSweepLive(context);if(signal?.aborted||r.state!=='preparing')throw abort();if(context.state!=='suspended'||context.currentTime!==0)throw refuse('Cold Sweep prerequisite advanced');r.sourceAttempted=true;r.actor=factory(context,{channels:2,hostAwake:false,onError:fail});await r.actor.ready;
  r.input=r.actor.getNode();r.output=r.actor.output;r.processor=r.actor.processor;if(r.actor.clock!==clockLease.value||r.actor.context!==context||r.state!=='preparing'||r.actor.identity.hostVersion!==factory.hostVersion||r.actor.inputConnected||r.actor.hostAwake||r.actor.edges.length)throw refuse('Actual private Sweep factory ownership differs');if(signal?.aborted)throw abort();r.state='cold';return owner;
 }catch(thrown){const primary=normalized(thrown);fail(primary);if(primary.cleanupReady?.then)try{await primary.cleanupReady;}catch(cleanupError){primary.cleanupError??=cleanupError;}primary.cleanupReady=dispose();primary.cleanupReady.catch(()=>{});primary.preparedSweepStatus=snapshot();throw primary;}
}
