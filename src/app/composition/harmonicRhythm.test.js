import { harmonicDurations, harmonicSlot } from './harmonicRhythm';
test('redistributes whole bars while preserving order, total length and closing slots',()=>{
    for(const barsPerChord of [2,3,4])for(const count of [4,5,8]){
        const durations=harmonicDurations({count,barsPerChord,cycleStart:0,section:{type:'build',start:0,bars:32,nextType:'full'}});
        expect(durations.reduce((a,b)=>a+b,0)).toBe(count*barsPerChord);
        expect(durations.slice(-2)).toEqual([barsPerChord,barsPerChord]);
        expect(durations.every(n=>n>=1)).toBe(true);
        expect(durations[0]).toBe(barsPerChord+1);expect(durations[1]).toBe(barsPerChord-1);
    }
});
test('retains one-bar/short progressions, full sections and imminent cadences',()=>{
    const section={type:'intro',start:0,bars:4,nextType:'full'};
    for(const [count,barsPerChord] of [[4,1],[2,2],[3,3],[4,2]])expect(harmonicDurations({count,barsPerChord,section,cycleStart:0})).toEqual(Array(count).fill(barsPerChord));
    expect(harmonicDurations({count:4,barsPerChord:2,section:{...section,type:'full'},cycleStart:0})).toEqual([2,2,2,2]);
});
test('slot boundaries and remaining time follow the realised schedule',()=>{
    const options={cycleStart:8,count:4,barsPerChord:2,durations:[3,1,2,2]};
    expect(harmonicSlot({...options,bar:10})).toEqual({index:0,start:8,end:11,bars:3,left:1});
    expect(harmonicSlot({...options,bar:11})).toEqual({index:1,start:11,end:12,bars:1,left:1});
    expect(harmonicSlot({...options,bar:16}).index).toBe(0);
});
