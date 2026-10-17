import { SCENES, sceneSlug } from '../src/app/scenes';
import { previewEnsemble, renderEnsemble, matchAverageLevels, drawNotes } from './ensembleReview';
const roles=['lead','counter','pad','bass','perc'];
export const contrastOptions=options=>({preset:options.preset,seed:options.seed,bars:options.bars,
    bass:'preset',pad:'preset',sections:false,straight:options.straight??true,activeLead:true,
    variant:'latest',coordinate:true,developForm:true,currentSounds:true,phrasePerformance:true,
    developThemes:true,phraseSearch:true,longPhrases:true,phraseLength:options.phraseBars??4,resolveNotes:true,contrastPhrases:options.contrastPhrases,leadRepeat:0,leadEnding:options.ending==='preset'?undefined:options.ending,leadDensity:options.density==='preset'?undefined:Number(options.density),
    parts:options.part==='all'?roles:options.part==='duet'?['lead','counter']:['lead']});
export const inspectContrast=options=>previewEnsemble(contrastOptions(options));
export async function renderContrasts(options,onProgress=()=>{}) {
    const plans=[];
    for(const contrastPhrases of [false,true]){
        const label=contrastPhrases?'Contrast and return':'Previous role cycle';
        const plan=await renderEnsemble(contrastOptions({...options,contrastPhrases}),n=>onProgress(label,n));
        plans.push({...plan,label});
    }
    return matchAverageLevels(plans);
}
const form=document.querySelector('#contrast-review'),urls=[];
if(form){
    for(const scene of SCENES.filter(s=>s.settings.playMusic!==false))form.elements.preset.add(new Option(scene.name,sceneSlug(scene.name)));
    const defaults={preset:'fireside-folk',seed:'42',bars:'16',density:'0.75',part:'lead',ending:'preset',phraseBars:'4'},query=new URLSearchParams(location.search);
    for(const [key,value] of Object.entries(defaults)){form.elements[key].value=query.get(key)||value;if(!form.elements[key].value)form.elements[key].value=value;}
    form.elements.straight.checked=query.get('straight')!=='false';
    form.addEventListener('submit',async event=>{
        event.preventDefault();const options=Object.fromEntries(Object.keys(defaults).map(key=>[key,['seed','bars','phraseBars'].includes(key)?Number(form.elements[key].value):form.elements[key].value]));options.straight=form.elements.straight.checked;
        const button=form.querySelector('button'),status=document.querySelector('#status');button.disabled=true;document.querySelectorAll('audio').forEach(a=>a.pause());history.replaceState(null,'',location.pathname+'?'+new URLSearchParams(options));
        try{
            const plans=await renderContrasts(options,(label,n)=>{status.textContent='Rendering '+label+' '+Math.round(n*100)+'%';});
            urls.splice(0).forEach(url=>URL.revokeObjectURL(url));const output=document.querySelector('#results');output.replaceChildren();
            for(const plan of plans){
                const section=document.createElement('section'),title=document.createElement('h2'),text=document.createElement('p');title.textContent=plan.label;text.textContent=plan.seconds.toFixed(1)+' seconds · level adjustment '+(20*Math.log10(plan.gain||1)).toFixed(1)+' dB';
                const audio=document.createElement('audio');audio.controls=true;audio.loop=true;audio.src=URL.createObjectURL(plan.blob);urls.push(audio.src);
                audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio&&!other.paused){audio.currentTime=Math.min(other.currentTime,Number.isFinite(audio.duration)?audio.duration:other.currentTime);other.pause();}}));
                const link=document.createElement('a');link.href=audio.src;link.download='contrast-'+options.preset+'-'+(plan.label.startsWith('Contrast')?'contrast':'previous')+'.wav';link.textContent='Save WAV';section.append(title,text,audio,link);
                for(let offset=0;offset<plan.bars.length;offset+=8){const bars=plan.bars.slice(offset,offset+8),start=bars[0].start,canvas=document.createElement('canvas');drawNotes(canvas,{bars:bars.map(b=>({...b,start:b.start-start})),seconds:bars.at(-1).start+bars.at(-1).seconds-start},options.part==='all'?roles:options.part==='duet'?['lead','counter']:['lead']);section.append(canvas);}
                const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Phrase roles and transformations';const table=document.createElement('table');
                const row=cells=>{const tr=document.createElement('tr');for(const cell of cells){const td=document.createElement('td');td.textContent=cell;tr.append(td);}return tr;};table.append(row(['Bar','Theme / phrase role','Transform','Lead attacks']));
                for(const b of plan.bars){const p=b.phrase,d=b.development;table.append(row([b.bar+1,p?String.fromCharCode(65+p.themeId)+' / '+p.role+' / '+p.bars+' bars':'—',d?d.operations[b.bar-d.start]:'identity',b.events.filter(e=>e.role==='lead').length]));}
                details.append(summary,table);section.append(details);output.append(section);
            }
            status.textContent='Ready: shared opening themes, a contrasting idea, then the main-theme return. Switching players keeps the listening position.';
        }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
    });
}
