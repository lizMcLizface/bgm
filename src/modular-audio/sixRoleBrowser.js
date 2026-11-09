import {sixSourceDag} from './pitchedFixture';
import {kernelAsset} from '../synth-lab/kernelAssets';
import {createInstrumentInserts} from '../synth-lab/inserts';
import {insertsActive} from '../synth-lab/insertsConfig';
import {createEffectsBus} from '../synth-lab/effects';
import {createMixerAudio,createDeskLimiter} from '../synths/all/mixerAudio';
import {LegacyRoleKernel,configureLegacyTransitions} from './sixRoleKernels';
import {coreSpecForPart,fmSpecForPart,partEvents,drumEvents,percussionPatch,compressorPatch,tickFrame,validateSixFixture} from './sixRoleFixture';
const base=`${import.meta.env.BASE_URL}modular-audio/`;
export const sha256=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function loadSixAssets(){
 const start=performance.now(),manifest=await (await fetch(base+'build.json')).json();
 const response=await fetch(base+`six-role-fixture.json?v=${manifest.version}`),raw=await response.text(),fixture=validateSixFixture(JSON.parse(raw));
 const contracts=await (await fetch(base+`contracts.json?v=${manifest.version}`)).json(),modules={},builds={};
 for(const kind of ['core','fm','percussion','inserts','effects']){const name=kind==='core'?'build.json':kind+'-build.json';const build=await(await fetch(kernelAsset(kind,name))).json(),r=await fetch(kernelAsset(kind,kind+'.wasm'));if(!r.ok)throw Error(`Missing ${kind} kernel`);const bytes=await r.arrayBuffer();if(await sha256(bytes)!==build.wasm)throw Error(`Stale ${kind} Wasm response`);modules[kind]=await WebAssembly.compile(bytes);builds[kind]=build;}
 const graphBytes=await(await fetch(base+`graph.wasm?v=${manifest.version}`)).arrayBuffer();if(await sha256(graphBytes)!==manifest.wasm)throw Error('Stale graph Wasm');modules.graph=await WebAssembly.compile(graphBytes);
 return {fixture,fixtureHash:await sha256(new TextEncoder().encode(raw)),contracts,modules,builds,manifest,loadMs:performance.now()-start};
}
const registered=new WeakMap();
export function comparePcm(a,b){if(a.length!==b.length||a[0].length!==b[0].length)throw Error('Mismatched PCM dimensions');let maxAbs=0,energy=0;for(let ch=0;ch<a.length;ch++)for(let i=0;i<a[ch].length;i++){const d=Math.abs(a[ch][i]-b[ch][i]);maxAbs=Math.max(maxAbs,d);energy+=d*d;}return {maxAbs,rms:Math.sqrt(energy/(a.length*a[0].length))};}
async function register(context,assets){if(!registered.has(context)){const p=Promise.all([context.audioWorklet.addModule(kernelAsset('core','processor.js')),context.audioWorklet.addModule(kernelAsset('fm','fm-processor.js')),context.audioWorklet.addModule(kernelAsset('percussion','percussion-processor.js')),context.audioWorklet.addModule(base+`dag-sources-processor.js?v=${assets.manifest.version}`),context.audioWorklet.addModule(base+`owned-core-processor.js?v=${assets.manifest.version}`),context.audioWorklet.addModule(base+`owned-fm-processor.js?v=${assets.manifest.version}`),context.audioWorklet.addModule(base+`ensemble-bridge-processor.js?v=${assets.manifest.version}`)]);registered.set(context,p);}await registered.get(context);}
function observedNode(context,name,options,state,role){const node=new AudioWorkletNode(context,name,options);state.nodes.push(node);let resolveReady;const ready=new Promise(r=>resolveReady=r);node.port.onmessage=({data})=>{if(data.type==='error')state.errors.push(`${role}: ${data.message}`);if(data.type==='stats'){if(data.roles)Object.assign(state.stats,data.roles);else state.stats[role]=data;state.pending.get(role)?.(data);state.pending.delete(role);}if(data.type==='ready')resolveReady(data);};node.onprocessorerror=()=>state.errors.push(`${role}: processorerror`);return {node,ready};}
async function bridge(context,assets,patch,mode,total,state,role){const n=observedNode(context,'calmbgm-ensemble-bridge',{numberOfInputs:mode==='compressor'?2:0,numberOfOutputs:mode==='percussion'?2:1,outputChannelCount:mode==='percussion'?[2,2]:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{module:assets.modules.graph,contracts:assets.contracts,patch,mode,sourceId:101,endFrame:total}},state,role);await Promise.race([n.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error(`${role} bridge initialization timeout`)),10000))]);state.requests.set(n.node,role);return n.node;}
export async function createSixRoute(context,assets,fixture,variant,{capture=false}={}){
 validateSixFixture(fixture);if(!['current','bridge','keyed','owned-fm','owned-all','dag'].includes(variant))throw Error('Unknown baseline variant');
 const total=Math.round(fixture.totalSeconds*context.sampleRate),state={nodes:[],stats:{},pending:new Map(),requests:new Map(),errors:[]},owned=[],trims=[],splits=[];let mixer,limiter,fx,compressor,merger,fmPair,coreTrio,sourceDag;
 const dispose=()=>{for(const n of state.nodes){n.port.postMessage({type:'dispose'});n.disconnect();n.port.onmessage=null;setTimeout(()=>n.port.close(),100);}trims.forEach(n=>n.disconnect());splits.forEach(n=>n.disconnect());owned.forEach(n=>n.dispose());mixer?.dispose();if(!mixer){limiter?.port.postMessage({dispose:true});limiter?.disconnect();}fx?.dispose();merger?.disconnect();};
 try{await register(context,assets);
  limiter=await createDeskLimiter(context);fx=await createEffectsBus(context,fixture.master,{onError:e=>state.errors.push(String(e))});
  if(['owned-fm','owned-all'].includes(variant)){const parts=fixture.parts.filter(p=>p.kind==='fm').map(p=>({role:p.role,spec:fmSpecForPart(fixture,p,context.sampleRate)})),n=observedNode(context,'calmbgm-owned-fm-pair',{numberOfInputs:0,numberOfOutputs:2,outputChannelCount:[2,2],processorOptions:{module:assets.modules.graph,parts,endFrame:total}},state,'fm-pair');await Promise.race([n.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Owned FM initialization timeout')),10000))]);fmPair=n.node;state.requests.set(fmPair,'fm-pair');}
  if(variant==='owned-all'){const parts=fixture.parts.filter(p=>p.kind==='core').map(p=>({role:p.role,spec:coreSpecForPart(fixture,p,context.sampleRate)})),n=observedNode(context,'calmbgm-owned-core-trio',{numberOfInputs:0,numberOfOutputs:3,outputChannelCount:[2,2,2],processorOptions:{module:assets.modules.graph,parts,endFrame:total}},state,'core-trio');await Promise.race([n.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Owned core initialization timeout')),10000))]);coreTrio=n.node;state.requests.set(coreTrio,'core-trio');}
  if(variant==='dag'){const n=observedNode(context,'calmbgm-dag-sources',{numberOfInputs:0,numberOfOutputs:8,outputChannelCount:Array(8).fill(2),processorOptions:{module:assets.modules.graph,contracts:assets.contracts,patch:sixSourceDag(fixture,context.sampleRate),roles:fixture.parts.map(p=>p.role),endFrame:total}},state,'sourceDag');await Promise.race([n.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('Source DAG initialization timeout')),10000))]);sourceDag=n.node;state.requests.set(sourceDag,'sourceDag');}
  if(['keyed','owned-fm','owned-all','dag'].includes(variant))compressor=await bridge(context,assets,compressorPatch(fixture),'compressor',total,state,'compressor');
  const insert={input:compressor??fx.input,connect(to){if(compressor)compressor.connect(fx.input);fx.connect(to);}};
  mixer=createMixerAudio(context,fixture.parts.map(p=>p.role),limiter,{auxiliary:false,trimRoles:false,masterInsert:insert});
  mixer.patch({strips:Object.fromEntries(fixture.parts.map(p=>[p.role,p.channel])),master:fixture.mixerMaster});
  if(capture){merger=context.createChannelMerger(16);
   const split=context.createChannelSplitter(2);splits.push(split);mixer.output.connect(split);split.connect(merger,0,0);split.connect(merger,1,1);merger.connect(context.destination);
  }else mixer.output.connect(context.destination);
  for(let index=0;index<fixture.parts.length;index++){
   const p=fixture.parts[index],rate=context.sampleRate;let source,sourcePort=0;
   if(sourceDag){source=sourceDag;sourcePort=index;}
   else if(p.kind==='core'&&coreTrio){source=coreTrio;sourcePort=['lead','rhythm','pad'].indexOf(p.role);}
   else if(p.kind==='fm'&&fmPair){source=fmPair;sourcePort=p.role==='second'?0:1;}
   else if(p.kind==='percussion'&&variant!=='current')source=await bridge(context,assets,percussionPatch(fixture,rate),'percussion',total,state,p.role);
   else if(p.kind==='percussion'){const messages=drumEvents(fixture,p,rate).map(h=>({type:'hit',values:[h.drum,h.frame,h.duration,h.velocity,h.vary,h.tone,h.decay,h.hit,h.model]}));source=observedNode(context,'calmbgm-percussion',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{module:assets.modules.percussion,messages,endFrame:total}},state,p.role).node;}
   else{const common={module:assets.modules[p.kind],performance:p.performance,events:partEvents(fixture,p,rate),offline:true,stopFrame:total,auditStats:true};
    source=observedNode(context,p.kind==='core'?'calmbgm-subtractive':'calmbgm-fm',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{...common,...(p.kind==='core'?{parameters:p.packet,patches:p.edits.map(e=>({values:e.packet,frame:tickFrame(fixture,e.tick,rate),seconds:e.seconds}))}:{patch:p.packet,patches:p.edits.map(e=>({patch:e.packet,frame:tickFrame(fixture,e.tick,rate),seconds:e.seconds})),simd:false})}},state,p.role).node;
   }
   if(p.kind==='percussion'&&variant!=='current'){
    if(compressor)source.connect(compressor,sourceDag?6:1,1);
    if(capture){const split=context.createChannelSplitter(2);splits.push(split);source.connect(split,sourceDag?6:1);split.connect(merger,0,14);split.connect(merger,1,15);}
   }
   let output=source,outputPort=sourcePort;if(insertsActive(p.inserts)){const local=await createInstrumentInserts(context,p.inserts,{onError:e=>state.errors.push(String(e))});owned.push(local);source.connect(local.input,sourcePort);output=local.node;outputPort=0;}
   if(capture){const split=context.createChannelSplitter(2);splits.push(split);output.connect(split,outputPort);split.connect(merger,0,2+index*2);split.connect(merger,1,3+index*2);}
   const trim=context.createGain();trim.gain.value=p.trim;trims.push(trim);output.connect(trim,outputPort);trim.connect(mixer.channels[p.role].input);mixer.channels[p.role].output.connect(mixer.input);
  }
  return {dispose,state,total,mixer,rustOutput:sourceDag?{node:sourceDag,port:7}:null,check(){if(state.errors.length)throw Error(state.errors.join('\n'));},async stats(){await Promise.all([...state.requests].map(([n,role])=>new Promise(resolve=>{state.pending.set(role,resolve);n.port.postMessage({type:'stats'});setTimeout(resolve,1000);})));return state.stats;}};
 }catch(e){dispose();throw e;}
}
export function pcmMetrics(channels){let peak=0,nonFinite=0,first=-1,last=-1;const energy=channels.map(()=>0),n=channels[0].length;for(let i=0;i<n;i++)for(let ch=0;ch<channels.length;ch++){const v=channels[ch][i];if(!Number.isFinite(v)){nonFinite++;continue;}energy[ch]+=v*v;peak=Math.max(peak,Math.abs(v));if(v!==0){if(first<0)first=i;last=i;}}return {frames:n,peak,rms:energy.map(e=>Math.sqrt(e/n)),nonFinite,firstFrame:first,lastFrame:last};}
export async function blockHash(l,r){const blocks=new Float32Array(l.length*2);let to=0;for(let at=0;at<l.length;at+=128){const n=Math.min(128,l.length-at);blocks.set(l.subarray(at,at+n),to);to+=n;blocks.set(r.subarray(at,at+n),to);to+=n;}return sha256(blocks.buffer);}
export async function renderSixBrowser(assets,f,rate,variant,{verifyStems=false,signal}={}){
 const total=Math.round(f.totalSeconds*rate),context=new OfflineAudioContext(16,total,rate),started=performance.now(),route=await createSixRoute(context,assets,f,variant,{capture:true});
 try{if(signal?.aborted)throw Error('Cancelled');const prepared=performance.now(),buffer=await context.startRendering(),finished=performance.now();route.check();if(signal?.aborted)throw Error('Cancelled');const stats=await route.stats(),main=[buffer.getChannelData(0),buffer.getChannelData(1)],output=pcmMetrics(main),stems=[];
  if(output.nonFinite||output.peak<1e-6)throw Error('Silent/nonfinite six-role mix');
  for(let i=0;i<6;i++){const l=buffer.getChannelData(2+i*2),r=buffer.getChannelData(3+i*2),metrics=pcmMetrics([l,r]);if(metrics.nonFinite||metrics.peak<1e-6)throw Error(`Silent/nonfinite ${f.parts[i].role}`);let maxDifference=null;
   if(verifyStems){const g=new LegacyRoleKernel(assets.modules,f,f.parts[i],rate);maxDifference=0;for(let at=0;at<total;){const n=Math.min(128,total-at);g.render(n);for(let j=0;j<n;j++)maxDifference=Math.max(maxDifference,Math.abs(l[at+j]-g.left[j]),Math.abs(r[at+j]-g.right[j]));at+=n;}if(maxDifference!==0)throw Error(`${f.parts[i].role} Web Audio stem differs from direct legacy Wasm: ${maxDifference}`);}
   stems.push({role:f.parts[i].role,kind:f.parts[i].kind,...metrics,hash:await blockHash(l,r),directLegacyMaxDifference:maxDifference});
  }
  const tail=Math.round(rate*.5),tailMetrics=pcmMetrics(main.map(ch=>ch.subarray(total-tail))),key=pcmMetrics([buffer.getChannelData(14),buffer.getChannelData(15)]);
  for(const s of Object.values(stats))if(s.late||s.dropped||s.overflow)throw Error('Source reported late/dropped events');
  route.check();return {pcm:main.map(ch=>ch.slice()),variant,rate,frames:total,prepareMs:prepared-started,renderMs:finished-prepared,renderAudioRatio:(finished-prepared)/(f.totalSeconds*1000),output,outputHash:await blockHash(...main),tailLastHalfSecond:tailMetrics,key,stems,sourceStats:stats,missingSourceStats:f.parts.filter(p=>!stats[p.role]).map(p=>p.role),counterScope:'Legacy percussion has no offline final stats message; direct-kernel/PCM checks cover it. No audio-device underrun counter.',limiterLatencyFrames:Math.round(rate*.003)};
 }finally{route.dispose();}
}
