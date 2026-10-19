import {outputFixture, outputWav} from './outputFixture';
import {setupMediaSession, updateMediaSession, mediaSessionDiagnostics} from '../app/mediaSession';
import './outputLab.css';

const root = document.querySelector('#audio-output');
root.innerHTML = `<a href="/">← calmbgm</a><h1>Audio output check</h1>
<p>The same gentle loop through four output paths. This page loads no synth, reverb, or AudioWorklet. Play one test at a time, then try with the screen locked.</p>
<label>Requested Web Audio buffer <select id="latency"><option value="0.1">100 ms</option><option value="0.5">500 ms</option><option value="interactive">Interactive</option><option value="playback">Playback</option></select></label>
<div class="output-tests">
<button data-path="native">1 · Web Audio only</button><small>One native looping buffer, directly to the speakers.</small>
<button data-path="helper">2 · Web Audio + helper</button><small>The same loop plus the site's silent lock-screen helper.</small>
<button data-path="media">3 · Media file</button><small>The same PCM as a WAV in an audio element. No AudioContext.</small>
<button data-path="stream">4 · Web Audio through media</button><small>The native loop through a MediaStream and audio element; may add latency.</small>
</div><div class="output-actions"><button id="stop">Stop</button><button id="copy">Copy results</button></div>
<p id="output-status" role="status">Ready. Use the phone's normal media volume.</p>
<details><summary>Live diagnostics</summary><pre id="report"></pre></details>
<p><a href="/?preset=rainy-cafe&perf=1&mediaHelper=0">Main page without the silent helper</a> · <a href="/?preset=rainy-cafe&perf=1&mediaHelper=1">Main page with the helper</a></p>`;
const fixture = outputFixture(), wavUrl = URL.createObjectURL(new Blob([outputWav(fixture)], {type:'audio/wav'}));
let current = null, revision = 0, lastPath = 'native';
const history = [], errors = [];
const status = text => { document.querySelector('#output-status').textContent = text; };
function record(event) { history.push({at:new Date().toISOString(),visibility:document.visibilityState,...event});if(history.length>64)history.shift(); }
function snapshot() {
    const c=current?.context,a=current?.media;
    const data=new Float32Array(1024);current?.analyser?.getFloatTimeDomainData(data);
    let energy=0,peak=0;for(const v of data){energy+=v*v;peak=Math.max(peak,Math.abs(v));}
    let timestamp;try{timestamp=c?.getOutputTimestamp?.();}catch{}
    return {path:current?.path??'stopped',requestedLatency:current?.latency,context:c?{state:c.state,time:c.currentTime,rate:c.sampleRate,baseLatency:c.baseLatency,outputLatency:c.outputLatency,timestamp}:null,
        media:a?{paused:a.paused,time:a.currentTime,readyState:a.readyState,error:a.error?.code??null}:null,
        digitalOutput:c?{peak,rms:Math.sqrt(energy/data.length)}:null,mediaSession:mediaSessionDiagnostics()};
}
function report() {return {version:1,url:location.href,browser:navigator.userAgent,secureContext:isSecureContext,fixture:{rate:fixture.rate,seconds:fixture.channels[0].length/fixture.rate},current:snapshot(),history:history.slice(),errors:errors.slice()};}
function stop() {
    ++revision;
    const old=current, oldSnapshot=old?snapshot():null;current=null;
    if(old){record({type:'stop',...oldSnapshot});try{old.source?.stop();}catch{}old.source?.disconnect();old.analyser?.disconnect();
        if(old.media){old.media.pause();old.media.srcObject=null;old.media.removeAttribute('src');old.media.load();}
        old.stream?.getTracks().forEach(t=>t.stop());old.context?.close().catch(()=>{});}
    updateMediaSession({playing:false,helper:false,title:'Audio output check',artist:'calmbgm'});
    root.querySelectorAll('[data-path]').forEach(b=>b.setAttribute('aria-pressed','false'));
    status('Stopped.');
}
async function start(path) {
    stop();lastPath=path;const own=revision,choice=document.querySelector('#latency').value,latency=Number.isFinite(Number(choice))?Number(choice):choice;
    const state={path,latency};current=state;
    try{
        // Audio unlocks are initiated in this click, before awaiting promises.
        let resumed=Promise.resolve();
        if(path!=='media'){
            const c=new AudioContext({latencyHint:latency});state.context=c;resumed=c.resume();
            const buffer=c.createBuffer(2,fixture.channels[0].length,fixture.rate);fixture.channels.forEach((ch,i)=>buffer.copyToChannel(ch,i));
            state.source=c.createBufferSource();state.source.buffer=buffer;state.source.loop=true;state.analyser=c.createAnalyser();state.analyser.fftSize=1024;state.source.connect(state.analyser);
            if(path==='stream'){const destination=c.createMediaStreamDestination();state.stream=destination.stream;state.analyser.connect(destination);state.media=new Audio();state.media.srcObject=state.stream;}
            else state.analyser.connect(c.destination);
            state.source.start();
        } else {state.media=new Audio(wavUrl);state.media.loop=true;}
        updateMediaSession({playing:true,helper:path==='helper',title:'Audio output check',artist:'calmbgm'});
        const playing=state.media?.play()??Promise.resolve();
        await Promise.all([resumed,playing]);if(own!==revision)return;
        record({type:'start',...snapshot()});status('Playing test '+({native:1,helper:2,media:3,stream:4}[path])+'.');
        root.querySelectorAll('[data-path]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.path===path)));
    } catch(e) {errors.push({path,name:e.name,message:e.message});if(errors.length>16)errors.shift();if(own===revision){stop();status('Could not start: '+e.message);}}
}
root.querySelectorAll('[data-path]').forEach(b=>b.addEventListener('click',()=>void start(b.dataset.path)));
document.querySelector('#stop').addEventListener('click',stop);
document.querySelector('#copy').addEventListener('click',async()=>{const text=JSON.stringify(report(),null,2);try{await navigator.clipboard.writeText(text);status('Results copied.');}catch{window.prompt('Copy results',text);}});
setupMediaSession({play:()=>void start(lastPath),stop});
setInterval(()=>{if(current)record({type:'sample',...snapshot()});document.querySelector('#report').textContent=JSON.stringify(report(),null,2);},1000);
document.addEventListener('visibilitychange',()=>record({type:'visibility',...snapshot()}));
