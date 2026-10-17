import { planThemePhrase } from './arrangerLatest';
import { planDevelopment, developTheme } from './themeDevelopment';
import { METERS } from '../meter';

test('contrast uses the retained secondary theme, returns to the main idea, and respects repeat preference',()=>{
    const run=(contrast,leadRepeat=0)=>{
        let previous;
        return Array.from({length:8},(_,index)=>{
            const phrase=planThemePhrase({seed:42,start:index*4,previous,settings:{leadRepeat},contrast});
            previous=phrase;return phrase;
        });
    };
    const phrases=run(true);
    expect(phrases.map(p=>p.role)).toEqual(['statement','answer','contrast','return','statement','answer','development','return']);
    expect(phrases[2].themeId).toBe(1);expect(phrases[3].themeId).toBe(0);
    expect(run(false).some(p=>p.role==='contrast')).toBe(false);
    expect(run(true,1).some(p=>p.role==='contrast')).toBe(false);
    expect(phrases).toEqual(run(true));
});

test('reflected contour is bounded and contrast leaves theme memory intact without adding attacks',()=>{
    const source=[0,2,1,-1].map((degree,beat)=>Object.freeze({degree,beat,length:1,accent:beat===0}));Object.freeze(source);
    const reflected=developTheme(source,{operation:'mirror',meter:METERS['4/4']});
    expect(reflected.map(n=>n.degree)).toEqual([0,-2,-1,1]);
    expect(reflected.map(n=>[n.beat,n.length])).toEqual(source.map(n=>[n.beat,n.length]));
    for(const bars of [4,8]){
        const plan=planDevelopment({seed:42,phrase:{start:8,role:'contrast',bars},density:1});expect(plan.operations).toHaveLength(bars);
        for(const meter of Object.values(METERS))for(const operation of plan.operations){
            const notes=source.filter(n=>n.beat<meter.units),out=developTheme(notes,{operation,meter,interval:plan.interval,density:1});
            expect(out.length).toBeLessThanOrEqual(notes.length);out.forEach(n=>{expect(n.beat+n.length).toBeLessThanOrEqual(meter.units);expect(n.length).toBeGreaterThan(0);});
        }
    }
    expect(source.map(n=>n.degree)).toEqual([0,2,1,-1]);
});
