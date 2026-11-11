import{observePreparedMotion}from'./motionHostReview.js';
import{observeNativeRackAll}from'./nativeRackAllReview.js';
import{maskFromUnits}from'../src/synths/effects/order.js';
import{appendHostCheckFailure}from'./rackDynamicsHostDiagnostics.js';
import{libraryVoice}from'../src/labs/catalog.js';
import{SYNTHS}from'../src/synths/models.js';
import{prepareOwnedHostEnvironment}from'../src/modular-audio/ownedHostEnvironment.js';
import{audioContext}from'../src/audio/context.js';
import{runAllDeskHostReview}from'../src/modular-audio/allDeskHostSuite.js';
import{createHost}from'../src/synths/all/host.js';
import{BROWSABLE_SCENES}from'../src/app/scenes.js';
import{renderPcm,planNotes}from'../src/app/engine/render.js';
const $=id=>document.getElementById(id),progress=s=>$('status').textContent=s,buttons=[...document.querySelectorAll('button')];
async function live(mode){const motionReview=observePreparedMotion(await prepareOwnedHostEnvironment(audioContext)),originalEnv=motionReview.environment,nativeRackReview=mode==='nativeRack'?observeNativeRackAll(originalEnv,progress):null,preparedEnv=nativeRackReview?.environment??originalEnv,pluginNodes=[],echoOwners=[],dynamicsOwners=[],env={...preparedEnv,...(mode==='dynamics'?{rackDynamicsFactory:(...args)=>{const owner=preparedEnv.rackDynamicsFactory(...args);dynamicsOwners.push(owner);return owner;}}:{}),echoFactory:async(...args)=>{const owner=await preparedEnv.echoFactory(...args);echoOwners.push(owner);return owner;},...(mode==='rack'?{rackPluginFactory:async(...args)=>{const node=await preparedEnv.rackPluginFactory(...args);pluginNodes.push(node);return node;}}:{})},classic=mode==='classic'||mode==='rack'||mode==='dynamics'||mode==='nativeRack',measured=mode==='measured',physical=mode==='physical',sourceSelections=physical?[['lead','calmbgm','Nylon Guitar',libraryVoice('Nylon Guitar').patch],['counter','calmbgm','Soft Harp',libraryVoice('Soft Harp').patch],['rhythm','calmbgm','Kalimba Pluck',libraryVoice('Kalimba Pluck').patch],['pad','piano','House Piano'],['bass','calmbgm','Upright Pluck',libraryVoice('Upright Pluck').patch],['perc','kit','hand']]:classic?[['lead','juno',SYNTHS.juno.presets[0].name],['counter','dx7',SYNTHS.dx7.presets[0].name],['rhythm','piano','House Piano'],['pad','iowa','Flute'],['bass','minimoog',SYNTHS.minimoog.presets[0].name],['perc','tr808',SYNTHS.tr808.presets[0].name]]:measured?[['lead','iowa','Flute'],['counter','iowa','Iowa Bb Clarinet'],['rhythm','piano','House Piano'],['pad','piano','Ravel'],['bass','poly','Soft Pad'],['perc','kit','hand']]:undefined;const report=await runAllDeskHostReview({audioEnvironment:env,sourceSelections,progress,rackPluginExercise:mode==='rack',rackDynamicsExercise:mode==='dynamics',rackNativeReview:nativeRackReview?.review});if(nativeRackReview){report.rackNativeOwners=await nativeRackReview.finish();if(report.rackNativeOwners.length<6||report.rackNativeOwners.some(e=>!e.disposed||!e.innerReleased||e.error||e.cleanupError))appendHostCheckFailure(report,'Missing or unreleased actual Width/Ring owners');}report.motionReview=await motionReview.finish();if(!report.motionReview.checksPassed)appendHostCheckFailure(report,'Missing, failed or unreleased parent-owned Motion stages');report.kind='owned-active-host.normal-all';report.material=mode;if(mode==='dynamics'){report.rackDynamicsOwners=dynamicsOwners.map(o=>({kind:o.kind,engineVersion:o.engineVersion,error:o.error,failureState:o.failureState??null,disposed:o.disposed,snapshot:o.snapshot()}));if(dynamicsOwners.filter(o=>o.kind==='limiter').length<6||dynamicsOwners.some(o=>o.error)){appendHostCheckFailure(report,'Missing or failed owned normal rack dynamics');}}report.echoOwners=echoOwners.map(o=>({backend:o.backend,hostVersion:o.hostVersion,engineVersion:o.engineVersion}));if(echoOwners.some(o=>o.backend!=='owned-rust')){appendHostCheckFailure(report,'Missing owned echo in prepared routes');}if(mode==='rack'){report.rackPluginNodes=pluginNodes.map(n=>({backend:n.sourceBackend,hostVersion:n.hostVersion,engineVersion:n.engineVersion}));if(pluginNodes.length<9||pluginNodes.some(n=>n.sourceBackend!=='owned-rust')){appendHostCheckFailure(report,'Missing owned rack nodes across three hosts');}}report.boundaries=env.boundaries;$('report').value=JSON.stringify(report,null,2);for(const c of report.cases){for(const role of classic?['rhythm']:physical?['pad']:['rhythm','pad'])if(c.sources[role].sourceBackend!=='owned-rust'||c.sources[role].compressorBackend!=='owned-rust')throw Error(`Missing owned piano/compressor on ${role}`);if(measured&&['lead','counter'].some(role=>(c.sources[role].sourceBackend!=='owned-rust'||c.sources[role].ordinaryDynamicsBackend!=='owned-rust')))throw Error('Missing owned Iowa source or limiter');if(classic){for(const role of ['lead','counter','bass','perc'])if(c.sources[role].sourceBackend!=='owned-rust'||c.sources[role].classicKernels<1)throw Error('Missing owned CLASSIC source '+role);if(c.sources.pad.sourceBackend!=='owned-rust')throw Error('Missing owned Iowa source');}if(physical)for(const role of ['lead','counter','rhythm','pad','bass'])if(c.sources[role].sourceBackend!=='owned-rust'||c.sources[role].compressorBackend!=='owned-rust')throw Error('Missing owned physical source/compressor '+role);if(c.roleMotionBackend!=='owned-rust')throw Error('Missing owned role motion');}return report;}

async function offline(material='piano'){let host;const report={kind:'owned-active-host.cold-score-export',version:1,material,muted:true,checksPassed:false};try{await audioContext.resume();const env=await prepareOwnedHostEnvironment(audioContext);host=createHost({...BROWSABLE_SCENES[0],voices:{},layerVoices:{},percussion:null},{seed:109,audioEnvironment:env});host.g.output.gain.value=0;await host.g.awaitRoleMotion();const candidate=planNotes(host.g,Object.fromEntries(Object.keys(host.g.roles).filter(r=>r!=='perc').map(r=>[r,true])),3,false).notes.find(n=>material!=='iowa'||n.midi>=56&&n.midi<=96);if(!candidate)throw Error('Fixed score has no melodic note in its first three seconds');const selectedRole=candidate.role;await host.setSound(selectedRole,material==='iowa'?{synth:'iowa',name:'Flute'}:{synth:'piano',name:'House Piano'});for(const [role,r]of Object.entries(host.g.roles)){r.mute=role!==selectedRole;r.solo=role===selectedRole;r.volume=.5;}host.g.settings.playMusic=true;host.g.settings.playAmbience=false;host.g.applyMix();const planned=planNotes(host.g,{[selectedRole]:true},3,false).notes;report.plannedNotes=planned.length;report.onlyRole=selectedRole;report.ambience=false;const settings=JSON.stringify(host.g.settings);let peak=0,sampleCount=0;progress('Cold owned '+material+'-only score export');const result=await renderPcm(host.g,3,{onChunk:pcm=>{sampleCount+=pcm.length;for(const v of pcm)peak=Math.max(peak,Math.abs(v));}});Object.assign(report,{...result,peak,sampleCount,songUnchanged:JSON.stringify(host.g.settings)===settings,boundaries:env.boundaries,checksPassed:planned.length>0&&peak>0&&sampleCount===result.frames*2&&JSON.stringify(host.g.settings)===settings});}catch(e){report.error=String(e);}finally{host?.dispose();await audioContext.suspend();}return report;}

// Review instrumentation wraps only newly prepared renderer contexts. It does
// not forward a live-context factory into the OfflineAudioContext.
function observeExportEnvironment(environment, records) {
 const wrap = (prepared, record = null) => Object.freeze({...prepared,
  ...(record ? {
   rackDynamicsFactory:(context, options)=>{
    const owner=prepared.rackDynamicsFactory(context,options),entry={owner,kind:owner.kind,contextBound:context===prepared.context,disposeCalls:0,stats:null,error:null,closing:null};record.owners.push(entry);
    const dispose=owner.dispose.bind(owner);
    owner.dispose=()=>{
     entry.disposeCalls++;
     return entry.closing??=(async()=>{
      try{entry.health=await owner.health;if(!owner.error&&!owner.disposed)entry.stats=await owner.requestStats();}
      catch(error){entry.error=String(error);}
      finally{await dispose();}
     })();
    };
    return owner;
   },
   rackNativeFactory:(context,options)=>{
    const owner=prepared.rackNativeFactory(context,options),entry={owner,kind:options.kind,contextBound:context===prepared.context,disposeCalls:0,stats:null,snapshot:null,error:null,closing:null};record.nativeRackOwners.push(entry);
    const dispose=owner.dispose.bind(owner);owner.dispose=()=>{entry.disposeCalls++;return entry.closing??=Promise.resolve().then(async()=>{try{entry.health=await owner.health;if(!owner.error&&!owner.disposed){entry.snapshot=owner.snapshot();entry.stats=await owner.requestStats();}}catch(error){entry.error=String(error);}finally{await dispose();entry.disposed=owner.disposed;entry.innerReleased=owner.inner?.node===null;}});};return owner;
   },
   classicSourceNodeFactory:async(context,options)=>{
    const node=await prepared.classicSourceNodeFactory(context,options),entry={node,model:options.model,eventCount:options.events?.length??0,expectedApplied:(options.events??[]).filter(e=>Math.round(e[4]*context.sampleRate)<Math.ceil(context.length/128)*128).length,contextBound:context===prepared.context,disposeCalls:0,stats:null,error:null,closing:null};record.sources.push(entry);
    const handle=node.handleOwnedMessage.bind(node),dispose=node.disposeOwned.bind(node);
    node.handleOwnedMessage=data=>{if(data.type==='stats')entry.stats=structuredClone(data);if(data.type==='error')entry.error=String(data.message);return handle(data);};
    node.disposeOwned=()=>{entry.disposeCalls++;return entry.closing??=Promise.resolve(dispose()).then(()=>{entry.disposed=true;});};
    return node;
   }
  } : {}),
  prepareContext:async context=>{
   const next=await prepared.prepareContext(context),entry={context,contextBound:next.context===context,newContext:context!==environment.context,offline:Number.isFinite(context.length),owners:[],nativeRackOwners:[],sources:[]};records.push(entry);return wrap(next,entry);
  }
 });
 return wrap(environment);
}
const exportDynamicsRack=()=>({'master.chain':maskFromUnits(['compressor','limiter']),'compressor.enabled':1,'compressor.threshold':-32,'compressor.ratio':7,'compressor.mix':.65,'compressor.makeup':3,'limiter.ceiling':-8});
async function classicExportCase(material,family='dynamics'){
 let host;const records=[],report={kind:'owned-active-host.cold-classic-'+family+'-export',version:1,material,muted:true,checksPassed:false,scope:'Normal renderPcm health/routing/disposal check; no Native PCM identity claim',fixtureSourceRack:family==='nativeRack'?'Active Width and Ring authored through the CLASSIC instrument setRack API, including the machine source rack; external live All desk is not substituted for the offline source rack':'Active compressor and limiter authored through the CLASSIC instrument setRack API, including the machine source rack; external live All desk is not substituted for the offline source rack'};
 try{
  await audioContext.resume();const prepared=await prepareOwnedHostEnvironment(audioContext),env=observeExportEnvironment(prepared,records);
  host=createHost({...BROWSABLE_SCENES[0],voices:{},layerVoices:{},percussion:null},{seed:109,audioEnvironment:env});host.g.output.gain.value=0;await host.g.awaitRoleMotion();
  let role;
  if(material==='machine'){
   role='perc';host.g.setMany({drums:{...host.g.settings.drums,style:'electro',activity:.8,variation:0,sprinkle:0},sections:{...host.g.settings.sections,mode:'off'}});
   await host.setSound(role,{synth:'tr808',name:SYNTHS.tr808.presets[0].name});
  }else{
   const candidate=planNotes(host.g,Object.fromEntries(Object.keys(host.g.roles).filter(r=>r!=='perc').map(r=>[r,true])),3,false).notes[0];if(!candidate)throw Error('Fixed score has no melodic note');role=candidate.role;
   await host.setSound(role,{synth:'juno',name:SYNTHS.juno.presets[0].name});
  }
  const instrument=host.g.roles[role].instrument;
  instrument.setRack({...instrument.preset.classics.rack,...(family==='nativeRack'?{'master.routing':0,'master.chain':maskFromUnits(['width','ring']),'width.amount':.6,'ring.freq':911,'ring.mix':.37,'switch.width':1,'switch.ring':1}:exportDynamicsRack())});
  for(const [name,r]of Object.entries(host.g.roles)){r.mute=name!==role;r.solo=name===role;r.volume=.5;}
  host.g.settings.playMusic=true;host.g.settings.playAmbience=false;host.g.applyMix();
  const notes=planNotes(host.g,{[role]:true},3,false).notes,settings=JSON.stringify(host.g.settings),preset=JSON.stringify(instrument.preset),synth=instrument.preset.classics.synth;
  Object.assign(report,{onlyRole:role,plannedNotes:notes.length,machine:host.g.roles.perc.machine===true,constructorSite:material==='machine'?'perc.machine CLASSIC.create':'melodic preset.classics CLASSIC.create',synth,expectedModel:SYNTHS[synth].model,rack:structuredClone(instrument.preset.classics.rack)});
  if(!notes.length)throw Error('Fixed normal score has no notes for '+role);
  let peak=0,sampleCount=0;progress('Cold '+synth+' score through owned rack '+family);
  const result=await renderPcm(host.g,3,{onChunk:pcm=>{sampleCount+=pcm.length;for(const value of pcm)peak=Math.max(peak,Math.abs(value));}});
  // The renderer invokes normal teardown; await its observed owner promises to
  // check completion even on implementations where the caller returns earlier.
  await Promise.all(records.flatMap(r=>[...r.owners,...r.nativeRackOwners,...r.sources].map(e=>e.closing??Promise.reject(Error('Renderer did not dispose an observed owner')))));
  Object.assign(report,{...result,peak,sampleCount,songUnchanged:JSON.stringify(host.g.settings)===settings,sourcePresetUnchanged:JSON.stringify(instrument.preset)===preset});
  report.contexts=records.map(r=>({contextBound:r.contextBound,newContext:r.newContext,offline:r.offline,sampleRate:r.context.sampleRate,length:r.context.length,state:r.context.state,
   owners:r.owners.map(e=>({kind:e.kind,contextBound:e.contextBound,engineVersion:e.owner.engineVersion,health:e.health,stats:e.stats,error:e.error??e.owner.error,cleanupError:e.owner.cleanupError??null,disposed:e.owner.disposed,nodeReleased:e.owner.node===null,disposeCalls:e.disposeCalls,snapshot:e.owner.snapshot()})),
   nativeRackOwners:r.nativeRackOwners.map(e=>({kind:e.kind,contextBound:e.contextBound,facadeVersion:e.owner.facadeVersion,health:e.health,stats:e.stats,snapshot:e.snapshot,error:e.error??e.owner.error,cleanupError:e.owner.cleanupError??null,disposed:e.disposed===true,innerReleased:e.innerReleased===true,disposeCalls:e.disposeCalls})),
   sources:r.sources.map(e=>({model:e.model,eventCount:e.eventCount,expectedApplied:e.expectedApplied,contextBound:e.contextBound,backend:e.node.sourceBackend,engineVersion:e.node.engineVersion,stats:e.stats,error:e.error,disposed:e.disposed===true,disposeCalls:e.disposeCalls}))}));
  const validContext=r=>r.contextBound&&r.newContext&&r.offline&&r.state==='closed'&&r.sources.some(e=>e.contextBound&&e.model===report.expectedModel&&e.eventCount>=notes.length*2&&e.backend==='owned-rust'&&e.stats?.final===true&&e.stats.applied===e.expectedApplied&&e.stats.late===0&&e.disposed&&!e.error)&&(family==='nativeRack'?['width','ring'].every(kind=>r.nativeRackOwners.some(e=>e.kind===kind&&e.stats?.processedFrames>0&&e.stats.authoredSequence===e.stats.commands&&e.stats.commands>0&&e.stats.targets[0]===(kind==='width'?Math.fround(.8):911)&&e.snapshot.settings[kind==='width'?'amount':'freq']===(kind==='width'?.6:911)))&&r.nativeRackOwners.every(e=>e.contextBound&&e.health?.ready&&!e.error&&!e.cleanupError&&!e.stats?.error&&e.disposed&&e.innerReleased):['compressor','limiter'].every(kind=>r.owners.some(e=>e.kind===kind&&e.stats?.processedFrames>0&&e.stats.authoredSequence>0&&e.stats.targets[0]===(kind==='compressor'?-32:-8)&&e.snapshot.values[0]===(kind==='compressor'?-32:-8))))&&r.owners.every(e=>e.contextBound&&e.health?.ready&&!e.error&&!e.cleanupError&&!e.stats?.error&&e.disposed&&e.nodeReleased);
  report.checksPassed=peak>0&&sampleCount===result.frames*2&&report.songUnchanged&&report.sourcePresetUnchanged&&records.length>0&&report.contexts.every(validContext);
 }catch(error){report.error=String(error);report.stack=error.stack;report.diagnostics=error.diagnostics??null;}
 finally{
  try{await host?.dispose();}catch(error){appendHostCheckFailure(report,'Live fixture cleanup: '+error);}
  await audioContext.suspend();
  if(!report.contexts)report.contexts=records.map(r=>({offline:r.offline,newContext:r.newContext,contextBound:r.contextBound,state:r.context.state,owners:r.owners.map(e=>({kind:e.kind,error:e.error??e.owner.error,disposed:e.owner.disposed,stats:e.stats})),nativeRackOwners:r.nativeRackOwners.map(e=>({kind:e.kind,error:e.error??e.owner.error,disposed:e.owner.disposed,innerReleased:e.owner.inner?.node===null,stats:e.stats,snapshot:e.snapshot})),sources:r.sources.map(e=>({model:e.model,error:e.error,disposed:e.disposed,stats:e.stats}))}));
 }
 return report;
}
async function classicExports(family='dynamics'){const cases=[];for(const material of ['classic','machine']){const result=await classicExportCase(material,family);cases.push(result);if(!result.checksPassed)break;}return{kind:'owned-active-host.cold-classic-'+family+'-export-batch',version:1,muted:true,cases,checksPassed:cases.length===2&&cases.every(c=>c.checksPassed),error:cases.find(c=>c.error)?.error??null};}

for(const [id,run]of [['mixed',()=>live('mixed')],['measured',()=>live('measured')],['classic',()=>live('classic')],['physical',()=>live('physical')],['rack',()=>live('rack')],['dynamics',()=>live('dynamics')],['nativeRack',()=>live('nativeRack')],['offline',()=>offline('piano')],['iowaOffline',()=>offline('iowa')],['classicExports',()=>classicExports()],['nativeRackExports',()=>classicExports('nativeRack')]])$(id).onclick=async()=>{buttons.forEach(b=>b.disabled=true);try{const r=await run();$('report').value=JSON.stringify(r,null,2);$('summary').textContent=JSON.stringify({kind:r.kind,checksPassed:r.checksPassed,cases:r.cases?.length,peak:r.peak,error:r.error},null,2);$('status').textContent=r.checksPassed?'Checks passed':'Checks failed';}catch(e){$('status').textContent=String(e);}finally{buttons.forEach(b=>b.disabled=false);}};
