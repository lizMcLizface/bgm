import { PAD_STYLES, BASS_STYLES, PULSE_PATTERNS, ARP_PATTERNS, CHORD_DIRECTIONS, OCTAVE_LIMITS, OCTAVE_WANDER, SECTION_LENGTHS, styleShares } from '../arranger';

const number = (min, max, integer = false) => value => Number.isFinite(value) && (!integer || Number.isInteger(value)) ? Math.max(min, Math.min(max, value)) : undefined;
const option = values => value => values.includes(value) ? value : undefined;
const fields = schema => value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const result = {};
    for (const [key, validate] of Object.entries(schema)) { const v = validate(value[key]); if (v === undefined) return; result[key] = v; }
    return result;
};
const weights = names => fields(Object.fromEntries(Object.keys(names).map(key => [key, number(0, 100)])));
export const GROUPS = [
    ...Object.entries(OCTAVE_LIMITS).map(([role, [lo, hi]]) => ({ id: `${role}-register`, role, title: 'Register & octave movement', path: `voices.${role}`,
        description: 'Choose the home octave and how it can move between phrases.', validate: fields({ octave: number(lo, hi, true), wander: option(Object.keys(OCTAVE_WANDER)), chance: number(0, 1) }) })),
    { id: 'pad-styles', role: 'pad', title: 'Chord playing styles', path: 'padWeights', weights: true, validate: weights(PAD_STYLES) },
    { id: 'pad-pulses', role: 'pad', title: 'Pulse patterns', path: 'pulseWeights', weights: true, needs: 'pulse', validate: weights(PULSE_PATTERNS) },
    { id: 'pad-arpeggios', role: 'pad', title: 'Arpeggio patterns', path: 'arpWeights', weights: true, needs: 'arpeggio', validate: weights(ARP_PATTERNS) },
    { id: 'pad-directions', role: 'pad', title: 'Rolled & stacked directions', path: 'directionWeights', weights: true, needs: 'directions', validate: weights(CHORD_DIRECTIONS) },
    { id: 'pad-movement', role: 'pad', title: 'Chord movement & swell', path: 'padMotion', description: 'Shape register lean, fast arpeggios and the phrase’s level contour.', validate: fields({ lean: number(0, 1), fast: number(0, 1), swell: number(0, .2) }) },
    { id: 'pad-size', role: 'pad', title: 'Chord size', path: 'padNotes', description: 'Choose triads, sevenths or ninths for the rhythm voice.', validate: option([3, 4, 5]) },
    { id: 'bass-styles', role: 'bass', title: 'Bass playing styles', path: 'bassWeights', weights: true, validate: weights(BASS_STYLES) },
    { id: 'section-reference', title: 'Section length reference', path: 'sections.phrases', description: 'Set the reference span around which sections develop. Latest may adapt their lengths.', needs: 'sections', validate: option(SECTION_LENGTHS) },
    { id: 'ambient-drift-mode', title: 'Level drift movement', path: 'ambienceWander.mode', description: 'Choose smooth waves or a bounded random walk around the mixer levels.', ambient: true, validate: option(['sine', 'brownian']) },
    { id: 'ambient-drift-period', title: 'Level drift period', path: 'ambienceWander.period', description: 'Choose how slowly the ambient levels drift.', ambient: true, validate: number(30, 600) },
];
export const groupValue = (settings, path) => path.split('.').reduce((v, key) => v?.[key], settings);
export function cleanGroups(raw) {
    const result = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
    for (const group of GROUPS) { const value = group.validate(raw[group.id]); if (value !== undefined) result[group.id] = value; }
    return result;
}
export function applyGroups(settings, raw) {
    const result = JSON.parse(JSON.stringify(settings));
    for (const [id, value] of Object.entries(cleanGroups(raw))) {
        const path = GROUPS.find(group => group.id === id).path.split('.'), key = path.pop();
        let target = result; for (const part of path) target = target[part]; target[key] = value;
    }
    return result;
}
export function groupReason(group, settings) {
    if (group.ambient) return !settings.playAmbience ? 'Ambience playback is off. These choices are retained.' : null;
    if (!settings.playMusic) return 'Music playback is off. These choices are retained.';
    if (settings.muted?.[group.role]) return 'This voice is muted. Its playing choices are retained.';
    if (group.role === 'counter' && settings.counter.mode === 'off') return 'The second lead is off. These choices do not enable it.';
    if (group.needs === 'sections') return settings.sections.mode === 'off' ? 'Sections are off. The reference length is retained.' : null;
    const shares = styleShares(settings.padWeights);
    if (group.needs && (group.needs === 'directions' ? shares.rolled + shares.stacked === 0 : shares[group.needs] === 0)) return 'The corresponding chord style has zero share. These pattern choices are retained.';
    return null;
}
