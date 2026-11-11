import fs from 'node:fs';
import vm from 'node:vm';
export function nativeLimiter(rate){let Processor;vm.runInNewContext(fs.readFileSync('public/desk-limiter-processor.js','utf8'),{sampleRate:rate,Float32Array,AudioWorkletProcessor:class{constructor(){this.port={};}},registerProcessor:(_,p)=>{Processor=p;}});return new Processor();}
export function limiterMaterial(total){const a=[new Float32Array(total),new Float32Array(total)];for(let i=0;i<total;i++){a[0][i]=Math.sin(i*.071)*.12;a[1][i]=Math.cos(i*.131)*.2;}a[0][100]=4;a[1][300]=-3;a[0][1024]=1.7;a[1][1024]=-1.7;a[0][4096]=NaN;a[1][4097]=Infinity;return a;}
export function limiterConfig(rate,enabled=true){return {version:1,kind:'limiter',sampleRate:rate,settled:true,parameters:[Number(enabled),.5],events:[{frame:1025,owner:1,parameter:0,value:0},{frame:6001,owner:2,parameter:0,value:1},{frame:6001,owner:2,parameter:1,value:.3},{frame:7103,owner:3,parameter:1,value:.9}]};}
export function renderNativeLimiter(rate,config,input,cadence=[127,37,203]){
 const p=nativeLimiter(rate);p.port.onmessage({data:{enabled:!!config.parameters[0],ceiling:config.parameters[1]}});const frames=input[0].length,out=[new Float32Array(frames),new Float32Array(frames)],events=config.events.slice().sort((a,b)=>a.frame-b.frame);let cursor=0;
 for(let at=0,k=0;at<frames;k++){
  while(events[cursor]?.frame===at){const e=events[cursor++];p.port.onmessage({data:e.parameter===0?{enabled:!!e.value}:{ceiling:e.value}});}
  const n=Math.min(cadence[k%cadence.length],frames-at,(events[cursor]?.frame??Infinity)-at),a=[new Float32Array(n),new Float32Array(n)];p.process([[input[0].subarray(at,at+n),input[1].subarray(at,at+n)]],[a]);out[0].set(a[0],at);out[1].set(a[1],at);at+=n;
 }return {out,gain:p.gain,latencyFrames:p.length};
}
