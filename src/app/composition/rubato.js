// Rubato at cadences (settings.rubato, 0..1): the last beats before a phrase ends slow a little,
// more before a section changes and most into the piece's final chord, and the next bar is back
// in tempo. A bar carries it as one tempo scale per unit (beat); playback (Generator.onBeat) and
// renders (engine/render.js) both time the bar from it.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// how much slower the very last beat is at full rubato
const DEPTH = { phrase: 0.07, section: 0.14, ending: 0.28 };

/** The tempo scales of a bar's units (1 = in tempo), or null when it keeps strict time. */
export function planRubato({ bar, state, meter, endBar = null, amount = 0 }) {
    if (!(amount > 0)) return null;
    const section = state?.phrase?.section;
    const phraseStart = state?.composition?.phrase?.start ?? state?.phrase?.start ?? bar;
    const phraseBars = state?.composition?.phrase?.bars ?? 4;
    const kind = endBar !== null && bar === endBar - 1 ? 'ending'
        : section?.bars && bar === section.start + section.bars - 1 ? 'section'
            : bar === phraseStart + phraseBars - 1 ? 'phrase' : null;
    if (!kind) return null;
    const units = meter.units, span = Math.max(2, Math.ceil(units / 2)), depth = DEPTH[kind] * amount;
    return Array.from({ length: units }, (_, k) => {
        const p = (k - (units - span) + 1) / span;
        return p <= 0 ? 1 : 1 - depth * p ** 1.5;
    });
}

/** Seconds from the bar's start to `beat` (a unit position, may be fractional or past the bar). */
export function rubatoTime(scales, unitSeconds, beat) {
    if (!scales) return beat * unitSeconds;
    let t = 0;
    const whole = Math.floor(beat);
    for (let k = 0; k < whole; k++) t += unitSeconds / (scales[clamp(k, 0, scales.length - 1)] ?? 1);
    if (beat < 0) return beat * unitSeconds / (scales[0] ?? 1);
    return t + (beat - whole) * unitSeconds / (scales[clamp(whole, 0, scales.length - 1)] ?? 1);
}
