// Picks one playable grip from a chord's positions: one per string, nearest a preferred fret.
// After unCAGED's chordFingering.js; positions are plain {string, fret} objects.
export function selectGripFromPositions(positions, preferredFret = 0) {
    const byString = new Map();
    for (const pos of positions) {
        const existing = byString.get(pos.string);
        if (!existing || Math.abs(pos.fret - preferredFret) < Math.abs(existing.fret - preferredFret)) byString.set(pos.string, pos);
    }
    return [...byString.values()].sort((a, b) => a.string - b.string);
}
