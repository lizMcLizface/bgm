import { SCENES, sceneSlug, sceneSettings } from '../src/app/scenes';
import { SOUND_PROFILES, soundContext } from '../src/app/soundGenV3';
import { prepareSound } from '../src/app/engine/prepareSound';
import { renderEnsemble, matchAverageLevels, drawNotes } from './ensembleReview';

const roles=['pad','bass','lead','counter'];
export async function prepareSoundComparison(options) {
    const scene=SCENES.find(s=>sceneSlug(s.name)===options.preset);
    if(!scene)throw Error('Choose a musical preset.');
    const settings=sceneSettings(scene,options.seed);
    if(options.short) settings.leadDensity=1;
    const infos=Object.fromEntries(roles.map(role=>{
        const context=soundContext(settings,scene,role);
        if(options.profile!=='auto')context.profile=options.profile;
        if(options.short) context.gate=Math.max(.05,Math.round(context.gate*.4*20)/20);
        return [role,{role,ensemble:options.soundSeed,version:3,...context}];
    }));
    const variants=[];
    for(const mode of ['legacy','latest']) {
        const sounds=Object.fromEntries(await Promise.all(roles.map(async role=>[role,await prepareSound(infos[role],mode)])));
        variants.push({label:mode==='legacy'?'Previous generated':'Scene-aware generated',sounds,infos});
    }
    if(options.library)variants.push({label:'Library sounds',sounds:undefined});
    return variants;
}

export const soundReviewOptions = options => ({...options,variant:'latest',coordinate:true,developForm:true,
    sections:false,straight:false,activeLead:true,bass:'preset',pad:'preset',
    ...(options.short?{leadDensity:1}: {})});

const form=document.querySelector('#sounds'),urls=[];
if(form) {
    for(const scene of SCENES.filter(s=>s.settings.playMusic!==false))form.elements.preset.add(new Option(scene.name,sceneSlug(scene.name)));
    for(const profile of SOUND_PROFILES)form.elements.profile.add(new Option(profile[0].toUpperCase()+profile.slice(1),profile));
    const defaults={preset:'fireside-folk',profile:'auto',seed:'42',soundSeed:'12345',bars:'4'};
    const query=new URLSearchParams(location.search);
    for(const [key,value] of Object.entries(defaults)){form.elements[key].value=query.get(key)||value;if(!form.elements[key].value)form.elements[key].value=value;}
    form.addEventListener('submit',async event=>{
        event.preventDefault();const status=document.querySelector('#status'),button=form.querySelector('button');
        const options={preset:form.elements.preset.value,profile:form.elements.profile.value,seed:Math.max(0,Math.min(2147483647,Math.floor(Number(form.elements.seed.value)||0))),
            soundSeed:Math.max(0,Math.min(16777215,Math.floor(Number(form.elements.soundSeed.value)||0))),bars:Number(form.elements.bars.value),
            parts:[...roles,'perc'].filter(role=>form.elements[`hear-${role}`].checked),short:form.elements.short.checked,library:form.elements.library.checked};
        if(!options.parts.length){status.textContent='Choose at least one voice.';return;}
        history.replaceState(null,'',location.pathname+'?'+new URLSearchParams(Object.fromEntries(Object.keys(defaults).map(key=>[key,options[key]]))));
        button.disabled=true;document.querySelectorAll('audio').forEach(a=>a.pause());
        try {
            status.textContent='Preparing and levelling generated voices…';
            const variants=await prepareSoundComparison(options),rendered=[];
            let reference;
            for(const variant of variants) {
                status.textContent=`Rendering ${variant.label}…`;
                const plan=await renderEnsemble({...soundReviewOptions(options),sounds:variant.sounds},n=>{status.textContent=`Rendering ${variant.label} ${Math.round(n*100)}%`;});
                const fingerprint=JSON.stringify(plan.bars.map(b=>b.events));
                if(reference&&reference!==fingerprint)throw Error('Comparison note plans differ.');
                reference=fingerprint;rendered.push({...plan,...variant});
            }
            const results=await matchAverageLevels(rendered,form.elements.match.checked);
            urls.splice(0).forEach(url=>URL.revokeObjectURL(url));const output=document.querySelector('#results');output.replaceChildren();
            for(const result of results) {
                const section=document.createElement('section'),title=document.createElement('h2'),text=document.createElement('p');title.textContent=result.label;
                text.textContent=`Same notes · ${result.seconds.toFixed(1)} seconds · level adjustment ${(20*Math.log10(result.gain||1)).toFixed(1)} dB`;
                const audio=document.createElement('audio');audio.controls=true;audio.loop=true;audio.preload='metadata';audio.src=URL.createObjectURL(result.blob);urls.push(audio.src);
                audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio&&!other.paused){audio.currentTime=Math.min(other.currentTime,Number.isFinite(audio.duration)?audio.duration:other.currentTime);other.pause();}}));
                const link=document.createElement('a');link.href=audio.src;link.download=`sound-${options.preset}-${options.soundSeed}-${result.label.toLowerCase().replaceAll(' ','-')}.wav`;link.textContent='Save WAV';
                const canvas=document.createElement('canvas');drawNotes(canvas,result,options.parts);section.append(title,text,audio,link,canvas);
                if(result.infos){const details=document.createElement('details'),summary=document.createElement('summary'),table=document.createElement('table');summary.textContent='Voice context';
                    for(const [role,info] of Object.entries(result.infos)){const tr=document.createElement('tr');for(const value of [role,info.profile,`${info.bpm} BPM`,`${info.gate}s expected gate`,`MIDI ${info.register}`]){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);}details.append(summary,table);section.append(details);}
                output.append(section);
            }
            status.textContent=`Ready: ${options.bars} bars, music seed ${options.seed}, sound seed ${options.soundSeed}. Switching players keeps the listening position.`;
        }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
    });
}
