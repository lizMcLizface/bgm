// Keeps the rhythm layer apart from the pad when both play (settings.layers 'split', docs/SPLIT_LAYERS_PLAN.md stage 2).
// The register and root rules are in the arranger, where the voicings are chosen; these four work on the bar's planned
// notes: the sections the rhythm layer sits out, the pad's attacks it stays off, a ceiling on attacks per beat, the lead's
// notes it leaves alone, and its level.
// Pure; each rule is a switch in settings.layerRules.

const EPS = 0.01;
// The rhythm layer's notes within this many units of a pad note starting are not played (the pad's attack is soft and the rhythm's
// fast: two streams only stay two if they do not begin together). The bar's downbeat is allowed: there the two read as one new chord.
const PAD_ATTACK_WINDOW = 0.13;
// Attacks per beat across the lead, the second lead and the rhythm layer (sixteenths from one voice reach it, from two do not).
export const ATTACKS_PER_BEAT = 4;
// The rhythm layer's velocity against where the same notes would sit alone: forward, because its notes are short and its
// tone is usually softer than a lead's, which covers it (the plan first had it 0.8, under the pad, and it was lost).
export const RHYTHM_LEVEL = 1.15;

const onsets = (list) => [...new Set(list.map((e) => Math.round(e.beat * 1000)))].map((k) => k / 1000).sort((a, b) => a - b);

/** The bar's events with the rhythm layer shaped by the rules switched on. `lead` is the lead's events, which travel apart. */
export function separateLayers(events, { lead = [], rules, section = null, meter }) {
    let rhythm = events.filter((e) => e.role === 'rhythm');
    if (!rhythm.length) return events;
    const others = events.filter((e) => e.role !== 'rhythm');

    // The rhythm layer sits out intros (the pad alone) and breakdowns.
    if (rules.entrances && section && (section.type === 'intro' || section.type === 'breakdown')) rhythm = [];

    if (rules.attacks) {
        const padStarts = onsets(others.filter((e) => e.role === 'pad'));
        rhythm = rhythm.filter((e) => e.beat < EPS || !padStarts.some((at) => Math.abs(at - e.beat) < PAD_ATTACK_WINDOW));
    }

    if (rules.density) {
        const perBeat = meter.unitsPerBeat, beatOf = (e) => Math.floor((e.beat + EPS) / perBeat);
        const busy = new Map();
        for (const e of [...lead, ...others.filter((x) => x.role === 'counter')]) busy.set(beatOf(e), new Set([...(busy.get(beatOf(e)) ?? []), Math.round(e.beat * 1000)]));
        const kept = new Map();
        rhythm = rhythm.filter((e) => {
            const beat = beatOf(e), room = ATTACKS_PER_BEAT - (busy.get(beat)?.size ?? 0), key = Math.round(e.beat * 1000);
            const mine = kept.get(beat) ?? new Set();
            if (!mine.has(key) && mine.size >= Math.max(0, room)) return false;
            mine.add(key); kept.set(beat, mine);
            return true;
        });
    }

    // Where the lead sounds a note, the rhythm layer leaves that note and its octaves out (and anything within two semitones of it): the same
    // notes in a less present tone are lost under the lead, and the leftover chord tones carry the rhythm instead.
    if (rules.clear && lead.length) {
        rhythm = rhythm.filter((e) => !lead.some((l) => l.beat <= e.beat + EPS && e.beat + EPS < l.beat + l.length
            && (Math.abs(l.midi - e.midi) <= 2 || (((l.midi - e.midi) % 12) + 12) % 12 === 0)));
    }

    if (rules.mix) rhythm = rhythm.map((e) => ({ ...e, velocity: Math.min(1, e.velocity * RHYTHM_LEVEL) }));
    return [...others, ...rhythm];
}
