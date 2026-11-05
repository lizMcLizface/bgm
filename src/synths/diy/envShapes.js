// The stage shapes of the DI-Poly envelopes (the `*Shape` parameters, synth-engine/src/lib.rs `shaped`). A stage's progress runs 0..1 along
// its shape; the curve exponent bends it. Power is the engine's own curve (progress^c). Logarithmic is the same curve mirrored: it moves
// fast at first and settles slowly, which is how the front page's original synth drew its decays. Sine is a quarter sine raised to c.
export const SHAPE_NAMES = ['Power', 'Logarithmic', 'Sine'];
const HALF_SINE = Math.SQRT1_2;

/** Progress 0..1 along a stage at `x` (0..1), for a curve exponent `c` and a shape. */
export function stageShape(x, c, mode = 0) {
    if (mode === 1) return 1 - (1 - x) ** c;
    if (mode === 2) return Math.sin(x * Math.PI / 2) ** c;
    return x ** c;
}

/** The exponent that puts a stage's midpoint at `progress`, the inverse of stageShape at x = .5 (the editor drags the midpoint). */
export function exponentAt(progress, mode = 0) {
    const p = Math.min(.95, Math.max(.05, progress));
    if (mode === 1) return Math.log(1 - p) / Math.log(.5);
    if (mode === 2) return Math.log(p) / Math.log(HALF_SINE);
    return Math.log(p) / Math.log(.5);
}
