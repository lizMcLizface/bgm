// Melodic ornaments (settings.ornaments, 0..1) on the lead and second lead: grace notes,
// mordents, turns into the next note and slow trills on long holds, each suited to the voice
// (composition/instrumentGroove.js: a swelling pad gets none, a wind can trill, keys and plucked
// strings take quick graces and mordents). Neighbours come from the bar's melodic scale. At most
// one ornament per voice per bar; seeded, so a bar plans the same each time.
import { seeded } from '../random';
import { grooveProfile } from './instrumentGroove';

const KINDS = {
    keys: ['grace', 'mordent'], plucked: ['grace', 'mordent'], tight: ['grace', 'mordent', 'trill'],
    breath: ['grace', 'turn', 'trill'], neutral: ['grace', 'turn', 'trill'], swell: [],
};
const CHANCE = { grace: 0.2, mordent: 0.1, turn: 0.12, trill: 0.08 };

const neighbour = (midi, pcs, direction) => {
    for (let m = midi + direction; Math.abs(m - midi) <= 3; m += direction) if (pcs.includes(((m % 12) + 12) % 12)) return m;
    return midi + direction * 2;
};

export function ornamentNotes(events, { amount = 0, bar, seed = 0, voices = {}, scalePcs = [], unitSeconds }) {
    if (!(amount > 0) || !scalePcs.length) return events;
    const rng = seeded((seed ^ Math.imul(bar + 1, 0x9e3779b1)) >>> 0);
    const out = [];
    for (const role of ['lead', 'counter']) {
        const notes = events.filter((e) => e.role === role).sort((a, b) => a.beat - b.beat);
        const kinds = KINDS[grooveProfile(voices[role])] ?? [];
        let done = false;
        notes.forEach((e, i) => {
            const roll = rng();
            if (done || !kinds.length) return;
            const prevEnd = i ? notes[i - 1].beat + notes[i - 1].length : -0.5, next = notes[i + 1];
            const seconds = e.length * unitSeconds, quick = (s, max) => Math.min(max, s / unitSeconds);
            const upper = neighbour(e.midi, scalePcs, 1), lower = neighbour(e.midi, scalePcs, -1);
            // a grace note takes its moment from the end of a long note before it, if it needs to
            const g = quick(0.07, 0.25), prev = notes[i - 1];
            const borrow = prev && prevEnd > e.beat - g && prev.length > 4 * g && prev.beat + prev.length <= e.beat + 1e-9;
            const fits = {
                grace: (e.beat - g >= prevEnd || borrow) && seconds >= 0.18,
                mordent: seconds >= 0.35,
                turn: seconds >= 0.8 && next && Math.abs(next.midi - e.midi) <= 2,
                trill: seconds >= 1.5,
            };
            const choices = kinds.filter((k) => fits[k]);
            if (!choices.length) return;
            let threshold = 0;
            const kind = choices.find((k) => roll < (threshold += CHANCE[k] * amount));
            if (!kind) return;
            done = true;
            const note = (midi, beat, length, level) => ({ ...e, midi, beat, length, velocity: e.velocity * level, ornament: kind });
            if (kind === 'grace') {
                if (prev && prevEnd > e.beat - g) prev.length = e.beat - g - prev.beat;
                out.push(note(rng() < 0.7 ? upper : lower, e.beat - g, g * 0.9, 0.72));
            } else if (kind === 'mordent') {
                const d = quick(0.06, 0.125);
                out.push(note(e.midi, e.beat, d, 1), note(upper, e.beat + d, d, 0.8));
                Object.assign(e, { beat: e.beat + 2 * d, length: e.length - 2 * d, velocity: e.velocity * 0.9 });
            } else if (kind === 'turn') {
                // the last moments of the note wind round it into the next: upper, note, lower, note
                const d = quick(0.09, 0.25), from = e.beat + e.length - 4 * d;
                out.push(note(upper, from, d, 0.82), note(e.midi, from + d, d, 0.78), note(lower, from + 2 * d, d, 0.8), note(e.midi, from + 3 * d, d * 0.95, 0.82));
                e.length -= 4 * d;
            } else {
                // a slow trill over the first part of a long note, then the note held
                const d = quick(1 / 6, 0.5), count = Math.min(8, Math.floor((e.length * 0.4) / d / 2) * 2);
                for (let k = 0; k < count; k++) out.push(note(k % 2 ? upper : e.midi, e.beat + k * d, d * 0.95, k % 2 ? 0.78 : 0.85));
                Object.assign(e, { beat: e.beat + count * d, length: e.length - count * d });
            }
        });
    }
    events.push(...out);
    return events;
}
