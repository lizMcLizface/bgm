/** Distance to the nearest felt beat, including beats in the neighbouring bars. */
export function beatDistance(beat, meter) {
    const starts = meter.beats ?? Array.from({ length: Math.ceil(meter.units / meter.unitsPerBeat) }, (_, i) => i * meter.unitsPerBeat);
    return Math.min(...[-1, 0, 1].flatMap(k => starts.map(start => Math.abs(beat - start - k * meter.units))));
}

/** Boundary crossings of a written gate, excluding exact touches. */
export function crossedBoundaries(start, end, boundaries) {
    return boundaries.filter(boundary => start < boundary.time - 1e-6 && end > boundary.time + 1e-6);
}

/** Approximate consecutive chord-attack motifs, counted once per pair. */
export function chordGestures(events) {
    const attacks = [], result = { heldSingleIntoChord: 0, chordPauseChord: 0, sameChordPauseSameChord: 0 };
    for (const event of [...events].sort((a, b) => a.start - b.start)) {
        const last = attacks.at(-1);
        if (!last || event.start - last.start > .05) attacks.push({ start: event.start, end: event.end, pitches: [event.midi] });
        else { last.end = Math.max(last.end, event.end); last.pitches.push(event.midi); }
    }
    for (let i = 1; i < attacks.length; i++) {
        const a = attacks[i - 1], b = attacks[i];
        if (a.pitches.length === 1 && a.end - a.start >= .25 && b.pitches.length >= 3 && a.end > b.start) result.heldSingleIntoChord++;
        if (a.pitches.length >= 3 && b.pitches.length >= 3 && b.start - a.end > .02) {
            result.chordPauseChord++;
            if ([...a.pitches].sort((x, y) => x - y).join(',') === [...b.pitches].sort((x, y) => x - y).join(',')) result.sameChordPauseSameChord++;
        }
    }
    return result;
}
