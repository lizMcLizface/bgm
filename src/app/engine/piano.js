import { cachedNoteBuffer, noteCacheStats, clearNoteCache } from './noteBufferCache';
export const pianoCacheStats=noteCacheStats;
export const clearPianoCache=clearNoteCache;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,Number.isFinite(x)?x:lo));

/** Struck partials with separate decay rates; no recorded samples. */
export function renderPiano(sampleRate,frequency,{type='felt',decay=2.5,brightness=.45,hammer=.3,unison=.25,velocity=.8,seed=1,resonance=0,softness=0}={}) {
    const sr=clamp(sampleRate,8000,192000),freq=clamp(frequency,10,sr/6),electric=type==='electric';
    decay=clamp(decay,.3,5);brightness=clamp(brightness,0,1);hammer=clamp(hammer,0,1);unison=clamp(unison,0,1);velocity=clamp(velocity,0,1);
    softness=clamp(softness,0,1);
    const life=decay*clamp((220/freq)**.25,.55,1.7),duration=Math.min(6,Math.max(.6,life*1.2));
    const out=new Float32Array(Math.ceil(sr*duration)),ratios=electric?[1,2,3,4,5,6,7,8,2.76,5.4]:Array.from({length:12},(_,i)=>i+1);
    const brilliance=.2+.8*brightness*(.25+.75*velocity),stiffness=electric?0:.00006*(freq/440)**.6;
    const contactHz=Math.max(freq*2.5,1000+10000*(1-softness)**2);
    function partial(frequency,amplitude,t60,bloom=0) {
        if(frequency>sr*.45)return;
        const theta=2*Math.PI*frequency/sr,r=Math.exp(-Math.log(1000)/(sr*t60)),c=2*r*Math.cos(theta),r2=r*r;
        let previous=0,current=amplitude*Math.sin(theta)*r;
        const count=Math.min(out.length,Math.ceil(sr*t60*1.5));
        let rise=bloom?1:0;const riseDecay=bloom?Math.exp(-1/(sr*bloom)):0;
        for(let i=0;i<count;i++){out[i]+=bloom?previous*(1-rise):previous;rise*=riseDecay;const next=c*current-r2*previous;previous=current;current=next;}
    }
    ratios.forEach((ratio,index)=>{
        const upper=index>=8&&electric;
        const pitch=ratio*Math.sqrt((1+stiffness*ratio*ratio)/(1+stiffness));
        const contact=softness>0?1/Math.sqrt(1+(freq*pitch/contactHz)**4):1;
        const amplitude=.44*(upper?.12:1)/(ratio**(1.8-brilliance*.7))*Math.exp(-(ratio-1)*(1-brilliance)*.28)*contact;
        const tail=life/(1+(electric?.08:.14)*(ratio-1)**1.3)*(upper?.2:1);
        partial(freq*pitch,amplitude,Math.max(.035,tail),softness*.003);
        if(index<2&&unison>0)partial(freq*pitch*2**((electric?1.5:.8)*unison/1200),amplitude*.3*unison,Math.max(.035,tail*.85),softness*.003);
    });
    // Sympathetic upper modes bloom after the strike, beneath the original partials.
    // No extra attack, pitch modulation or change to the fundamental/decay envelope.
    const amount=clamp(resonance,0,1);
    if(amount>0)for(const h of (electric?[2,3,4,6,8]:[2,3,4,5,6])){
        const pitch=h*Math.sqrt((1+stiffness*h*h)/(1+stiffness));
        const colour=electric?(h%2===0?1:.28):Math.exp(-.18*(h-2));
        partial(freq*pitch,amount*.055*colour*(.35+.65*brilliance)/Math.sqrt(h),
            Math.max(.035,life*(electric?.8:.65)/(1+.06*(h-2))),electric?.055:.035);
    }
    let state=((seed>>>0)^Math.round(freq*100))||1,noise=0,last=0,dc=0,peak=0;
    const dcPole=Math.exp(-2*Math.PI*10/sr),strikeDecay=Math.exp(-1/(sr*(electric?.006:.012)));
    let strike=hammer*velocity**1.5*(electric?.025:.055)*(1-.8*softness);
    const noiseAlpha=softness>0?1-Math.exp(-2*Math.PI*Math.min(1800,contactHz*.5)/sr):.25;
    for(let i=0;i<out.length;i++){
        state^=state<<13;state^=state>>>17;state^=state<<5;
        noise+=noiseAlpha*((state>>>0)/2147483648-1-noise);
        const raw=out[i]+noise*strike;strike*=strikeDecay;
        dc=raw-last+dcPole*dc;last=raw;
        out[i]=dc*Math.max(0,Math.min(1,i/(sr*(.001+softness*.002)),(out.length-1-i)/(sr*.025)));peak=Math.max(peak,Math.abs(out[i]));
    }
    if(peak>.8)for(let i=0;i<out.length;i++)out[i]*=.8/peak;
    return out;
}

export function pianoBuffer(context,frequency,options={}) {
    const freq=Math.round(frequency*100)/100;
    // Eight brightness layers bound cache growth; gain still follows exact velocity.
    const settings={...options,velocity:Math.round(clamp(options.velocity ?? .8,0,1)*7)/7};
    return cachedNoteBuffer(context,['piano',freq,settings],()=>renderPiano(context.sampleRate,freq,settings));
}

// A quiet harmonic body sustains under the transient until the note releases.
// One exact cycle loops without a seam; playbackRate sets the actual pitch.
export function renderPianoBody(sampleRate,frequency,{type='felt',brightness=.45,velocity=.8,sustain=0,resonance=0}={}) {
    const out=new Float32Array(2048),amount=clamp(sustain,0,1),bright=clamp(brightness,0,1)*(.25+.75*clamp(velocity,0,1));
    const harmonics=Math.min(type==='electric'?4:3,Math.floor(sampleRate*.45/frequency));
    for(let i=0;i<out.length;i++)for(let h=1;h<=harmonics;h++)
        out[i]+=.44*amount*(h===1?1:bright*.22/h)*Math.sin(2*Math.PI*h*i/out.length);
    // Exact-cycle harmonics retain the original sustained fundamental and loop seam.
    const colour=clamp(resonance,0,1),limit=Math.min(8,Math.floor(sampleRate*.45/frequency));
    if(colour>0)for(let h=2;h<=limit;h++){
        const weight=type==='electric'?(h%2===0?1:.2):Math.exp(-.24*(h-2));
        const level=.44*amount*colour*(.25+.75*bright)*.16*weight/Math.sqrt(h);
        for(let i=0;i<out.length;i++)out[i]+=level*Math.sin(2*Math.PI*h*i/out.length);
    }
    return out;
}
export function pianoBodyBuffer(context,frequency,options={}) {
    const settings={type:options.type,brightness:options.brightness,sustain:options.sustain,resonance:options.resonance,velocity:Math.round(clamp(options.velocity??.8,0,1)*7)/7};
    return cachedNoteBuffer(context,['piano-body',Math.min(options.resonance>0?8:4,Math.floor(context.sampleRate*.45/frequency)),settings],()=>renderPianoBody(context.sampleRate,frequency,settings));
}
