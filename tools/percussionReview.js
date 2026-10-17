import DrumKit from '../src/app/engine/drumKit';
import { DRUMS, DRUM_STYLES, defaultDrumKit, drumBar, loosenDrums } from '../src/app/percussion';
import { drumBarLatest, loosenDrumsLatest } from '../src/app/composition/percussionLatest';
import { METERS, unitsPerMinute, swingEvents } from '../src/app/meter';
import { performEnsemble } from '../src/app/composition/ensembleRhythm';

export function reviewEvents({ mode='latest', style='lofi', meter='4/4', groove=0, seed=42, bpm=80, embellish=false, swing=0, timing=0, bars=4, kit='felt', activity=.6, variation=.5, sprinkle=.35, instrumentTiming=false }={}) {
    const geometry=METERS[meter], unitSeconds=60/unitsPerMinute(geometry,bpm);
    const planned=Array.from({length:bars},(_,bar)=>{
        const args={bar,meter:geometry,drums:{style,activity,variation:embellish ? variation : 0,sprinkle:embellish ? sprinkle : 0,kit},
            section:null,sectionsMode:'off',phraseStart:bar-bar%4,seed,grooveIndex:groove,embellish};
        const events=(mode==='legacy'?drumBar:drumBarLatest)(args);
        swingEvents(events,geometry,swing);
        if (instrumentTiming && mode !== 'legacy') performEnsemble(events,{timing,velocity:0},unitSeconds,seed,bar,geometry,{profiles:{}});
        else (mode==='legacy'?loosenDrums:loosenDrumsLatest)(events,{timing,velocity:0},unitSeconds,seed,bar,geometry);
        return events;
    });
    return {planned,unitSeconds,barSeconds:geometry.units*unitSeconds,mode,style,meter,groove,seed,bpm,embellish,swing,timing,kit};
}

export async function renderReview(options) {
    const plan=reviewEvents(options),rate=44100;
    const ctx=new OfflineAudioContext(2,Math.ceil((plan.barSeconds*plan.planned.length+1)*rate),rate);
    const kit=new DrumKit({context:ctx});
    kit.scheduleSleep=()=>{};
    kit.setKit({...defaultDrumKit(),room:0});kit.connect(ctx.destination);
    try {
        plan.planned.forEach((events,bar)=>events.forEach(e=>kit.scheduleNote(e.midi,.05+bar*plan.barSeconds+e.beat*plan.unitSeconds,e.length*plan.unitSeconds,e.velocity,e.detune)));
        return {buffer:await ctx.startRendering(),plan};
    } finally {kit.dispose();}
}

export function waveBytes(buffer) {
    const channels=buffer.numberOfChannels,size=buffer.length*channels*2,bytes=new Uint8Array(44+size),v=new DataView(bytes.buffer);
    const text=(offset,s)=>[...s].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
    text(0,'RIFF');v.setUint32(4,36+size,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);
    v.setUint16(22,channels,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*channels*2,true);
    v.setUint16(32,channels*2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,size,true);
    const data=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));
    for(let i=0;i<buffer.length;i++)for(let c=0;c<channels;c++)v.setInt16(44+(i*channels+c)*2,Math.round(Math.max(-1,Math.min(1,data[c][i]))*32767),true);
    return bytes;
}

const form=document.querySelector('#review');
if(form) {
    for(const [name,values]of [['style',DRUM_STYLES],['meter',Object.fromEntries(Object.entries(METERS).map(([id,m])=>[id,m.label]))]]) {
        const select=form.elements[name];
        for(const [id,label]of Object.entries(values))if(id!=='off')select.add(new Option(label,id));
    }
    form.elements.style.value='lofi';form.elements.meter.value='4/4';
    const options=()=>({mode:form.elements.mode.value,style:form.elements.style.value,meter:form.elements.meter.value,
        groove:Number(form.elements.groove.value),seed:Number(form.elements.seed.value),bpm:Number(form.elements.bpm.value),
        embellish:form.elements.embellish.checked,swing:Number(form.elements.swing.value),timing:Number(form.elements.timing.value)});
    const draw=()=>{
        form.elements.groove.disabled=form.elements.mode.value==='legacy';
        const plan=reviewEvents(options()),output=document.querySelector('#grid');
        output.textContent=plan.planned.map((events,bar)=>`Bar ${bar+1}\n`+DRUMS.filter((_,id)=>events.some(e=>e.midi===id))
            .map(name=>name.padEnd(8)+' '+events.filter(e=>DRUMS[e.midi]===name).map(e=>`${e.beat.toFixed(2)}${e.anchor?'*':''}`).join('  ')).join('\n')).join('\n\n');
    };
    form.addEventListener('change',draw);draw();
    let url;
    form.addEventListener('submit',async event=>{
        event.preventDefault();const button=form.querySelector('button');button.disabled=true;
        document.querySelector('#status').textContent='Rendering four bars…';
        try {
            const {buffer}=await renderReview(options());
            if(url)URL.revokeObjectURL(url);
            url=URL.createObjectURL(new Blob([waveBytes(buffer)],{type:'audio/wav'}));
            const audio=document.querySelector('audio');audio.src=url;
            const link=document.querySelector('#save');link.href=url;link.download=`${options().mode}-${options().style}-${options().meter.replace('/','-')}.wav`;link.hidden=false;
            document.querySelector('#status').textContent='Ready. Listen here or save the WAV.';
            await audio.play();
        }catch(error){document.querySelector('#status').textContent=error.message;}
        finally{button.disabled=false;}
    });
}
