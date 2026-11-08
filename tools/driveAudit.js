import {createDriveStage} from '../src/synths/effects/driveStage';
import {DRIVE_PEDALS} from '../src/synths/effects/driveModel';

const N=8192;
function spectrum(samples){
 const re=Float64Array.from(samples),im=new Float64Array(N);
 for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){const t=re[i];re[i]=re[j];re[j]=t;}}
 for(let len=2;len<=N;len*=2)for(let at=0;at<N;at+=len)for(let j=0;j<len/2;j++){const angle=-2*Math.PI*j/len,c=Math.cos(angle),s=Math.sin(angle),a=at+j,b=a+len/2,x=re[b]*c-im[b]*s,y=re[b]*s+im[b]*c;re[b]=re[a]-x;im[b]=im[a]-y;re[a]+=x;im[a]+=y;}
 return Float64Array.from({length:N/2},(_,i)=>(re[i]**2+im[i]**2)/N**2);
}
async function render(rate,kind,params,{enabled=true,frequency=997,oversample='4x',amplitude=.1,edit=false,channel='left'}={}){
 const length=N*4,ctx=new OfflineAudioContext(2,length,rate),buffer=ctx.createBuffer(2,length,rate),bin=Math.round(frequency*N/rate),hz=bin*rate/N;
 const input=buffer.getChannelData(channel==='right'?1:0);for(let i=0;i<length;i++)input[i]=amplitude*Math.sin(2*Math.PI*hz*i/rate);
 const source=ctx.createBufferSource();source.buffer=buffer;const stage=createDriveStage(ctx,kind,{oversample});stage.patch({params,enabled},true);
 if(edit){ctx.suspend(N/rate).then(()=>{stage.patch({params:{gain:24},enabled:true});ctx.resume();});}
 source.connect(stage.input);stage.output.connect(ctx.destination);source.start();const start=performance.now(),out=await ctx.startRendering(),elapsedMs=performance.now()-start,l=out.getChannelData(0),r=out.getChannelData(1),tail=l.slice(-N),bins=spectrum(tail);
 let peak=0,rPeak=0,sum=0,dc=0,error=0,delta=0;
 for(let i=0;i<l.length;i++){if(!Number.isFinite(l[i])||!Number.isFinite(r[i]))throw Error('Nonfinite output');peak=Math.max(peak,Math.abs(l[i]));rPeak=Math.max(rPeak,Math.abs(r[i]));delta=Math.max(delta,Math.abs(l[i]-(l[i-1]??0)));const gain=enabled&&kind==='boost'?10**(params.gain/20):1;error=Math.max(error,Math.abs(l[i]-buffer.getChannelData(0)[i]*gain),Math.abs(r[i]-buffer.getChannelData(1)[i]*gain));}
 for(const x of tail){sum+=x*x;dc+=x;}
 let harmonic=0,other=0;const excluded=new Set([0]);for(let h=1;h*bin<N/2;h++){const k=h*bin;for(let d=-1;d<=1;d++)excluded.add(k+d);if(h>1)harmonic+=bins[k];}for(let i=1;i<bins.length;i++)if(!excluded.has(i))other+=bins[i];
 stage.dispose();return {rate,kind,params,enabled,channel,oversample,hz,peak,rPeak,rms:Math.sqrt(sum/N),dc:dc/N,maxIdentityError:error,maxSampleDelta:delta,thd:Math.sqrt(harmonic/Math.max(1e-20,bins[bin])),nonharmonicPower:other,elapsedMs,audioSeconds:length/rate};
}
let report;
document.querySelector('#run').onclick=async()=>{
 const result=document.querySelector('#result'),run=document.querySelector('#run');run.disabled=true;const rows=[],checks=[];result.textContent='Rendering…';
 try{
  for(const rate of [44100,48000,96000]){
   for(const kind of Object.keys(DRIVE_PEDALS)){
    const defaults=DRIVE_PEDALS[kind].params.defaultValues(),normal=await render(rate,kind,defaults),bypass=await render(rate,kind,defaults,{enabled:false}),right=await render(rate,kind,defaults,{channel:'right'});rows.push(normal,bypass,right);checks.push({name:`${rate} ${kind} bypass/stereo`,pass:bypass.maxIdentityError<1e-7&&normal.rPeak===0&&normal.rms>0&&right.peak===0&&Math.abs(right.rPeak-normal.peak)<1e-7});
    if(kind==='boost')checks.push({name:`${rate} boost linear gain`,pass:normal.maxIdentityError<2e-7});
    else{
     const params=Object.fromEntries(DRIVE_PEDALS[kind].params.PARAMS.map(p=>[p.key,p.max])),high=await render(rate,kind,params,{frequency:rate*.145,amplitude:.8}),alias=await render(rate,kind,params,{frequency:rate*.145,amplitude:.8,oversample:'none'});rows.push(high,alias);checks.push({name:`${rate} ${kind} alias reduction`,pass:high.nonharmonicPower<alias.nonharmonicPower*.5},{name:`${rate} ${kind} DC/extremes`,pass:Math.abs(high.dc)<.002&&high.peak<4.25&&normal.thd>.01});
    }
   }
   const sweep=await render(rate,'boost',{gain:0},{edit:true,amplitude:.01});rows.push(sweep);checks.push({name:`${rate} boost smooth edit`,pass:sweep.maxSampleDelta<.03});
  }
  report={passed:checks.every(c=>c.pass),checks,rows};result.textContent=JSON.stringify(report,null,2);document.querySelector('#save').disabled=false;
 }catch(error){result.textContent=error.stack;}finally{run.disabled=false;}
};
document.querySelector('#save').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='drive-audit.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
