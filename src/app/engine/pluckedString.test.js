import { renderString, stringBuffer, stringCacheStats, clearStringCache } from './pluckedString';

function measuredFrequency(data,sr,target){
    if(sr/target<12) { const start=Math.round(sr*.015),size=Math.round(sr*.15); const power=f=>{let re=0,im=0; for(let i=0;i<size;i++){const x=data[start+i]*(.5-.5*Math.cos(2*Math.PI*i/(size-1))); re+=x*Math.cos(2*Math.PI*f*i/sr); im+=x*Math.sin(2*Math.PI*f*i/sr);}return re*re+im*im;}; let lo=target*.97,hi=target*1.03;for(let j=0;j<28;j++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(power(a)>power(b))hi=b;else lo=a;}return (lo+hi)/2; }
    const center=sr/target,lo=Math.floor(center*.97),hi=Math.ceil(center*1.03),start=Math.round(sr*.05),size=Math.min(Math.round(sr*.15),data.length-hi-start);
    const correlation=lag=>{let sum=0;for(let i=start;i<start+size;i++)sum+=data[i]*data[i+lag];return sum;};
    let best=lo;for(let lag=lo+1;lag<=hi;lag++)if(correlation(lag)>correlation(best))best=lag;
    const left=correlation(best-1),middle=correlation(best),right=correlation(best+1);
    const offset=.5*(left-right)/(left-2*middle+right);
    return sr/(best+offset);
}
test('strings stay tuned across bass, guitar and harp registers at browser sample rates',()=>{
    for(const sr of [24000,44100,48000])for(const midi of [24,36,48,60,69,81,93,100]){
        const frequency=440*2**((midi-69)/12),data=renderString(sr,frequency,{seed:17,decay:1.5,damping:.45});
        const measured=measuredFrequency(data,sr,frequency),cents=1200*Math.log2(measured/frequency);
        expect(Math.abs(cents),`${sr}/${midi}: ${cents} cents`).toBeLessThan(5);
    }
});
test('feedback stays bounded, decays, removes DC and is deterministic',()=>{
    for(const frequency of [32.7,110,440,2093])for(const damping of [0,1]){
        const data=renderString(24000,frequency,{seed:42,decay:.8,damping,body:1});
        expect(data).toEqual(renderString(24000,frequency,{seed:42,decay:.8,damping,body:1}));
        let peak=0,mean=0,early=0,late=0;
        data.forEach((x,i)=>{expect(Number.isFinite(x)).toBe(true);peak=Math.max(peak,Math.abs(x));mean+=x;if(i<6000)early+=x*x;if(i>data.length-6000)late+=x*x;});
        expect(peak).toBeLessThanOrEqual(.701);expect(Math.abs(mean/data.length)).toBeLessThan(.005);
        expect(late).toBeLessThan(early*.1);
    }
});
test('pluck position and body alter timbre; buffers are cached within a fixed memory budget',()=>{
    expect(renderString(24000,220,{position:.1})).not.toEqual(renderString(24000,220,{position:.4}));
    expect(renderString(24000,220,{body:0})).not.toEqual(renderString(24000,220,{body:1}));
    const context={sampleRate:24000,createBuffer:(_,length)=>({length,getChannelData:()=>new Float32Array(length)})};
    clearStringCache();const first=stringBuffer(context,220,{decay:.2});expect(stringBuffer(context,220,{decay:.2})).toBe(first);
    for(let i=0;i<100;i++)stringBuffer(context,50+i,{decay:3});
    expect(stringCacheStats().bytes).toBeLessThanOrEqual(stringCacheStats().maxBytes);clearStringCache();
});

test('instrument body modes retain string tuning and bounded decaying output',()=>{
 for(const bodyType of ['guitar','harp','bass','kalimba']){
  for(const midi of [36,48,60,81,100]){
   const sr=24000,frequency=440*2**((midi-69)/12),options={seed:17,decay:1.5,damping:.45,body:.7,resonance:1,bodyType};
   const data=renderString(sr,frequency,options),measured=measuredFrequency(data,sr,frequency);
   expect(Math.abs(1200*Math.log2(measured/frequency)),bodyType+'/'+midi).toBeLessThan(5);
  }
  const options={seed:42,decay:.8,damping:1,body:1,resonance:1,bodyType},data=renderString(24000,110,options);
  expect(data).toEqual(renderString(24000,110,options));let peak=0,mean=0,early=0,late=0;
  for(let i=0;i<data.length;i++){expect(Number.isFinite(data[i])).toBe(true);peak=Math.max(peak,Math.abs(data[i]));mean+=data[i];if(i<6000)early+=data[i]**2;if(i>data.length-6000)late+=data[i]**2;}
  expect(peak).toBeLessThanOrEqual(.701);expect(Math.abs(mean/data.length)).toBeLessThan(.005);expect(late).toBeLessThan(early*.1);
 }
});
test('body refinement keeps the old bypass and zero-body sound and separates cached variants',()=>{
 const options={seed:42,decay:.5,body:.4};
 expect(renderString(24000,220,options)).toEqual(renderString(24000,220,{...options,resonance:0,bodyType:'harp'}));
 expect(renderString(24000,220,{...options,body:0})).toEqual(renderString(24000,220,{...options,body:0,resonance:1}));
 const guitar=renderString(24000,220,{...options,resonance:1,bodyType:'guitar'}),harp=renderString(24000,220,{...options,resonance:1,bodyType:'harp'});expect(guitar).not.toEqual(harp);
 const context={sampleRate:24000,createBuffer:(_,length)=>({length,getChannelData:()=>new Float32Array(length)})};clearStringCache();
 const before=stringBuffer(context,220,options),after=stringBuffer(context,220,{...options,resonance:1,bodyType:'guitar'});expect(before).not.toBe(after);expect(stringBuffer(context,220,{...options,resonance:1,bodyType:'guitar'})).toBe(after);clearStringCache();
});
