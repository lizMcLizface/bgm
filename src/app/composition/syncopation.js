import { seeded } from '../random';

/**
 * Anticipation: a note on a beat is pulled half a beat early and keeps its end, so the beat itself has no attack and the
 * ear hears the rhythm pushed forward. This is the standard syncopation move (Longuet-Higgins & Lee; Keith) and it stays
 * inside the bar. The other move delays a held downbeat note half a beat. `amount` is the share of eligible beats pushed; the cadence bar is pushed least so a phrase still lands.
 */
export function syncopate(notes, { amount = 0, meter, seed = 1, bar = 0, index = 0, bars = 4, protectedBeats = [], keepLast = false, weight = 1, delay = false }) {
    if (!(amount > 0) || !notes.length) return notes;
    const shift = meter.unitsPerBeat === 3 ? 1 : 0.5, beatSize = meter.unitsPerBeat;
    const position = index === bars - 1 ? 0.3 : index === 0 ? 0.7 : 1;
    const chance = Math.min(1, amount * position * weight * 0.9);
    const rng = seeded(seed ^ Math.imul(bar + 1, 0x9e3779b1) ^ 0x51ed270b);
    const out = notes.map(n => ({ ...n }));
    // A held downbeat note can instead arrive half a beat late (rest, then the note across the beat); the first bar and the cadence bar stay put.
    if (delay && index > 0 && index < bars - 1 && out[0].beat === 0 && out[0].length >= 1 && rng() < chance * 0.6
        && !protectedBeats.some(b => b < shift + 1e-6) && (out.length === 1 || out[1].beat >= shift + 0.25 + 1e-6)) {
        out[0].beat = shift;
        out[0].length -= shift;
    }
    for (let i = 1; i < out.length; i++) {
        const draw = rng(), note = out[i], prev = out[i - 1], target = note.beat - shift;
        if (draw >= chance || (keepLast && i === out.length - 1)) continue;
        if (Math.abs(note.beat / beatSize - Math.round(note.beat / beatSize)) > 1e-6) continue; // only notes that sit on a beat
        if (protectedBeats.some(b => Math.abs(b - note.beat) < 1e-6 || Math.abs(b - target) < 1e-6)) continue;
        if (prev.beat + 0.25 > target + 1e-6) continue; // no room before it
        if (prev.beat + prev.length > target) prev.length = target - prev.beat;
        note.beat = target;
        note.length += shift;
    }
    return out;
}
