import React,{useEffect,useMemo,useRef,useState} from 'react';
import {parseVsSysex} from './sysex';
import {engineValues,sanitize} from './params';
import {composeWaves,packWaves,unpackWaves} from './waves';
import {load,save} from '../storage';
import {localBanks,fetchLocalBank} from '../localBanks';

// A program selector (0–99) for imported Prophet VS files. A program set comes with its own user-wave
// dump (waves 0–31); the ROM waves 32–127 are in the two wave-set WAVs. Nothing is bundled: the files
// stay in this browser (the composed waves as 16-bit samples, the programs as the .syx). On your own
// machine, banks/prophet-vs/ is offered here and the factory set loads by itself, waves included.
export const PROGRAMS_KEY='synths:vs:programs',WAVES_KEY='synths:vs:waves';
const toBase64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
const fromBase64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const readPrograms=(bytes,name)=>{const programs=parseVsSysex(bytes);return programs.length?{name,programs}:null;};

export function readStoredPrograms(){
 const stored=load(PROGRAMS_KEY,null);
 if(!stored?.data)return null;
 try{return readPrograms(fromBase64(stored.data),stored.name);}catch{return null;}
}
export const readStoredWaves=()=>{const text=load(WAVES_KEY,null);return text?unpackWaves(text):null;};
const kindOf=name=>/programs\.syx$/i.test(name)?'programs':/user-waves\.syx$/i.test(name)?'dump':/\.wav$/i.test(name)?'wav':'other';
const firstWave=name=>/064|33to96|33-96|65/i.test(name)?64:0;
const label=name=>name.replace(/-?programs\.syx$/i,'');

export default function ProgramBrowser({current,choose,values,setWaves}){
 const [bank,setBank]=useState(readStoredPrograms);
 const [message,setMessage]=useState('');
 const [cursor,setCursor]=useState(0);
 const [local,setLocal]=useState([]);
 const [parts,setParts]=useState({wavs:[],dump:null});
 const file=useRef(null);
 const index=useMemo(()=>{const i=bank?bank.programs.findIndex(p=>current===`${p.number} ${p.name}`.trim()):-1;return i>=0?i:cursor;},[current,cursor,bank]);
 const pick=i=>{
  const n=bank?.programs.length;if(!n)return;
  const at=((i%n)+n)%n,p=bank.programs[at];setCursor(at);
  choose({name:`${p.number} ${p.name}`.trim(),values:sanitize({...values,...engineValues(p.raw)})});
 };
 const applyWaves=next=>{try{save(WAVES_KEY,packWaves(next));}catch{/* too big for storage: the waves just stay for this session */}setWaves(next);};
 const acceptPrograms=(bytes,name,waves)=>{
  const next=readPrograms(bytes,name);
  if(!next){setMessage('No Prophet VS programs found in that file.');return false;}
  save(PROGRAMS_KEY,{name,data:toBase64(bytes)});setBank(next);setCursor(0);
  if(waves)applyWaves(waves);
  setMessage(`Loaded ${next.programs.length} programs from ${name}${waves?' with their waves':''}.`);return true;
 };
 // a local program set: its user-wave dump and the wave-set WAVs from the same folder
 const fromLocal=async(entry,list=local)=>{
  try{
   const prefix=entry.name.replace(/programs\.syx$/i,'');
   const find=pred=>list.filter(b=>pred(b.name));
   const dumpEntry=find(n=>n===prefix+'user-waves.syx')[0];
   const wavEntries=find(n=>kindOf(n)==='wav');
   const [bytes,dump,...wavs]=await Promise.all([fetchLocalBank(entry),dumpEntry?fetchLocalBank(dumpEntry):null,...wavEntries.map(fetchLocalBank)]);
   const waves=composeWaves({wavs:wavs.map((b,i)=>({bytes:b,first:firstWave(wavEntries[i].name)})),userDump:dump});
   acceptPrograms(bytes,entry.name,waves);setParts({wavs:[],dump:null});
  }catch(e){setMessage(`Could not load ${entry.name} (${e.message}).`);}
 };
 useEffect(()=>{let live=true;localBanks('prophet-vs').then(list=>{
  if(!live)return;setLocal(list);
  const sets=list.filter(b=>kindOf(b.name)==='programs');
  const first=sets.find(b=>/factory/i.test(b.name))??sets[0];
  if(first&&!readStoredPrograms())fromLocal(first,list);
 });return()=>{live=false;};},[]);
 // files picked by hand: programs, a user-wave dump, wave-set WAVs (any order, any number)
 const fromFiles=async e=>{
  const files=[...e.target.files??[]];e.target.value='';
  let programs=null,dump=parts.dump,wavs=[...parts.wavs];
  for(const f of files){
   const bytes=new Uint8Array(await f.arrayBuffer()),kind=kindOf(f.name);
   if(kind==='programs'||(kind==='other'&&parseVsSysex(bytes).length))programs={bytes,name:f.name};
   else if(kind==='dump')dump=bytes;
   else if(kind==='wav')wavs.push({bytes,first:firstWave(f.name)});
  }
  const waves=wavs.length||dump?composeWaves({wavs,userDump:dump}):null;
  setParts({wavs,dump});
  if(programs)acceptPrograms(programs.bytes,programs.name,waves);
  else if(waves){applyWaves(waves);setMessage(`Waves updated (${wavs.length} wave set${wavs.length===1?'':'s'}${dump?' and a user-wave dump':''}).`);}
  else setMessage('Nothing recognisable in those files.');
 };
 const sets=local.filter(b=>kindOf(b.name)==='programs');
 const localButtons=<span className="bank-local" role="group" aria-label="Your local program sets">{sets.map(b=><button type="button" key={b.name} className={bank?.name===b.name?'on':''} onClick={()=>fromLocal(b)}>{label(b.name)}</button>)}</span>;
 const importer=<span className="bank-import">
  <input ref={file} type="file" multiple accept=".syx,.wav,application/octet-stream,audio/wav" hidden onChange={fromFiles}/>
  <button type="button" onClick={()=>file.current.click()}>Load files…</button>
  {sets.length>0&&localButtons}
  {message&&<span className="bank-message" role="status">{message}</span>}
 </span>;
 if(!bank)return <div className="bank empty">
  <span className="bank-title">VS programs</span>
  {importer}
  <span className="bank-hint">Load a Prophet VS program .syx together with its user-wave dump and the two wave-set .wav files (select them all at once). Without the waves the programs play on a built-in wave set. Nothing leaves this browser.</span>
 </div>;
 const here=bank.programs[index],decade=Math.floor(here.number/10),digit=here.number%10;
 const inDecade=i=>bank.programs.findIndex(p=>p.number===decade*10+i);
 return <div className="bank vs-programs">
  <span className="bank-buttons" role="group" aria-label="Tens">{Array.from({length:Math.ceil(bank.programs.length/10)},(_,i)=><button type="button" key={i} className={decade===i?'on':''} onClick={()=>{const at=bank.programs.findIndex(p=>p.number===i*10+digit);pick(at>=0?at:bank.programs.findIndex(p=>p.number>=i*10));}}>{i*10}s</button>)}</span>
  <span className="bank-buttons numbers" role="group" aria-label="Units">{Array.from({length:10},(_,i)=>{const at=inDecade(i);return <button type="button" key={i} disabled={at<0} title={at>=0?bank.programs[at].name:''} className={digit===i?'on':''} onClick={()=>pick(at)}>{i}</button>;})}</span>
  <span className="bank-step"><button type="button" aria-label="Previous program" onClick={()=>pick(index-1)}>◂</button><button type="button" aria-label="Next program" onClick={()=>pick(index+1)}>▸</button></span>
  <span className="bank-name"><b>{here.number}</b> {here.name}</span>
  <details className="bank-more"><summary>Programs</summary><div className="bank-menu"><span>{bank.name}</span>{importer}<button type="button" onClick={()=>{save(PROGRAMS_KEY,null);save(WAVES_KEY,null);setBank(null);setMessage('');}}>Remove programs and waves</button></div></details>
 </div>;
}
