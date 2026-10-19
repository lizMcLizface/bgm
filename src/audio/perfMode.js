// Temporary A/B policy. Original device preferences and patch quality are retained.
export const PERF_MODE_EVENT='bgm-perf-mode-change';
export function perfFromSearch(search=''){
 const value=new URLSearchParams(search).get('perf');return value==='1'?true:value==='0'?false:null;
}
let choice=typeof location==='undefined'?null:perfFromSearch(location.search);
export const readPerfChoice=()=>choice;
export const perfEnabled=()=>choice===true;
export const optionalSpeedup=flag=>choice===false?false:choice===true||flag;
export function withPerf(path,value){
 if(value!==true&&value!==false)return path;
 const at=path.indexOf('#'),hash=at<0?'':path.slice(at),base=at<0?path:path.slice(0,at),q=base.indexOf('?'),params=new URLSearchParams(q<0?'':base.slice(q+1));
 params.set('perf',value?'1':'0');return(q<0?base:base.slice(0,q))+'?'+params+hash;
}
export function setPerfChoice(value){
 if(value!==true&&value!==false&&value!==null)throw Error('Invalid performance trial choice');choice=value;
 if(typeof window!=='undefined'){
  const path=location.pathname+location.search+location.hash;
  if(value===null){const u=new URL(location.href);u.searchParams.delete('perf');history.replaceState(null,'',u.pathname+u.search+u.hash);}
  else history.replaceState(null,'',withPerf(path,value));
  window.dispatchEvent(new Event(PERF_MODE_EVENT));
 }
}
