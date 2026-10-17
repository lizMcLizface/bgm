import { notesInRange, pentatonicOf } from '../arranger';
import { resolveMelody } from './resolution';
import { tieMelody } from './rhythmGrammar';
import { seeded } from '../random';
const nearest=(notes,target)=>notes.reduce((best,n)=>Math.abs(n-target)<Math.abs(best-target)?n:best);
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
export const PHRASE_BEAM=24;

/** Joint, bounded search through the remaining notes of a known phrase. */
export function searchPhrase({bars,range,settings,previousMidi,seed,closing=true}) {
    const stages=[];
    bars.forEach((bar,bi)=>{
        const pcs=settings.leadScale==='pentatonic'?pentatonicOf(bar.scalePcs):bar.scalePcs;
        const allowed=notesInRange(pcs,...range),tonic=nearest(notesInRange([pcs[0]],range[0]-12,range[1]+12),(range[0]+range[1])/2-3);
        const anchor=pcs[0]+12*Math.floor(tonic/12);
        bar.notes.forEach((note,ni)=>{
            const degree=note.degree,index=((degree%pcs.length)+pcs.length)%pcs.length;
            const target=clamp(anchor+(pcs[index]-pcs[0]+12)%12+12*Math.floor(degree/pcs.length),...range);
            const end=(closing&&bi===bars.length-1||bar.midpoint)&&ni===bar.notes.length-1;
            const endingPcs=(bar.midpoint||settings.leadEnding==='open')?[bar.chord.pitchClasses[2],bar.scalePcs[1]]:bar.chord.pitchClasses.slice(0,2);
            const endings=allowed.filter(n=>endingPcs.includes(n%12));
            const pool=end&&endings.length?endings:allowed;
            stages.push({bi,ni,note,target,pool,chord:bar.chord.pitchClasses,tension:bar.tension});
        });
    });
    if(!stages.length)return {bars:bars.map(b=>({bar:b.bar,events:[]})),score:0,destination:null,beamWidth:PHRASE_BEAM};
    const destination=stages.at(-1),goal=nearest(destination.pool,destination.target);
    let beam=[{score:0,last:previousMidi,motion:0,run:0,pitches:[]}];
    stages.forEach((stage,index)=>{
        const remaining=stages.length-index-1,paths=[];
        const candidates=[...stage.pool].sort((a,b)=>Math.abs(a-stage.target)-Math.abs(b-stage.target)||a-b).slice(0,7);
        for(const path of beam)for(const midi of candidates){
            const motion=midi-path.last,leap=Math.abs(motion),run=motion===0?path.run+1:0;
            const prior=stages[index-1],direction=prior?Math.sign(stage.note.degree-prior.note.degree):0;
            const contour=direction&&motion&&Math.sign(motion)!==direction?.8:0;
            const recovery=Math.abs(path.motion)>4&&motion&&Math.sign(motion)===Math.sign(path.motion)?1.5:0;
            const reach=closing?Math.max(0,Math.abs(midi-goal)-remaining*2)*.4:0;
            const chordCost=stage.tension===undefined?3:4-stage.tension*2;
            const score=path.score+Math.abs(midi-stage.target)*.65+(stage.note.accent&&!stage.chord.includes(midi%12)?chordCost:0)
                +Math.max(0,leap-(3+(settings.leadLeaps??.5)*6))*.9+leap*.08+contour+recovery+Math.max(0,run-1)*.7+reach;
            paths.push({score,last:midi,motion,run,pitches:[...path.pitches,midi]});
        }
        // Preserve different destinations/directions rather than many duplicate prefixes.
        const seen=new Map();beam=paths.sort((a,b)=>a.score-b.score||a.last-b.last).filter(path=>{
            const key=path.last+'/'+Math.sign(path.motion)+'/'+Math.min(2,path.run),count=seen.get(key)||0;seen.set(key,count+1);return count<2;
        }).slice(0,PHRASE_BEAM);
    });
    const good=beam.filter(path=>path.score<=beam[0].score+.75),rng=seeded(seed^0x1f83d9ab),chosen=good[Math.floor(rng()*good.length)];
    const output=bars.map(b=>({bar:b.bar,events:[]}));
    stages.forEach((stage,index)=>{const notes=bars[stage.bi].notes,note=stage.note;
        output[stage.bi].events.push({role:'lead',midi:chosen.pitches[index],beat:note.beat,
            length:Math.min(note.length,stage.ni+1<notes.length?notes[stage.ni+1].beat-note.beat:note.length)*.94,
            velocity:(note.accent?.67:.55)*(.96+Math.sin((stage.ni+1)/(notes.length+1)*Math.PI)*.08)});
    });
    return {bars:output,score:chosen.score,destination:{bar:bars.at(-1).bar,midi:chosen.pitches.at(-1),closing},beamWidth:PHRASE_BEAM};
}

/** Reuse the chosen path only while its remaining musical context agrees. */
export function planPhraseMelody(options,previous) {
    const signature=JSON.stringify([options.seed,options.range,options.settings.leadScale,options.settings.leadEnding,options.settings.leadLeaps,options.closing,!!options.resolveNotes,!!options.rhythmGrammar,options.meter,options.settings.leadDensity]);
    const stages=options.bars.map(b=>({bar:b.bar,bpm:b.bpm,...(b.tension===undefined?{}:{tension:b.tension}),midpoint:!!b.midpoint,chord:{pitchClasses:b.chord.pitchClasses},scalePcs:b.scalePcs,notes:b.notes}));
    const from=stages[0].bar,remaining=previous?.stages?.filter(b=>b.bar>=from);
    const priorEvents=previous?.bars?.filter(b=>b.bar<from).flatMap(b=>b.events);
    const expected=priorEvents?.length?priorEvents.at(-1).midi:previous?.previousMidi;
    if(previous?.signature===signature&&expected===options.previousMidi&&JSON.stringify(remaining)===JSON.stringify(stages))return previous;
    const raw=searchPhrase({...options,bars:stages});
    const resolved=options.resolveNotes?resolveMelody(raw,{...options,bars:stages,pending:previous?.resolutions}):raw;
    const planned=options.rhythmGrammar?tieMelody(resolved,{...options,bars:stages,pending:previous?.ties}):resolved;
    return {signature,stages,previousMidi:options.previousMidi,...planned};
}
