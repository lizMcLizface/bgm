import { notesInRange } from '../arranger';
import { beatStarts, groupStarts } from '../meter';
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

// Rhythm cells for the grouped and driving bass. A bare held root ("hold") is a call: it leaves the
// bar waiting for an answer, so it is only used while the lead is playing; with no lead the line
// keeps moving. Chosen once per phrase, so a phrase has one recognisable bass figure.
const HALF_CELLS = { hold: 3, repeat: 3, push: 2, sync: 2, octave: 1.5 };
const DRIVE_CELLS = { straight: 3, offbeat: 2, octave: 2, gallop: 1 };

const weighted = (rng, table) => {
    const entries = Object.entries(table), total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = rng() * total;
    for (const [name, w] of entries) if ((roll -= w) < 0) return name;
    return entries[0][0];
};

export function bassCell({ style, seed, phraseStart, leadPlaying }) {
    const table = style === 'half' ? { ...HALF_CELLS } : style === 'drive' ? DRIVE_CELLS : null;
    if (!table) return null;
    if (!leadPlaying) delete table.hold;
    return weighted(seeded(seed ^ Math.imul(phraseStart + 1, 0x85ebca6b) ^ 0x2545f491), table);
}

export function varyBass(events, { style, cell, meter, range }) {
    if (!cell || !events.length || !['half', 'drive'].includes(style) || cell === 'hold' || cell === 'straight') return events;
    const step = meter.unitsPerBeat === 1 ? 0.5 : 1, last = meter.units - step;
    const snap = at => Math.round(at / step) * step;
    const up = midi => midi + 12 <= range[1] ? midi + 12 : midi;
    let out = events.map(e => ({ ...e }));
    if (style === 'half') {
        const starts = groupStarts(meter), size = at => meter.groups[starts.indexOf(at)] ?? meter.unitsPerBeat;
        const added = [], free = at => !out.some(o => Math.abs(o.beat - at) < 1e-6) && !added.some(o => Math.abs(o.beat - at) < 1e-6);
        for (const e of out) {
            const g = starts.indexOf(e.beat), span = g >= 0 ? size(e.beat) : 0;
            if (g < 0 || span < 2 * step || e.length < span * 0.5) continue;
            if (cell === 'repeat' || cell === 'octave') {
                const at = snap(e.beat + span / 2);
                if (at > e.beat && at < e.beat + span && free(at)) {
                    added.push({ ...e, beat: at, length: (e.beat + span - at) * 0.9, velocity: e.velocity * 0.78, midi: cell === 'octave' ? up(e.midi) : e.midi });
                    e.length = (at - e.beat) * 0.94;
                }
            } else if (cell === 'sync') {
                // the second hit lands three-quarters through the group: 1, (and of 2), next group
                const at = snap(e.beat + span * 0.75);
                if (at > e.beat && at < e.beat + span && at <= last && free(at)) {
                    added.push({ ...e, beat: at, length: (e.beat + span - at) * 0.9, velocity: e.velocity * 0.8 });
                    e.length = (at - e.beat) * 0.94;
                }
            } else if (cell === 'push' && g > 0) {
                // anticipate the later groups by a step; the bar's first beat stays put
                if (!free(e.beat - step)) continue;
                const prev = out.find(o => o !== e && o.beat < e.beat && o.beat + o.length > e.beat - step);
                if (prev) prev.length = Math.max(step * 0.5, e.beat - step - prev.beat) * 0.94;
                e.beat -= step; e.length += step * 0.6;
            }
        }
        out.push(...added);
    } else {
        const high = up(out[0].midi);
        out = out.filter((e, i) => {
            if (cell === 'offbeat') return i === 0 || e.beat % meter.unitsPerBeat !== 0 || e.beat === last;
            return true;
        });
        out.forEach((e, i) => {
            if (cell === 'octave' && i > 0 && i % 2 === 1 && e.beat !== last) e.midi = high;
            if (cell === 'gallop' && i % 3 === 2) e.velocity *= 0.6;
        });
    }
    out.sort((a, b) => a.beat - b.beat);
    return out.map((e, i) => ({ ...e, length: i + 1 < out.length ? Math.min(e.length, (out[i + 1].beat - e.beat) * 0.94) : e.length }));
}
