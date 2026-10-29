// A mini fretboard in the manner of unCAGED's scale-position grid: a seven-line
// window of the neck anchored on where the scale's root sits on one string, so
// the same shape is read from whichever string you pick. The scale's notes are
// small dots; a chord's notes sit on top of them, larger and labelled.

import React from 'react';
import { selectGripFromPositions } from './chordFingering';
import { getIntervalColor, getIntervalLabel } from '../labs/piano/intervals';

// Open-string pitches, lowest string first.
export const INSTRUMENTS = {
    guitar: { name: 'Guitar', strings: [40, 45, 50, 55, 59, 64] },
    bass: { name: 'Bass', strings: [28, 33, 38, 43] },
};
const LETTERS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

const COLUMNS = 7; // fret lines in the window; the root sits on the second (column 1)
const ROOT_COLUMN = 1;

// The strings a pattern can hang off: the lowest string of each distinct note name (guitar E A D G B, bass E A D G).
export const anchorStrings = (strings) => strings.map((open, index) => index)
    .filter((index) => strings.findIndex((o) => o % 12 === strings[index] % 12) === index);
export const stringLetter = (strings, index) => LETTERS[strings[index] % 12].replace('♯', '♯');

const rootFret = (open, tonic) => ((tonic - open) % 12 + 12) % 12;

// Every dot of the window: string, column, fret, pitch class.
// `shift` slides the window up or down the neck from where the root puts it.
export const windowStart = (strings, anchor, tonic, shift = 0) => {
    const base = rootFret(strings[anchor], tonic) - ROOT_COLUMN;
    return shift ? Math.min(MAX_START, Math.max(0, base + shift)) : base;
};
const MAX_START = 18;

// The window (string to hang the pattern off, and whether it sits an octave up the neck) whose middle frets
// sound closest to a register, given as a midi note: where a voice playing around that pitch is most at home.
export function nearestPosition(strings, tonic, register) {
    let best = null;
    for (const anchor of anchorStrings(strings)) {
        for (const octave of [0, 12]) {
            const start = windowStart(strings, anchor, tonic) + octave;
            if (start > MAX_START) continue;
            const distance = Math.min(...strings.map((open) => Math.abs(register - (open + start + 3))));
            if (!best || distance < best.distance) best = { anchor, up: octave === 12, distance };
        }
    }
    return best;
}

// Whether the window hung off `anchor` sits better an octave up the neck (12) or not (0) for a voice playing around
// `register` (a midi note); `current` is where it sits now.
export function windowOctave(strings, anchor, tonic, register, current = 0) {
    const reach = (start) => Math.min(...strings.map((open) => Math.abs(register - (open + start + 3))));
    const base = windowStart(strings, anchor, tonic), up = base + 12;
    if (up > MAX_START) return 0;
    // it takes a clear gain to move: a voice hovering between two octaves stays where it is
    const here = reach(current ? up : base), other = reach(current ? base : up);
    return other + OCTAVE_STICKINESS < here ? 12 - current : current;
}
const OCTAVE_STICKINESS = 4;

export function windowDots(strings, anchor, tonic, shift = 0) {
    const start = windowStart(strings, anchor, tonic, shift), dots = [];
    strings.forEach((open, string) => {
        for (let column = 0; column < COLUMNS; column++) {
            const fret = start + column;
            if (fret >= 0) dots.push({ string, column, fret, pc: (open + fret) % 12 });
        }
    });
    return { start, dots };
}

// What a chord board draws: the window's dots, the chord's dots in it, and which of them are highlighted: one grip, a note per string, on the guitar, all of them otherwise.
export function chordLayout(strings, anchor, tonic, chord, { shape = false, shift = 0 } = {}) {
    const { start, dots } = windowDots(strings, anchor, tonic, shift), chordSet = new Set(chord);
    const chordDots = chord.length === 0 ? [] : dots.filter((d) => chordSet.has(d.pc));
    const shown = chordDots;
    const gripList = shape && chord.length ? selectGripFromPositions(shown, rootFret(strings[anchor], tonic)) : [];
    return { start, dots, shown, gripList, held: new Set(shape && chord.length ? gripList : shown) };
}

// Which dots the Playing board lights for the notes sounding. Each sounding note is first matched with a dot the
// current chord's board highlights (`pool`), which is then used up; a note with no such dot is lit at the closest
// place it can be played to what is already lit. `notes`: [{ midi, colors, opacity, ahead, grow }]; `exact`: the very pitch, or any octave.
export function pickPlaying(strings, dots, pool, notes, exact) {
    const key = (midi) => (exact ? midi : ((midi % 12) + 12) % 12);
    // One state per note: sounding beats coming beats fading, so a note about to be played again takes over from
    // its own afterglow instead of the two animating over each other. Voices on the same note share the dot.
    const rank = (n) => (n.ahead ? 2 : (n.opacity ?? 1) >= 0.99 ? 3 : 1);
    const byNote = new Map();
    for (const note of notes) byNote.set(key(note.midi), [...(byNote.get(key(note.midi)) ?? []), note]);
    const groups = new Map([...byNote].map(([k, list]) => {
        const top = Math.max(...list.map(rank)), kept = list.filter((n) => rank(n) === top);
        return [k, {
            midi: kept[0].midi, ahead: top === 2, grow: Math.max(...kept.map((n) => n.grow ?? 1)), opacity: Math.max(...kept.map((n) => n.opacity ?? 1)),
            colors: [...new Set(kept.flatMap((n) => n.colors))],
        }];
    }));
    const matches = (d, midi) => (exact ? strings[d.string] + d.fret === midi : d.pc === ((midi % 12) + 12) % 12);
    const free = new Set([...pool].filter((d) => dots.includes(d)));
    const lit = [], unmatched = [];
    // what sounds is placed first, so a note still to come never takes its dot
    for (const group of [...groups.values()].sort((a, b) => a.ahead - b.ahead || a.midi - b.midi)) {
        const hit = [...free].find((d) => matches(d, group.midi));
        if (hit) { free.delete(hit); lit.push({ dot: hit, colors: group.colors, opacity: group.opacity, ahead: group.ahead, grow: group.grow }); } else unmatched.push(group);
    }
    const reach = (d, others) => (others.length ? Math.min(...others.map((o) => Math.hypot(d.fret - o.fret, d.string - o.string))) : 0);
    for (const group of unmatched) {
        const options = dots.filter((d) => matches(d, group.midi));
        if (!options.length) continue;
        const anchors = lit.length ? lit.map((l) => l.dot) : [...pool];
        const dot = options.reduce((best, d) => (reach(d, anchors) < reach(best, anchors) ? d : best));
        lit.push({ dot, colors: group.colors, opacity: group.opacity, ahead: group.ahead, grow: group.grow });
    }
    return lit.map(({ dot, colors, opacity, ahead, grow }) => ({ string: dot.string, fret: dot.fret, column: dot.column, colors, opacity, ahead, grow }));
}

const GAP_X = 20, GAP_Y = 13, PAD_X = 12, PAD_TOP = 10, PAD_BOTTOM = 18;

// A dot split into one equal slice per colour.
const Pie = ({ cx, cy, r, colors, opacity = 1, ahead = false, grow = 1 }) => {
    // A note still to come is an outline that grows towards full size; on its cue it fills in, and then fades.
    if (ahead || colors.length === 1) {
        const radius = ahead ? 1.4 + (r - 1.4) * grow : r;
        return <circle cx={cx} cy={cy} r={radius} fill={ahead ? 'none' : colors[0]} stroke={ahead ? colors[0] : '#fff'} strokeWidth={ahead ? 1.6 : 0.8} opacity={opacity} className="gen-fretboard-played" />;
    }
    const point = (turn) => [cx + r * Math.cos((turn - .25) * 2 * Math.PI), cy + r * Math.sin((turn - .25) * 2 * Math.PI)];
    return (
        <g className="gen-fretboard-played" opacity={opacity}>
            {colors.map((color, i) => {
                const [x1, y1] = point(i / colors.length), [x2, y2] = point((i + 1) / colors.length);
                return <path key={i} d={`M${cx} ${cy}L${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}Z`} fill={color} />;
            })}
        </g>
    );
};

const MiniFretboard = React.memo(({ instrument, anchor, tonic, scale, chord = [], chordRoot = tonic, shape = false, lit, shift = 0, label }) => {
    const { strings } = INSTRUMENTS[instrument];
    const scaleSet = new Set(scale);
    // On a chord board the scale is only an anchor: faint, small. With a grip, one playable shape
    // (a note per string, nearest the root's fret) is joined by a line and the other chord tones recede.
    const { start, dots, shown, gripList, held: heldSet } = chordLayout(strings, anchor, tonic, chord, { shape, shift });
    const shownSet = new Set(shown), grip = shape && chord.length ? new Set(gripList) : null;
    const quiet = chord.length > 0 || !!lit;
    const width = PAD_X * 2 + (COLUMNS - 1) * GAP_X, height = PAD_TOP + (strings.length - 1) * GAP_Y + PAD_BOTTOM;
    const x = (column) => PAD_X + column * GAP_X;
    const y = (string) => PAD_TOP + (strings.length - 1 - string) * GAP_Y; // the highest string on top
    return (
        <svg className="gen-fretboard" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
            {Array.from({ length: COLUMNS }, (_, c) => <line key={'f' + c} x1={x(c)} x2={x(c)} y1={PAD_TOP} y2={y(0)} className="gen-fretboard-fret" />)}
            {strings.map((_, s) => <line key={'s' + s} x1={x(0)} x2={x(COLUMNS - 1)} y1={y(s)} y2={y(s)} className="gen-fretboard-string" />)}
            {gripList.length > 1 && <polyline className="gen-fretboard-grip" points={gripList.map((d) => `${x(d.column)},${y(d.string)}`).join(' ')} />}
            {dots.filter((d) => scaleSet.has(d.pc)).map((d) => {
                const isChord = shownSet.has(d), reference = isChord ? chordRoot : tonic, interval = (d.pc - reference + 12) % 12;
                const isTonic = d.pc === tonic, member = grip?.has(d);
                const held = heldSet.has(d);
                const label = !isChord ? null : grip && !member ? null : getIntervalLabel(interval);
                return (
                    <g key={d.string + ':' + d.column}>
                        <circle cx={x(d.column)} cy={y(d.string)} r={isChord ? (held ? 5.4 : 3.6) : quiet ? 2.2 : 3.2} fill={getIntervalColor(interval)}
                            className={isChord ? (held ? 'gen-fretboard-chord' : 'gen-fretboard-spare') : quiet ? 'gen-fretboard-anchor' : 'gen-fretboard-scale'}
                            stroke={isTonic && !quiet ? '#fff' : 'rgba(0,0,0,.5)'} strokeWidth={isTonic && !quiet ? 1.2 : .6} />
                        {label !== null && <text x={x(d.column)} y={y(d.string)} className="gen-fretboard-label">{label}</text>}
                    </g>
                );
            })}
            {lit?.map((l) => <Pie key={'p' + l.string + ':' + l.fret} cx={x(l.column)} cy={y(l.string)} r={4.8} colors={l.colors} opacity={l.opacity} ahead={l.ahead} grow={l.grow} />)}
            {Array.from({ length: COLUMNS }, (_, c) => start + c >= 0 && (
                <text key={'n' + c} x={x(c)} y={height - 5} className="gen-fretboard-fretno">{start + c}</text>
            ))}
        </svg>
    );
});

export default MiniFretboard;
