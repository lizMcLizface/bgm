import React,{useEffect,useRef,useState} from 'react';
import {comparisonBankIndex,loadComparisonBank,comparisonUrl} from '../comparisonBanks';

export default function ComparisonPresets({synth,choose,onWaves,onBusy,patch}){
 const [list,setList]=useState([]),[bank,setBank]=useState(null),[selected,setSelected]=useState('');
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const callbacks=useRef({choose,onWaves,onBusy});callbacks.current={choose,onWaves,onBusy};
 const request=useRef(0);
 const load=async(entry,program=null)=>{
  const token=++request.current;setBusy(true);callbacks.current.onBusy(true);setMessage('Loading comparison presets…');
  try{
   const next=await loadComparisonBank(entry,synth);if(token!==request.current)return;
   if(program!==null&&!next.programs.some(p=>p.id===program))throw Error(`Program ${program} is not in ${entry.name}.`);
   setBank({...next,url:entry.url});setSelected(program??'');setMessage('');
   if(program!==null)pick(next,next.programs.find(p=>p.id===program));
  }catch(e){if(token===request.current){setBank(null);setMessage(e.message);}}
  finally{if(token===request.current){setBusy(false);callbacks.current.onBusy(false);}}
 };
 const pick=(b,p)=>{
  if(b.waves)callbacks.current.onWaves?.(new Float32Array(b.waves));
  callbacks.current.choose({name:p.name,values:synth.params.sanitize(p.values),comparison:{bank:b.id,program:p.id}});
  setSelected(p.id);setMessage('');
  // Address links identify the exact bundled program, including on reload.
  window.history.replaceState(null,'',comparisonUrl(window.location.href,b.id,p.id));
 };
 useEffect(()=>{
  let alive=true;
  const query=new URLSearchParams(window.location.search),bankId=query.get('bank'),program=query.get('program');
  comparisonBankIndex().then(all=>{
   if(!alive)return;
   const entries=all.filter(b=>b.synth===synth.id);setList(entries);
   const first=bankId?entries.find(b=>b.id===bankId):entries[0];
   if(bankId&&!first)throw Error('This comparison bank is not available for this synth.');
   if(first)return load(first,bankId?(program??null):null);
   callbacks.current.onBusy(false);
  }).catch(e=>{if(alive){setMessage(e.message);callbacks.current.onBusy(false);}});
  return()=>{alive=false;request.current++;};
 },[synth]);
 const copy=async()=>{
  const selection=patch.comparison;
  if(!selection)return;
  const url=comparisonUrl(window.location.href,selection.bank,selection.program);
  try{await navigator.clipboard.writeText(url);setMessage('Comparison link copied.');}
  catch{setMessage(url);}
 };
 const active=bank?.programs.find(p=>p.id===selected);
 const applied=patch.comparison?.bank===bank?.id&&patch.comparison?.program===selected;
 return <section className="comparison-presets" aria-label="Comparison presets">
  <b>Compare presets</b>
  {list.length>0&&<>
   <label>Bank<select value={bank?.id??''} disabled={busy} onChange={e=>load(list.find(b=>b.id===e.target.value))}>
    {!bank&&<option value="">Choose bank</option>}{list.map(b=><option key={b.id} value={b.id}>{b.name} · {b.count}</option>)}
   </select></label>
   {bank&&<><label>Program<select value={selected} disabled={busy} onChange={e=>pick(bank,bank.programs.find(p=>p.id===e.target.value))}>
    <option value="" disabled>Choose program</option>{bank.programs.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
   </select></label>
   <button type="button" disabled={!active||busy} onClick={()=>pick(bank,active)}>{applied?'Reload program':'Load program'}</button>
   <a href={import.meta.env.BASE_URL+bank.url} download>Download YAML</a></>}
   <button type="button" disabled={!patch.comparison||busy} onClick={copy}>Copy comparison link</button>
  </>}
  {message&&<span role="status">{message}</span>}
 </section>;
}
