import{prepareNativeRackNormal}from'./nativeRackNormalBrowser.js';
import{RustNativeRackNormal}from'./nativeRackNormalRust.js';
import{nativeRackNormalCalls}from'./nativeRackNormalCalls.js';
const IDENTIFIER=/^[a-f0-9]{16}$/;
/** Original four outer gains; the inner processor remains its independently accepted profile.
 * prepareInitial() acknowledges realtime initial targets before the stage is wired.
 * Offline construction never awaits an AudioWorklet callback before startRendering(). */
export class NativeRackExtraStage{
 constructor(context,assets,{kind,onError=()=>{},facadeVersion}={}){
  if(!['width','ring'].includes(kind)||typeof onError!=='function'||!IDENTIFIER.test(facadeVersion??''))throw Error('Invalid normal Width/Ring extra options');
  this.context=context;this.kind=kind;this.facadeVersion=facadeVersion;this.assets=assets;this.onError=onError;this.nodes=[];this.edges=[];this.disposed=false;this.error=null;this.settings=null;this.hostAwake=true;this.offline=typeof context.startRendering==='function';this.prepared=false;this.preparedSequence=-1;
  try{
   this.inner=new RustNativeRackNormal(context,assets,{kind,hostAwake:false,onError:error=>this.fail(error)});
   const gain=()=>{const n=context.createGain();this.nodes.push(n);return n;};
   this.input=gain();this.output=gain();this.through=gain();this.wet=gain();
   this.input.connect(this.inner.input);this.inner.output.connect(this.wet);this.wet.connect(this.output);this.input.connect(this.through);this.through.connect(this.output);
   const output=this.output,connect=output.connect.bind(output),disconnect=output.disconnect.bind(output);this.disconnectOutput=disconnect;
   output.connect=(...args)=>{this.alive();const value=connect(...args),edge={destination:args[0],output:args[1]??0,input:args[2]??0};if(!this.edges.some(e=>e.destination===edge.destination&&e.output===edge.output&&e.input===edge.input))this.edges.push(edge);try{this.updateDemand();}catch(error){this.fail(error);throw error;}return value;};
   output.disconnect=(...args)=>{const value=disconnect(...args);if(!args.length)this.edges=[];else if(typeof args[0]==='number')this.edges=this.edges.filter(e=>e.output!==args[0]);else this.edges=this.edges.filter(e=>!(e.destination===args[0]&&(args.length<2||e.output===args[1])&&(args.length<3||e.input===args[2])));if(!this.disposed&&!this.error)this.updateDemand();return value;};
   this.ready=Promise.resolve(this);this.health=this.inner.health.then(result=>{if(result.error)this.fail(result.error);return result;});
  }catch(error){this.fail(error);throw error;}
 }
 alive(){if(this.disposed||this.error)throw Error(this.error??'Disposed normal Width/Ring extra');}
 updateDemand(){this.inner.setHostAwake(this.hostAwake&&this.edges.length>0);}
 setHostAwake(value){this.alive();if(typeof value!=='boolean')throw Error('Normal extra demand must be Boolean');this.hostAwake=value;try{this.updateDemand();}catch(error){this.fail(error);throw error;}}
 patch(packet,initial=false){this.alive();if(typeof packet?.on!=='boolean'||typeof initial!=='boolean')throw Error('Normal Width/Ring requires a complete Boolean bypass packet');const settings=this.kind==='width'?{amount:packet.amount}:{freq:packet.freq,mix:packet.mix};nativeRackNormalCalls(this.kind,this.context.sampleRate,settings);
  // Inner preflight reserves the whole original4/3-call patch before either outer control changes.
  const before=this.inner.writer.sequence;try{this.inner.patch(settings,initial);const set=(param,value)=>initial?param.setValueAtTime(value,this.context.currentTime):param.setTargetAtTime(value,this.context.currentTime,.02);set(this.wet.gain,packet.on?1:0);set(this.through.gain,packet.on?0:1);this.settings=Object.freeze({...settings,on:packet.on});}catch(error){if(this.inner.disposed||this.inner.writer?.sequence!==before)this.fail(error);throw error;}
 }
 clear(){} // Original Width/Ring inner stages have no clear/reset action.
 prepareInitial(){this.alive();if(!this.settings)return Promise.reject(Error('Patch normal Width/Ring before preparation'));if(this.edges.length)return Promise.reject(Error('Prepare normal Width/Ring before connecting its output'));if(this.preparation)return this.preparation;if(this.prepared&&this.preparedSequence===this.inner.writer.sequence)return this.ready;if(this.offline||this.context.state==='suspended'){this.prepared=true;this.preparedSequence=this.inner.writer.sequence;return this.ready;}if(this.context.state!=='running')return Promise.reject(Error('Normal Width/Ring context is closed'));
  // Explicit zero-gain control warmup. Host demand stays false: no DSP or carrier clock advances.
  const pending=(async()=>{let sink,timer;try{sink=this.context.createGain();sink.gain.setValueAtTime(0,this.context.currentTime);this.inner.output.connect(sink);sink.connect(this.context.destination);const complete=(async()=>{for(;;){const sequence=this.inner.writer.sequence;await this.inner.flush();this.alive();this.preparedSequence=sequence;if(this.inner.writer.sequence===sequence)break;}return this;})();await Promise.race([complete,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Normal Width/Ring initial preparation timed out')),5000);})]);this.alive();this.prepared=true;return this;}catch(error){if(!this.disposed)this.fail(error);throw error;}finally{clearTimeout(timer);if(sink){try{this.inner.output?.disconnect(sink);}catch(e){this.cleanupError=String(e);}try{sink.disconnect();}catch(e){this.cleanupError=String(e);}}}})();this.preparation=pending;pending.finally(()=>{if(this.preparation===pending)this.preparation=null;}).catch(()=>{});return pending;
 }
 arm(){this.alive();if(!this.settings)return Promise.reject(Error('Patch normal Width/Ring before activation'));return this.offline||this.context.state==='suspended'?this.ready:this.inner.flush().then(()=>this);}

 requestStats=()=>{this.alive();return this.inner.requestStats();};
 snapshot(){this.alive();return{version:1,kind:'native-rack-extra.cold-settings',stage:this.kind,facadeVersion:this.facadeVersion,kernelVersion:this.assets.manifest.version,hostVersion:this.assets.host.version,settings:this.settings?{...this.settings}:null};}
 fail(error){if(this.error)return;this.error=String(error);try{this.onError(error instanceof Error?error:Error(this.error));}catch(e){this.callbackError=String(e);}this.dispose().catch(e=>this.cleanupError=String(e));}
 dispose(){if(this.disposed)return this.disposal??Promise.resolve();this.disposed=true;this.edges=[];for(const n of this.nodes){try{if(n===this.output)this.disconnectOutput?.();else n.disconnect();}catch(e){this.cleanupError=String(e);}}const close=Promise.resolve(this.inner?.dispose()),preparing=this.preparation;return this.disposal=preparing?Promise.allSettled([close,preparing]).then(([closed])=>{if(closed.status==='rejected')throw closed.reason;}):close;}
}
export async function prepareNormalRackNative(context){const assets=await prepareNativeRackNormal(context),base=(import.meta.env?.BASE_URL??'/')+'rack-native-normal-extra/',response=await fetch(base+'build.json',{cache:'no-store'});if(!response.ok)throw Error('Missing normal Width/Ring extra identity');const manifest=await response.json();if(manifest.api!==1||manifest.profile!=='native-rack-normal-extra-v1'||!IDENTIFIER.test(manifest.version??'')||manifest.kernelVersion!==assets.manifest.version||manifest.hostVersion!==assets.host.version||manifest.wasm!==assets.manifest.wasm)throw Error('Normal Width/Ring extra identity mismatch');
 const factory=(ac,options={})=>{if(ac!==context)throw Error('Normal Width/Ring extra factory belongs to another context');return new NativeRackExtraStage(ac,assets,{...options,facadeVersion:manifest.version});};Object.defineProperties(factory,{engineVersion:{value:manifest.version},facadeVersion:{value:manifest.version},kernelVersion:{value:assets.manifest.version},hostVersion:{value:assets.host.version},controlContract:{value:'original-per-lane-currentTime'},activationContract:{value:'offroute-realtime-muted-control-warmup;offline-prebooked'}});return Object.freeze(factory);
}
