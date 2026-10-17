import { SCENES,sceneSlug } from '../src/app/scenes';
import { sectionOptions } from './sectionReview';
import { previewEnsemble,renderEnsemble,matchAverageLevels,drawNotes } from './ensembleReview';
import { comparisonPlayheads } from './comparisonPlayhead';
const roles=['lead','counter','pad','bass','perc'];
export function developmentOptions(options,enhanced) {
    const scope=options.scope??'all';
    return sectionOptions({...options,sectionDevelopment:true,sectionCadences:true,sectionBridges:true,harmonicRhythm:true,
        transitionGestures:true,leadTransitions:true,leadPickups:true,sectionSuspensions:true,
        formStrategies:scope==='form'||scope==='all'?enhanced:true,
        sectionCurves:scope==='form'?false:scope==='curves'||scope==='all'?enhanced:true,
        harmonicDevelopment:['form','curves'].includes(scope)?false:scope==='harmony'||scope==='all'?enhanced:true,
        endingDevelopment:scope==='ending'||scope==='all'?enhanced:true,formStrategy:options.strategy,
        ...(scope==='ending'?{endingAt:options.bars-3}:{})});
}
export const inspectDevelopment=(options,enhanced=true)=>previewEnsemble(developmentOptions(options,enhanced));
const form=document.querySelector('#development-review');
const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const entries=plan=>plan.bars.filter((b,i)=>!b.ending&&b.section?.start===b.bar||b.ending&&!plan.bars[i-1]?.ending);
let playback,urls=[];
function sectionStrip(plan){
    const strip=element('div');strip.className='sections';
    const spans=[];for(const b of plan.bars){const type=b.ending?'ending':b.section?.type??'off',key=b.ending?'ending':b.section?.start??'off';
        if(spans.at(-1)?.key===key&&spans.at(-1)?.type===type)spans.at(-1).count++;else spans.push({key,start:b.bar,type,count:1});}
    for(const s of spans){const e=element('span',`${s.type} ${s.start+1}–${s.start+s.count}`);e.className=s.type;e.style.width=`${s.count/plan.bars.length*100}%`;strip.append(e);}
    return strip;
}
function display(plan,title,parts){
    const root=element('section');root.append(element('h2',title),sectionStrip(plan));
    root.append(element('p',`${(plan.seconds/60).toFixed(1)} minutes · ${entries(plan).length} section / ending entrances${plan.gain===undefined?'':` · level adjustment ${(20*Math.log10(plan.gain||1)).toFixed(1)} dB`}`));
    let audio;if(plan.blob){const url=URL.createObjectURL(plan.blob);urls.push(url);audio=element('audio');audio.controls=true;audio.src=url;root.append(audio);const a=element('a','Save WAV');a.href=url;a.download=`development-${plan.enhanced?'new':'previous'}-${plan.seed}.wav`;root.append(a);}
    const charts=[];for(let at=0;at<plan.bars.length;at+=16){const bars=plan.bars.slice(at,at+16),offset=bars[0].start,seconds=bars.at(-1).start+bars.at(-1).seconds-offset;
        const chart=element('canvas');drawNotes(chart,{...plan,seconds,bars:bars.map(b=>({...b,start:b.start-offset}))},parts);root.append(chart);charts.push({canvas:chart,offset,seconds});}
    if(audio)for(const chart of charts){const bars=plan.bars.filter(b=>b.start>=chart.offset&&b.start<chart.offset+chart.seconds).map(b=>({...b,start:b.start-chart.offset}));playback.add(audio,chart.canvas,{bars,seconds:chart.seconds},{start:chart.offset});}
    const detail=element('details'),table=element('table'),head=element('tr');detail.append(element('summary','Section decisions and harmonic destinations'));for(const label of ['Bars','Section / strategy','Next / orchestration','Tension / subdivision'])head.append(element('th',label));table.append(head);
    for(const b of entries(plan)){const s=b.ending?null:b.section,m=s?plan.bars.filter(x=>x.section?.start===s.start).map(x=>x.section?.motion).filter(Boolean):[];const range=key=>m.length?`${Math.min(...m.map(x=>x[key]??0)).toFixed(2)}–${Math.max(...m.map(x=>x[key]??0)).toFixed(2)}`:'—';const row=element('tr');
        for(const t of [s?`${b.bar+1}–${s.start+s.bars}`:`${b.bar+1}`,s?`${s.type} / ${s.strategy}`:'ending',s?`${s.nextType} / ${s.orchestration??'previous'}`:'tonic → tail',`${range('tension')} / ${range('subdivision')}`])row.append(element('td',t));table.append(row);}
    for(const b of plan.bars.filter(b=>b.cadence?.kind==='phrase-destination'&&b.bar===b.cadence.arrivalBar)){const row=element('tr');for(const t of [b.bar+1,b.chord,b.cadence.reason,'interior harmonic destination'])row.append(element('td',t));table.append(row);}
    const scroll=element('div');scroll.className='scroll';scroll.append(table);detail.append(scroll);root.append(detail);return root;
}
if(form){
    for(const scene of SCENES.filter(s=>s.settings.playMusic!==false)){const o=element('option',scene.name);o.value=sceneSlug(scene.name);form.elements.preset.append(o);}
    const defaults={preset:'rainy-cafe',seed:'42',bars:'32',mode:'strong',phrases:'2',scope:'all',strategy:'auto'},q=new URLSearchParams(location.search);
    for(const [k,v]of Object.entries(defaults)){form.elements[k].value=q.get(k)||v;if(!form.elements[k].value)form.elements[k].value=v;}
    form.addEventListener('submit',async e=>{e.preventDefault();const options=Object.fromEntries(Object.keys(defaults).map(k=>[k,form.elements[k].value]));options.seed=Math.max(0,Math.min(2147483647,Math.floor(Number(options.seed)||0)));options.bars=Number(options.bars);options.phrases=Number(options.phrases);options.parts=roles.filter(r=>form.elements[r].checked);
        const status=document.querySelector('#status'),buttons=[...form.querySelectorAll('button')];if(!options.parts.length){status.textContent='Select a part.';return;}history.replaceState(null,'',location.pathname+'?'+new URLSearchParams(Object.fromEntries(Object.keys(defaults).map(k=>[k,options[k]]))));buttons.forEach(b=>b.disabled=true);document.querySelectorAll('audio').forEach(a=>a.pause());
        try{const render=e.submitter?.value==='render',plans=[];for(const enhanced of [false,true]){let active=true;try{const p=developmentOptions(options,enhanced),plan=render?await renderEnsemble(p,n=>{if(active)status.textContent=`Rendering ${enhanced?'new':'previous'} ${Math.round(n*100)}%`;}):previewEnsemble(p);plans.push({...plan,enhanced});}finally{active=false;}}
            const pair=render?await matchAverageLevels(plans,form.elements.match.checked):plans;playback?.dispose();playback=comparisonPlayheads();urls.forEach(URL.revokeObjectURL);urls=[];
            const first=pair[1].bars.find((b,i)=>!b.ending&&!pair[0].bars[i].ending&&(b.section?.type!==pair[0].bars[i].section?.type||b.section?.bars!==pair[0].bars[i].section?.bars));
            const summary=element('p',`${options.scope}: ${entries(pair[0]).length} → ${entries(pair[1]).length} section / ending entrances. ${pair[1].bars.filter((b,i)=>JSON.stringify(b.events.filter(e=>options.parts.includes(e.role)))!==JSON.stringify(pair[0].bars[i].events.filter(e=>options.parts.includes(e.role)))).length} of ${options.bars} bars have changed selected-part events. ${first?`First form difference at bar ${first.bar+1}: ${pair[0].bars[first.bar].section?.type} (${pair[0].bars[first.bar].section?.bars} bars) → ${first.section?.type} (${first.section?.bars} bars).`:'Section order and lengths are identical.'} Inspect each plan's decisions below.`);summary.className='difference-summary';
            const overview=element('div');overview.className='plan-overview';for(const [i,plan]of pair.entries())overview.append(element('p',i?'Developed section plan':'Previous section plan'),sectionStrip(plan));
            document.querySelector('#results').replaceChildren(summary,overview,display(pair[0],'Previous layer',options.parts),display(pair[1],'Developed layer',options.parts));status.textContent=`Ready: ${options.bars} bars per version.${render?' Switching players keeps position.':''}`;
        }catch(error){status.textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}
    });
}
