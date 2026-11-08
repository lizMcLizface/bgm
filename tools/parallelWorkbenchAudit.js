import {createParallelRack} from '../src/synths/effects/workbenchRack';
import {parallelPreset} from '../src/synths/effects/parallelModel';
import {cleanRack} from '../src/synths/effects/params';
import {faderGain,ceilingDb} from '../src/synths/all/mixerAudio';
import {createExtraStage} from '../src/synths/effects/extras';
let result;
const max=channels=>{let p=0;for(const a of channels)for(const v of a){if(!Number.isFinite(v))return Infinity;p=Math.max(p,Math.abs(v));}return p;};
const difference=(a,b)=>{let e=0;for(let ch=0;ch<2;ch++)for(let i=0;i<a[ch].length;i++)e=Math.max(e,Math.abs(a[ch][i]-b[ch][i]));return e;};
async function auditVibrato(rate){
 const frequencies=[440,660],ctx=new OfflineAudioContext(2,rate*2,rate),buffer=ctx.createBuffer(2,rate*2,rate),source=ctx.createBufferSource();
 for(let ch=0;ch<2;ch++){const a=buffer.getChannelData(ch);for(let i=0;i<a.length;i++)a[i]=.1*Math.sin(2*Math.PI*frequencies[ch]*i/rate);}
 const vibrato=await createExtraStage(ctx,'vibrato');vibrato.patch({on:true,rate:4.5,depth:12},true);source.buffer=buffer;source.connect(vibrato.input);vibrato.output.connect(ctx.destination);source.start();
 try{
  const out=await ctx.startRendering(),channels=frequencies.map((home,ch)=>{const a=out.getChannelData(ch),crossings=[];for(let i=Math.ceil(rate*.25);i<a.length-1;i++)if(a[i]<=0&&a[i+1]>0)crossings.push(i-a[i]/(a[i+1]-a[i]));
   const hz=crossings.slice(1).map((x,i)=>rate/(x-crossings[i])),low=Math.min(...hz),high=Math.max(...hz),swing=1200*Math.log2(high/low),centre=(high+low)/2;
   return {low,high,swingCents:swing,passed:Math.abs(centre-home)<.2&&swing>23&&swing<25};});return {channels,passed:channels.every(c=>c.passed)};
 }finally{source.disconnect();vibrato.dispose();}
}
async function render(rate,{solo,master=true,silent=false,hot=false,fadeMaster=false}={}){
 const n=Math.ceil(rate*1.3),ctx=new OfflineAudioContext(2,n,rate),p=parallelPreset(),raw=cleanRack();p.mixer.master.limit=hot;p.mixer.master.vol=.75;p.mixer.master.ceil=.5;
 if(!master)p.buses.master.rack['master.enabled']=0;
 p.mixer.strips.dry.mute=false;
 if(solo)p.mixer.strips[solo].solo=true;
 if(silent)for(const strip of Object.values(p.mixer.strips))strip.mute=true;
 if(hot){raw['master.output']=12;for(const strip of Object.values(p.mixer.strips))strip.gain=.5;}
 const graph=await createParallelRack(ctx,raw,p),buffer=ctx.createBuffer(2,n,rate),source=ctx.createBufferSource(),input=[buffer.getChannelData(0),buffer.getChannelData(1)];
 for(let i=Math.ceil(rate*.25);i<rate*.55;i++){input[0][i]=(hot?.9:.04)*Math.sin(2*Math.PI*220*i/rate);input[1][i]=(hot?.8:.035)*Math.sin(2*Math.PI*330*i/rate);}
 source.buffer=buffer;source.connect(graph.input);graph.connect(ctx.destination);source.start();
 const faded=fadeMaster?ctx.suspend(.65).then(()=>{p.mixer.master.vol=0;graph.applyDesk(p.mixer);return ctx.resume();}):Promise.resolve();
 try{const out=await ctx.startRendering();await faded;return {channels:[out.getChannelData(0).slice(),out.getChannelData(1).slice()],input,ceiling:10**(ceilingDb(p.mixer.master.ceil)/20)};}finally{source.disconnect();graph.dispose();}
}
async function audit(rate){
 const rows={};for(const [id,settings] of Object.entries({all:{},dry:{solo:'dry'},drive:{solo:'drive'},wet:{solo:'wet'},silence:{silent:true},dryReference:{solo:'dry',master:false},driveSum:{solo:'drive',master:false},wetSum:{solo:'wet',master:false},noMaster:{master:false},ceiling:{hot:true},masterFade:{fadeMaster:true}}))rows[id]=await render(rate,settings);
 // Isolate mixer summing from the downstream space processors. Their response
 // and final ceiling/tail behaviour are checked independently below.
 const sum=[new Float32Array(rows.noMaster.channels[0].length),new Float32Array(rows.noMaster.channels[0].length)];for(let ch=0;ch<2;ch++)for(let i=0;i<sum[ch].length;i++)sum[ch][i]=rows.dryReference.channels[ch][i]+rows.driveSum.channels[ch][i]+rows.wetSum.channels[ch][i];
 const delay=Math.ceil(rate*.003);let dryError=0;for(let ch=0;ch<2;ch++)for(let i=Math.ceil(rate*.35);i<rate*.5;i++)dryError=Math.max(dryError,Math.abs(rows.dryReference.channels[ch][i]-rows.dryReference.input[ch][i-delay]*faderGain(.75)));
 const sumError=difference(rows.noMaster.channels,sum),silencePeak=max(rows.silence.channels),masterDifference=difference(rows.all.channels,rows.noMaster.channels),ceilingPeak=max(rows.ceiling.channels);
 const peaks=Object.fromEntries(Object.entries(rows).map(([id,r])=>[id,max(r.channels)])),masterFaderTail=max(rows.masterFade.channels.map(ch=>ch.subarray(Math.ceil(rate*.9))));
 const vibrato=await auditVibrato(rate);
 return {rate,dryError,sumError,silencePeak,masterDifference,masterFaderTail,ceiling:rows.ceiling.ceiling,ceilingPeak,peaks,vibrato,passed:vibrato.passed&&dryError<2e-5&&sumError<3e-6&&silencePeak<3e-6&&masterDifference>1e-5&&masterFaderTail<1e-7&&ceilingPeak<=rows.ceiling.ceiling+1e-5&&peaks.drive>1e-5&&peaks.wet>1e-5&&Object.values(peaks).every(Number.isFinite)};
}
document.querySelector('#run').onclick=async()=>{const out=document.querySelector('#result'),button=document.querySelector('#run');button.disabled=true;try{const rows=[];for(const rate of [44100,48000,96000]){out.textContent=`Rendering ${rate} Hz…`;rows.push(await audit(rate));}result={passed:rows.every(r=>r.passed),rows};out.textContent=JSON.stringify(result,null,2);document.querySelector('#save').disabled=false;}catch(error){out.textContent=error.stack;}finally{button.disabled=false;}};
document.querySelector('#save').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='parallel-workbench-audit.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
