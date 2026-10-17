import { phraseLength } from './phraseLength';
import { planDevelopment } from './themeDevelopment';
import { phraseRhythm,barRhythm } from './ensembleRhythm';
import { METERS } from '../meter';
test('automatic lengths respect short sections and keep driving profiles short',()=>{
    const settings={bassWeights:{drive:1,whole:0},leadDensity:.8};
    expect(phraseLength({choice:'auto',seed:42,bar:0,settings})).toBe(4);
    expect(phraseLength({choice:8,seed:42,bar:0,settings,form:{section:{start:0,bars:4}}})).toBe(4);
    const found=new Set(Array.from({length:32},(_,seed)=>phraseLength({choice:'auto',seed,bar:0,settings:{}})));expect([...found].sort()).toEqual([4,8]);
});
test('eight-bar transforms and meter-aware rhythm preserve a midpoint and final close',()=>{
    const d=planDevelopment({seed:42,phrase:{start:0,role:'statement',bars:8},density:.75});expect(d.operations.slice(0,4)).toEqual(['identity','identity','identity','identity']);expect(d.operations).toHaveLength(8);
    for(const meter of Object.values(METERS)){const phrase=phraseRhythm({seed:42,start:0,meter,bassStyle:'half',role:'statement',bars:8});
        expect(phrase.bars).toHaveLength(8);expect(barRhythm({phrase,bar:3,meter,lead:[]}).closing).toBe(false);expect(barRhythm({phrase,bar:7,meter,lead:[]}).closing).toBe(true);}
});
