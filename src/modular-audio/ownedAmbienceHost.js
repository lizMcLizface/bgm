import{prepareOwnedNormalWeather}from'../app/engine/weatherLiveOwned.js';
import{OwnedWeatherOffline}from'../app/engine/weatherOwnedOffline.js';
import{loadWeatherWorkletAssets}from'./ownedWeatherWorklet.js';
import{loadAmbienceLoopWorkerAssets,createAmbienceLoopPreparer}from'./ambienceLoopWorker.js';
import{prepareAmbienceBankPool}from'./ambienceBankNode.js';
import{prepareAmbiencePlayback}from'./ambiencePlaybackNode.js';
import{createAmbienceResourceSession}from'./ambienceResourceSession.js';
export async function prepareOwnedAmbienceHost(context,{loopPlayback='native'}={}){
 if(!['native','owned-pool'].includes(loopPlayback))throw Error('Unsupported normal ambience loop playback profile');
 const offline=typeof context.startRendering==='function';
 // Refuse an active first arena before loading/preparing unrelated routes.
 const pool=loopPlayback==='owned-pool'&&!offline?await prepareAmbienceBankPool(context):null;
 const immutableFactory=loopPlayback==='owned-pool'&&offline?await prepareAmbiencePlayback(context):null;
 const[weatherRouteFactory,weather,loops]=await Promise.all([prepareOwnedNormalWeather(context),loadWeatherWorkletAssets(),loadAmbienceLoopWorkerAssets()]);
 const response=await fetch(`${import.meta.env.BASE_URL}weather/normal-host-build.json`);if(!response.ok)throw Error('Missing owned ambience host provenance');const manifest=await response.json();if(manifest.api!==1||manifest.weatherWasm!==weather.manifest.wasm||manifest.loopsWasm!==loops.manifest.wasm||pool&&manifest.poolVersion!==pool.version||immutableFactory&&manifest.readerVersion!==immutableFactory.version)throw Error('Stale owned ambience host assets');
 const weatherOfflineFactory=(rate,shape,levels,seed)=>new OwnedWeatherOffline(weather.module,rate,shape,levels,seed);
 return{weatherOfflineFactory,options(ctx){if(ctx!==context)throw Error('Ambience factory belongs to another context');const preparer=createAmbienceLoopPreparer({loadAssets:async()=>loops}),common={weatherRouteFactory,weatherOfflineFactory,loopRenderer:(id,rate,params)=>preparer.prepare(id,rate,params).then(r=>r.channels)};
  if(loopPlayback==='native')return{...common,disposeSources:()=>preparer.dispose()};
  const session=createAmbienceResourceSession(context,{pool,immutableFactory,preparer});return{...common,loopResourceFactory:session.entry,prepareSourcesOffline:session.prepareOffline,disposeSources:()=>session.dispose().finally(()=>preparer.dispose())};
 },disposeContext:()=>pool?.dispose()??Promise.resolve({acknowledged:true}),warmup:options=>pool?pool.warmup(options):Promise.resolve(),status:()=>pool?.status()??{profile:loopPlayback==='native'?'native':'owned-immutable'},stats:()=>pool?pool.stats():Promise.resolve({profile:loopPlayback==='native'?'native':'owned-immutable'}),versions:{host:manifest.version,weather:weather.version,loops:loops.manifest.version,...(loopPlayback==='owned-pool'?{loopPlayback:pool?.version??immutableFactory.version}:{})},boundaries:loopPlayback==='native'?'Owned weather source and loop preparation; existing native loop playback, spatial processing and level wander':'Owned original weather and loop source playback; existing spatial processing, gain fades and level wander'};
}
