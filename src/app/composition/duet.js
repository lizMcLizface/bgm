import { notesInRange, pentatonicOf } from '../arranger';
import { seeded } from '../random';

export function duetPlan({ phrase, seed, repeat = 0 }) {
    const rng = seeded(seed ^ Math.imul(phrase.ordinal + 1, 0x3c6ef372));
    const direction = repeat >= 1 || rng() < repeat ? 0 : rng() < .5 ? -1 : 1;
    const mode = ({ statement: 'establish', answer: 'lead moves', development: 'counter moves',
        contrast: 'contrary motion', return: 'together', recollection: 'recollect' })[phrase.role] ?? 'establish';
    return { start: phrase.start, bars: phrase.bars, mode, direction };
}

// Change the repeated idea before pitch search, preserving its cadence/resolution work.
export function duetMotif(notes, { plan, offset }) {
    const moving = offset >= plan.bars / 2 && ['lead moves', 'contrary motion'].includes(plan.mode);
    return notes.map(n => ({ ...n, degree: n.degree + (moving ? plan.direction : 0) }));
}

const overlap = (a, b) => Math.max(0, Math.min(a.beat + a.length, b.beat + b.length) - Math.max(a.beat, b.beat));
export function duetClash(midi, event, lead, chord) {
    let cost = chord.pitchClasses.includes(midi % 12) ? 0 : .7;
    for (const n of lead) {
        const held = overlap(event, n);
        if (!held) continue;
        const distance = Math.abs(midi - n.midi), interval = distance % 12;
        cost += held * (([1, 2, 6, 10, 11].includes(interval) ? 7 : 0)
            + (distance < 3 ? 5 : 0) + (midi > n.midi ? .5 : 0));
    }
    return cost;
}

/** Bounded counter-line search against every overlapping foreground note. */
export function duetCounter(events, { memory, plan, offset, lead, scalePcs, settings, range, previousMidi, chord }) {
    const allowed = notesInRange(settings.leadScale === 'pentatonic' ? pentatonicOf(scalePcs) : scalePcs, ...range);
    if (!allowed.length || !events.length) return events.map(e => ({ ...e }));
    const remembered = memory?.[offset % 2];
    // Keep the current activity budget; a remembered motif never fills an intentional rest.
    const source = remembered?.length ? remembered.slice(0, events.length).map(e => ({ ...e })) : events.map(e => ({ ...e }));
    const moving = offset >= plan.bars / 2;
    const shift = moving && plan.mode === 'counter moves' ? plan.direction
        : moving && plan.mode === 'contrary motion' ? -plan.direction : 0;
    let beam = [{ cost: 0, last: previousMidi, notes: [] }];
    for (const event of source) {
        const at = allowed.reduce((best, n, i) => Math.abs(n - event.midi) < Math.abs(allowed[best] - event.midi) ? i : best, 0);
        const target = allowed[Math.max(0, Math.min(allowed.length - 1, at + shift))];
        const candidates = [...allowed].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b).slice(0, 7);
        const paths = [];
        for (const path of beam) for (const midi of candidates) {
            const leap = Math.abs(midi - path.last);
            paths.push({ cost: path.cost + Math.abs(midi - target) * 1.4 + Math.max(0, leap - 5) * .7
                + duetClash(midi, event, lead, chord), last: midi, notes: [...path.notes, { ...event, midi }] });
        }
        beam = paths.sort((a, b) => a.cost - b.cost || a.last - b.last).slice(0, 12);
    }
    return beam[0].notes;
}
