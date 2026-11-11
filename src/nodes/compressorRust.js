import {prepareNativeCompressorLive} from '../modular-audio/nativeCompressorLiveBrowser.js';
import {NATIVE_COMPRESSOR_PARAMETERS,ownedNativeCompressorSpec,validateOwnedNativeCompressorSpec} from '../modular-audio/ownedNativeCompressor.js';
const DEFAULTS={threshold:-24,knee:30,ratio:12,attack:.005,release:.05},BARE_DEFAULTS={threshold:-24,knee:30,ratio:12,attack:.003,release:.25};
function effectiveValue(index,value){
 const range=NATIVE_COMPRESSOR_PARAMETERS[index];if(!range||typeof value!=='number'||!Number.isFinite(value))throw Error('Invalid raw compressor value');const f32=Math.fround(value);if(!Number.isFinite(f32))throw Error('Invalid raw compressor value');
 return f32<range[1]?range[1]:f32>range[2]?range[2]:f32;
}
function initialConfiguration(context,defaults,settings,initialControls,initialProperties){
 if([settings,initialControls,initialProperties].filter(value=>value!==undefined).length>1)throw Error('Initial settings, controls and properties are mutually exclusive');
 const raw=NATIVE_COMPRESSOR_PARAMETERS.map(([name])=>defaults[name]);let controls=null,properties=null;
 if(settings!==undefined){
  if(!settings||typeof settings!=='object'||Array.isArray(settings)||Object.keys(settings).some(key=>!NATIVE_COMPRESSOR_PARAMETERS.some(([name])=>key===name)))throw Error('Invalid raw compressor settings');
  const merged={...defaults,...settings};controls=NATIVE_COMPRESSOR_PARAMETERS.map(([name],i)=>[i,merged[name]]);
 }else if(initialControls!==undefined){
  if(typeof context.startRendering!=='function'||!Array.isArray(initialControls)||initialControls.length>64)throw Error('Initial controls require a bounded OfflineAudioContext trace');
  controls=initialControls;
 }else if(initialProperties!==undefined){if(!Array.isArray(initialProperties)||initialProperties.length>64)throw Error('Initial properties require a bounded native property trace');properties=initialProperties;}
 if(controls)controls=controls.map(entry=>{if(!Array.isArray(entry)||entry.length!==2||!Number.isInteger(entry[0]))throw Error('Invalid initial compressor control');const[index,value]=entry,effective=effectiveValue(index,value);raw[index]=value;return[index,effective];});
 if(properties)properties=properties.map(entry=>{if(!Array.isArray(entry)||entry.length!==2||!Number.isInteger(entry[0]))throw Error('Invalid initial compressor property');const[index,value]=entry,effective=effectiveValue(index,value);raw[index]=value;return[index,effective];});
 return{raw,effective:raw.map((value,index)=>effectiveValue(index,value)),controls,properties};
}
/** Prepared single-I/O node. DSP coefficients never come from AudioParams. */
class RustCompressor{
 constructor(context,assets,{profile='nodes-wrapper',settings,initialControls,initialProperties,initialPull=false,hostAwake=true}={}){
  if(typeof initialPull!=='boolean'||initialPull&&typeof context.startRendering!=='function')throw Error('Initial pull is an explicit OfflineAudioContext preparation contract');
  if(typeof hostAwake!=='boolean'||initialPull&&!hostAwake)throw Error('Invalid initial raw compressor host demand');
  if(!['nodes-wrapper','bare-native'].includes(profile))throw Error('Unsupported native compressor constructor profile');if((profile==='bare-native'||initialProperties!==undefined)&&!assets.manifest.constructorProfiles?.includes('bare-native'))throw Error('Prepared compressor does not support native property initialization');
  this.constructorProfile=profile;const defaults=profile==='bare-native'?BARE_DEFAULTS:DEFAULTS;this.AC=context;const spec=validateOwnedNativeCompressorSpec(ownedNativeCompressorSpec(defaults)),configuration=initialConfiguration(context,defaults,settings,initialControls,initialProperties);
  this.values=configuration.raw;this.effectiveValues=configuration.effective;this.sequence=0;this.request=0;this.pending=new Map();this.error=null;this.disposed=false;this.cached=null;this.engineVersion=assets.manifest.version;
  this.hostAwake=hostAwake;this.demandValue=Number(initialPull);this.edges=[];
  this.health=new Promise(resolve=>this.resolveHealth=resolve);
  const originSeconds=context.currentTime,originFrame=this.frame(originSeconds);
  this.node=new AudioWorkletNode(context,assets.manifest.processorName,{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'clamped-max',parameterData:{hostDemand:this.demandValue},processorOptions:{module:assets.module,engineVersion:assets.manifest.version,parameters:spec.parameters.map(p=>p[1]),originFrame,originSeconds,constructorProfile:profile,initialControls:configuration.controls,initialProperties:configuration.properties,initialPull}});
  this.node.port.onmessage=({data})=>this.receive(data);this.node.onprocessorerror=()=>this.failed('Raw compressor processor failed');
  this.demand=this.node.parameters.get('hostDemand');
  if(!this.demand||typeof this.demand.setValueAtTime!=='function'){this.failed('Raw compressor Boolean demand transport is unavailable');throw Error(this.error);}
  const node=this.node,connect=node.connect.bind(node),disconnect=node.disconnect.bind(node);this.originalDisconnect=disconnect;
  node.connect=(...args)=>{
   this.alive();const result=connect(...args),edge={destination:args[0],output:args[1]??0,input:args[2]??0};
   if(!this.edges.some(e=>e.destination===edge.destination&&e.output===edge.output&&e.input===edge.input))this.edges.push(edge);
   this.updateDemand();return result;
  };
  node.disconnect=(...args)=>{
   const result=disconnect(...args);
   if(!args.length)this.edges=[];
   else if(typeof args[0]==='number')this.edges=this.edges.filter(e=>e.output!==args[0]);
   else this.edges=this.edges.filter(e=>!(e.destination===args[0]&&(args.length<2||e.output===args[1])&&(args.length<3||e.input===args[2])));
   if(!this.disposed&&!this.error)this.updateDemand();return result;
  };
  this.ready=Promise.resolve(this);
 }
 alive(){if(this.disposed||this.error)throw Error(this.error??'Disposed raw compressor');}
 frame(seconds=this.AC.currentTime){const frame=Math.round(seconds*this.AC.sampleRate);if(!Number.isSafeInteger(frame)||frame<0||frame%128)throw Error('Raw compressor requires canonical context time');return frame;}
 updateDemand(){const value=Number(this.hostAwake&&this.edges.length>0);if(value===this.demandValue)return;const seconds=this.AC.currentTime;this.frame(seconds);this.demand.setValueAtTime(value,seconds);this.demandValue=value;}
 setHostAwake(value){this.alive();if(typeof value!=='boolean')throw Error('Raw compressor host awake must be Boolean');this.hostAwake=value;this.updateDemand();}
 failed(error){
  this.error=String(error);this.healthy=false;this.resolveHealth({error:this.error});for(const p of this.pending.values())p.reject(Error(this.error));this.pending.clear();
  if(!this.disposed)this.dispose().catch(failure=>{this.cleanupError=String(failure);});
 }
 receive(data){
  if(data?.kind==='ready'){this.healthy=!this.disposed&&!this.error;this.cached=data.stats;this.resolveHealth({ready:true,engineVersion:data.engineVersion,stats:data.stats});return;}
  if(data?.kind==='error'){this.failed(data.error);return;}
  if(data?.kind==='rejected'){
   if(this.pending.has(data.request)){this.pending.get(data.request).reject(Error(data.error));this.pending.delete(data.request);}
   else{this.lastRejection=String(data.error);this.failed(data.error);}return;
  }
  if(data?.stats)this.cached=data.stats;const pending=this.pending.get(data?.request);if(pending){this.pending.delete(data.request);pending.resolve(data.stats??{disposed:true});}
 }
 set(index,value,property=false){this.alive();const effective=effectiveValue(index,value);const seconds=this.AC.currentTime,frame=this.frame(seconds);this.values[index]=value;this.effectiveValues[index]=effective;this.node.port.postMessage({kind:property?'property':'control',entries:[[index,effective]],frame,seconds,sequence:++this.sequence});}
 getNode=()=>this.node;
 connect=destination=>[].concat(destination).forEach(node=>this.node.connect(node));
 getThreshold=()=>this.values[0];
 getRatio=()=>this.values[2];
 setProperty(index,value){if(!Number.isInteger(index)||index<0||index>=5)throw Error('Invalid native compressor property identity');return this.set(index,value,true);}
 setThreshold=value=>this.set(0,value);
 setKnee=value=>this.set(1,value);
 setRatio=value=>this.set(2,value);
 setAttack=value=>this.set(3,value);
 setRelease=value=>this.set(4,value);
 requestMessage(kind,extra={}){
  const request=++this.request,promise=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(request);reject(Error(`Raw compressor ${kind} acknowledgement timed out`));},5000);
   this.pending.set(request,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
  });
  try{this.node.port.postMessage({kind,request,...extra});}catch(error){this.pending.get(request)?.reject(error);this.pending.delete(request);}return promise;
 }
 command(kind,extra={}){if(this.disposed||this.error)return Promise.reject(Error(this.error??'Disposed raw compressor'));return this.requestMessage(kind,extra);}
 requestStats=(includeTrace=false)=>this.command('stats',{includeTrace});
 flush=()=>this.command('flush');
 arm=()=>this.AC.state==='running'?this.flush():Promise.reject(Error('Resume the AudioContext before arming the raw compressor'));
 reset=()=>{const seconds=this.AC.currentTime;return this.command('reset',{seconds,frame:this.frame(seconds)});};
 reduction=()=>this.cached?.reductionDb??0;
 snapshot=()=>({version:1,profile:'nodes-compressor-step-e14de735-v1',constructorProfile:this.constructorProfile,settings:Object.fromEntries(NATIVE_COMPRESSOR_PARAMETERS.map(([key],i)=>[key,this.values[i]])),effectiveSettings:Object.fromEntries(NATIVE_COMPRESSOR_PARAMETERS.map(([key],i)=>[key,this.effectiveValues[i]]))});
 disconnectOutput(){const disconnect=this.originalDisconnect;this.originalDisconnect=null;this.edges=[];try{disconnect?.();}catch(error){this.cleanupError=String(error);}}
 releaseNode(node){
  for(const pending of this.pending.values())pending.reject(Error(this.error??'Disposed raw compressor'));this.pending.clear();this.disconnectOutput();
  try{node.port.close();}finally{node.port.onmessage=null;node.onprocessorerror=null;if(this.node===node)this.node=null;this.demand=null;}
 }
 dispose(){
  if(this.disposed)return this.disposal??Promise.resolve();this.disposed=true;this.healthy=false;this.resolveHealth({disposed:true});
  for(const pending of this.pending.values())pending.reject(Error(this.error??'Disposed raw compressor'));this.pending.clear();
  const node=this.node;if(!node)return this.disposal=Promise.resolve();this.disconnectOutput();
  if(this.AC.state==='closed'){try{node.port.postMessage({kind:'dispose'});}catch(error){this.cleanupError=String(error);}this.releaseNode(node);return this.disposal=Promise.resolve();}
  let request;const closed=()=>{if(this.AC.state==='closed'){this.pending.get(request)?.resolve({disposed:true});this.pending.delete(request);}};
  this.AC.addEventListener?.('statechange',closed);const promise=this.requestMessage('dispose');request=this.request;
  return this.disposal=promise.finally(()=>{this.AC.removeEventListener?.('statechange',closed);this.releaseNode(node);});
 }
}
export async function createRustCompressorFactory(context){const assets=await prepareNativeCompressorLive(context),factory=(ac,options={})=>{if(ac!==context)throw Error('Raw compressor factory belongs to another context');return new RustCompressor(ac,assets,options);};Object.defineProperty(factory,'engineVersion',{value:assets.manifest.version});return factory;}
