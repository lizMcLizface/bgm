import { renderPiano, renderPianoBody, pianoBuffer, pianoCacheStats, clearPianoCache } from './piano';

function measuredFrequency(data,sr,target) {
    if(sr/target<12){const start=Math.round(sr*.02),size=Math.round(sr*.15);const power=f=>{let re=0,im=0;for(let i=0;i<size;i++){const x=data[start+i]*(.5-.5*Math.cos(2*Math.PI*i/(size-1)));re+=x*Math.cos(2*Math.PI*f*i/sr);im+=x*Math.sin(2*Math.PI*f*i/sr);}return re*re+im*im;};let lo=target*.97,hi=target*1.03;for(let i=0;i<28;i++){const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;if(power(a)>power(b))hi=b;else lo=a;}return (lo+hi)/2;}
    const center=sr/target,lo=Math.floor(center*.97),hi=Math.ceil(center*1.03),start=Math.round(sr*.08),size=Math.round(sr*.2);
    const correlation=lag=>{let sum=0;for(let i=start;i<start+size;i++)sum+=data[i]*data[i+lag];return sum;};let best=lo;for(let lag=lo+1;lag<=hi;lag++)if(correlation(lag)>correlation(best))best=lag;
    const left=correlation(best-1),mid=correlation(best),right=correlation(best+1);return sr/(best+.5*(left-right)/(left-2*mid+right));
}
test('felt and electric models keep the fundamental across piano registers and sample rates',()=>{
    for(const type of ['felt','electric'])for(const sr of [24000,44100,48000])for(const midi of [24,36,48,60,69,81,93,100]){
        const frequency=440*2**((midi-69)/12),data=renderPiano(sr,frequency,{type,unison:0,decay:1.5});
        const cents=1200*Math.log2(measuredFrequency(data,sr,frequency)/frequency);
        expect(Math.abs(cents),`${type}/${sr}/${midi}: ${cents} cents`).toBeLessThan(6);
    }
});
test('partials decay and output remains bounded, deterministic and nearly DC-free',()=>{
    for(const type of ['felt','electric'])for(const frequency of [55,220,880]){
        const options={type,decay:.8,brightness:1,hammer:1,velocity:1,seed:42},data=renderPiano(24000,frequency,options);
        expect(data).toEqual(renderPiano(24000,frequency,options));let peak=0,mean=0,early=0,late=0;
        data.forEach((x,i)=>{if(!Number.isFinite(x))throw Error('Non-finite sample');peak=Math.max(peak,Math.abs(x));mean+=x;if(i<6000)early+=x*x;if(i>data.length-6000)late+=x*x;});
        expect(peak).toBeLessThanOrEqual(.801);expect(Math.abs(mean/data.length)).toBeLessThan(.005);expect(late).toBeLessThan(early*.1);
    }
});
test('harder strikes add upper-partial energy and different tone controls change the sound',()=>{
    const ratio=data=>{let high=0,total=0;for(let i=1;i<1200;i++){high+=(data[i]-data[i-1])**2;total+=data[i]**2;}return high/total;};
    expect(ratio(renderPiano(24000,220,{velocity:1,brightness:1}))).toBeGreaterThan(ratio(renderPiano(24000,220,{velocity:.2,brightness:1}))*1.3);
    expect(renderPiano(24000,220,{type:'felt'})).not.toEqual(renderPiano(24000,220,{type:'electric'}));
    expect(renderPiano(24000,220,{hammer:0})).not.toEqual(renderPiano(24000,220,{hammer:1}));
});
test('velocity layers reuse buffers within the shared note-memory budget',()=>{
    const context={sampleRate:24000,createBuffer:(_,length)=>({length,getChannelData:()=>new Float32Array(length)})};
    clearPianoCache();const first=pianoBuffer(context,220,{decay:.3,velocity:.8});expect(pianoBuffer(context,220,{decay:.3,velocity:.81})).toBe(first);
    expect(pianoBuffer(context,220,{decay:.3,velocity:.2})).not.toBe(first);
    for(let i=0;i<40;i++)pianoBuffer(context,55+i,{decay:3,velocity:.8});
    expect(pianoCacheStats().bytes).toBeLessThanOrEqual(pianoCacheStats().maxBytes);clearPianoCache();
});

test('held body is periodic, bounded and controllable without an artificial tail fade',()=>{
    const rms=a=>Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length);
    for(const type of ['felt','electric'])for(const frequency of [55,220,1760]){
        const body=renderPianoBody(24000,frequency,{type,sustain:.3});
        expect(rms(body)).toBeGreaterThan(.09);expect(Math.max(...body.map(Math.abs))).toBeLessThan(.2);
        expect(Math.abs(body[0])).toBeLessThan(1e-6);
        // End-to-start slope agrees with the start of the next cycle.
        expect(Math.abs(-body.at(-1)-body[1])).toBeLessThan(1e-6);
        expect(rms(renderPianoBody(24000,frequency,{type,sustain:0}))).toBe(0);
        expect(rms(renderPianoBody(24000,frequency,{type,sustain:.6}))).toBeCloseTo(2*rms(body),5);
    }
});
