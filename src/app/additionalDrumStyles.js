// New groove families use logical drum roles; kit selection stays in the
// sound source. This module has no audio dependencies and never consumes
// the melodic arranger's random stream.
import {seeded} from './random';
import {beatStarts} from './meter';

export const ADDITIONAL_DRUM_STYLES = {
    bossa:'Bossa / light Latin', jazz:'Jazz lounge', broken:'Broken beat', ambient:'Ambient percussion', hand:'Hand-percussion groove',
};
export const DRUM_STYLE_NOTES = {
    bossa:'A two-bar clave with soft syncopated bass and shaker.',
    jazz:'Ride-led swing with triplet skips and restrained brush comping.',
    broken:'Displaced kicks and backbeats, with gaps between the hats.',
    ambient:'A sparse four-bar texture of isolated taps and swells, without a repeating backbeat.',
    hand:'Interlocking low and high hand-drum roles, wood and seed shaker. Try the Hand percussion voice.',
};
const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));
export function additionalDrumBar({bar,meter,drums,section,sectionsMode,sectionBars=16,phraseStart=bar-bar%4,phraseBars=4,
    seed=1,grooveIndex,embellish=true,rhythm,boundaries}, drumNames) {
    if(!Object.hasOwn(ADDITIONAL_DRUM_STYLES,drums.style))return null;
    if(boundaries?.phrase){phraseStart=boundaries.phrase.start;phraseBars=boundaries.phrase.bars;}
    if(section?.type==='intro'&&sectionsMode==='strong'&&(!section.form||bar-section.start<4))return [];
    if(section?.type==='breakdown'&&sectionsMode==='strong'&&!section.form)return [];
    const rng=seeded(Math.imul(seed^0x243f6a88,1664525)^Math.imul(bar+1,1013904223));
    const start=rhythm?.groove?.start??section?.start??Math.floor(bar/16)*16;
    const groove=grooveIndex??Math.floor(seeded(Math.imul(seed^0x510e527f,1664525)^Math.imul(start+1,1013904223))()*3);
    const variant=((groove%3)+3)%3, units=meter.units, unit=meter.unitsPerBeat, beats=beatStarts(meter);
    const sparse=Boolean(section&&section.type!=='full'), activity=clamp(drums.activity??.5),variation=clamp(drums.variation??.5);
    const energy=(sparse ? .78 : 1)*(section?.form ? section.energy : 1),events=[];
    const crisp={kick:'punch',brush:'snare',hat:'sizzle'};
    const hit=(name,beat,velocity,anchor=false,length=.22)=>{
        if(beat<0||beat>=units)return;
        const midi=drumNames.indexOf(drums.kit==='crisp'?(crisp[name]??name):name);if(midi<0)return;
        const level=clamp(velocity*energy);if(level<=0)return;
        const found=events.find(e=>e.midi===midi&&Math.abs(e.beat-beat)<1e-6);
        if(found){found.velocity=Math.max(found.velocity,level);found.anchor||=anchor;return;}
        events.push({role:'perc',midi,beat,length,velocity:level,anchor,detune:(rng()*2-1)*variation*.12});
    };
    // Preserve recognizable four-beat figures in 4/4; fit odd/compound bars
    // to their own grid rather than allowing hits to spill over the boundary.
    const at=(fraction,fine=false)=>Math.round(fraction*units/(unit===3?1:fine ? .25 : .5))*(unit===3?1:fine ? .25 : .5);
    const positions=(name,list,velocity,anchor=false,fine=false)=>list.slice(0,sparse?1:list.length).forEach((f,i)=>hit(name,at(f,fine),velocity*(i===0?1:.85),anchor));
    const shaker=level=>{for(let beat=0;beat<units;beat+=sparse?unit:unit===3?1:.5)hit('shaker',beat,level*(beats.includes(beat)?1:.6));};
    if(drums.style==='bossa'){
        const three=(bar+(variant===1?1:0))%2===0;
        const clave=three?(variant===2?[0,.25,.625]:[0,.375,.75]):[.25,.5];
        clave.slice(0,sparse?2:clave.length).forEach(f=>hit('rim',at(f),.29,true));
        positions('kick',[[0,.625],[0,.75],[0,.375]][variant],.4,true);
        if(!sparse)positions('brush',variant===1?[.375,.875]:[.125,.625],.19);
        shaker(.13);
    }else if(drums.style==='jazz'){
        beats.forEach((beat,i)=>{
            hit('ride',beat,i%2?.23:.19,true);
            if(!sparse&&((i+variant)%2===1||variant===2&&i===0))hit('ride',beat+unit*2/3,.15);
        });
        if(!sparse)positions('brush',[[.375,.875],[.25,.75],[.125,.625]][variant],.22);
        beats.filter((_,i)=>i%2===1).forEach(beat=>hit('hat',beat,.12));
        if(variant!==1)hit('kick',0,.24,true);
    }else if(drums.style==='broken'){
        positions('kick',[[0,.375,.875],[.125,.5],[0,.4375,.75]][variant],.5,true,true);
        positions(variant===1?'rim':'brush',[[.25,.6875],[.375,.875],[.3125,.8125]][variant],.34,true,true);
        if(!sparse)positions('hat',[[.125,.5,.875],[.25,.625,.875],[.125,.375,.625]][variant],.17,false,true);
    }else if(drums.style==='ambient'){
        const phase=(bar+variant)%4;
        if(!sparse||phase%2===0){
            if(phase===0)hit('swish',at(.125),.2,false,units*.45);
            if(phase===1)hit('rim',at(.625),.17);
            if(phase===2)hit('tom',at(.375),.23);
            if(phase===3)hit('ride',at(.25),.16);
        }
        // A colour budget, not a hidden hi-hat clock or generic drum fill.
        if(embellish&&!sparse&&activity>0&&rng()<activity*variation*.45)hit('shaker',at(.875),.1);
    }else if(drums.style==='hand'){
        positions('kick',[[0,.75],[.125,.5],[0,.625]][variant],.46,true);
        positions('brush',[[.375,.875],[.25,.75],[.375]][variant],.29,true);
        if(!sparse){positions('tom',[[.25,.625],[.375,.875],[.125,.5,.875]][variant],.31);if(variant===2)positions('rim',[.25,.75],.18);}
        shaker(.11);
    }
    if(embellish&&drums.style!=='ambient'&&!sparse&&!boundaries?.ending&&section?.transition!=='release'){
        const closing=bar-phraseStart===phraseBars-1;
        if(closing&&activity>.25&&rng()<activity*variation*.45){
            hit('tom',units-(unit===3?1:.5),.22,false,.2);
        }else if(rng()<activity*variation*.25){
            const answers=rhythm?.answers?.filter(t=>t>=0&&t<units);
            hit('rim',answers?.length?answers[Math.floor(rng()*answers.length)]:at(.875,true),.12);
        }
        if(rng()<clamp(drums.sprinkle??.35)*.08)hit('bell',at(.625),.1);
    }
    if(section?.form&&section.transition==='release'&&bar===section.start+(section.bars||sectionBars)-1){
        for(let i=events.length-1;i>=0;i--)if(!events[i].anchor&&events[i].beat>=units-unit)events.splice(i,1);
    }
    return events.sort((a,b)=>a.beat-b.beat||a.midi-b.midi);
}
