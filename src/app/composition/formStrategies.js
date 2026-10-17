import PROGRESSIONS from '../progressions';
import { weighted } from '../random';

export const FORM_STRATEGIES = ['gradual', 'thematic', 'ostinato', 'cinematic', 'speech'];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function formStrategy(settings, override) {
    if(FORM_STRATEGIES.includes(override))return override;
    if((settings.leadActivity??.6)<=.2)return 'speech';
    const p=settings.padWeights??{},b=settings.bassWeights??{};
    if((p.sequence??0)>Math.max(p.sustain??0,p.arpeggio??0,p.pulse??0)
        ||(b.drive??0)>(b.whole??0)+(b.half??0)&&(settings.leadDensity??0)<.65)return 'ostinato';
    if((p.sustain??0)>=65&&(settings.bpm??72)<80&&settings.sectionTone)return 'cinematic';
    if((settings.leadDensity??0)<.2&&(settings.bpm??72)<70)return 'gradual';
    return 'thematic';
}

// Chord entrances and reference cycle closures are readiness cues, not a
// prediction of a future, undecided modulation. All choices are made on entry.
export function strategyDuration({strategy,type,base,bar,barsPerChord,settings,rng}) {
    const scale={gradual:{intro:1,build:1.5,full:2,breakdown:1.5},thematic:{intro:.5,build:1,full:1.5,breakdown:.75},
        ostinato:{intro:.5,build:1.25,full:2,breakdown:.75},cinematic:{intro:1,build:1.5,full:1,breakdown:1.25},
        speech:{intro:.5,build:1.5,full:2,breakdown:1.5}};
    const target=Math.max(4,base*4*scale[strategy][type]);
    const cycle=Math.max(1,(PROGRESSIONS[settings.progression]?.length??4)*barsPerChord);
    const candidates={};
    const maximum=type==='intro'?Math.max(4,Math.min(16,base*4)):Math.max(8,base*8);
    for(let bars=4;bars<=maximum+barsPerChord*4;bars+=4){
        if(bars>maximum&&Object.keys(candidates).length)break;
        if((bar+bars)%barsPerChord)continue;
        const aligned=(bar+bars)%cycle===0;
        candidates[bars]=Math.exp(-Math.abs(bars-target)/Math.max(4,target*.25))*(aligned?2:1);
    }
    return Number(weighted(rng,candidates));
}

export function strategyDestination({type,strategy,history,bar,bars,base,theme,rng,quickIntro}) {
    if(type==='intro')return quickIntro?'full':strategy==='speech'?'full':'build';
    if(type==='build')return 'full';
    if(type==='breakdown')return strategy==='cinematic'?'build':'full';
    if(history.at(-1)==='full')return 'breakdown';
    const gentle=strategy==='gradual'||strategy==='speech';
    const weights={full:gentle?1.4:strategy==='ostinato'?1:.25,build:strategy==='cinematic'?1:.2,breakdown:gentle?.45:1};
    // Long plateaus need relief; repeated routes lose weight. The theme cue
    // favours a contrasting passage after a secondary-theme development.
    if(bars>=base*6)weights.breakdown*=2;
    if(theme===1&&!gentle)weights.breakdown*=1.5;
    if(bar<base*8)weights.full*=1.2;
    for(const candidate of Object.keys(weights)){
        const repeats=history.slice(1).filter((s,i)=>history[i]===type&&s===candidate).length;
        weights[candidate]/=1+repeats*2;
    }
    return weighted(rng,weights);
}

export function developmentCurves(section) {
    const t=clamp(section.progress,0,1),s=t*t*(3-2*t),arch=Math.sin(Math.PI*t),type=section.type;
    const restrained=['gradual','speech'].includes(section.strategy);
    const tension=type==='build'?.2+.65*s:type==='breakdown'?.3-.2*s:type==='intro'?.1+.2*s:.35+.35*arch;
    const subdivision=restrained?.65:type==='build'?.7+.6*s:type==='breakdown'?.65:type==='intro'?.7:section.strategy==='ostinato'?1:1.15;
    return {tension:restrained?tension*.55:tension,subdivision,
        counterLevel:section.orchestration==='foreground'?.75:section.orchestration==='interlock'?1:.9,
        sustain:restrained?1.2:section.strategy==='cinematic'?1.3:1,
        energy:section.strategy==='cinematic'?.8+.2*arch:restrained?.93+.04*arch:1};
}

/** Alter only weak interior material before pitch/resolution planning. */
export function subdivideSection(notes,{motion,meter,protectedBeats=[],density=0,index=0}) {
    if(!motion?.subdivision||notes.length<3)return notes;
    const protectedAt=new Set(protectedBeats),out=notes.map(n=>({...n}));
    const eligible=(n,i)=>i>0&&i<out.length-1&&!n.accent&&!protectedAt.has(n.beat);
    if(motion.subdivision<.9){
        const at=out.findIndex((n,i)=>eligible(n,i)&&(i+index)%2===1);
        if(at>=0){const removed=out.splice(at,1)[0];out[at-1].length=Math.min(removed.beat+removed.length,out[at]?.beat??meter.units)-out[at-1].beat;}
    }else if(motion.subdivision>1.12&&density>.45){
        const at=out.findIndex((n,i)=>eligible(n,i)&&n.length>=meter.unitsPerBeat&&!protectedAt.has(n.beat+n.length*.5));
        if(at>=0){const n=out[at],half=n.length*.5;out.splice(at,1,{...n,length:half},{...n,beat:n.beat+half,length:half,degree:n.degree+(index%2?1:-1),accent:false});}
    }
    return out;
}
