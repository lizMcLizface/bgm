import React,{useRef,useState} from 'react';
import {encodeArrangement,decodeArrangement,arrangementFileName} from './arrangementFile';

// Save the whole arrangement to a file and open one: the patterns, song and loop, the machine's sound and the effects rack.
// The page also keeps its own copy in the browser's storage, so a file is for keeping, sending and moving to another machine.
export default function ArrangementFile({kit,synth,seq,values,rack,name,choose}){
 const [status,setStatus]=useState(''),input=useRef(null);
 const save=()=>{
  try{
   const bank=seq.bankRef.current,text=encodeArrangement(kit,{bank,values,rack,name});
   const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');
   a.href=url;a.download=arrangementFileName(kit,bank,name);document.body.append(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Saved '+a.download);
  }catch{setStatus('Could not save the arrangement');}
 };
 const open=async e=>{
  const file=e.target.files?.[0];e.target.value='';
  if(!file)return;
  try{
   const loaded=decodeArrangement(kit,synth,await file.text());
   seq.loadBank(loaded.bank);
   choose({name:loaded.name,values:loaded.values,...(loaded.rack?{rack:loaded.rack}:{})});
   setStatus('Opened '+file.name);
  }catch(err){setStatus(err.message||'Could not open the file');}
 };
 return <span className="drum-share">
  <button type="button" onClick={save} title="Save every pattern, the song and loop, the sound and the effects to a file">Save arrangement</button>
  <button type="button" onClick={()=>input.current?.click()} title="Open an arrangement file saved from this machine">Open…</button>
  <input ref={input} type="file" accept=".json,application/json" hidden onChange={open}/>
  <span role="status">{status}</span>
 </span>;
}
