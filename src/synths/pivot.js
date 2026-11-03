// Key tracking in the Oracle 5 and Oberon Xa used to count from the lowest key (C2, MIDI 36), as the hardware's CV does,
// so the cutoff control was the cutoff at C2. It now counts from middle C (MIDI 60) like UADx PolyMAX and OB-Xd
// (docs/VST_MATCHING.md), so the control is the cutoff at C4. Sounds authored or decoded against the old pivot keep
// their sound by raising the cutoff 2 octaves per unit of tracking.
export const PIVOT_OCTAVES=(60-36)/12;

/**
 * The cutoff that sounds the same under the new pivot; `track` is the tracking fraction (0, 0.5, 1 ...). The old table clamped the
 * cutoff to `min` before tracking applied, so a decoded cutoff below it did too.
 */
export const fromLowestKeyPivot=(cutoff,track,max=40000,min=20)=>track>0?Math.min(max,Math.max(min,cutoff)*2**(PIVOT_OCTAVES*track)):cutoff;

/**
 * The Oracle 5's ladder used to be made up by 1 + 0.3 k (k = 4.6 res) for the passband it loses to resonance; UADx PolyMAX
 * loses it too and has no make-up, so the engine dropped it. This is the volume factor (volume is squared) that restores the
 * level of sounds made against the old engine.
 */
export const ladderMakeupVolume=res=>Math.sqrt(1+0.3*4.6*res);
