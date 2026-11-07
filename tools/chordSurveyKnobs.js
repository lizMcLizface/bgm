// The proposed sequencer chord-track knobs (four pages) and how to read each one from a generated part.
// A "part" is one voice (pad or rhythm) over one chord slot: the knob values come from its first played bar (the statement),
// except the tones left out, which are measured over every bar of the slot. See reports/survey_chords.
import { makeKey, midiToDegree } from '../src/seq/harmony';
import { chordFit, writtenChord } from './generatorSurveyParams';

const mod = (n, m) => ((n % m) + m) % m;
const median = list => { const s = [...list].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

/** support: 'yes' (the sequencer's placed chord does it today), 'new knob' (in the proposed pages), 'no' (neither). */
const yes = 'yes', fresh = 'new knob', no = 'no';
export const KNOBS = [
    { id: 'tones', page: 1, title: 'Chord length: written tones', note: 'Tones in the written chord (triad = 3, seventh chord = 4, ninth chord = 5).',
        support: v => ['3 tones', '4 tones', '5 tones'].includes(v) ? yes : no },
    { id: 'voices', page: 1, title: 'Chord length: voices sounded', note: 'Distinct pitch classes the part plays over the slot (a diad has two).',
        support: v => ['2 voices', '3 voices', '4 voices', '5 voices'].includes(v) ? yes : no },
    { id: 'borrowed', page: 1, title: 'Borrowed status', note: 'Whether the chord is the diatonic chord of its degree, the same shape on a root moved by semitones, or needs another quality.',
        support: v => v === 'diatonic' ? yes : v.startsWith('root moved') || v.startsWith('other quality') ? fresh : no },
    { id: 'borrowedMode', page: 1, title: 'Borrowed from', note: 'The mode the generator borrowed the chord from (chords that are not diatonic to the key).',
        support: () => fresh },
    { id: 'flavour', page: 1, title: 'Chord flavour', note: 'Natural, suspended or added-tone colour of the chord.',
        support: v => ['natural', 'sus2', 'sus4', 'add9'].includes(v) ? yes : no },
    { id: 'inversion', page: 1, title: 'Inversion level', note: 'Position of the lowest sounded tone in the written chord’s stacked order (root omitted counts as the inversion it has).',
        support: v => ['0', '1', '2', '3'].includes(v) ? yes : no },
    { id: 'spread', page: 1, title: 'Spacing (suggested)', note: 'Highest minus lowest note. Inversion only makes close stacks; open and wide spacing needs its own setting.',
        support: v => v.startsWith('≤ 7') || v.startsWith('8–12') ? yes : fresh },
    { id: 'style', page: 2, title: 'Chord playstyle', note: 'How the part is played; a pulse is the chord placed again at each hit; a note line is not a chord at all.',
        support: v => ['sustain', 'arpeggio', 'stab (short chord)', 'pulse (repeated chords)', 'varying pulse (different chord per hit)'].includes(v) ? yes
            : v === 'roll' || v === 'split pulse (low note, then upper notes)' ? fresh : no },
    { id: 'direction', page: 2, title: 'Playstyle style: direction', note: 'Order of the notes in an arpeggio, roll or stack.',
        support: v => ['up', 'down', 'upDown', 'broken'].includes(v) ? yes : v === 'out' || v === 'in' ? fresh : no },
    { id: 'noteLength', page: 2, title: 'Note length', note: 'Typical length of a sounded note (median over the part).',
        support: v => v === 'to slot end' ? yes : fresh },
    { id: 'ringsPast', page: 2, title: 'Rings past the bar end', note: 'Whether any note of the figure is still sounding at the end of its bar (the knob’s click toggle).',
        support: () => fresh },
    { id: 'rate', page: 2, title: 'Playstyle rate', note: 'Gap between notes (arpeggio, roll, stack) or hits (pulse), in steps of a quarter beat.',
        support: v => ['1 step', '2 steps', '4 steps', '8 steps'].includes(v) ? yes : no },
    { id: 'rateFlavour', page: 3, title: 'Rate flavour', note: 'Even gaps, or a rhythm of uneven ones.',
        support: v => v === 'straight' ? yes : fresh },
    { id: 'hitPattern', page: 3, title: 'Rate flavour: hit positions of uneven rhythms', note: 'Positions of the hits in a bar, in beats; the presets a syncopated flavour would need.',
        support: () => fresh },
    { id: 'omit', page: 3, title: 'Omit note', note: 'Chord tones left out, measured over every bar of the slot.',
        support: v => ['none', 'root', 'third', 'seventh'].includes(v) ? yes : fresh },
    { id: 'add', page: 3, title: 'Add note', note: 'A chord tone that sounds more than once (a doubling), or the arpeggio’s octave copy of its bottom note.',
        support: v => v === 'none' ? yes : fresh },
    { id: 'addOctave', page: 3, title: 'Added note octave', note: 'Octaves above (+) or below (−) the first sounding of that tone.',
        support: () => fresh },
    { id: 'offset', page: 4, title: 'Custom: per-note offset', note: 'Spacing between the first strike and each following note of a chord; chords that strike together have none.',
        support: v => v === 'simultaneous' ? yes : fresh },
    { id: 'duration', page: 4, title: 'Custom: per-note duration', note: 'Whether the notes of a chord have equal lengths, end together, or differ.',
        support: v => v === 'equal' ? yes : fresh },
    { id: 'velocity', page: 4, title: 'Custom: per-note velocity', note: 'The shape of velocity across the notes in the order they sound (readings within 12% count as flat).',
        support: v => v === 'flat' ? yes : fresh },
    { id: 'slotBars', page: 0, title: 'Slot length (placement)', note: 'Bars the chord lasts; a placement property, not a knob.', support: () => yes },
    { id: 'hits', page: 0, title: 'Pulse: hits per bar (placement)', note: 'Chords placed per bar for a pulse.', support: () => yes },
];

/** Accidental of the chord root against its key: 0 when the root is a scale note. */
export function rootAccidental(chord, mode, tonic) {
    const key = makeKey(mode, tonic);
    return midiToDegree(key, 60 + mod(chord.pitchClasses[0], 12)).a;
}

export function borrowedStatus(chord, fit, accidental) {
    if (fit && accidental === 0) return 'diatonic';
    if (fit) return `root moved ${accidental > 0 ? '+' : '−'}${Math.abs(accidental)} semitone${Math.abs(accidental) === 1 ? '' : 's'}`;
    return chord.provenance?.borrowed ? 'other quality (borrowed)' : 'altered / other';
}

export function flavourOf(written, fit) {
    if (fit) return fit.colour === 'plain' ? 'natural' : fit.colour === 'add7' ? 'natural' : fit.colour;
    const has = i => written.intervals.includes(i), tags = [];
    if (has(1)) tags.push('♭9');
    if (has(9) && !(has(3) && has(6))) tags.push('add6');
    if (has(6) && !has(7)) tags.push('♭5');
    if (has(8) && !has(7)) tags.push('♯5');
    if (has(5) && has(3) || has(5) && has(4)) tags.push('add11');
    if (!has(3) && !has(4) && has(2)) tags.push('sus2');
    if (!has(3) && !has(4) && has(5)) tags.push('sus4');
    return tags.length ? `altered: ${tags.join(' + ')}` : 'altered: other quality';
}

/** A length in beats named to the nearest usual value. */
export function lengthLabel(beats, slotBeats) {
    if (beats >= slotBeats * 0.85) return 'to slot end';
    const options = [[0.25, '¼ beat'], [0.5, '½ beat'], [0.75, '¾ beat'], [1, '1 beat'], [1.5, '1½ beats'], [2, '2 beats'], [3, '3 beats'], [4, '4 beats']];
    if (beats > 4.5) return 'over 4 beats';
    return options.reduce((best, o) => Math.abs(o[0] - beats) < Math.abs(best[0] - beats) ? o : best)[1];
}

const spread = span => span <= 7 ? '≤ 7 semitones (close)' : span <= 12 ? '8–12 semitones' : span <= 19 ? '13–19 semitones (open)' : '20+ semitones (very wide)';

/** Doublings in a voicing: [{ role, octaves }] per extra sounding of a tone, plus the arpeggio's octave copy. */
export function doublings(midis, written, octaveDouble) {
    const notes = [...new Set(midis)].sort((a, b) => a - b), out = [];
    if (octaveDouble && notes.length > 2 && notes.at(-1) === notes[0] + 12) notes.pop(); // counted once, below
    written.pcs.forEach((pc, i) => {
        const of = notes.filter(n => mod(n, 12) === pc);
        for (const n of of.slice(1)) out.push({ role: written.roles[i], octaves: Math.round((n - of[0]) / 12) });
    });
    if (octaveDouble) out.push({ role: written.roles[written.pcs.indexOf(mod(notes[0], 12))] ?? 'root', octaves: 1, arp: true });
    return out;
}

const velocityShape = events => {
    const sorted = [...events].sort((a, b) => a.beat - b.beat), v = sorted.map(e => e.velocity ?? 0.8);
    if (v.length < 2) return null;
    const lo = Math.min(...v), hi = Math.max(...v);
    if (hi / lo < 1.12) return 'flat';
    const third = Math.max(1, Math.floor(v.length / 3)), head = v.slice(0, third), tail = v.slice(-third), mid = v.slice(third, -third);
    const avg = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
    if (avg(tail) > avg(head) * 1.1 && v.at(-1) === hi) return 'rising';
    if (avg(head) > avg(tail) * 1.1 && v[0] === hi) return 'falling';
    if (v[0] === hi && avg(v.slice(1)) < hi * 0.92) return 'accent on the first note';
    return mid.length ? 'uneven' : 'other';
};
const durationShape = events => {
    const lens = events.map(e => e.length), ends = events.map(e => e.beat + e.length);
    if (Math.max(...lens) / Math.min(...lens) < 1.1) return 'equal';
    if (Math.max(...ends) - Math.min(...ends) < 0.25) return 'end together';
    return 'differ';
};

/** Why a part is a note line rather than a chord, or null when a chord track can hold it. */
export function lineReason(part) {
    const { play, voicing } = part;
    if (voicing.outside > 0) return 'notes outside the written chord';
    if (play.mode === 'single note') return 'a single note';
    if (play.mode === 'other') return 'no recognised play mode';
    if (play.mode === 'arp' && play.direction === 'composed figure') return 'composed figure (no standard direction)';
    return null;
}

const styleOf = (play, line) => {
    if (line) return 'note line';
    switch (play.mode) {
        case 'chord': return play.hold === 'sustain' ? 'sustain' : 'stab (short chord)';
        case 'arp': return 'arpeggio';
        case 'pulse': return 'pulse (repeated chords)';
        case 'varying pulse': return 'varying pulse (different chord per hit)';
        case 'split pulse': return 'split pulse (low note, then upper notes)';
        default: return play.mode;
    }
};

/**
 * Every knob's value for one part. `part` is describePart's result for the statement bar; `slotMidis` every note of the slot;
 * null means the knob does not apply (a direction for a held chord, say).
 */
export function knobValues({ part, events, slotMidis, chord, mode, tonic, units, slotBars }) {
    const { play, voicing } = part, written = writtenChord(chord), fit = chordFit(chord, mode, tonic);
    const line = lineReason(part), isLine = line !== null;
    const accidental = rootAccidental(chord, mode, tonic), status = borrowedStatus(chord, fit, accidental);
    const sounded = new Set(slotMidis.map(m => mod(m, 12)));
    const omitted = written.pcs.flatMap((pc, i) => sounded.has(pc) ? [] : [written.roles[i]]);
    const running = ['arp', 'roll', 'stack'].includes(play.mode), repeated = ['pulse', 'varying pulse', 'split pulse'].includes(play.mode);
    const even = running ? (play.mode === 'arp' ? play.even : true) : repeated ? new Set(play.gapSteps.map(g => Math.round(g))).size === 1 : null;
    const doubles = doublings(events.map(e => e.midi), written, voicing.octaveDouble);
    const lengths = events.map(e => e.length);
    const gap = running ? (play.rate === 'syncopated' ? null : play.rate) : repeated && even ? median(play.gapSteps) : null;
    const values = {
        tones: `${written.pcs.length} tones`,
        voices: sounded.size >= 6 ? '6+ voices' : `${sounded.size} voices`,
        borrowed: status,
        borrowedMode: status === 'diatonic' ? null : (chord.provenance?.sourceMode ?? 'unknown'),
        flavour: flavourOf(written, fit),
        inversion: String(voicing.inversion),
        spread: spread(voicing.span),
        style: styleOf(play, isLine),
        direction: !isLine && running && play.direction ? play.direction : null,
        noteLength: lengthLabel(play.mode === 'chord' || play.mode === 'roll' || play.mode === 'stack' ? Math.max(...lengths) : median(lengths), units * slotBars),
        ringsPast: !isLine && ['arp', 'pulse', 'varying pulse', 'split pulse'].includes(play.mode)
            ? (Math.max(...events.map(e => e.beat + e.length)) > units + 0.05 ? 'rings past the bar end' : 'ends within the bar') : null,
        rate: !isLine && (running || repeated) ? (gap === null ? 'uneven' : `${gap} step${gap === 1 ? '' : 's'}`) : null,
        rateFlavour: !isLine && (running || repeated) ? (even ? 'straight' : 'syncopated') : null,
        hitPattern: !isLine && (running || repeated) && !even ? play.positions.join(' ') : null,
        omit: omitted.length ? omitted.join(' + ') : 'none',
        add: doubles.length ? [...new Set(doubles.map(d => d.arp ? `${d.role} (arpeggio octave copy)` : d.role))].sort().join(' + ') : 'none',
        addOctave: doubles.length ? [...new Set(doubles.map(d => `${d.octaves > 0 ? '+' : ''}${d.octaves}`))].sort().join(' ') : null,
        offset: null, duration: null, velocity: null,
        slotBars: `${slotBars} bar${slotBars === 1 ? '' : 's'}`,
        hits: repeated ? String(play.hits) : null,
    };
    if (!isLine && play.mode !== 'single note') {
        if (play.mode === 'chord') values.offset = 'simultaneous';
        else if (play.mode === 'roll' || play.mode === 'stack') values.offset = `${play.rate} step${play.rate === 1 ? '' : 's'} apart`;
        else values.offset = null;
        if (['chord', 'roll', 'stack'].includes(play.mode)) {
            values.duration = durationShape(events);
            values.velocity = velocityShape(events);
        }
    }
    return { values, line, sensitivity: !isLine && play.mode === 'arp' && !even };
}
