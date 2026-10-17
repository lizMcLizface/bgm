const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = (v) => ((v % 12) + 12) % 12;
const fifthDistance = (pc) => { const f = wrap(pc * 7); return f > 6 ? f - 12 : f; };
const SECTION_LIGHT = { intro: -0.05, breakdown: -0.06, build: -0.01, full: 0.04 };

// Musical associations are a visual interpretation: major leans warm, minor
// cool; dissonance increases contrast. The selected palette remains the base.
export function musicMood(heard, planned, activity = 0.3, palette = {}) {
    const tonic = heard.tonic ?? 0, chord = planned?.chord || {};
    const root = chord.pitchClasses?.[0] ?? tonic;
    const intervals = (chord.pitchClasses || []).map(pc => wrap(pc - root));
    const scale = (chord.scalePcs || []).map(pc => wrap(pc - tonic));
    const minorMode = scale.includes(3) && !scale.includes(4);
    const majorMode = scale.includes(4) && !scale.includes(3);
    const minorChord = intervals.includes(3) && !intervals.includes(4);
    const majorChord = intervals.includes(4) && !intervals.includes(3);
    const warmth = (majorMode ? 0.35 : minorMode ? -0.35 : 0) + (majorChord ? 0.65 : minorChord ? -0.65 : 0);
    const harmonicTension=clamp((intervals.includes(6) || intervals.includes(8) ? 0.7 : 0) + (intervals.includes(10) || intervals.includes(11) ? 0.3 : 0), 0, 1);
    const motion=planned?.state?.phrase?.section?.motion;
    const tension=motion?.tension===undefined?harmonicTension:clamp(harmonicTension*.7+motion.tension*.3,0,1);
    const fixed = palette.hue !== undefined;
    const section = planned?.state?.phrase?.section?.type;
    const mono = palette.sat !== undefined && palette.sat <= 0.1;
    return {
        tonic, root, chordPcs: chord.pitchClasses || [], scalePcs: chord.scalePcs || [], warmth, tension,
        hue: (fixed ? palette.hue + warmth * 12 : 305 + warmth * 85 + fifthDistance(tonic) * 12)
            + fifthDistance(root - tonic) * (fixed ? 3 : 6),
        saturation: mono ? palette.sat : clamp((palette.sat ?? 0.58) + activity * 0.12 + tension * 0.08, 0.3, 0.85),
        light: clamp(0.4 + activity * 0.08 + warmth * 0.025 + (SECTION_LIGHT[section] || 0), 0.3, 0.58),
        spread: palette.spread ?? 1, mono,
    };
}

export function noteColour(note, { hue, mood = {}, spread = 40, age = 0 }) {
    const root = mood.root ?? 0;
    const distance = fifthDistance((note.midi % 12) - root);
    const roleOffset = { bass: -0.14, pad: 0, lead: 0.16, counter: -0.24, perc: 0.28 }[note.role] || 0;
    const pitch = clamp((note.midi - 36) / 60, 0, 1), velocity = clamp(note.velocity ?? 0.7, 0, 1);
    const chordTone = (mood.chordPcs || []).includes(wrap(note.midi));
    const colourSpread = spread * (mood.spread ?? 1) * (1 + (mood.tension || 0) * 0.3);
    return {
        // A bounded arc around the palette, rather than an unrestricted rainbow.
        h: hue + colourSpread * (distance / 6 * 0.55 + roleOffset),
        s: mood.mono ? mood.saturation : clamp((mood.saturation ?? 0.65) + velocity * 0.08 + (chordTone ? 0 : 0.04), 0, 0.95),
        l: clamp((mood.light ?? 0.43) + pitch * 0.07 + velocity * 0.07 + (note.bright || 0) * 0.035 + 0.04 * Math.exp(-age / 0.2), 0.25, 0.65),
    };
}
