import {ReferenceGraph,loadPatch,savePatch} from './runtime.js';
const base=`${import.meta.env.BASE_URL}modular-audio/`;
const key='bgm.modular-audio.reference.v1';
const $=id=>document.getElementById(id);
let assets,live;
const state=message=>$('state').textContent=message;
const show=result=>$('report').textContent=JSON.stringify(result,null,2);
const request=async url=>{const r=await fetch(url);if(!r.ok)throw Error(`${url}: ${r.status}`);return r;};
async function init() {
 const manifest=await (await request(`${base}build.json`)).json(),v=manifest.version;
 const [module,contracts,fixture,response]=await Promise.all([request(`${base}graph.wasm?v=${v}`).then(r=>r.arrayBuffer()).then(b=>WebAssembly.compile(b)),request(`${base}contracts.json?v=${v}`).then(r=>r.json()),request(`${base}reference-patch.json?v=${v}`).then(r=>r.json()),request(location.href)]);
 const sidechain=await (await request(`${base}sidechain-patch.json?v=${v}`)).json();
 assets={module,contracts,fixture,sidechain,version:v,headers:Object.fromEntries(['cross-origin-opener-policy','cross-origin-embedder-policy','cross-origin-resource-policy'].map(k=>[k,response.headers.get(k)]))};
 $('patch').value=savePatch(localStorage.getItem(key)?loadPatch(localStorage.getItem(key),contracts):fixture,contracts);
 controls();
 state(localStorage.getItem(key)?'Saved patch restored. Playback stopped.':'Ready. Playback stopped.');
}
function patch(){return loadPatch($('patch').value,assets.contracts);}
function reference(p,rate,total,block=113) {
 const g=new ReferenceGraph(new WebAssembly.Instance(assets.module,{}).exports,p,assets.contracts,rate),out=[new Float32Array(total),new Float32Array(total)];
 try {for(let at=0;at<total;){const n=Math.min(block,total-at);g.render(n);out[0].set(g.left.subarray(0,n),at);out[1].set(g.right.subarray(0,n),at);at+=n;}return {out,stats:g.stats(),meters:g.meters()};}finally{g.dispose();}
}
const registrations=new WeakMap();
async function node(context,p,{stopFrame,events}={}) {
 if(!registrations.has(context))registrations.set(context,context.audioWorklet.addModule(`${base}processor.js?v=${assets.version}`));
 await registrations.get(context);
 const n=new AudioWorkletNode(context,'calmbgm-reference-graph',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{module:assets.module,patch:p,contracts:assets.contracts,stopFrame}});
 let fail;
 const ready=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Worklet initialization timeout')),5000);
  n.port.onmessage=({data})=>{if(data.type==='ready'){clearTimeout(timer);resolve(data);}else if(data.type==='error'){fail=Error(data.message);clearTimeout(timer);reject(fail);}else events?.(data);};
  n.onprocessorerror=()=>{fail=Error('AudioWorklet processor error');clearTimeout(timer);reject(fail);};
 });
 try { const stamp=await ready;return {node:n,stamp,check(){if(fail)throw fail;},stats:()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Stats timeout')),3000);events=data=>{if(data.type==='stats'){clearTimeout(timer);resolve(data);}};n.port.postMessage({type:'stats'});}),dispose(){n.port.postMessage({type:'dispose'});n.disconnect();}}; }catch(e){n.port.postMessage({type:'dispose'});n.disconnect();throw e;}
}
function metrics(out){let sum=[0,0],peak=0,first=-1,last=-1,difference=0;for(let i=0;i<out[0].length;i++){for(let ch=0;ch<2;ch++){const v=out[ch][i];if(!Number.isFinite(v))throw Error('Non-finite PCM');sum[ch]+=v*v;peak=Math.max(peak,Math.abs(v));if(v!==0){if(first<0)first=i;last=i;}}difference=Math.max(difference,Math.abs(out[0][i]-out[1][i]));}return {peak,rms:sum.map(v=>Math.sqrt(v/out[0].length)),firstFrame:first,lastFrame:last,stereoDifference:difference};}
function compare(a,b){let max=0;for(let ch=0;ch<2;ch++)for(let i=0;i<a[ch].length;i++)max=Math.max(max,Math.abs(a[ch][i]-b[ch][i]));return max;}
async function offline(p,rate,total=48000) {
 const c=new OfflineAudioContext(2,total,rate),g=await node(c,p,{stopFrame:total});
 try{g.node.connect(c.destination);const buffer=await c.startRendering();g.check();const stats=await g.stats();return {out:[buffer.getChannelData(0),buffer.getChannelData(1)],stats,origin:stats.contextOrigin};}finally{g.dispose();}
}
async function verify() {
 await stop();state('Verifying actual AudioWorklet PCM at three sample rates…');
 const p=patch(),saved=savePatch(p,assets.contracts),reloaded=loadPatch(saved,assets.contracts),results=[];
 for(const rate of [44100,48000,96000]) {
  const start=performance.now(),ref=reference(p,rate,48000),actual=await offline(p,rate),reload=await offline(reloaded,rate);
  const wasmDifference=compare(ref.out,actual.out),reloadDifference=compare(actual.out,reload.out),m=metrics(actual.out);
  if(wasmDifference!==0||reloadDifference!==0||actual.stats.late||actual.stats.overflow)throw Error('Reference/reload/timing agreement failed');
  results.push({rate,frames:48000,...m,wasmDifference,reloadDifference,stats:actual.stats,offlineMs:performance.now()-start});
 }
 // Both nodes share one real OfflineAudioContext, rendering to disjoint stereo pairs.
 const c=new OfflineAudioContext(4,48000,48000),silent=JSON.parse(saved);silent.events=[];
 const a=await node(c,p,{stopFrame:48000}),b=await node(c,silent,{stopFrame:48000}),merge=c.createChannelMerger(4),sa=c.createChannelSplitter(2),sb=c.createChannelSplitter(2);
 let independent;
 try{a.node.connect(sa);b.node.connect(sb);sa.connect(merge,0,0);sa.connect(merge,1,1);sb.connect(merge,0,2);sb.connect(merge,1,3);merge.connect(c.destination);const result=await c.startRendering();a.check();b.check();independent={audible:metrics([result.getChannelData(0),result.getChannelData(1)]),silent:metrics([result.getChannelData(2),result.getChannelData(3)])};if(independent.silent.peak!==0)throw Error('Independent node cross-talk');}finally{a.dispose();b.dispose();merge.disconnect();sa.disconnect();sb.disconnect();}
 show({pass:true,version:assets.version,userAgent:navigator.userAgent,crossOriginIsolated:globalThis.crossOriginIsolated,headers:assets.headers,persistence:{savedLocally:localStorage.getItem(key)===saved,roundTrip:true,restart:true},results,independent,limits:'Offline timings are throughput only. No worker pool, real-instrument benchmark or device-loopback measurement.'});state('Verification passed. Playback stopped.');
}
async function stop(){if(live){const running=live;live=null;clearTimeout(running.timer);clearInterval(running.poll);try{const stats=await running.graph.stats();show({live:true,sampleRate:running.context.sampleRate,baseLatency:running.context.baseLatency,outputLatency:running.context.outputLatency??null,observedPeak:running.peak,observations:running.observations,stats,deviceLoopback:false});}finally{running.graph.dispose();await running.context.close();}}$('stop').disabled=true;$('play').disabled=false;}
async function play(){await stop();const p=patch(),context=new AudioContext({sampleRate:48000});await context.resume();try{const graph=await node(context,p),split=context.createChannelSplitter(2),analyzers=[context.createAnalyser(),context.createAnalyser()],samples=[new Float32Array(2048),new Float32Array(2048)];graph.node.connect(context.destination);graph.node.connect(split);analyzers.forEach((a,i)=>{a.fftSize=2048;split.connect(a,i);});const running={context,graph,peak:[0,0],observations:0};live=running;running.poll=setInterval(()=>{analyzers.forEach((a,ch)=>{a.getFloatTimeDomainData(samples[ch]);for(const v of samples[ch])running.peak[ch]=Math.max(running.peak[ch],Math.abs(v));});running.observations++;},20);running.timer=setTimeout(()=>stop().then(()=>state('Fixture finished. Playback stopped.')),1600);$('stop').disabled=false;$('play').disabled=true;state(`Playing stereo fixture · ${context.sampleRate} Hz · base latency ${context.baseLatency}s · output latency ${context.outputLatency ?? 'unreported'}s`);}catch(e){await context.close();throw e;}}
function action(id,fn){$(id).onclick=async()=>{try{if(!assets)throw Error('Assets still loading');await fn();}catch(e){state(String(e));show({pass:false,error:String(e)});}};}
action('verify',verify);action('play',play);action('stop',async()=>{await stop();state('Playback stopped.');});
function controls(){const p=patch(),comp=p.modules.find(n=>n.type==='graph.compressor'),edge=p.connections.find(c=>c.to.module===comp?.id&&c.to.port==='detector.in');$('keymode').disabled=$('keysource').disabled=!comp;if(comp){$('keymode').value=String(comp.parameters.keyMode??2);$('keysource').value=!edge||edge.enabled===false?'none':edge.from.port==='kick.out'?'kick':'program';}}
action('reference',async()=>{await stop();$('patch').value=savePatch(assets.fixture,assets.contracts);controls();state('LFO / VCA reference loaded. Playback stopped.');});
action('sidechain',async()=>{await stop();$('patch').value=savePatch(assets.sidechain,assets.contracts);controls();state('Real percussion / kick-sidechain patch loaded. Playback stopped.');});
$('keymode').onchange=async()=>{await stop();const p=patch(),comp=p.modules.find(n=>n.type==='graph.compressor');comp.parameters.keyMode=Number($('keymode').value);$('patch').value=savePatch(p,assets.contracts);state('Key mode updated. Playback stopped.');};
$('keysource').onchange=async()=>{await stop();const p=patch(),comp=p.modules.find(n=>n.type==='graph.compressor');let edge=p.connections.find(c=>c.to.module===comp.id&&c.to.port==='detector.in');if(!edge){edge=JSON.parse(JSON.stringify(assets.sidechain.connections.find(c=>c.id===23)));edge.to.module=comp.id;p.connections.push(edge);}edge.enabled=$('keysource').value!=='none';edge.from=$('keysource').value==='program'?{module:11,port:'audio.out'}:{module:13,port:'kick.out'};p.events=p.events.filter(e=>!(e.kind==='connection'&&e.edge===edge.id));$('patch').value=savePatch(p,assets.contracts);state('Detector source updated. Playback stopped.');};
action('save',()=>{localStorage.setItem(key,savePatch(patch(),assets.contracts));state('Patch saved locally. Reload restores it without playback.');});
action('load',async()=>{await stop();const saved=localStorage.getItem(key);if(!saved)throw Error('No saved reference patch');$('patch').value=savePatch(loadPatch(saved,assets.contracts),assets.contracts);controls();state('Saved patch loaded. Playback stopped.');});
init().catch(e=>{state(String(e));show({pass:false,error:String(e)});});
