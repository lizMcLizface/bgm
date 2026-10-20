import React,{useEffect,useMemo,useRef,useState} from 'react';
import {decodeTape} from './tape';
import {decodePatch,engineValues} from './patch';
import {factoryName} from './names';
import {sanitize,intoLayer,LAYER_KEYS} from './params';
import {load,save} from '../storage';
import {localBanks,fetchLocalBank,preferredBank} from '../localBanks';

// A Jupiter-8 style patch selector (bank 1–8, number 1–8) for a tape recording
// decoded in the browser. Only the decoded patches are kept in this browser, never
// the recording; nothing is bundled with the site. Patches whose checksum failed are
// marked, and so are numbers missing from the tape. A patch loads into the layer
// being edited; the other layer and the key mode stay as they are. On your own machine, recordings
// in banks/jupiter-8/ are offered here and the factory one loads by itself.
export const BANK_KEY='synths:jupiter8:tape';
const hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
const unhex=text=>Uint8Array.from(text.match(/../g),h=>parseInt(h,16));
export const patchCode=n=>`${Math.floor(n/8)+1}${n%8+1}`;

function slotsFrom(patches){
 const slots=Array(64).fill(null);
 for(const p of patches){
  const data=p.data instanceof Uint8Array?p.data:unhex(p.data);
  slots[p.number]={number:p.number,code:patchCode(p.number),damaged:!!p.damaged,name:factoryName(data),values:engineValues(decodePatch(data))};
 }
 return slots;
}

export function readStoredTape(){
 const stored=load(BANK_KEY,null);
 if(!stored?.patches?.length)return null;
 try{return {name:stored.name,slots:slotsFrom(stored.patches)};}catch{return null;}
}

export default function TapeBrowser({current,choose,values,layer='upper'}){
 const [tape,setTape]=useState(readStoredTape);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [cursor,setCursor]=useState(0);
 const [local,setLocal]=useState([]);
 const file=useRef(null);
 const index=useMemo(()=>{const m=/^(?:Lower )?([1-8])([1-8]) /.exec(current??'');return m?(m[1]-1)*8+(m[2]-1):cursor;},[current,cursor]);
 const pick=i=>{
  const n=(i+64)%64,slot=tape?.slots[n];setCursor(n);
  if(!slot)return;
  // the lower layer takes only the patch; the upper layer also sets the (dry) effects, as the hardware sounds
  const patch=layer==='lower'?Object.fromEntries(Object.entries(slot.values).filter(([k])=>LAYER_KEYS.includes(k))):slot.values;
  choose({name:`${layer==='lower'?'Lower ':''}${slot.code} ${slot.name}`.trim(),values:sanitize({...values,...intoLayer(patch,layer)})});
 };
 const accept=async(bytes,name)=>{
  setBusy(true);setMessage(`Decoding ${name}…`);
  // let the message paint before the (synchronous) decode
  await new Promise(r=>setTimeout(r,30));
  try{
   const result=decodeTape(bytes);
   if(!result.patches.length){setMessage('No Jupiter-8 patches found in that recording.');return;}
   const patches=result.patches.map(p=>({number:p.number,data:hex(p.data),damaged:p.damaged}));
   save(BANK_KEY,{name,patches});setTape({name,slots:slotsFrom(patches)});
   const damaged=patches.filter(p=>p.damaged).length,missing=64-patches.length;
   setMessage(`Decoded ${patches.length} patches from ${name}`+(damaged?`, ${damaged} damaged`:'')+(missing?`, ${missing} missing`:'')+'.');
  }catch(e){setMessage(`Could not decode ${name} (${e.message}).`);}
  finally{setBusy(false);}
 };
 const fromLocal=async entry=>{
  try{await accept(await fetchLocalBank(entry),entry.name);}
  catch(e){setMessage(`Could not load ${entry.name} (${e.message}).`);}
 };
 useEffect(()=>{let live=true;localBanks('jupiter-8').then(list=>{
  const wavs=list.filter(b=>/\.wav$/i.test(b.name));
  if(!live)return;setLocal(wavs);
  const first=preferredBank(wavs);if(first&&!readStoredTape())fromLocal(first);
 });return()=>{live=false;};},[]);
 const fromFile=async e=>{const f=e.target.files?.[0];e.target.value='';if(f)await accept(new Uint8Array(await f.arrayBuffer()),f.name);};
 const localButtons=<span className="bank-local" role="group" aria-label="Your local tapes">{local.map(b=><button type="button" key={b.name} disabled={busy} className={tape?.name===b.name?'on':''} onClick={()=>fromLocal(b)}>{b.name.replace(/\.wav$/i,'')}</button>)}</span>;
 const importer=<span className="bank-import">
  <input ref={file} type="file" accept=".wav,audio/wav,audio/x-wav" hidden onChange={fromFile}/>
  <button type="button" disabled={busy} onClick={()=>file.current.click()}>Load tape .wav</button>
  {local.length>0&&localButtons}
  {message&&<span className="bank-message" role="status">{message}</span>}
 </span>;
 if(!tape)return <div className="bank empty">
  <span className="bank-title">Jupiter-8 tape</span>
  {importer}
  <span className="bank-hint">Load a WAV recording of a Jupiter-8 patch tape (mono or stereo, any common sample rate). Only the decoded patches stay in this browser.</span>
 </div>;
 const bank=Math.floor(index/8),num=index%8,slot=tape.slots[index];
 return <div className="bank">
  <span className="bank-buttons" role="group" aria-label="Bank">{Array.from({length:8},(_,i)=><button type="button" key={i} className={bank===i?'on':''} onClick={()=>pick(i*8+num)}>{i+1}</button>)}</span>
  <span className="bank-buttons numbers" role="group" aria-label="Number">{Array.from({length:8},(_,i)=><button type="button" key={i} className={num===i?'on':''} onClick={()=>pick(bank*8+i)}>{i+1}</button>)}</span>
  <span className="bank-step"><button type="button" aria-label="Previous patch" onClick={()=>pick(index-1)}>◂</button><button type="button" aria-label="Next patch" onClick={()=>pick(index+1)}>▸</button></span>
  <span className="bank-name"><b>{patchCode(index)}</b> {slot?(slot.name||'(not a factory patch)'):'missing from the tape'}{slot?.damaged?' · damaged: values may be wrong':''}</span>
  {local.length>1&&localButtons}
  <details className="bank-more"><summary>Tape</summary><div className="bank-menu"><span>{tape.name}</span>{importer}<button type="button" onClick={()=>{save(BANK_KEY,null);setTape(null);setMessage('');}}>Remove tape</button></div></details>
 </div>;
}
