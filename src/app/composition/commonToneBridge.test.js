import { commonToneBridge } from './commonToneBridge';
const chord = pitchClasses => ({pitchClasses});
const setup = () => ({before:chord([0,4,7]),original:chord([5,9,0]),target:chord([7,11,2]),
    candidates:[chord([2,5,9]),chord([4,7,11]),chord([9,0,4])]});
test('chooses a connected modal chord with shared tones on both sides without mutation', () => {
    const options=setup(),saved=structuredClone(options),result=commonToneBridge(options);
    expect(result.chord.pitchClasses).toEqual([4,7,11]);
    expect(result.sharedBefore).toEqual([4,7]);expect(result.sharedAfter).toEqual([7,11]);
    expect(options).toEqual(saved);
});
test('retains a good original connection and rejects one-sided alternatives', () => {
    expect(commonToneBridge({...setup(),original:chord([4,7,11])})).toBeNull();
    expect(commonToneBridge({...setup(),candidates:[chord([2,5,9]),chord([9,0,4])]})).toBeNull();
});
test('selection transposes with the key rather than preferring absolute pitch classes', () => {
    for(let shift=0;shift<12;shift++){
        const transpose=c=>chord(c.pitchClasses.map(pc=>(pc+shift)%12)),s=setup();
        const result=commonToneBridge({before:transpose(s.before),original:transpose(s.original),target:transpose(s.target),candidates:s.candidates.map(transpose)});
        expect(result.chord.pitchClasses).toEqual([4,7,11].map(pc=>(pc+shift)%12));
    }
});
