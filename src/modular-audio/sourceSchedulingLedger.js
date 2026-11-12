const fail=message=>Object.assign(Error(message),{code:'SOURCE_SCHEDULING_UNPROVEN'});
const natural=n=>Number.isSafeInteger(n)&&n>=0;
/** Metadata only. The callback must settle the real owner booking work and
 * return a same-source FIFO receipt plus the source's Native rendered clock.
 * Main-thread elapsed time never expires a note or releases a held ID. */
export function createSourceSchedulingLedger({context,source,generation,settle,flush,capacity=2048,hostCapacity=256}={}){
 if(!context||!source||!natural(generation)||!generation||typeof settle!=='function'||typeof flush!=='function'||!Number.isInteger(capacity)||capacity<8||capacity>4096||!Number.isInteger(hostCapacity)||hostCapacity<1||hostCapacity>512)throw fail('Explicit bounded scheduling proof authority required');
 let sequence=0,hostSequence=0,acked=0,hostAcked=0,renderedUntil=0,proofPending=null,error=null,pedal=false,lastReceipt=null;const records=[],hostWork=new Map(),held=new Map();
 const alive=()=>{if(error)throw error;};
 const reserve=count=>{alive();if(!Number.isInteger(count)||count<0||records.length+count+[...hostWork.values()].reduce((a,b)=>a+b,0)>capacity||sequence+count>0xffffffff)throw fail('Scheduling ledger capacity exceeded before delegation');};
 const recordReserve=count=>{alive();const credits=[...hostWork.values()].reduce((a,b)=>a+b,0);if(records.length+Math.max(count,credits)>capacity||sequence+count>0xffffffff)throw fail('Scheduling ledger capacity exceeded before delegation');};
 const consume=count=>{for(const[epoch,cost]of hostWork){const used=Math.min(count,cost);hostWork.set(epoch,cost-used);count-=used;if(!count)break;}};
 const packet=rows=>{if(!Array.isArray(rows)||rows.length>capacity||rows.some(row=>!Array.isArray(row)||row.length!==5||!row.every(Number.isFinite)||!Number.isInteger(row[0])||row[0]<0||row[0]>6||row[0]===4||!natural(row[1])||row[1]>0xffffffff||!natural(row[2])||[0,1,5].includes(row[0])&&!row[1]||[0,5].includes(row[0])&&(row[3]<0||row[3]>127)||row[0]===0&&(row[4]<0||row[4]>1)||[2,3].includes(row[0])&&(row[3]<0||row[3]>1)||row[0]===5&&(row[4]<0||row[4]>8)||row[0]===6&&(row[1]>2||row[3]<0||row[3]>3||row[4]<0||row[4]>1)))throw fail('Exact supported Core/FM event packet required');};
 function applyProof(proof){
  if(!proof||proof.source!==source||proof.context!==context||proof.generation!==generation||proof.profile!=='native-rendered-source-fifo-v1'||!natural(proof.renderedUntil)||proof.renderedUntil%128||proof.renderedUntil<renderedUntil||!natural(proof.nativeFrame)||proof.renderedUntil!==proof.nativeFrame+128||proof.dropped!==0||proof.late!==0)throw fail('Source FIFO/Native rendered-frame proof differs');
  renderedUntil=proof.renderedUntil;
  let panic=0;for(const row of records)if(row.sequence<=acked&&row.panic)panic=row.sequence;
  if(panic){held.clear();pedal=false;for(let i=records.length-1;i>=0;i--)if(records[i].sequence<=panic)records.splice(i,1);lastReceipt={profile:'core-fm-fifo-panic-receipt-v1',sequence:panic,request:proof.request,renderedUntil,generation};}
  const applied=records.filter(row=>row.sequence<=acked&&row.frame<renderedUntil).sort((a,b)=>a.frame-b.frame||a.sequence-b.sequence);
  for(const row of applied){if(row.kind===0)held.set(row.id,{released:false});else if(row.kind===1){if(pedal&&held.has(row.id))held.get(row.id).released=true;else held.delete(row.id);}else if(row.kind===2){pedal=row.a>=.5;if(!pedal)for(const[id,key]of held)if(key.released)held.delete(id);}}
  const done=new Set(applied);for(let i=records.length-1;i>=0;i--)if(done.has(records[i]))records.splice(i,1);
 }
 const api=Object.freeze({version:1,profile:'source-scheduling-proof-ledger-v1',context,source,generation,
  hostCall(delegate,thisArg,args,{cost=8}={}){reserve(cost);if(typeof delegate!=='function'||!Array.isArray(args)||hostWork.size>=hostCapacity||hostSequence===0xffffffff)throw fail('Bounded host scheduling call required');const epoch=++hostSequence;hostWork.set(epoch,cost);try{return Reflect.apply(delegate,thisArg,args);}catch(failure){error??=failure;throw failure;}},
  events(rows,delegate,thisArg){packet(rows);recordReserve(rows.length);if(typeof delegate!=='function')throw fail('Actual event delegation required');const copy=rows.map(row=>row.slice());let result;try{result=Reflect.apply(delegate,thisArg,[rows]);}catch(failure){error??=failure;throw failure;}consume(copy.length);for(const[kind,id,frame,a]of copy)records.push({sequence:++sequence,kind,id,frame,a,panic:false});return result;},
  panic(delegate,thisArg,args=[]){recordReserve(1);if(typeof delegate!=='function'||!Array.isArray(args))throw fail('Actual panic delegation required');let result;try{result=Reflect.apply(delegate,thisArg,args);}catch(failure){error??=failure;throw failure;}consume(1);records.push({sequence:++sequence,panic:true});return result;},
  confirm(){alive();if(proofPending)return proofPending;const hostThrough=hostSequence;const work=(async()=>{try{await settle();const through=sequence,proof=await flush();if(proof?.fifo!==true||!natural(proof.request)||!proof.request)throw fail('Actual same-source FIFO receipt required');acked=Math.max(acked,through);applyProof(proof);hostAcked=Math.max(hostAcked,hostThrough);for(const epoch of hostWork.keys())if(epoch<=hostThrough)hostWork.delete(epoch);return api.status();}catch(failure){error??=failure;throw failure;}})();proofPending=work;work.finally(()=>{if(proofPending===work)proofPending=null;}).catch(()=>{});work.catch(()=>{});return work;},
  observe(proof){alive();try{applyProof(proof);}catch(failure){error??=failure;throw failure;}},
  admission(){alive();const s=api.status();if(s.pendingHost||s.pendingDelivery||s.futureCommands||s.held||s.pedal)throw fail('Actual scheduling/off/cancellation proof is still pending');return s;},
  status:()=>({version:1,profile:'source-scheduling-proof-ledger-v1',generation,sequence,acked,hostSequence,hostAcked,renderedUntil,pendingHost:hostWork.size,pendingDelivery:records.filter(row=>row.sequence>acked).length,futureCommands:records.length,held:held.size,pedal,proofPending:!!proofPending,error:error?String(error):null,lastReceipt})
 });return api;
}
/** Read-only adapter for the separately accepted Native-clock Core/FM host.
 * Its panic implementation clears notes AND event queue/head; the same-port
 * sync response follows that real operation. Legacy HostRenderClock cannot
 * supply this capability and is refused. The caller installs/taps no methods
 * until this adapter has been constructed successfully. */
export function coreSourceSchedulingProof({context,backend,settle}={}){
 const profile='native-clock-owned-core-fm-live-v1',status=backend?.clockStatus?.(),node=backend?.node,spec=status?.clock?.spec;
 if(backend?.sourceClockProfile!==profile||backend.context!==context||!node?.port||typeof backend.flush!=='function'||typeof settle!=='function'||!status.ready||status.clock?.version!=='7a0838a735108706'||!natural(spec?.generation)||!spec.generation)throw fail('Native-clock Core/FM FIFO capability required');
 const generation=spec.generation;
 const parse=(stats,fifo=false)=>{const current=backend.clockStatus();if(backend.error||!current.ready||backend.node!==node||current.clock?.retired||current.clock?.spec?.generation!==generation||stats?.clock?.profile!=='native-loop-cycle-clock-v1'||stats.clock.generation!==generation)throw fail('Source/Native clock generation changed');return{profile:'native-rendered-source-fifo-v1',context,source:backend,generation,fifo,request:stats.request,nativeFrame:stats.clock.lastFrame,renderedUntil:stats.frame,late:stats.late,dropped:stats.dropped};};
 return Object.freeze({context,source:backend,generation,settle,flush:async()=>parse(await backend.flush(),true),parse});
}
