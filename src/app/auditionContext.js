// The harmony the audition phrases and the voice picker's key panel show: the key and
// scale the music is in, and the chord under the playhead with the next few after it.

import { chordBlocks } from './timelineDraw';
import { rememberContext } from './auditionPhrases';

const CHORDS = 4;

/**
 * @param {Array} plan - Generator.getPlan()
 * @param {number} beatsPerBar
 * @param {number} position - the playhead, in beats
 * @returns {{ key: string, scalePcs: number[], chords: Array<{ name: string, numeral: string, pitchClasses: number[] }> } | null}
 */
export function contextFromPlan(plan, beatsPerBar, position) {
    const blocks = chordBlocks(plan, beatsPerBar);
    if (!blocks.length) return null;
    const found = blocks.findIndex((b) => position >= b.start && position < b.end);
    const chords = [];
    for (const { chord } of blocks.slice(Math.max(0, found))) {
        if (chords.length && chords[chords.length - 1].name === chord.name) continue;
        chords.push({ name: chord.name, numeral: chord.numeral, pitchClasses: chord.pitchClasses });
        if (chords.length === CHORDS) break;
    }
    const { chord: now } = blocks[Math.max(0, found)];
    const context = { key: now.keyName, scalePcs: now.scalePcs, chords };
    rememberContext(context);
    return context;
}
