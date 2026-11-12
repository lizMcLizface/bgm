import{createMainOutputColdOwner}from'./mainOutputColdOwner.js';
import{validateMainControl}from'./mainControlWords.js';
export const MAIN_OUTPUT_ROOT_PROFILE='main-output-cold-root-v1';
const refuse=(message,code='MAIN_OUTPUT_ROOT_REFUSED')=>Object.assign(Error(message),{code});
const claims=new WeakMap();let nextGeneration=0;
const now=(op,value,tau=0)=>Object.freeze({op,seconds:'now',value,tau});
/** Explicit command plans only. There is no gain.value/current-value proxy. */
export function planMainOutputOperation(operation,options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>key!=='activeFade')||Object.hasOwn(options,'activeFade')&&typeof options.activeFade!=='boolean'||operation==='cancelFadeOut'&&!Object.hasOwn(options,'activeFade'))throw refuse('Explicit active-fade state required');
 const activeFade=options.activeFade??false;
 const plans={stop:[now('cancel',0),now('target',0,.07)],finishStop:[now('cancel',0),now('set',1)],quickResume:[now('target',0,.005)],tailResume:[now('target',1,.05)]};
 if(operation==='cancelFadeOut'){if(activeFade)throw refuse('Active master fade cancellation requires an unimplemented actual intrinsic-read authority','MAIN_OUTPUT_INTRINSIC_READ_UNSUPPORTED');return Object.freeze({operation,noop:true,commands:Object.freeze([])});}
 if(!Object.hasOwn(plans,operation))throw refuse('Unsupported original master operation');return Object.freeze({operation,noop:false,commands:Object.freeze(plans[operation])});
}
/** Stable lifetime independent of source/runtime successors. A caller must
 * release every explicit borrow after its source ACK before destroying root. */
export async function prepareColdMainOutputRoot(context,options={}){
 if(options.onError!==undefined&&typeof options.onError!=='function')throw refuse('Explicit output onError callback required');
 if(!context||claims.has(context)||nextGeneration===0xffffffff)throw refuse('One master-output root per context');const generation=++nextGeneration,claim={generation};claims.set(context,claim);
 let owner,state='constructing',error=null,ticket=null,busy=false,closing=null;const borrows=new Set(),history=[];
 const releaseClaim=()=>{if((context.state==='closed'||state==='disposed'&&owner?.status().cleanupClean)&&claims.get(context)===claim){claims.delete(context);context.removeEventListener?.('statechange',releaseClaim);}};context.addEventListener?.('statechange',releaseClaim);
 const fail=issue=>{error??=issue instanceof Error?issue:Error(String(issue));return error;};
 const check=()=>{if(error)throw error;if(['disposing','disposed'].includes(state))throw refuse('Disposed master-output root','MAIN_OUTPUT_ROOT_DISPOSED');owner.check();return true;};
 const active=()=>{check();if(state!=='active'||busy)throw refuse('Active nonpublishing master root required');};
 const snapshot=()=>({profile:MAIN_OUTPUT_ROOT_PROFILE,generation,state,error:error?String(error):null,borrows:borrows.size,busy,reserved:!!ticket,quotaReleased:claims.get(context)!==claim,owner:owner?.status()??null,history:history.slice()});
 const dispose=()=>{if(closing)return closing;if(borrows.size)throw refuse('Release actual source/runtime borrows before master destruction','MAIN_OUTPUT_BORROWS_HELD');state='disposing';closing=(async()=>{const issues=[];if(ticket){try{if(owner.reservationState(ticket.child)==='held')owner.cancelReservation(ticket.child);}catch(issue){issues.push(issue);}ticket=null;}try{await owner.dispose();}catch(issue){issues.push(issue);}state='disposed';releaseClaim();if(issues.length)throw fail(new AggregateError(issues,'Master root cleanup failed'));return{profile:MAIN_OUTPUT_ROOT_PROFILE,generation,released:true,clean:true};})();closing.catch(()=>{});return closing;};
 const root=Object.freeze({profile:MAIN_OUTPUT_ROOT_PROFILE,context,generation,
  check,
  get input(){active();return owner.input;},get output(){active();return owner.output;},
  async arm(){check();if(state==='armed'||state==='active')return root;if(state!=='cold')throw refuse('Cold master root required');try{await owner.arm();state='armed';return root;}catch(issue){throw fail(issue);}},
  async activate(){check();if(state==='active')return root;if(state!=='armed')throw refuse('Arm master root before activation');try{const receipt=await owner.activate();state='active';return receipt;}catch(issue){throw fail(issue);}},
  borrow(){check();if(borrows.size>=16)throw refuse('Master borrower bound');const key=Object.freeze({}),lease=Object.freeze({profile:'main-output-root-borrow-v1',context,generation,check(){if(!borrows.has(key))throw refuse('Released master borrow');return check();},release(){borrows.delete(key);return Promise.resolve({released:true,clean:true});}});borrows.add(key);return lease;},
  reserve(commands){active();if(ticket||!Array.isArray(commands)||!commands.length||commands.length>32)throw refuse('One bounded whole master reservation required');const copied=commands.map(c=>{if(!c||Object.keys(c).sort().join(',')!=='op,seconds,tau,value')throw refuse('Exact typed master command fields required');const row={lane:1,...c};validateMainControl(context.sampleRate,{...row,seconds:c.seconds==='now'?0:c.seconds});return Object.freeze(row);});const child=owner.reserveCommands(copied),token=Object.freeze({});ticket={token,child,commands:copied};return token;},
  reserveOperation(operation,options){active();const plan=planMainOutputOperation(operation,options);if(plan.noop){const token=Object.freeze({noop:true,operation});history.push({operation,noop:true});if(history.length>32)history.shift();return token;}return root.reserve(plan.commands);},
  cancel(token){check();if(!ticket||ticket.token!==token)throw refuse('Unknown master reservation');owner.cancelReservation(ticket.child);ticket=null;},
  commit(token,{beforePublication,afterPublication}={}){active();if(!ticket||ticket.token!==token||beforePublication!==undefined&&(typeof beforePublication!=='function'||beforePublication.constructor?.name==='AsyncFunction')||afterPublication!==undefined&&(typeof afterPublication!=='function'||afterPublication.constructor?.name==='AsyncFunction'))throw refuse('Exact master token and synchronous parent callbacks required');owner.checkReservation(ticket.child);const held=ticket;busy=true;let irreversible=false;try{if(beforePublication){irreversible=true;const value=beforePublication();if(value?.then){Promise.resolve(value).catch(()=>{});throw refuse('Parent authoring callback must be synchronous');}}irreversible=true;const receipt=owner.commitReservation(held.child);ticket=null;if(afterPublication){const value=afterPublication(receipt);if(value?.then){Promise.resolve(value).catch(()=>{});throw refuse('Parent commit callback must be synchronous');}}history.push({commands:held.commands.length,receipt});if(history.length>32)history.shift();return receipt;}catch(issue){try{if(owner.reservationState(held.child)==='held')owner.cancelReservation(held.child);}catch(cleanupError){issue.cleanupError=cleanupError;irreversible=true;}ticket=null;if(irreversible)throw fail(issue);throw issue;}finally{busy=false;}},
  flush(){check();return owner.flush();},stats(){check();return owner.stats();},status:snapshot,dispose
 });
 try{owner=await createMainOutputColdOwner(context,{...options,onError:issue=>{fail(issue);options.onError?.(issue);}});state='cold';return root;}catch(primary){if(primary.cleanupError)fail(primary);else{state='disposed';claims.delete(context);context.removeEventListener?.('statechange',releaseClaim);}primary.outputRootStatus=snapshot();throw primary;}
}
