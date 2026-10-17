import { reviewEvents, renderReview, waveBytes } from './percussionReview';
import { DRUMS, DRUM_STYLES } from '../src/app/percussion';
import { METERS } from '../src/app/meter';
import { matchAverageLevels } from './ensembleReview';
import { comparisonPlayheads } from './comparisonPlayhead';

export function auditVariants(options) {
    const base={...options,mode:'latest',embellish:false,timing:0,swing:0};
    return options.compare==='kit' ? [{...base,kit:'felt',label:'Felt mapping'},{...base,kit:'crisp',label:'Crisp mapping'}]
        :options.compare==='timing' ? [{...base,label:'Exact timing'},{...base,timing:options.timing,instrumentTiming:true,label:'Instrument timing'}]
        :[{...base,label:'Core groove'},{...base,embellish:true,variation:1,sprinkle:1,label:'Variation and fills'}];
}
export async function renderAudit(options) {
    const results=[];
    for(const variant of auditVariants(options)){
        const {buffer,plan}=await renderReview(variant),m=METERS[options.meter];
        results.push({label:variant.label,blob:new Blob([waveBytes(buffer)],{type:'audio/wav'}),seconds:plan.barSeconds*plan.planned.length,
            bars:plan.planned.map((events,bar)=>({bar,start:bar*plan.barSeconds,seconds:plan.barSeconds,units:m.units,unitsPerBeat:m.unitsPerBeat,events}))});
    }
    return matchAverageLevels(results);
}
export function drawDrums(canvas,plan){
    const used=DRUMS.filter((_,midi)=>plan.bars.some(b=>b.events.some(e=>e.midi===midi))),left=90,usable=1000;
    canvas.width=1100;canvas.height=40+used.length*30;const c=canvas.getContext('2d');
    c.fillStyle='#171b20';c.fillRect(0,0,canvas.width,canvas.height);c.font='12px system-ui';
    used.forEach((name,i)=>{c.fillStyle='#b8c2cd';c.fillText(name,4,46+i*30);});
    for(const b of plan.bars){const x=left+b.start/plan.seconds*usable;c.strokeStyle='#46505b';c.beginPath();c.moveTo(x,0);c.lineTo(x,canvas.height);c.stroke();c.fillStyle='#c6ced7';c.fillText('Bar '+(b.bar+1),x+3,15);
        for(const e of b.events){c.fillStyle=e.anchor?'#9bc8ff':'#dfae73';c.fillRect(left+(b.start+e.beat/b.units*b.seconds)/plan.seconds*usable,30+used.indexOf(DRUMS[e.midi])*30,4,18);}
    }
}
const form=document.querySelector('#percussion-audit');let playback,urls=[];
if(form){
    for(const [id,label]of Object.entries(DRUM_STYLES))if(id!=='off')form.elements.style.add(new Option(label,id));
    for(const [id,m]of Object.entries(METERS))form.elements.meter.add(new Option(m.label,id));
    const defaults={style:'lofi',meter:'4/4',groove:'0',seed:'42',bpm:'88',bars:'8',compare:'layers',timing:'20',kit:'felt'},query=new URLSearchParams(location.search);
    for(const [key,value]of Object.entries(defaults))form.elements[key].value=query.get(key)||value;
    form.addEventListener('submit',async event=>{
        event.preventDefault();const button=form.querySelector('button'),status=document.querySelector('#status');button.disabled=true;status.textContent='Rendering audit pair…';
        const options=Object.fromEntries(Object.keys(defaults).map(key=>[key,['style','meter','compare','kit'].includes(key)?form.elements[key].value:Number(form.elements[key].value)]));
        history.replaceState(null,'',location.pathname+'?'+new URLSearchParams(options));document.querySelectorAll('audio').forEach(a=>a.pause());
        try{const plans=await renderAudit(options);playback?.dispose();playback=comparisonPlayheads();urls.forEach(URL.revokeObjectURL);urls=[];const output=document.querySelector('#results');output.replaceChildren();
            for(const plan of plans){const section=document.createElement('section'),title=document.createElement('h2'),audio=document.createElement('audio'),canvas=document.createElement('canvas'),link=document.createElement('a');
                title.textContent=plan.label;audio.controls=true;audio.loop=true;audio.src=URL.createObjectURL(plan.blob);urls.push(audio.src);link.href=audio.src;link.download='percussion-'+options.style+'-'+options.meter.replace('/','-')+'-'+plan.label+'.wav';link.textContent='Save WAV';section.append(title,audio,link,canvas);output.append(section);drawDrums(canvas,plan);playback.add(audio,canvas,plan,{offset:.05,left:90});
                const details=document.createElement('details'),summary=document.createElement('summary'),grid=document.createElement('pre');summary.textContent='Labelled events (* = structural anchor)';grid.textContent=plan.bars.map(b=>'Bar '+(b.bar+1)+'\n'+b.events.map(e=>DRUMS[e.midi]+' '+e.beat.toFixed(2)+(e.anchor?'*':'')).join(' · ')).join('\n\n');details.append(summary,grid);section.append(details);
            }status.textContent='Ready: play or seek either player; both charts share the vertical cursor. Click a chart to seek. Blue = anchors; amber = other hits.';
        }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
    });
}
