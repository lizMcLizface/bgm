/** Hold this source's clock links until a typed release receipt or context close.
 * A primary source failure may reject fence.dispose() before that later proof. */
export function createClockedSourceRelease(context,node,fence,getLease,{timeoutMs=1000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||typeof getLease!=='function')throw Error('Invalid clocked source release contract');
 let disposal,resolveReleased,released=new Promise(resolve=>resolveReleased=resolve),leaseRelease,leaseReleased=false,lateCleanupError=null,watching=false;
 const receive=node.port.onmessage;
 const releaseLease=()=>leaseRelease??=(async()=>{await getLease()?.release();leaseReleased=true;})().catch(error=>{lateCleanupError=error;throw error;});
 const observe=()=>{if(!fence.status().released)return;resolveReleased();if(watching){context.removeEventListener?.('statechange',observe);watching=false;}if(disposal)releaseLease().catch(()=>{});};
 node.port.onmessage=event=>{receive?.(event);observe();};
 return Object.freeze({status:()=>({source:fence.status(),clockReleased:leaseReleased,lateCleanupError:lateCleanupError?String(lateCleanupError):null}),dispose(){
  if(disposal)return disposal;
  let settle;disposal=new Promise((yes,no)=>settle={yes,no});disposal.catch(()=>{});
  const primary=Promise.resolve().then(()=>fence.dispose());primary.catch(()=>{});
  // The fence installs its own close proof before this observer's next task.
  queueMicrotask(()=>{if(!fence.status().released){context.addEventListener?.('statechange',observe);watching=true;}observe();});
  (async()=>{const errors=[];let timer;const proof=Promise.race([released,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Clocked source release proof timed out; clock lease retained')),timeoutMs))]);const results=await Promise.allSettled([primary,proof]);clearTimeout(timer);for(const r of results)if(r.status==='rejected')errors.push(r.reason);if(fence.status().released)try{await releaseLease();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Clocked source release failed');})().then(settle.yes,settle.no);
  return disposal;
 }});
}
