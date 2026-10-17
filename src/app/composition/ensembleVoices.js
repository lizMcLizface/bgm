import { notesInRange } from '../arranger';
import { beatStarts } from '../meter';
import { seeded } from '../random';

const nearest = (notes, target) => notes.reduce((best, n) => Math.abs(n - target) < Math.abs(best - target) ? n : best);

/** A small beam search through scale/chord tones toward the next root. */
export function walkingBass({ chord, nextChord, scalePcs, range, previousMidi, meter, chordEnds, seed, bar, rhythm }) {
    const roots = notesInRange([chord.pitchClasses[0]], ...range);
    const center = (range[0] + range[1]) / 2;
    const root = nearest(roots, previousMidi * 0.7 + center * 0.3);
    const nextRoot = nextChord ? nearest(notesInRange([nextChord.pitchClasses[0]], ...range), root) : root;
    const changing = chordEnds && nextChord && nextChord.pitchClasses[0] !== chord.pitchClasses[0];
    const scale = notesInRange(scalePcs, ...range), beats = beatStarts(meter);
    const rng = seeded(seed ^ Math.imul(bar + 1, 0x9b05688c));
    const chromatic = changing && rng() < 0.25;
    const approach = chromatic ? [nextRoot - 1, nextRoot + 1].filter(m => m >= range[0] && m <= range[1])
        : scale.filter(m => m !== nextRoot && Math.abs(m - nextRoot) <= 2);
    let beam = [{ last: root, pitches: [root], cost: Math.abs(root - previousMidi) * 0.2 }];
    for (let i = 1; i < beats.length; i++) {
        const closing = i === beats.length - 1 && changing;
        const pool = closing && approach.length ? approach : scale;
        const candidates = [];
        for (const path of beam) for (const midi of pool) {
            const leap = Math.abs(midi - path.last), repeated = midi === path.last;
            const consonant = chord.pitchClasses.includes(midi % 12);
            const aim = changing ? root + (nextRoot - root) * i / beats.length : center;
            const cost = leap * 0.18 + Math.max(0, leap - 4) * 1.3 + (repeated ? 1.4 : 0)
                + (!consonant && !closing ? 0.55 : 0) + Math.abs(midi - aim) * 0.12;
            candidates.push({ last: midi, pitches: [...path.pitches, midi], cost: path.cost + cost });
        }
        beam = candidates.sort((a, b) => a.cost - b.cost || a.last - b.last).slice(0, 12);
    }
    return beats.map((beat, i) => ({ role: 'bass', midi: beam[0].pitches[i], beat, length: meter.unitsPerBeat * 0.9,
        velocity: rhythm.kicks.includes(beat) ? 0.78 : i === beats.length - 1 && changing ? 0.61 : 0.66 }));
}

export function alignBass(events, { style, rhythm, meter }) {
    if (style === 'whole') return events;
    const out = events.map(e => ({ ...e, velocity: rhythm.kicks.includes(e.beat) ? Math.max(e.velocity, 0.77) : e.velocity * 0.94 }));
    if (style === 'half' && rhythm.pickup !== null && out.length) {
        const last = out[out.length - 1];
        if (last.beat >= meter.units - meter.unitsPerBeat && last.beat > 0) {
            // Keep an existing approach pitch, but place its pickup with the kick.
            last.beat = rhythm.pickup; last.length = (meter.units - last.beat) * 0.9;
        } else if (!out.some(e => e.beat === rhythm.pickup)) {
            out.push({ ...last, beat: rhythm.pickup, length: (meter.units - rhythm.pickup) * 0.9, velocity: 0.62 });
        }
    }
    out.sort((a, b) => a.beat - b.beat);
    return out.map((e, i) => ({ ...e, length: i + 1 < out.length ? Math.min(e.length, (out[i + 1].beat - e.beat) * 0.94) : e.length }));
}

/** Prefer consonant sustained intervals and continuity without forcing one register. */
export function counterPitches(events, { lead, scalePcs, range, previousMidi, chord, meter }) {
    const allowed = notesInRange(scalePcs, ...range);
    let previous = previousMidi;
    return events.map(e => {
        const sounding = lead.find(n => n.beat <= e.beat && n.beat + n.length > e.beat);
        const candidates = [...allowed].sort((a, b) => Math.abs(a - e.midi) - Math.abs(b - e.midi)).slice(0, 7);
        const score = midi => {
            const distance = sounding ? Math.abs(midi - sounding.midi) : 7;
            const interval = distance % 12;
            const dissonant = [1, 2, 6, 10, 11].includes(interval);
            const held = e.length >= meter.unitsPerBeat * 0.5;
            return Math.abs(midi - e.midi) * 0.25 + Math.abs(midi - previous) * 0.15
                + (sounding && distance < 3 ? 6 : 0) + (dissonant ? held ? 5 : 1.2 : 0)
                + (sounding && midi > sounding.midi ? 0.9 : 0) + (chord.pitchClasses.includes(midi % 12) ? 0 : 0.25);
        };
        candidates.sort((a, b) => score(a) - score(b) || a - b);
        previous = candidates[0];
        return { ...e, midi: previous };
    });
}
