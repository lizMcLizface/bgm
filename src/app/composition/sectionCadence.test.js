import { sectionCadence } from './sectionCadence';

const section = { type:'build', start:8, bars:8, nextType:'full' };
const decide = patch => sectionCadence({ section, bar:15, barsPerChord:2, cycleStart:0, scaleSize:7, ...patch });
test('prepares the final chord slot and marks the first return slot', () => {
    expect(decide()).toEqual({kind:'prepare',numeral:'V',arrivalBar:16});
    expect(decide({bar:14})).toEqual(decide());
    expect(decide({bar:13})).toBeNull();
    expect(decide({section:{type:'full',start:16,bars:16,returning:true},bar:17})).toEqual({kind:'arrive',numeral:'I',arrivalBar:16});
    expect(decide({section:{type:'full',start:16,bars:16,returning:true},bar:18})).toBeNull();
});
test('does not overwrite held slots, off-grid boundaries, continued full or non-heptatonic harmony', () => {
    for(const patch of [{section:null},{scaleSize:5},{barsPerChord:8},{cycleStart:1},
        {section:{...section,type:'full'}},{section:{...section,nextType:'breakdown'}}]) expect(decide(patch)).toBeNull();
    expect(decide({section:{type:'full',start:8,bars:8,returning:false},bar:8})).toBeNull();
});
