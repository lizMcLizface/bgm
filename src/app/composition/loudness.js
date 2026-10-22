// Even loudness (settings.evenLoudness, 0..1): a bar's note energy (velocity², how long each note
// sounds in it, weighted by role) against the piece's running average sets a slow gain trim for
// the bar, so a bar full of arpeggios and drums is not much louder than a sparse one. Planned with
// the bar (deterministic, so renders match playback); at most ±4 dB, glided over the bar.
const WEIGHT = { lead: 1, counter: 0.8, pad: 0.6, bass: 0.9, perc: 0.5 };
const AVERAGE = 0.08; // running average weight of each new bar (about a dozen bars)
const LIMIT_DB = 4;

export function barEnergy(events, units) {
    let energy = 0;
    for (const e of events) {
        const sounding = Math.max(0, Math.min(units, e.beat + e.length) - Math.max(0, e.beat));
        energy += (WEIGHT[e.role] ?? 0.6) * e.velocity * e.velocity * Math.max(0.1, sounding / units);
    }
    return energy;
}

/** { energy, average, trim } for a bar, from its events and the previous bar's average. */
export function planLoudness(events, units, previousAverage, amount) {
    const energy = barEnergy(events, units);
    const average = previousAverage > 0 ? previousAverage * (1 - AVERAGE) + energy * AVERAGE : energy;
    if (!(amount > 0) || !(energy > 0) || !(average > 0)) return { energy, average, trim: 1 };
    const db = Math.max(-LIMIT_DB, Math.min(LIMIT_DB, 10 * Math.log10(average / energy) * amount));
    return { energy, average, trim: 10 ** (db / 20) };
}
