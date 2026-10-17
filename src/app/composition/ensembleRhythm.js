import { groupStarts } from '../meter';
import { seeded, normal } from '../random';
import { DRUMS } from '../percussion';
import { grooveFeel } from './instrumentGroove';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const source = (seed, index, salt) => seeded(Math.imul(seed ^ salt, 1664525) ^ Math.imul(index + 1, 1013904223));

// This is the ensemble's reference rhythm even when the drum part is off.
export function phraseRhythm({ seed, start, meter, bassStyle, role, section, bars = 4 }) {
    const rng = source(seed, start, 0x5be0cd19);
    const accents = groupStarts(meter), step = meter.unitsPerBeat === 3 ? 1 : 0.5;
    return { start, bars: Array.from({ length: bars }, (_, index) => {
        const pickup = index === bars - 1 && ['half', 'drive'].includes(bassStyle)
            && section?.transition !== 'release'
            && rng() < (section?.transition === 'arrival' ? 1 : role === 'return' ? 0.35 : 0.7) ? meter.units - step : null;
        return { accents: [...accents], kicks: [...(meter.unitsPerBeat === 3 ? [0] : accents), ...(pickup === null ? [] : [pickup])], pickup,
            closing: index === bars - 1 };
    }) };
}

export function barRhythm({ phrase, bar, meter, lead }) {
    const base = phrase.bars[Math.max(0, Math.min(phrase.bars.length - 1, bar - phrase.start))];
    const guard = meter.unitsPerBeat * 0.3, step = meter.unitsPerBeat === 3 ? 1 : 0.5;
    const leadAttacks = lead.map(e => e.beat);
    const clear = at => leadAttacks.every(attack => Math.abs(at - attack) >= guard - 1e-6);
    const answers = Array.from({ length: Math.ceil(meter.units / step) }, (_, i) => i * step).filter(clear);
    const pickup = base.pickup !== null && clear(base.pickup) ? base.pickup : null;
    return { phraseStart: phrase.start, bar, accents: base.accents,
        kicks: base.kicks.filter(at => at !== base.pickup || pickup !== null), pickup,
        closing: base.closing, leadAttacks, answers, guard };
}

/** Protect chord entrances; let rhythmic accompaniment answer nearby attacks. */
export function spaceAccompaniment(events, { rhythm, meter, style, enabled }) {
    if (!enabled || !rhythm.leadAttacks.length || ['sustain', 'rolled', 'stacked'].includes(style)) return events;
    const collision = at => rhythm.leadAttacks.some(t => Math.abs(at - t) < rhythm.guard);
    let dropped = 0;
    const budget = Math.floor(events.length / 3);
    const out = [];
    for (const e of events) {
        if (e.beat === 0 || !collision(e.beat)) { out.push(e); continue; }
        if (style === 'pulse') {
            const answer = rhythm.answers.find(at => at > e.beat && at - e.beat <= meter.unitsPerBeat * 0.75);
            if (answer !== undefined) {
                const end = Math.min(meter.units, e.beat + e.length);
                if (end - answer > 0.06) out.push({ ...e, beat: answer, length: end - answer, velocity: e.velocity * 0.92 });
                else out.push({ ...e, velocity: e.velocity * 0.75 });
            } else out.push({ ...e, velocity: e.velocity * 0.75 });
        } else if (dropped < budget) dropped++;
        else out.push({ ...e, velocity: e.velocity * 0.8 });
    }
    // Moving attacks must not retrigger the same pitch before its old gate ends.
    out.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
    const unique = [];
    for (const event of out) {
        const previous = unique.find(e => e.midi === event.midi && e.beat === event.beat);
        if (previous) {
            previous.velocity = Math.max(previous.velocity, event.velocity);
            previous.length = Math.max(previous.length, event.length);
        } else unique.push({ ...event });
    }
    return unique.map((e, i) => {
        const next = unique.slice(i + 1).find(n => n.midi === e.midi && n.beat > e.beat);
        return next ? { ...e, length: Math.max(0.01, Math.min(e.length, next.beat - e.beat - 0.01)) } : e;
    });
}

export function spaceCounter(events, { rhythm, meter, lead }) {
    if (!lead.length) return events;
    const used = new Set(), out = [];
    for (const event of [...events].sort((a, b) => a.beat - b.beat)) {
        let beat = event.beat;
        if (rhythm.leadAttacks.some(at => Math.abs(at - beat) < rhythm.guard)) {
            const candidate = rhythm.answers.find(at => at >= beat && at - beat <= meter.unitsPerBeat && !used.has(at));
            if (candidate === undefined) continue;
            beat = candidate;
        }
        if (used.has(beat)) continue;
        used.add(beat);
        out.push({ ...event, beat, length: Math.max(0.06, Math.min(event.length, meter.units - beat)) });
    }
    out.sort((a, b) => a.beat - b.beat);
    return out.map((e, i) => ({ ...e, length: Math.min(e.length, i + 1 < out.length ? (out[i + 1].beat - e.beat) * 0.94 : meter.units - e.beat) }));
}

// Shared motion is indexed by felt beat rather than event traversal order.
// Bass and kick stay together; other parts have smaller independent offsets.
export function performEnsemble(events, { timing = 0, velocity = 0, detune = 0 }, unitSeconds, seed, bar, meter, groove) {
    for (const e of events) {
        const name = e.role === 'perc' ? DRUMS[e.midi] : e.role;
        const locked = ['bass', 'kick', 'punch'].includes(name);
        const beat = Math.floor((e.beat + 1e-6) / meter.unitsPerBeat);
        const common = beat === 0 && e.beat === 0 ? 0 : normal(source(seed, bar * 32 + beat, 0xa54ff53a), timing * 0.4 / 1000);
        const tag = [...`${name}/${e.midi}/${e.beat.toFixed(4)}`].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
        const rng = source(seed, bar, tag);
        const personal = locked ? 0 : normal(rng, timing * 0.15 / 1000);
        const laidBack = ['brush', 'snare', 'clap'].includes(name) ? timing * 0.15 / 1000 : 0;
        const anchor = e.role === 'perc' && e.beat === 0;
        const feel = groove ? grooveFeel(groove, e.role, name) : null;
        // Chord pitches share a strike; per-note velocity/detune retain their old stream.
        const groupTag = [...`${name}/${e.beat.toFixed(4)}`].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);
        const motion = feel ? common * feel.common + normal(source(seed, bar, groupTag), timing * feel.scatter / 1000) + timing * feel.delay / 1000
            : common + personal + laidBack;
        const offset = anchor ? 0 : motion / unitSeconds;
        e.beat = clamp(e.beat + offset, bar === 0 || e.role === 'perc' ? 0 : -0.5, meter.units - 0.001);
        e.velocity = clamp(e.velocity * (1 + normal(rng, velocity)), 0.05, 1);
        if (e.role !== 'perc') e.detune = normal(rng, detune);
    }
}
