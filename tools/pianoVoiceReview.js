import Instrument from '../src/app/engine/Instrument';
import voices from '../src/library/voices.json';
import {pianoStemTap} from '../src/synths/all/pianoStemTap';
import {compilePianoNotes} from '../src/modular-audio/pianoCompiler';
import {ReferenceGraph,savePatch,loadPatch} from '../src/modular-audio/runtime';
import {loadGraphAssets} from '../src/modular-audio/graphAssets';
const presets=Object.assign({},...Object.values(voices));
const rate=48000,total=144000,notes=[{midi:48,time:.125,duration:.4,velocity:.3},{midi:60,time:.625,duration:.5,velocity:.6},{midi:67,time:.625,duration:.5,velocity:.45},{midi:72,time:1.375,duration:.7,velocity:.8}];
const status=document.querySelector('#status'),report=document.querySelector('#report'),button=document.querySelector('#run');
const urls=[];
const releaseAudio=()=>{for(const player of document.querySelectorAll('#audio audio'))player.pause();for(const url of urls)URL.revokeObjectURL(url);urls.length=0;document.querySelector('#audio').replaceChildren();};
window.addEventListener('pagehide',releaseAudio);
function wav(data){const b=new ArrayBuffer(44+data.length*4),v=new DataView(b);const str=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));str(0,'RIFF');v.setUint32(4,b.byteLength-8,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,3,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,32,true);str(36,'data');v.setUint32(40,data.length*4,true);new Float32Array(b,44).set(data);const url=URL.createObjectURL(new Blob([b],{type:'audio/wav'}));urls.push(url);return url;}
button.onclick=async()=>{button.disabled=document.querySelector('#batch').disabled=document.querySelector('#listen').disabled=true;releaseAudio();const results=[];try{
 const assets=await loadGraphAssets();
 for(const [name,base,changes] of [['Felt Keys (updated)','Felt Keys (updated)',{}],['Starmap Piano','Starmap Piano',{}],['Felted Piano','Felted Piano',{}],['Studio Grand','Studio Grand',{}],['Electric recipe','Starmap Piano',{pianoType:'electric'}],['Upright recipe','Felt Keys (updated)',{pianoType:'upright'}],['Felt Keys without pitch envelope','Felt Keys (updated)',{pitchEnvAmount:0}]]){
  status.textContent=`Comparing ${name}`;if(!presets[base])throw Error('Missing preset '+base);const preset={...presets[base],...changes};
  const context=new OfflineAudioContext(1,total,rate),native=new Instrument({context,preset,polyphony:8,deferReverb:true});
  for(const v of native.voices)v.volume.getNode().connect(context.destination);
  // AudioParam.value starts at the platform default until its first quantum.
  // Capture after preset events execute, before the first diagnostic note.
  const suspended=context.suspend(.01),rendering=context.startRendering();await suspended;
  const wrapper={voice:{native,spec:{kind:'legacy'}}},source=pianoStemTap(wrapper),{config}=compilePianoNotes(source,notes);
  const patch={version:1,modules:[{id:1,type:'legacy.piano',version:1,parameters:{gain:1},config},{id:18,type:'ref.output',version:1,parameters:{}}],connections:[{id:1,kind:'audio',from:{module:1,port:'audio.out'},to:{module:18,port:'program.in'}}],events:notes.map((n,i)=>({kind:'note',target:1,owner:1,event:0,note:i+1,frame:Math.round(n.time*rate),a:n.midi,b:n.velocity}))};
  for(const n of notes)native.scheduleNote(n.midi,n.time,n.duration,n.velocity,0,null,true);
  await context.resume();const expected=(await rendering).getChannelData(0);native.dispose();
  const g=new ReferenceGraph(new WebAssembly.Instance(assets.modules.graph,{}).exports,loadPatch(savePatch(patch,assets.contracts),assets.contracts),assets.contracts,rate,512),actual=new Float32Array(total);
  try{for(let at=0;at<total;at+=512){const count=Math.min(512,total-at);g.render(count);actual.set(g.left.subarray(0,count),at);}}finally{g.dispose();}
  let maxError=0,errorEnergy=0,energy=0,peak=0,dot=0,actualEnergy=0;for(let i=0;i<total;i++){const d=actual[i]-expected[i];maxError=Math.max(maxError,Math.abs(d));errorEnergy+=d*d;energy+=expected[i]**2;actualEnergy+=actual[i]**2;dot+=actual[i]*expected[i];peak=Math.max(peak,Math.abs(actual[i]));}
  results.push({name,cutoff:config.cutoff,pitchCents:config.pitch,peak,maxError,relativeRmsError:Math.sqrt(errorEnergy/energy),correlation:dot/Math.sqrt(energy*actualEnergy)});
  const section=document.createElement('section');section.innerHTML=`<h2>${name}</h2><p>Native dry voice</p><audio controls></audio><p>Rust dry voice</p><audio controls></audio>`;const players=section.querySelectorAll('audio');players[0].src=wav(expected);players[1].src=wav(actual);document.querySelector('#audio').append(section);
 }
 const checksPassed=results.every(r=>r.peak>0&&r.relativeRmsError<.005&&r.correlation>.99998);
 report.textContent=JSON.stringify({kind:'piano.native-voice-comparison',version:1,engineVersion:assets.manifest.version,sampleRate:rate,scope:'Native dry voice before shared compressor/FX; approximate SRC parity, not bit identity or listening',checksPassed,limits:{relativeRmsError:.005,correlation:.99998},notes,results},null,2);status.textContent=checksPassed?'Comparisons passed; audio pairs ready.':'Comparisons outside tolerance; inspect results.';
 }catch(e){status.textContent='Failed: '+String(e);report.textContent=JSON.stringify({error:String(e),results},null,2);}finally{button.disabled=document.querySelector('#batch').disabled=document.querySelector('#listen').disabled=false;}};
