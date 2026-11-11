import {vi,describe,it,expect} from 'vitest';

const mocks = vi.hoisted(() => ({ racks: [], sources: [], failPercussion:false,monitors:[],rackGate:null,ownedAssetFailure:false,ownedPatchFailure:false,ownedHealthFailure:false,ownedDesks:[] }));
vi.mock('../../app/Generator', () => {
 const roles = Object.fromEntries(['lead','counter','rhythm','pad','bass'].map(role => [role,{preset:'Soft Pad',polyphony:8}]));
 return { ROLES: roles, default: class {
  constructor() {
   const param=value=>({value,cancelScheduledValues:vi.fn(),setTargetAtTime:vi.fn()});
   const audioNode=()=>({gain:param(1),frequency:param(1000),Q:param(1),pan:param(0),connect:vi.fn(),disconnect:vi.fn()});
   this.settings={...defaultSettings(),layers:'combined',drumKit:{...defaultDrumKit(),room:.16}}; this.AC={currentTime:0,sampleRate:48000,destination:{},createGain:audioNode,createBiquadFilter:audioNode,createStereoPanner:audioNode,createChannelSplitter:audioNode,createChannelMerger:audioNode};
   this.output=audioNode();this.levelTrim=audioNode();this.ambienceOut=audioNode();
   const node=()=>({connect:vi.fn(),disconnect:vi.fn()});
   this.roles=Object.fromEntries([...Object.keys(roles),'perc'].map(role=>[role,{...(role==='perc'?{}:{tone:node()}),gain:node(),wander:{input:node(),output:node(),dispose:vi.fn()},instrument:{output:node(),connect:vi.fn(),dispose:vi.fn(),applyPreset:vi.fn(),setKit:vi.fn(),setSpec:vi.fn(),setValues:vi.fn(),setRack:vi.fn(),scheduleNote:vi.fn(),hitTrack:vi.fn(),polyphony:8}}]));
  }
  async setRoleSource(role,source,name) { mocks.sources.push({role,source,name});this.roles[role].instrument.preset=structuredClone(source); }
  async setPercussionSource(source) { if(mocks.failPercussion)throw Error('kit unavailable');mocks.sources.push({role:'perc',source});this.roles.perc.machine=!!source; }
  async loadPercussionVoice(id) {this.settings.drums={...this.settings.drums,kit:id};}
  setMany(patch) {Object.assign(this.settings,patch);}
  replan() {}
  loadRolePreset() {}
  setRoleParam=vi.fn((role,key,value)=>{this.roles[role].instrument.preset[key]=value;});
  getRolePreset(role){return {...this.roles[role].instrument.preset};}
  stopAll() {}
 }};
});
vi.mock('./mixerAudio',async importOriginal=>({...await importOriginal(),createDeskLimiter:async()=>({connect:vi.fn(),disconnect:vi.fn(),port:{postMessage:vi.fn()}})}));
vi.mock('../ensemble/sources', () => ({
 matchedLevel:async()=>1,
 soundSource:sound=>sound.synth==='fm'||sound.synth==='poly'?{diy:sound}:{classics:sound},
}));
vi.mock('../effects/graph', () => ({
 createRack: async (_context,values,options) => {
  const rack={input:{},connect:vi.fn(),patch:vi.fn(),dispose:vi.fn(),armRuntime:vi.fn(async()=>{}),values,options};
  mocks.racks.push(rack);if(mocks.rackGate)await mocks.rackGate;return rack;
 },
}));
vi.mock('../../modular-audio/ownedMixerAudio',()=>({
 loadOwnedMixerAssets:async()=>{if(mocks.ownedAssetFailure)throw Error('owned asset unavailable');return {manifest:{version:'owned-test',wasm:'test-sha'}};},
 createOwnedMixerAudio:async(context,_assets,roles)=>{const desk={channels:Object.fromEntries([...roles,'headroom','ambience'].map(id=>[id,{input:context.createGain(),output:context.createGain()}])),input:context.createGain(),output:context.createGain(),patch:vi.fn(async()=>{if(mocks.ownedPatchFailure)throw Error('owned control failed');}),check:vi.fn(()=>{if(mocks.ownedHealthFailure)throw Error('owned processor failed');}),dispose:vi.fn()};mocks.ownedDesks.push(desk);return desk;},
}));
vi.mock('../../audio/bus',()=>({masterBus:{connect:vi.fn(),disconnect:vi.fn()}}));
vi.mock('../effects/outputMonitor',()=>({createOutputMonitor:async()=>{const monitor={node:{connect:vi.fn()},requestScope:vi.fn(),dispose:vi.fn()};mocks.monitors.push(monitor);return monitor;}}));

import {createHost,synthForPreset,patchesOf,drumPatches,sceneDrumPatch} from './host';
import {SYNTHS} from '../models';
import {BROWSABLE_SCENES,sceneSettings,sceneVoiceSpec} from '../../app/scenes';
import {chainUnits} from '../effects/order';
import {nativeRackDefaults} from '../effects/nativeRacks';
import {cleanRack} from '../effects/params';
it('closes source leases on host disposal without moving legacy source or mixer ownership',()=>{const h=createHost(BROWSABLE_SCENES[0]),instrument=h.g.roles.lead.instrument;instrument.voice={spec:{kind:'subtractive'},patch:{kind:'subtractive',global:{gain:.2},layers:[]},sourceInput:{}};const close=vi.fn(),lease=h.openSourceStem('lead',close);expect(lease.input).toBe(instrument.voice.sourceInput);lease.assertCurrent();expect(instrument.silence).toBeUndefined();h.dispose();expect(close).toHaveBeenCalledTimes(1);expect(()=>lease.assertCurrent()).toThrow();});
it('describes eligible and unsupported preview voices without changing their backend or leasing a stem',()=>{const h=createHost(BROWSABLE_SCENES[0]),i=h.g.roles.lead.instrument;i.voice={spec:{kind:'subtractive'},patch:{kind:'subtractive',global:{gain:.2},layers:[]},sourceInput:{}};expect(h.sourcePreviewStatus('lead')).toEqual({eligible:true,kind:'subtractive'});expect(h.sourcePreviewStatus('pad').eligible).toBe(false);expect(i.silence).toBeUndefined();expect(i.voice.sourceInput).toEqual({});h.dispose();expect(h.sourcePreviewStatus('lead').eligible).toBe(false);});
it('leases actual single and stacked classic outputs with host/tuning lifetime guards and no backend change',()=>{
 const h=createHost(BROWSABLE_SCENES[0]),i=h.g.roles.lead.instrument,live={sourceInput:{},sourceRevision:0},snapshot=(s)=>({version:1,model:s.model,polyphony:8,parameters:(s.params.toEnginePairs??s.params.toPairs)(s.presets[0].values),controls:[],revision:0});
 Object.assign(i,{preset:{classics:{synth:'juno',values:SYNTHS.juno.presets[0].values}},live,lives:[live],held:new Map(),captureSource:()=>snapshot(SYNTHS.juno),tailSeconds:()=>2,holdSourceInput:vi.fn(()=>vi.fn())});
 expect(h.sourcePreviewStatus('lead')).toEqual({eligible:true,kind:'classic'});const single=h.openSourceStem('lead');expect(single.input).toBe(live.sourceInput);single.activate();expect(i.holdSourceInput).toHaveBeenCalledOnce();single.release();
 i.preset={classics:{synth:'minimoog',values:SYNTHS.minimoog.presets[0].values}};i.lives=[live,{sourceInput:{},sourceRevision:0}];i.captureSources=()=>i.lives.map(()=>snapshot(SYNTHS.minimoog));i.holdSourceInputs=vi.fn(()=>vi.fn());expect(h.sourcePreviewStatus('lead')).toEqual({eligible:true,kind:'classic-composite'});
 const closed=vi.fn(),stack=h.openSourceStem('lead',closed);expect(stack.inputs).toEqual(i.lives.map(l=>l.sourceInput));stack.activate();expect(i.holdSourceInputs).toHaveBeenCalledOnce();h.g.roles.lead.sourceRevision=7;expect(()=>stack.assertCurrent()).toThrow('host');h.dispose();expect(closed).toHaveBeenCalledOnce();
});
it('leases an actual native plucked synthMix input without moving shared effects or starting legacy notes',()=>{
 const h=createHost(BROWSABLE_SCENES[0]),i=h.g.roles.lead.instrument,input={},filter={getType:()=> 'lowpass',getConfiguredFreq:()=>1200,getConfiguredQ:()=>0},release=vi.fn(),native={AC:h.g.AC,preset:{stringModel:'plucked',stringDecay:1.9,stringDamping:.55,stringPosition:.17,stringBody:.3,stringResonance:.7,stringBodyType:'guitar',stringSeed:41},polyphony:2,voices:Array.from({length:2},()=>({filter,volume:{getGain:()=>Math.fround(.2)}})),held:new Map(),busyUntil:[0,0],gainEnv:{attack:.003,decay:.12,sustain:.78,release:.32,hold:0,holdLevel:1},filterEnv:{attack:0,decay:.18,release:0,amount:1600},noteInfo:m=>({freq:440*2**((m-69)/12)}),synthMix:{getNode:()=>input},holdSourceInput:vi.fn(()=>release)};i.voice={native};expect(h.sourcePreviewStatus('lead')).toEqual({eligible:true,kind:'plucked'});expect(native.holdSourceInput).not.toHaveBeenCalled();const l=h.openSourceStem('lead');expect(l.input).toBe(input);const stop=l.activate();expect(native.holdSourceInput).toHaveBeenCalledOnce();expect(i.scheduleNote).not.toHaveBeenCalled();stop();expect(release).toHaveBeenCalledOnce();native.preset.breathAmount=.1;expect(h.sourcePreviewStatus('lead').eligible).toBe(false);l.release();h.dispose();
});
it('leases only the actual ready Wasm kit at the existing dry role input and invalidates kit/revision changes',()=>{
 const h=createHost(BROWSABLE_SCENES[0]),r=h.g.roles.perc,i=r.instrument;expect(h.sourcePreviewStatus('perc').eligible).toBe(false);Object.assign(i,{kind:'percussion',module:new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0])),node:{},kit:{...defaultDrumKit(),room:0},voicePreset:'hand',model:'hand',hitCount:19});expect(h.sourcePreviewStatus('perc')).toEqual({eligible:true,kind:'percussion'});const close=vi.fn(),l=h.openSourceStem('perc',close);expect(l.input).toBe(r.gain);expect(l.kit.voice).toBe('hand');expect(l.hitBase).toBe(19);i.hitCount++;l.assertCurrent();i.kit.tom.level=.2;expect(()=>l.assertCurrent()).toThrow('source changed');i.kit.tom.level=1;r.sourceRevision=1;expect(()=>l.assertCurrent()).toThrow('host');r.machine=true;expect(h.sourcePreviewStatus('perc').reason).toContain('Classic');h.dispose();expect(close).toHaveBeenCalledOnce();
});
import {WASM_PRESETS,wasmVoiceById} from '../../synth-lab/voiceLibrary';
import {instrumentRack,mixerRack} from './mixerEffects';
import {defaultSettings} from '../../app/settings';
import {defaultDrumKit} from '../../app/percussion';
import {masterBus} from '../../audio/bus';

describe('all-page sound host', () => {
 it('edits a generator voice on the active instrument and restores its edited preset',async()=>{
  const original=createHost(BROWSABLE_SCENES[0]),restored=createHost(BROWSABLE_SCENES[0]);
  try{
   await original.applySceneVoices();await original.setPreset('lead','custom','calmbgm',{gainAttack:.1,masterVolume:.7});
   await original.editNative('lead',{gainAttack:.5,masterVolume:.4});
   expect(original.g.setRoleParam).toHaveBeenCalledWith('lead','gainAttack',.5);
   const saved=structuredClone(original.snapshotSounds());
   expect(saved.lead.preset).toMatchObject({gainAttack:.5,masterVolume:.4});
   await restored.restoreSounds(saved);
   expect(restored.g.getRolePreset('lead')).toMatchObject({gainAttack:.5,masterVolume:.4,reverbAmount:0,mixerSpaceMoved:true});
   restored.note('lead',60,1,.2,.8);
   expect(restored.g.roles.lead.instrument.scheduleNote).toHaveBeenCalledWith(60,1,.2,.8);
  }finally{original.dispose();restored.dispose();}
 });
 it('forwards drum-machine tune and decay locks with the scheduled hit time',async()=>{
  const h=createHost(BROWSABLE_SCENES[0]);try{
   await h.setSound('perc',{synth:'tr808'});
   h.drum({drum:0,velocity:.5,duration:1,params:{tune:.2,decay:-.3}},2,.1);
   expect(h.g.roles.perc.instrument.hitTrack).toHaveBeenLastCalledWith('bd',0,2,.5,{tune:.2,decay:-.3});
  }finally{h.dispose();}
 });
 it('restores linked edited voices and external patch values and levels',async()=>{
  const host=createHost(BROWSABLE_SCENES[0]),patch=SYNTHS.poly.presets[0];
  try{
   const key=Object.keys(patch.values)[0],value=patch.values[key];
   await host.applyFrontPageLink({scene:null,search:'',share:{presets:{
    lead:{external:{synth:'poly',name:patch.name,values:{[key]:value},level:.37}},
    bass:{edit:{name:'Soft Pad',values:{masterVolume:.4}}},
   }}});
   expect(host.soundOf('lead')).toMatchObject({synth:'poly',name:patch.name,level:.37,values:{[key]:value}});
   expect(mocks.sources.findLast(s=>s.role==='bass').source.masterVolume).toBe(.4);
  }finally{host.dispose();}
 });
 it('taps the master bus without changing the audible route and disconnects only its own monitor',async()=>{
  const host=createHost(BROWSABLE_SCENES[0]);
  const tap=await host.openMonitor(),monitor=mocks.monitors.at(-1);
  expect(masterBus.connect).toHaveBeenCalledWith(monitor.node);
  const silent=monitor.node.connect.mock.calls[0][0];
  expect(silent.gain.value).toBe(0);
  expect(silent.connect).toHaveBeenCalledWith(host.g.AC.destination);
  tap.dispose();tap.dispose();
  expect(masterBus.disconnect).toHaveBeenCalledWith(monitor.node);
  expect(monitor.dispose).toHaveBeenCalledOnce();
  expect(silent.disconnect).toHaveBeenCalledOnce();
  host.dispose();
 });
 it('groups identical scene kits while preserving every distinct configuration',()=>{
  const options=drumPatches('scene'),byId=new Map(options.map(option=>[option.id,BROWSABLE_SCENES.find(scene=>scene.name===option.id)]));
  expect(options.length).toBeLessThan(BROWSABLE_SCENES.length);
  expect(new Set(options.map(option=>option.id)).size).toBe(options.length);
  for(const scene of BROWSABLE_SCENES){
   const representative=byId.get(sceneDrumPatch(scene.name));
   expect(representative).toBeTruthy();
   const actual=sceneSettings(scene,0),expected=sceneSettings(representative,0);
   expect(actual.drums.kit).toBe(expected.drums.kit);
   expect(actual.drumKit).toEqual(expected.drumKit);
   expect(scene.percussion??null).toEqual(representative.percussion??null);
  }
 });
 it('switches scene, basic and machine kits without changing drum events or duplicating space effects',async()=>{
  const scene=BROWSABLE_SCENES.find(s=>!s.percussion),host=createHost(scene);
  await host.setupMixer();
  for(const id of ['tr808','tr909','tr707','tr606']){
   await host.setSound('perc',{synth:id,name:'Room'});
   const source=mocks.sources.at(-1).source;
   expect(source.classics.values.reverbMix).toBe(0);
   expect(source.classics.rack['master.chain']).toBe(0);
   expect(host.rackValues('perc')['effects.reverb']).toBe(SYNTHS[id].presets.find(p=>p.name==='Room').values.reverbMix);
   host.drum({drum:6,track:'mt',velocity:.8,duration:1},2,.1);
   expect(host.g.roles.perc.instrument.hitTrack).toHaveBeenLastCalledWith('mt',6,2,.8);
   host.setDrumMix(new Set(),new Set([0]));
   expect(host.g.roles.perc.instrument.setValues).toHaveBeenLastCalledWith(expect.objectContaining({bdLevel:host.soundOf('perc').values.bdLevel,sdLevel:0,reverbMix:0}));
   host.setDrumMix(new Set(),new Set());
  }
  await host.setSound('perc',{synth:'kit',name:'hand'});
  expect(host.g.settings.drums.kit).toBe('hand');
  expect(host.g.settings.drumKit.room).toBe(0);
  expect(host.rackValues('perc')['effects.reverb']).toBe(.1);
  host.editDrumKit({...host.g.settings.drumKit,kick:{...host.g.settings.drumKit.kick,level:.4}});
  const saved=host.loaded.perc;
  expect(saved.kit.kick.level).toBe(.4);
  await host.setSound('perc',saved);
  expect(host.g.roles.perc.instrument.setKit).toHaveBeenLastCalledWith(expect.objectContaining({kick:expect.objectContaining({level:.4})}));
  host.drum({drum:2,velocity:.8,duration:1},2,.1);
  expect(host.g.roles.perc.instrument.scheduleNote).toHaveBeenLastCalledWith(2,2,.1,.8,0);
  await host.setSound('perc',{synth:'scene',name:scene.name});
  expect(host.g.roles.perc.instrument.setKit).toHaveBeenLastCalledWith({...sceneSettings(scene).drumKit,room:0});
  expect(host.loaded.perc).toEqual({synth:'scene',name:scene.name});
  host.dispose();
 });
 it('loads a scene drum machine with its preset and scene kit balance',async()=>{
  const scene=BROWSABLE_SCENES.find(s=>s.percussion),host=createHost(scene);
  await host.applySceneVoices();
  expect(host.loaded.perc).toMatchObject({synth:'scene',name:scene.name});
  expect(host.soundOf('perc')).toMatchObject({synth:scene.percussion.synth,name:scene.percussion.name});
  expect(host.g.roles.perc.instrument.setKit).toHaveBeenCalledWith({...sceneSettings(scene).drumKit,room:0});
  host.dispose();
 });
 it('restores edited synths, racks, scene machine values and drum mix',async()=>{
  const scene=BROWSABLE_SCENES.find(s=>s.percussion),original=createHost(scene),restored=createHost(scene);
  try{
   await original.applySceneVoices();
   const lead=original.soundOf('lead');
   expect(lead).toBeTruthy();
   await original.editRack('lead',{'master.output':-4,'effects.delay':.4});
   const drum=original.soundOf('perc'),key=SYNTHS[drum.synth].kit.tracks[0][0]+'Level';
   original.editValues('perc',{...drum.values,[key]:.25});
   original.setDrumMix(new Set([1]),new Set([0]));
   const saved=structuredClone(original.snapshotSounds());
   await restored.applySceneVoices();
   await restored.restoreSounds(saved);
   expect(restored.soundOf('lead')).toEqual(saved.lead.sound);
   expect(restored.rackValues('lead')).toEqual(saved.lead.rack);
   expect(restored.soundOf('perc').values).toEqual(saved.perc.sound.values);
   expect(restored.rackValues('perc')).toEqual(saved.perc.rack);
   expect(restored.getDrumMix()).toEqual(saved.perc.mix);
   expect(restored.loaded.perc.name).toBe(scene.name);
  }finally{original.dispose();restored.dispose();}
 });
 it('restores edited native instruments and a basic drum kit',async()=>{
  const scene=BROWSABLE_SCENES.find(s=>!s.percussion),original=createHost(scene),restored=createHost(scene);
  try{
   await original.applySceneVoices();
   await original.setSound('lead',{synth:'piano'});
   await original.editNative('lead',{reverbAmount:.35});
   await original.setSound('perc',{synth:'kit',name:'hand'});
   original.editDrumKit({...original.g.settings.drumKit,kick:{...original.g.settings.drumKit.kick,level:.4}});
   const saved=structuredClone(original.snapshotSounds());
   await restored.applySceneVoices();
   await restored.restoreSounds(saved);
   expect(restored.nativeOf('lead')).toEqual(saved.lead.native);
   expect(restored.rackValues('lead')).toEqual(saved.lead.rack);
   expect(restored.g.settings.drumKit).toEqual(saved.perc.kit);
   expect(restored.loaded.perc).toMatchObject({synth:'kit',name:'hand'});
  }finally{original.dispose();restored.dispose();}
 });
 it('does not repatch a DIY source when restoring unchanged rack and mixer values',async()=>{
  const scene=BROWSABLE_SCENES[0],original=createHost(scene),restored=createHost(scene);
  try{
   await original.applySceneVoices();await original.setSound('lead',{synth:'poly',name:'Soft Pad'});const saved=structuredClone(original.snapshotSounds()),mix=structuredClone(original.mixerSnapshot());
   await restored.applySceneVoices();const instrument=restored.g.roles.lead.instrument;instrument.setSpec.mockClear();await restored.restoreSounds(saved);await restored.restoreMixer(mix);expect(instrument.setSpec).not.toHaveBeenCalled();expect(restored.soundOf('lead')).toEqual(saved.lead.sound);expect(restored.rackValues('lead')).toEqual(saved.lead.rack);
   await restored.restoreMixer({...mix,lead:{...mix.lead,'master.output':mix.lead['master.output']-2}});expect(instrument.setSpec).toHaveBeenCalledOnce();expect(restored.rackValues('lead')['master.output']).toBe(mix.lead['master.output']-2);
  }finally{original.dispose();restored.dispose();}
 });
 it('keeps the existing machine and settings when a kit cannot load',async()=>{
  const host=createHost(BROWSABLE_SCENES[0]);
  await host.setSound('perc',{synth:'tr808',name:'Classic'});
  const before=structuredClone(host.g.settings),sound=host.loaded.perc;
  mocks.failPercussion=true;
  try{
   await expect(host.setSound('perc',{synth:'kit',name:'hand'})).rejects.toThrow('kit unavailable');
   expect(host.g.roles.perc.machine).toBe(true);
   expect(host.loaded.perc).toEqual(sound);
   expect(host.g.settings.drums).toEqual(before.drums);
   expect(host.g.settings.drumKit).toEqual(before.drumKit);
  }finally{mocks.failPercussion=false;host.dispose();}
 });
 it('maps every named browsable scene voice to a synth page', () => {
  const missing=new Set();
  for(const scene of BROWSABLE_SCENES)for(const role of ['lead','counter','rhythm','pad','bass']){
   const spec=sceneVoiceSpec(scene,role,sceneSettings(scene).layers);
   if(typeof spec==='string'&&!synthForPreset(spec))missing.add(spec);
  }
  expect([...missing]).toEqual([]);
 });
 it('maps scene voices to their individual synths', async () => {
  expect(synthForPreset('Soft Pad')).toBe('poly');
  const fm=SYNTHS.fm.presets.find(p=>p.category.startsWith('fp-'));
  expect(synthForPreset(fm.name)).toBe('fm');
  expect(synthForPreset('Concert Grand')).toBe('piano');
  expect(patchesOf('iowa').length).toBeGreaterThan(45);
  const host=createHost(BROWSABLE_SCENES[0]);
  await host.applySceneVoices();
  for(const entry of Object.values(host.loaded)) {
   const mapped=synthForPreset(entry.name);
   if(mapped) expect(entry.synth).toBe(mapped);
  }
  host.dispose();
 });

 it('loads a DIY sound’s own cleaned rack and routes edits to the actual voice and rack', async () => {
  const patch=SYNTHS.fm.presets.find(p=>p.rack && p.rackLean && chainUnits(p.rack['master.chain']).includes('shimmer'));
  const host=createHost(BROWSABLE_SCENES[0]);
  await host.setSound('lead',{synth:'fm',name:patch.name});
  const rack=host.rackValues('lead');
  expect(chainUnits(rack['master.chain'])).toContain('shimmer');
  expect(rack['shimmer.mix']).toBe(patch.rack['shimmer.mix']);
  expect(mocks.sources.at(-1).source.diy.rack['master.chain']).toBe(0);
  expect(mocks.racks.at(-1).values).toEqual(instrumentRack(rack));
  await host.editRack('lead',{'shimmer.mix':.4});
  expect(mocks.racks.at(-1).patch).toHaveBeenLastCalledWith(expect.objectContaining({'shimmer.mix':.4}));
  expect(host.g.roles.lead.instrument.setSpec).toHaveBeenCalled();
  host.editValues('lead',{...host.soundOf('lead').values,'global.gain':.4});
  expect(host.g.roles.lead.instrument.setSpec).toHaveBeenCalledTimes(2);
  host.dispose();
 });

 it('routes preset space and output to a separate mixer stage, and synchronizes edits',async()=>{
  const host=createHost(BROWSABLE_SCENES[0]);
  const patch=SYNTHS.fm.presets.find(p=>p.name==='Sine bell');
  await host.setSound('lead',{synth:'fm',name:patch.name});
  await host.setupMixer();
  const inst=host.g.roles.lead.ensembleRack,mixer=host.g.roles.lead.mixerRack;
  expect(host.g.roles.perc.instrument.setKit).toHaveBeenCalledWith(expect.objectContaining({room:0}));
  expect(host.g.roles.perc.mixerRack.values['effects.reverb']).toBe(.16);
  expect(chainUnits(inst.values['master.chain'])).not.toContain('space');
  expect(mixer.values).toEqual(mixerRack(host.rackValues('lead'),undefined));
  expect(chainUnits(mixer.values['master.chain'])).toEqual(['space']);
  await host.editMixer('lead',{'effects.decay':29,'master.output':-8});
  expect(host.rackValues('lead')).toMatchObject({'effects.decay':29,'master.output':-8});
  expect(mixer.patch).toHaveBeenLastCalledWith(expect.objectContaining({'effects.decay':29,'master.output':-8}));
  expect(inst.patch).toHaveBeenLastCalledWith(expect.objectContaining({'master.output':0}));
  await host.editRack('lead',{'master.output':3});
  expect(mixer.patch).toHaveBeenLastCalledWith(expect.objectContaining({'master.output':3}));
  await host.editMixer('perc',{'effects.delay':.4});
  expect(host.g.roles.perc.mixerRack.patch).toHaveBeenLastCalledWith(expect.objectContaining({'effects.delay':.4}));
  host.dispose();
 });

 it('moves native preset room to the mixer and keeps room edits synchronized', async () => {
  const host=createHost(BROWSABLE_SCENES[0]);
  await host.setSound('lead',{synth:'piano',name:'Concert Grand'});
  expect(host.rackValues('lead')).toMatchObject({...nativeRackDefaults('piano'),'effects.reverb':.22});
  expect(mocks.sources.at(-1).source).toMatchObject({reverbAmount:0,delayAmount:0,pingPongAmount:0});
  await host.editNative('lead',{reverbAmount:.5});
  expect(host.rackValues('lead')['effects.reverb']).toBe(.5);
  await host.editMixer('lead',{'effects.reverb':.7});
  expect(host.rackValues('lead')['effects.reverb']).toBe(.7);
  await host.editNative('lead',{pianoDecay:2});
  expect(host.g.roles.lead.instrument.applyPreset).toHaveBeenLastCalledWith(expect.objectContaining({reverbAmount:0,pianoDecay:2}));
  await host.setSound('lead',{synth:'iowa',name:'Flute'});
  expect(host.rackValues('lead')).toMatchObject({...nativeRackDefaults('iowa'),'effects.reverb':.25});
  expect(mocks.sources.at(-1).source.reverbAmount).toBe(0);
  expect(host.nativeOf('lead').preset.iowa).toBe('flute');
  await host.setSound('lead',{synth:'fm',name:'Sine bell'});
  expect(host.nativeOf('lead')).toBeNull();
  host.dispose();
 });

 it('moves generator and native Wasm preset space to the mixer',async()=>{
  const host=createHost(BROWSABLE_SCENES[0]);
  const preset={delayAmount:.3,delayTime:.5,delayFeedback:.4,reverbAmount:.2};
  await host.setPreset('lead','custom','calmbgm',preset);
  expect(mocks.sources.at(-1).source).toMatchObject({reverbAmount:0,delayAmount:0,pingPongAmount:0});
  expect(host.rackValues('lead')).toMatchObject({'effects.reverb':.2,'effects.delay':.3,'effects.delayMs':500,'effects.feedback':.4});
  const wasm=Object.values(WASM_PRESETS)[0],effects=wasmVoiceById(wasm.wasmVoice).patch.effects;
  await host.setPreset('lead','wasm','calmbgm',wasm);
  expect(host.rackValues('lead')).toMatchObject({'effects.reverb':effects.reverb,'effects.delay':effects.delay});
  expect(mocks.sources.at(-1).source.mixerSpaceMoved).toBe(true);
  host.dispose();
 });

 it('keeps mixer gain active while bypassed, syncs delay tempo, and restores mixer settings',async()=>{
  const host=createHost(BROWSABLE_SCENES[0]);
  await host.setSound('lead',{synth:'piano',name:'Concert Grand'});
  await host.setupMixer();
  await host.editMixer('lead',{'effects.decay':29,'effects.delay':.6,'master.sync':2,'master.output':-8});
  host.setTempo(120);
  expect(host.g.roles.lead.mixerRack.patch).toHaveBeenLastCalledWith(expect.objectContaining({'effects.delayMs':250,'effects.decay':29,'master.output':-8}));
  const saved=host.mixerSnapshot();
  await host.setSound('lead',{synth:'iowa',name:'Flute'});
  await host.restoreMixer(saved);
  expect(host.rackValues('lead')).toMatchObject({'effects.decay':29,'effects.delay':.6,'master.sync':2,'master.output':-8});
  await host.editRack('lead',{'master.enabled':0});
  const bypass=host.g.roles.lead.mixerRack.patch.mock.lastCall[0];
  expect(bypass).toMatchObject({'master.enabled':1,'master.mix':1,'master.output':-8});
  expect(chainUnits(bypass['master.chain'])).toEqual([]);
  expect(mixerRack({...cleanRack(),'master.enabled':0,'master.output':5},120)['master.output']).toBe(5);
  host.dispose();
 });
});

describe('immutable desk backend preparation',()=>{
 it('retains the native default, shares one pending setup and never installs duplicate racks',async()=>{const h=createHost(BROWSABLE_SCENES[0]),at=mocks.racks.length;try{expect(h.deskStatus()).toMatchObject({backend:'native',phase:'idle',ready:false});const a=h.setupMixer(),b=h.setupMixer();expect(a).toBe(b);await a;expect(mocks.racks.length-at).toBe(7);expect(h.deskStatus()).toMatchObject({backend:'native',phase:'ready',ready:true});await h.setupMixer();expect(mocks.racks.length-at).toBe(7);}finally{h.dispose();}});
 it('rejects unknown backend choices before creating a host',()=>{expect(()=>createHost(BROWSABLE_SCENES[0],{deskBackend:'automatic'})).toThrow('Unsupported desk');});
 it('rejects initial desk installation while a pre-desk source lease owns the old route',async()=>{const h=createHost(BROWSABLE_SCENES[0],{deskBackend:'owned'});try{const i=h.g.roles.lead.instrument;i.voice={spec:{kind:'subtractive'},patch:{kind:'subtractive',global:{gain:.2},layers:[]},sourceInput:{}};const lease=h.openSourceStem('lead');expect(()=>h.setupMixer()).toThrow('Close source');lease.assertCurrent();lease.release();await h.setupMixer();expect(h.deskStatus().ready).toBe(true);}finally{h.dispose();}});
 it('prepares an explicitly owned desk and retains source lease pointers for its immutable lifetime',async()=>{const h=createHost(BROWSABLE_SCENES[0],{deskBackend:'owned'});try{const state={strips:{lead:{mute:true}},master:{vol:.45}};h.applyDesk(state);await h.setupMixer();const d=mocks.ownedDesks.at(-1);expect(d.patch).toHaveBeenLastCalledWith(state);expect(h.deskStatus()).toMatchObject({backend:'owned',ready:true,metadata:{version:'owned-test',latencyFrames:144}});const i=h.g.roles.lead.instrument;i.voice={spec:{kind:'subtractive'},patch:{kind:'subtractive',global:{gain:.2},layers:[]},sourceInput:{}};const lease=h.openSourceStem('lead');expect(lease.channelOutput).toBe(d.channels.lead.output);expect(lease.masterOutput).toBe(d.output);await h.setupMixer();lease.assertCurrent();expect(h.deskStatus().sourceLeases).toBe(1);lease.release();}finally{h.dispose();}expect(mocks.ownedDesks.at(-1).dispose).toHaveBeenCalledOnce();});
 it('leaves original Generator links intact on off-route failure and permits a corrected retry',async()=>{const h=createHost(BROWSABLE_SCENES[0],{deskBackend:'owned'}),at=mocks.racks.length;mocks.ownedAssetFailure=true;try{await expect(h.setupMixer()).rejects.toThrow('owned asset');expect(h.deskStatus()).toMatchObject({phase:'failed',ready:false});for(const r of Object.values(h.g.roles)){expect((r.tone??r.gain).disconnect).not.toHaveBeenCalled();expect(r.wander.output.disconnect).not.toHaveBeenCalled();expect(r.mixerRack).toBeUndefined();}expect(h.g.mixReturn).toBeUndefined();for(const r of mocks.racks.slice(at))expect(r.dispose).toHaveBeenCalledOnce();mocks.ownedAssetFailure=false;await h.setupMixer();expect(h.deskStatus().ready).toBe(true);}finally{mocks.ownedAssetFailure=false;h.dispose();}});
 it('rolls back partial source connection failures before publishing desk pointers',async()=>{const h=createHost(BROWSABLE_SCENES[0],{deskBackend:'owned'}),at=mocks.racks.length;h.g.roles.bass.wander.output.connect.mockImplementationOnce(()=>{throw Error('connection failed');});try{await expect(h.setupMixer()).rejects.toThrow('connection failed');expect(h.g.mixReturn).toBeUndefined();for(const role of ['lead','counter','rhythm','pad','bass']){const r=h.g.roles[role];expect(r.wander.output.connect).toHaveBeenLastCalledWith(h.g.output);expect(r.mixOutput).toBeUndefined();expect((r.tone??r.gain).connect).toHaveBeenLastCalledWith(r.tone?r.gain:r.wander.input);}for(const r of mocks.racks.slice(at))expect(r.dispose).toHaveBeenCalledOnce();expect(mocks.ownedDesks.at(-1).dispose).toHaveBeenCalledOnce();await h.setupMixer();expect(h.deskStatus().ready).toBe(true);}finally{h.dispose();}});
 it('restores old shared-return/source pointers if migration fails and disposes every prepared resource',async()=>{const h=createHost(BROWSABLE_SCENES[0],{deskBackend:'owned'});h.g.routeSharedEffects=vi.fn().mockImplementationOnce(()=>{throw Error('return reroute failed');});try{await expect(h.setupMixer()).rejects.toThrow('return reroute');expect(h.g.routeSharedEffects).toHaveBeenCalledTimes(2);expect(h.g.mixReturn).toBeUndefined();for(const r of Object.values(h.g.roles))expect(r.mixOutput).toBeUndefined();expect(h.g.levelTrim.connect).toHaveBeenLastCalledWith(masterBus);expect(h.g.ambienceOut.connect).toHaveBeenLastCalledWith(masterBus);expect(mocks.ownedDesks.at(-1).dispose).toHaveBeenCalledOnce();}finally{h.dispose();}});
 it('disposes a rack that finishes after the host closes without disconnecting its original source links',async()=>{let release;mocks.rackGate=new Promise(resolve=>{release=resolve;});const h=createHost(BROWSABLE_SCENES[0],{deskBackend:'owned'}),at=mocks.racks.length,p=h.setupMixer();try{await vi.waitFor(()=>expect(mocks.racks.length).toBe(at+1));h.dispose();release();await expect(p).rejects.toThrow('closed');expect(mocks.racks.at(-1).dispose).toHaveBeenCalledOnce();expect(h.deskStatus()).toMatchObject({phase:'disposed',ready:false});for(const r of Object.values(h.g.roles))expect((r.tone??r.gain).disconnect).not.toHaveBeenCalled();}finally{release();mocks.rackGate=null;h.dispose();}});
 it('surfaces asynchronous owned patch failures through await/status without a native fallback',async()=>{const h=createHost(BROWSABLE_SCENES[0],{deskBackend:'owned'});try{await h.setupMixer();mocks.ownedPatchFailure=true;h.applyDesk({master:{vol:.4}});await expect(h.awaitDeskState()).rejects.toThrow('owned control failed');expect(h.deskStatus()).toMatchObject({backend:'owned',phase:'failed',ready:false,error:expect.stringContaining('owned control failed')});}finally{mocks.ownedPatchFailure=false;h.dispose();}});
 it('surfaces a spontaneous owned processor error through status and await even without a new patch',async()=>{const h=createHost(BROWSABLE_SCENES[0],{deskBackend:'owned'});try{await h.setupMixer();mocks.ownedHealthFailure=true;expect(h.deskStatus()).toMatchObject({backend:'owned',phase:'failed',ready:false,error:expect.stringContaining('owned processor failed')});await expect(h.awaitDeskState()).rejects.toThrow('owned processor failed');await expect(h.setupMixer()).rejects.toThrow('owned processor failed');}finally{mocks.ownedHealthFailure=false;h.dispose();}});
 it('rejects new source and meter taps during pending desk preparation, before allocating or capturing old routes',async()=>{let release;mocks.rackGate=new Promise(resolve=>{release=resolve;});const h=createHost(BROWSABLE_SCENES[0],{deskBackend:'owned'}),at=mocks.racks.length,p=h.setupMixer();try{await vi.waitFor(()=>expect(mocks.racks.length).toBe(at+1));expect(()=>h.openSourceStem('lead')).toThrow('Await desk setup');expect(()=>h.openMeters()).toThrow('Await desk setup');expect(h.deskStatus()).toMatchObject({phase:'preparing',sourceLeases:0,meterTaps:0});release();await p;expect(h.deskStatus().ready).toBe(true);}finally{release();mocks.rackGate=null;h.dispose();}});
 it('rejects meter taps after disposal before trying to create analyser nodes',()=>{const h=createHost(BROWSABLE_SCENES[0]);h.dispose();expect(()=>h.openMeters()).toThrow('closed');expect(h.deskStatus().meterTaps).toBe(0);});
});

it('forwards prepared dynamics into every external All rack and arms them after wake',async()=>{
 const h=createHost(BROWSABLE_SCENES[0]),factory=vi.fn();h.g.audioEnvironment={rackDynamicsFactory:factory};h.g.AC.resume=vi.fn(async()=>{});
 try{await h.setPreset('lead','custom','calmbgm',{gainAttack:.1,masterVolume:.7});await h.setupMixer();const racks=Object.values(h.g.roles).flatMap(r=>[r.ensembleRack,r.mixerRack]).filter(Boolean);expect(racks.length).toBeGreaterThanOrEqual(8);expect(racks.every(r=>r.options.dynamicsFactory===factory)).toBe(true);await h.wake();for(const r of racks)expect(r.armRuntime).toHaveBeenCalledOnce();}finally{h.dispose();}
});
