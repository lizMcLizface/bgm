// A single, fully wet stereo delay: pitch movement without a dry comb signal.
// Both channels share the same sine LFO so stereo position remains stable.
export const VIBRATO_LATENCY=.012;
export const vibratoDelayDepth=(rate,cents)=>(2**(Math.max(0,Math.min(50,cents))/1200)-1)/(2*Math.PI*Math.max(.5,Math.min(10,rate)));
export function createVibrato(context){
 const delay=context.createDelay(.03),lfo=context.createOscillator(),depth=context.createGain();
 delay.channelCount=2;delay.channelCountMode='explicit';delay.delayTime.value=VIBRATO_LATENCY;
 lfo.type='sine';lfo.connect(depth);depth.connect(delay.delayTime);lfo.start();
 const set=(p,v,initial)=>initial?p.setValueAtTime(v,context.currentTime):p.setTargetAtTime(v,context.currentTime,.02);
 return {input:delay,output:delay,nodes:[delay,lfo,depth],oscillators:[lfo],patch(p,initial){
  set(lfo.frequency,p.rate,initial);set(depth.gain,vibratoDelayDepth(p.rate,p.depth),initial);
 }};
}
