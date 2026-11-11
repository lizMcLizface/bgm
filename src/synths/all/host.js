// The host of the sequencers' sound generators (docs/SEQUENCER_SYSTEM_PLAN.md): the front page's own Generator, used as the orchestra. Its role instruments are loaded the way the
// main and ensemble pages load them (scene voices; a classic synth or DIY patch as a source, level-matched), and the song is planned by its planner, so the progression, voicings
// and lines are the generator's. The sequencers then play those same role instruments.
import Generator, { ROLES } from '../../app/Generator';
import { BROWSABLE_SCENES, sceneSettings, sceneVoiceSpec } from '../../app/scenes';
import { PERCUSSION_VOICES, percussionPresetKit } from '../../app/percussionVoices';
import { defaultDrumKit } from '../../app/percussion';
import { sanitizeSettings } from '../../app/settings';
import { seeded } from '../../app/random';
import { SYNTHS } from '../models';
import library from '../../library/voices.json';
import { matchedLevel, soundSource } from '../ensemble/sources';
import { ROLE_PICKS } from '../ensemble/state';
import { cleanRack, rackForPatch, splitRackEdits } from '../effects/params';
import { RACK_PARAMS } from '../effects/params';
import { createOutputMonitor } from '../effects/outputMonitor';
import { leanChain } from '../effects/rackParts';
import { nativeRackDefaults } from '../effects/nativeRacks';
import { diySpec } from '../../app/engine/diySource';
import { PATCHES as IOWA_PATCHES } from '../../app/engine/iowaModel/patches';
import { tuning } from '../tuning';
import { findPreset } from '../../app/editor/presetStore';
import { translatedWasmPreset } from '../../app/engine/wasmPreset';
import { nativeWasmVoice } from '../../synth-lab/voiceLibrary';
import {instrumentRack,mixerRack,mixerEdits,mixerSpace,isMixerSpaceKey} from './mixerEffects';
import {chainUnits,maskFromUnits} from '../effects/order';
import {createMeter,meterLevel} from './meter';
import {masterBus} from '../../audio/bus';
import {presetFromEdit} from '../../app/editor/presetEdits';
import {deskBackendChoice,prepareDeskBackend} from './deskBackend';
import {sourceStemTap} from './sourceStemTap';
import {pianoStemTap} from './pianoStemTap';
import {iowaStemTap} from './iowaStemTap';
import {percussionStemTap} from './percussionStemTap';
import {classicStemTap,compositeClassicStemTap} from './classicStemTap';
import {pluckedStemTap} from './pluckedStemTap';
import {readBook,withPresetBook,applyBook,cleanBook,baselineChoice,withoutSettings} from '../../app/rulebook/session';
import {RULES} from '../../app/rulebook/model';
import {DRUM_TRACKS} from '../../app/drumMappings';
import {DRUMS} from '../../app/percussion';

// as on the pages (ui/SynthShell): the instrument's own space controls are moved into the rack, and a rack that has not been touched holds only the effects the sound uses
const MOVED = { moved: true };
const leanRack = (model, values, rack) => ({ ...rack, 'master.chain': leanChain(rackForPatch(model, values, rack, MOVED)) });
import { captureProject, planProgressions } from '../../seq/capture';

/** The sequencers, in the order of the panel: the parts the generator plays with notes (the percussion is the drum sequencer's). */
export const SEQUENCERS = [
    { role: 'lead', label: 'Lead', short: 'LD' },
    { role: 'counter', label: 'Second lead', short: '2L' },
    { role: 'rhythm', label: 'Rhythm', short: 'RH' },
    { role: 'pad', label: 'Pad', short: 'PD' },
    { role: 'bass', label: 'Bass', short: 'BS' },
    { role: 'perc', label: 'Drums', short: 'DR' },
];
export const GENERATOR_ROLES = Object.keys(ROLES);

/** A voice the generator can play a role with: its own synth (a preset by name), a classic synth or a DIY synth (a patch of it). */
/** The generator's own instruments that have a page of their own: the pianos (the piano page's list: the pianos and the front page's piano-model keys) and the instruments measured from recordings (preset.iowa). Each plays one of the front page's sounds (library/voices.json). */
const PIANOS = { ...library.Pianos, ...Object.fromEntries(Object.entries(library['Keys & plucks']).filter(([, p]) => p.stringModel === 'piano')) };
const MEASURED = { ...Object.fromEntries(IOWA_PATCHES.map(p => [p.name, Object.values(library['Iowa & VSCO']).find(v => v.iowa === p.id)])), ...library['Iowa & VSCO'] };
export const NATIVE = { piano: { name: 'Piano', presets: PIANOS }, iowa: { name: 'Measured instruments', presets: MEASURED } };
export const isNative = (synth) => synth in NATIVE;
/** The synth that plays a front page sound as an instrument of its own, or as a patch it can be edited in (DI-Poly): null when the generator's own voice is all there is. */
export const synthForPreset = (name) => (!name ? null : name in PIANOS ? 'piano' : name in MEASURED ? 'iowa' : ['poly', 'fm'].find(id => SYNTHS[id].presets.some(p => p.name === name)) ?? null);
export const synthChoices = () => [{ id: 'calmbgm', name: 'calmbgm' }, ...Object.entries(NATIVE).map(([id, n]) => ({ id, name: n.name })), ...['poly', 'fm', 'cs80', 'juno', 'prophet5', 'jupiter8', 'minimoog', 'dx7', 'obxa', 'vs', 'wt'].map((id) => ({ id, name: SYNTHS[id].name }))];
export const patchesOf = (synthId) => (synthId === 'calmbgm' ? [] : isNative(synthId) ? Object.keys(NATIVE[synthId].presets).map((name) => ({ name })) : SYNTHS[synthId].presets);
const stableValue=value=>Array.isArray(value)?value.map(stableValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])])):value;
const sceneDrumKey=scene=>{
 const settings=sceneSettings(scene,0);
 return JSON.stringify(stableValue({voice:settings.drums.kit,kit:settings.drumKit,machine:scene.percussion??null}));
};
const sceneDrumGroups=()=>{
 const groups=new Map();
 for(const scene of BROWSABLE_SCENES){
  const key=sceneDrumKey(scene),group=groups.get(key);
  if(group)group.scenes.push(scene.name);
  else groups.set(key,{id:scene.name,scenes:[scene.name]});
 }
 return [...groups.values()];
};
const SCENE_DRUM_GROUPS=sceneDrumGroups();
export const sceneDrumPatch=name=>SCENE_DRUM_GROUPS.find(group=>group.scenes.includes(name))?.id??name;
export const drumChoices = () => [{id:'scene',name:'Scene kits'},{id:'kit',name:'Basic kits'},...['tr808','tr909','tr707','tr606'].map(id=>({id,name:SYNTHS[id].name}))];
export const drumPatches = id => id==='scene'?SCENE_DRUM_GROUPS.map(group=>({id:group.id,name:group.scenes.length>1?`${group.id} (${group.scenes.length} scenes)`:group.id})):id==='kit'?Object.values(PERCUSSION_VOICES).map(v=>({name:v.name,id:v.id})):SYNTHS[id]?.kit?SYNTHS[id].presets:[];

export function createHost(scene, {seed,settings:storedSettings,deskBackend='native',roleWanderFactory=null,audioEnvironment=null} = {}) {
    deskBackend=deskBackendChoice(deskBackend);
    const settings = storedSettings ? sanitizeSettings(storedSettings,sceneSettings(scene,seed)) : sceneSettings(scene, seed);
    const g = new Generator(settings,{roleWanderFactory,audioEnvironment});
    const loaded = {};
    const sounds = {}; // role -> the classic or DIY patch playing it: { synth, name, category, values, rack, level }
    const racks = {}; // role -> the effects of a calmbgm voice
    const spaces = {}; // role -> independent mixer delay and reverb settings
    const natives = {}; // role -> { synth, name, preset } for a piano, measured-instrument or string voice (the preset as edited)
    const hostScene = { scene };
    let book=withPresetBook(scene.rulebook,{rules:{},baseline:{}});
    applyBook(g,book);
    function restoreBook(saved){book=cleanBook({version:1,...saved});applyBook(g,book);}
    function editSettings(patch){
        const clean=sanitizeSettings(patch,g.settings);
        const edits=Object.fromEntries(Object.keys(patch).map(key=>[key,clean[key]]).filter(([,value])=>value!==undefined));
        book=withoutSettings(book,edits,g.settings);g.setMany(edits);
    }
    function editRule(id,choice){
        const rule=RULES.find(r=>r.id===id);if(!rule)return;
        const rules={...book.rules},baseline={...book.baseline};
        if(choice){if(rule.path&&!baseline[id])baseline[id]=baselineChoice(rule,g.settings);rules[id]=choice;}else delete rules[id];
        applyBook(g,{...book,rules,baseline});if(!choice)delete baseline[id];book={...book,rules,baseline};
    }
    loaded.perc = BROWSABLE_SCENES.includes(scene)?{synth:'scene',name:scene.name}:{synth:'kit',name:settings.drums.kit,kit:settings.drumKit};
    const meterTaps = new Set();
    const sourceTaps = new Set();
    let deskAudio=null,deskState=null,mixerSetup=null,deskFailure=null,deskRevision=0,deskUpdate=Promise.resolve(),mixerPhase='idle';
    let drumMask = null, drumMix={muted:[],solo:[]};
    if (g.settings.drumKit) {
        const rack = RACK_PARAMS.sanitize({ ...cleanRack(), 'effects.reverb': g.settings.drumKit.room });
        racks.perc = { ...rack, 'master.chain': leanChain(rack) };
        spaces.perc = mixerSpace(rack);
    }
    let disposed = false;
    let tempo = settings.bpm;
    const ensureActive = () => { if (disposed) throw new Error('Sound host was closed while loading'); };

    /** The scene's voices on the roles, as the main page does when a scene is chosen. */
    async function applySceneVoices(next = scene) {
        for (const role of GENERATOR_ROLES) {
            const spec = sceneVoiceSpec(next, role, g.settings.layers) ?? ROLES[role].preset;
            const name = typeof spec === 'string' ? spec : spec.name;
            const synth = spec.external?.synth ?? synthForPreset(name);
            if (spec.external) await setReference(role,spec.external);
            else if (typeof spec !== 'string' && spec.synth) await setPreset(role,name,isNative(synth)?synth:'calmbgm',spec.synth);
            else if (synth) await setSound(role, { synth, name });
            else {
                await setPreset(role, name, 'calmbgm', typeof spec === 'string' ? undefined : spec.synth);
            }
        }
        if(next.percussion){
            await setReference('perc',next.percussion);
            if(BROWSABLE_SCENES.includes(next))loaded.perc={...loaded.perc,synth:'scene',name:next.name};
        }
    }

    async function setReference(role,ref) {
        const {soundFromRef,machineFromRef}=await import('../../app/editor/soundRefs');
        if(role==='perc'){
            const machine=machineFromRef(ref);
            return setDrumSound({synth:machine.synth,name:machine.name,values:machine.values,rack:machine.rack,drumKit:g.settings.drumKit});
        }
        const sound=soundFromRef(ref,role);
        const {level,matched,...patch}=sound;
        return setSound(role,{synth:sound.synth,name:sound.name,patch:{...patch,...(matched?{level}:{})}});
    }

    async function applyFrontPageLink(link) {
        book=withPresetBook(link.scene?.rulebook,readBook(link.search));applyBook(g,book);
        for(const [role,preset] of Object.entries(link.share?.presets??{})){
            if(!SEQUENCERS.some(s=>s.role===role))throw new Error(`Unknown voice: ${role}`);
            if(preset?.external||preset?.machine)await setReference(role,preset.external??preset.machine);
            else if(preset?.edit){
                const mapped=synthForPreset(preset.edit.name);
                await setPreset(role,preset.edit.name,isNative(mapped)?mapped:'calmbgm',presetFromEdit(preset.edit));
            }else if(preset?.generated){
                const {prepareSound}=await import('../../app/engine/prepareSound');
                const sound=await prepareSound(preset.generated,g.settings.generation);
                await setPreset(role,sound.name,'calmbgm',sound.preset);
            }else await setSound(role,{synth:'calmbgm',name:preset});
        }
    }

    async function setDrumSound({synth,name,values,rack:storedRack,drumKit,kit:storedKit}) {
            const previousMachine=sounds.perc?.synth;
            if(synth==='scene'||synth==='kit') {
                const chosen=synth==='scene'?BROWSABLE_SCENES.find(s=>s.name===name):null;
                if(synth==='scene'&&!chosen)throw new Error(`Unknown scene kit: ${name}`);
                if(chosen?.percussion){
                    const ref=chosen.percussion;
                    await setDrumSound({...ref,values:{...ref.values,...values},rack:storedRack??ref.rack,drumKit:sceneSettings(chosen).drumKit});
                    loaded.perc={...loaded.perc,synth:'scene',name:chosen.name};
                    return loaded.perc;
                }
                const voice=synth==='scene'?sceneSettings(chosen).drums.kit:name;
                if(!PERCUSSION_VOICES[voice])throw new Error(`Unknown drum kit: ${voice}`);
                const base=structuredClone(synth==='scene'?sceneSettings(chosen).drumKit:percussionPresetKit(voice));
                const kit=storedKit?sanitizeSettings({drumKit:storedKit},{...g.settings,drumKit:base}).drumKit:base;
                if(g.roles.perc.machine){
                    const before={drums:g.settings.drums,drumKit:g.settings.drumKit};
                    try{await g.loadPercussionVoice(voice);await g.setPercussionSource(null);}
                    catch(error){g.setMany(before);throw error;}
                }else await g.loadPercussionVoice(voice);
                ensureActive();
                g.settings.drumKit={...kit,room:0};
                g.roles.perc.instrument.setKit(g.settings.drumKit);
                delete sounds.perc;
                const rack=RACK_PARAMS.sanitize({...cleanRack(),'effects.reverb':kit.room});
                racks.perc={...rack,'master.chain':leanChain(rack)};
                spaces.perc=mixerSpace(racks.perc);
                loaded.perc={synth,name:synth==='scene'?chosen.name:voice,...(storedKit?{kit}: {})};
            } else {
                const model=SYNTHS[synth];
                if(!model?.kit)throw new Error(`Unknown drum machine: ${synth}`);
                const patch=model.presets.find(p=>p.name===name)??model.presets[0];
                const clean=model.params.sanitize({...patch.values,...values});
                const rack=RACK_PARAMS.sanitize({...cleanRack(),'effects.reverb':clean.reverbMix,'effects.decay':clean.reverbDecay,'effects.damping':clean.reverbTone,'effects.size':clean.reverbSize,'effects.predelay':clean.reverbPredelay*1000,...storedRack});
                const full={...rack,'master.chain':storedRack?.['master.chain']??leanChain(rack)};
                const audioValues={...clean,reverbMix:0};
                await g.setPercussionSource({classics:{synth,name:patch.name,values:audioValues,rack:{...cleanRack(),'master.chain':0},moved:true},masterVolume:1});
                ensureActive();
                g.settings.drumKit={...(drumKit??defaultDrumKit()),room:0};
                g.roles.perc.instrument.setKit(g.settings.drumKit);
                sounds.perc={synth,name:patch.name,category:patch.category,values:clean,rack:full};
                spaces.perc=mixerSpace(full);
                loaded.perc={synth,name:patch.name,values:clean,rack:full};
            }
            if(previousMachine!==sounds.perc?.synth){drumMask=null;drumMix={muted:[],solo:[]};}
            else applyDrumValues();
            g.roles.perc.ensembleRack?.patch(instrumentRack(rackValues('perc')));
            updateMixer('perc');
            return loaded.perc;
    }

    /** The effects of a calmbgm voice: its own rack between the instrument and the role's mix (as the ensemble page does it). */
    async function nativeRack(role, values) {
        const r = g.roles[role];
        if (!r.ensembleRack) {
            const { createRack } = await import('../effects/graph');
            const rack = await createRack(g.AC, values,{pluginFactory:g.audioEnvironment?.rackPluginFactory,dynamicsFactory:g.audioEnvironment?.rackDynamicsFactory,nativeFactory:g.audioEnvironment?.rackNativeFactory});
            if (disposed) { rack.dispose(); ensureActive(); }
            r.instrument.output.disconnect();
            if (r.instrument.destinations) r.instrument.destinations = [];
            r.instrument.connect(rack.input);
            rack.connect(r.tone ?? r.gain);
            r.ensembleRack = rack;
        } else r.ensembleRack.patch(values);
    }
    const dropRack = (role) => { g.roles[role].ensembleRack?.dispose(); g.roles[role].ensembleRack = null; };
    const updateMixer = role => { const r=g.roles[role]; if(r.mixerRack)r.mixerRack.patch(mixerRack(rackValues(role),tempo)); };

    function setupMixer() {
        ensureActive();if(deskAudio){checkDeskHealth();return deskFailure?Promise.reject(deskFailure):Promise.resolve(deskStatus());}if(mixerSetup)return mixerSetup;
        if(sourceTaps.size||meterTaps.size)throw Error('Close source and meter taps before preparing the desk');
        mixerPhase='preparing';deskFailure=null;
        mixerSetup=(async()=>{
            const candidates=[],undo=[],oldMixReturn=g.mixReturn,oldMixOutputs=Object.fromEntries(SEQUENCERS.map(({role})=>[role,g.roles[role].mixOutput]));let candidate=null,pointers=false;
            const connect=(from,to)=>{from.connect(to);undo.push(()=>from.disconnect(to));};
            const disconnect=(from,to)=>{from.disconnect(to);undo.push(()=>from.connect(to));};
            try{
                if(g.percussionReady)await g.percussionReady;await g.awaitRoleMotion?.({controls:false});ensureActive();
                const {createRack}=await import('../effects/graph');ensureActive();
                // All async resources are prepared before changing existing links.
                for(const {role}of SEQUENCERS){
                    const r=g.roles[role],rack=await createRack(g.AC,mixerRack(rackValues(role),tempo),{pluginFactory:g.audioEnvironment?.rackPluginFactory,dynamicsFactory:g.audioEnvironment?.rackDynamicsFactory,nativeFactory:g.audioEnvironment?.rackNativeFactory,onError:error=>console.error('Mixer effects failed',error)});
                    if(!rack)throw Error('Mixer effects preparation failed');const entry={role,r,rack,insert:null};candidates.push(entry);ensureActive();
                    if(role==='perc'){entry.insert=await createRack(g.AC,instrumentRack(rackValues(role)),{pluginFactory:g.audioEnvironment?.rackPluginFactory,dynamicsFactory:g.audioEnvironment?.rackDynamicsFactory,nativeFactory:g.audioEnvironment?.rackNativeFactory});if(!entry.insert)throw Error('Percussion inserts preparation failed');ensureActive();}
                }
                candidate=await prepareDeskBackend(g.AC,SEQUENCERS.map(s=>s.role),{backend:deskBackend,state:deskState});ensureActive();
                let revision;do{revision=deskRevision;await candidate.patch(deskState);ensureActive();}while(revision!==deskRevision);
                if(sourceTaps.size||meterTaps.size)throw Error('Close source and meter taps before installing the desk');
                // No await below: asynchronous shared-rack completion observes
                // either the old pointers or the completely committed new desk.
                for(const {role,r,rack,insert}of candidates){const from=r.tone??r.gain,to=r.tone?r.gain:r.wander.input;disconnect(from,to);connect(from,(insert??rack).input);if(insert)insert.connect(rack.input);rack.connect(to);}
                for(const {role}of SEQUENCERS){const output=g.roles[role].wander.output;disconnect(output,g.output);connect(output,candidate.channels[role].input);connect(candidate.channels[role].output,candidate.channels.headroom.input);}
                connect(candidate.channels.headroom.output,g.output);disconnect(g.levelTrim,masterBus);connect(g.levelTrim,candidate.input);disconnect(g.ambienceOut,masterBus);connect(g.ambienceOut,candidate.channels.ambience.input);connect(candidate.channels.ambience.output,candidate.input);
                g.mixReturn=candidate.channels.headroom.input;for(const {role}of SEQUENCERS)g.roles[role].mixOutput=candidate.channels[role].output;pointers=true;
                g.routeSharedEffects?.();
                if(g.settings.drumKit){const instrument=g.roles.perc.instrument,previous=structuredClone(instrument.kit??g.settings.drumKit);undo.push(()=>instrument.setKit(previous));instrument.setKit({...g.settings.drumKit,room:0});}
                connect(candidate.output,masterBus);
                for(const {r,rack,insert}of candidates){r.mixerRack=rack;if(insert)r.ensembleRack=insert;}
                deskAudio=candidate;candidate=null;mixerPhase='ready';return deskStatus();
            }catch(error){
                if(pointers){if(oldMixReturn===undefined)delete g.mixReturn;else g.mixReturn=oldMixReturn;for(const {role}of SEQUENCERS){if(oldMixOutputs[role]===undefined)delete g.roles[role].mixOutput;else g.roles[role].mixOutput=oldMixOutputs[role];}try{g.routeSharedEffects?.();}catch(restoreError){console.error('Shared mixer route rollback failed',restoreError);}}
                for(let i=undo.length-1;i>=0;i--)try{undo[i]();}catch(restoreError){console.error('Mixer connection rollback failed',restoreError);}
                for(const resource of [candidate,...candidates.flatMap(({rack,insert})=>[rack,insert])])try{resource?.dispose();}catch(cleanupError){console.error('Prepared mixer cleanup failed',cleanupError);}
                deskFailure=error;mixerPhase=disposed?'disposed':'failed';throw error;
            }
        })();
        const pending=mixerSetup;pending.catch(()=>{if(mixerSetup===pending)mixerSetup=null;});return pending;
    }
    function applyDesk(state){
        deskState=state;deskRevision++;if(!deskAudio)return;
        let update;try{update=Promise.resolve(deskAudio.patch(state));}catch(error){update=Promise.reject(error);}
        deskUpdate=Promise.all([deskUpdate.catch(()=>{}),update]).then(()=>undefined).catch(error=>{deskFailure=error;mixerPhase='failed';throw error;});deskUpdate.catch(()=>{});return deskUpdate;
    }
    function checkDeskHealth(){if(!disposed&&!deskFailure&&deskAudio?.check)try{deskAudio.check();}catch(error){deskFailure=error;mixerPhase='failed';}}
    async function awaitDeskState(){if(mixerSetup)await mixerSetup;await deskUpdate;ensureActive();checkDeskHealth();if(deskFailure)throw deskFailure;return deskStatus();}
    function deskStatus(){checkDeskHealth();return {backend:deskBackend,phase:disposed?'disposed':mixerPhase,ready:!!deskAudio&&!disposed&&!deskFailure,error:deskFailure?String(deskFailure):null,revision:deskRevision,metadata:deskAudio?.backendInfo??null,routing:'Original All implicit native fan-in; deterministic reference reduction is a separate fixture',sourceLeases:sourceTaps.size,meterTaps:meterTaps.size};}

    const stemTap=(role,instrument,guard)=>role==='perc'?percussionStemTap(instrument,{input:g.roles.perc.gain,machine:g.roles.perc.machine},guard):instrument?.preset?.classics?(instrument.lives?.length>1?compositeClassicStemTap:classicStemTap)(instrument,guard):(instrument?.voice?.native??(instrument?.synthMix?instrument:null))?.preset?.stringModel==='plucked'?pluckedStemTap(instrument,guard):(instrument?.voice?.native??(instrument?.synthMix?instrument:null))?.preset?.stringModel==='piano'?pianoStemTap(instrument,guard):instrument?.preset?.iowa?iowaStemTap(instrument,guard):sourceStemTap(instrument,guard);
    function sourcePreviewStatus(role){try{ensureActive();const tap=stemTap(role,g.roles[role]?.instrument,ensureActive);return {eligible:true,kind:tap.kind};}catch(e){return {eligible:false,reason:e.message};}}
    function openSourceStem(role,onClose=()=>{}){
        ensureActive();if(mixerPhase==='preparing')throw Error('Await desk setup before opening a source lease');const instrument=g.roles[role]?.instrument,sourceRevision=g.roles[role]?.sourceRevision,tuningKey=JSON.stringify(tuning.get());let closed=false;
        const tap=stemTap(role,instrument,()=>{ensureActive();if(closed||g.roles[role]?.instrument!==instrument||g.roles[role]?.sourceRevision!==sourceRevision||JSON.stringify(tuning.get())!==tuningKey)throw Error('The source host or tuning changed.');});
        const lease={...tap,role,context:g.AC,channelOutput:g.roles[role].mixOutput??g.roles[role].wander.output,masterOutput:deskAudio?.output??g.levelTrim,tune:midi=>tunedNote(role,midi),release(){if(closed)return;closed=true;sourceTaps.delete(lease);},close(){if(closed)return;lease.release();onClose();}};
        sourceTaps.add(lease);return lease;
    }

    function openMeters() {
            ensureActive();if(mixerPhase==='preparing')throw Error('Await desk setup before opening meter taps');
            const meters=Object.fromEntries(SEQUENCERS.map(({role})=>[role,createMeter(g.AC,deskAudio?.channels[role].output??g.roles[role].wander.output)]));
            meters.ambience=createMeter(g.AC,deskAudio?.channels.ambience.output??g.ambienceOut);
            if(deskAudio)meters.headroom=createMeter(g.AC,deskAudio.channels.headroom.output);
            const splitter=g.AC.createChannelSplitter(2);
            masterBus.connect(splitter);
            const left=g.AC.createAnalyser(),right=g.AC.createAnalyser();
            left.fftSize=right.fftSize=1024;
            splitter.connect(left,0);splitter.connect(right,1);
            const l=new Float32Array(left.fftSize),r=new Float32Array(right.fftSize);
            let closed=false;
            const tap={
                read() {
                    left.getFloatTimeDomainData(l);right.getFloatTimeDomainData(r);
                    return {...Object.fromEntries(Object.entries(meters).map(([role,meter])=>[role,meter.read()])),left:meterLevel(l),right:meterLevel(r)};
                },
                dispose() {if(closed)return;closed=true;meterTaps.delete(tap);Object.values(meters).forEach(m=>m.dispose());masterBus.disconnect(splitter);splitter.disconnect();left.disconnect();right.disconnect();},
            };
            meterTaps.add(tap);
            return tap;
    }

    /** One of the generator's own presets for a role; `kind` names the page it belongs to (a piano, measured instruments, strings), else it is a plain calmbgm voice. */
    async function setPreset(role, name, kind = 'calmbgm', override) {
        const source = override ?? (kind === 'calmbgm' ? findPreset(name) : NATIVE[kind].presets[name]);
        if (!source) throw new Error(`Unknown ${kind} preset: ${name}`);
        const preset = structuredClone(source);
        const audioPreset = { ...preset, reverbAmount: 0, delayAmount: 0, pingPongAmount: 0, mixerSpaceMoved: true };
        await g.setRoleSource(role, audioPreset, name);
        ensureActive();
        dropRack(role);
        loaded[role] = { synth: kind, name };
        delete sounds[role];
        if (kind === 'calmbgm') delete natives[role]; else natives[role] = { synth: kind, name, preset };
        const base = kind === 'calmbgm' ? cleanRack() : nativeRackDefaults(kind);
        const nativeEffects = kind === 'calmbgm' ? (nativeWasmVoice(preset)?.patch.effects ?? translatedWasmPreset(preset).effects) : null;
        const moved = nativeEffects
            ? Object.fromEntries(Object.entries(nativeEffects).map(([key,value])=>['effects.'+key,value]))
            : { 'effects.reverb': preset.reverbAmount ?? (kind === 'iowa' ? .25 : .2) };
        const rack = RACK_PARAMS.sanitize({ ...base, ...moved });
        racks[role] = { ...rack, 'master.chain': leanChain(rack) };
        spaces[role] = mixerSpace(racks[role]);
        await nativeRack(role, instrumentRack(racks[role]));
        updateMixer(role);
        return loaded[role];
    }
    /** The preset a piano, measured-instrument or string voice plays now, as edited (null for any other voice). */
    const nativeOf = (role) => natives[role] ?? null;
    /** A control of such a voice moved: the preset is loaded again with it. */
    async function editNative(role, changes) {
        const entry = natives[role];
        if (!entry) {
            if(!sounds[role]&&role!=='perc')for(const [key,value] of Object.entries(changes))g.setRoleParam(role,key,value);
            return;
        }
        entry.preset = { ...entry.preset, ...changes };
        if ('reverbAmount' in changes) await editMixer(role, { 'effects.reverb': changes.reverbAmount });
        if (Object.keys(changes).some(key=>key!=='reverbAmount'))
            g.roles[role].instrument.applyPreset({ ...structuredClone(entry.preset), reverbAmount: 0, delayAmount: 0, pingPongAmount: 0, mixerSpaceMoved: true });
    }

    /** A role's sound: { synth: 'calmbgm' } keeps the scene's voice, with a name it is one of the generator's presets; otherwise a patch of a classic or DIY synth (by name, or with its values when it comes from a library; the first when it is not found), with its level matched. */
    async function setSound(role, { synth, name, values, rack, kit, patch: chosen }) {
        if(role==='perc')return setDrumSound({synth,name,values,rack:chosen?.rack??rack,kit});
        if (isNative(synth)) return setPreset(role, name && NATIVE[synth].presets[name] ? name : Object.keys(NATIVE[synth].presets)[0], synth);
        if (synth === 'calmbgm') {
            if (name) {
                const mapped = synthForPreset(name);
                return mapped ? setSound(role, { synth: mapped, name }) : setPreset(role, name);
            }
            const spec = sceneVoiceSpec(hostScene.scene, role, g.settings.layers) ?? ROLES[role].preset;
            const sceneName = typeof spec === 'string' ? spec : spec.name;
            const mapped = spec.external?.synth ?? synthForPreset(sceneName);
            return mapped ? setSound(role, { synth: mapped, name: spec.external?.name ?? sceneName }) : setPreset(role, sceneName);
        }
        // without a name: the sound this synth has curated for the role (the ensemble page's picks), the rhythm layer taking the pad's
        const model = SYNTHS[synth], pick = name ?? ROLE_PICKS[synth]?.[role === 'rhythm' ? 'pad' : role];
        const patch = chosen?.values ? chosen : values ? { name, category: 'library', values } : model.presets.find((p) => p.name === pick) ?? model.presets[0];
        const clean = model.params.sanitize(patch.values);
        const base = RACK_PARAMS.sanitize({ ...cleanRack(), ...patch.rack });
        const patchRack = patch.rack && !patch.rackLean ? base : leanRack(model, clean, base);
        const sound = { synth, name: patch.name, category: patch.category ?? patch.cat, values: clean, rack:patchRack, ...(patch.waves ? { waves: patch.waves } : {}) };
        const level = Number.isFinite(chosen?.level) ? chosen.level : await matchedLevel(sound, role);
        ensureActive();
        const diy = synth === 'poly' || synth === 'fm';
        const audioRack = diy ? { ...cleanRack(), 'master.chain': 0 } : instrumentRack(rackForPatch(model, clean, patchRack, MOVED));
        await g.setRoleSource(role, soundSource({ ...sound, rack: audioRack, moved: true, level, matched: true }, role, false), patch.name);
        ensureActive();
        dropRack(role);
        if (diy) await nativeRack(role, instrumentRack(rackForPatch(model, clean, patchRack, MOVED)));
        loaded[role] = { synth, name: patch.name };
        sounds[role] = { ...sound, level };
        delete natives[role];
        spaces[role] = mixerSpace(rackForPatch(model, clean, patchRack, MOVED));
        updateMixer(role);
        return loaded[role];
    }

    /** The patch a classic or DIY voice plays now (null for a calmbgm voice). */
    const soundOf = (role) => sounds[role] ?? null;
    /** A knob of the voice's own synth moved. */
    function editValues(role, values) {
        if (!sounds[role]) return;
        if(role==='perc'){
            const sound=sounds.perc,clean=SYNTHS[sound.synth].params.sanitize(values);
            sounds.perc={...sound,values:clean};
            loaded.perc={...loaded.perc,values:clean};
            applyDrumValues();
            updateMixer(role);
            return;
        }
        const model = SYNTHS[sounds[role].synth];
        values=model.params.sanitize(values);
        const previous=rackForPatch(model,sounds[role].values,sounds[role].rack,MOVED);
        const next=rackForPatch(model,values,sounds[role].rack,MOVED);
        const changed=Object.fromEntries(Object.entries(mixerSpace(next)).filter(([key,value])=>value!==previous[key]));
        spaces[role]={...spaces[role],...changed};
        sounds[role] = { ...sounds[role], values };
        const instrument = g.roles[role].instrument;
        if (sounds[role].synth === 'poly' || sounds[role].synth === 'fm') {
            instrument.setSpec(diySpec({ ...sounds[role], rack: { ...cleanRack(), 'master.chain': 0 } }, instrument.polyphony));
            g.roles[role].ensembleRack.patch(instrumentRack(rackForPatch(model, values, sounds[role].rack, MOVED)));
        } else {
            instrument.setValues(values);
            instrument.setRack(instrumentRack(rackForPatch(model, values, sounds[role].rack, MOVED)));
        }
        updateMixer(role);
    }
    function applyDrumValues() {
        const sound=sounds.perc;if(!sound)return;
        const values={...sound.values,reverbMix:0};
        if(drumMask)for(const [key] of SYNTHS[sound.synth].kit.tracks)if(!drumMask.has(key))values[key+'Level']=0;
        g.roles.perc.instrument.setValues(values);
    }
    function setDrumMix(muted,solo) {
        const sound=sounds.perc;if(!sound)return;
        drumMix={muted:[...muted],solo:[...solo]};
        drumMask=new Set(SYNTHS[sound.synth].kit.tracks.filter((_,t)=>solo.size?solo.has(t):!muted.has(t)).map(([key])=>key));
        applyDrumValues();
    }
    const getDrumMix=()=>drumMix;
    function snapshotSounds() {
        return Object.fromEntries(SEQUENCERS.map(({role})=>{
            const sound=sounds[role],native=natives[role];
            return [role,{selection:loaded[role],...(sound?{sound}:{}),...(native?{native}:{}),...(role!=='perc'&&!sound&&!native?{preset:g.getRolePreset(role)}:{}),rack:rackValues(role),...(role==='perc'?{kit:g.settings.drumKit,mix:drumMix}:{})}];
        }));
    }
    async function restoreSounds(saved) {
        for(const {role} of SEQUENCERS){
            const entry=saved[role];
            if(entry.native)await setPreset(role,entry.native.name,entry.native.synth,entry.native.preset);
            else if(entry.preset)await setPreset(role,entry.selection.name,'calmbgm',entry.preset);
            else if(entry.sound&&role!=='perc')await setSound(role,{synth:entry.sound.synth,name:entry.sound.name,patch:entry.sound});
            else await setSound(role,{...entry.selection,...(role==='perc'&&entry.sound?{values:entry.sound.values,rack:entry.sound.rack}: {})});
            if(role==='perc'&&entry.kit){
                g.settings.drumKit=sanitizeSettings({drumKit:entry.kit},g.settings).drumKit;
                g.roles.perc.instrument.setKit(g.settings.drumKit);
                if(entry.sound)setDrumMix(new Set(entry.mix.muted),new Set(entry.mix.solo));
            }
            // A no-op restore must not repatch the DIY source. Reapplying an
            // identical rack can bypass its initial source gain preparation.
            if(Object.entries(entry.rack??{}).some(([key,value])=>rackValues(role)[key]!==value))await editRack(role,entry.rack);
        }
    }
    function editDrumKit(kit) {
        const clean=sanitizeSettings({drumKit:kit},g.settings).drumKit;
        g.settings.drumKit={...clean,room:0};
        g.roles.perc.instrument.setKit(g.settings.drumKit);
        loaded.perc={...loaded.perc,kit:g.settings.drumKit};
    }
    /** The effects chain of a voice, as the rack panel shows it. */
    const rackValues = (role) => ({...(sounds[role] ? role==='perc'?sounds[role].rack:rackForPatch(SYNTHS[sounds[role].synth], sounds[role].values, sounds[role].rack, MOVED) : racks[role] ?? { ...cleanRack(), 'master.chain': leanChain(cleanRack()) }),...spaces[role]});
    /** An effect of the voice changed (a classic keeps the instrument's own space controls in its values). */
    async function editRack(role, changes) {
        const space=Object.fromEntries(Object.entries(mixerSpace(changes)).filter(([key,value])=>RACK_PARAMS.BY_KEY[key]&&typeof value==='number'&&Number.isFinite(value)).map(([key,value])=>[key,RACK_PARAMS.clampValue(key,value)]));
        spaces[role]={...mixerSpace(rackValues(role)),...space};
        changes=Object.fromEntries(Object.entries(changes).filter(([key])=>!isMixerSpaceKey(key)));
        const sound = sounds[role];
        if (role==='perc'&&sound) {
            sounds.perc={...sound,rack:{...sound.rack,...changes}};
            loaded.perc={...loaded.perc,rack:sounds.perc.rack};
            g.roles.perc.ensembleRack?.patch(instrumentRack(rackValues(role)));
        } else if (sound) {
            const model = SYNTHS[sound.synth], { native, extra } = splitRackEdits(model, changes, MOVED);
            const values = { ...sound.values, ...native }, rack = { ...sound.rack, ...extra };
            sounds[role] = { ...sound, values, rack };
            const instrument = g.roles[role].instrument;
            if (sound.synth === 'poly' || sound.synth === 'fm') {
                instrument.setSpec(diySpec({ ...sound, values, rack: { ...cleanRack(), 'master.chain': 0 } }, instrument.polyphony));
                g.roles[role].ensembleRack.patch(instrumentRack(rackForPatch(model, values, rack, MOVED)));
            } else {
                instrument.setValues(values);
                instrument.setRack(instrumentRack(rackForPatch(model, values, rack, MOVED)));
            }
        } else {
            racks[role] = { ...(racks[role] ?? { ...cleanRack(), 'master.chain': leanChain(cleanRack()) }), ...changes };
            if(role==='perc')g.roles.perc.ensembleRack?.patch(instrumentRack(rackValues(role)));
            else await nativeRack(role, instrumentRack(racks[role]));
        }
        updateMixer(role);
    }
    const editMixer = (role,changes) => editRack(role,mixerEdits(rackValues(role),changes));
    const mixerSnapshot = () => Object.fromEntries(SEQUENCERS.map(({role})=>{
        const rack=rackValues(role);
        return [role,{...mixerSpace(rack),'master.output':rack['master.output'],space:chainUnits(rack['master.chain']).includes('space')}];
    }));
    async function restoreMixer(saved) {
        for(const {role} of SEQUENCERS) {
            const entry=saved?.[role];
            if(!entry||typeof entry!=='object')continue;
            const chain=chainUnits(rackValues(role)['master.chain']).filter(unit=>unit!=='space');
            if(entry.space===true)chain.push('space');
            const changes={...mixerSpace(entry),'master.output':entry['master.output'],'master.chain':maskFromUnits(chain)};
            if(Object.entries(changes).some(([key,value])=>rackValues(role)[key]!==value))await editRack(role,changes);
        }
    }
    const setTempo = bpm => { tempo=bpm; for(const s of SEQUENCERS)updateMixer(s.role); };
    /** A silent scope tap after all channels and the master gain. */
    async function openMonitor() {
        const monitor = await createOutputMonitor(g.AC);
        if(disposed){monitor.dispose();ensureActive();}
        const silent = g.AC.createGain();
        silent.gain.value = 0;
        masterBus.connect(monitor.node);
        monitor.node.connect(silent);
        silent.connect(g.AC.destination);
        let closed=false;
        return { context: g.AC, requestScope: monitor.requestScope, dispose() { if(closed)return;closed=true;masterBus.disconnect(monitor.node);monitor.dispose();silent.disconnect(); } };
    }

    /** Plan the requested number of complete progression cycles. */
    function capture({ progressions = 4, seed = settings.seed } = {}) {
        const plan = g.planner();
        plan.settings = { ...plan.settings, seed };
        plan.rng = seeded(seed);
        const records = planProgressions(plan, progressions);
        const project = captureProject(records, { stepsPerBar: Math.round(plan.meter.units * 4) });
        return project && { ...project, meter: plan.settings.meter, bpm: records[0].bpm ?? plan.settings.bpm, seed };
    }

    /** One note on a role's instrument, as the generator books its own. */
    function note(role, midi, time, duration, velocity) {
        const instrument = g.roles[role]?.instrument;
        if (instrument?.scheduleNote) instrument.scheduleNote(tunedNote(role,midi), Math.max(time, g.AC.currentTime), duration, velocity);
    }
    const tunedNote = (role, midi, held) => ['poly','fm'].includes(sounds[role]?.synth) ? tuning.note(midi,held) : midi;

    function drum(hit, time, stepSec) {
        const instrument = g.roles.perc.instrument, start = Math.max(time, g.AC.currentTime);
        const track=hit.track??DRUM_TRACKS[sounds.perc?.synth]?.[DRUMS[hit.drum]];
        if (track && instrument.hitTrack) {
            if(hit.params&&Object.keys(hit.params).length)instrument.hitTrack(track,hit.drum,start,hit.velocity,hit.params);
            else instrument.hitTrack(track, hit.drum, start, hit.velocity);
        }
        else instrument.scheduleNote(hit.drum, start, hit.duration * stepSec, hit.velocity, hit.vary ?? 0);
    }
    function drumTrack(track) {
        const instrument=g.roles.perc.instrument;
        if(instrument.hitTrack)instrument.hitTrack(track,0,g.AC.currentTime+.02,.8);
    }

    return {
        g, settings, loaded, editSettings,editRule,restoreBook,get book(){return book;}, applySceneVoices, applyFrontPageLink, setSound, setPreset, soundOf, nativeOf, editNative, editValues, editDrumKit, rackValues, editRack, editMixer, mixerSnapshot, restoreMixer, snapshotSounds, restoreSounds, setupMixer, applyDesk, awaitDeskState,deskStatus,sourcePreviewStatus, openSourceStem, setTempo, openMonitor, openMeters, capture, note, tunedNote, drum, drumTrack, setDrumMix, getDrumMix,
        get context() { return g.AC; },
        async wake() { await g.AC.resume(); await g.awaitRoleMotion?.(); await g.awaitSourceReady?.(); if (g.percussionReady) await g.percussionReady; await Promise.all(Object.values(g.roles).flatMap(r=>[r.ensembleRack,r.mixerRack]).filter(Boolean).map(r=>r.armRuntime?.())); g.endStopFade?.(); },
        setScene(next) { hostScene.scene = next; },
        dispose() { if(disposed)return;disposed=true;sourceTaps.forEach(t=>t.close()); meterTaps.forEach(tap=>tap.dispose());g.stopAll?.();g.disposeSharedEffects?.();deskAudio?.dispose();g.output?.disconnect();g.levelTrim?.disconnect();g.ambienceOut?.disconnect(); Object.values(g.roles).forEach((r) => { r.sourceRevision=(r.sourceRevision??0)+1; r.instrument?.dispose?.(); r.ensembleRack?.dispose?.(); r.mixerRack?.dispose?.(); r.wander?.dispose?.(); }); },
    };
}
