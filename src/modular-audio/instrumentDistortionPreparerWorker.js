import{OwnedInstrumentDistortion}from'./ownedInstrumentDistortion.js';
/** Dedicated resource worker: all44100-cell sinh/atan work uses frozen Rust17c9.
 * No AudioContext, live output, Native coefficient reads or host Math preparation. */
let identity=null,owner=null,module=null,kernelExports=null,lastRequest=0,closed=false;
const same=id=>id&&identity&&typeof id==='object'&&!Array.isArray(id)&&Object.keys(id).length===Object.keys(identity).length&&Object.keys(identity).every(k=>id[k]===identity[k]);
const integer=v=>Number.isInteger(v)&&v>0&&v<=4294967295;
self.onmessage=({data:d})=>{if(closed)return;try{if(d?.kind==='initialize'){if(identity||!d.identity||typeof d.identity!=='object'||Array.isArray(d.identity)||typeof d.identity.version!=='string'||!integer(d.identity.owner)||!(d.module instanceof WebAssembly.Module)||d.kernelVersion!=='17c9f3dbeaa6c678')throw Error('Original Distortion preparer identity/module differs');identity=Object.freeze({...d.identity});module=d.module;kernelExports=new WebAssembly.Instance(module,{}).exports;owner=new OwnedInstrumentDistortion(kernelExports,48000);const zero=owner.curve(1);self.postMessage({kind:'preparer-ready',identity,kernelVersion:d.kernelVersion,curve:zero},[zero.buffer]);return;}
 if(!same(d?.identity)||!integer(d.request)||d.request<=lastRequest)throw Error('Original Distortion preparer request identity/order differs');lastRequest=d.request;
 if(d.kind==='dispose'){owner?.dispose();owner=null;closed=true;self.postMessage({kind:'preparer-disposed',identity,request:d.request,released:true,clean:true});return;}
 if(d.kind!=='prepare'||typeof d.drive!=='number'||!Number.isFinite(d.drive)||d.drive<0||d.drive>30)throw Error('Invalid original Distortion preparation');if(owner.stat(7)>=8){owner.dispose();owner=new OwnedInstrumentDistortion(kernelExports,48000);}const slot=owner.curvePrepare(d.drive),curve=owner.curve(slot);self.postMessage({kind:'prepared',identity,request:d.request,drive:d.drive,curve,linearMemoryBytes:kernelExports.memory.buffer.byteLength},[curve.buffer]);
 }catch(error){self.postMessage({kind:'preparer-error',identity,request:d?.request??null,error:String(error)});}};
