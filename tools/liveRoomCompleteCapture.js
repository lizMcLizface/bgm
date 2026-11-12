import{NativeContextClockCodec,nativeContextClockDescriptors,validateNativeContextClockSpec}from'../src/modular-audio/nativeContextClockCodec.js';
export{nativeContextClockDescriptors};
export class LiveRoomCompleteCapture{
 constructor(p,port,rate){
  if(!Number.isSafeInteger(p.epoch)||p.epoch<0||p.epoch%128||!Number.isSafeInteger(p.frames)||p.frames<128||p.frames%128||p.frames>rate*12||![1,2].includes(p.channels))throw Error('Live Room review capture bounds');
  this.p=p;this.port=port;this.rate=rate;this.frame=0;this.done=false;this.error=null;this.codec=null;this.planes=Array.from({length:p.channels},()=>new Float32Array(p.frames));this.missingInputQuanta=0;
  port.onmessage=({data:d})=>{try{if(d?.kind==='native-clock-spec'){const s=validateNativeContextClockSpec(d.spec);if(s.rate!==rate||this.codec&&JSON.stringify(this.codec.spec)!==JSON.stringify(s))throw Error('Room capture clock changed');this.codec??=new NativeContextClockCodec(s);port.postMessage({kind:'clock-bound',spec:s});}else if(d?.kind==='native-clock-failed'){if(!this.done)throw Error(d.error);}else if(d?.kind==='dispose'){this.done=true;this.planes=null;port.postMessage({kind:'disposed'});}else throw Error('Unknown Room capture control');}catch(e){this.fail(e);}};
 }
 fail(e){if(this.error||this.done)return;this.error=String(e);this.port.postMessage({kind:'error',error:this.error,frame:this.frame,clock:this.codec?.snapshot()??null});}
 process(inputs,outputs,parameters,rawFrame){
  for(const p of outputs[0]??[])p.fill(0);if(this.done||this.error)return true;
  try{if(!this.codec)return true;const f=this.codec.next(parameters,{allowPending:this.frame===0});if(f===null||f<this.p.epoch)return true;if(f-this.p.epoch!==this.frame)throw Error('Room capture missed declared source/output frame');const input=inputs[0]??[];if(input.length!==this.p.channels||input.some(p=>p.length!==128)){this.missingInputQuanta++;throw Error('Room capture logical layout differs');}
   for(let c=0;c<this.p.channels;c++)for(let i=0;i<128;i++){const x=input[c][i];if(!Number.isFinite(x))throw Error('Nonfinite Room capture');this.planes[c][this.frame+i]=x;}this.frame+=128;
   if(this.frame===this.p.frames){this.done=true;const planes=this.planes;this.planes=null;this.port.postMessage({kind:'captured',channels:planes,frame:this.frame,epoch:this.p.epoch,clock:this.codec.snapshot(),rawFrame,missingInputQuanta:this.missingInputQuanta},planes.map(p=>p.buffer));}
  }catch(e){this.fail(e);}return true;
 }
}
