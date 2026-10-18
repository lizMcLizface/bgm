// @vitest-environment node
import {nativeFeedbackOffset} from './nativeEcho';

test('native feedback measurement removes filter group delay and fractional sample rounding',()=>{
 for(const offset of [0,128,256])for(const pingPong of [0,1])for(const alpha of [.15,.8]){
  const channels=[new Float32Array(12288),new Float32Array(12288)],fraction=.37,h=Array.from({length:256},(_,i)=>alpha*(1-alpha)**i),kernel=new Float64Array(257);
  h.forEach((x,i)=>{kernel[i]+=x*(1-fraction);kernel[i+1]+=x*fraction;});
  const convolved=new Float64Array(514);for(let a=0;a<kernel.length;a++)for(let b=0;b<kernel.length;b++)convolved[a+b]+=kernel[a]*kernel[b];
  kernel.forEach((x,i)=>channels[0][4096+i]+=.25*x);convolved.forEach((x,i)=>channels[pingPong?1:0][8192+offset+i]+=.125*x);
  expect(nativeFeedbackOffset({getChannelData:c=>channels[c]},4096,pingPong)).toBe(offset);
 }
});

test('silent or malformed native probes fail explicitly instead of guessing a browser compensation',()=>{
 expect(()=>nativeFeedbackOffset({getChannelData:()=>new Float32Array(12288)},4096,1)).toThrow('calibration failed');
 expect(()=>nativeFeedbackOffset({getChannelData:()=>new Float32Array(20)},4096,1)).toThrow('calibration failed');
});
