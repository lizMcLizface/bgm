// Runtime executor choice belongs to a context, never to a serialized song.
export function validateAudioEnvironment(environment,context){
 if(environment==null)return null;
 for(const key of ['ambienceOptions','weatherOfflineFactory','createInserts','createEffectsBus','classicSourceNodeFactory','rackPluginFactory','ordinaryCompressorFactory','echoFactory','rackDynamicsFactory','rackNativeFactory'])if(environment[key]!==undefined&&typeof environment[key]!=='function')throw Error('Invalid prepared runtime factory');
 if(environment.createCoreBackend!==undefined&&typeof environment.createCoreBackend!=='function')throw Error('Invalid prepared Core/FM factory');
 const predicates={sameContext:environment.context===context,version:environment.version===1,profile:environment.profile==='owned-active-host-v1',instrumentOptions:typeof environment.instrumentOptions==='function',prepareContext:typeof environment.prepareContext==='function',roleWanderFactory:typeof environment.roleWanderFactory==='function',iowaSourceBackend:environment.iowaSourceBackend==='owned-rust',voiceCompressorFactory:typeof environment.voiceFxOptions?.compressorFactory==='function',motionFactory:environment.voiceFxOptions?.motionFactory===undefined||typeof environment.voiceFxOptions.motionFactory==='function',shimmerFactory:environment.voiceFxOptions?.shimmerFactory===undefined||typeof environment.voiceFxOptions.shimmerFactory==='function'};
 if(Object.values(predicates).some(pass=>!pass)){
  const error=Error('Invalid context-bound audio environment'),describe=c=>({sampleRate:c?.sampleRate??null,state:c?.state??null,currentTime:c?.currentTime??null,type:c?.constructor?.name??null});
  error.diagnostics={predicates,failedPredicates:Object.keys(predicates).filter(key=>!predicates[key]),version:environment.version,profile:environment.profile,iowaSourceBackend:environment.iowaSourceBackend,factoryTypes:Object.fromEntries(['instrumentOptions','prepareContext','roleWanderFactory','rackDynamicsFactory','echoFactory','ordinaryCompressorFactory','classicSourceNodeFactory','createCoreBackend'].map(key=>[key,typeof environment[key]])),voiceCompressorFactoryType:typeof environment.voiceFxOptions?.compressorFactory,preparedContext:describe(environment.context),actualContext:describe(context)};throw error;
 }
 return environment;
}
export function nativeInstrumentEnvironment(environment,preset,context){
 if(!environment)return{};validateAudioEnvironment(environment,context);const options=environment.instrumentOptions(preset);
 if(!options||Object.keys(options).some(k=>!['sourceBackend','voiceCompressorFactory','pianoSourceFactory','ordinaryCompressorFactory','shimmerFactory','motionFactory'].includes(k))||!['native','owned-rust'].includes(options.sourceBackend)||typeof options.voiceCompressorFactory!=='function'||options.pianoSourceFactory!==undefined&&typeof options.pianoSourceFactory!=='function'||options.ordinaryCompressorFactory!==undefined&&typeof options.ordinaryCompressorFactory!=='function'||options.shimmerFactory!==undefined&&typeof options.shimmerFactory!=='function'||options.motionFactory!==undefined&&typeof options.motionFactory!=='function')throw Error('Invalid native instrument runtime options');
 return{...options};
}
export async function audioEnvironmentForContext(environment,context){return environment?validateAudioEnvironment(await environment.prepareContext(context),context):null;}

export function nativeInstrumentRuntimeKey(environment,preset,context){const {sourceBackend='native'}=nativeInstrumentEnvironment(environment,preset,context);return sourceBackend==='owned-rust'?`${sourceBackend}:${preset?.stringModel??''}`:sourceBackend;}
