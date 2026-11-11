// Exact original generator KS preparation; this worker never creates Web Audio nodes.
import {loadOwnedPluckedString,pluckedStringBufferSpec} from '../../modular-audio/ownedPluckedString.js';
let renderer;
self.onmessage=async({data:{id,sampleRate,freq,settings,renderer:backend='rust'}})=>{
 let note;
 try{
  if(backend!=='rust')throw Error('Plucked live preparation requires its owned Rust renderer');
  renderer??=loadOwnedPluckedString().catch(error=>{renderer=null;throw error;});
  const code=await renderer,spec=pluckedStringBufferSpec(sampleRate,freq,settings);
  note=code.prepare(spec);const samples=note.samples.slice();
  self.postMessage({id,material:'plucked',renderer:'rust',version:code.version,spec,samples,body:null},[samples.buffer]);
 }catch(error){self.postMessage({id,error:String(error?.message??error)});}
 finally{note?.dispose();}
};
