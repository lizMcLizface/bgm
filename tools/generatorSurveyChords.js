import { capturePattern } from '../src/seq/capture';
import { degreeToMidi, makeKey } from '../src/seq/harmony';
import { generatedChords, placedChordEvents, placedChordTones } from '../src/synths/all/placedChords';

const mod = (n, m) => ((n % m) + m) % m;
const signature = notes => notes.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([step, midi]) => `${step}:${midi}`).join(',');
const setSignature = values => [...new Set(values)].sort((a, b) => a - b).join(',');
const inversionLabel = index => index === 0 ? 'Root position' : `Inversion ${index}`;

export function chordReferenceDiagnostics(expected, sourceRoots, generated, chord, split) {
    if (split) return { reference: 'Split bar · not compared', structure: null, captured: null };
    if (!Array.isArray(chord?.pitchClasses) || !chord.pitchClasses.length || sourceRoots.length !== 1 || generated.length !== 1)
        return { reference: 'Missing or mixed reference', structure: null, captured: null };
    const root = mod(chord.pitchClasses[0], 12);
    if (mod(sourceRoots[0], 12) !== root) return { reference: 'Source root differs from bar chord', structure: null, captured: null };
    if (mod(generated[0].root, 12) !== root) return { reference: 'Converted root differs from source', structure: null, captured: null };
    const written = new Set(chord.pitchClasses.map(pc => mod(pc, 12)));
    const defaults = new Set(generated[0].pitches.map(midi => mod(midi, 12)));
    const captured = new Set(expected.map(midi => mod(midi, 12)));
    const extra = (a, b) => [...a].filter(pc => !b.has(pc));
    const missing = extra(written, defaults), added = extra(defaults, written);
    const structure = !missing.length && !added.length ? 'Default triad equals written chord'
        : missing.length && !added.length ? 'Default triad omits written tones'
            : !missing.length && added.length ? 'Default triad adds tones'
                : 'Default triad replaces and omits tones';
    const outside = extra(captured, written);
    const absent = extra(written, captured);
    return { reference: 'Roots agree', structure, captured: outside.length ? 'Some captured notes outside written chord'
        : absent.length ? 'Captured pitch classes are a subset' : 'Captured pitch classes equal written chord' };
}

export function pitchClassDifference(expected, actual, root) {
    const before = new Set(expected.map(midi => mod(midi, 12)));
    const after = new Set(actual.map(midi => mod(midi, 12)));
    const missing = [...before].filter(pc => !after.has(pc));
    const added = [...after].filter(pc => !before.has(pc));
    if (!missing.length && !added.length) return 'Same pitch classes';
    if (Number.isInteger(root) && missing.length === 1 && missing[0] === mod(root, 12) && !added.length) return 'Root removed only';
    if (Number.isInteger(root) && added.length === 1 && added[0] === mod(root, 12) && !missing.length) return 'Root added only';
    return 'Other pitch-class changes';
}

/**
 * Compare the current generated-chord conversion with captured pitches and
 * quarter-unit attack positions, not with the unavailable pre-effect events.
 */
export function compareChordConversion(bar, role) {
    const events = bar.events.filter(e => e.role === role && e.chordSource && Number.isInteger(e.chordSource.root));
    if (!events.length) return null;
    const stepsPerBar = bar.meter.units * 4;
    const longest = Math.max(...events.map(e => Math.max(0, e.beat) + e.length));
    const bars = Math.max(1, Math.ceil(longest / bar.meter.units) + 1);
    const records = [{ events }, ...Array.from({ length: bars - 1 }, () => ({ events: [] }))];
    const key = makeKey(bar.music.mode, bar.music.tonic);
    const pattern = capturePattern(records, role, { key, stepsPerBar });
    const groups = generatedChords(pattern, key);
    const expected = events.map(e => [Math.max(0, Math.min(stepsPerBar - 1, Math.round(e.beat * 4))), e.midi]);
    const captured = pattern.steps.flatMap((step, at) => (step?.n ?? []).map(note => [at, degreeToMidi(key, note)]));
    const actual = [];
    for (const chord of groups) {
        for (let step = chord.start; step < chord.start + chord.len; step++) {
            for (const event of placedChordEvents({ chords: [chord] }, step, { key, time: step, stepSec: 1 })) {
                actual.push([step, event.note]);
            }
        }
    }
    const styles = [...new Set(events.map(e => e.chordSource.style))];
    const roots = [...new Set(events.map(e => e.chordSource.root))];
    const expectedSignature = signature(expected), actualSignature = signature(actual);
    const reference = chordReferenceDiagnostics(expected.map(([, midi]) => midi), roots, groups.map(chord => ({
        root: degreeToMidi(key, chord.root), pitches: placedChordTones(key, chord),
    })), bar.chord, bar.split);
    return {
        matches: expectedSignature === actualSignature,
        captureMatches: expectedSignature === signature(captured),
        samePitches: setSignature(expected.map(([, midi]) => midi)) === setSignature(actual.map(([, midi]) => midi)),
        samePitchClasses: setSignature(expected.map(([, midi]) => mod(midi, 12))) === setSignature(actual.map(([, midi]) => mod(midi, 12))),
        sameAttackSteps: setSignature(expected.map(([step]) => step)) === setSignature(actual.map(([step]) => step)),
        pitchDifference: pitchClassDifference(expected.map(([, midi]) => midi), actual.map(([, midi]) => midi), roots.length === 1 ? roots[0] : null),
        reference,
        events: events.length, style: styles.length === 1 ? styles[0] : 'mixed',
        expected: expected.map(([step, midi]) => `${step}:${midi}`).join(' '),
        actual: actual.map(([step, midi]) => `${step}:${midi}`).join(' '),
    };
}
