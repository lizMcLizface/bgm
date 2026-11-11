// Runtime executor choice belongs to a context, never to a serialized song.
export function validateAudioEnvironment(environment,context){
 if(environment==null)return null;
 for(const key of ['ambienceOptions','weatherOfflineFactory','createInserts','createEffectsBus','classicSourceNodeFactory'])if(environment[key]!==undefined&&typeof environment[key]!=='function')throw Error('Invalid prepared runtime factory');
 if(environment.createCoreBackend!==undefined&&typeof environment.createCoreBackend!=='function')throw Error('Invalid prepared Core/FM factory');
 if(environment.version!==1||environment.profile!=='owned-active-host-v1'||environment.context!==context||typeof environment.instrumentOptions!=='function'||typeof environment.prepareContext!=='function'||typeof environment.roleWanderFactory!=='function'||environment.iowaSourceBackend!=='owned-rust'||typeof environment.voiceFxOptions?.compressorFactory!=='function')throw Error('Invalid context-bound audio environment');
 return environment;
}
export function nativeInstrumentEnvironment(environment,preset,context){
 if(!environment)return{};validateAudioEnvironment(environment,context);const options=environment.instrumentOptions(preset);
 if(!options||Object.keys(options).some(k=>!['sourceBackend','voiceCompressorFactory'].includes(k))||!['native','owned-rust'].includes(options.sourceBackend)||typeof options.voiceCompressorFactory!=='function')throw Error('Invalid native instrument runtime options');
 return{...options};
}
export async function audioEnvironmentForContext(environment,context){return environment?validateAudioEnvironment(await environment.prepareContext(context),context):null;}

export function nativeInstrumentRuntimeKey(environment,preset,context){const {sourceBackend='native'}=nativeInstrumentEnvironment(environment,preset,context);return sourceBackend==='owned-rust'?`${sourceBackend}:${preset?.stringModel??''}`:sourceBackend;}
