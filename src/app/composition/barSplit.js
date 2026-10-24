// A long bar (6/4, 7/4) that would hold one chord takes a second at its split beat (meter.js
// splitBeat), so chords change about as often as in 4/4 at the same tempo: the pad and bass move
// to the new chord there (tones the two share are held through), the lead and second lead lose
// the semitone clashes against it, and the kick marks the point.
const pc = (midi) => ((midi % 12) + 12) % 12;
const EPS = 1e-6;

// The nearest pitch whose pitch class is one of `pcs` (down first on a tie).
function nearest(midi, pcs) {
    for (let d = 0; d <= 6; d++) for (const m of [midi - d, midi + d]) if (pcs.includes(pc(m))) return m;
    return midi;
}

const clashes = (midi, pcs) => !pcs.includes(pc(midi)) && pcs.some((p) => [1, 11].includes((pc(midi) - p + 12) % 12));

/** Re-pitches the bar's events (beats in units) from `at` on under `chord`. In place. */
export function splitHarmony(events, { at, chord, meter }) {
    const pcs = chord.pitchClasses, root = pcs[0], added = [];
    for (const e of events) {
        const end = e.beat + e.length;
        if (e.role === 'pad' || e.role === 'bass') {
            const bass = e.role === 'bass';
            // a bass approach into the next bar keeps its pitch
            if (bass && e.beat > at + EPS && e.beat >= meter.units - meter.unitsPerBeat) continue;
            const target = bass && Math.abs(e.beat - at) < EPS ? [root] : pcs;
            if (e.beat >= at - EPS) { e.midi = nearest(e.midi, target); continue; }
            if (end <= at + 0.1 || (!bass && pcs.includes(pc(e.midi)))) continue;
            // sounding across the split: ends there, and the new chord's tone starts
            e.length = Math.max(0.05, at - e.beat - 0.05);
            added.push({ ...e, beat: at, length: end - at, midi: nearest(e.midi, bass ? [root] : pcs), velocity: e.velocity * 0.9 });
        } else if ((e.role === 'lead' || e.role === 'counter') && e.beat >= at - EPS && clashes(e.midi, pcs)) {
            e.midi = nearest(e.midi, pcs);
        }
    }
    const sounding = (e) => events.some((o) => o.role === e.role && o.midi === e.midi && o.beat <= e.beat + EPS && o.beat + o.length > e.beat + EPS);
    for (const e of added) if (!sounding(e)) events.push(e);
    // two pad notes merged onto one pitch play once
    const seen = new Set();
    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (e.role !== 'pad' || e.beat < at - EPS) continue;
        const key = `${e.beat.toFixed(4)}/${e.midi}`;
        if (seen.has(key)) events.splice(i--, 1); else seen.add(key);
    }
}

/** A kick at the split when the bar's drums kick on its downbeat but not there. In place. */
export function markSplit(hits, { at, kicks }) {
    const downbeat = hits.find((h) => kicks.includes(h.midi) && Math.abs(h.beat) < 0.25);
    if (!downbeat || hits.some((h) => kicks.includes(h.midi) && Math.abs(h.beat - at) < 0.25)) return;
    hits.push({ ...downbeat, beat: at, velocity: downbeat.velocity * 0.82 });
}
