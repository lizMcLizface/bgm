const shared = (a, b) => [...new Set(a)].filter(pc => b.includes(pc));
const distance = (a, b) => Math.min((a - b + 12) % 12, (b - a + 12) % 12);
const movement = (a, b) => a.reduce((sum, pc) => sum + Math.min(...b.map(other => distance(pc, other))), 0) / a.length
    + b.reduce((sum, pc) => sum + Math.min(...a.map(other => distance(pc, other))), 0) / b.length;

/** Compare a small diatonic pool with the original chord. Shared pitch classes
 * are a harmonic connection, not a promise to tie an individual sounding voice.
 */
export function commonToneBridge({ before, original, target, candidates }) {
    const evaluate = chord => {
        const from = shared(chord.pitchClasses, before.pitchClasses), to = shared(chord.pitchClasses, target.pitchClasses);
        return { chord, sharedBefore: from, sharedAfter: to,
            score: movement(before.pitchClasses, chord.pitchClasses) + movement(chord.pitchClasses, target.pitchClasses)
                - 1.5 * (from.length + to.length) };
    };
    const baseline = evaluate(original);
    const choices = candidates.map(evaluate).filter(c => c.sharedBefore.length && c.sharedAfter.length);
    choices.sort((a, b) => a.score - b.score);
    const best = choices[0];
    // Require a useful improvement; retain an already connected progression.
    if (!best || best.score + .75 >= baseline.score) return null;
    if (best.chord.pitchClasses.join(',') === original.pitchClasses.join(',')) return null;
    return { chord: best.chord, sharedBefore: best.sharedBefore, sharedAfter: best.sharedAfter };
}
