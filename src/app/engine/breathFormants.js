const clamp=(n,lo,hi,fallback=lo)=>Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):fallback;
export const VOWELS={ah:[700,1200,2600],oo:[350,900,2400],ee:[300,2200,3000]};
export function voiceColour(raw={}) {
 return {breath:clamp(raw.breathAmount,0,1),formant:clamp(raw.formantAmount,0,1),vowel:VOWELS[raw.formantVowel]?raw.formantVowel:'ah',shift:clamp(raw.formantShift,-12,12,0)};
}
export function formantBands(colour,sampleRate=48000) {
 return VOWELS[colour.vowel].map((f,i)=>({frequency:Math.min(sampleRate*.4,f*2**(colour.shift/12)),q:[5,7,9][i],weight:[.5,.3,.2][i]}));
}
const noiseBuffers=new WeakMap();
function airBuffer(ctx){
 if(!noiseBuffers.has(ctx)){
  const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);let state=0x5f3759df,mean=0;
  for(let i=0;i<data.length;i++){state^=state<<13;state^=state>>>17;state^=state<<5;data[i]=((state>>>0)/4294967296)*2-1;mean+=data[i];}
  mean/=data.length;for(let i=0;i<data.length;i++)data[i]-=mean;noiseBuffers.set(ctx,buffer);
 }
 return noiseBuffers.get(ctx);
}
/** Lazy per-voice colour stage, before the existing amplitude envelope. */
export class BreathFormants {
 constructor(ctx){
  this.ctx=ctx;this.input=ctx.createGain();this.output=ctx.createGain();this.dry=ctx.createGain();this.input.connect(this.dry);this.dry.connect(this.output);this.sources=new Set();
  this.bands=Array.from({length:3},()=>{const filter=ctx.createBiquadFilter(),gain=ctx.createGain();filter.type='bandpass';gain.gain.value=0;this.input.connect(filter);filter.connect(gain);gain.connect(this.output);return {filter,gain};});
  this.airHigh=ctx.createBiquadFilter();this.airHigh.type='highpass';this.airHigh.frequency.value=650;this.airHigh.Q.value=.5;
  this.airLow=ctx.createBiquadFilter();this.airLow.type='lowpass';this.airLow.frequency.value=Math.min(7000,ctx.sampleRate*.4);this.airLow.Q.value=.5;
  this.airGain=ctx.createGain();this.airGain.gain.value=0;this.airHigh.connect(this.airLow);this.airLow.connect(this.airGain);this.airGain.connect(this.output);
 }
 schedule(raw,plan,time,frequency){
  const c=voiceColour(raw),end=Math.max(plan.duration,...plan.gainPoints.map(p=>p[0]));
  const set=(p,value)=>{p.cancelScheduledValues(time);p.setValueAtTime(value,time);};
  // A bounded source trim keeps vowel filtering from hollowing out pad levels.
  set(this.output.gain,Math.min(2,1/(1-c.formant*.55)));
  set(this.dry.gain,1-c.formant*.65);
  formantBands(c,this.ctx.sampleRate).forEach((b,i)=>{set(this.bands[i].filter.frequency,b.frequency);set(this.bands[i].filter.Q,b.q);set(this.bands[i].gain.gain,c.formant*.65*b.weight);});
  this.airGain.gain.cancelScheduledValues(time);this.airGain.gain.setValueAtTime(0,time);
  if(c.breath>0){
   const amount=c.breath*.25,attack=Math.min(.06,Math.max(.008,plan.duration*.15));
   this.airGain.gain.linearRampToValueAtTime(amount,time+attack);
   this.airGain.gain.setTargetAtTime(amount*.55,time+attack,.12);
   const source=this.ctx.createBufferSource();source.buffer=airBuffer(this.ctx);source.loop=true;source.connect(this.airHigh);
   const item={source,start:time,stop:time+end};this.sources.add(item);source.onended=()=>{source.disconnect();this.sources.delete(item);};source.start(time,(frequency*.013)%2);source.stop(time+end);
  }
 }
 stop(time=this.ctx.currentTime){for(const item of this.sources){const cut=Math.min(time,item.stop);if(cut<item.stop){try{item.source.stop(cut);item.stop=cut;}catch{}}}}
 destroy(){for(const item of this.sources){try{item.source.stop();}catch{}item.source.disconnect();}this.sources.clear();for(const n of [this.input,this.output,this.dry,this.airHigh,this.airLow,this.airGain,...this.bands.flatMap(b=>[b.filter,b.gain])])n.disconnect();}
}
