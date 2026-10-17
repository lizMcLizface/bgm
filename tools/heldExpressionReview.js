import { findPreset } from '../src/app/editor/presetStore';
import { SCENES, sceneSlug } from '../src/app/scenes';
import { previewEnsemble, renderEnsemble, matchAverageLevels, drawNotes } from './ensembleReview';
import { developmentOptions } from './developmentReview';
import { comparisonPlayheads } from './comparisonPlayhead';

const roles=['lead','counter','pad','bass','perc'];
export const expressionOptions=(options,enabled)=>{
    const result={...developmentOptions({...options,mode:'gentle',phrases:2,scope:'all',strategy:'auto'},true),
        sections:false,activeLead:true,counterActive:true,parts:options.part==='all'?roles:[options.part],noteExpression:true,heldExpression:enabled};
    if(options.example==='held') {
        result.sounds={lead:{name:'Reed Lead',preset:{...findPreset('Reed Lead'),vibratoDepth:0}}};
        result.parts=['lead'];
        result.testNotes=[{label:'Held reed',events:[{role:'lead',midi:67,beat:0,length:3.5,velocity:.7}]},
            {label:'Held reed',events:[{role:'lead',midi:69,beat:0,length:3.5,velocity:.7}]}];
    }
    return result;
};
export function verifyPair(plans) {
    const written=p=>p.bars.map(b=>b.events.map(({expression,...e})=>e));
    if(JSON.stringify(written(plans[0]))!==JSON.stringify(written(plans[1])))throw Error('The written compositions differ.');
}
export function inspectExpression(options) {
    const plans=[false,true].map(enabled=>previewEnsemble(expressionOptions(options,enabled)));verifyPair(plans);return plans;
}
export async function renderExpression(options,onProgress=()=>{}) {
    const plans=[];for(const enabled of [false,true])plans.push(await renderEnsemble(expressionOptions(options,enabled),n=>onProgress(enabled,n)));
    verifyPair(plans);return matchAverageLevels(plans);
}
if(import.meta.env.DEV)window.__heldExpressionReview={inspectExpression,renderExpression};
const form=document.querySelector('#expression-review');
if(form){
    for(const scene of SCENES.filter(s=>s.settings.playMusic!==false))form.elements.preset.add(new Option(scene.name,sceneSlug(scene.name)));
    const defaults={preset:'rainy-cafe',seed:'42',bars:'8',part:'lead',example:'held'},query=new URLSearchParams(location.search);
    for(const [key,value]of Object.entries(defaults)){form.elements[key].value=query.get(key)||value;if(!form.elements[key].value)form.elements[key].value=value;}
    const syncPart=()=>{const held=form.elements.example.value==='held';if(held)form.elements.part.value='lead';form.elements.part.disabled=held;};
    form.elements.example.addEventListener('change',syncPart);syncPart();
    let playback,urls=[];
    form.addEventListener('submit',async event=>{
        event.preventDefault();const options=Object.fromEntries(Object.keys(defaults).map(key=>[key,['seed','bars'].includes(key)?Number(form.elements[key].value):form.elements[key].value]));
        options.seed=Math.max(0,Math.min(2147483647,Math.floor(options.seed)||0));
        const status=document.querySelector('#status'),buttons=[...form.querySelectorAll('button')],render=event.submitter?.value==='render';
        history.replaceState(null,'',location.pathname+'?'+new URLSearchParams(options));buttons.forEach(b=>b.disabled=true);document.querySelectorAll('audio').forEach(a=>a.pause());
        try{
            const plans=render?await renderExpression(options,(enabled,n)=>{status.textContent=`Rendering ${enabled?'expressive':'fixed'} ${Math.round(n*100)}%`;}):inspectExpression(options);
            playback?.dispose();playback=comparisonPlayheads();urls.forEach(URL.revokeObjectURL);urls=[];
            const output=document.querySelector('#results');output.replaceChildren();
            plans.forEach((plan,index)=>{
                const section=document.createElement('section'),title=document.createElement('h2'),text=document.createElement('p');
                title.textContent=index?'Breathing & delayed vibrato':'Existing articulation';
                const notes=plan.bars.flatMap(b=>b.events).filter(e=>options.part==='all'||e.role===options.part),expressed=notes.filter(e=>e.expression?.breathDepth);
                text.textContent=`${expressed.length} of ${notes.length} selected-part notes carry held expression. Same written pitches, timing, velocity and gate lengths.${render?' RMS adjustment '+(20*Math.log10(plan.gain||1)).toFixed(1)+' dB.':''}`;
                section.append(title,text);let audio;
                if(render){audio=document.createElement('audio');audio.controls=true;audio.src=URL.createObjectURL(plan.blob);urls.push(audio.src);const link=document.createElement('a');link.href=audio.src;link.download=`expression-${options.preset}-${index?'shaped':'fixed'}.wav`;link.textContent='Save WAV';section.append(audio,link);}
                const canvas=document.createElement('canvas');drawNotes(canvas,plan,options.part==='all'?roles:[options.part]);section.append(canvas);output.append(section);if(audio)playback.add(audio,canvas,plan);
                const details=document.createElement('details'),summary=document.createElement('summary'),table=document.createElement('table');summary.textContent='Per-note decisions';
                const row=values=>{const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}table.append(tr);};
                row(['Bar','Role / MIDI','Family','Breath depth','Vibrato (cents)','Delay (s)']);
                for(const b of plan.bars)for(const e of b.events.filter(e=>(options.part==='all'||e.role===options.part)&&e.expression)){const x=e.expression;row([b.bar+1,`${e.role} / ${e.midi}`,x.profile,x.breathDepth??0,x.vibratoDepth??0,x.vibratoDelay??'—']);}
                const scroll=document.createElement('div');scroll.style.overflowX='auto';scroll.append(table);details.append(summary,scroll);section.append(details);
            });
            status.textContent=`Ready: ${options.bars} bars per version. Written events match.${render?' Play either version; both playheads stay in sync.':''}`;
        }catch(error){status.textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}
    });
}
