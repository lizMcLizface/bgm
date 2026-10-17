import { notesInRange, pentatonicOf } from '../arranger';

export const JOINT_BEAM = 20;
const clash = (a, b, duration) => {
    const distance = Math.abs(a - b), interval = distance % 12;
    return duration * (([1, 2, 6, 10, 11].includes(interval) ? 5 : 0) + (distance < 3 ? 4 : 0) + (b > a ? .9 : 0));
};

/** Both voices branch in one time-ordered beam over the remaining known phrase. */
export function planJointCounterpoint({ bars, meter, ranges, settings, previousMidi, protectedNotes = [], key, mode, carry = {} }, previous) {
    const contexts = bars.map(b => ({ bar: b.bar, bpm: b.bpm, chord: b.chord.pitchClasses, scalePcs: b.scalePcs,
        lead: b.lead.map(e => [e.beat, e.length, e.length > meter.units - e.beat || protectedNotes.some(p => p.bar === b.bar && p.beat === e.beat) ? e.midi : null]),
        counter: b.counter.map(e => [e.beat, e.length]) }));
    if (previous?.key === key && JSON.stringify(previous.contexts.filter(b => b.bar >= bars[0].bar)) === JSON.stringify(contexts)) return previous;
    const stages = []; let clock = 0;
    for (const b of bars) {
        const unit = 60 / ((b.bpm || 120) * meter.unitsPerBeat);
        for (const role of ['lead', 'counter']) for (const event of b[role]) {
            const pcs = settings.leadScale === 'pentatonic' ? pentatonicOf(b.scalePcs) : b.scalePcs;
            const allowed = notesInRange(pcs, ...ranges[role]);
            const protectedEvent = role === 'lead' && (event.length > meter.units - event.beat
                || protectedNotes.some(p => p.bar === b.bar && p.beat === event.beat));
            const pool = protectedEvent ? [event.midi] : [...allowed].sort((a, z) => Math.abs(a - event.midi) - Math.abs(z - event.midi) || a - z).slice(0, role === 'lead' ? 3 : 5);
            stages.push({ bar: b.bar, role, event, chord: b.chord.pitchClasses, pool, start: clock + event.beat * unit,
                end: clock + (event.beat + event.length) * unit, unit });
        }
        clock += meter.units * unit;
    }
    stages.sort((a, b) => a.start - b.start || (a.role === b.role ? 0 : a.role === 'lead' ? -1 : 1));
    let beam = [{ score: 0, last: { ...previousMidi }, targets: { ...previousMidi }, active: carry, pitches: [], pair: null, pairTime: -1, referencePair: null }];
    for (const stage of stages) {
        const paths = [], other = stage.role === 'lead' ? 'counter' : 'lead';
        for (const path of beam) for (const midi of stage.pool) {
            const held = path.active[other], overlap = held ? Math.max(0, Math.min(held.end, stage.end) - stage.start) / (stage.unit * meter.unitsPerBeat) : 0;
            const motion = midi - path.last[stage.role];
            const desired = stage.event.midi - path.targets[stage.role];
            let cost = Math.abs(midi - stage.event.midi) * (stage.role === 'lead' ? 2.2 : 1)
                + Math.max(0, Math.abs(motion) - 5) * .65 + Math.abs(motion) * .05
                + (desired && !motion ? .8 : desired && motion && Math.sign(desired) !== Math.sign(motion) ? 1.5 : 0)
                + (stage.chord.includes(midi % 12) ? 0 : .35);
            if (overlap) cost += stage.role === 'lead' ? clash(midi, held.midi, overlap) : clash(held.midi, midi, overlap);
            const last = { ...path.last, [stage.role]: midi };
            let pair = path.pair, pairTime = path.pairTime, referencePair = path.referencePair;
            if (overlap) {
                // Coincident attacks compare against the preceding pair, not the
                // half-updated pair after the first voice at this same instant.
                referencePair = path.pairTime === stage.start ? path.referencePair : path.pair;
                if (referencePair) {
                    const leadMove = last.lead - referencePair.lead, counterMove = last.counter - referencePair.counter;
                    const same = leadMove && counterMove && Math.sign(leadMove) === Math.sign(counterMove);
                    const perfect = Math.abs(last.lead - last.counter) % 12;
                    if (same && [0, 7].includes(perfect) && perfect === referencePair.interval) cost += 1.6;
                    if (mode === 'contrary motion' && same) cost += .9;
                    if (leadMove && counterMove && Math.sign(leadMove) !== Math.sign(counterMove)) cost -= .15;
                }
                pair = { ...last, interval: Math.abs(last.lead - last.counter) % 12 };
                pairTime = stage.start;
            }
            paths.push({ score: path.score + cost, last, targets: { ...path.targets, [stage.role]: stage.event.midi }, pair, pairTime, referencePair, pitches: [...path.pitches, midi],
                active: { ...path.active, [stage.role]: { midi, end: stage.end } } });
        }
        const seen = new Map();
        beam = paths.sort((a, b) => a.score - b.score || a.last.lead - b.last.lead || a.last.counter - b.last.counter).filter(p => {
            const id = `${p.last.lead}/${p.last.counter}`, count = seen.get(id) || 0; seen.set(id, count + 1); return count < 2;
        }).slice(0, JOINT_BEAM);
    }
    const chosen = beam[0], output = bars.map(b => ({ bar: b.bar, lead: [], counter: [] }));
    stages.forEach((stage, i) => output.find(b => b.bar === stage.bar)[stage.role].push({ ...stage.event, midi: chosen.pitches[i] }));
    return { key, contexts, bars: output, score: chosen.score, beamWidth: JOINT_BEAM };
}
