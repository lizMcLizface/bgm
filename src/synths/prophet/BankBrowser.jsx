import React,{useEffect,useMemo,useRef,useState} from 'react';
import {parseProphetSysex} from './sysex';
import {sanitize} from './params';
import {load,save} from '../storage';
import {localBanks,fetchLocalBank,preferredBank} from '../localBanks';

// A Prophet-5 Rev 4 style program selector (bank, group 1–5, program 1–8) for an
// imported .syx file: Sequential's free factory download or a player's own dump.
// Nothing is bundled: the file stays in this browser. On your own machine, banks in
// banks/prophet-5/ are offered here and the factory one loads by itself.
export const BANK_KEY='synths:prophet5:bank';
const toBase64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
const fromBase64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));

/** {name, banks: Map(bank → 40 programs or empty slots), edit: [edit-buffer programs]} or null. */
function organise(bytes,name){
 const programs=parseProphetSysex(bytes);
 if(!programs.length)return null;
 const banks=new Map();
 for(const p of programs){
  const key=p.bank??'edit';
  if(!banks.has(key))banks.set(key,[]);
  const list=banks.get(key);
  if(p.bank===null)list.push(p);else list[p.program]=p;
 }
 return {name,count:programs.length,banks:new Map([...banks].sort(([a],[b])=>(a==='edit')-(b==='edit')||a-b))};
}

export function readStoredBank(){
 const stored=load(BANK_KEY,null);
 if(!stored?.data)return null;
 try{return organise(fromBase64(stored.data),stored.name);}catch{return null;}
}

const bankLabel=b=>b==='edit'?'Edit':`${b<5?'U':'F'}${b%5+1}`;

export default function BankBrowser({current,choose}){
 const [bank,setBank]=useState(readStoredBank);
 const [message,setMessage]=useState('');
 const [url,setUrl]=useState(()=>load(BANK_KEY+':url',''));
 const [cursor,setCursor]=useState({bank:null,index:0});
 const [local,setLocal]=useState([]);
 const file=useRef(null);
 const keys=bank?[...bank.banks.keys()]:[];
 // the loaded program's own code wins over the cursor
 const at=useMemo(()=>{
  const m=/^([UF])([1-5])-([1-5])([1-8]) /.exec(current??'');
  if(m&&bank){const b=(m[1]==='F'?5:0)+(m[2]-1);if(bank.banks.has(b))return {bank:b,index:(m[3]-1)*8+(m[4]-1)};}
  return {bank:cursor.bank??keys.find(k=>k!=='edit')??keys[0],index:cursor.index};
 },[current,cursor,bank]);
 const programs=bank?.banks.get(at.bank)??[];
 const pick=(b,i)=>{
  const list=bank?.banks.get(b)??[],n=b==='edit'?list.length:40,index=((i%n)+n)%n;
  setCursor({bank:b,index});
  const p=list[index];
  if(p)choose({name:`${p.code} ${p.name}`.trim(),values:sanitize(p.engine)});
 };
 const accept=(bytes,name)=>{
  const organised=organise(bytes,name);
  if(!organised){setMessage('No Prophet-5/10 programs found in that file.');return;}
  save(BANK_KEY,{name,data:toBase64(bytes)});setBank(organised);setCursor({bank:null,index:0});
  setMessage(`Loaded ${organised.count} program${organised.count>1?'s':''} from ${name}.`);
 };
 const fromLocal=async entry=>{
  try{accept(await fetchLocalBank(entry),entry.name);}
  catch(e){setMessage(`Could not load ${entry.name} (${e.message}).`);}
 };
 useEffect(()=>{let live=true;localBanks('prophet-5').then(list=>{
  if(!live)return;setLocal(list);
  const first=preferredBank(list);if(first&&!readStoredBank())fromLocal(first);
 });return()=>{live=false;};},[]);
 const fromFile=async e=>{const f=e.target.files?.[0];e.target.value='';if(f)accept(new Uint8Array(await f.arrayBuffer()),f.name);};
 const fromUrl=async()=>{
  try{const r=await fetch(url);if(!r.ok)throw Error(`HTTP ${r.status}`);save(BANK_KEY+':url',url);accept(new Uint8Array(await r.arrayBuffer()),url.split('/').pop()||'programs.syx');}
  catch(e){setMessage(`Could not load that link (${e.message}). Download the file and use “Load .syx file” instead.`);}
 };
 const localButtons=<span className="bank-local" role="group" aria-label="Your local banks">{local.map(b=><button type="button" key={b.name} className={bank?.name===b.name?'on':''} onClick={()=>fromLocal(b)}>{b.name.replace(/\.syx$/i,'')}</button>)}</span>;
 const importer=<span className="bank-import">
  <input ref={file} type="file" accept=".syx,application/octet-stream" hidden onChange={fromFile}/>
  <button type="button" onClick={()=>file.current.click()}>Load .syx file</button>
  <input type="url" placeholder="…or paste a link to a .syx file" value={url} onChange={e=>setUrl(e.target.value)} aria-label="Link to a .syx file"/>
  <button type="button" disabled={!url} onClick={fromUrl}>Load link</button>
  {local.length>0&&localButtons}
  {message&&<span className="bank-message" role="status">{message}</span>}
 </span>;
 if(!bank)return <div className="bank empty">
  <span className="bank-title">Prophet-5 programs</span>
  {importer}
  <span className="bank-hint">Load a Prophet-5/10 Rev 4 SysEx file, such as Sequential's free factory programs download. It stays in this browser.</span>
 </div>;
 const p=programs[at.index];
 const group=Math.floor(at.index/8),num=at.index%8;
 return <div className="bank">
  <span className="bank-buttons" role="group" aria-label="Bank">{keys.map(b=><button type="button" key={b} className={at.bank===b?'on':''} onClick={()=>pick(b,b==='edit'?0:at.index)}>{bankLabel(b)}</button>)}</span>
  {at.bank!=='edit'&&<>
   <span className="bank-buttons" role="group" aria-label="Group">{Array.from({length:5},(_,i)=><button type="button" key={i} className={group===i?'on':''} onClick={()=>pick(at.bank,i*8+num)}>{i+1}</button>)}</span>
   <span className="bank-buttons numbers" role="group" aria-label="Program">{Array.from({length:8},(_,i)=><button type="button" key={i} className={num===i?'on':''} onClick={()=>pick(at.bank,group*8+i)}>{i+1}</button>)}</span>
  </>}
  <span className="bank-step"><button type="button" aria-label="Previous program" onClick={()=>pick(at.bank,at.index-1)}>◂</button><button type="button" aria-label="Next program" onClick={()=>pick(at.bank,at.index+1)}>▸</button></span>
  <span className="bank-name"><b>{p?.code??`${bankLabel(at.bank)}-${group+1}${num+1}`}</b> {p?p.name:'empty'}</span>
  {local.length>1&&localButtons}
  <details className="bank-more"><summary>Bank</summary><div className="bank-menu"><span>{bank.name}</span>{importer}<button type="button" onClick={()=>{save(BANK_KEY,null);setBank(null);setMessage('');}}>Remove bank</button></div></details>
 </div>;
}
