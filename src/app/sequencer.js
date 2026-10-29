// The step sequencer as the song's percussion: a beat or arrangement from synths/drums/beats.js, played
// exactly as written on the TR-808 / 909 (or mapped to the generator's drum kit). Eight stages
// (Intro .. Turnaround); each chord slot of the progression can be given a stage of its own.
import { BEATS, ARRANGEMENTS, arrangementFor } from '../synths/drums/beats';
import { DRUMS } from './percussion';
import { seeded } from './random';

export const STAGE_NAMES = ['Intro', 'Groove', 'Variation', 'Fill', 'Breakdown', 'Build', 'Drop', 'Turnaround'];
export const SEQ_VOICES = ['bd', 'sd', 'lt', 'mt', 'ht', 'lc', 'mc', 'hc', 'rs', 'cl', 'cp', 'ma', 'cb', 'cy', 'oh', 'ch', 'cr', 'rd'];
export const SEQ_MACHINES = ['tr808', 'tr909'];
export const SEQ_MAX_SLOTS = 16;
export const ROW = /^[.xf]{16}$/;

// Lanes: the chords and the bass played on steps of their own (rows 'pad' and 'bass': x a hit, f an accent / octave up),
// with tight stab voices, for the driven rhythm of techno and house that sustained pads and swells cannot give.
export const LANES = ['pad', 'bass'];
export const defaultSequencer = () => ({ on: false, machine: 'tr808', arrangement: '', edits: {}, slots: [], lanes: false, gate: 0.22, pump: 0.5, variation: 0.6, fills: false, moves: {}, sectionBars: 0 });
export const SECTION_BARS = [0, 4, 8, 16];

// Moves: effects that open, close or sweep across the chord a stage is played on (the shared effects bus):
// from its value at the chord's first bar to its value at the last. { key, from, to }, per stage.
export const MOVE_PARAMS = {
    'inserts.phaser': { label: 'Phaser mix', min: 0, max: 1 },
    'inserts.phaserRate': { label: 'Phaser rate', min: 0.02, max: 5 },
    'inserts.chorus': { label: 'Chorus mix', min: 0, max: 0.8 },
    'inserts.chorusRate': { label: 'Chorus rate', min: 0.05, max: 10 },
    'inserts.flanger': { label: 'Flanger mix', min: 0, max: 1 },
    'inserts.saturation': { label: 'Saturation', min: 0, max: 1 },
    'effects.delay': { label: 'Delay', min: 0, max: 0.8 },
    'effects.delayMs': { label: 'Delay spacing ms', min: 40, max: 2000 },
    'effects.feedback': { label: 'Delay feedback', min: 0, max: 0.85 },
    'effects.reverb': { label: 'Reverb', min: 0, max: 0.8 },
    // a filter on the whole mix (engine/sweepFilter.js); frequencies move in octaves, not Hz
    'filter.lowpass': { label: 'Low-pass filter (Hz)', min: 100, max: 22000, log: true },
    'filter.highpass': { label: 'High-pass filter (Hz)', min: 10, max: 8000, log: true },
    'filter.resonance': { label: 'Filter resonance', min: 0.5, max: 14, log: true },
    'send.pad': { label: 'Chords to bus', min: 0, max: 1 },
    'send.bass': { label: 'Bass to bus', min: 0, max: 1 },
    'send.lead': { label: 'Lead to bus', min: 0, max: 1 },
    'send.perc': { label: 'Drums to bus', min: 0, max: 1 },
};
export const MOVE_MAX = 6;
const inRange = (key, v) => Number.isFinite(v) && v >= MOVE_PARAMS[key].min && v <= MOVE_PARAMS[key].max;
export function cleanMoves(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const out = {};
    for (const [stage, list] of Object.entries(raw)) {
        const s = Number(stage);
        if (!Number.isInteger(s) || s < 0 || s > 7 || !Array.isArray(list)) continue;
        const clean = list.filter((m) => m && MOVE_PARAMS[m.key] && inRange(m.key, m.from) && inRange(m.key, m.to)).slice(0, MOVE_MAX).map(({ key, from, to }) => ({ key, from, to }));
        if (clean.length) out[s] = clean;
    }
    return out;
}
/** The moves' values at `progress` (0..1 through the chord) of a stage: { key: value }. */
export const moveValues = (seq, stage, progress) => Object.fromEntries((seq?.moves?.[stage] ?? []).map(({ key, from, to }) => {
    const p = Math.min(1, Math.max(0, progress));
    return [key, MOVE_PARAMS[key]?.log ? from * (to / from) ** p : from + (to - from) * p];
}));

const BLANK = '.'.repeat(16);
const every = (...steps) => Array.from({ length: 16 }, (_, i) => (steps.includes(i) ? 'x' : '.')).join('');
const BUSY = new Set(['House', 'Techno', 'Trance']);
const SWING = new Set(['House', 'Techno']);
/** A shaker answering the hats on the off sixteenths, in the groove stages of house and techno that have none (syncopated shakers: the tech house guides). */
const shakerDefault = (category, stageName, rows) => (SWING.has(category) && !rows.ma && ['Groove', 'Variation', 'Fill', 'Drop', 'Turnaround'].includes(stageName) ? { ma: stageName === 'Drop' ? '.x.x.xx..x.x.xx.' : '..x..x..x..x..x.' } : {});
/** The starting chord and bass rows of a stage (an edit replaces them): off-beat stabs and a rolling bass for house and techno, the kick's own steps for the rest. */
export function laneDefaults(category, stageName, kickRow = BLANK) {
    const busy = BUSY.has(category);
    if (category === 'Trance') {
        // trance: the chords as a sixteenth-note pluck line (variation turns it into an arpeggio), the bass on the off-beat eighths between the kicks
        const run = 'x'.repeat(16), off = every(2, 6, 10, 14);
        switch (stageName) {
            case 'Intro': return { pad: BLANK, bass: off };
            case 'Breakdown': return { pad: every(0, 8), bass: BLANK };
            case 'Build': return { pad: run, bass: off };
            case 'Drop': return { pad: 'fxxxfxxxfxxxfxxx', bass: '..x...x...x...f.' };
            default: return { pad: run, bass: off };
        }
    }
    const offbeat = every(2, 6, 10, 14), rolling = '.xxf.xxf.xxf.xxf', bounce = '..x...xx..x...xf', onKick = kickRow.replace(/[xf]/g, 'x');
    switch (stageName) {
        case 'Intro': return { pad: BLANK, bass: busy ? offbeat : onKick };
        case 'Breakdown': return { pad: every(0, 8), bass: BLANK };
        case 'Build': return { pad: 'x'.repeat(16), bass: busy ? offbeat : onKick };
        case 'Drop': return { pad: busy ? offbeat : every(0, 3, 6, 10), bass: busy ? rolling : onKick.replace(/x/g, (c, i) => (i % 8 === 0 ? 'f' : c)) };
        default: return { pad: busy ? offbeat : every(0, 3, 6, 10, 12), bass: busy ? (stageName === 'Variation' ? '..x..xx...x..xxf' : bounce) : onKick };
    }
}

export const sequencerIds = () => new Set([...BEATS.map((b) => b.id), ...ARRANGEMENTS.map((a) => a.id)]);

/** Untrusted edits -> { stage: { voice: row } } with only well-formed rows. */
export function cleanEdits(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const out = {};
    for (const [stage, rows] of Object.entries(raw)) {
        const s = Number(stage);
        if (!Number.isInteger(s) || s < 0 || s > 7 || !rows || typeof rows !== 'object') continue;
        const clean = Object.fromEntries(Object.entries(rows).filter(([voice, row]) => (SEQ_VOICES.includes(voice) || voice === 'A' || LANES.includes(voice)) && ROW.test(row)));
        if (Object.keys(clean).length) out[s] = clean;
    }
    return out;
}

export const cleanSlots = (raw) => (Array.isArray(raw) && raw.length <= SEQ_MAX_SLOTS && raw.every((v) => Number.isInteger(v) && v >= -1 && v <= 7) ? raw : undefined);

/** The eight stages' rows (voice -> 16 characters), the edits laid over the recipe. */
export function sequencerStages(seq) {
    const recipe = arrangementFor(seq?.arrangement);
    if (!recipe) return null;
    return recipe.stages.map((stage, i) => {
        const name = stage.name || STAGE_NAMES[i];
        return { name, rows: { ...laneDefaults(recipe.category, STAGE_NAMES[i], stage.rows.bd), ...shakerDefault(recipe.category, STAGE_NAMES[i], stage.rows), ...stage.rows, ...(seq.edits?.[i] ?? {}) } };
    });
}

/** The stage a bar plays: the chord slot's own, or - for "follow" (-1) - the arrangement's chain, a stage per bar. */
/**
 * Where a bar sits in what its stage lasts: { start, bars, left }. By default a stage lasts as long as its chord; with
 * seq.sectionBars (4, 8 or 16) it lasts that many bars whatever the chords do - the section lengths of dance music.
 */
export function stageSpan(seq, slot, bar) {
    const sb = seq?.sectionBars | 0;
    if (sb > 0) { const start = Math.floor(bar / sb) * sb; return { start, bars: sb, left: start + sb - bar }; }
    return { start: slot.start, bars: slot.bars, left: slot.left };
}

export function stageForBar(seq, { slotIndex = 0, bar = 0 } = {}) {
    const recipe = arrangementFor(seq?.arrangement);
    if (!recipe) return 1;
    const sb = seq.sectionBars | 0;
    if (sb > 0) {
        // sections in turn: each list entry is one section, then the list starts again; "follow" walks the arrangement's chain
        const k = Math.floor(bar / sb), list = seq.slots ?? [];
        const own = list.length ? list[((k % list.length) + list.length) % list.length] : -1;
        return own >= 0 ? own : recipe.chain[((k % recipe.chain.length) + recipe.chain.length) % recipe.chain.length];
    }
    const own = seq.slots?.[slotIndex];
    if (Number.isInteger(own) && own >= 0) return own;
    return recipe.chain[((bar % recipe.chain.length) + recipe.chain.length) % recipe.chain.length];
}

// Nearest of the generator's drums for each machine voice (the felt / crisp kits, levels, visuals).
const NEAREST = { bd: 'kick', sd: 'snare', cp: 'clap', ch: 'hat', oh: 'swish', rs: 'rim', cb: 'bell', cy: 'crash', cr: 'crash', rd: 'ride', lt: 'tom', mt: 'tom', ht: 'tom', lc: 'tom', mc: 'tom', hc: 'tom', cl: 'rim', ma: 'shaker' };
export const nearestDrum = (voice) => DRUMS.indexOf(NEAREST[voice]);

const ACCENT = [0.62, 0.72, 0.86, 1];
// Hats, shakers and other small percussion are played as a drummer would (the house guides: "vary the hat velocities so they
// aren't all the same"): the off-beat eighths lead, the other sixteenths are soft, and each hit has its own small variation.
const SMALL = new Set(['ch', 'oh', 'ma', 'rs', 'cb', 'rd', 'cl']);
// The 808's cymbal is long and bright: ride and crash steps play it well under the other drums (the ride row has no voice of its own there)
const CYMBALS = new Set(['cy', 'cr', 'rd']);
const smallVelocity = (c, rng) => (c % 4 === 2 ? 0.8 : c % 4 === 0 ? 0.6 : 0.46) * (0.9 + 0.2 * rng());

/**
 * One bar of events ({ role: 'perc', midi, track, beat, length, velocity, detune }) from a stage's rows.
 * Sixteenths; other meters tile or cut the 16 steps. The beat's swing delays the off sixteenths.
 */
export function sequencerBar({ meter, seq, slotIndex = 0, bar = 0, swing, seed = 0, barsLeft = 99 }) {
    const stages = sequencerStages(seq);
    if (!stages) return [];
    const chosen = stageForBar(seq, { slotIndex, bar });
    // fills (seq.fills): the drums of every eighth bar play the Fill stage, except in an intro or a breakdown, and the kick drops
    // out in every sixteenth bar's fill so the groove comes back with weight (house and techno guides: a fill every 8 or 16 bars)
    const fillBar = seq.fills && ((bar % 8) + 8) % 8 === 7 && chosen !== 0 && chosen !== 4;
    const noKick = (fillBar && ((bar % 16) + 16) % 16 === 15) || (chosen === 5 && barsLeft === 1);
    const stage = stages[fillBar ? 3 : chosen] ?? stages[1];
    const recipe = arrangementFor(seq.arrangement);
    // house and techno swing their sixteenths a little (8 to 20 percent, about 10 as a start)
    const shuffle = (Math.max(swing ?? recipe.swing ?? 0.5, SWING.has(recipe.category) ? 0.55 : 0) - 0.5) * 0.5;
    const rng = seeded((seed * 131 + bar * 104729 + 3) >>> 0);
    const steps = Math.round(meter.units * 4), accents = stage.rows.A ?? '';
    const events = [];
    for (let s = 0; s < steps; s++) {
        const c = s % 16, at = s * 0.25 + (c % 2 ? shuffle : 0);
        const accent = accents[c] === 'x' ? 3 : accents[c] === '.' || accents[c] === undefined ? 0 : 1;
        for (const [voice, row] of Object.entries(stage.rows)) {
            if (voice === 'A' || LANES.includes(voice) || row[c] === '.' || row[c] === undefined) continue;
            if (noKick && voice === 'bd') continue;
            const velocity = (CYMBALS.has(voice) ? 0.55 : 1) * (SMALL.has(voice) ? (accent ? ACCENT[accent] * 0.8 : smallVelocity(c, rng)) : ACCENT[accent]);
            const midi = nearestDrum(voice);
            if (row[c] === 'f') events.push({ role: 'perc', midi, track: voice, beat: Math.max(0, at - 0.06), length: 0.05, velocity: velocity * 0.45, detune: 0 });
            events.push({ role: 'perc', midi, track: voice, beat: at, length: 0.25, velocity, detune: 0, exact: true });
        }
    }
    return events;
}

const STAB_RANGE = [57, 79], BASS_RANGE = [31, 45];
const placed = (pc, [low, high], near) => {
    let best = null;
    for (let m = low; m <= high; m++) if (m % 12 === pc && (best === null || Math.abs(m - near) < Math.abs(best - near))) best = m;
    return best ?? pc + 12 * Math.ceil((low - pc) / 12);
};

/**
 * The chord and bass lanes of a bar: the chord's tones as short stabs and its root as a bass line, on the steps of the
 * stage's 'pad' and 'bass' rows. `gate` is the length in beats. Returns events for roles 'pad' and 'bass'.
 */
export function sequencerLanes({ meter, seq, chord, slotIndex = 0, bar = 0, seed = 0 }) {
    const stages = sequencerStages(seq);
    if (!stages || !chord?.pitchClasses?.length) return [];
    const stage = stages[stageForBar(seq, { slotIndex, bar })] ?? stages[1];
    const steps = Math.round(meter.units * 4), gate = Math.max(0.05, seq.gate ?? 0.22) * meter.unitsPerBeat;
    const tones = [...new Set(chord.pitchClasses)].map((pc) => placed(pc, STAB_RANGE, 66)).sort((a, b) => a - b);
    const root = placed(chord.pitchClasses[0], BASS_RANGE, 38);
    // Variation (seq.variation): the stabs breathe over a phrase and play single tones along a contour - a line, not a wall of chords.
    // A plain hit may be one chord tone (walking up and down the chord, an octave higher now and then) or dropped; an accent is the whole chord.
    // The fourth bar of a phrase is the sparsest, every eighth bar rests the chords, and the bass thins a little.
    const v = Math.min(1, Math.max(0, seq.variation ?? 0));
    const rng = seeded((seed * 131 + bar * 7919 + 17) >>> 0);
    const keep = [1, 1 - 0.35 * v, 1 - 0.15 * v, 1 - 0.55 * v][((bar % 4) + 4) % 4];
    const restBar = v > 0.5 && ((bar % 8) + 8) % 8 === 7;
    // the chord's tones and the first two again an octave up, walked up and down
    const ladder = [...tones, ...tones.slice(0, 2).map((m) => m + 12)], contour = [0, 1, 2, 3, 4, 3, 2, 1];
    const events = [];
    let walked = 0;
    for (let s = 0; s < steps; s++) {
        const c = s % 16, at = s * 0.25;
        const stab = stage.rows.pad?.[c], low = stage.rows.bass?.[c];
        if ((stab === 'x' || stab === 'f') && !(restBar && stab !== 'f')) {
            const kept = stab === 'f' || v === 0 || rng() < keep;
            if (kept) {
                const single = stab !== 'f' && v > 0 && rng() < 0.45 + 0.5 * v;
                if (single) {
                    const midi = ladder[contour[(walked + bar * 3) % contour.length] % ladder.length];
                    walked++;
                    events.push({ role: 'pad', midi, beat: at, length: gate, velocity: 0.78, detune: 0 });
                } else {
                    for (const midi of tones) events.push({ role: 'pad', midi, beat: at, length: gate, velocity: stab === 'f' ? 0.95 : 0.7, detune: 0 });
                }
            }
        }
        if ((low === 'x' || low === 'f') && (low === 'f' || v === 0 || rng() < 1 - 0.2 * v)) events.push({ role: 'bass', midi: low === 'f' ? root + 12 : root, beat: at, length: Math.min(gate * 1.2, 0.5 * meter.unitsPerBeat), velocity: low === 'f' ? 0.9 : 0.8, detune: 0 });
    }
    return events;
}
