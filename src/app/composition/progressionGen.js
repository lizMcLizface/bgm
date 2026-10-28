import { seeded } from '../random';

/**
 * A generated chord progression for one cycle, drawn from the rock corpus's chord-to-chord statistics (de Clercq &
 * Temperley 2011, Table 3) and bent by three mood controls, then checked against hard limits. Pure: the same inputs give
 * the same progression.
 *
 * mood.brightness -1..1  dark (flat and minor chords) to bright (IV, V, ii)
 * mood.stability   0..1  floating (no tonic chord at all) to settled (the tonic is the home and the wrap returns to it)
 * mood.adventure   0..1  how far from the corpus favourites it may wander: flattens the probabilities and allows more borrowed chords
 *
 * How it works: chords are states with a root interval from the tonic. The weight of a move from one state to another is the
 * corpus count for that root pair, times the share of the state, times a mood factor from the destination's colour. A first-order
 * chain draws many candidate cycles; each is rejected if it breaks a hard limit (no immediate repeat, including from the last chord
 * back to the first; enough distinct chords; borrowed-chord and tonic-visit counts for the mood) and the rest are scored by the
 * log-probability of their moves, wrap-around included. The better half are kept and one is chosen by a seeded draw.
 */

// Chord roots as semitones above the tonic; Table 3 of de Clercq & Temperley (2011), rows = from, columns = to, read from the page image.
// Order: I bII II bIII III IV #IV V bVI VI bVII VII
export const CORPUS_TRANSITIONS = [
    [0, 25, 132, 94, 44, 1052, 2, 710, 104, 302, 470, 16],
    [31, 0, 0, 2, 2, 0, 0, 0, 0, 0, 0, 12],
    [120, 1, 0, 2, 20, 58, 0, 97, 0, 24, 10, 0],
    [50, 6, 6, 0, 0, 64, 2, 2, 67, 0, 41, 0],
    [16, 0, 39, 0, 0, 46, 0, 6, 0, 60, 3, 4],
    [1162, 14, 30, 98, 45, 0, 4, 514, 57, 72, 90, 4],
    [7, 0, 0, 6, 0, 10, 0, 0, 0, 0, 0, 0],
    [788, 0, 36, 6, 17, 392, 4, 0, 6, 191, 48, 0],
    [208, 0, 1, 20, 0, 22, 6, 22, 0, 10, 78, 0],
    [144, 0, 87, 0, 32, 260, 0, 124, 21, 0, 3, 0],
    [386, 0, 0, 11, 2, 188, 2, 26, 114, 6, 0, 0],
    [18, 0, 0, 0, 12, 0, 4, 0, 0, 3, 0, 0],
];
// Table 2: how often each root is the chord at all, used for the first chord of a cycle that does not start on the tonic.
export const CORPUS_ROOTS = [0.328, 0.005, 0.036, 0.026, 0.019, 0.226, 0.003, 0.163, 0.04, 0.072, 0.081, 0.004];

// The chords each kind of key can use. numeral + borrow are what Generator.buildChord takes; corpus is the root class in the tables;
// share splits a root class between variants (the corpus does not tell diatonic and borrowed IV apart); colour is -1 dark .. 1 bright
// (a judgement: minor and flat chords dark, major and sub-dominant side chords bright).
const MAJOR = [
    { id: 'I', numeral: 'I', corpus: 0, share: 1, colour: 0.3, tonic: true },
    { id: 'ii', numeral: 'ii', corpus: 2, share: 1, colour: 0.2 },
    { id: 'iii', numeral: 'iii', corpus: 4, share: 1, colour: -0.2 },
    { id: 'IV', numeral: 'IV', corpus: 5, share: 0.88, colour: 0.5 },
    { id: 'iv', numeral: 'IV', borrow: true, corpus: 5, share: 0.12, colour: -0.9 },
    { id: 'V', numeral: 'V', corpus: 7, share: 1, colour: 0.4 },
    { id: 'vi', numeral: 'vi', corpus: 9, share: 1, colour: -0.2 },
    { id: 'bVI', numeral: 'VI', borrow: true, corpus: 8, share: 1, colour: -0.7 },
    { id: 'bVII', numeral: 'VII', borrow: true, corpus: 10, share: 1, colour: -0.3 },
];
const MINOR = [
    { id: 'i', numeral: 'i', corpus: 0, share: 1, colour: -0.3, tonic: true },
    { id: 'ii', numeral: 'ii', corpus: 2, share: 0.3, colour: -0.8 },
    { id: 'III', numeral: 'III', corpus: 3, share: 1, colour: 0.4 },
    { id: 'iv', numeral: 'iv', corpus: 5, share: 0.75, colour: -0.4 },
    { id: 'IV', numeral: 'IV', borrow: true, corpus: 5, share: 0.25, colour: 0.4 },
    { id: 'v', numeral: 'v', corpus: 7, share: 0.5, colour: -0.5 },
    { id: 'V', numeral: 'V', borrow: true, corpus: 7, share: 0.5, colour: 0.3 },
    { id: 'VI', numeral: 'VI', corpus: 8, share: 1, colour: 0.1 },
    { id: 'VII', numeral: 'VII', corpus: 10, share: 1, colour: 0.2 },
];
export const STATES = { major: MAJOR, minor: MINOR };

/** Named starting points for the three mood controls. */
export const MOODS = {
    warm: { brightness: 0.3, stability: 0.8, adventure: 0.1 },
    hopeful: { brightness: 0.6, stability: 0.75, adventure: 0.25 },
    bittersweet: { brightness: -0.2, stability: 0.6, adventure: 0.4 },
    wistful: { brightness: -0.4, stability: 0.5, adventure: 0.3 },
    dreamy: { brightness: 0.1, stability: 0.3, adventure: 0.5 },
    tense: { brightness: -0.5, stability: 0.2, adventure: 0.6 },
    dark: { brightness: -0.8, stability: 0.6, adventure: 0.3 },
    wandering: { brightness: 0, stability: 0.15, adventure: 0.9 },
};
export const DEFAULT_MOOD = { brightness: 0, stability: 0.7, adventure: 0.3 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const CANDIDATES = 240, TOP = 8, KEEP = 0.5; // draws per progression, the fewest kept, the share of valid draws kept

/** Weights of every move between the states of a key, for a mood. weights[from][to]; the entry is 0 where the move is not allowed. */
export function transitionWeights(states, mood) {
    const { brightness, stability, adventure } = { ...DEFAULT_MOOD, ...mood };
    const tonicBoost = stability < 0.25 ? 0 : 0.35 + 1.3 * stability;
    const temperature = 0.7 + 0.9 * adventure;
    return states.map((from) => states.map((to) => {
        if (from.corpus === to.corpus) return 0; // no repeat of a root, and no hop between two variants of one
        const base = CORPUS_TRANSITIONS[from.corpus][to.corpus] * to.share;
        if (base <= 0) return 0;
        const moodFactor = Math.exp(1.2 * brightness * to.colour) * (to.tonic ? tonicBoost : 1);
        return Math.pow(base * moodFactor, 1 / temperature);
    }));
}

const pickWeighted = (rng, weights) => {
    const total = weights.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return -1;
    let roll = rng() * total;
    for (let i = 0; i < weights.length; i++) if ((roll -= weights[i]) < 0) return i;
    return weights.length - 1;
};

/**
 * One progression of `length` chords.
 * @param {object} o
 * @param {number} o.seed
 * @param {number} o.length - chords in the cycle (the bank's lengths are 2-8)
 * @param {'major'|'minor'} o.family - which kind of key the chords are built in
 * @param {object} [o.mood] - { brightness, stability, adventure }
 * @param {string} [o.after] - id of the last chord of the cycle before, so the new cycle starts somewhere plausible
 * @returns {{ numerals: string[], borrows: boolean[], ids: string[], unsettled: boolean, score: number }}
 */
export function generateProgression({ seed = 1, length = 4, family = 'major', mood = {}, after = null }) {
    const m = { ...DEFAULT_MOOD, ...mood };
    m.brightness = clamp(m.brightness, -1, 1); m.stability = clamp(m.stability, 0, 1); m.adventure = clamp(m.adventure, 0, 1);
    const states = STATES[family] ?? MAJOR, W = transitionWeights(states, m);
    const L = clamp(Math.round(length), 2, 12), rng = seeded((seed ^ 0x6a09e667) >>> 0);
    const floating = m.stability < 0.25, settled = m.stability >= 0.66;
    const maxBorrow = 1 + Math.round(2 * m.adventure), minDistinct = Math.min(L, Math.max(2, Math.ceil(L * (0.55 + 0.25 * m.adventure))));
    const maxTonic = floating ? 0 : Math.max(1, Math.ceil(L / 2)), minTonic = settled ? 1 : 0;
    const index = new Map(states.map((s, i) => [s.id, i]));
    const afterIndex = after !== null && index.has(after) ? index.get(after) : null;

    // the first chord: the tonic when the mood is settled enough, else one of the other chords by how common it is
    const startWeights = states.map((s) => {
        if (s.tonic) return floating ? 0 : (settled ? 6 : 1.5) * (afterIndex !== null && states[afterIndex].tonic ? 0 : 1);
        return CORPUS_ROOTS[s.corpus] * s.share * Math.exp(1.2 * m.brightness * s.colour) * (afterIndex !== null ? Math.max(0.05, W[afterIndex][states.indexOf(s)]) / 400 : 1);
    });

    const candidates = [];
    for (let n = 0; n < CANDIDATES; n++) {
        const path = [];
        let at = pickWeighted(rng, startWeights);
        if (at < 0) continue;
        path.push(at);
        for (let i = 1; i < L; i++) {
            const row = W[at].map((w, j) => (floating && states[j].tonic ? 0 : w));
            const next = pickWeighted(rng, row);
            if (next < 0) break;
            path.push(next); at = next;
        }
        if (path.length < L) continue;
        const wrapRow = W[path[L - 1]], wrap = wrapRow[path[0]];
        if (wrap <= 0) continue; // the last chord must be able to lead back to the first (also rules out an immediate repeat)
        const counts = new Map(path.map((i) => [i, 0]));
        path.forEach((i) => counts.set(i, counts.get(i) + 1));
        const tonics = path.filter((i) => states[i].tonic).length, borrowed = path.filter((i) => states[i].borrow).length;
        if (new Set(path).size < minDistinct || Math.max(...counts.values()) > Math.max(2, Math.ceil(L / 2)) || borrowed > maxBorrow || tonics > maxTonic || tonics < minTonic) continue;
        let score = 0;
        for (let i = 0; i + 1 < L; i++) score += Math.log(W[path[i]][path[i + 1]] / rowTotal(W[path[i]]));
        score += (settled ? 2 : 1) * Math.log(wrap / rowTotal(wrapRow)); // the loop closes: weight it, more when the mood is settled
        if (afterIndex !== null) score += 0.5 * Math.log(Math.max(1e-6, W[afterIndex][path[0]]) / rowTotal(W[afterIndex]));
        candidates.push({ path, score });
    }
    if (!candidates.length) return fallback(states, L, m);
    // keep the better-scoring part of the draws (repeated draws of one path make it proportionally likelier) and take one at random
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates.slice(0, Math.max(TOP, Math.ceil(candidates.length * KEEP)));
    const chosen = best[Math.floor(rng() * best.length)];
    const chosenStates = chosen.path.map((i) => states[i]);
    return { numerals: chosenStates.map((s) => s.numeral), borrows: chosenStates.map((s) => !!s.borrow), ids: chosenStates.map((s) => s.id),
        unsettled: !chosenStates.some((s) => s.tonic), score: chosen.score };
}

const rowTotal = (row) => row.reduce((a, b) => a + b, 0) || 1;

// No candidate met the limits (very tight mood and a short cycle): a plain I-IV-V-style cycle, never an error.
function fallback(states, L, mood) {
    const pick = ['I', 'i', 'IV', 'iv', 'V', 'v', 'vi', 'VI', 'VII'];
    const chosen = [];
    for (const id of pick) { const s = states.find((x) => x.id === id); if (s && !chosen.includes(s) && !(mood.stability < 0.25 && s.tonic)) chosen.push(s); }
    const cycle = Array.from({ length: L }, (_, i) => chosen[i % chosen.length]);
    return { numerals: cycle.map((s) => s.numeral), borrows: cycle.map((s) => !!s.borrow), ids: cycle.map((s) => s.id), unsettled: !cycle.some((s) => s.tonic), score: -Infinity };
}
