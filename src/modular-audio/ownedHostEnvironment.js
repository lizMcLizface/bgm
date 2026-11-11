import{prepareNormalRackNative}from'./nativeRackNormalExtra.js';
import{prepareOwnedShimmer}from'../nodes/shimmerRust.js';
import{prepareNativeEchoLive}from'./nativeEchoLiveNode.js';
import{prepareNormalRackDynamics}from'./rackDynamicsNormal.js';
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
 const [roleWanderFactory,voiceCompressorFactory,createCoreBackend,ambience,buses,classicSourceNodeFactory,rackPluginFactory,pianoSourceFactory,ordinaryCompressorFactory,echoFactory,rackDynamicsFactory,shimmerFactory,rackNativeFactory]=await Promise.all([prepareOwnedRoleWander(context),createLiveVoiceCompressorFactory(context),prepareOwnedCoreLive(context),prepareOwnedAmbienceHost(context),prepareOwnedBusHosts(context),prepareOwnedClassicLive(context),prepareOwnedRackPlugins(context),prepareOwnedPianoStreaming(context),createRustCompressorFactory(context),prepareNativeEchoLive(context),prepareNormalRackDynamics(context),prepareOwnedShimmer(context),prepareNormalRackNative(context)]);
 const environment={version:1,profile:'owned-active-host-v1',context,roleWanderFactory,createCoreBackend,classicSourceNodeFactory,rackPluginFactory,ordinaryCompressorFactory,echoFactory,rackDynamicsFactory,rackNativeFactory,createInserts:buses.createInserts,createEffectsBus:buses.createEffectsBus,ambienceOptions:ambience.options,weatherOfflineFactory:ambience.weatherOfflineFactory,iowaSourceBackend:'owned-rust',voiceFxOptions:Object.freeze({compressorFactory:voiceCompressorFactory,shimmerFactory}),
  instrumentOptions:preset=>({sourceBackend:(isOwnedPianoPreset(preset)||isOwnedPluckedPreset(preset))?'owned-rust':'native',voiceCompressorFactory,ordinaryCompressorFactory,shimmerFactory,...(isOwnedPianoPreset(preset)?{pianoSourceFactory}:{})}),
  prepareContext:next=>prepareOwnedHostEnvironment(next),
  boundaries:Object.freeze({classic:'owned original fourteen-model CLASSIC sources; existing external rack',coreFm:'owned original Core/FM kernels',plucked:'owned original KS source and live demand/control histories',piano:'owned original piano preparation and shared physical live-control source',iowa:'owned Rust source',compressor:'owned Rust VoiceCompressor and ordinary Instrument mix/limiter; original demand and initialization',rolePanLevel:'owned Rust',insertsFdn:'owned original instrument inserts, FDN and original native echo in prepared routes; existing routing retained',rackPlugins:'owned original Crusher/Pitch/ZPlane with original native control/bypass/routing',rackDynamics:'optional owned original compressor/limiter with per-lane currentTime and bounded acknowledged calls',rackNative:'owned original Width/Ring with independent per-lane clocks and offroute acknowledged preparation; Filter remains Native',voiceShimmer:'owned original Shimmer with original lazy message and pull lifecycle; Freeze capture remains separate',otherEffects:'existing Tape/Motion/Freeze host policy',rooms:'existing host policy',ambience:ambience.boundaries,defaultChanged:false})};
 return Object.freeze(environment);
}
