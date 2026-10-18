import {sanitizeEffects} from './effectsConfig';

const calibrations=new Map();
export function nativeFeedbackOffset(output,spacing,pingPong){
 // Centroids cancel the one-pole filter's group delay and avoid a one-sample
 // error from fractional-delay rounding at 44.1/96 kHz.
 const centroid=(channel,around)=>{const data=output.getChannelData(channel);let sum=0,moment=0;for(let at=around-32;at<around+1280;at++){const weight=Math.abs(data[at]);sum+=weight;moment+=weight*at;}if(!Number.isFinite(sum)||sum<1e-8)throw Error('Native delay feedback timing calibration failed.');return moment/sum;};
 const extra=Math.round(centroid(pingPong?1:0,spacing*2)-2*centroid(0,spacing));
 if(extra<0||extra>1024)throw Error('Native delay feedback timing is outside the supported compensation range.');
 return Math.max(0,extra);
}
function echoGraph(context,p,compensation=0){
 const nodes=[];
 const own=n=>(nodes.push(n),n),stereo=n=>{n.channelCount=2;n.channelCountMode='explicit';return own(n);},input=stereo(context.createGain()),output=stereo(context.createGain());
 const send=stereo(context.createGain()),delay=stereo(context.createDelay(2.1));send.gain.value=p.delay;delay.delayTime.value=Math.max(1/context.sampleRate,p.delayMs/1000-compensation/context.sampleRate);
 input.connect(send);
 // Compensate only the feedback cycle. A matching feed-forward pre-delay
 // preserves the requested onset of the first repeat.
 if(compensation){const pre=stereo(context.createDelay(.2));pre.delayTime.value=compensation/context.sampleRate;send.connect(pre);pre.connect(delay);}else send.connect(delay);
 const alpha=1-Math.exp(-2*Math.PI*Math.min(p.tone,context.sampleRate*.4)/context.sampleRate);
 const tone=stereo(context.createIIRFilter([alpha],[1,-(1-alpha)])),feedback=stereo(context.createGain());feedback.gain.value=p.feedback;delay.connect(tone);tone.connect(output);
 if(p.pingPong){const split=own(context.createChannelSplitter(2)),swap=own(context.createChannelMerger(2));tone.connect(split);split.connect(swap,0,1);split.connect(swap,1,0);swap.connect(feedback);}else tone.connect(feedback);
 feedback.connect(delay);
 return {input,output,compensationFrames:compensation,dispose:()=>nodes.forEach(n=>n.disconnect())};
}

/** Measure native feedback scheduling rather than guessing from a browser name. */
async function compensationFrames(rate,pingPong){
 const key=rate+':'+pingPong;
 if(!calibrations.has(key))calibrations.set(key,(async()=>{
  const spacing=4096,context=new OfflineAudioContext(2,spacing*3,rate),graph=echoGraph(context,{delay:1,delayMs:spacing/rate*1000,feedback:.5,tone:4500,pingPong});
  try{
   const buffer=context.createBuffer(2,1,rate);buffer.getChannelData(0)[0]=.25;const source=context.createBufferSource();source.buffer=buffer;source.connect(graph.input);graph.output.connect(context.destination);source.start();
   const output=await context.startRendering();
   return nativeFeedbackOffset(output,spacing,pingPong);
  }finally{graph.dispose();}
 })().catch(e=>{calibrations.delete(key);throw e;}));
 return calibrations.get(key);
}

/** Static native echo with measured feedback-block compensation, cached by rate. */
export async function createNativeEcho(context,raw){
 const p=sanitizeEffects(raw),compensation=await compensationFrames(context.sampleRate,p.pingPong);
 // Keep the public connections stable when Panic drops the delay buffers.
 const input=context.createGain(),output=context.createGain();let graph;
 const clear=()=>{input.disconnect();graph?.dispose();graph=echoGraph(context,p,compensation);input.connect(graph.input);graph.output.connect(output);};clear();
 return {input,output,compensationFrames:compensation,clear,dispose(){input.disconnect();graph.dispose();output.disconnect();}};
}
