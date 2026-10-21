import React,{useEffect,useMemo,useRef,useState} from 'react';
import {parseDx7Sysex} from './sysex';
import {engineValues} from './voice';
import {sanitize} from './params';
import {load,save} from '../storage';
import {localBanks,fetchLocalBank,preferredBank} from '../localBanks';

// A cartridge selector (voices 1–32) for an imported DX7 .syx file: a ROM cartridge, a 32-voice
// bulk dump, a single voice, or a generated cartridge. Nothing is bundled: the file stays in this
// browser. On your own machine, cartridges in banks/dx7/ are offered here and ROM1A loads by itself.
export const BANK_KEY='synths:dx7:cart';
const toBase64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
const fromBase64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const readCart=(bytes,name)=>{const voices=parseDx7Sysex(bytes);return voices.length?{name,voices}:null;};
export function readStoredCart(){
 const stored=load(BANK_KEY,null);
 if(!stored?.data)return null;
 try{return readCart(fromBase64(stored.data),stored.name);}catch{return null;}
}
const label=name=>name.replace(/\.syx$/i,'').replace(/^generated-/,'gen ');
const voiceLabel=(v,i)=>`${v.number??i+1} ${v.name}`.trim();

export default function CartBrowser({current,choose,values}){
 const [cart,setCart]=useState(readStoredCart);
 const [message,setMessage]=useState('');
 const [cursor,setCursor]=useState(0);
 const [local,setLocal]=useState([]);
 const file=useRef(null);
 const index=useMemo(()=>{const i=cart?cart.voices.findIndex((v,k)=>current===voiceLabel(v,k)):-1;return i>=0?i:cursor;},[current,cursor,cart]);
 const pick=i=>{
  const n=cart?.voices.length;if(!n)return;
  const at=((i%n)+n)%n,v=cart.voices[at];setCursor(at);
  choose({name:voiceLabel(v,at),values:sanitize({...values,...engineValues(v.raw)})});
 };
 const accept=(bytes,name)=>{
  const next=readCart(bytes,name);
  if(!next){setMessage('No DX7-format voices found in that file.');return;}
  save(BANK_KEY,{name,data:toBase64(bytes)});setCart(next);setCursor(0);
  const bad=next.voices.filter(v=>!v.checksumOk).length;
  setMessage(`Loaded ${next.voices.length} voice${next.voices.length>1?'s':''} from ${name}`+(bad?` (${bad} with a bad checksum)`:'')+'.');
 };
 const fromLocal=async entry=>{try{accept(await fetchLocalBank(entry),entry.name);}catch(e){setMessage(`Could not load ${entry.name} (${e.message}).`);}};
 useEffect(()=>{let live=true;localBanks('dx7').then(list=>{
  if(!live)return;setLocal(list);
  const first=list.find(b=>/rom1a/i.test(b.name))??preferredBank(list);if(first&&!readStoredCart())fromLocal(first);
 });return()=>{live=false;};},[]);
 const fromFile=async e=>{const f=e.target.files?.[0];e.target.value='';if(f)accept(new Uint8Array(await f.arrayBuffer()),f.name);};
 const localButtons=<span className="bank-local" role="group" aria-label="Your local cartridges">{local.map(b=><button type="button" key={b.name} className={cart?.name===b.name?'on':''} onClick={()=>fromLocal(b)}>{label(b.name)}</button>)}</span>;
 const importer=<span className="bank-import">
  <input ref={file} type="file" accept=".syx,application/octet-stream" hidden onChange={fromFile}/>
  <button type="button" onClick={()=>file.current.click()}>Load .syx file</button>
  {local.length>0&&localButtons}
  {message&&<span className="bank-message" role="status">{message}</span>}
 </span>;
 if(!cart)return <div className="bank empty">
  <span className="bank-title">FM7 cartridge</span>
  {importer}
  <span className="bank-hint">Load a SysEx file in the DX7 format: a ROM cartridge, a 32-voice dump or a single voice. It stays in this browser.</span>
 </div>;
 const voice=cart.voices[index],count=cart.voices.length;
 const bank=Math.floor(index/8),num=index%8,banks=Math.ceil(count/8);
 return <div className="bank dx7-cart">
  {banks>1&&<span className="bank-buttons" role="group" aria-label="Voices">{Array.from({length:banks},(_,i)=><button type="button" key={i} className={bank===i?'on':''} onClick={()=>pick(Math.min(i*8+num,count-1))}>{i*8+1}–{Math.min(count,i*8+8)}</button>)}</span>}
  <span className="bank-buttons numbers" role="group" aria-label="Voice">{Array.from({length:Math.min(8,count-bank*8)},(_,i)=><button type="button" key={i} title={cart.voices[bank*8+i].name} className={num===i?'on':''} onClick={()=>pick(bank*8+i)}>{i+1}</button>)}</span>
 <span className="bank-step"><button type="button" aria-label="Previous voice" onClick={()=>pick(index-1)}>◂</button><button type="button" aria-label="Next voice" onClick={()=>pick(index+1)}>▸</button></span>
  <span className="bank-name"><b>{voice.number??index+1}</b> {voice.name||'(unnamed)'}{voice.checksumOk?'':' · bad checksum'}</span>
  {local.length>1&&localButtons}
  <details className="bank-more"><summary>Cartridge</summary><div className="bank-menu"><span>{cart.name}</span>{importer}<button type="button" onClick={()=>{save(BANK_KEY,null);setCart(null);setMessage('');}}>Remove cartridge</button></div></details>
 </div>;
}
