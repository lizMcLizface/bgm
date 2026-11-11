import url from '../modular-audio/shimmerLive.worklet.js?worker&url';
import {ownedVoiceFxSpec} from '../modular-audio/ownedVoiceFx.js';
const registrations=new WeakMap();let cached;
export function loadShimmerLiveAssets(){return cached??=(async()=>{const base=(import.meta.env?.BASE_URL??'/')+'modular-audio/',get=async name=>{const r=await fetch(base+name);if(!r.ok)throw Error('Missing Shimmer asset');return r;},manifest=await(await get('voice-fx-build.json')).json(),host=await(await get('shimmer-live-build.json')).json(),bytes=await(await get('voice-fx.wasm?v='+manifest.version)).arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(manifest.api!==1||manifest.audited||manifest.bytes!==bytes.byteLength||manifest.wasm!==hash||host.api!==1||host.profile!=='original-shimmer-live-message-v1'||host.kernelVersion!==manifest.version||host.wasm!==hash)throw Error('Shimmer provenance mismatch');return{manifest,host,module:await WebAssembly.compile(bytes)};})().catch(error=>{cached=null;throw error;});}
function value(index,raw){if(typeof raw!=='number'||!Number.isFinite(raw))throw Error('Invalid Shimmer value');if(index===0)return Math.min(1,Math.max(0,raw));if(index===3)return Math.min(.95,Math.max(0,raw));if(index===4)return Math.min(16000,Math.max(500,raw));if(index===1&&raw<=30)return Math.max(.3,raw);if(index===2&&[7,12,19,24].includes(raw))return raw;throw Error('Shimmer live value exceeds prepared contract');}
class RustShimmer {
 constructor(context,assets){
  this.AC=context;this.assets=assets;this.settings={mix:0,decay:6,semitones:12,climb:.5,tone:7000};this.error=null;this.disposed=false;this.pending=new Map();this.request=0;this.backend='owned-rust';this.engineVersion=assets.manifest.version;this.hostVersion=assets.host.version;this.node=null;this.ready=Promise.resolve(this);
  this.input=context.createGain();this.output=context.createGain();this.input.connect(this.output);
  this.activeHealth=new Promise(resolve=>this.resolveHealth=resolve);
 }
 get health(){return this.loading||this.node?this.activeHealth:Promise.resolve({ready:!this.disposed,inactive:true});}
 alive(){if(this.disposed||this.error)throw this.error??Error('Shimmer disposed');}
 ensure(){
  if(this.loading||this.node||this.disposed)return;
  this.loading=Promise.resolve().then(()=>{
   if(this.disposed)return this;
   const assets=this.assets,node=new AudioWorkletNode(this.AC,'owned-shimmer-live',{numberOfInputs:1,numberOfOutputs:1,channelCount:2,channelCountMode:'clamped-max',outputChannelCount:[2],processorOptions:{module:assets.module,spec:ownedVoiceFxSpec('shimmer',this.settings),version:assets.host.version}});
   this.node=node;
   node.port.onmessage=({data})=>{if(data.type==='ready')this.resolveHealth({ready:true,hostVersion:this.hostVersion});else if(data.type==='error')this.fail(Error(data.message));else if(data.type==='disposed'){clearTimeout(this.disposeTimer);node.port.close();node.port.onmessage=null;this.finishDispose?.();return;}const pending=this.pending.get(data.request);if(pending){clearTimeout(pending.timer);this.pending.delete(data.request);pending.resolve(data);}};
   node.onprocessorerror=()=>this.fail(Error('Shimmer processor failed'));
   this.input.disconnect(this.output);this.input.connect(node);node.connect(this.output);return this;
  }).catch(error=>{this.fail(error);throw error;});
  this.loading.catch(()=>{});this.ready=this.loading;
 }
 fail(error){this.error=error;this.resolveHealth({error:String(error)});for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();if(!this.disposed)this.dispose().catch(failure=>{this.cleanupError=String(failure);});}
 set(index,raw){this.alive();const names=['mix','decay','semitones','climb','tone'],effective=value(index,raw);this.settings[names[index]]=effective;if(this.node)this.node.port.postMessage({type:'set',entries:[[index,effective]]});if(this.settings.mix>0)this.ensure();}
 setMix=v=>this.set(0,v);setDecay=v=>this.set(1,v);setShift=name=>this.set(2,({fifth:7,octave:12,twelfth:19,twoOctaves:24})[name]??12);setClimb=v=>this.set(3,v);setTone=v=>this.set(4,v);
 getNode=()=>this.input;connect=destination=>[].concat(destination).forEach(n=>this.output.connect(n));
 clear=()=>{this.alive();this.node?.port.postMessage({type:'clear'});};
 command(type){if(this.disposed||this.error)return Promise.reject(this.error??Error('Shimmer disposed'));if(!this.node)return Promise.resolve({inactive:true});if(this.pending.size>=16||this.request>=4294967295)return Promise.reject(Error('Shimmer request capacity'));const id=++this.request;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Shimmer acknowledgement timeout'));},10000);this.pending.set(id,{resolve,reject,timer});this.node.port.postMessage({type,request:id});});}
 async arm(){this.alive();if(this.AC.state!=='running')throw Error('Shimmer arm requires a running context');await this.ready;return this.command('flush');}
 requestStats=()=>this.command('stats');snapshot=()=>ownedVoiceFxSpec('shimmer',this.settings);
 dispose(){if(this.disposal)return this.disposal;this.disposed=true;this.resolveHealth({disposed:true});for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Shimmer disposed'));}this.pending.clear();this.input.disconnect();this.output.disconnect();const node=this.node;if(!node)return this.disposal=Promise.resolve();node.disconnect();node.onprocessorerror=null;this.disposal=new Promise(resolve=>{this.finishDispose=resolve;this.disposeTimer=setTimeout(()=>{node.port.close();node.port.onmessage=null;resolve();},1000);try{node.port.postMessage({type:'dispose'});}catch{clearTimeout(this.disposeTimer);node.port.close();node.port.onmessage=null;resolve();}});return this.disposal;}
}
export async function prepareOwnedShimmer(context,{assets}={}){assets??=await loadShimmerLiveAssets();if(!registrations.has(context)){const loading=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Shimmer registration timeout')),10000);Promise.resolve(context.audioWorklet.addModule(url+(url.includes('?')?'&':'?')+'v='+assets.host.version)).then(result=>{clearTimeout(timer);resolve(result);},error=>{clearTimeout(timer);reject(error);});});registrations.set(context,loading);loading.catch(()=>{if(registrations.get(context)===loading)registrations.delete(context);});}await registrations.get(context);const factory=ctx=>{if(ctx!==context)throw Error('Shimmer factory belongs to another context');return new RustShimmer(ctx,assets);};factory.prepareContext=ctx=>prepareOwnedShimmer(ctx,{assets});factory.engineVersion=assets.manifest.version;factory.hostVersion=assets.host.version;return factory;}
