// The Conductor (docs/DESIGN.md §3, "Drift"): decides, once per
// progression cycle, whether key, mode, progression and tempo move. Pure -
// randomness via `rng`.
//
// "music" = { tonic, mode, progression, bpm } - mode is a scale id
// ('Major-1'), bpm the tempo being glided toward. "home" is the same shape:
// what the user set.
//
// Relatedness is measured as how many pitch classes two scales differ by,
// which works for every scale family: a fifth up or down changes one note,
// relative major/minor changes none. Centered drift never strays more than
// MAX_DISTANCE notes from home, and whenever it is away, each cycle it
// heads back with probability homePull - independently of the change
// chances, otherwise leaving (chance-gated) would outpace returning and
// "centered" would rarely be home. Wandering is a free walk over related
// moves.

import { SCALE_FAMILIES, scaleById, scaleSemitones } from './theory';
import { chance, pick } from './random';

export const DRIFT_MODES = { off: 'Off', centered: 'Centered on my settings', wandering: 'Wandering' };

export const DEFAULT_DRIFT = {
    mode: 'off',
    keyChance: 0.15, // per progression cycle
    modeChance: 0.1,
    progressionChance: 0.25,
    tempoChance: 0.2,
    tempoRange: 8, // ± BPM around home (centered)
    homePull: 0.5, // centered: per-cycle chance to head back when away
    pivot: true, // prepare key changes with the new key's dominant
    excludedTonics: [], // pitch classes drift never moves to
    excludedModes: [], // scale ids drift never moves to
};

// Centered: at most this many pitch classes differ from the home scale.
export const MAX_DISTANCE = 2;
// Wandering tempo bounds (centered uses home ± tempoRange).
export const TEMPO_BOUNDS = [50, 110];
// Chance a chance-triggered centered move goes back toward home when away
// (on top of homePull's own per-cycle return).
const PULL_HOME = 0.6;

const mod12 = (n) => ((n % 12) + 12) % 12;

/** Pitch classes of a scale at a tonic. */
export function scalePcs(tonic, modeId) {
    return scaleSemitones(scaleById(modeId).intervals).map((s) => mod12(tonic + s));
}

/** How many pitch classes of a are not in b (0 = same notes). */
export function scaleDistance(a, b) {
    const pcsB = new Set(scalePcs(b.tonic, b.mode));
    return scalePcs(a.tonic, a.mode).filter((pc) => !pcsB.has(pc)).length;
}

const familyOf = (modeId) => modeId.slice(0, modeId.lastIndexOf('-'));
const modeIndex = (modeId) => Number(modeId.slice(modeId.lastIndexOf('-') + 1));

// Key moves keeping the mode: a fifth up/down. In the Major family also
// the relative major/minor (Ionian <-> Aeolian, same notes).
function keyMoves({ tonic, mode }) {
    const moves = [{ tonic: mod12(tonic + 7), mode }, { tonic: mod12(tonic + 5), mode }];
    if (mode === 'Major-1') moves.push({ tonic: mod12(tonic + 9), mode: 'Major-6' });
    if (mode === 'Major-6') moves.push({ tonic: mod12(tonic + 3), mode: 'Major-1' });
    return moves;
}

// Mode moves keeping the tonic: modes of the same family that differ from
// the current one by a single note (parallel neighbours, e.g. Ionian ->
// Lydian / Mixolydian), falling back to the adjacent family members.
function modeMoves({ tonic, mode }) {
    const family = SCALE_FAMILIES.find((f) => f.family === familyOf(mode));
    const others = family.modes.map((m) => ({ tonic, mode: m.id })).filter((m) => m.mode !== mode);
    const close = others.filter((m) => scaleDistance(m, { tonic, mode }) <= 1);
    if (close.length) return close;
    const i = modeIndex(mode);
    return others.filter((m) => Math.abs(modeIndex(m.mode) - i) === 1);
}

// Picks a move. Centered: only moves within MAX_DISTANCE of home; when away
// from home, prefer moves that get closer (or home itself, when reachable).
function chooseMove(moves, current, home, drift, rng) {
    if (!moves.length) return null;
    if (drift.mode !== 'centered') return pick(rng, moves);
    const allowed = moves.filter((m) => scaleDistance(m, home) <= MAX_DISTANCE);
    if (!allowed.length) return null;
    const here = scaleDistance(current, home);
    const isHome = (m) => m.tonic === home.tonic && m.mode === home.mode;
    if ((here > 0 || current.tonic !== home.tonic) && chance(rng, PULL_HOME)) {
        const homeward = allowed.filter((m) => isHome(m) || scaleDistance(m, home) < here);
        if (homeward.length) return homeward.find(isHome) || pick(rng, homeward);
    }
    return pick(rng, allowed);
}

function nextTempo(bpm, home, drift, rng) {
    const step = pick(rng, [2, 3, 4, 5, 6]);
    if (drift.mode === 'centered') {
        const lo = home.bpm - drift.tempoRange;
        const hi = home.bpm + drift.tempoRange;
        const towardHome = bpm !== home.bpm && chance(rng, PULL_HOME);
        const sign = towardHome ? Math.sign(home.bpm - bpm) : chance(rng, 0.5) ? 1 : -1;
        const target = bpm + sign * step;
        // don't overshoot home when heading back to it
        const settled = towardHome && Math.sign(home.bpm - target) !== sign ? home.bpm : target;
        return Math.max(lo, Math.min(hi, settled));
    }
    return Math.max(TEMPO_BOUNDS[0], Math.min(TEMPO_BOUNDS[1], bpm + (chance(rng, 0.5) ? step : -step)));
}

const isHomeKey = (m, home) => m.tonic === home.tonic && m.mode === home.mode;

// Moves into excluded keys/modes are dropped; home is always allowed, so
// excluding it can never strand the music away from it.
const allowedMoves = (moves, home, drift) => moves.filter((m) => isHomeKey(m, home)
    || (!drift.excludedTonics.includes(m.tonic) && !drift.excludedModes.includes(m.mode)));

// One step back toward home's key/mode: home itself if a single related
// move reaches it, else a move that shares more notes with home, else
// straight home (rare - only when no related move gets closer).
function homewardKey(current, home, drift, rng) {
    const moves = allowedMoves([...keyMoves(current), ...modeMoves(current)], home, drift);
    const reach = moves.find((m) => isHomeKey(m, home));
    if (reach) return reach;
    const here = scaleDistance(current, home);
    const closer = moves.filter((m) => scaleDistance(m, home) < here);
    return closer.length ? pick(rng, closer) : { tonic: home.tonic, mode: home.mode };
}

/**
 * The music for the next progression cycle.
 * @param {object} current - { tonic, mode, progression, bpm }
 * @param {object} home - same shape, the user's settings
 * @param {object} drift - DEFAULT_DRIFT shape
 * @param {number} progressionCount - size of the progression bank
 * @param {function} rng
 */
export function nextMusic(current, home, drift, progressionCount, rng) {
    if (drift.mode === 'off') return { ...current };
    let next = { ...current };
    const centered = drift.mode === 'centered';
    const pull = () => centered && chance(rng, drift.homePull);

    if (centered && !isHomeKey(next, home) && pull()) {
        next = { ...next, ...homewardKey(next, home, drift, rng) };
    } else {
        if (chance(rng, drift.keyChance)) {
            const move = chooseMove(allowedMoves(keyMoves(next), home, drift), next, home, drift, rng);
            if (move) next = { ...next, ...move };
        }
        if (chance(rng, drift.modeChance)) {
            const move = chooseMove(allowedMoves(modeMoves(next), home, drift), next, home, drift, rng);
            if (move) next = { ...next, ...move };
        }
    }

    if (centered && current.progression !== home.progression && pull()) {
        next.progression = home.progression;
    } else if (chance(rng, drift.progressionChance) && progressionCount > 1) {
        const goHome = centered && current.progression !== home.progression && chance(rng, PULL_HOME);
        const others = [...Array(progressionCount).keys()].filter((i) => i !== current.progression);
        next.progression = goHome ? home.progression : pick(rng, others);
    }

    if (centered && current.bpm !== home.bpm && pull()) {
        const step = pick(rng, [2, 3, 4, 5, 6]);
        next.bpm = current.bpm > home.bpm ? Math.max(home.bpm, current.bpm - step) : Math.min(home.bpm, current.bpm + step);
    } else if (chance(rng, drift.tempoChance)) {
        next.bpm = nextTempo(current.bpm, home, drift, rng);
    }
    return next;
}

/** Tempo for the next bar: glide toward `target` by at most `maxStep` BPM. */
export function glideTempo(barBpm, target, maxStep = 2) {
    return barBpm + Math.max(-maxStep, Math.min(maxStep, target - barBpm));
}
