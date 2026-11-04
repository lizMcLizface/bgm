/**
 * The harmony lane: the generator's planned bars as chord slots measured in beats, for display above
 * the sequencer grid (docs/SEQUENCER_DEVICE_PLAN.md, stage 1). Pure; the plan comes from Generator.getPlan().
 *
 * A slot: { startBeat, endBeat, startBar, endBar, chord, numeral, name, unresolved, split, bars: [{ bar, stage, fill }] }.
 * A chord that changes mid-bar (plan.split) makes a second, shorter slot.
 */
export function harmonyLane(plan, beatsPerBar) {
    const slots = [];
    const barInfo = (p) => ({ bar: p.bar, stage: p.seqPlayed ? p.seqPlayed.chosen : null, fill: !!p.seqPlayed?.fill });
    const make = (chord, startBeat, endBeat, p, split) => ({
        startBeat, endBeat, startBar: p.bar, endBar: p.bar + 1, chord,
        numeral: chord.numeral, name: chord.name, unresolved: !!chord.unresolved, split, bars: [barInfo(p)],
    });
    plan.forEach((p) => {
        const start = p.bar * beatsPerBar, end = start + beatsPerBar, last = slots[slots.length - 1];
        if (!p.chordStart && last && last.endBar === p.bar) {
            last.endBar = p.bar + 1;
            last.endBeat = p.split ? start + p.split.beat : end;
            last.bars.push(barInfo(p));
        } else {
            slots.push(make(p.chord, start, p.split ? start + p.split.beat : end, p, false));
        }
        if (p.split) slots.push(make(p.split.chord, start + p.split.beat, end, p, true));
    });
    return slots;
}

/** The slots that overlap [fromBar, fromBar + bars), cut to that window. */
export function laneWindow(slots, fromBar, bars, beatsPerBar) {
    const from = fromBar * beatsPerBar, to = (fromBar + bars) * beatsPerBar;
    return slots.filter((s) => s.endBeat > from && s.startBeat < to)
        .map((s) => ({ ...s, from: Math.max(s.startBeat, from), to: Math.min(s.endBeat, to) }));
}

/** "bar 2 of 3" for the slot containing beat `pos`, or null. A split slot has no bar count. */
export function barOfSlot(slot, pos, beatsPerBar) {
    if (!slot || slot.split) return null;
    const bar = Math.floor(pos / beatsPerBar);
    return { index: bar - slot.startBar + 1, of: slot.endBar - slot.startBar };
}

/**
 * The slots inside one bar placed on `steps` columns (the grid's sixteenths): [{ slot, start, end }],
 * so a ruler can sit on exactly the grid's columns. A mid-bar chord change gives two spans.
 */
export function barSpans(slots, bar, beatsPerBar, steps = 16) {
    const from = bar * beatsPerBar, to = from + beatsPerBar;
    return slots.filter((s) => s.endBeat > from && s.startBeat < to).map((slot) => ({
        slot,
        start: Math.round(((Math.max(slot.startBeat, from) - from) / beatsPerBar) * steps),
        end: Math.round(((Math.min(slot.endBeat, to) - from) / beatsPerBar) * steps),
    })).filter((s) => s.end > s.start);
}
