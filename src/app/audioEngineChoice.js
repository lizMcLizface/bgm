import {perfFromSearch} from '../audio/perfMode';
// A debugging link overrides this visit, never the device preference.
export function engineFromSearch(search=''){
 if(perfFromSearch(search)===true)return 'wasm';
 const value=new URLSearchParams(search).get('wasm');
 return value==='1'?'wasm':value==='0'?'legacy':null;
}
export function withAudioEngine(path,mode){
 if(mode!=='wasm'&&mode!=='legacy')return path;
 const hashAt=path.indexOf('#'),hash=hashAt<0?'':path.slice(hashAt),base=hashAt<0?path:path.slice(0,hashAt),at=base.indexOf('?');
 const query=new URLSearchParams(at<0?'':base.slice(at+1));query.set('wasm',mode==='wasm'?'1':'0');
 return (at<0?base:base.slice(0,at))+'?'+query+hash;
}
