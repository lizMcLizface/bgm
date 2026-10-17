import { searchPhrase, planPhraseMelody, PHRASE_BEAM } from './phraseMelody';
const scale=[0,2,4,5,7,9,11],chord={pitchClasses:[0,4,7]};
const note=(degree,beat=0)=>({degree,beat,length:.9,accent:true});
const options={range:[60,84],settings:{leadScale:'full',leadEnding:'settled',leadLeaps:0},previousMidi:72,seed:42,closing:true};
const bar=(at,notes,ch=chord,pcs=scale)=>({bar:at,notes,chord:ch,scalePcs:pcs});

test('future phrase destinations affect earlier pitches, while note rhythm remains unchanged',()=>{
    const up=searchPhrase({...options,bars:[bar(0,[note(0)]),bar(1,[note(7)])]}),down=searchPhrase({...options,bars:[bar(0,[note(0)]),bar(1,[note(-7)])]});
    expect(up.bars[0].events[0].midi).not.toBe(down.bars[0].events[0].midi);
    expect(up.bars[1].events[0].midi).toBeGreaterThan(down.bars[1].events[0].midi);
    expect(up.bars[0].events[0]).toMatchObject({beat:0,length:.846});
    expect(up.beamWidth).toBe(PHRASE_BEAM);expect(up).toEqual(searchPhrase({...options,bars:[bar(0,[note(0)]),bar(1,[note(7)])]}));
});

test('closed/open targets and changing-key strict pentatonic remain inside the range',()=>{
    for(let tonic=0;tonic<12;tonic++)for(const ending of ['settled','open']){
        const pcs=scale.map(n=>(n+tonic)%12),target={pitchClasses:[tonic,(tonic+4)%12,(tonic+7)%12]};
        const bars=[bar(0,[note(0),note(2,1)]),bar(1,[note(1),note(-1,1)],target,pcs)];
        const result=searchPhrase({...options,bars,settings:{...options.settings,leadScale:'pentatonic',leadEnding:ending}});
        result.bars.forEach((b,i)=>b.events.forEach(e=>{expect(bars[i].scalePcs.filter((_,k)=>![3,6].includes(k))).toContain(e.midi%12);expect(e.midi).toBeGreaterThanOrEqual(60);expect(e.midi).toBeLessThanOrEqual(84);}));
        const closing=result.bars.at(-1).events.at(-1).midi%12;
        expect(ending==='settled'?target.pitchClasses.slice(0,2):[target.pitchClasses[2],pcs[1]]).toContain(closing);
    }
});

test('chosen paths survive serialisation, and edits or newly known harmony invalidate them',()=>{
    const bars=[0,1,2,3].map(i=>bar(i,[note(i),note(0,1)])),args={...options,bars};
    const plan=planPhraseMelody(args),saved=JSON.parse(JSON.stringify(plan));
    const next={...args,bars:bars.slice(1),previousMidi:plan.bars[0].events.at(-1).midi};
    expect(planPhraseMelody(next,saved)).toBe(saved);
    const edited={...next,range:[72,96]};expect(planPhraseMelody(edited,saved)).not.toBe(saved);
    const harmonic={...next,bars:next.bars.map(b=>({...b,chord:{pitchClasses:[5,9,0]}}))};expect(planPhraseMelody(harmonic,saved)).not.toBe(saved);
    const partial=planPhraseMelody({...args,bars:bars.slice(0,2),closing:false});expect(partial.destination.closing).toBe(false);
    expect(planPhraseMelody(args,partial)).not.toBe(partial);
    // Consumer changes (such as section energy) must use copies of cached events.
    expect(plan).toEqual(saved);
});
