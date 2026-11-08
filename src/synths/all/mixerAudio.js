// The All desk's post-instrument mixer. Scene levels and synth effects remain
// upstream; desk faders are neutral at .75 (0 dB), never a second scene volume.
export const stripDefaults=()=>({gain:.25,hpOn:false,hp:.2,lpOn:false,lp:.9,hi:.5,mid:.5,lo:.5,pan:.5,vol:.75,mute:false,solo:false,rev:.2,revSize:.5,dly:0,dlyTime:.4,dlyFb:.3});
export const masterDefaults=()=>({vol:.75,width:.5,bal:.5,limit:true,ceil:.85,mono:false,dim:false});
export const faderGain=v=>v<=0?0:10**((v>=.75?(v-.75)*40:-60*(1-v/.75))/20);
export const ceilingDb=v=>-12+12*v;
const clean=(value,defaults)=>Object.fromEntries(Object.entries(defaults).map(([key,home])=>[key,typeof home==='boolean'?typeof value?.[key]==='boolean'?value[key]:home:Number.isFinite(value?.[key])?Math.max(0,Math.min(1,value[key])):home]));
export function cleanDesk(state,ids){
 return {strips:Object.fromEntries(ids.map(id=>[id,clean(state?.strips?.[id],stripDefaults())])),master:clean(state?.master,masterDefaults())};
}
const log=(v,lo,hi)=>lo*(hi/lo)**v;
export function createMixerAudio(context,roles,limiter,{auxiliary=true,trimRoles=false,masterInsert=null}={}){
 const nodes=[];
 const make=(kind,...args)=>{const n=context[kind](...args);nodes.push(n);return n;};
 const gain=()=>make('createGain');
 const set=(param,value)=>{if(param.value!==value){param.cancelScheduledValues(context.currentTime);param.setTargetAtTime(value,context.currentTime,.012);}};
 const channel=()=>{
  const input=gain(),hp=make('createBiquadFilter'),lp=make('createBiquadFilter'),lo=make('createBiquadFilter'),mid=make('createBiquadFilter'),hi=make('createBiquadFilter'),pan=make('createStereoPanner'),output=gain();
  hp.type='highpass';lp.type='lowpass';lo.type='lowshelf';mid.type='peaking';hi.type='highshelf';
  hp.Q.value=lp.Q.value=.707;lo.frequency.value=200;mid.frequency.value=1000;mid.Q.value=.7;hi.frequency.value=5000;
  [input,hp,lp,lo,mid,hi,pan,output].reduce((a,b)=>{a.connect(b);return b;});
  return {input,output,patch(s,silent,trim){
   set(input.gain,trim?10**((-12+48*s.gain)/20):1);
   // At DC / Nyquist the disabled filters are neutral over the audible band.
   set(hp.frequency,s.hpOn?log(s.hp,20,600):0);
   set(lp.frequency,s.lpOn?Math.min(context.sampleRate*.49,log(s.lp,1000,20000)):context.sampleRate/2);
   set(lo.gain,(s.lo-.5)*24);set(mid.gain,(s.mid-.5)*24);set(hi.gain,(s.hi-.5)*24);
   set(pan.pan,s.pan*2-1);set(output.gain,silent?0:faderGain(s.vol));
  }};
 };
 const ids=[...roles,...(auxiliary?['ambience','headroom']:[])],channels=Object.fromEntries(ids.map(id=>[id,channel()]));
 const input=gain(),split=make('createChannelSplitter',2),merge=make('createChannelMerger',2);
 const ll=gain(),lr=gain(),rl=gain(),rr=gain(),balance=make('createStereoPanner'),level=gain(),output=gain();
 split.channelCount=2;input.connect(split);
 split.connect(ll,0);split.connect(lr,0);split.connect(rl,1);split.connect(rr,1);
 ll.connect(merge,0,0);rl.connect(merge,0,0);lr.connect(merge,0,1);rr.connect(merge,0,1);
 merge.connect(balance);
 if(masterInsert){balance.connect(masterInsert.input);masterInsert.connect(level);}else balance.connect(level);
 level.connect(limiter);
 limiter.connect(output);
 let disposed=false;
 return {channels,input,output,patch(state){
  const {strips,master:m}=cleanDesk(state,ids);
  const solo=ids.filter(id=>strips[id].solo);
  for(const id of ids){
   // A soloed subgroup passes all music; soloing a voice also opens its group.
   const selected=!solo.length||strips[id].solo||(id==='headroom'&&solo.some(r=>roles.includes(r)))||(roles.includes(id)&&strips.headroom?.solo);
   channels[id].patch(strips[id],strips[id].mute||!selected,trimRoles||!roles.includes(id));
  }
  const width=m.mono?0:m.width*2;
  set(ll.gain,(1+width)/2);set(rr.gain,(1+width)/2);set(lr.gain,(1-width)/2);set(rl.gain,(1-width)/2);
  set(balance.pan,m.bal*2-1);set(level.gain,faderGain(m.vol)*(m.dim?10**(-20/20):1));
  limiter.port.postMessage({enabled:m.limit,ceiling:10**(ceilingDb(m.ceil)/20)});
 },dispose(){if(disposed)return;disposed=true;nodes.forEach(n=>n.disconnect());limiter.port.postMessage({dispose:true});limiter.disconnect();}};
}

const ready=new WeakMap();
export async function createDeskLimiter(context){
 if(!ready.has(context)){
  const loading=context.audioWorklet.addModule(`${import.meta.env.BASE_URL}desk-limiter-processor.js`);
  ready.set(context,loading);loading.catch(()=>ready.delete(context));
 }
 await ready.get(context);
 return new AudioWorkletNode(context,'desk-limiter',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'});
}
