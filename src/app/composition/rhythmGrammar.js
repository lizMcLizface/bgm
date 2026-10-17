import { seeded } from '../random';

export function planRhythmGrammar({ seed, phrase, ending }) {
    const rng = seeded(seed ^ Math.imul(phrase.start + 1, 0xbb67ae85));
    const vocabulary = ['hold', 'syncopate', 'pickup', 'breathe'];
    const operations = Array.from({ length: phrase.bars }, (_, offset) =>
        offset < 2 && ['statement', 'return'].includes(phrase.role) ? 'identity' : vocabulary[Math.floor(rng() * vocabulary.length)]);
    const endings = ending === 'open' ? ['pickup', 'short', 'breathe'] : ['hold', 'hold', 'short', 'breathe'];
    operations[phrase.bars - 1] = endings[Math.floor(rng() * endings.length)];
    return { start: phrase.start, bars: phrase.bars, operations };
}

/** Rearticulate an existing motif; never add attacks or change its final degree. */
export function grammarMotif(notes, { plan, offset, meter }) {
    const out = notes.map(n => ({ ...n }));
    if (!out.length) return out;
    const operation = plan.operations[offset], beat = meter.unitsPerBeat, step = beat === 3 ? 1 : .5;
    const last = out.at(-1);
    if (operation === 'hold') last.length = meter.units - last.beat;
    if (operation === 'short') last.length = Math.min(last.length, beat * .4);
    if (operation === 'breathe' && out.length > 2) {
        const index = out.findLastIndex((n, i) => i > 0 && i < out.length - 1 && !n.accent);
        if (index >= 0) out.splice(index, 1);
        else last.length = Math.min(last.length, beat * .55);
    }
    if (operation === 'pickup' && out.length > 1) {
        const before = out.at(-2), at = last.beat - step;
        if (at >= before.beat + step && at > 0) {
            last.length += last.beat - at; last.beat = at; last.accent = false;
            before.length = Math.min(before.length, at - before.beat);
        }
    }
    if (operation === 'syncopate') {
        const index = out.findIndex((n, i) => i > 0 && n.beat % beat === 0 && n.beat + step < (out[i + 1]?.beat ?? meter.units));
        if (index >= 0) { out[index].beat += step; out[index].length = Math.max(.04, out[index].length - step); out[index].accent = false; }
    }
    return out.map((n, i) => ({ ...n, length: Math.min(n.length, meter.units - n.beat, out[i + 1] ? out[i + 1].beat - n.beat : Infinity) })).filter(n => n.length > 0);
}

/** Tie equal pitches only, preserving all explicit resolutions and cadence targets. */
export function tieMelody(plan, { bars, meter, seed, previousMidi, pending = [], chance = .4 }) {
    const result = { ...plan, bars: plan.bars.map(b => ({ ...b, events: b.events.map(e => ({ ...e })) })), ties: [] };
    const used = new Set(), position = (bar, event) => ({ bar, beat: event.beat, midi: event.midi });
    const protectedNote = (bar, event) => plan.resolutions?.some(r => [r.from, r.to].some(p => p.bar === bar && p.beat === event.beat))
        || ((plan.destination?.closing && plan.destination.bar === bar || bars.find(b => b.bar === bar)?.midpoint)
            && event === result.bars.find(b => b.bar === bar)?.events.at(-1));
    const first = result.bars[0], incoming = pending.find(t => t.from.bar < first.bar && t.to.bar === first.bar && t.from.midi === previousMidi);
    if (incoming && first.events[0]?.midi === incoming.to.midi && first.events[0]?.beat === incoming.to.beat
        && !protectedNote(first.bar, first.events[0]) && bars[0].chord.pitchClasses.includes(incoming.to.midi % 12)) {
        first.events.shift(); result.ties.push(incoming); used.add(Math.floor(first.bar / 2));
    }
    for (let bi = 0; bi < result.bars.length; bi++) {
        const b = result.bars[bi], context = bars[bi], cell = Math.floor(b.bar / 2);
        if (used.has(cell) || seeded(seed ^ Math.imul(b.bar + 1, 0x3c6ef372))() >= chance) continue;
        let tied = false;
        for (let i = 1; i < b.events.length; i++) {
            const before = b.events[i - 1], next = b.events[i];
            if (before.midi !== next.midi || next.beat - before.beat - before.length > meter.unitsPerBeat * .16
                || protectedNote(b.bar, before) || protectedNote(b.bar, next)) continue;
            before.length = next.beat + next.length - before.beat;
            result.ties.push({ from: position(b.bar, before), to: position(b.bar, next) });
            b.events.splice(i, 1); used.add(cell); tied = true; break;
        }
        if (tied || !result.bars[bi + 1]) continue;
        const next = result.bars[bi + 1], following = bars[bi + 1], left = b.events.at(-1), right = next.events[0];
        if (!left || !right || next.events.length < 2 || right.beat !== 0 || left.midi !== right.midi
            || JSON.stringify(context.chord.pitchClasses) !== JSON.stringify(following.chord.pitchClasses)
            || !context.chord.pitchClasses.includes(left.midi % 12) || !following.scalePcs.includes(left.midi % 12)
            || next.events[1].beat < meter.unitsPerBeat || meter.units - left.beat - left.length > meter.unitsPerBeat * .16
            || protectedNote(b.bar, left) || protectedNote(next.bar, right)) continue;
        const ratio = context.bpm && following.bpm ? context.bpm / following.bpm : 1;
        left.length = meter.units - left.beat + (next.events[1].beat - meter.unitsPerBeat * .06) * ratio;
        result.ties.push({ from: position(b.bar, left), to: position(next.bar, right) });
        next.events.shift(); used.add(cell); used.add(Math.floor(next.bar / 2));
    }
    return result;
}
