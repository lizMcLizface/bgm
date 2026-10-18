import './lab.css';
import {ensemblePlan,ensembleConfig,effectsLayout,ENSEMBLE_PATHS} from './ensemblePlan';
import {captureEnsemble,renderEnsemble,playEnsemble} from './ensembleBackend';
import {createEnsembleFluid} from './ensembleFluid';
import {wavBlob} from './bench';

const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
const initial=ensembleConfig(Object.fromEntries(query)),pathNames=Object.fromEntries(ENSEMBLE_PATHS),colours={pad:'#b9a0df',keys:'#dfb17c',bass:'#78c3d1',lead:'#d58faa'};
let busy=false,live=null,starting=false,serial=0,pair=[],players=[],urls=[],active=null,report=null,fluid=null,frame=0,previous=0,lastUpdate=0,lastLive=null,frameTimes=[],sessionStart=0,longTasks=null,longestTask=0,liveFrames=0;
document.querySelector('#ensemble-lab').innerHTML=`
<header><nav class="links"><a href="/tools/stress.html">Stress matrix</a><a href="/tools/tone.html">Filters & chorus</a><a href="/tools/quality.html">Musical quality</a><a href="/">Music generator</a><a href="/tools/synth-lab.html">Subtractive synth</a><a href="/tools/fm.html">FM synth</a><a href="/tools/spectrum.html">Spectrum & aliasing</a><a href="/tools/effects.html">Reverb & delay</a></nav><h1>Shared ensemble laboratory</h1><p>Bowed glass pad, FM keys, bass and lead play the same repeating score through five routing choices. Shared rooms + instrument delays keeps each voice’s echo character, with optional private rooms for sounds that need their own tail.</p></header>
<section id="configuration"><h2>Ensemble</h2><div class="toolbar">
<label>Instruments<select id="count"><option value="2">2 · pad + FM keys</option><option value="4">4 · full ensemble</option><option value="8">8 · doubled ensemble</option></select></label>
<label>Shared rooms<select id="rooms"><option>1</option><option>2</option><option>4</option></select></label>
<label>Score length<select id="bars"><option value="4">4 bars</option><option value="8">8 bars</option></select></label>
<label>Tempo<input id="bpm" type="number" min="60" max="160" step="1"></label>
<label>FM quality<select id="quality"><option value="0">1×</option><option value="1">2×</option><option value="2">4×</option></select></label>
<label>Offline rate<select id="sampleRate"><option>44100</option><option>48000</option><option>96000</option></select></label>
<label>Render scope<select id="scope"><option value="full">Full synthesis + effects</option><option value="stems">Captured stems · effects cost</option></select></label>
<label>Reverb RT60 · s<input id="decay" type="number" min=".3" max="30" step=".1"></label>
<label>Master level<input id="master" type="number" min="0" max="1" step=".05"></label></div>
<p class="muted">The new path shares Wasm reverb but gives each instrument an independent native delay. Its time, feedback, tone, ping-pong and echo → room send belong to that voice. A private room adds a reverb instance only for the voice requesting it; other instruments retain the shared room. Chorus and synthesis remain inside each instrument.</p><div class="toolbar"><button id="private-pad">Try pad in its own 20 s room</button><button id="reset-voices">Reset voice effects</button></div><p id="routing-budget" class="muted"></p><div id="parts" class="ensemble-parts"></div>
<p class="muted">Voice effect controls apply to “Shared rooms + instrument delays”, persist in the URL and take effect on the next render or live restart. The other four paths retain the original shared echo settings for comparison; they do not apply private-room requests.</p>
<p class="muted">Live audition levels below affect live playback only. Offline comparisons use the fixed fixture mix. Muting a live channel silences its sends while retaining its synthesis workload.</p></section>
<section><h2>Live ensemble & graphics load</h2><div class="toolbar"><label>Live path<select id="live-path">${ENSEMBLE_PATHS.map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}</select></label><button id="start" class="primary">Play live ensemble</button><button id="stop" disabled>Stop & clear</button><label>Fluid workload<select id="fluid"><option value="0">Off</option><option value="256">256 simulation / 512 dye</option><option value="512">512 simulation / 1024 dye</option></select></label><button id="session" disabled>Download live report</button></div>
<p id="live-status" role="status">Live playback uses full synthesis and the browser’s actual audio rate. Render scope and offline rate apply only to the comparison below.</p><pre id="live-stats">No live session yet.</pre><p id="fluid-status" class="muted">Fluid off.</p>
<p class="muted">Queue-late/dropped events measure scheduling, and frame intervals measure visible UI pacing. Neither detects audio-device underruns. Reported browser latency and offline wall time do not establish a safe phone budget. Start a live session on the device being evaluated; changing ensemble settings takes effect when you restart.</p>
<div class="wave"><canvas id="score" width="1100" height="200" style="height:200px"></canvas><i id="score-head" class="playhead"></i></div><output id="bar-position">Bar 1 · beat 1</output></section>
<section><h2>Render all five paths</h2><div class="toolbar"><button id="render" class="primary">Render comparison</button><button id="benchmark">Warm-up + 3 measured runs</button><label class="inline"><input id="match" type="checkbox" checked>Match playback RMS by attenuation</label></div><p id="status" role="status">Identical notes; full conservative tails. Captured stems isolate the effects. The new path intentionally uses different per-voice echoes and optional private rooms.</p><div id="results" class="results"></div><pre id="summary"></pre>
<div id="playback" class="hidden"><div id="path-buttons" class="toolbar"></div><div class="transport"><button id="pause">Pause</button><input id="seek" type="range" min="0" max="1" step=".0001" value="0"><output id="position">0 s</output></div><div id="waves"></div><a id="report">Download comparison report</a></div></section>
<footer>Original Rust/Wasm synths and FDN. No generator backend or preset migration. Effects memory reports Wasm linear memory only; native delay storage, browser DSP, synth instances, graphics and PCM buffers are separate. All worklets share the audio rendering thread.</footer>`;
document.querySelector('main').classList.add('ensemble-main');
const configKeys=Object.keys(initial).filter(id=>id!=='voices');let voiceOverrides=initial.voices;
for(const id of configKeys)$(id).value=initial[id];
$('live-path').value=ENSEMBLE_PATHS.some(([id])=>id===query.get('path'))?query.get('path'):'local';
$('fluid').value=['0','256','512'].includes(query.get('fluid'))?query.get('fluid'):'0';
let preview=ensemblePlan(initial),displayPlan=preview,pairPlan=null,levels=preview.parts.map(p=>p.gain);
const configuration=()=>ensembleConfig({...Object.fromEntries(configKeys.map(id=>[id,$(id).value])),voices:voiceOverrides});
function saveURL(config=configuration()){
 const {voices,...base}=config,params=new URLSearchParams({...base,path:$('live-path').value,fluid:$('fluid').value});if(Object.keys(voices).length)params.set('voices',JSON.stringify(voices));history.replaceState(null,'',location.pathname+'?'+params);
}
function parts(plan){
 const layout=effectsLayout(plan,'local'),privateCount=plan.parts.filter(p=>p.voiceEffects.room==='private').length;
 $('routing-budget').textContent=`New path: ${layout.count} reverb instance${layout.count===1?'':'s'} (${privateCount} private) · ${plan.parts.filter(p=>p.voiceEffects.send>0).length} instrument delays. Each reverb adds about 6.6 MiB of Wasm memory; native delay storage is additional.`;
 $('parts').replaceChildren();for(const part of plan.parts){const card=document.createElement('div');card.className='ensemble-part';card.style.borderColor=colours[part.role];
  const name=document.createElement('strong');name.textContent=part.name;const info=document.createElement('span'),voices=plan.voices[part.id];info.className='muted';info.textContent=`${part.role} · ${part.kind==='fm'?'FM':'subtractive'} · ${voices.peak}/${voices.capacity} notes incl. release · ${part.voiceEffects.room==='private'?`private ${part.voiceEffects.roomDecay} s room`:`shared room ${part.room+1}`}\nReference sends: room ${part.sends.reverb}, echo ${part.sends.delay}`;
  const label=document.createElement('label');label.textContent='Live level';const slider=document.createElement('input');slider.type='range';slider.min=0;slider.max=1.5;slider.step=.01;slider.value=levels[part.id]??part.gain;slider.ariaLabel=`${part.role} ${part.id+1} live level`;
  slider.oninput=()=>{levels[part.id]=Number(slider.value);live?.setLevel(part.id,levels[part.id]);};label.append(slider);card.append(name,info,label);
  const details=document.createElement('details'),summary=document.createElement('summary'),controls=document.createElement('div');summary.textContent='Instrument delay & room';controls.className='voice-effects';details.open=true;details.append(summary,controls);
  const setting=(key,title,min,max,step)=>{const label=document.createElement('label'),input=document.createElement('input');label.textContent=title;input.type='number';Object.assign(input,{min,max,step,value:step===1?Math.round(part.voiceEffects[key]):part.voiceEffects[key]});input.dataset.voice=part.id;input.dataset.setting=key;input.ariaLabel=`${part.role} ${part.id+1} ${title}`;input.onchange=()=>{voiceOverrides={...voiceOverrides,[part.id]:{...voiceOverrides[part.id],[key]:Number(input.value)}};change();};label.append(input);controls.append(label);};
  setting('delayMs','Echo spacing · ms',40,2000,1);setting('feedback','Feedback',0,.85,.01);setting('send','Echo send',0,.8,.01);setting('tone','Echo tone · Hz',300,14000,100);setting('roomSend','Echo → room',0,1,.01);
  for(const [key,title,options]of [['pingPong','Stereo echo',[[0,'Straight'],[1,'Ping-pong']]],['room','Reverb room',[['shared','Shared'],['private','Private']]]]){const label=document.createElement('label'),select=document.createElement('select');label.textContent=title;for(const [value,text]of options){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=part.voiceEffects[key];select.dataset.voice=part.id;select.dataset.setting=key;select.ariaLabel=`${part.role} ${part.id+1} ${title}`;select.onchange=()=>{voiceOverrides={...voiceOverrides,[part.id]:{...voiceOverrides[part.id],[key]:key==='pingPong'?Number(select.value):select.value}};change();};label.append(select);controls.append(label);}
  setting('roomDecay','Private room RT60 · s',.3,30,.1);controls.lastChild.querySelector('input').disabled=part.voiceEffects.room!=='private';
  card.append(details);if(busy)card.querySelectorAll('input,select').forEach(e=>e.disabled=true);$('parts').append(card);
 }
}
function score(plan){
 const canvas=$('score'),ctx=canvas.getContext('2d'),width=canvas.clientWidth,heightTotal=200,scale=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(2,Math.round(width*scale));canvas.height=Math.round(heightTotal*scale);ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,width,heightTotal);ctx.font='12px system-ui';
 for(let bar=0;bar<=plan.config.bars;bar++){const x=bar/plan.config.bars*width;ctx.strokeStyle='#354250';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,heightTotal);ctx.stroke();if(bar<plan.config.bars){ctx.fillStyle='#b9c7d2';ctx.fillText(`Bar ${bar+1}`,x+5,15);}}
 for(const part of plan.parts){const top=24+part.id*(heightTotal-24)/plan.parts.length,height=(heightTotal-24)/plan.parts.length;ctx.fillStyle=colours[part.role];
  part.notes.forEach((note,index)=>{const x=time=>time/plan.cycleSeconds*width,y=midi=>top+height*.8-(midi-24)/72*height*.7,retunes=part.retunes.filter(n=>n.id===index+1);if(!retunes.length){ctx.fillRect(x(note.time),y(note.midi),Math.max(2,x(note.duration)),2);return;}
   let pitch=note.midi;ctx.strokeStyle=colours[part.role];ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x(note.time),y(pitch));for(const target of retunes){ctx.lineTo(x(target.time),y(pitch));ctx.lineTo(x(target.time+target.seconds),y(target.midi));pitch=target.midi;}ctx.lineTo(x(note.time+note.duration),y(pitch));ctx.stroke();
  });
 }
}
function change(){preview=ensemblePlan(configuration());if(!live){displayPlan=preview;levels=preview.parts.map(p=>p.gain);score(preview);}parts(preview);saveURL();if(live)$('live-status').textContent='Settings changed. Restart live playback to apply them.';}
configKeys.forEach(id=>$(id).onchange=change);$('live-path').onchange=change;parts(preview);score(preview);
$('private-pad').onclick=()=>{voiceOverrides={...voiceOverrides,0:{...voiceOverrides[0],room:'private',roomDecay:20}};$('live-path').value='local';change();};
$('reset-voices').onclick=()=>{voiceOverrides={};change();};
function fluidSetting(){
 fluid?.dispose();fluid=null;document.querySelector('#ensemble-fluid')?.remove();
 const resolution=Number($('fluid').value);if(resolution){const canvas=document.createElement('canvas');canvas.id='ensemble-fluid';document.body.prepend(canvas);try{fluid=createEnsembleFluid(canvas,resolution);$('fluid-status').textContent=`Production fluid solver · ${resolution}/${resolution*2} grids · ${fluid.renderer}`;}catch(e){canvas.remove();$('fluid-status').textContent=e.message;}}
 else $('fluid-status').textContent='Fluid off.';frameTimes=[];saveURL();
}
$('fluid').onchange=fluidSetting;
const percentile=(sorted,fraction)=>sorted.length?sorted[Math.floor((sorted.length-1)*fraction)]:null;
function snapshot(){
 const sorted=[...frameTimes].sort((a,b)=>a-b),context=live?.context;
 return {created:new Date().toISOString(),userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,config:live?.plan.config,path:live?.path,seconds:live?Math.max(0,context.currentTime-live.start):0,
  audio:{sampleRate:context?.sampleRate,baseLatency:context?.baseLatency??null,outputLatency:context?.outputLatency??null,state:context?.state},
  stats:live?structuredClone(live.stats):null,effectsBuses:live?.effectsBuses,nativeDelayCount:live?.nativeDelayCount,effectsWasmBytes:live?.effectsWasmBytes,nativeDelayCompensationFrames:live?.nativeDelayCompensationFrames,frame:{samples:sorted.length,visibleFrames:liveFrames,p50Ms:percentile(sorted,.5),p95Ms:percentile(sorted,.95),over33ms:sorted.filter(x=>x>1000/30).length},
  mainThreadLongTasks:longTasks,longestTaskMs:longestTask,fluid:{active:!!fluid,resolution:Number($('fluid').value),renderer:fluid?.renderer??null,steps:fluid?.steps??0},limits:'Queue counters and visible frame pacing do not measure audio-device underruns. Wasm memory excludes native/browser/graphics allocations.'};
}
function updateStats(){
 if(!live)return;lastLive=snapshot();const values=Object.values(live.stats.sources),sum=key=>values.reduce((s,n)=>s+(n[key]??0),0),f=lastLive.frame,ms=v=>v===null?'unavailable':(v*1000).toFixed(1)+' ms';
 $('live-stats').textContent=`${values.length}/${live.plan.parts.length} sources reporting · active notes ${sum('active')} · steals ${sum('steals')} · queue late ${sum('late')} / dropped ${sum('dropped')}\nScheduled cycles ${live.stats.scheduledCycles} · missed cycles ${live.stats.missedCycles} · audio ${live.context.sampleRate} Hz / ${live.context.state}\nVisible frame interval (last ${f.samples}): median ${f.p50Ms?.toFixed(1)??'—'} ms / p95 ${f.p95Ms?.toFixed(1)??'—'} ms · >33 ms ${f.over33ms}\nMain-thread long tasks: ${longTasks??'unsupported'} · ${live.effectsBuses} rooms / ${live.nativeDelayCount} native delays · effects Wasm ${(live.effectsWasmBytes/1048576).toFixed(1)} MiB (native memory additional)\nBrowser latency: base ${ms(lastLive.audio.baseLatency)} / output ${ms(lastLive.audio.outputLatency)}`;
}
let observer;
try{if(PerformanceObserver.supportedEntryTypes?.includes('longtask')){observer=new PerformanceObserver(list=>{if(!live||document.hidden)return;for(const e of list.getEntries())if(e.startTime>=sessionStart){longTasks=(longTasks??0)+1;longestTask=Math.max(longestTask,e.duration);}});observer.observe({type:'longtask'});longTasks=0;}}catch{/* This browser does not expose main-thread long tasks. */}
function stopLive(){if(live){updateStats();live.dispose();live=null;}$('stop').disabled=true;$('start').textContent='Play live ensemble';$('live-status').textContent='Live playback stopped; effect tails cleared.';}
$('stop').onclick=stopLive;
$('start').onclick=async()=>{
 if(starting||busy)return;stopLive();players.forEach(p=>p.pause());active=null;starting=true;$('start').disabled=true;const token=++serial;
 try{const config=configuration();$('live-status').textContent='Preparing shared audio graph…';const next=await playEnsemble(config,$('live-path').value,{onError:e=>{stopLive();$('live-status').textContent=e.message;}});
  if(token!==serial){next.dispose();return;}live=next;displayPlan=live.plan;levels=live.plan.parts.map(p=>p.gain);parts(live.plan);score(live.plan);frameTimes=[];sessionStart=performance.now();liveFrames=0;longestTask=0;if(longTasks!==null)longTasks=0;
  $('stop').disabled=false;$('session').disabled=false;$('start').textContent='Restart live ensemble';$('live-status').textContent=`Playing ${pathNames[$('live-path').value]} · ${live.plan.parts.length} instruments · ${live.context.sampleRate} Hz actual rate. The score repeats; Stop & clear ends the tails.`;saveURL(config);
 }catch(e){$('live-status').textContent=e.message;console.error(e);}finally{starting=false;$('start').disabled=false;}
};
function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('session').onclick=()=>download(live?snapshot():lastLive,'ensemble-live-report.json');
function wave(canvas,buffer,gain){const ctx=canvas.getContext('2d'),data=buffer.getChannelData(0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#83bacb';ctx.beginPath();for(let x=0;x<canvas.width;x++){let lo=0,hi=0;for(let i=Math.floor(x*data.length/canvas.width);i<Math.floor((x+1)*data.length/canvas.width);i++){lo=Math.min(lo,data[i]*gain);hi=Math.max(hi,data[i]*gain);}ctx.moveTo(x,45-hi*43);ctx.lineTo(x,45-lo*43);}ctx.stroke();}
function attach(){
 players.forEach(p=>p.pause());urls.forEach(u=>URL.revokeObjectURL(u));urls=[];active=null;const target=Math.min(...pair.map(r=>r.metrics.rms)),gains=pair.map(r=>$('match').checked&&r.metrics.rms>1e-10?target/r.metrics.rms:1);
 $('waves').replaceChildren();$('path-buttons').replaceChildren();players=pair.map((r,i)=>{const url=URL.createObjectURL(wavBlob(r.buffer,gains[i]));urls.push(url);const player=new Audio(url),button=document.createElement('button');button.textContent=`Play ${pathNames[r.path]}`;button.onclick=()=>{if(busy||starting)return;stopLive();displayPlan=pairPlan;score(pairPlan);players.forEach(p=>p.pause());active=player;player.currentTime=Number($('seek').value)*r.seconds;void player.play().catch(e=>$('status').textContent=e.message);};$('path-buttons').append(button);
  const label=document.createElement('p');label.className='muted';label.textContent=pathNames[r.path]+' · playback waveform';const wrap=document.createElement('div');wrap.className='wave';const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=90;const head=document.createElement('i');head.className='playhead output-head';wrap.append(canvas,head);const link=document.createElement('a');link.href=url;link.download=`ensemble-${r.path}.wav`;link.textContent='Download WAV';$('waves').append(label,wrap,link);wave(canvas,r.buffer,gains[i]);return player;
 });$('playback').classList.remove('hidden');$('seek').value=0;
}
$('match').onchange=()=>{if(pair.length&&!busy)attach();};$('pause').onclick=()=>players.forEach(p=>p.pause());$('seek').oninput=()=>{if(pairPlan&&!live){displayPlan=pairPlan;score(pairPlan);}players.forEach(p=>p.currentTime=Number($('seek').value)*(pair[0]?.seconds??1));};
function results(){
 const table=document.createElement('table');table.innerHTML='<thead><tr><th>Path</th><th>Prepare ms</th><th>Render ms</th><th>Audio / render s</th><th>Room buses</th><th>Native delays</th><th>Effects Wasm MiB*</th><th>Raw peak / RMS</th></tr></thead>';const body=document.createElement('tbody');for(const r of pair){const tr=document.createElement('tr');for(const text of [pathNames[r.path],r.prepareMs.toFixed(1),r.renderMs.toFixed(1),(r.seconds/(r.renderMs/1000)).toFixed(1)+'×',r.effectsBuses,r.nativeDelayCount,(r.effectsWasmBytes/1048576).toFixed(1),`${r.metrics.peak.toFixed(3)} / ${r.metrics.rms.toFixed(4)}`]){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);}table.append(body);$('results').replaceChildren(table);
}
async function run(benchmark=false){
 if(busy||starting)return;busy=true;stopLive();players.forEach(p=>p.pause());active=null;$('seek').value=0;$('render').disabled=$('benchmark').disabled=$('start').disabled=true;document.querySelectorAll('#configuration input,#configuration select,#configuration button').forEach(e=>e.disabled=true);
 const plan=ensemblePlan(configuration()),rows=[],nextPair=[];let capture;
 try{
  displayPlan=plan;levels=plan.parts.map(p=>p.gain);parts(plan);score(plan);if(plan.config.scope==='stems'){$('status').textContent='Capturing identical instrument stems together…';capture=await captureEnsemble(plan);}
  const count=benchmark?4:1;for(let iteration=0;iteration<count;iteration++)for(const [path]of iteration%2?[...ENSEMBLE_PATHS].reverse():ENSEMBLE_PATHS){
   $('status').textContent=`${benchmark&&iteration===0?'Warm-up':'Render'} ${iteration+1}/${count} · ${pathNames[path]} · ${plan.config.count} instruments / ${plan.config.rooms} shared rooms`;
   const result=await renderEnsemble(plan,path,{capture});rows.push({...result,buffer:undefined,run:iteration});if(iteration===count-1)nextPair[ENSEMBLE_PATHS.findIndex(([id])=>id===path)]=result;
  }
  pair=nextPair;pairPlan=plan;results();attach();report={created:new Date().toISOString(),userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,config:plan.config,effects:plan.effects,parts:plan.parts.map(({patch,...p})=>({...p,patch})),capture:capture?{prepareMs:capture.prepareMs,renderMs:capture.renderMs,pcmBytes:capture.pcmBytes}:null,fluid:{resolution:Number($('fluid').value),renderer:fluid?.renderer??null},kind:'Offline wall time; live underruns and native/graphics memory are not measured',rows};
  const median=path=>{const values=rows.filter(r=>r.path===path&&r.run>0).map(r=>r.renderMs).sort((a,b)=>a-b);return values[1];};
  $('summary').textContent=`${plan.config.scope==='stems'?'Effects-only: stem capture is outside the row timings.':'Full synthesis and effects; sources stop after their releases while effects finish.'}\n${plan.seconds.toFixed(2)} seconds each · ${plan.config.count} instruments · ${plan.config.rooms} shared rooms · ${plan.config.sampleRate} Hz\n`+(capture?`Stem capture: ${capture.renderMs.toFixed(1)} ms render + ${capture.prepareMs.toFixed(1)} ms preparation; ${(capture.pcmBytes/1048576).toFixed(1)} MiB PCM retained during this comparison.\n`:'')+(benchmark?'Warm-up excluded. Median render ms: '+ENSEMBLE_PATHS.map(([id,name])=>`${name} ${median(id).toFixed(1)}`).join(' / ')+'\n':'')+'* Effects Wasm memory only; native delay memory is additional. The new path intentionally changes echo character; private rooms add independent tails. Per-instrument modulation/saturation can differ from a shared room. Playback matching does not change the raw metrics.';
  if($('report').dataset.url)URL.revokeObjectURL($('report').dataset.url);const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));$('report').href=url;$('report').dataset.url=url;$('report').download='ensemble-comparison.json';$('status').textContent='Complete. Switch paths at the shared playhead; the score marks each bar.';saveURL(plan.config);
 }catch(e){$('status').textContent=e.message;console.error(e);}finally{busy=false;$('render').disabled=$('benchmark').disabled=$('start').disabled=false;document.querySelectorAll('#configuration input,#configuration select,#configuration button').forEach(e=>e.disabled=false);parts(ensemblePlan(configuration()));capture=null;}
}
$('render').onclick=()=>run();$('benchmark').onclick=()=>run(true);
function animate(now){
 frame=requestAnimationFrame(animate);const dt=previous?(now-previous)/1000:0;previous=now;if(document.hidden)return;
 if(live&&dt>0){frameTimes.push(dt*1000);if(frameTimes.length>1800)frameTimes.shift();liveFrames++;}
 if(fluid)try{fluid.draw(dt,live?.plan,live?live.context.currentTime-live.start:-1,levels);}catch(e){$('fluid-status').textContent=e.message;fluid.dispose();fluid=null;}
 let time=0,isTail=false;if(live){time=Math.max(0,live.context.currentTime-live.start)%live.plan.cycleSeconds;displayPlan=live.plan;}
 else if(pair[0]){if(active&&!active.paused)$('seek').value=active.currentTime/pair[0].seconds;time=Number($('seek').value)*pair[0].seconds;isTail=time>=displayPlan.cycleSeconds;document.querySelectorAll('.output-head').forEach(e=>e.style.left=Number($('seek').value)*100+'%');$('position').textContent=time>=displayPlan.sourceSeconds?`Tail +${(time-displayPlan.sourceSeconds).toFixed(1)} s`:`${time.toFixed(1)} s`;}
 $('score-head').style.left=Math.min(1,time/displayPlan.cycleSeconds)*100+'%';$('bar-position').textContent=isTail?'Release / effects tail':`Bar ${Math.floor(time/(240/displayPlan.config.bpm))+1} · beat ${Math.floor(time/(60/displayPlan.config.bpm)%4)+1}`;
 if(now-lastUpdate>500){lastUpdate=now;updateStats();}
}
fluidSetting();frame=requestAnimationFrame(animate);
document.addEventListener('visibilitychange',()=>{previous=0;});
window.addEventListener('resize',()=>score(displayPlan));
window.addEventListener('beforeunload',()=>{serial++;live?.dispose();players.forEach(p=>p.pause());urls.forEach(u=>URL.revokeObjectURL(u));fluid?.dispose();observer?.disconnect();cancelAnimationFrame(frame);});
if(import.meta.env.DEV)window.__ensembleLab={run,get report(){return report;},get live(){return live;},get pair(){return pair;},snapshot,stopLive};
