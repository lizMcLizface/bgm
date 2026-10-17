import { seeded, pick } from '../random';
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));

/** Retain statements/returns; choose a small vocabulary for answers/development. */
export function planDevelopment({seed,phrase,density=0}) {
    const rng=seeded(seed^Math.imul(phrase.start+1,0x510e527f));
    const busy=density>.45,operations=['identity','identity','identity','identity'];
    if(phrase.role==='contrast') {
        operations.splice(0,4,'mirror','displace','fragment','augment');
    } else if(phrase.role==='answer') {
        operations[2]=pick(rng,['displace','fragment']);
        operations[3]=pick(rng,['augment','extend']);
    } else if(phrase.role==='development') {
        operations[0]=pick(rng,['fragment','sequence']);
        operations[1]=pick(rng,['sequence','augment']);
        operations[2]=pick(rng,busy?['displace','diminish','ornament']:['displace','fragment']);
        operations[3]=pick(rng,['extend','augment']);
    }
    if(phrase.bars===8){
        const answer=phrase.role==='contrast'?['fragment','mirror','displace','extend']:phrase.role==='development'?['sequence','fragment',busy?'ornament':'displace','augment']
            :phrase.role==='recollection'?['identity','identity','identity','identity']
            :['identity','identity',pick(rng,['fragment','displace']),'extend'];
        // Keep the return's opening intact; vary only its second half.
        operations.push(...answer);
    }
    if(['gradual','speech','ostinato'].includes(phrase.strategy)){
        for(let i=0;i<operations.length;i++){
            if(phrase.strategy==='ostinato')operations[i]=i%4===3&&phrase.role==='development'?'displace':'identity';
            else if(['diminish','ornament','mirror','sequence'].includes(operations[i]))operations[i]='augment';
        }
    }
    return {start:phrase.start,operations,interval:pick(rng,[-1,1]),density:clamp(density,0,1)};
}

/** Transform copies of scale-degree motifs, before harmonic pitch realisation. */
export function developTheme(notes,{operation='identity',meter,interval=1,density=0}) {
    let out=notes.map(note=>({...note}));
    if(!out.length)return out;
    if(operation==='mirror'){const anchor=out[0].degree;out=out.map(note=>({...note,degree:anchor-clamp(note.degree-anchor,-4,4)}));}
    if(operation==='fragment')out=out.slice(0,Math.max(1,Math.ceil(out.length*.5)));
    if(operation==='sequence')out=out.map(note=>({...note,degree:note.degree+interval}));
    if(operation==='augment')out=out.map(note=>({...note,beat:note.beat*2,length:note.length*2}));
    if(operation==='diminish'&&density>.45)out=out.map(note=>({...note,beat:note.beat*.5,length:note.length*.5}));
    if(operation==='displace')out=out.map(note=>({...note,beat:note.beat+meter.unitsPerBeat*.5}));
    if(operation==='extend'){
        out=out.slice(0,Math.max(1,Math.ceil(out.length*.75)));
        out[out.length-1].length=meter.units-out[out.length-1].beat;
    }
    if(operation==='ornament'&&density>.45&&out.length<16){
        const at=out.findIndex((note,i)=>i>0&&note.length>=meter.unitsPerBeat*.5);
        if(at>=0){const note=out[at],half=note.length*.5;
            out.splice(at,1,{...note,length:half},{...note,beat:note.beat+half,length:half,degree:note.degree+interval,accent:false});}
    }
    out=out.filter(note=>note.beat>=0&&note.beat<meter.units).sort((a,b)=>a.beat-b.beat);
    return out.map((note,i)=>({...note,length:Math.min(note.length,meter.units-note.beat,i+1<out.length?out[i+1].beat-note.beat:Infinity)})).filter(note=>note.length>0);
}
