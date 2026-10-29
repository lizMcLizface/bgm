// A harmonic context (see auditionPhrases.js) made from a key, a scale and a progression
// of the bank, the way the generator spells them: for the /synths pages, which pick their
// own key to audition in.

import PROGRESSIONS from './progressions';
import { scaleById, scaleSemitones, spellScale, romanDegree, diatonicChord, chordSymbol, displayNumeral } from './theory';

/** Natural minor, on A, over i VI III VII. */
export const DEFAULT_HARMONY = { tonic: 9, mode: 'Major-6', progression: 6 };

export function buildContext({ tonic, mode, progression } = DEFAULT_HARMONY) {
    const scale = scaleSemitones(scaleById(mode).intervals);
    const names = spellScale(tonic, scale);
    const numerals = PROGRESSIONS[progression] ?? PROGRESSIONS[DEFAULT_HARMONY.progression];
    const chords = numerals.slice(0, 4).map((numeral) => {
        const degree = romanDegree(numeral);
        const offsets = diatonicChord(scale, degree, 3);
        return {
            name: names[(degree - 1) % scale.length] + chordSymbol(offsets),
            numeral: displayNumeral(numeral, offsets),
            pitchClasses: offsets.map((o) => (tonic + o) % 12),
        };
    });
    return { key: `${names[0]} ${scaleById(mode).name}`, scalePcs: scale.map((st) => (tonic + st) % 12), chords };
}
