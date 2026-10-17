/** Reuse a weak closing attack as an upbeat into a known full-section return.
 * No extra notes, changed degrees or movement of committed resolution/tie points.
 */
export function pickupLead(notes,{gesture,meter,protectedBeats=[]}) {
    if(gesture?.kind!=='gather'||gesture.step!==1||notes.length<3)return notes;
    const last=notes.at(-1),step=meter.unitsPerBeat===3?1:.5,target=meter.units-step;
    if(last.accent||protectedBeats.includes(last.beat)||last.beat<meter.units-meter.unitsPerBeat
        ||last.beat>=target||notes.at(-2).beat>=target-step)return notes;
    return notes.map((note,i)=>i===notes.length-1?{...note,beat:target,length:Math.min(note.length,step)}:{...note});
}
