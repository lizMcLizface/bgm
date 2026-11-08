import {findTrigger,levels,spectrumDb,spectralPeak} from '../ui/scopeMath';

export const VIEWS=['Stereo','Left','Right','Mid','Side'],SPANS=[1,2,5,10,20,50,100,200,500],GAINS=[0,1,2,5,10,20,50,100],SIZES=[1024,2048,4096,8192,16384];
export const MONITOR_DEFAULTS={scope:{view:0,paused:false,span:4,gain:0,level:0,source:0,mode:0},spectrum:{view:0,paused:false,size:3,floor:-100,smoothing:.55,peakHold:false}};
export function validMonitorConfig(kind,value){
 const d=MONITOR_DEFAULTS[kind];if(!value||Object.keys(value).length!==Object.keys(d).length||Object.keys(value).some(k=>!(k in d)))return false;
 if(!Number.isInteger(value.view)||value.view<0||value.view>=VIEWS.length||typeof value.paused!=='boolean')return false;
 if(kind==='scope')return Number.isInteger(value.span)&&SPANS[value.span]!==undefined&&Number.isInteger(value.gain)&&GAINS[value.gain]!==undefined&&Number.isFinite(value.level)&&Math.abs(value.level)<=1&&[0,1].includes(value.source)&&[0,1,2].includes(value.mode);
 return Number.isInteger(value.size)&&SIZES[value.size]!==undefined&&Number.isFinite(value.floor)&&value.floor>=-120&&value.floor<=-40&&Number.isFinite(value.smoothing)&&value.smoothing>=0&&value.smoothing<=.95&&typeof value.peakHold==='boolean';
}
export const cleanMonitors=raw=>Object.fromEntries(Object.entries(MONITOR_DEFAULTS).map(([kind,d])=>[kind,validMonitorConfig(kind,raw?.[kind])?{...raw[kind]}:{...d}]));
export function channelsOf(frame,view){
 const {left,right}=frame;
 if(view===0)return [{label:'L',colour:'#86dcb0',samples:left},{label:'R',colour:'#e6b875',samples:right}];
 if(view<3)return [{label:view===1?'L':'R',colour:view===1?'#86dcb0':'#e6b875',samples:view===1?left:right}];
 return [{label:view===3?'M':'S',colour:view===3?'#8fcbdc':'#c3a3e5',samples:Float32Array.from(left,(v,i)=>(v+(view===3?right[i]:-right[i]))*.5)}];
}
export function stereoLevels(frame){
 const l=levels(frame.left),r=levels(frame.right);let dot=0,le=0,re=0;
 for(let i=0;i<frame.left.length;i++){const a=frame.left[i],b=frame.right[i];dot+=a*b;le+=a*a;re+=b*b;}
 return {left:l,right:r,correlation:le*re>1e-16?Math.max(-1,Math.min(1,dot/Math.sqrt(le*re))):null};
}
export function scopeFrame(frame,cfg,{after=-Infinity,single=false}={}){
 const count=Math.max(2,Math.round(SPANS[cfg.span]*frame.rate/1000)),pre=Math.floor(count*.1),signal=cfg.source?frame.right:frame.left,from=Math.max(pre,Math.ceil(after-(frame.end-signal.length))),to=signal.length-(count-pre);
 const selected=channelsOf(frame,cfg.view);let peak=0;for(const ch of selected)for(const v of ch.samples.subarray(-count))peak=Math.max(peak,Math.abs(v));
 const gain=GAINS[cfg.gain]||(peak>1e-5?Math.min(100,1/(peak*1.1)):1),at=findTrigger(signal,cfg.level/gain,1,from,to,!single);
 if(at<0&&cfg.mode!==0)return null;
 const start=at<0?Math.max(0,signal.length-count):at-pre;
 const stereo={left:frame.left.subarray(start,start+count),right:frame.right.subarray(start,start+count)};
 return {rate:frame.rate,gain,triggered:at>=0,end:frame.end,channels:selected.map(ch=>({...ch,samples:ch.samples.slice(start,start+count)})),stereo,levels:stereoLevels(stereo)};
}
export function spectrumFrame(frame,cfg,previous){
 const size=SIZES[cfg.size],selected=channelsOf(frame,cfg.view),channels=selected.map((ch,i)=>{
  const bins=spectrumDb(ch.samples,size),candidate=previous?.channels[i],old=candidate?.label===ch.label&&candidate.bins.length===bins.length?candidate:null;
  if(old)for(let k=0;k<bins.length;k++)bins[k]=old.bins[k]*cfg.smoothing+bins[k]*(1-cfg.smoothing);
  const hold=cfg.peakHold?Float32Array.from(bins,(v,k)=>Math.max(v,old?.hold?.[k]??-Infinity)):null;
  return {label:ch.label,colour:ch.colour,bins,hold,peak:spectralPeak(bins,frame.rate,size)};
 });
 return {rate:frame.rate,end:frame.end,channels,levels:stereoLevels(frame)};
}
/** Stereo PCM16 of the captured window; display Mid/Side never changes export. */
export function stereoWavBytes(frame){
 const {left,right}=frame.stereo,n=Math.min(left.length,right.length),buffer=new ArrayBuffer(44+n*4),view=new DataView(buffer),text=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,36+n*4,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,2,true);view.setUint32(24,frame.rate,true);view.setUint32(28,frame.rate*4,true);view.setUint16(32,4,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,n*4,true);
 for(let i=0;i<n;i++)for(let ch=0;ch<2;ch++){const sample=Math.max(-1,Math.min(1,(ch?right:left)[i]));view.setInt16(44+i*4+ch*2,Math.round(sample*(sample<0?32768:32767)),true);}return buffer;
}
