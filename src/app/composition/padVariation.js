import { seeded } from '../random';

// A pad figure that comes round every bar unchanged (an arpeggio the same way up each time) is what makes a held chord feel like a loop. Nothing is drawn from the arrangement's own random source: the choices come from the seed and the bar, so the
// rest of a piece is exactly as it was.
//
// Running figures (arpeggio, sequence): the first bar of a chord is the statement; a later bar of the same chord, and every second bar of a phrase,
// plays the figure differently - backwards, started from another note, with one step let go, or ending an octave higher.

const FIGURES = ['reverse', 'thin', 'rotate', 'lift'];
const hashOf = (seed, start) => Math.floor(seeded(Math.imul(seed ^ 0x3c6ef372, 1664525) ^ Math.imul(start + 1, 1013904223))() * 4096);

/** Whether this bar plays a variation: a later bar of a held chord, or an odd bar of the phrase. */
export const variesBar = ({ index, chordBar }) => chordBar >= 1 || index % 2 === 1;

/** Which variation: successive bars of a chord (or successive pairs of phrase bars) take successive ones, offset by the phrase's own hash. */
const choice = (list, { seed, phraseStart, index, chordBar }) => list[(hashOf(seed, phraseStart) + (chordBar > 0 ? chordBar : index >> 1)) % list.length];

/**
 * @param {object[]} events the bar's pad events as the arranger made them
 * @param {object} args { style, index (bar within the phrase), chordBar (0 on the chord's first bar), seed, phraseStart, range [low, high] }
 */
export function varyPad(events, { style, index, chordBar, seed, phraseStart, range }) {
    if (!variesBar({ index, chordBar })) return events;
    const pick = { seed, phraseStart, index, chordBar };
    if (style === 'arpeggio' || style === 'sequence') {
        const steps = [...new Set(events.map((e) => e.beat))].sort((a, b) => a - b);
        // one note per step only: a figure of chords (pulse) is not this
        if (steps.length < 3 || events.length !== steps.length) return events;
        const ordered = steps.map((beat) => events.find((e) => e.beat === beat)), n = ordered.length, midis = ordered.map((e) => e.midi);
        const same = (a) => a.every((m, i) => m === midis[i]);
        const variants = {
            reverse: () => [...midis].reverse(),
            rotate: () => [Math.ceil(n / 2), 2, 1, 3].map((k) => midis.map((_, i) => midis[(i + k) % n])).find((a) => !same(a)) ?? midis,
            lift: () => { const top = range?.[1] ?? Infinity; return midis.map((m, i) => (i >= n - 2 && m + 12 <= top ? m + 12 : m)); },
            thin: () => midis,
        };
        // the chosen variation, or the next that changes anything (a figure that is its own reverse, a register with no room above)
        const first = FIGURES.indexOf(choice(FIGURES, pick));
        const kind = FIGURES.map((_, k) => FIGURES[(first + k) % FIGURES.length]).find((k) => k === 'thin' || !same(variants[k]())) ?? 'thin';
        const next = variants[kind]();
        let out = ordered.map((e, i) => ({ ...e, midi: next[i] }));
        if (kind === 'thin') {
            // let one inner step go: the step before it rings through its place, a little softer all round
            const drop = Math.min(n - 2, Math.max(1, Math.round(n / 2)));
            out = out.filter((_, i) => i !== drop).map((e, i, all) => {
                if (i !== drop - 1) return { ...e, velocity: e.velocity * 0.94 };
                // it may not ring into a later strike of the same note (the accompaniment shaping cuts it there, 10 ms short)
                const again = all.slice(i + 1).find((n) => n.midi === e.midi);
                const length = e.length + (ordered[drop + 1].beat - ordered[drop].beat);
                return { ...e, length: again ? Math.min(length, again.beat - e.beat - 0.01) : length };
            });
        }
        return out;
    }
    return events;
}
