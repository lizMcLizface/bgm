import { SCENES, sceneSlug } from '../src/app/scenes';
import { renderEnsemble, matchAverageLevels, drawNotes } from './ensembleReview';
const roles=['lead','counter','pad','bass','perc'];
export async function renderPerformance(options,onProgress=()=>{}) {
    const plans=[];
    for(const phrased of [false,true]) {
        const label=phrased?'Phrase performance':'Independent note variation';
        const plan=await renderEnsemble({preset:options.preset,seed:options.seed,bars:options.bars,bass:'preset',pad:'preset',
            sections:false,straight:false,activeLead:true,variant:'latest',coordinate:true,developForm:true,currentSounds:true,
            phrasePerformance:phrased,performanceVelocity:options.velocity,performanceTiming:options.timing,
            parts:options.part==='all'?roles:[options.part]},n=>onProgress(label,n));
        plans.push({...plan,label});
    }
    const identity=plan=>plan.bars.map(b=>b.events.map(e=>[e.role,e.midi,e.length]));
    if(JSON.stringify(identity(plans[0]))!==JSON.stringify(identity(plans[1])))throw Error('Comparison pitches or gates differ.');
    return matchAverageLevels(plans);
}

const form=document.querySelector('#performance-review'),urls=[];
if(form) {
    for(const scene of SCENES.filter(s=>s.settings.playMusic!==false))form.elements.preset.add(new Option(scene.name,sceneSlug(scene.name)));
    const defaults={preset:'rainy-cafe',seed:'42',bars:'8',velocity:'.12',timing:'15',part:'all'},query=new URLSearchParams(location.search);
    for(const [key,value] of Object.entries(defaults)){form.elements[key].value=query.get(key)||value;if(!form.elements[key].value)form.elements[key].value=value;}
    form.addEventListener('submit',async event=>{
        event.preventDefault();const options=Object.fromEntries(Object.keys(defaults).map(key=>[key,['preset','part'].includes(key)?form.elements[key].value:Number(form.elements[key].value)]));
        const button=form.querySelector('button'),status=document.querySelector('#status');button.disabled=true;document.querySelectorAll('audio').forEach(a=>a.pause());
        history.replaceState(null,'',location.pathname+'?'+new URLSearchParams(options));
        try {
            const plans=await renderPerformance(options,(label,n)=>{status.textContent='Rendering '+label+' '+Math.round(n*100)+'%';});
            urls.splice(0).forEach(url=>URL.revokeObjectURL(url));const output=document.querySelector('#results');output.replaceChildren();
            for(const plan of plans) {
                const section=document.createElement('section'),title=document.createElement('h2'),text=document.createElement('p');title.textContent=plan.label;
                text.textContent='Same pitches and gates · '+plan.seconds.toFixed(1)+' seconds · level adjustment '+(20*Math.log10(plan.gain||1)).toFixed(1)+' dB';
                const audio=document.createElement('audio');audio.controls=true;audio.loop=true;audio.src=URL.createObjectURL(plan.blob);urls.push(audio.src);
                audio.addEventListener('play',()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio&&!other.paused){audio.currentTime=Math.min(other.currentTime,Number.isFinite(audio.duration)?audio.duration:other.currentTime);other.pause();}}));
                const link=document.createElement('a');link.href=audio.src;link.download='performance-'+options.preset+'-'+(plan.label.startsWith('Phrase')?'phrase':'independent')+'.wav';link.textContent='Save WAV';
                const canvas=document.createElement('canvas');drawNotes(canvas,plan,options.part==='all'?roles:[options.part]);
                const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Dynamics by bar';const table=document.createElement('table');
                const row=cells=>{const tr=document.createElement('tr');for(const cell of cells){const td=document.createElement('td');td.textContent=cell;tr.append(td);}return tr;};
                table.append(row(['Bar','Phrase gesture','Lead velocity range / average']));
                for(const bar of plan.bars){const notes=bar.events.filter(e=>e.role==='lead'),values=notes.map(e=>e.velocity),p=bar.performance;
                    table.append(row([bar.bar+1,p?p.role+' · peak near bar '+(p.start+1+p.peak*p.bars).toFixed(1):'Independent',values.length?Math.min(...values).toFixed(2)+'–'+Math.max(...values).toFixed(2)+' / '+(values.reduce((a,b)=>a+b,0)/values.length).toFixed(2):'Rest']));}
                details.append(summary,table);section.append(title,text,audio,link,canvas,details);output.append(section);
            }
            status.textContent='Ready: identical pitches and gates. Switching players keeps the listening position.';
        }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
    });
}
