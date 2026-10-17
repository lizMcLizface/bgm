/** One interior harmonic destination per long section, on a whole reference
 * slot. Section cadence/bridge, modulation and endings always take precedence.
 */
export function harmonicDestination({section,bar,size,cycleStart,scaleSize,slot}) {
    if(!section||scaleSize!==7||section.bars<16)return null;
    const middle=section.start+Math.floor(section.bars/8)*4;
    if((middle-cycleStart)%size||middle-section.start<size*2||section.start+section.bars-middle<size*2)return null;
    // Land in the closing slot of the first half, rather than moving the
    // cadence to the following phrase's entrance.
    const at=middle-size;
    if(slot&&slot.start!==at)return null;
    if(bar<at||bar>=(slot?.end??middle))return null;
    const restrained=['gradual','speech'].includes(section.strategy);
    const numeral=section.type==='build'?'V':section.type==='breakdown'?'IV':section.type==='full'&&!restrained?'VI':null;
    return numeral?{kind:'phrase-destination',numeral,arrivalBar:at,phraseEnd:middle,reason:section.type==='build'?'open half cadence':section.type==='breakdown'?'open recollection':'contrasting middle'}:null;
}
