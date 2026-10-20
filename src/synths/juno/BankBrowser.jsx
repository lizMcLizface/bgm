import React,{useEffect,useMemo,useRef,useState} from 'react';
import {bankFromSysex,patchCode} from './sysex';
import {sanitize} from './params';
import {load,save} from '../storage';
import {localBanks,fetchLocalBank,preferredBank} from '../localBanks';

// A Juno-106 style patch selector (group A/B, bank 1–8, number 1–8) for an
// imported .syx bank. Banks live only in this browser: nothing is bundled with
// the site, so factory or third-party patch data is never redistributed. On your own
// machine, banks in banks/juno-106/ are offered here and the factory one loads by itself.
export const BANK_KEY='synths:juno:bank';
const toBase64=bytes=>btoa(String.fromCharCode(...bytes));
const fromBase64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));

export function readStoredBank(){
 const stored=load(BANK_KEY,null);
 if(!stored?.data)return null;
 try{const slots=bankFromSysex(fromBase64(stored.data));return slots.some(Boolean)?{name:stored.name,slots}:null;}catch{return null;}
}

export default function BankBrowser({current,choose}){
 const [bank,setBank]=useState(readStoredBank);
 const [message,setMessage]=useState('');
 const [url,setUrl]=useState(()=>load(BANK_KEY+':url',''));
 const [cursor,setCursor]=useState(0);
 const [local,setLocal]=useState([]);
 const file=useRef(null);
 // the loaded patch's own code wins over the cursor
 const index=useMemo(()=>{const m=/^([AB])([1-8])([1-8]) /.exec(current);return m?(m[1]==='B'?64:0)+(m[2]-1)*8+(m[3]-1):cursor;},[current,cursor]);
 const pick=i=>{
  const slot=bank?.slots[(i+128)%128];setCursor((i+128)%128);
  if(slot)choose({name:`${slot.code} ${slot.name}`.trim(),values:sanitize(slot.values)});
 };
 const accept=(bytes,name)=>{
  const slots=bankFromSysex(bytes),count=slots.filter(Boolean).length;
  if(!count){setMessage('No Juno-106 patches found in that file.');return;}
  save(BANK_KEY,{name,data:toBase64(bytes)});setBank({name,slots});setMessage(`Loaded ${count} patch${count>1?'es':''} from ${name}.`);
 };
 const fromLocal=async entry=>{
  try{accept(await fetchLocalBank(entry),entry.name);}
  catch(e){setMessage(`Could not load ${entry.name} (${e.message}).`);}
 };
 // local banks: list them, and load the preferred one when this browser has none yet
 useEffect(()=>{let live=true;localBanks('juno-106').then(list=>{
  if(!live)return;setLocal(list);
  const first=preferredBank(list);if(first&&!readStoredBank())fromLocal(first);
 });return()=>{live=false;};},[]);
 const fromFile=async e=>{const f=e.target.files?.[0];e.target.value='';if(f)accept(new Uint8Array(await f.arrayBuffer()),f.name);};
 const fromUrl=async()=>{
  try{const r=await fetch(url);if(!r.ok)throw Error(`HTTP ${r.status}`);save(BANK_KEY+':url',url);accept(new Uint8Array(await r.arrayBuffer()),url.split('/').pop()||'bank.syx');}
  catch(e){setMessage(`Could not load that link (${e.message}). Download the file and use “Load .syx file” instead.`);}
 };
 const importer=<span className="bank-import">
  <input ref={file} type="file" accept=".syx,application/octet-stream" hidden onChange={fromFile}/>
  <button type="button" onClick={()=>file.current.click()}>Load .syx file</button>
  <input type="url" placeholder="…or paste a link to a .syx file" value={url} onChange={e=>setUrl(e.target.value)} aria-label="Link to a .syx file"/>
  <button type="button" disabled={!url} onClick={fromUrl}>Load link</button>
  {local.length>0&&<span className="bank-local" role="group" aria-label="Your local banks">{local.map(b=><button type="button" key={b.name} className={bank?.name===b.name?'on':''} onClick={()=>fromLocal(b)}>{b.name.replace(/\.syx$/i,'')}</button>)}</span>}
  {message&&<span className="bank-message" role="status">{message}</span>}
 </span>;
 if(!bank)return <div className="bank empty">
  <span className="bank-title">Juno-106 bank</span>
  {importer}
  <span className="bank-hint">Load a Juno-106 SysEx bank (128 patches, 3 KB). It stays in this browser.</span>
 </div>;
 const group=index<64?0:1,bankNo=Math.floor(index%64/8),num=index%8;
 const at=(g,b,n)=>g*64+b*8+n;
 const slot=bank.slots[index];
 return <div className="bank">
  <span className="bank-buttons" role="group" aria-label="Group">{['A','B'].map((g,i)=><button type="button" key={g} className={group===i?'on':''} onClick={()=>pick(at(i,bankNo,num))}>{g}</button>)}</span>
  <span className="bank-buttons" role="group" aria-label="Bank">{Array.from({length:8},(_,i)=><button type="button" key={i} className={bankNo===i?'on':''} onClick={()=>pick(at(group,i,num))}>{i+1}</button>)}</span>
  <span className="bank-buttons numbers" role="group" aria-label="Number">{Array.from({length:8},(_,i)=><button type="button" key={i} className={num===i?'on':''} onClick={()=>pick(at(group,bankNo,i))}>{i+1}</button>)}</span>
  <span className="bank-step"><button type="button" aria-label="Previous patch" onClick={()=>pick(index-1)}>◂</button><button type="button" aria-label="Next patch" onClick={()=>pick(index+1)}>▸</button></span>
  <span className="bank-name"><b>{patchCode(index)}</b> {slot?(slot.name||'(not a factory patch)'):'empty'}</span>
  {local.length>1&&<span className="bank-local" role="group" aria-label="Your local banks">{local.map(b=><button type="button" key={b.name} className={bank.name===b.name?'on':''} onClick={()=>fromLocal(b)}>{b.name.replace(/\.syx$/i,'')}</button>)}</span>}
  <details className="bank-more"><summary>Bank</summary><div className="bank-menu"><span>{bank.name}</span>{importer}<button type="button" onClick={()=>{save(BANK_KEY,null);setBank(null);setMessage('');}}>Remove bank</button></div></details>
 </div>;
}
