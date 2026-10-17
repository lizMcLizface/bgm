import { CHORD_COLOURS } from '../theory';
/** Only describe decisions recorded on the actual chord/plan. An enabled
 * probability is not proof that the corresponding rule fired in this bar.
 */
export function explainBar(bar) {
    if(!bar)return [];
    const reasons=[],chord=bar.chord,p=chord.provenance,c=chord.cadence;
    const add=(rule,title,text,kind='decision')=>reasons.push({rule,title,text,kind});
    const unresolved=chord.tonality?.mode==='atonal'||chord.unresolved;
    if(chord.tonality?.mode==='atonal')add('harmonic-language','No tonal home','This chord comes from a seeded twelve-note chromatic row. The melody can use all twelve pitch classes; no dominant-tonic arrival is imposed.');
    if(chord.tonality?.mode==='bitonal')add('harmonic-language','Two tonal centres',`Backing: ${chord.tonality.backing}. Lead and second lead: ${chord.tonality.melody}. Their intentional clashes are retained.`);
    if(chord.unresolved)add('progression','The tonic stays absent','This progression avoids the tonic chord, including its seam and section arrivals. Tonic notes may still occur inside other chords.');
    if(bar.ending)add('ending','The ending takes priority',bar.events.length?(unresolved?'The final pitch set is held without a tonic resolution.':'The final tonic is held while the piece comes to rest. Unheard phrase plans are cleared.'):'This is the ending’s silent tail.','override');
    else if(!unresolved&&bar.boundaries?.ending?.phase==='prepare')add('ending','Preparing the final tonic','The ending chooses this fifth chord and releases the backing before the final arrival.','override');
    if(p?.pivotTo)add('harmonic-drift','A pivot into a new key',`This dominant prepares the move to ${p.pivotTo}.`,'override');
    if(c?.kind==='bridge')add('common-tone-bridges','A common-tone bridge',`Shares ${c.sharedBefore?.length??0} pitch classes with the preceding chord and ${c.sharedAfter?.length??0} with the preparation chord. It replaces ${c.previous}.`);
    else if(c?.kind==='prepare')add('section-cadences','Preparing a section arrival',`The closing fifth chord prepares the full section at bar ${c.arrivalBar+1}. Any borrowing or added colour is recorded separately.`);
    else if(c?.kind==='arrive')add('section-cadences','A return to the tonic','The main section arrives on its tonic after preparation.');
    else if(c?.kind==='phrase-destination')add('harmonic-pacing','An interior harmonic destination',`${c.reason}. This chord closes the first half of the section.`);
    if(p?.borrowed)add('borrowed-chords','Borrowed from the parallel mode',`This chord uses the parallel ${p.sourceMode==='Major-1'?'major':'minor'} while the melodic scale stays in its home mode.`);
    if(p&&p.colour!=='plain')add('chord-colour','An added chord colour',`Uses ${CHORD_COLOURS[p.colour]?.toLowerCase()??p.colour} colouring.`);
    if(p&&p.harmonicMode!==p.baseMode)add('harmonic-parent','Separate melodic and harmonic scales','The melody keeps its selected scale while the chords use a different harmonic scale.');
    const trace=bar.ruleTrace;
    if(trace&&trace.slot.bars!==trace.referenceBarsPerChord)add('harmonic-pacing','A change in harmonic pace',`This chord slot lasts ${trace.slot.bars} bars instead of the ${trace.referenceBarsPerChord}-bar reference. Progression order and total cycle length are retained.`);
    if(!bar.ending&&!c&&!p?.pivotTo)add('progression','From the progression',p?.borrowed?'The progression supplies the scale degree. Borrowing changes its chord tones for this bar.':`The selected progression supplies this chord in ${chord.keyName}.`,'context');
    const section=bar.state?.phrase?.section;
    if(section)add('form-strategies',`${section.type[0].toUpperCase()+section.type.slice(1)} · ${section.strategy??'section'}`,`Bars ${section.start+1}–${section.start+section.bars}${section.nextType?`; the next destination is ${section.nextType}`:''}.`,'context');
    if(!p)add(null,'Limited chord detail','This plan has no detailed chord decision record. No borrowing or colouring decision is inferred from the controls.','context');
    return reasons;
}
