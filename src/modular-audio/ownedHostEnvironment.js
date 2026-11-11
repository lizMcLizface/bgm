import {prepareOwnedRoleWander}from'./ownedRoleWanderNode.js';
import {createLiveVoiceCompressorFactory}from'../nodes/voiceCompressorRust.js';
import {prepareOwnedAmbienceHost}from'./ownedAmbienceHost.js';
import {prepareOwnedClassicLive}from'./ownedClassicLive.js';
import {prepareOwnedBusHosts}from'./ownedBusLive.js';
import {prepareOwnedRackPlugins}from'./ownedRackPlugins.js';
import {prepareOwnedCoreLive}from'./ownedCoreLive.js';
import {isOwnedPianoPreset}from'../app/engine/pianoLiveSource.js';
import {isOwnedPluckedPreset}from'../app/engine/pluckedLiveSource.js';
/** Prepared runtime seams, not a claim that every native host DSP stage is ported.
 * Existing source/effect sounds and song settings remain the caller's authority.
 */
export async function prepareOwnedHostEnvironment(context){
 const [roleWanderFactory,voiceCompressorFactory,createCoreBackend,ambience,buses,classicSourceNodeFactory,rackPluginFactory]=await Promise.all([prepareOwnedRoleWander(context),createLiveVoiceCompressorFactory(context),prepareOwnedCoreLive(context),prepareOwnedAmbienceHost(context),prepareOwnedBusHosts(context),prepareOwnedClassicLive(context),prepareOwnedRackPlugins(context)]);
 const environment={version:1,profile:'owned-active-host-v1',context,roleWanderFactory,createCoreBackend,classicSourceNodeFactory,rackPluginFactory,createInserts:buses.createInserts,createEffectsBus:buses.createEffectsBus,ambienceOptions:ambience.options,weatherOfflineFactory:ambience.weatherOfflineFactory,iowaSourceBackend:'owned-rust',voiceFxOptions:Object.freeze({compressorFactory:voiceCompressorFactory}),
  instrumentOptions:preset=>({sourceBackend:(isOwnedPianoPreset(preset)||isOwnedPluckedPreset(preset))?'owned-rust':'native',voiceCompressorFactory}),
  prepareContext:next=>prepareOwnedHostEnvironment(next),
  boundaries:Object.freeze({classic:'owned original fourteen-model CLASSIC sources; existing external rack',coreFm:'owned original Core/FM kernels',plucked:'owned original KS source and live demand/control histories',piano:'owned Rust source',iowa:'owned Rust source',compressor:'owned Rust live lifecycle',rolePanLevel:'owned Rust',insertsFdn:'owned original instrument inserts and FDN; original native echo/routing retained',rackPlugins:'owned original Crusher/Pitch/ZPlane with original native control/bypass/routing',otherEffects:'existing host policy',rooms:'existing host policy',ambience:ambience.boundaries,defaultChanged:false})};
 return Object.freeze(environment);
}
