// Debugging links override only this visit. Nothing is saved on the device.
export function simdFromSearch(search=''){
 const value=new URLSearchParams(search).get('simd');
 return value==='1'||value==='fm'?true:value==='0'?false:null;
}
export function withSimd(path,choice){
 if(choice!==true&&choice!==false)return path;
 const at=path.indexOf('#'),hash=at<0?'':path.slice(at),base=at<0?path:path.slice(0,at),q=base.indexOf('?'),params=new URLSearchParams(q<0?'':base.slice(q+1));
 params.set('simd',choice?'1':'0');return(q<0?base:base.slice(0,q))+'?'+params+hash;
}
export const bankFromSearch=(search='')=>new URLSearchParams(search).get('bank')==='1';
export function withFMBank(path,enabled){
 if(!enabled)return path;
 const at=path.indexOf('#'),hash=at<0?'':path.slice(at),base=at<0?path:path.slice(0,at),q=base.indexOf('?'),params=new URLSearchParams(q<0?'':base.slice(q+1));
 params.set('bank','1');return(q<0?base:base.slice(0,q))+'?'+params+hash;
}
