import { SCENES, sceneSlug } from '../src/app/scenes';
import { findPreset } from '../src/app/editor/presetStore';
import { stringPatch } from '../src/app/engine/stringPatches';
import { levelPreset } from '../src/app/engine/loudness';
import { renderEnsemble, matchAverageLevels, drawNotes } from './ensembleReview';

export async function renderStrings(options,onProgress=()=>{}) {
    const base=findPreset(options.patch);
    const physical={...stringPatch(options.patch,base),stringDecay:options.decay,stringDamping:options.damping,stringPosition:options.position,stringBody:options.body};
    const result=[];
    for(const [label,preset] of [['Oscillator',base],['Plucked string',physical]]) {
        const sound={name:label,preset:await levelPreset(preset,options.role)};
        const plan=await renderEnsemble({preset:options.preset,seed:options.seed,bars:4,bass:'preset',pad:'preset',sections:false,straight:true,activeLead:true,
            counterActive:options.role==='counter',variant:'latest',coordinate:true,developForm:true,
            parts:options.ensemble?['pad','bass','lead','counter','perc']:[options.role],sounds:{[options.role]:sound}},fraction=>onProgress(label,fraction));
        result.push({...plan,label});
    }
    if(JSON.stringify(result[0].bars.map(b=>b.events))!==JSON.stringify(result[1].bars.map(b=>b.events)))throw Error('Comparison note plans differ.');
    return matchAverageLevels(result);
}

const form=document.querySelector('#strings'),urls=[];
if(form) {
    for(const scene of SCENES.filter(s=>s.settings.playMusic!==false))form.elements.preset.add(new Option(scene.name,sceneSlug(scene.name)));
    const defaults={preset:'fireside-folk',patch:'Harp Pluck',role:'pad',seed:'42',decay:'2.5',damping:'.5',position:'.2',body:'.3'},query=new URLSearchParams(location.search);
    for(const [key,value] of Object.entries(defaults)){form.elements[key].value=query.get(key)||value;if(!form.elements[key].value)form.elements[key].value=value;}
    form.addEventListener('submit',async event=>{
        event.preventDefault();const options=Object.fromEntries(Object.keys(defaults).map(key=>[key,['preset','patch','role'].includes(key)?form.elements[key].value:Number(form.elements[key].value)]));options.ensemble=form.elements.ensemble.checked;
        const button=form.querySelector('button'),status=document.querySelector('#status');button.disabled=true;document.querySelectorAll('audio').forEach(a=>a.pause());
        history.replaceState(null,'',location.pathname+'?'+new URLSearchParams(Object.fromEntries(Object.keys(defaults).map(key=>[key,options[key]]))));
        try {
            const result=await renderStrings(options,(label,n)=>{status.textContent=`Rendering ${label} ${Math.round(n*100)}%`;});
            urls.splice(0).forEach(url=>URL.revokeObjectURL(url));const output=document.querySelector('#results');output.replaceChildren();
            for(const plan of result){
                const section=document.createElement('section'),title=document.createElement('h2'),text=document.createElement('p');title.textContent=plan.label;
                text.textContent=`Same notes · ${plan.seconds.toFixed(1)} seconds · level adjustment ${(20*Math.log10(plan.gain||1)).toFixed(1)} dB`;
                const audio=document.createElement('audio');audio.controls=true;audio.loop=true;audio.preload='metadata';audio.src=URL.createObjectURL(plan.blob);urls.push(audio.src);
                audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio&&!other.paused){audio.currentTime=Math.min(other.currentTime,Number.isFinite(audio.duration)?audio.duration:other.currentTime);other.pause();}}));
                const link=document.createElement('a');link.href=audio.src;link.download=`string-${options.patch}-${plan.label}.wav`;link.textContent='Save WAV';const canvas=document.createElement('canvas');drawNotes(canvas,plan,options.ensemble?['pad','bass','lead','counter','perc']:[options.role]);section.append(title,text,audio,link,canvas);output.append(section);
            }
            status.textContent='Ready: four bars on the same notes. Switching players keeps the listening position.';
        }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
    });
}
