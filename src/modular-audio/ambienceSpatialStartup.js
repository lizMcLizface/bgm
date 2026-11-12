/** Lifecycle-only successor leaf. No DSP, native graph or context state changes.
 * The host registers every returned handle before constructing its next owner. */
const bounded=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const issue=(label,error)=>({label,name:error?.name??'Error',message:error?.message??String(error),code:error?.code??null});
function timeout(label){return Object.assign(Error('Spatial '+label+' did not acknowledge before its startup deadline'),{code:'SPATIAL_STARTUP_TIMEOUT',label});}
export class AmbienceSpatialStartup{
 constructor({readyMs=5000,cleanupMs=1500,maxOwners=64,maxWaits=20,timers=globalThis}={}){
  if(!bounded(readyMs,1,20000)||!bounded(cleanupMs,1,5000)||!bounded(maxOwners,1,64)||!bounded(maxWaits,1,20)||typeof timers.setTimeout!=='function'||typeof timers.clearTimeout!=='function')throw Error('Invalid bounded spatial startup policy');
  this.readyMs=readyMs;this.cleanupMs=cleanupMs;this.maxOwners=maxOwners;this.maxWaits=maxWaits;this.timers=timers;this.state='preparing';this.owners=[];this.waits=[];this.cleanupPromise=null;this.failure=null;
 }
 open(){if(this.state!=='preparing')throw Error('Spatial startup is no longer admitting owners');}
 create(label,construct,release,{kernel=false}={}){
  this.open();if(typeof label!=='string'||!label||label.length>80||typeof construct!=='function'||typeof release!=='function'||this.owners.length>=this.maxOwners||this.owners.some(o=>o.label===label))throw Error('Spatial startup owner capacity/identity');
  let owner;try{owner=construct();}catch(error){this.state='failed';this.failure=issue(label,error);throw error;}this.owners.push({label,owner,release,kernel,state:'owned',result:null});return owner;
 }
 wait(label,{deadlineMs=this.readyMs}={}){
  this.open();if(typeof label!=='string'||!label||label.length>80||!bounded(deadlineMs,1,20000)||this.waits.length>=this.maxWaits||this.waits.some(w=>w.label===label))throw Error('Spatial ready capacity/identity');
  const w={label,state:'pending',lateAcknowledgements:0,timer:null,resolve:null,reject:null,promise:null};
  w.promise=new Promise((resolve,reject)=>{w.resolve=value=>{if(w.state!=='pending'){w.lateAcknowledgements++;return false;}this.timers.clearTimeout(w.timer);w.state='ready';resolve(value);return true;};w.reject=error=>{if(w.state!=='pending'){w.lateAcknowledgements++;return false;}this.timers.clearTimeout(w.timer);w.state='rejected';if(this.state==='preparing'){this.state='failed';this.failure??=issue(label,error);}reject(error);return true;};});w.promise.catch(()=>{});w.timer=this.timers.setTimeout(()=>{const error=timeout(label);if(w.reject(error)){this.failure??=issue(label,error);}},deadlineMs);this.waits.push(w);return w;
 }
 commit(){this.open();if(this.waits.some(w=>w.state!=='ready'))throw Error('Spatial startup cannot commit incomplete ready handshakes');this.state='active';return this;}
 retire(cause=null){
  if(this.cleanupPromise)return this.cleanupPromise;this.state='retiring';if(cause)this.failure??=issue('retirement',cause);const reason=cause??Error('Spatial startup retired');for(const w of this.waits)if(w.state==='pending')w.reject(reason);
  // Start reverse-order cleanup before waiting for any one owner. A silent clock
  // cannot prevent later native handles or workers from being released.
  const tasks=[...this.owners].reverse().map(o=>this.releaseOwner(o,reason));this.cleanupPromise=Promise.all(tasks).then(results=>{this.state='retired';return{clean:results.every(r=>r.clean),mustRetireContext:results.some(r=>!r.clean),owners:results};});return this.cleanupPromise;
 }
 releaseOwner(o,cause){
  o.state='releasing';return new Promise(resolve=>{let done=false;const finish=(result,error)=>{if(done)return;done=true;this.timers.clearTimeout(timer);const acknowledged=o.kernel?!error&&result?.acknowledged===true:null,clean=!error&&result?.clean!==false&&(!o.kernel||acknowledged);o.state=clean?'released':'unconfirmed';o.result={label:o.label,kernel:o.kernel,acknowledged,clean,result:result??null,error:error?issue(o.label,error):null};resolve(o.result);};const timer=this.timers.setTimeout(()=>finish(null,timeout('cleanup '+o.label)),this.cleanupMs);try{Promise.resolve(o.release(o.owner,{cause})).then(result=>finish(result,null),error=>finish(null,error));}catch(error){finish(null,error);}});
 }
 snapshot(){return{state:this.state,failure:this.failure,owners:this.owners.map(o=>({label:o.label,kernel:o.kernel,state:o.state,result:o.result})),waits:this.waits.map(w=>({label:w.label,state:w.state,lateAcknowledgements:w.lateAcknowledgements}))};}
}
/** Runtime retirement companion: maps are cleared and timers stopped before any
 * rejection callback runs. Re-entrant callers observe a closed admission epoch. */
export function rejectAmbienceSpatialRequests(maps,error,{timers=globalThis}={}){
 if(!Array.isArray(maps)||maps.length>2||maps.some(m=>!(m instanceof Map)||m.size>64))throw Error('Spatial request-map capacity');const pending=[];for(const map of maps){pending.push(...map.values());map.clear();}const failures=[];for(const p of pending){timers.clearTimeout(p.timer);try{p.reject(error);}catch(e){failures.push(issue('pending request rejection',e));}}return{settled:pending.length,failures};
}
export function retireAmbienceSpatialJobs(jobs,error,{timers=globalThis}={}){
 if(!(jobs instanceof Map)||jobs.size>32)throw Error('Spatial preparation-job capacity');const current=[...jobs.values()];jobs.clear();const failures=[];for(const job of current){timers.clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);job.bed?.pending?.delete(job.wave);job.retired=true;if(job.stage)job.stage.state='retired';for(const reject of[!job.settled&&job.reject,job.rejectCommit])if(typeof reject==='function')try{reject(error);}catch(e){failures.push(issue('preparation retirement',e));}}return{settled:current.length,failures};
}
/** Always attempt both graph detachment and port retirement on a returned node.
 * Unexpected failures remain explicit; absence is not guessed from an error. */
export function closeAmbienceSpatialNode(node){const failures=[];for(const[label,run]of[['disconnect',()=>node.disconnect()],['message handler',()=>{node.port.onmessage=null;}],['processor handler',()=>{node.onprocessorerror=null;}],['port close',()=>node.port.close()]])try{run();}catch(error){failures.push(issue(label,error));}return{clean:failures.length===0,cleanupErrors:failures};}
