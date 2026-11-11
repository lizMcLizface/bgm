import {prepareOwnedRoleWander}from'./ownedRoleWanderNode.js';
import {createLiveVoiceCompressorFactory}from'../nodes/voiceCompressorRust.js';
import {prepareOwnedAmbienceHost}from'./ownedAmbienceHost.js';
import {prepareOwnedClassicLive}from'./ownedClassicLive.js';
import {prepareOwnedBusHosts}from'./ownedBusLive.js';
import {prepareOwnedRackPlugins}from'./ownedRackPlugins.js';
import {prepareOwnedCoreLive}from'./ownedCoreLive.js';
import {isOwnedPianoPreset}from'../app/engine/pianoLiveSource.js';
import {isOwnedPluckedPreset}from'../app/engine/pluckedLiveSource.js';
import {createRustCompressorFactory}from'../nodes/compressorRust.js';
import {prepareOwnedPianoStreaming}from'../app/engine/pianoStreamingSource.js';
/** Prepared runtime seams, not a claim that every native host DSP stage is ported.
 * Existing source/effect sounds and song settings remain the caller's authority.
 */
export async function prepareOwnedHostEnvironment(context){
 const [roleWanderFactory,voiceCompressorFactory,createCoreBackend,ambience,buses,classicSourceNodeFactory,rackPluginFactory,pianoSourceFactory,ordinaryCompressorFactory]=await Promise.all([prepareOwnedRoleWander(context),createLiveVoiceCompressorFactory(context),prepareOwnedCoreLive(context),prepareOwnedAmbienceHost(context),prepareOwnedBusHosts(context),prepareOwnedClassicLive(context),prepareOwnedRackPlugins(context),prepareOwnedPianoStreaming(context),createRustCompressorFactory(context)]);
 const environment={version:1,profile:'owned-active-host-v1',context,roleWanderFactory,createCoreBackend,classicSourceNodeFactory,rackPluginFactory,createInserts:buses.createInserts,createEffectsBus:buses.createEffectsBus,ambienceOptions:ambience.options,weatherOfflineFactory:ambience.weatherOfflineFactory,iowaSourceBackend:'owned-rust',voiceFxOptions:Object.freeze({compressorFactory:voiceCompressorFactory}),
  instrumentOptions:preset=>({sourceBackend:(isOwnedPianoPreset(preset)||isOwnedPluckedPreset(preset))?'owned-rust':'native',voiceCompressorFactory,ordinaryCompressorFactory,...(isOwnedPianoPreset(preset)?{pianoSourceFactory}:{})}),
  prepareContext:next=>prepareOwnedHostEnvironment(next),
  boundaries:Object.freeze({classic:'owned original fourteen-model CLASSIC sources; existing external rack',coreFm:'owned original Core/FM kernels',plucked:'owned original KS source and live demand/control histories',piano:'owned original piano preparation and shared physical live-control source',iowa:'owned Rust source',compressor:'owned Rust VoiceCompressor and ordinary Instrument mix/limiter; original demand and initialization',rolePanLevel:'owned Rust',insertsFdn:'owned original instrument inserts and FDN; original native echo/routing retained',rackPlugins:'owned original Crusher/Pitch/ZPlane with original native control/bypass/routing',otherEffects:'existing host policy',rooms:'existing host policy',ambience:ambience.boundaries,defaultChanged:false})};
 return Object.freeze(environment);
}
