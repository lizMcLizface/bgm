import React,{useEffect,useMemo,useRef,useState} from 'react';
import {engineValues} from './book';
import {sanitize,intoLayer,LAYER_KEYS} from './params';
import {load,save} from '../storage';
import {localBanks,fetchLocalBank,preferredBank} from '../localBanks';

// A selector for the OB-Xa factory patch book: the measured JSON that tools/obxa-patch-book
// writes (96 of the 104 programs: group C is not in the scan). Programs are numbered like the
// panel: group A–D (the programmer's four group buttons, combined as in the book: A, B, AB, C …) and
// program 1–8. Nothing is bundled: the file stays in this browser. On your own machine,
// banks/oberheim-ob-xa/patch-book.json is offered here and loads by itself. A program loads into
// the layer being edited.
export const BANK_KEY='synths:obxa:book';

function readBook(text,name){
 const data=JSON.parse(text);
 const patches=(data.patches??[]).filter(p=>p?.code&&p.oscillators);
 return patches.length?{name,patches}:null;
}
export function readStoredBook(){
 const stored=load(BANK_KEY,null);
 if(!stored?.text)return null;
 try{return readBook(stored.text,stored.name);}catch{return null;}
}
const GROUPS=['A','B','AB','C','AC','BC','ABC','D','AD','BD','ABD','CD','ACD','BCD','ABCD'];
const groupOf=code=>/^[A-D]+/.exec(code)?.[0]??'';
const numberOf=code=>Number(/\d$/.exec(code)?.[0]??0);

export default function BookBrowser({current,choose,values,layer='upper'}){
 const [book,setBook]=useState(readStoredBook);
 const [message,setMessage]=useState('');
 const [cursor,setCursor]=useState(0);
 const [local,setLocal]=useState([]);
 const file=useRef(null);
 const prefix=layer==='lower'?'Lower ':'';
 const label=p=>`${prefix}${p.code} ${p.name}`;
 const index=useMemo(()=>{const i=book?book.patches.findIndex(p=>current===label(p)):-1;return i>=0?i:cursor;},[current,cursor,book,layer]);
 const pick=i=>{
  const n=book?.patches.length;if(!n)return;
  const at=((i%n)+n)%n,p=book.patches[at];setCursor(at);
  choose({name:label(p),values:sanitize({...values,...intoLayer(Object.fromEntries(Object.entries(engineValues(p)).filter(([k])=>LAYER_KEYS.includes(k))),layer)})});
 };
 const accept=(text,name)=>{
  try{
   const next=readBook(text,name);
   if(!next){setMessage('No OB-Xa patches found in that file.');return;}
   save(BANK_KEY,{name,text});setBook(next);setCursor(0);setMessage(`Loaded ${next.patches.length} patches from ${name}.`);
  }catch(e){setMessage(`Could not read ${name} (${e.message}).`);}
 };
 const fromLocal=async entry=>{try{accept(new TextDecoder().decode(await fetchLocalBank(entry)),entry.name);}catch(e){setMessage(`Could not load ${entry.name} (${e.message}).`);}};
 useEffect(()=>{let live=true;localBanks('oberheim-ob-xa').then(list=>{
  const books=list.filter(b=>/\.json$/i.test(b.name));
  if(!live)return;setLocal(books);
  const first=preferredBank(books);if(first&&!readStoredBook())fromLocal(first);
 });return()=>{live=false;};},[]);
 const fromFile=async e=>{const f=e.target.files?.[0];e.target.value='';if(f)accept(await f.text(),f.name);};
 const importer=<span className="bank-import">
  <input ref={file} type="file" accept=".json,application/json" hidden onChange={fromFile}/>
  <button type="button" onClick={()=>file.current.click()}>Load patch book .json</button>
  {local.length>0&&<span className="bank-local" role="group" aria-label="Your local books">{local.map(b=><button type="button" key={b.name} className={book?.name===b.name?'on':''} onClick={()=>fromLocal(b)}>{b.name.replace(/\.json$/i,'')}</button>)}</span>}
  {message&&<span className="bank-message" role="status">{message}</span>}
 </span>;
 if(!book)return <div className="bank empty">
  <span className="bank-title">OB-Xa patch book</span>
  {importer}
  <span className="bank-hint">Load the measured patch-book JSON (see tools/obxa-patch-book). It stays in this browser.</span>
 </div>;
 const here=book.patches[index],group=groupOf(here.code);
 const inGroup=GROUPS.filter(g=>book.patches.some(p=>groupOf(p.code)===g));
 const members=book.patches.filter(p=>groupOf(p.code)===group);
 return <div className="bank">
  <span className="bank-buttons" role="group" aria-label="Group">{inGroup.map(g=><button type="button" key={g} className={group===g?'on':''} onClick={()=>pick(book.patches.findIndex(p=>groupOf(p.code)===g))}>{g}</button>)}</span>
  <span className="bank-buttons numbers" role="group" aria-label="Program">{members.map(p=><button type="button" key={p.code} title={p.name} className={p.code===here.code?'on':''} onClick={()=>pick(book.patches.indexOf(p))}>{numberOf(p.code)}</button>)}</span>
  <span className="bank-step"><button type="button" aria-label="Previous program" onClick={()=>pick(index-1)}>◂</button><button type="button" aria-label="Next program" onClick={()=>pick(index+1)}>▸</button></span>
  <span className="bank-name"><b>{here.code}</b> {here.name}{here.drawing_note?' · drawing note: '+here.drawing_note:''}</span>
  <details className="bank-more"><summary>Book</summary><div className="bank-menu"><span>{book.name}</span>{importer}<button type="button" onClick={()=>{save(BANK_KEY,null);setBook(null);setMessage('');}}>Remove book</button></div></details>
 </div>;
}
