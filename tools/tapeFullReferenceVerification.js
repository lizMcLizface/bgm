import Tape from '../src/nodes/tape.js';
import {OwnedTape,ownedTapeSpec,TAPE_PARAMETERS,TAPE_PROFILE}from '../src/modular-audio/ownedTape.js';
import {nativeTimeToFrame}from '../src/modular-audio/nativeAutomationTime.js';
// Declared before the first full native comparison, independently of its result.
export const TAPE_FULL_BOUNDS=Object.freeze({maxAbsoluteError:1e-4,relativeRmsError:1e-4});
const methods=['setWow','setWowRate','setFlutter','setDrive','setTone'],base=`${import.meta.env.BASE_URL}modular-audio/`;
export const TAPE_FULL_CASES=[
 {id:'native-default-node',settings:{}},
 {id:'drive-full',settings:{drive:1}},
 {id:'dark-tone',settings:{drive:.3,tone:500}},
 {id:'wow-full',settings:{wow:1,wowRate:.6,drive:.2}},
 {id:'flutter-full',settings:{flutter:1,tone:16000}},
 {id:'combined',settings:{wow:.73123456789,wowRate:1.123456789,flutter:.6123456789,drive:.4123456789,tone:6100.123456789}},
 {id:'control-extremes',settings:{wow:1,wowRate:5,flutter:1,drive:1,tone:20000}},
 {id:'native-target-automation',settings:{wow:.2,flutter:.1,drive:.3},targets:[[13,0,.7123456789],[41,1,2.123456789],[513,2,.8123456789],[4001,4,3000.123456789],[8191,0,0],[10003,2,0],[12001,1,.05]]},
 {id:'native-curve-control',settings:{wow:.3,flutter:.3,drive:0},curves:[[4096,.3],[8192,1],[12288,0]]},
];
export const TAPE_LOW_RATE_CASES=[
 {id:'above-nyquist-target-at-boundary',settings:{tone:20000},targets:[[8192,4,500]],continuous:true},
 {id:'above-nyquist-target-inside-quantum',settings:{tone:20000},targets:[[8193,4,500]],continuous:true},
];
const inputSignal=(row,frame,ch,rate)=>tapeFullSignal(row.continuous?frame%Math.floor(rate*.5):frame,ch,rate);
export function tapeFullSignal(frame,ch,rate){if(frame>=rate*.5)return 0;let noise=Math.imul(frame+1+ch*97,0x45d9f3b)>>>0;noise^=noise<<13;noise^=noise>>>17;noise^=noise<<5;return Math.fround(.31*Math.sin(2*Math.PI*440/rate*frame+ch*.31)+.2*Math.sin(2*Math.PI*.18*frame)+.13*((noise>>>0)/2147483648-1));}
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
const pcmHash=async pcm=>{const bytes=new Uint8Array(pcm.reduce((n,a)=>n+a.byteLength,0));let at=0;for(const a of pcm){bytes.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),at);at+=a.byteLength;}return hash(bytes);};
const captureTargets=(row,rate)=>(row.targets??[]).map(([requestedFrame,index,value],sequence)=>({kind:'target',requestedFrame,index,value,timeSeconds:requestedFrame/rate,frame:nativeTimeToFrame(requestedFrame/rate,rate),sequence}));
async function native(row,rate,channels,frames){
 const context=new OfflineAudioContext(6,frames,rate);let eventTime=0;const clock={get currentTime(){return eventTime;}};for(const name of ['createGain','createWaveShaper','createBiquadFilter','createDelay','createOscillator'])clock[name]=context[name].bind(context);
 const tape=new Tape(clock),source=context.createBufferSource(),input=context.createBuffer(channels,frames,rate),merge=context.createChannelMerger(6),targets=captureTargets(row,rate);source.buffer=input;
 for(const [index,value]of ownedTapeSpec(row.settings).parameters)tape[methods[index]](value);
 for(const event of targets){eventTime=event.timeSeconds;tape[methods[event.index]](event.value);}
 [tape.shaper,tape.tone,tape.delay].forEach((node,stage)=>{const upmix=context.createGain(),split=context.createChannelSplitter(2);upmix.channelCount=2;upmix.channelCountMode='explicit';node.connect(upmix);upmix.connect(split);for(let ch=0;ch<2;ch++)split.connect(merge,ch,stage*2+ch);});merge.connect(context.destination);source.connect(tape.getNode());
 for(let ch=0;ch<channels;ch++)for(let frame=0;frame<frames;frame++)input.getChannelData(ch)[frame]=inputSignal(row,frame,ch,rate);
 const curves=[],suspensions=(row.curves??[]).map(([requestedFrame,value],sequence)=>context.suspend(requestedFrame/rate).then(async()=>{const actualSeconds=context.currentTime,frame=Math.round(actualSeconds*rate);if(frame%128!==0)throw Error('Native curve control did not suspend on a quantum');tape.setDrive(value);curves.push({kind:'curve',index:3,value,requestedFrame,requestedSeconds:requestedFrame/rate,timeSeconds:actualSeconds,frame,sequence:targets.length+sequence});await context.resume();}));
 source.start(0);const rendering=context.startRendering();await Promise.all(suspensions);const output=await rendering;return {targets,curves,stages:Array.from({length:3},(_,stage)=>[0,1].map(ch=>output.getChannelData(stage*2+ch).slice()))};
}
function portable(row,rate,channels,frames,module,events){
 const drives=[...new Set([row.settings.drive??0,...(row.curves??[]).map(e=>e[1])])],d=new OwnedTape(new WebAssembly.Instance(module,{}).exports,ownedTapeSpec(row.settings,drives),rate),out=Array.from({length:3},()=>[new Float32Array(frames),new Float32Array(frames)]);let event=0;
 try{for(let frame=0,k=0;frame<frames;k++){
   while(event<events.length&&events[event].frame===frame){const e=events[event++];d.target(e.index,e.value,e.timeSeconds);}
   const n=Math.min([1,37,509,113,203,127][k%6],frames-frame,(events[event]?.frame??frames)-frame);if(n<1)throw Error('Tape target timeline order');
   for(let ch=0;ch<channels;ch++)for(let i=0;i<n;i++)d.input[ch][i]=inputSignal(row,frame+i,ch,rate);d.render(n,channels);for(let stage=0;stage<3;stage++)for(let ch=0;ch<2;ch++)out[stage][ch].set(d.stages[stage][ch].subarray(0,n),frame);frame+=n;
 }return {stages:out,stats:d.stats()};}finally{d.dispose();}
}
function compare(actual,reference){let maxAbsoluteError=0,errorEnergy=0,energy=0,nonFinite=0,peak=0,maxDifference=null;for(let ch=0;ch<2;ch++)for(let i=0;i<actual[ch].length;i++){const a=actual[ch][i],r=reference[ch][i],error=Math.abs(a-r);if(!Number.isFinite(a)||!Number.isFinite(r))nonFinite++;if(error>maxAbsoluteError)maxDifference={frame:i,channel:ch,actual:a,reference:r,error};maxAbsoluteError=Math.max(maxAbsoluteError,error);errorEnergy+=(a-r)**2;energy+=r*r;peak=Math.max(peak,Math.abs(a));}const relativeRmsError=Math.sqrt(errorEnergy/Math.max(energy,1e-30));return {pass:nonFinite===0&&maxAbsoluteError<=TAPE_FULL_BOUNDS.maxAbsoluteError&&relativeRmsError<=TAPE_FULL_BOUNDS.relativeRmsError,maxAbsoluteError,relativeRmsError,rmsError:Math.sqrt(errorEnergy/(actual[0].length*2)),nonFinite,peak,maxDifference};}
export async function runTapeFullReference({onProgress=()=>{},assetBase=base,rates=[44100,48000,96000],cases=TAPE_FULL_CASES,durationSeconds=.75,label='full-chain'}={}){
 const manifest=await fetch(assetBase+'tape-fx-build.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Tape manifest unavailable');return r.json();}),bytes=await fetch(assetBase+`tape-fx.wasm?v=${manifest.version}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Tape Wasm unavailable');return r.arrayBuffer();});if(await hash(bytes)!==manifest.wasm)throw Error('Tape fingerprint mismatch');const module=await WebAssembly.compile(bytes),trials=[];
 for(const rate of rates)for(const channels of [1,2])for(const row of cases){onProgress(`${rate} Hz · ${channels===1?'mono':'stereo'} · ${row.id}`);const frames=Math.ceil(rate*durationSeconds),a=await native(row,rate,channels,frames),events=[...a.targets,...a.curves].sort((a,b)=>a.frame-b.frame||a.sequence-b.sequence),b=portable(row,rate,channels,frames,module,events),stages=[];for(let stage=0;stage<3;stage++)stages.push({stage:['shaper','tone','full-delay'][stage],...compare(b.stages[stage],a.stages[stage]),nativePcmSha256:await pcmHash(a.stages[stage]),portablePcmSha256:await pcmHash(b.stages[stage])});trials.push({id:row.id,rate,channels,frames,settings:row.settings,targets:a.targets,curveControls:a.curves,pass:stages.every(s=>s.pass),stages,portableStats:b.stats});}
 return {kind:'tape.full-native-reference',version:1,label,profile:TAPE_PROFILE,engineVersion:manifest.version,wasmSha256:manifest.wasm,nativeSourceSha256:manifest.referenceSourceSha256,chromiumRevision:manifest.profile.revision,createdAtUtc:new Date().toISOString(),browserUserAgent:navigator.userAgent,scope:'Actual original native Tape topology and setters with simultaneous shaper/tone/final stereo taps. Original native target seconds preserved including fractional start offset; curve properties changed at recorded native offline suspend frames. Rust uses preprepared exact drive curves. No alignment/gain fitting, default switch, physical listening or realtime deadline claim.',bounds:TAPE_FULL_BOUNDS,pass:trials.every(t=>t.pass),cases:trials.length,stageComparisons:trials.length*3,maxAbsoluteError:Math.max(...trials.flatMap(t=>t.stages.map(s=>s.maxAbsoluteError))),maxRelativeRmsError:Math.max(...trials.flatMap(t=>t.stages.map(s=>s.relativeRmsError))),trials};
}
