import {perfEnabled} from '../audio/perfMode';
import {kernelAsset} from './kernelAssets';
import {supportsSimd} from './fmModule';
import {sanitizeNoteBehavior} from './noteBehavior';
import {fmPacket} from './fmPatch';
import {bankFromSearch} from '../audio/simdChoice';
// Captured before preset/share URL rewriting. This prototype is never a saved policy.
export const FM_BANK_LINK=typeof location!=='undefined'&&bankFromSearch(location.search);
const pools=new WeakMap(),registrations=new WeakMap();const modules=new Map();let token=0;
async function module(){
 const kind=perfEnabled()?'fm-fast':'fm-bank';if(!modules.has(kind))modules.set(kind,(async()=>{if(!supportsSimd())throw Error('SIMD unavailable');const r=await fetch(kernelAsset(kind,kind+'.wasm'));if(!r.ok)throw Error('Optional FM bank unavailable');return {compiled:await WebAssembly.compile(await r.arrayBuffer()),kind};})().catch(e=>{modules.delete(kind);throw e;}));return modules.get(kind);
}
class Pool {
 constructor(context,compiled,offline,stopFrame,kind){
  this.context=context;this.kind=kind;this.offline=offline;this.stopFrame=stopFrame;this.slots=Array(4).fill(null);this.closed=false;
  this.node=new AudioWorkletNode(context,'calmbgm-fm-bank',{numberOfInputs:0,numberOfOutputs:4,outputChannelCount:[2,2,2,2],processorOptions:{module:compiled,offline,stopFrame,fast:kind==='fm-fast'}});
  this.node.port.onmessage=({data})=>{if(data.type==='error'){this.fail(Error(data.message));return;}const c=this.slots[data.slot];if(!c||c.token!==data.token)return;if(data.type!=='ready')c.port.onmessage?.({data});};
  this.node.onprocessorerror=()=>this.fail(Error('FM bank processor stopped'));
 }
 fail(error){for(const c of this.slots)if(c)c.onError(error);this.close();}
 close(){if(this.closed)return;this.closed=true;this.node.port.postMessage({type:'dispose-bank'});this.node.disconnect();this.node.port.onmessage=null;this.node.port.close();this.slots.fill(null);pools.set(this.context,(pools.get(this.context)??[]).filter(p=>p!==this));}
 acquire(patch,options){
  if(this.closed)return null;const s=this.slots.indexOf(null);if(s<0)return null;
  const node=this.context.createGain(),id=++token;const port={onmessage:null,postMessage:d=>{if(this.slots[s]?.token!==id)return;if(d.type==='dispose'){this.release(s,id);return;}this.node.port.postMessage({...d,slot:s,token:id});},close:()=>{}};
  const c={token:id,node,port,onError:options.onError??(()=>{})};this.slots[s]=c;node.port=port;
  port.onmessage=({data})=>{if(data.type==='stats')options.onStats?.(data);};
  this.node.connect(node,s,0);
  this.node.port.postMessage({type:'add',slot:s,token:id,patch:fmPacket(patch),performance:sanitizeNoteBehavior(patch.performance),events:options.events??[],auditStats:!!options.auditStats,patches:(options.patches??[]).map(p=>({...p,patch:fmPacket(p.patch),performance:sanitizeNoteBehavior(p.patch.performance)}))});
  return node;
 }
 release(s,id){const c=this.slots[s];if(!c||c.token!==id)return;this.node.port.postMessage({type:'dispose',slot:s,token:id});this.node.disconnect(c.node);c.node.disconnect();c.port.onmessage=null;this.slots[s]=null;if(this.slots.every(c=>!c))this.close();}
}
export async function makeFMBankNode(context,patch,options={}){
 const {compiled,kind}=await module();let registered=registrations.get(context);if(!registered){registered=context.audioWorklet.addModule(kernelAsset('fm-bank','fm-bank-processor.js'));registrations.set(context,registered);}await registered;
 // Reserve slots synchronously after initialization; concurrent instrument loads
 // share the same pool and a full/closing pool creates a separate bank.
 const offline=!!options.offline,stopFrame=options.stopFrame??(Number.isFinite(context.length)?context.length:null),list=(pools.get(context)??[]).filter(p=>!p.closed);pools.set(context,list);let pool=list.find(p=>p.kind===kind&&p.offline===offline&&p.stopFrame===stopFrame&&p.slots.includes(null));if(!pool){pool=new Pool(context,compiled,offline,stopFrame,kind);list.push(pool);}return pool.acquire(patch,options);
}
