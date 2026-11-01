import { seeded, pick, weighted } from '../random';
import { groupStarts, unitsPerMinute } from '../meter';
import { pentatonicOf } from '../arranger';
import { suitedStyle } from './suitedStyle';

// A preset is a melodic style, a seed is a song in it (settings.melodyStyle): the style says what a tune may be, and
// the seed writes one over the preset's own chords, as 4 bars with a repeated idea and an ending of their own.
//   rhythms   a bar's onsets as fractions of the bar, by how busy the lead is (sparse, mid, busy); works in any metre
//   cadences  the same for the last bar, whose last note holds
//   forms     how the 4 bars reuse the opening bar
//   moves     scale-degree steps of the line, weighted
//   leaps     sizes of the one signature leap, in scale degrees
//   span      the range in scale degrees the tune should fill
//   starts    scale degrees it may open on
//   repeats   repeated notes are part of the idiom
// Append only: links store a style by its place in this list. Auto takes the one that suits the preset (songStyle).
export const MELODIC_STYLES = {
    auto: null,
    song: { rhythms: { sparse: [[0, .5], [0, .75], [0, .5, .75]], mid: [[0, .25, .5, .75], [0, .375, .5, .75], [0, .5, .625, .75]], busy: [[0, .125, .25, .5, .75], [0, .25, .375, .5, .75]] },
        cadences: [[0], [0, .5], [0, .25, .5]], forms: ['sentence', 'period'], moves: { '-1': 4, 1: 4, '-2': 2, 2: 2, 0: 1 }, leaps: [3, 4, 5], span: [5, 9], starts: [0, 2, 4] },
    lounge: { rhythms: { sparse: [[0, .375], [.125, .5], [0, .625], [.25, .5, .875]], mid: [[0, .375, .75], [.125, .375, .75], [0, .25, .625], [.25, .5, .625, .875]], busy: [[0, .125, .375, .625, .75], [.125, .25, .5, .625, .875]] },
        cadences: [[0], [.125], [0, .375]], forms: ['period', 'sentence'], moves: { '-1': 3, 1: 2, '-2': 3, 2: 3, 0: 1, 3: 1, '-3': 1 }, leaps: [3, 5], span: [4, 7], starts: [2, 4, 6] },
    hook: { rhythms: { sparse: [[0], [0, .75], [0, .375, .75]], mid: [[0, .375, .75], [0, .25, .5, .75], [0, .375, .625, .75]], busy: [[0, .25, .375, .625, .75, .875], [0, .125, .375, .5, .75, .875]] },
        cadences: [[0], [0, .375]], forms: ['riff', 'riff', 'sentence'], moves: { 0: 2, '-1': 2, 1: 2, 2: 2, '-2': 2 }, leaps: [3, 4, 5, 7], span: [4, 8], starts: [0, 2, 4], repeats: true },
    game: { rhythms: { sparse: [[0, .5, .75], [0, .25, .5]], mid: [[0, .25, .5, .625, .75], [0, .25, .375, .625, .75], [0, .375, .5, .75, .875]], busy: [[0, .125, .25, .375, .5, .75], [0, .25, .375, .5, .625, .75, .875], [0, .125, .25, .5, .625, .75]] },
        cadences: [[0, .25, .5], [0, .5], [0]], forms: ['sentence', 'arch'], moves: { 2: 4, '-2': 4, 1: 3, '-1': 3 }, leaps: [4, 5], span: [6, 10], starts: [0, 4] },
    cinema: { rhythms: { sparse: [[0], [0, .75], [0, .5]], mid: [[0, .75], [0, .5, .75], [0, .625, .75]], busy: [[0, .5, .75], [0, .25, .5, .75]] },
        cadences: [[0], [0, .5]], forms: ['arch', 'sentence', 'period'], moves: { 1: 3, '-1': 3, 2: 2, '-2': 1 }, leaps: [3, 4, 5], span: [5, 9], starts: [0, 4] },
    riff: { rhythms: { sparse: [[0, .375, .5], [0, .25, .625]], mid: [[0, .25, .375, .625], [0, .125, .375, .5], [0, .375, .5, .875]], busy: [[0, .125, .25, .375, .625, .75], [0, .125, .375, .5, .625, .875]] },
        cadences: [[0, .375], [0]], forms: ['riff'], moves: { 0: 3, '-1': 3, 1: 3, '-2': 1, 2: 1 }, leaps: [2, 3, 4], span: [3, 6], starts: [0, 2], repeats: true },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const CANDIDATES = 48;
const hash = (text) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 0x811c9dc5);

export const hasMelodicStyle = (settings) => !!MELODIC_STYLES[settings.melodyStyle];

// How the lead treats its tune (settings.melodyPlan): the drawn motifs as before, one song for the whole piece, or a song that slowly turns into another.
export const MELODY_PLANS = ['noodle', 'same', 'change'];

/** The style a piece's song is in, by the settings the user made (not the intensity's); null: no song, the lead noodles. */
export function songStyle(settings) {
    if (!['same', 'change'].includes(settings.melodyPlan)) return null;
    return MELODIC_STYLES[settings.melodyStyle] ? settings.melodyStyle : suitedStyle(settings);
}

/** A note clearly fights the chord: not a chord tone, and a semitone from one. */
export function clashes(pc, chordPcs) {
    return !chordPcs.includes(pc) && chordPcs.some((tone) => [1, 11].includes((pc - tone + 12) % 12));
}

function barRhythm(fractions, meter, gate = 1) {
    const grid = meter.unitsPerBeat === 3 ? 1 : .25, starts = groupStarts(meter);
    const beats = [...new Set(fractions.map((f) => Math.round(f * meter.units / grid) * grid))].filter((b) => b < meter.units);
    return beats.map((beat, i) => ({ beat, length: ((beats[i + 1] ?? meter.units) - beat) * gate, accent: i === 0 || starts.includes(beat) }));
}

const rhythmPool = (style, density) => (density < .2 ? [...style.rhythms.sparse, ...style.rhythms.mid.slice(0, 1)]
    : density < .45 ? [...style.rhythms.mid, ...style.rhythms.sparse.slice(0, 1)] : [...style.rhythms.busy, ...style.rhythms.mid]);

function walk(rng, style, from, count) {
    const out = [];
    let degree = from;
    for (let i = 0; i < count; i++) {
        if (i) degree = clamp(degree + Number(weighted(rng, style.moves)), -3, 10);
        out.push(degree);
    }
    return out;
}

/** The opening idea: a walk with one signature leap, filled back in the other way. */
function headDegrees(rng, style, start, count) {
    const out = walk(rng, style, start, count);
    if (count < 3 || rng() > .8) return out;
    const at = 1 + Math.floor(rng() * (count - 1)), direction = rng() < .65 ? 1 : -1;
    out[at] = out[at - 1] + direction * pick(rng, style.leaps);
    for (let i = at + 1; i < count; i++) out[i] = out[i - 1] - direction * pick(rng, [1, 1, 2]);
    return out.map((d) => clamp(d, -3, 10));
}

const notesOf = (rhythm, degrees) => rhythm.map((note, i) => ({ ...note, degree: degrees[i] ?? degrees.at(-1) }));

function candidate(rng, style, { meter, id, density }) {
    const pool = rhythmPool(style, density), a = pick(rng, pool), others = pool.filter((r) => r !== a), b = others.length ? pick(rng, others) : a;
    const ra = barRhythm(a, meter), rb = barRhythm(b, meter), rc = barRhythm(pick(rng, style.cadences), meter);
    const start = id ? pick(rng, style.starts.map((d) => d + 2)) : pick(rng, style.starts);
    const head = headDegrees(rng, style, start, ra.length), step = pick(rng, [1, 2, -1]) * (id ? -1 : 1);
    const after = (list, count, up) => {
        const out = [];
        let degree = list.at(-1);
        for (let i = 0; i < count; i++) { degree = clamp(degree + up * pick(rng, [1, 1, 2]), -3, 10); out.push(degree); }
        return out;
    };
    const home = id ? pick(rng, [2, 4]) : pick(rng, [0, 0, 2]);
    const cadence = (from) => { // down (or up) to the ending, by the shortest way
        const out = rc.map((_, i) => Math.round(from + (home - from) * (i + 1) / rc.length));
        out[out.length - 1] = home;
        return notesOf(rc, out);
    };
    const form = pick(rng, style.forms), shifted = (by) => head.map((d) => clamp(d + by, -3, 10));
    if (form === 'period') {
        const middle = after(head, rb.length, head.at(-1) > start ? -1 : 1);
        return [notesOf(ra, head), notesOf(rb, middle), notesOf(ra, head), cadence(head.at(-1))];
    }
    if (form === 'riff') {
        const turn = head.map((d, i) => (i >= head.length - 2 ? clamp(d + step, -3, 10) : d));
        return [notesOf(ra, head), notesOf(ra, head), notesOf(ra, turn), cadence(turn.at(-1))];
    }
    if (form === 'arch') {
        const third = shifted(step * 2);
        return [notesOf(ra, head), notesOf(ra, shifted(step)), notesOf(ra, third), cadence(third.at(-1))];
    }
    const second = shifted(step), climb = after(second, rb.length, 1);
    return [notesOf(ra, head), notesOf(ra, second), notesOf(rb, climb), cadence(climb.at(-1))];
}

/** Written over the chords: an accented or held note that fights its chord moves to the nearest scale step that does not. */
function fitChords(bars, { harmony, pcs, meter }) {
    if (!harmony.length || !pcs?.length) return bars;
    const pcOf = (degree) => pcs[((degree % pcs.length) + pcs.length) % pcs.length];
    return bars.map((bar, b) => bar.map((note) => {
        const chord = harmony[b % harmony.length];
        if ((!note.accent && note.length < meter.unitsPerBeat) || !clashes(pcOf(note.degree), chord)) return note;
        const near = [-1, 1, -2, 2].map((by) => note.degree + by).find((degree) => !clashes(pcOf(degree), chord));
        return near === undefined ? note : { ...note, degree: near };
    }));
}

/** How much of a tune there is to remember, and how well it sits on the chords. */
export function scoreTheme(bars, { style, harmony = [], pcs, meter, maxSpan = Infinity }) {
    const notes = bars.flatMap((bar, b) => bar.map((note) => ({ ...note, bar: b }))), degrees = notes.map((n) => n.degree);
    const low = Math.min(...degrees), high = Math.max(...degrees), span = high - low;
    const moves = degrees.slice(1).map((d, i) => d - degrees[i]);
    const peaks = notes.filter((n) => n.degree === high), peakAt = notes.findIndex((n) => n.degree === high) / Math.max(1, notes.length - 1);
    let score = 0;
    score += span >= style.span[0] && span <= style.span[1] ? 2 : -Math.abs(span - clamp(span, ...style.span)) * .6;
    score -= Math.max(0, span - maxSpan) * 1.5; // it must fit the lead's register, or the ends flatten against the limits
    score += peaks.length === 1 ? 1.5 : peaks.length === 2 ? .5 : 0;
    score += peakAt >= .3 && peakAt <= .8 ? 1 : 0;
    const leaps = moves.filter((m) => Math.abs(m) >= 3).length;
    score += leaps >= 1 && leaps <= 3 ? 1 : leaps > 3 ? -(leaps - 3) * .5 : 0;
    score += moves.filter((m) => Math.abs(m) <= 2 && m !== 0).length >= moves.length * .5 ? 1 : 0;
    let run = 0;
    for (const move of moves) { run = move === 0 ? run + 1 : 0; if (run > (style.repeats ? 3 : 1)) score -= .75; }
    score += new Set(notes.map((n) => n.length)).size >= 3 ? 1 : 0;
    if (harmony.length && pcs?.length) {
        const pcOf = (degree) => pcs[((degree % pcs.length) + pcs.length) % pcs.length];
        // A theme comes back wherever a phrase starts in the chord cycle; its own place counts most.
        const alignments = [...new Set(Array.from({ length: Math.ceil(harmony.length / 4) }, (_, i) => (i * 4) % harmony.length))];
        let fit = 0;
        alignments.forEach((offset, a) => {
            const weight = a === 0 ? .6 : .4 / Math.max(1, alignments.length - 1);
            let sum = 0, count = 0;
            for (const note of notes) {
                if (!note.accent && note.length < meter.unitsPerBeat) continue;
                const chord = harmony[(note.bar + offset) % harmony.length], pc = pcOf(note.degree);
                sum += chord.includes(pc) ? 1 : clashes(pc, chord) ? -1.5 : 0;
                count++;
            }
            fit += weight * (count ? sum / count : 0);
        });
        score += fit * 5;
    }
    return score;
}

/**
 * The song's themes: the best of many candidates drawn from the style, for this seed. `harmony` is the preset's chord
 * cycle bar by bar ({ pitchClasses, scalePcs }); the same seed is another song on another preset (`preset`).
 */
export function composeSong({ seed, styleName, preset = '', meter, harmony = [], density = 0, leadScale, range }) {
    const style = MELODIC_STYLES[styleName], salt = hash(`${styleName}/${preset}`);
    const scale = harmony[0]?.scalePcs, pcs = scale ? (leadScale === 'pentatonic' ? pentatonicOf(scale) : scale) : null;
    const chords = harmony.map((chord) => chord.pitchClasses);
    const maxSpan = range ? Math.floor((range[1] - range[0]) * (pcs?.length ?? 7) / 12) : Infinity;
    return [0, 1].map((id) => {
        const rng = seeded(Math.imul(seed ^ salt, 1664525) ^ Math.imul(id + 1, 1013904223));
        let best = null, bestScore = -Infinity;
        for (let i = 0; i < CANDIDATES; i++) {
            const bars = fitChords(candidate(rng, style, { meter, id, density }), { harmony: chords, pcs, meter }), score = scoreTheme(bars, { style, harmony: chords, pcs, meter, maxSpan });
            if (score > bestScore) { best = bars; bestScore = score; }
        }
        return best;
    });
}
// A song turns into the next in four steps, a bar of the tune each: the middle first, the opening it is known by last.
const CHANGE_ORDER = [2, 3, 1, 0];

/** How many bars a whole change takes: 10 to 15 minutes, by the seed. */
export function changeBars({ seed, meter, bpm }) {
    const seconds = 600 + 300 * seeded(seed ^ 0x4cf5ad43)(), secondsPerBar = meter.units * 60 / unitsPerMinute(meter, bpm);
    return Math.max(16, Math.round(seconds / secondsPerBar));
}

export function mixThemes(from, to, step) {
    const taken = new Set(CHANGE_ORDER.slice(0, step));
    return from.map((theme, id) => theme.map((bar, b) => (taken.has(b) ? to[id][b] : bar)));
}

/**
 * Where a changing song is at this bar. `known`: the tune playing now (kept when the plan switches from Same), or
 * nothing if it has to be written again; `moveOn`: a statement starts, so a due step can be taken without breaking a phrase.
 */
export function evolveSong({ previous, known, bar, period, moveOn, write }) {
    const song = previous ?? { anchor: bar, period, gen: 0, step: 0 };
    let { gen, step, from, to } = song;
    if (!previous && known) { from = known; to = write(1); }
    else if (!known || !from) { from = write(gen); to = write(gen + 1); }
    if (moveOn) {
        const steps = Math.floor((bar - song.anchor) / (song.period / CHANGE_ORDER.length));
        const nextGen = Math.floor(steps / CHANGE_ORDER.length), nextStep = steps % CHANGE_ORDER.length;
        if (nextGen !== gen) { from = nextGen === gen + 1 ? to : write(nextGen); to = write(nextGen + 1); }
        gen = nextGen; step = nextStep;
    }
    return { ...song, gen, step, from, to, themes: mixThemes(from, to, step) };
}
