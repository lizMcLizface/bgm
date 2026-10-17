/** Preserve progression order and cycle length; redistribute whole bars only.
 * The closing two slots stay on the reference grid for bridges/cadences.
 */
export function harmonicDurations({ count, barsPerChord, section, cycleStart, develop = false }) {
    const durations = Array(count).fill(barsPerChord);
    if (count < 4 || barsPerChord < 2 || !section) return durations;
    if(section.nextType==='full' && section.start+section.bars<=cycleStart+3*barsPerChord)return durations;
    if(develop){
        if(section.returning&&section.start>=cycleStart&&section.start<cycleStart+count*barsPerChord)return durations;
        if(section.strategy==='ostinato'&&section.type==='full')return durations;
        if(section.strategy==='speech'||section.strategy==='gradual'||section.strategy==='cinematic'){
            const transfer=Math.min(barsPerChord-1,section.type==='build'?2:1);
            durations[0]+=transfer;durations[1]-=transfer;
        }else if(section.type==='full'&&section.index%2){durations[0]--;durations[1]++;}
        else{durations[0]++;durations[1]--;}
        if(count>=6&&section.type==='build'){durations[2]++;durations[3]--;}
        return durations;
    }
    if(section.type==='full')return durations;
    durations[0]++; durations[1]--;
    return durations;
}

export function harmonicSlot({ bar, cycleStart, count, barsPerChord, durations }) {
    const lengths = durations ?? Array(count).fill(barsPerChord);
    const total = lengths.reduce((sum,n) => sum+n,0);
    const cycle = Math.floor((bar-cycleStart)/total), origin=cycleStart+cycle*total;
    let start=origin;
    for(let index=0;index<lengths.length;index++){
        const end=start+lengths[index];
        if(bar<end)return {index,start,end,bars:lengths[index],left:end-bar};
        start=end;
    }
    throw new Error('Invalid harmonic rhythm');
}
