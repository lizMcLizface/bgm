import { beatStarts, groupStarts } from '../meter';
import { seeded } from '../random';

/** A two-bar cell retained for four phrases, with at most one changed weak slot. */
export function planRhythmDevelopment({ seed, phrase, meter, previous }) {
    const cycle = Math.floor(phrase.ordinal / 4), phase = phrase.ordinal % 4;
    const key = `${seed}/${meter.units}/${meter.groups}/${cycle}`;
    const rng = seeded(seed ^ Math.imul(cycle + 1, 0x6a09e667) ^ meter.units);
    const step = meter.unitsPerBeat === 3 ? 1 : .5, beats = beatStarts(meter);
    const weak = Array.from({ length: Math.ceil(meter.units / step) }, (_, i) => i * step).filter(at => !beats.includes(at));
    const cells = Array.from({ length: 2 }, () => {
        const pool = [...weak], chosen = [];
        while (pool.length && chosen.length < 2) chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
        return chosen.sort((a, b) => a - b);
    });
    const start = previous?.key === key ? previous.grooveStart : phrase.start;
    const roles = phase === 1 ? { pad: 'answer', counter: 'support' }
        : phase === 2 ? { pad: 'space', counter: 'answer' } : { pad: 'support', counter: 'answer' };
    const changedCell = phase === 1 || phase === 2 ? Math.floor(rng() * 2) : null;
    const mutation = changedCell === null ? null : weak.filter(at => !cells[changedCell].includes(at))[Math.floor(rng() * Math.max(1, weak.length - cells[changedCell].length))] ?? null;
    return { key, cycle, phase, start: phrase.start, grooveStart: start, cells, roles, changedCell, mutation,
        accents: groupStarts(meter), closing: phrase.start + phrase.bars - 1 };
}

export function developBarRhythm(rhythm, plan, bar, meter) {
    const cell = (bar - plan.start) % 2, preferred = [...plan.cells[cell]];
    if (cell === plan.changedCell && plan.mutation !== null && preferred.length) preferred[preferred.length - 1] = plan.mutation;
    preferred.sort((a, b) => a - b);
    const priority = at => preferred.includes(at) ? 0 : 1;
    return { ...rhythm, roles: plan.roles, preferred,
        answers: [...rhythm.answers].sort((a, b) => priority(a) - priority(b) || a - b),
        groove: { start: plan.grooveStart, ornamentBar: plan.cycle * 2 + cell,
            ornamentBeat: preferred.at(-1) ?? meter.units - (meter.unitsPerBeat === 3 ? 1 : .5) } };
}

/** One attack group may move per bar; held textures and chord entrances stay put. */
export function shapeRhythmicPart(events, { role, style, rhythm, meter, enabled = true }) {
    if (!enabled || !events.length || ['sustain', 'rolled', 'stacked'].includes(style)) return events;
    const functionName = rhythm.roles?.[role];
    if (!functionName) return events;
    const collides = at => rhythm.leadAttacks.some(t => Math.abs(t - at) < rhythm.guard);
    const groups = [...new Set(events.map(e => e.beat))].sort((a, b) => a - b);
    const running = role === 'pad' && ['arpeggio', 'sequence'].includes(style);
    let moved = false;
    const moves = new Map();
    for (const beat of groups) {
        if (running || beat === 0 || moved || functionName !== 'answer') continue;
        const end = Math.min(...events.filter(e => e.beat === beat).map(e => e.beat + e.length), meter.units);
        const target = rhythm.preferred.find(at => at > beat && at - beat <= meter.unitsPerBeat
            && at < end - .06 && !groups.some(t => Math.abs(t - at) < .06) && !collides(at));
        if (target !== undefined) { moves.set(beat, target); moved = true; }
    }
    const result = events.map(event => {
        const beat = moves.get(event.beat) ?? event.beat;
        const accented = rhythm.accents.includes(beat) || rhythm.preferred.includes(beat);
        const level = functionName === 'space' && collides(beat) ? .7
            : functionName === 'answer' && collides(beat) ? .8 : accented ? 1 : .9;
        return { ...event, beat, length: Math.max(.01, event.length - (beat - event.beat)), velocity: event.velocity * level };
    }).sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    return result.map((e, i) => {
        const next = result.slice(i + 1).find(n => n.midi === e.midi && n.beat > e.beat);
        return next ? { ...e, length: Math.min(e.length, Math.max(.01, next.beat - e.beat - .01)) } : e;
    });
}
