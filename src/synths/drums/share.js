import {drumParams,validPattern} from './kits';
import {RACK_PARAMS,cleanRack} from '../effects/params';
import {deflateSync,inflateSync} from 'fflate';

// V1 links remain readable. V2 omits default metadata and trailing empty cells, uses
// native parameter IDs, then compresses the entire snapshot. IDs are the stable Wasm ABI.
// Changing parameter defaults requires a new version and retaining older decoding defaults.
// Links contain everything locally; no server records or autoplay flags are involved.
const MAX=16384,MAX_RAW=16384;
const fail=()=>{throw new Error('This drum link is invalid or uses an unsupported version.');};
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decode(text){
 if(typeof text!=='string'||text.length>MAX||!text.length||!/^[\w-]+$/.test(text))return fail();
 try{return Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}catch{return fail();}
}
const overrides=(values,defaults)=>Object.fromEntries(Object.entries(values).filter(([k,v])=>v!==defaults[k]));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function parameters(raw,table,defaults){
 if(!object(raw))return fail();
 const out={...defaults};
 for(const [key,v] of Object.entries(raw)){
  const spec=table.BY_KEY[key];
  if(!Object.hasOwn(table.BY_KEY,key)||typeof v!=='number'||!Number.isFinite(v)||v<spec.min||v>spec.max||(spec.curve==='step'&&!Number.isInteger(v)))return fail();
  out[key]=v;
 }
 return out;
}
function bankData(kit,b){
 if(!object(b)||!Array.isArray(b.patterns)||b.patterns.length!==8||!b.patterns.every(validPattern(kit)))return fail();
 if(!Array.isArray(b.lengths)||b.lengths.length!==8||!b.lengths.every(n=>Number.isInteger(n)&&n>=1&&n<=16))return fail();
 if(!Array.isArray(b.tempos)||b.tempos.length!==8||!b.tempos.every(n=>typeof n==='number'&&Number.isFinite(n)&&(n===0||n>=30&&n<=300)))return fail();
 if(!Array.isArray(b.chain)||b.chain.length>16||!b.chain.every(n=>Number.isInteger(n)&&n>=0&&n<8)||!Number.isInteger(b.current)||b.current<0||b.current>7)return fail();
 if(typeof b.title!=='string'||b.title.length>80||!Array.isArray(b.names)||b.names.length!==8||!b.names.every(n=>typeof n==='string'&&n.length<=32))return fail();
 return b;
}
export function encodeDrumState(kit,{bank,values,rack,name='Shared kit'}){
 const params=drumParams(kit),b=bankData(kit,{...bank,title:bank.title??'',names:bank.names??Array(8).fill('')});
 const cells=b.patterns.flat(2),bytes=new Uint8Array(cells.length/4);
 cells.forEach((v,i)=>{bytes[i>>2]|=v<<((i%4)*2);});
 let end=bytes.length;while(end&&bytes[end-1]===0)end--;
 const s=Object.fromEntries(Object.entries(overrides(parameters(values,params,params.defaultValues()),params.defaultValues())).map(([k,v])=>[params.BY_KEY[k].id,v]));
 const r=overrides(parameters(rack,RACK_PARAMS,cleanRack()),cleanRack());
 const data={v:2,k:kit.id,p:encode(bytes.subarray(0,end)),sound:String(name).slice(0,80),
  ...(b.lengths.some(n=>n!==16)?{l:b.lengths}:{}),...(b.tempos.some(Boolean)?{t:b.tempos}:{}),
  ...(b.chain.length?{c:b.chain}:{}),...(b.current?{i:b.current}:{}),
  ...(b.title?{title:b.title}:{}),...(b.names.some(Boolean)?{n:b.names}:{}),
  ...(Object.keys(s).length?{s}:{}),...(Object.keys(r).length?{r}:{})};
 const raw=new TextEncoder().encode(JSON.stringify(data));if(raw.length>MAX_RAW)return fail();
 const code='2.'+encode(deflateSync(raw,{level:9}));
 if(code.length>MAX)return fail();
 return code;
}
export function decodeDrumState(kit,code){
 const compressed=typeof code==='string'&&code.startsWith('2.');
 let d;try{
  if(typeof code!=='string'||code.length>MAX)return fail();
  const packed=decode(compressed?code.slice(2):code);
  // A fixed output buffer bounds decompression even for hostile or corrupt links.
  const raw=compressed?inflateSync(packed,{out:new Uint8Array(MAX_RAW+1)}):packed;
  if(raw.length>MAX_RAW)return fail();
  d=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 }catch{return fail();}
 if(!object(d)||d.v!==(compressed?2:1)||d.k!==kit.id||typeof d.sound!=='string'||d.sound.length>80)return fail();
 const params=drumParams(kit);
 if(compressed){
  d={l:Array(8).fill(16),t:Array(8).fill(0),c:[],i:0,title:'',n:Array(8).fill(''),s:{},r:{},...d};
  if(!object(d.s))return fail();
  const byId=Object.fromEntries(params.PARAMS.map(p=>[p.id,p.key])),named={};
  for(const [id,value] of Object.entries(d.s)){if(!Object.hasOwn(byId,id))return fail();named[byId[id]]=value;}
  d.s=named;
 }
 const rows=kit.tracks.length+1,expected=8*rows*4;
 const packed=compressed&&d.p===''?new Uint8Array():decode(d.p);
 if(compressed?packed.length>expected:packed.length!==expected)return fail();
 const bytes=new Uint8Array(expected);bytes.set(packed);
 const patterns=Array.from({length:8},(_,p)=>Array.from({length:rows},(_,t)=>Array.from({length:16},(_,s)=>{
  const i=(p*rows+t)*16+s;return bytes[i>>2]>>((i%4)*2)&3;
 })));
 const bank=bankData(kit,{patterns,lengths:d.l,tempos:d.t,chain:d.c,current:d.i,title:d.title,names:d.n});
 const values=parameters(d.s,params,params.defaultValues()),rack=parameters(d.r,RACK_PARAMS,cleanRack());
 return {bank,patch:{name:d.sound,values,rack}};
}
export function drumShareUrl(kit,state,href=window.location.href){
 const url=new URL(href);url.search='';url.hash='drum='+encodeDrumState(kit,state);return url.href;
}
export function readDrumLink(kit,href=window.location.href){
 const hash=new URL(href).hash;if(!hash.startsWith('#drum='))return {};
 try{return decodeDrumState(kit,hash.slice(6));}catch(error){return {error:error.message};}
}
export function clearDrumLink(){
 if(window.location.hash.startsWith('#drum='))window.history.replaceState(null,'',window.location.pathname+window.location.search);
}
