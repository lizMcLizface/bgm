/** A modal closing fifth and tonic arrival, on existing chord-slot boundaries.
 * Do not force a new chord into a long held slot or a non-heptatonic harmony.
 * Quality remains the mode's own: this does not invent a major dominant.
 */
export function sectionCadence({ section, bar, barsPerChord, cycleStart, scaleSize }) {
    if (!section || scaleSize !== 7 || section.bars < barsPerChord * 2) return null;
    const end = section.start + section.bars;
    if ((section.start - cycleStart) % barsPerChord || (end - cycleStart) % barsPerChord) return null;
    if (section.type !== 'full' && section.nextType === 'full' && bar >= end - barsPerChord && bar < end)
        return { kind: 'prepare', numeral: 'V', arrivalBar: end };
    if (section.type === 'full' && section.returning && bar >= section.start && bar < section.start + barsPerChord)
        return { kind: 'arrive', numeral: 'I', arrivalBar: section.start };
    return null;
}
