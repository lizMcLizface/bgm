import { FORM_STRATEGIES, formStrategy, strategyDuration, developmentCurves, subdivideSection } from './formStrategies';
import { planForm,formEnvelope,formSettings } from './formLatest';
import { planThemePhrase } from './arrangerLatest';
import { planDevelopment } from './themeDevelopment';
import { harmonicDurations } from './harmonicRhythm';
import { harmonicDestination } from './harmonicDestinations';
import { planBoundaries,prepareEnding } from './boundaries';
import { METERS } from '../meter';
import { seeded } from '../random';
import { defaultSettings } from '../settings';
import { SCENES,sceneSettings,sceneSlug } from '../scenes';

test('automatic strategies distinguish speech, ambient, cinematic, sequence and thematic scenes',()=>{
    for(const [preset,want] of [['open-mic-pad','speech'],['deep-night','gradual'],['replicant-blues','cinematic'],['oxygen-debt','ostinato'],['fireside-folk','thematic'],['boss-fight-politely','thematic']]){
        const s=SCENES.find(s=>sceneSlug(s.name)===preset);expect(formStrategy(sceneSettings(s,42))).toBe(want);
    }
    expect(formStrategy({},'ostinato')).toBe('ostinato');expect(FORM_STRATEGIES).toHaveLength(5);
});

test('duration and history produce distinct bounded forms with committed destinations and serialisable state',()=>{
    const traces=[];
    for(const strategy of FORM_STRATEGIES){const s=defaultSettings();s.sections={mode:'gentle',phrases:2};let form;
        const trace=[];for(let bar=0;bar<512;bar++){
            const next=planForm({bar,seed:42,sections:s.sections,settings:s,previous:form,formStrategies:true,sectionCurves:true,strategyOverride:strategy,barsPerChord:2});
            if(next.section.start===bar){if(form){expect(next.section.type).toBe(form.section.nextType);expect(next.section.start).toBe(form.section.start+form.section.bars);expect(next.section.brightnessStart).toBe(form.section.brightnessEnd);}
                expect(next.section.bars%4).toBe(0);expect(next.section.bars).toBeGreaterThanOrEqual(4);expect(next.section.bars).toBeLessThanOrEqual(16);trace.push(next.section.type+next.section.bars);}
            if(next.section.history.length>=2)expect([...next.section.history.slice(-2),next.section.type].every(t=>t==='full')).toBe(false);
            form=JSON.parse(JSON.stringify(next));
        }traces.push(trace.join('/'));
    }expect(new Set(traces).size).toBe(5);
    const options={strategy:'thematic',type:'full',base:4,bar:8,barsPerChord:4,settings:defaultSettings()};
    expect(strategyDuration({...options,rng:seeded(9)})).toBe(strategyDuration({...options,rng:seeded(9)}));
});

test('curves separate restrained texture from activity and protect source boundaries, accents and resolutions',()=>{
    expect(developmentCurves({strategy:'speech',type:'full',progress:.5}).subdivision).toBeLessThan(1);
    expect(developmentCurves({strategy:'thematic',type:'build',progress:1}).tension).toBeGreaterThan(developmentCurves({strategy:'thematic',type:'build',progress:0}).tension);
    for(const meter of Object.values(METERS)){
        const source=Array.from({length:4},(_,i)=>({beat:i*meter.units/4,length:meter.units/4,degree:i,accent:i===0}));
        for(const subdivision of [.65,1,1.3]){const out=subdivideSection(source,{motion:{subdivision},meter,density:1,protectedBeats:[source[1].beat]});
            expect(out[0]).toEqual(source[0]);expect(out.at(-1)).toEqual(source.at(-1));expect(out.find(n=>n.beat===source[1].beat)).toEqual(source[1]);
            expect(out.length).toBeGreaterThanOrEqual(source.length-1);expect(out.length).toBeLessThanOrEqual(source.length+1);
            out.forEach((n,i)=>{expect(n.length).toBeGreaterThan(0);expect(n.beat+n.length).toBeLessThanOrEqual(out[i+1]?.beat??meter.units);});
        }
    }
    const settings={...defaultSettings(),leadActivity:0,counter:{mode:'off',activity:0},padWeights:{sustain:1,pulse:0,sequence:0},bassWeights:{whole:1,drive:0}};
    const section={type:'full',strategy:'speech',start:0,bars:16,progress:.5,returning:true,orchestration:'held',developed:true,curves:true,shaped:true,brightnessStart:0,brightnessEnd:1};
    const out=formSettings(settings,formEnvelope({section},8,'gentle'));expect(out.leadActivity).toBe(0);expect(out.counter.activity).toBe(0);expect(out.padWeights.pulse).toBe(0);expect(out.bassWeights.drive).toBe(0);
});

test('ostinato returns retain theme identity; breakdown retains the preceding idea',()=>{
    const section={type:'full',developed:true,strategy:'ostinato',orchestration:'interlock'};
    const phrase=planThemePhrase({seed:42,start:8,section,previous:{ordinal:1,sectionType:'full'},settings:{leadRepeat:0},contrast:true});
    expect(phrase.themeId).toBe(0);expect(phrase.role).toBe('development');
    expect(planDevelopment({seed:42,phrase:{...phrase,bars:8},density:1}).operations.every(x=>['identity','displace'].includes(x))).toBe(true);
    expect(planThemePhrase({seed:42,start:16,section:{...section,form:true,type:'breakdown',themeId:1},settings:{}}).themeId).toBe(1);
});

test('harmonic pacing remains positive with fixed cycle/closing slots and protected returning tonic',()=>{
    for(const strategy of FORM_STRATEGIES)for(const type of ['intro','build','full','breakdown'])for(const count of [4,6,8])for(const size of [1,2,4]){
        const section={strategy,type,start:0,bars:64,index:1,nextType:'breakdown'};
        const d=harmonicDurations({count,barsPerChord:size,section,cycleStart:0,develop:true});
        expect(d.reduce((a,b)=>a+b,0)).toBe(count*size);expect(d.every(n=>n>=1)).toBe(true);expect(d.slice(-2)).toEqual([size,size]);
        const returned=harmonicDurations({count,barsPerChord:size,section:{...section,returning:true},cycleStart:0,develop:true});expect(returned).toEqual(Array(count).fill(size));
    }
});

test('interior harmonic destinations occupy an actual whole slot and skip short, off-grid or pentatonic harmony',()=>{
    const o={section:{type:'build',start:0,bars:32,strategy:'thematic'},bar:14,size:2,cycleStart:0,scaleSize:7,slot:{start:14,end:16}};
    expect(harmonicDestination(o).numeral).toBe('V');expect(harmonicDestination({...o,bar:15})).toEqual(harmonicDestination(o));
    expect(harmonicDestination({...o,slot:{start:13,end:16}})).toBeNull();expect(harmonicDestination({...o,scaleSize:5})).toBeNull();expect(harmonicDestination({...o,section:{...o.section,bars:8}})).toBeNull();
});

test('boundary metadata carries eight-bar phrases and ending phases without four-bar guesses',()=>{
    const state={phrase:{start:8,section:{start:0,bars:24}},composition:{phrase:{start:8,bars:8}}};
    expect(planBoundaries(state,11).phrase.closing).toBe(false);expect(planBoundaries(state,15).phrase.closing).toBe(true);
    expect(planBoundaries(state,23).section.closing).toBe(true);expect(planBoundaries(state,15,16).ending.phase).toBe('prepare');expect(planBoundaries(state,16,16).ending.phase).toBe('tonic');
    const out=prepareEnding([{role:'lead',beat:3,length:2,velocity:.8},{role:'perc',beat:3.5,length:.2,velocity:.5},{role:'perc',beat:0,length:.2,velocity:.5,anchor:true}],METERS['4/4']);
    expect(out).toHaveLength(2);expect(out[0].length).toBe(1);expect(out[0].velocity).toBeLessThan(.8);
});
