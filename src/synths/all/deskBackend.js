import {createMixerAudio,createDeskLimiter} from './mixerAudio';
import {createOwnedMixerAudio,loadOwnedMixerAssets} from '../../modular-audio/ownedMixerAudio';
export function deskBackendChoice(value='native'){if(!['native','owned'].includes(value))throw Error('Unsupported desk backend');return value;}
// Prepare off-route. The caller alone owns committing Generator connections.
export async function prepareDeskBackend(context,roles,{backend='native',state=null}={}){
 backend=deskBackendChoice(backend);let desk,limiter;
 try{
  if(backend==='owned'){const assets=await loadOwnedMixerAssets();desk=await createOwnedMixerAudio(context,assets,roles,{state});desk.backendInfo={backend,version:assets.manifest.version,wasm:assets.manifest.wasm,latencyFrames:Math.ceil(context.sampleRate*.003)};}
  else{limiter=await createDeskLimiter(context);desk=createMixerAudio(context,roles,limiter);desk.patch(state);desk.backendInfo={backend,version:'native-desk-v1',latencyFrames:Math.ceil(context.sampleRate*.003)};}
  return desk;
 }catch(error){if(desk)desk.dispose();else if(limiter){limiter.port.postMessage({dispose:true});limiter.disconnect();}throw error;}
}
