import {fft} from './spectral';
export function stereoMeasure(channels){
 let energy=0,mid=0,side=0,left=0,right=0,cross=0,peak=0;const n=channels[0].length;
 for(let i=0;i<n;i++){const l=channels[0][i],r=channels[1][i];if(!Number.isFinite(l)||!Number.isFinite(r))throw Error('Nonfinite tone output.');left+=l*l;right+=r*r;cross+=l*r;energy+=l*l+r*r;mid+=((l+r)*.5)**2;side+=((l-r)*.5)**2;peak=Math.max(peak,Math.abs(l),Math.abs(r));}
 const rms=Math.sqrt(energy/(2*n));return {peak,rms,correlation:left*right>1e-30?cross/Math.sqrt(left*right):null,monoDb:rms>1e-15?20*Math.log10(Math.max(1e-15,Math.sqrt(mid/n)/rms)):null,sideRms:Math.sqrt(side/n)};
}
function probeProcess(e,input,method,extra=0,{edits=[]}={}){
 const frames=input[0].length,out=[new Float32Array(frames),new Float32Array(frames)];let at=0,event=0;
 while(at<frames){while(event<edits.length&&edits[event].frame===at){const edit=edits[event++];e.engine_param(0,edit.index,edit.value);}const n=Math.min(2048,frames-at,(edits[event]?.frame??frames)-at);if(n<=0)throw Error('Probe edits must be ordered and in range.');
  for(let ch=0;ch<2;ch++)new Float32Array(e.memory.buffer,e.engine_probe_input(ch),n).set(input[ch].subarray(at,at+n));e[method](n,extra);for(let ch=0;ch<2;ch++)out[ch].set(new Float32Array(e.memory.buffer,ch?e.engine_right():e.engine_left(),n),at);at+=n;
 }return out;
}
export function impulseResponse(module,config,{modern=true,size=65536}={}){
 const e=new WebAssembly.Instance(module,{}).exports,signal=new Float32Array(size);signal[0]=.001;
 e.engine_filter_probe_init(config.rate,config.cutoff,config.resonance,config.response??0,config.family??0,modern?1:0);
 return probeProcess(e,[signal,signal],'engine_filter_probe_process')[0];
}
export function chorusProbe(module,input,config,{modern=true,wetOnly=false,phase=0,edits=[]}={}){
 const e=new WebAssembly.Instance(module,{}).exports;e.engine_chorus_probe_init(config.rate,config.amount,config.speed,config.depth,phase,modern?1:0);
 return probeProcess(e,input,'engine_chorus_probe_process',wetOnly?1:0,{edits});
}
export function responseCurve(impulse,rate,amplitude=.001){
 const real=Float64Array.from(impulse),imag=new Float64Array(impulse.length);fft(real,imag);const magnitude=new Float32Array(impulse.length/2+1);
 for(let i=0;i<magnitude.length;i++)magnitude[i]=20*Math.log10(Math.max(1e-8,Math.hypot(real[i],imag[i])/amplitude));
 return {db:magnitude,binHz:rate/impulse.length,rate};
}
export function atFrequency(curve,hz){const at=Math.max(0,Math.min(curve.db.length-1,hz/curve.binHz)),i=Math.floor(at),f=at-i;return curve.db[i]*(1-f)+(curve.db[Math.min(i+1,curve.db.length-1)])*f;}
export function deterministicNoise(rate,seconds=3){
 let state=0x72e5b1;const data=new Float32Array(Math.ceil(rate*seconds));for(let i=0;i<data.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;data[i]=((state>>>0)/0xffffffff*2-1)*.1;}return [data,data.slice()];
}
export function filterSummary(curve,cutoff){let peak=-160,peakHz=0;for(let i=Math.ceil(20/curve.binHz);i<curve.db.length;i++)if(curve.db[i]>peak){peak=curve.db[i];peakHz=i*curve.binHz;}return {bassDb:atFrequency(curve,50),cutoffDb:atFrequency(curve,cutoff),peakDb:peak,peakHz};}
