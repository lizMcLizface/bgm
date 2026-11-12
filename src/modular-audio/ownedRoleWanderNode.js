import{createSourceDisposalFence}from'./sourceDisposalFence.js';
import processorUrl from './roleWander.worklet.js?worker&url';
import {loadOwnedMixerAssets} from './ownedMixerAudio.js';
import {roleWanderSpec,roleMotionSettings,validateRoleWanderSpec,saveRoleWanderSpec,loadRoleWanderSpec} from './ownedRoleWander.js';
const registered=new WeakMap(),actualOutputs=new WeakMap();
/** Private actual-host authority for one fixed stereo output. No Native unity
 * bridge or public metadata object can confer this ownership capability. */
export function captureOwnedRoleWanderSource(host,{outputIndex=0}={}){
 const actual=actualOutputs.get(host);if(!actual||!Number.isInteger(outputIndex)||outputIndex<0||outputIndex>=actual.buses)throw Error('Actual owned RoleWander output required');
 const check=()=>{actual.check();if(!actual.ready()||actual.context.state==='closed'||host.node!==actual.node||host.input!==actual.input||host.output!==actual.output||host.dispose!==actual.dispose)throw Error('Owned RoleWander output identity/readiness changed');return true;};check();
 return Object.freeze({node:actual.node,context:actual.context,channels:2,outputIndex,check,borrow(){check();if(actual.borrows.size>=8)throw Error('RoleWander output borrower bound');const token=Object.freeze({});actual.borrows.add(token);let released=false;return Object.freeze({source:actual.node,outputIndex,channels:2,profile:'continuous-nonsilent-audio-worklet-v1',check(){if(released)throw Error('Released RoleWander output borrow');return check();},release(){if(!released){released=true;actual.borrows.delete(token);}return Promise.resolve({released:true,clean:true});}});}});
}
export async function registerRoleWander(context){if(!registered.has(context)){const loading=context.audioWorklet.addModule(processorUrl);registered.set(context,loading);loading.catch(()=>{if(registered.get(context)===loading)registered.delete(context);});}await registered.get(context);}
/** Prepare once before constructing a normal Generator or an offline render.
 * Its returned synchronous factory has the original RoleWander interface.
 * Only pan/level DSP is replaced; native AudioNodes below are unity routing.
 */
export async function prepareOwnedRoleWander(context,{assets}={}){
 assets??=await loadOwnedMixerAssets();await registerRoleWander(context);
 const factory=(ctx,role,options={})=>{if(ctx!==context)throw Error('Role-motion factory belongs to a different context');return createOwnedRoleWanderNode(ctx,assets,role,options);};
 factory.prepareContext=ctx=>prepareOwnedRoleWander(ctx,{assets});
 return factory;
}
export function createOwnedRoleWanderNode(context,assets,role,{offset=0,smooth=true,settings={mode:'sine',enabled:false,period:60,panMin:-.6,panMax:.6,volume:.12},spec,startFrame}={}){
 spec=loadRoleWanderSpec(saveRoleWanderSpec(spec??roleWanderSpec(role,context.sampleRate,settings,{buses:5,offset,smooth,execution:typeof OfflineAudioContext!=='undefined'&&context instanceof OfflineAudioContext?'offline':'live'})));
 validateRoleWanderSpec(spec);if(spec.sampleRate!==context.sampleRate||spec.role!==role)throw Error('Role-motion host contract mismatch');
 if(startFrame!==undefined&&(!Number.isSafeInteger(startFrame)||startFrame<0||startFrame%128))throw Error('Role-motion start must be a canonical frame');
 const node=new AudioWorkletNode(context,'calmbgm-role-wander',{numberOfInputs:spec.buses,numberOfOutputs:spec.buses,outputChannelCount:Array(spec.buses).fill(2),channelCount:2,channelCountMode:'max',channelInterpretation:'discrete',processorOptions:{module:assets.module,spec,startFrame}});
 const pending=new Map(),followers=new Set();let request=0,targets={...spec.settings},disposed=false,failed=null,disposal=null,readySeen=false;const outputBorrows=new Set();
 const fence=createSourceDisposalFence(context,node,{label:'Role motion'});node.sourceDisposalStatus=fence.status;
 let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});ready.catch(()=>{});
 const initialTimer=setTimeout(()=>fail(Error('Role-motion startup timeout')),10000);
 function fail(error){failed=error;clearTimeout(initialTimer);readyReject(error);for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();}
 node.onprocessorerror=()=>{fence.fail(Error('Role-motion AudioWorklet failed'));fail(Error('Role-motion AudioWorklet failed'));};
 node.port.onmessage=({data})=>{if(data.type==='disposed'){fence.receive(data);return;}if(data.type==='ready'){readySeen=true;clearTimeout(initialTimer);readyResolve(data);}else if(data.type==='error'){fence.fail(Error(data.error));fail(Error(data.error));}const p=pending.get(data.request);if(p){clearTimeout(p.timer);pending.delete(data.request);p.resolve(data);}};
 const send=data=>new Promise((resolve,reject)=>{if(disposed||failed)return reject(failed??Error('Role motion disposed'));if(pending.size>=64)return reject(Error('Role-motion host capacity exceeded'));const id=++request,timer=setTimeout(()=>{pending.delete(id);reject(Error('Role-motion control timeout'));},10000);pending.set(id,{resolve,reject,timer});node.port.postMessage({...data,request:id});});
 const route=bus=>{const input=context.createGain(),output=context.createGain();input.connect(node,0,bus);node.connect(output,bus,0);const r={input,output,dispose(){input.disconnect();node.disconnect(output);output.disconnect();}};return r;};
 const main=route(0);
 const host={input:main.input,output:main.output,node,ready,role,backend:'owned-rust',disposalStatus:fence.status,
  apply(wander,{when=context.currentTime}={}){const next=roleMotionSettings(wander,role);if(!Number.isFinite(when)||when<0)throw Error('Invalid role-motion host clock');targets={...next};const promise=send({type:'settings',frame:Math.ceil(when*context.sampleRate/128)*128,settings:next});promise.catch(fail);return promise;},
  createFollower(){if(disposed)throw Error('Role motion disposed');if(followers.size>=spec.buses-1)throw Error('Role-motion follower capacity exceeded');const bus=Array.from({length:spec.buses-1},(_,i)=>i+1).find(b=>![...followers].some(f=>f.bus===b)),r=route(bus);let released=false;const follower={input:r.input,output:r.output,bus,dispose(){if(released)return;released=true;r.dispose();followers.delete(follower);}};followers.add(follower);return follower;},
  stats:()=>send({type:'stats'}),check(){if(failed)throw failed;if(disposed)throw Error('Role motion disposed');},
  snapshot(){return roleWanderSpec(role,context.sampleRate,targets,{buses:spec.buses,offset:spec.offset,smooth:spec.smooth,execution:spec.execution});},
  dispose(){if(disposal)return disposal;if(outputBorrows.size&&context.state!=='closed')throw Object.assign(Error('Release actual output borrows before RoleWander destruction'),{code:'ROLE_WANDER_BORROWS_HELD'});disposed=true;fail(Error('Role motion disposed'));const issues=[];for(const action of[...[...followers].map(f=>()=>f.dispose()),()=>main.dispose(),()=>node.disconnect()])try{action();}catch(error){issues.push(error);}disposal=Promise.allSettled([fence.dispose()]).then(results=>{if(results[0].status==='rejected')issues.push(results[0].reason);if(issues.length)throw new AggregateError(issues,'Role-motion disposal failed');});disposal.catch(()=>{});return disposal;}
 };actualOutputs.set(host,{node,context,buses:spec.buses,input:main.input,output:main.output,dispose:host.dispose,borrows:outputBorrows,check:host.check,ready:()=>readySeen});return host;
}
