import DrumKit from '../app/engine/drumKit';
import WasmDrumKit from '../app/engine/wasmDrumKit';
import {METERS} from '../app/meter';
import {DRUM_STYLE_NOTES} from '../app/additionalDrumStyles';
import {DRUMS,DRUM_STYLES,defaultDrumKit} from '../app/percussion';
import {reviewEvents,waveBytes} from '../../tools/percussionReview';
import {percussionVoice,percussionPads,percussionPresetKit} from '../app/percussionVoices';
import {comparisonPlayheads} from '../../tools/comparisonPlayhead';

const LABELS={native:'Native Web Audio',wasm:'Wasm'};
export function fixture(options) {
    const {fixture:kind='groove',bpm=88,bars=4}=options;
    if(kind!=='groove') {
        const drums=kind==='all'?(options.voice?percussionPads(options.voice).map(p=>p.drum):DRUMS.map((_,i)=>i)):[DRUMS.indexOf(kind)];
        const events=drums.map((midi,i)=>({midi,time:(Number(options.offset)||.05)+i*.8,duration:.5,velocity:.7,vary:0}));
        const seconds=drums.length*.8;
        return {events,seconds,bars:[{bar:0,start:0,seconds,units:drums.length,events:events.map(e=>({...e,beat:(e.time-.05)/.8}))}]};
    }
    const p=reviewEvents({...options,kit:options.voice??options.kit??'felt',bpm:Number(bpm),bars:Number(bars),groove:options.groove==='auto'?'auto':Number(options.groove)||0,seed:Number(options.seed??42),embellish:options.embellish==null?!options.voice:options.embellish===true||options.embellish==='1',activity:.65,variation:.5,sprinkle:.35});
    return {seconds:p.barSeconds*bars,bars:p.planned.map((events,bar)=>({bar,start:bar*p.barSeconds,seconds:p.barSeconds,units:METERS[p.meter].units,events})),events:p.planned.flatMap((events,bar)=>events.map(e=>({midi:e.midi,time:.05+bar*p.barSeconds+e.beat*p.unitSeconds,duration:e.length*p.unitSeconds,velocity:e.velocity,vary:e.detune})))};
}
function configuredKit(options) {
    const kit=options.voice?percussionPresetKit(options.voice):defaultDrumKit();kit.room=Number(options.room)||0;
    for(const name of DRUMS){kit[name].tone=Number(options.tone)||0;kit[name].decay=Number(options.decay)||1;}
    return kit;
}
export async function renderCase(model, options={}) {
    if(options.voice&&percussionVoice(options.voice).wasmOnly&&model==='native')throw Error(percussionVoice(options.voice).name+' requires the Wasm backend.');
    const plan=fixture(options),rate=Number(options.rate)||48000;
    const context=new OfflineAudioContext(2,Math.ceil((plan.seconds+8.2)*rate),rate);
    const counts={oscillators:0,noiseSources:0,filters:0,gains:0,panners:0,convolvers:0};
    for(const [method,key] of Object.entries({createOscillator:'oscillators',createBufferSource:'noiseSources',createBiquadFilter:'filters',createGain:'gains',createStereoPanner:'panners',createConvolver:'convolvers'})) {
        const original=context[method].bind(context);context[method]=(...args)=>{counts[key]++;return original(...args);};
    }
    const started=performance.now(),Kit=model==='native'?DrumKit:WasmDrumKit;
    const kit=new Kit({context,model,externalEffects:!Number(options.room)});kit.scheduleSleep=()=>{};
    try {
        kit.setKit(configuredKit(options));if(options.voice)kit.setVoicePreset(options.voice);kit.connect(context.destination);if(kit.ready)await kit.ready;
        const book=performance.now();
        for(const e of plan.events)kit.scheduleNote(e.midi,e.time,e.duration,e.velocity,e.vary);
        const bookingMs=performance.now()-book;
        if(Number(options.room)){kit.reverb.hear();const deadline=performance.now()+10000;while(!kit.reverb.settled&&performance.now()<deadline)await new Promise(r=>setTimeout(r,10));if(!kit.reverb.settled)throw Error('Room impulse did not load.');}
        kit.prepareOffline?.();
        const rendering=performance.now(),buffer=await context.startRendering(),renderMs=performance.now()-rendering;
        let peak=0,energy=0,nonFinite=0;
        for(let ch=0;ch<2;ch++)for(const value of buffer.getChannelData(ch)){if(!Number.isFinite(value))nonFinite++;peak=Math.max(peak,Math.abs(value));energy+=value*value;}
        if(nonFinite||kit.error||plan.events.length&&peak===0)throw kit.error??Error(peak===0?'Unexpected silent render':'Non-finite output');
        return {model,voice:options.voice,buffer,plan,counts,bookingMs,renderMs,totalMs:performance.now()-started,peak,rms:Math.sqrt(energy/(buffer.length*2)),nonFinite};
    } finally {kit.dispose();}
}
function chart(canvas, result) {
    canvas.width=1000;canvas.height=180;const c=canvas.getContext('2d'),{plan,buffer}=result;
    c.fillStyle='#141b23';c.fillRect(0,0,1000,180);
    const data=buffer.getChannelData(0),frames=Math.min(buffer.length,Math.ceil(plan.seconds*buffer.sampleRate));
    c.fillStyle='#81b7c8';for(let x=0;x<1000;x++){let peak=0;for(let i=Math.floor(x/1000*frames);i<Math.floor((x+1)/1000*frames);i++)peak=Math.max(peak,Math.abs(data[i]));const h=Math.min(60,peak*90);c.fillRect(x,90-h,1,2*h);}
    c.font='12px system-ui';
    for(const bar of plan.bars){const x=bar.start/plan.seconds*1000;c.fillStyle='#d4dbe6';c.fillText('Bar '+(bar.bar+1),x+4,16);c.strokeStyle='#58677a';c.beginPath();c.moveTo(x,20);c.lineTo(x,180);c.stroke();}
    for(const e of plan.events){const x=(e.time-.05)/plan.seconds*1000;c.fillStyle='#e6bb77';c.fillRect(x,150,2,12);if(plan.bars.length===1){c.save();c.translate(x+4,145);c.rotate(-.45);c.fillText(result.voice?(percussionPads(result.voice).find(p=>p.drum===e.midi)?.label??DRUMS[e.midi]):DRUMS[e.midi],0,0);c.restore();}}
}
const form=document.querySelector('#percussion-engine'),status=document.querySelector('#status'),results=document.querySelector('#results');
for(const [id,label]of Object.entries(DRUM_STYLES))if(id!=='off')form.elements.style.add(new Option(label,id));
for(const[id,meter]of Object.entries(METERS))form.elements.meter.add(new Option(meter.label,id));
form.elements.style.value='lofi';form.elements.meter.value='4/4';
for(const [key,value]of new URLSearchParams(location.search))if(form.elements[key]){if(form.elements[key].type==='checkbox')form.elements[key].checked=value==='1';else form.elements[key].value=value;}
if(!form.elements.voice.value)form.elements.voice.value='felt';
let playheads,urls=[],revision=0;
form.addEventListener('submit',async event=>{
    event.preventDefault();stopLive();form.querySelector('button').disabled=true;
    document.querySelectorAll('audio').forEach(a=>a.pause());
    const renderedRevision=revision,options=Object.fromEntries(new FormData(form));history.replaceState(null,'',location.pathname+'?'+new URLSearchParams(options));
    try {
        const rendered=[];
        for(const model of (percussionVoice(options.voice).wasmOnly?['wasm']:['native','wasm'])){status.textContent='Rendering '+LABELS[model]+'…';rendered.push(await renderCase(model,options));}
        playheads?.dispose();urls.forEach(URL.revokeObjectURL);urls=[];results.replaceChildren();playheads=comparisonPlayheads();
        for(const r of rendered){
            const section=document.createElement('section'),h=document.createElement('h2'),audio=document.createElement('audio'),canvas=document.createElement('canvas'),stats=document.createElement('p'),save=document.createElement('a');
            h.textContent=percussionVoice(r.voice).name+' · '+(r.model==='native'?'Native Web Audio':'Wasm')+(options.fixture==='groove'?' · '+DRUM_STYLES[options.style]+' / '+(options.groove==='auto'?'seed '+options.seed:Number(options.groove)+1):'');audio.controls=true;audio.src=URL.createObjectURL(new Blob([waveBytes(r.buffer)],{type:'audio/wav'}));urls.push(audio.src);
            save.href=audio.src;save.download='percussion-'+r.voice+'-'+r.model+'.wav';save.textContent='Save WAV';
            stats.textContent=`Peak ${(20*Math.log10(r.peak||1e-12)).toFixed(1)} dBFS · booking ${r.bookingMs.toFixed(1)} ms · render ${r.renderMs.toFixed(1)} ms for ${r.buffer.duration.toFixed(1)} s · ${r.counts.oscillators+r.counts.noiseSources} native sources${r.model==='native'?'':' + 1 Wasm worklet'}`;
            section.append(h,audio,save,stats,canvas);results.append(section);chart(canvas,r);playheads.add(audio,canvas,r.plan,{offset:.05,left:0,right:0});
        }
        window.__percussionLab.results=rendered;
        results.dataset.outdated=String(revision!==renderedRevision);
        status.textContent=revision===renderedRevision?'Ready. Play or seek a player to move the shared bar cursor; starting another player switches at the same position.':'Settings changed during rendering. Render again to hear the current selection.';
    }catch(error){status.textContent=error.message;console.error(error);}finally{form.querySelector('button').disabled=false;}
});
let liveContext,liveKit,livePreparing,generation=0;
function stopLive(){generation++;liveKit?.dispose();liveKit=null;livePreparing=null;document.querySelector('#live-status').textContent='Stopped';}
async function play(drum){
    liveContext??=new AudioContext({latencyHint:'interactive'});await liveContext.resume();
    const token=generation,model=document.querySelector('#live-model').value;
    livePreparing??=(async()=>{const Kit=model==='native'?DrumKit:WasmDrumKit,k=new Kit({context:liveContext,model,externalEffects:true});k.setKit(configuredKit({voice:form.elements.voice.value,room:0,tone:form.elements.tone.value,decay:form.elements.decay.value}));k.setVoicePreset(form.elements.voice.value);k.connect(liveContext.destination);try{await k.ready;}catch(error){k.dispose();throw error;}if(token!==generation){k.dispose();return null;}liveKit=k;return k;})();
    try{const k=await livePreparing;if(!k||token!==generation)return;k.scheduleNote(drum,liveContext.currentTime+.01,.5,.55,0);document.querySelector('#live-status').textContent=percussionVoice(form.elements.voice.value).name+' · '+percussionPads(form.elements.voice.value).find(p=>p.drum===drum)?.label;}catch(error){stopLive();document.querySelector('#live-status').textContent=error.message;}
}
const codes=['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote'];
function updateVoice(){
 document.querySelector('#groove-note').textContent=(DRUM_STYLE_NOTES[form.elements.style.value]??'Choose a groove variant and seed. Variation adds occasional ornaments and fills.')+' Changing controls requires a new render.';
 stopLive();const voice=percussionVoice(form.elements.voice.value),backend=document.querySelector('#live-model');backend.querySelector('[value=native]').disabled=voice.wasmOnly;if(voice.wasmOnly)backend.value='wasm';
 document.querySelector('#pads').replaceChildren();percussionPads(voice.id).forEach(({drum,label})=>{const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('pointerdown',event=>{event.preventDefault();void play(drum);});document.querySelector('#pads').append(button);});
}
form.addEventListener('change',()=>{
 revision++;updateVoice();document.querySelectorAll('#results audio').forEach(audio=>audio.pause());
 if(results.children.length){results.dataset.outdated='true';status.textContent='Settings changed. Press Render comparison to hear this selection; the players below contain the previous render.';}
});updateVoice();
window.addEventListener('keydown',event=>{if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,select,textarea'))return;const drum=codes.indexOf(event.code);if(drum>=0){event.preventDefault();void play(drum);}});
document.querySelector('#stop').addEventListener('click',stopLive);
document.querySelector('#live-model').addEventListener('change',stopLive);
window.addEventListener('pagehide',()=>{stopLive();playheads?.dispose();urls.forEach(URL.revokeObjectURL);});
window.__percussionLab={renderCase,fixture,results:[]};
