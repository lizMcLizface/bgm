import{assertGeneratorMasterRate}from'./generatorMasterProfile.js';
import{generatorMainBirth}from'./generatorMainBirth.js';
import{generatorMasterScalarBirth}from'./generatorMasterScalarBirth.js';
import{generatorMasterOutputBirth}from'./generatorMasterOutputBirth.js';
import{MAIN_ROLE_IDS}from'./mainRoleControlRecipes.js';
import{generatorMainControlRoot}from'./generatorMainControlRoot.js';
import{generatorMasterScalarRoot}from'./generatorMasterScalarRoot.js';
import{generatorMasterOutputRoot}from'./generatorMasterOutputRoot.js';
import{prepareGeneratorMainControls}from'./generatorMainControlSession.js';
import{prepareGeneratorMasterScalars}from'./generatorMasterScalarSession.js';
import{prepareGeneratorMasterOutput}from'./generatorMasterOutputSession.js';
import{disposeGeneratorSweepCell}from'./generatorSweepCell.js';
const contexts=new WeakMap();
const refuse=message=>Object.assign(Error(message),{code:'GENERATOR_RUST_MASTER_REFUSED'});
const normalize=issue=>issue instanceof Error?issue:Object.assign(Error('Rust master preparation failed: '+String(issue)),{cause:issue});
const aborted=()=>Object.assign(refuse('Rust master preparation cancelled'),{name:'AbortError'});
/** One cold entry for the complete nine-control cohort. Source selections and
 * the Native resume remain explicit caller operations after this resolves. */
export function prepareGeneratorRustMaster(g,{channels,signal}={}){
 let context,roleChannels;
 try{
  assertGeneratorMasterRate(g?.AC);context=g.AC;
  generatorMainBirth(g);generatorMasterScalarBirth(g);generatorMasterOutputBirth(g);
  if(!context||context.state!=='suspended'||context.currentTime!==0||typeof context.startRendering==='function'||typeof g.disposePreparedRouting!=='function'||g.runtimeEnvironmentError||contexts.has(context)||[generatorMainControlRoot(g),generatorMasterScalarRoot(g),generatorMasterOutputRoot(g)].some(Boolean)||g.mainControlPreparation||g.masterScalarPreparation||g.masterOutputPreparation)throw refuse('Virgin unclaimed cold Main, scalar and output ownership required');
  if(!channels||typeof channels!=='object'||Array.isArray(channels)||Object.keys(channels).length!==6||Object.keys(channels).some(id=>!MAIN_ROLE_IDS.includes(id))||MAIN_ROLE_IDS.some(id=>![1,2].includes(channels[id])))throw refuse('Exactly six explicit Main source-channel contracts required');
  roleChannels=Object.freeze(Object.fromEntries(MAIN_ROLE_IDS.map(id=>[id,channels[id]])));
  if(signal&&(typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))throw refuse('Actual AbortSignal required');
  if(signal?.aborted)throw aborted();
 }catch(thrown){throw normalize(thrown);}
 const record={state:'preparing',phase:null,roleRoot:null,scalarRoot:null,outputRoot:null};contexts.set(context,record);
 const work=(async()=>{try{
  const current=()=>{if(signal?.aborted)throw aborted();if(context.state!=='suspended'||context.currentTime!==0)throw refuse('Rust master cold prerequisite advanced during preparation');};
  current();record.phase='role';record.roleRoot=await prepareGeneratorMainControls(g,{channels:roleChannels,signal});record.phase=null;current();
  record.phase='scalar';record.scalarRoot=await prepareGeneratorMasterScalars(g,{signal});record.phase=null;current();
  record.phase='output';record.outputRoot=await prepareGeneratorMasterOutput(g,{signal});record.phase=null;current();record.state='ready';let closing=null;
  return Object.freeze({roleRoot:record.roleRoot,scalarRoot:record.scalarRoot,outputRoot:record.outputRoot,
   activate(){if(record.state!=='ready'&&record.state!=='active')return Promise.reject(refuse('Rust master bundle is retired'));let activation;try{activation=record.outputRoot.activate();}catch(thrown){activation=Promise.reject(thrown);}return Promise.resolve(activation).then(value=>{if(record.state==='ready')record.state='active';return value;},thrown=>{const primary=normalize(thrown);g.runtimeEnvironmentError??=primary;record.state='failed';throw primary;});},
   dispose(){if(closing)return closing;if(g.stopFade||g.fadeTimer||g.endTimer)throw refuse('Finish authored master timers before bundle destruction');record.state='disposing';closing=Promise.resolve().then(()=>g.disposePreparedRouting()).then(receipt=>{record.state='disposed';return receipt;},thrown=>{const primary=normalize(thrown);g.runtimeEnvironmentError??=primary;record.state='failed';throw primary;});closing.catch(()=>{});return closing;}
  });
 }catch(thrown){
  const primary=normalize(thrown);g.runtimeEnvironmentError??=primary;const cleanupIssues=[];let prefixClean=record.phase===null;
  // A failed acquisition is not certified from its groupStatus/ownerStatus.
  if(record.phase){if(primary.cleanupReady?.then)try{const receipt=await primary.cleanupReady;prefixClean=receipt?.released===true&&receipt.clean===true;if(!prefixClean)cleanupIssues.push(refuse('Failed acquisition returned unclean terminal receipt'));}catch(issue){cleanupIssues.push(normalize(issue));}else cleanupIssues.push(refuse('Failed acquisition has no actual completed-prefix cleanup authority'));}
  for(const [name,close]of[['sweep',()=>disposeGeneratorSweepCell(g)],['output',record.outputRoot?()=>record.outputRoot.dispose():null],['scalar',record.scalarRoot?()=>record.scalarRoot.dispose():null],['role',record.roleRoot?()=>record.roleRoot.dispose():null]])if(close)try{const receipt=await close();if(receipt?.released!==true||receipt.clean!==true)throw refuse('Actual '+name+' cleanup was not wholly clean');}catch(issue){cleanupIssues.push(normalize(issue));}
  const retainedFlags=Object.fromEntries(['mainControlPreparation','masterScalarPreparation','masterOutputPreparation'].map(key=>[key,g[key]===true]));
  record.state='failed';primary.rustMasterPreparation=Object.freeze({profile:'generator-rust-master-failed-preparation-v1',failedPhase:record.phase,knownRoots:Object.freeze({role:!!record.roleRoot,scalar:!!record.scalarRoot,output:!!record.outputRoot}),retainedFlags:Object.freeze(retainedFlags),prefixClean,cleanupComplete:prefixClean&&!primary.cleanupError&&!cleanupIssues.length&&!Object.values(retainedFlags).some(Boolean)});
  if(cleanupIssues.length)primary.cleanupError=new AggregateError([...(primary.cleanupError?[primary.cleanupError]:[]),...cleanupIssues],'Rust master partial preparation cleanup is uncertain');throw primary;
 }})();work.catch(()=>{});return work;
}
