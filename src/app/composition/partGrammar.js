import { seeded } from '../random';

export function planPartGrammar({ seed, phrase, roles = {} }) {
    const rng = seeded(seed ^ Math.imul(phrase.start + 1, 0xa54ff53a));
    const operations = role => Array.from({ length: phrase.bars }, () => {
        const choices = roles[role] === 'space' || roles[role] === 'answer'
            ? ['breathe', 'breathe', 'hold', 'pickup'] : ['hold', 'breathe', 'short', 'pickup'];
        return choices[Math.floor(rng() * choices.length)];
    });
    return { start: phrase.start, bars: phrase.bars, pad: operations('pad'), counter: operations('counter'),
        counterRest: 1 + Math.floor(rng() * Math.max(1, phrase.bars - 2)) };
}

/** Phrase space belongs to active parts too. No attacks are added. */
export function partGrammar(events, { plan, role, index, meter, style, enabled = true, lead = [] }) {
    // Running figures need every step and may ring across the bar line.
    if (!enabled || !events.length || role === 'pad' && ['sustain', 'rolled', 'stacked', 'arpeggio', 'sequence'].includes(style)) return events;
    if (role === 'counter' && index === plan.counterRest && lead.length) return [];
    let out = events.map(e => ({ ...e }));
    const operation = plan[role][index], beat = meter.unitsPerBeat, step = beat === 3 ? 1 : .5;
    const groups = [...new Set(out.map(e => e.beat))].sort((a, b) => a - b);
    const last = groups.at(-1);
    if (operation === 'breathe') {
        if (groups.length > 2) {
            // Remove one interior attack group, preserving the entrance and final idea.
            const at = groups.at(-2), before = groups.at(-3);
            out = out.filter(e => e.beat !== at).map(e => e.beat === before
                ? { ...e, length: Math.min(e.length, Math.max(.04, at - e.beat - step * .25)) } : e);
        }
        out = out.map(e => e.beat === last ? { ...e, length: Math.min(e.length, beat * .45) } : e);
    }
    if (operation === 'short') out = out.map(e => e.beat === last ? { ...e, length: Math.min(e.length, beat * .55) } : e);
    if (operation === 'pickup' && groups.length > 1) {
        const before = groups.at(-2), target = last - step;
        if (target >= before + step && target > 0) out = out.map(e => e.beat === last
            ? { ...e, beat: target, length: e.length + step }
            : e.beat === before ? { ...e, length: Math.min(e.length, target - e.beat) } : e);
    }
    if (operation === 'hold') {
        for (let i = 1; i < groups.length; i++) {
            const a = out.filter(e => e.beat === groups[i - 1]), b = out.filter(e => e.beat === groups[i]);
            const pitches = notes => notes.map(e => e.midi).sort((x, y) => x - y).join(',');
            if (pitches(a) !== pitches(b) || a.some(e => groups[i] - e.beat - e.length > beat * .2)) continue;
            out = out.filter(e => e.beat !== groups[i]).map(e => e.beat === groups[i - 1]
                ? { ...e, length: groups[i] + b.find(n => n.midi === e.midi).length - e.beat } : e);
            break;
        }
    }
    out.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    return out.map((e, i) => {
        const next = out.slice(i + 1).find(n => n.midi === e.midi && n.beat > e.beat);
        return { ...e, length: Math.min(e.length, meter.units - e.beat, next ? next.beat - e.beat : Infinity) };
    }).filter(e => e.length > 0);
}
