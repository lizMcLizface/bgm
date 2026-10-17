import { SCENES, sceneSlug, sceneSettings } from '../src/app/scenes';
import { METERS } from '../src/app/meter';
import { findPreset } from '../src/app/editor/presetStore';
import { pianoPatch } from '../src/app/engine/pianoPatches';
import { levelPreset } from '../src/app/engine/loudness';
import { renderEnsemble, matchAverageLevels, drawNotes } from './ensembleReview';

export async function renderPianos(options,onProgress=()=>{}) {
    const base=findPreset(options.patch),settings=sceneSettings(SCENES.find(s=>sceneSlug(s.name)===options.preset),options.seed);
    const struck={...pianoPatch(options.patch,base,'latest',{resonance:false}),pianoDecay:options.decay,pianoSustain:options.sustain??.28,pianoBrightness:options.brightness,pianoHammer:options.hammer,pianoUnison:options.unison};
    if(options.tone!=='preset')struck.pianoType=options.tone;
    const meter=METERS[settings.meter],isTest=options.pattern!=='music',center=options.role==='bass'?36:options.role==='lead'?72:60;
    const testNotes=isTest?Array.from({length:4},(_,bar)=>{
        const velocity=options.pattern==='register'?.8:[.25,.5,.75,1][bar],midi=options.pattern==='register'?center-12+bar*12:center;
        if(options.pattern==='held')return {label:'Long held chord',events:bar?[]:[0,4,7].map(interval=>({role:options.role,midi:center+interval,beat:0,length:meter.units*4-.5,velocity:.65,detune:0}))};
        return {label:options.pattern==='register'?`MIDI ${midi}`:`Velocity ${Math.round(velocity*100)}%`,events:(options.pattern==='chords'?[0,4,7]:[0]).map(interval=>({role:options.role,midi:midi+interval,beat:0,length:meter.units*.65,velocity,detune:0}))};
    }):null;
    const result=[];
    for(const [label,preset] of [['Original oscillator / FM',base],['Struck piano',struck]]) {
        const sound={name:label,preset:await levelPreset(preset,options.role)};
        const plan=await renderEnsemble({preset:options.preset,seed:options.seed,bars:4,bass:'preset',pad:'preset',sections:false,straight:true,activeLead:true,
            counterActive:options.role==='counter',variant:'latest',coordinate:true,developForm:true,testNotes,
            parts:options.ensemble&&!isTest?['pad','bass','lead','counter','perc']:[options.role],sounds:{[options.role]:sound}},n=>onProgress(label,n));
        result.push({...plan,label});
    }
    if(JSON.stringify(result[0].bars.map(b=>b.events))!==JSON.stringify(result[1].bars.map(b=>b.events)))throw Error('Comparison note plans differ.');
    return matchAverageLevels(result);
}

const form=document.querySelector('#pianos'),urls=[];
if(form) {
    for(const scene of SCENES.filter(s=>s.settings.playMusic!==false))form.elements.preset.add(new Option(scene.name,sceneSlug(scene.name)));
    const defaults={preset:'rainy-cafe',patch:'Felt Piano',role:'pad',pattern:'music',tone:'preset',seed:'42',decay:'2.8',sustain:'.28',brightness:'.45',hammer:'.3',unison:'.25'},query=new URLSearchParams(location.search);
    for(const [key,value] of Object.entries(defaults)){form.elements[key].value=query.get(key)||value;if(!form.elements[key].value)form.elements[key].value=value;}
    form.addEventListener('submit',async event=>{
        event.preventDefault();const options=Object.fromEntries(Object.keys(defaults).map(key=>[key,['preset','patch','role','pattern','tone'].includes(key)?form.elements[key].value:Number(form.elements[key].value)]));options.ensemble=form.elements.ensemble.checked;
        const button=form.querySelector('button'),status=document.querySelector('#status');button.disabled=true;document.querySelectorAll('audio').forEach(a=>a.pause());
        history.replaceState(null,'',location.pathname+'?'+new URLSearchParams(Object.fromEntries(Object.keys(defaults).map(key=>[key,options[key]]))));
        try {
            const result=await renderPianos(options,(label,n)=>{status.textContent=`Rendering ${label} ${Math.round(n*100)}%`;});
            urls.splice(0).forEach(url=>URL.revokeObjectURL(url));const output=document.querySelector('#results');output.replaceChildren();
            for(const plan of result){
                const section=document.createElement('section'),title=document.createElement('h2'),text=document.createElement('p');title.textContent=plan.label;
                text.textContent=`Same notes · ${plan.seconds.toFixed(1)} seconds · level adjustment ${(20*Math.log10(plan.gain||1)).toFixed(1)} dB`;
                const audio=document.createElement('audio');audio.controls=true;audio.loop=true;audio.preload='metadata';audio.src=URL.createObjectURL(plan.blob);urls.push(audio.src);
                audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio&&!other.paused){audio.currentTime=Math.min(other.currentTime,Number.isFinite(audio.duration)?audio.duration:other.currentTime);other.pause();}}));
                const link=document.createElement('a');link.href=audio.src;link.download=`piano-${options.patch}-${plan.label.replaceAll('/','-')}.wav`;link.textContent='Save WAV';const canvas=document.createElement('canvas');drawNotes(canvas,plan,options.ensemble&&options.pattern==='music'?['pad','bass','lead','counter','perc']:[options.role]);section.append(title,text,audio,link,canvas);output.append(section);
            }
            status.textContent='Ready: four bars on the same notes. Switching players keeps the listening position.';
        }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
    });
}
