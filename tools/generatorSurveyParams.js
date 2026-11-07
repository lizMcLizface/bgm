// Boil a generated chord part down to the parameters a sequencer chord track could store
// (src/synths/all/placedChords.js): chord voicing, harmonic colour, inversion, root voicing, play mode,
// direction, rate, hold and length, plus the tones the generator left out.
// Everything here is observed from the planned notes (pitches, attack times, lengths), never from the
// generator's own style labels; the labels are only cross-tabulated afterwards to validate the observation.
import { degreeToMidi, makeKey, midiToDegree } from '../src/seq/harmony';
import { brokenOrder, chordOrder } from '../src/app/arranger';
import { placedChordTones } from '../src/synths/all/placedChords';

const mod = (n, m) => ((n % m) + m) % m;
const median = list => { const s = [...list].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

export const SEQUENCER = {
    complexity: ['power', 'triad', 'seven'], colour: ['plain', 'sus2', 'sus4', 'add7', 'add9'], root: ['on', '-1', '-2', 'off'],
    modes: ['chord', 'arp'], directions: ['up', 'down', 'random', 'upDown', 'downUp', 'broken'], rates: [1, 2, 4, 8], holds: ['end', 3, 2, 1],
};

/** The role a written chord tone plays, from its interval above the root. */
function toneRole(interval, hasThird, third, fifth) {
    switch (interval) {
        case 0: return 'root';
        case 3: case 4: return 'third';
        case 2: return hasThird ? 'ninth' : 'sus2';
        case 1: return 'ninth';
        case 5: return hasThird ? 'eleventh' : 'sus4';
        case 6: case 7: case 8: return 'fifth';
        case 9: return third === 3 && fifth === 6 ? 'seventh' : 'sixth';
        case 10: case 11: return 'seventh';
        default: return 'other';
    }
}

/** A written chord (pitch classes, root first) as roles: { roles: [role per pitch class], family, third, ... }. */
export function writtenChord(chord) {
    const pcs = chord.pitchClasses.map(pc => mod(pc, 12)), root = pcs[0];
    const intervals = pcs.map(pc => mod(pc - root, 12));
    const third = intervals.find(i => i === 3 || i === 4) ?? null, hasThird = third !== null;
    const fifth = intervals.find(i => i >= 6 && i <= 8) ?? null;
    const roles = intervals.map(i => toneRole(i, hasThird, third, fifth));
    const has = r => roles.includes(r);
    const base = hasThird ? 'triad' : has('sus2') ? 'sus2' : has('sus4') ? 'sus4' : 'no third';
    const extras = ['seventh', 'ninth', 'sixth', 'eleventh'].filter(has).map(r => r === 'seventh' ? '7th' : r === 'ninth' ? '9th' : r === 'sixth' ? '6th' : '11th');
    return { pcs, roles, intervals, family: [base, ...extras].join(' + ') };
}

// --- the sequencer's chord set, searched for the sounded notes ------------------------------------------

const cache = new Map();
/** Every (complexity, colour, rootVoicing, inversion) the sequencer can play on this root, keyed for lookup. */
function candidates(mode, tonic, rootPc) {
    const id = `${mode}|${tonic}|${rootPc}`;
    if (cache.has(id)) return cache.get(id);
    const key = makeKey(mode, tonic), root = midiToDegree(key, 60 + mod(rootPc - 60, 12));
    const exact = new Map(), classes = new Map(), chordClasses = new Map();
    for (const complexity of SEQUENCER.complexity) for (const colour of SEQUENCER.colour) for (const rootVoicing of SEQUENCER.root) for (let inversion = 0; inversion < 4; inversion++) {
        let notes;
        try { notes = placedChordTones(key, { root, complexity, colour, rootVoicing, inversion }); } catch { continue; }
        if (!notes.length) continue;
        const params = { complexity, colour, rootVoicing, inversion };
        const score = (complexity !== 'triad') + (colour === 'add7' ? 1.5 : colour !== 'plain') + (rootVoicing !== 'on') + (inversion !== 0);
        const set = (map, k) => { const old = map.get(k); if (!old || score < old.score) map.set(k, { params, score }); };
        set(exact, `${mod(notes[0], 12)}:${notes.map(n => n - notes[0]).join(',')}`);
        set(classes, [...new Set(notes.map(n => mod(n, 12)))].sort((a, b) => a - b).join(','));
        if (rootVoicing === 'on' && inversion === 0) set(chordClasses, [...new Set(notes.map(n => mod(n, 12)))].sort((a, b) => a - b).join(','));
    }
    const entry = { exact, classes, chordClasses };
    cache.set(id, entry);
    return entry;
}

/** The sequencer's complexity + colour for a written chord, or null when it cannot play those tones. */
export function chordFit(chord, mode, tonic) {
    const written = [...new Set(chord.pitchClasses.map(pc => mod(pc, 12)))].sort((a, b) => a - b).join(',');
    const hit = candidates(mode, tonic, mod(chord.pitchClasses[0], 12)).chordClasses.get(written);
    return hit ? { complexity: hit.params.complexity, colour: hit.params.colour } : null;
}

/**
 * Describe the notes a part sounds over one chord in the sequencer's terms.
 * `notes` are distinct MIDI pitches; the figure's octave-doubled bottom note (an arpeggio adds it) is passed as `dropTopDouble`.
 */
export function voicingParams(midis, chord, mode, tonic, { arpeggiated = false } = {}) {
    let notes = [...new Set(midis)].sort((a, b) => a - b);
    let octaveDouble = false;
    if (arpeggiated && notes.length > 2 && notes.at(-1) === notes[0] + 12) { notes = notes.slice(0, -1); octaveDouble = true; }
    const written = writtenChord(chord), root = written.pcs[0];
    const sounded = new Set(notes.map(n => mod(n, 12)));
    const inChord = notes.filter(n => written.pcs.includes(mod(n, 12)));
    const outside = notes.length - inChord.length;
    const omitted = written.pcs.flatMap((pc, i) => sounded.has(pc) ? [] : [written.roles[i]]);
    const bassIndex = written.pcs.indexOf(mod(notes[0], 12));
    const doubledRoles = written.pcs.flatMap((pc, i) => notes.filter(n => mod(n, 12) === pc).length > 1 ? [written.roles[i]] : []);
    const doubled = doubledRoles.length > 0;
    const span = notes.at(-1) - notes[0];
    const lookup = candidates(mode, tonic, root);
    const exactHit = lookup.exact.get(`${mod(notes[0], 12)}:${notes.map(n => n - notes[0]).join(',')}`);
    const classHit = lookup.classes.get([...sounded].sort((a, b) => a - b).join(','));
    const chordHit = chordFit(chord, mode, tonic);
    let fit, reason = null;
    if (exactHit) fit = 'Exact';
    else if (classHit && !doubled && !outside) { fit = 'Right tones, different spacing'; reason = span > 12 ? 'Open / wide spacing' : 'Different close arrangement'; }
    else {
        fit = 'No fit';
        reason = outside ? 'Notes outside the written chord'
            : !chordHit ? 'Chord outside the sequencer chord set'
                : classHit ? `Doubled ${doubledRoles.join(' + ')}`
                    : `Omits ${omitted.join(' + ') || 'tones'} (not available)`;
    }
    return {
        family: written.family, chordFit: chordHit, omitted, doubled, doubledRoles, outside, octaveDouble, span, size: notes.length,
        bassTone: written.roles[bassIndex] ?? 'outside chord', inversion: bassIndex,
        fit, reason, params: (exactHit ?? classHit)?.params ?? null, exact: Boolean(exactHit),
    };
}

// --- how the notes are played ----------------------------------------------------------------------------

const bounceIndex = (i, n) => { if (n < 2) return 0; const period = 2 * (n - 1), k = i % period; return k < n ? k : period - k; };
const TEMPLATES = {
    up: (i, n) => i % n, down: (i, n) => n - 1 - (i % n), upDown: bounceIndex, downUp: (i, n) => n - 1 - bounceIndex(i, n),
    broken: (i, n) => { const o = brokenOrder(n); return o[i % o.length]; },
    out: (i, n) => { const o = chordOrder('out', n); return o[i % o.length]; }, in: (i, n) => { const o = chordOrder('in', n); return o[i % o.length]; },
};
/** The direction a run of pitch ranks follows, allowing it to start part-way round (running figures rotate). */
export function directionOf(ranks, n) {
    if (n < 2 || ranks.length < 2) return 'single';
    for (const [name, template] of Object.entries(TEMPLATES)) {
        const period = name === 'upDown' || name === 'downUp' ? 2 * (n - 1) : name === 'broken' ? brokenOrder(n).length : n;
        for (let start = 0; start < period; start++) if (ranks.every((r, i) => template(i + start, n) === r)) return name;
    }
    return 'composed figure';
}

const clusterAttacks = events => {
    const sorted = [...events].sort((a, b) => a.beat - b.beat), clusters = [];
    for (const e of sorted) {
        const last = clusters.at(-1);
        if (last && e.beat - last.at <= 0.06) last.events.push(e); else clusters.push({ at: e.beat, events: [e] });
    }
    return clusters;
};
const nearestOf = (value, options) => options.reduce((best, o) => Math.abs(o - value) < Math.abs(best - value) ? o : best, options[0]);

/** Play mode, direction, rate, hold and length of one part in one bar. `units` is the bar length in meter units. */
export function playParams(events, units, slotBars = 1) {
    const clusters = clusterAttacks(events), pitches = [...new Set(events.map(e => e.midi))].sort((a, b) => a - b);
    const ends = events.map(e => e.beat + e.length), lastAt = clusters.at(-1).at;
    const longest = Math.max(...ends), commonEnd = Math.max(...ends) - Math.min(...ends) < 0.25;
    const sizes = clusters.map(c => c.events.length);
    const stepsOf = gap => { const s = gap * 4, r = Math.round(s); return Math.abs(s - r) < 0.2 ? r : Math.round(s * 10) / 10; }; // humanized timing wobbles by a few hundredths
    const gaps = clusters.slice(1).map((c, i) => c.at - clusters[i].at);
    const out = { mode: 'other', direction: null, rate: null, hold: null, hits: clusters.length, lengthShare: null, slotBars,
        gapSteps: gaps.map(stepsOf), positions: clusters.map(c => Math.round(c.at * 4) / 4) };
    if (clusters.length === 1) {
        out.mode = pitches.length === 1 ? 'single note' : 'chord';
        out.length = clusters[0].events[0].length;
        out.lengthShare = Math.round(Math.min(1, Math.max(...events.map(e => e.length)) / (units * slotBars)) * 20) * 5;
        out.hold = longest >= units * slotBars * 0.8 ? 'sustain' : 'stab';
        return out;
    }
    if (sizes.every(s => s === 1)) {
        const rank = new Map(pitches.map((p, i) => [p, i]));
        const ranks = clusters.map(c => rank.get(c.events[0].midi));
        const spacing = median(gaps);
        const distinct = new Set(ranks).size === ranks.length;
        out.rate = stepsOf(spacing);
        if (distinct && commonEnd && ranks.length <= pitches.length) {
            out.mode = spacing >= 0.75 ? 'stack' : 'roll';
            out.direction = directionOf(ranks, pitches.length);
            out.hold = 'end';
            out.lengthShare = Math.round(Math.min(1, (longest) / (units * slotBars)) * 20) * 5;
            return out;
        }
        out.mode = 'arp';
        out.direction = directionOf(ranks, pitches.length);
        out.even = gaps.every(g => Math.abs(g - spacing) < 0.13);
        if (!out.even) { out.rate = 'syncopated'; out.hitPattern = clusters.map(c => Math.round(c.at * 4) / 4).join(' '); }
        if (out.direction === 'composed figure') out.figure = `${pitches.length} tones: ${ranks.join(' ')}`;
        const ratio = median(clusters.map(c => c.events[0].length)) / spacing;
        out.hold = ratio > 3.5 ? 'end' : nearestOf(ratio, [1, 2, 3]);
        out.holdRatio = Math.round(ratio * 100) / 100;
        return out;
    }
    // repeated multi-note hits
    const sets = clusters.map(c => c.events.map(e => e.midi).sort((a, b) => a - b).join(','));
    const lowOnly = clusters.filter(c => c.events.length === 1 && c.events[0].midi === pitches[0]).length;
    out.rate = stepsOf(median(gaps));
    if (lowOnly && sizes.some(s => s > 1) && new Set(sets).size > 1) {
        out.mode = 'split pulse'; // the low note holds, the upper notes strike between
        out.hits = clusters.length;
    } else out.mode = new Set(sets).size === 1 ? 'pulse' : 'varying pulse';
    const ratios = clusters.slice(0, -1).map((c, i) => c.events[0].length / gaps[i]);
    out.holdRatio = Math.round(median(ratios) * 100) / 100;
    out.hold = out.holdRatio >= 0.9 ? 'tied to next hit' : 'short';
    out.hitPattern = clusters.map(c => Math.round(c.at * 4) / 4).join(' ');
    return out;
}

/** One part in one bar, described in full. Returns null when there is nothing to describe. */
export function describePart(events, { chord, mode, tonic, units, slotBars = 1, style = null }) {
    if (!events.length) return null;
    const play = playParams(events, units, slotBars);
    const arpeggiated = play.mode === 'arp';
    const voicing = voicingParams(events.map(e => e.midi), chord, mode, tonic, { arpeggiated });
    return { play, voicing, label: style };
}

/** What a sequencer chord track could not say about this part, as short labels (empty: it can say all of it). */
export function sequencerGaps({ play, voicing }) {
    const gaps = [];
    if (voicing.fit !== 'Exact') gaps.push(`voicing: ${voicing.reason}`);
    if (play.mode === 'arp') {
        if (!SEQUENCER.directions.includes(play.direction)) gaps.push(`arp direction: ${play.direction}`);
        if (play.rate === 'syncopated') gaps.push('arp rhythm: syncopated hits');
        else if (!SEQUENCER.rates.includes(play.rate)) gaps.push(`arp rate: ${play.rate} steps`);
        if (!SEQUENCER.holds.includes(play.hold)) gaps.push(`arp hold: ${play.hold}`);
    } else if (!['chord', 'single note'].includes(play.mode)) gaps.push(`play mode: ${play.mode}`);
    return gaps;
}

/** How a later bar of a held chord plays the first bar's figure (padVariation.js: reverse, rotate, lift, thin); both are time-ordered single-note figures. */
export function figureVariation(base, current) {
    const same = (a, b) => a.length === b.length && a.every((m, i) => m === b[i]), n = base.length;
    if (same(base, current)) return 'same';
    if (same([...base].reverse(), current)) return 'reverse';
    for (let k = 1; k < n; k++) if (same(base.map((_, i) => base[(i + k) % n]), current)) return 'rotate';
    if (same(base.map((m, i) => i >= n - 2 ? m + 12 : m), current)) return 'lift';
    for (let drop = 0; drop < n; drop++) if (same(base.filter((_, i) => i !== drop), current)) return 'thin';
    return 'other';
}

/** The pitches of a running figure in time order, or null when a bar is not one note at a time. */
export function figureOf(events) {
    const sorted = [...events].sort((a, b) => a.beat - b.beat);
    return sorted.every((e, i) => i === 0 || e.beat - sorted[i - 1].beat > 0.06) ? sorted.map(e => e.midi) : null;
}
