// Modulation (docs/SEQUENCER_DEVICE_PLAN.md, roadmap 3). Pure: sources produce 0..1 (LFOs, step lanes, a sample-and-hold) and an
// assignment maps a source onto a parameter as a non-destructive offset on the stored value. The caller (useModulation) evaluates this at
// control rate on the audio clock and sends the results with setParams; nothing here touches the knobs' own values.
//
//   lfo   { shape, rate (cycles per beat), phase (0..1) }
//   lane  { steps: [0..1, ...], div (steps per beat, default 4), smooth (0..1: how much of a step is a glide) }
//   assign { source: 'lfo1' | 'lfo2' | 'lane1'..'lane8' | 'rand', amount (-1..1 of the parameter's range), offset (-1..1 of it) }

export const LFO_SHAPES = ['sine', 'triangle', 'saw', 'ramp', 'square', 'steps'];
export const SOURCES = ['lfo1', 'lfo2', ...Array.from({ length: 8 }, (_, i) => 'lane' + (i + 1)), 'rand'];
export const MAX_LANES = 8, MAX_LANE_STEPS = 64;

const frac = (x) => x - Math.floor(x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
// a cheap deterministic hash for the sample-and-hold, so the same beat position gives the same value
const hash = (n) => { let t = (Math.imul(Math.floor(n) | 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0; t = Math.imul(t ^ (t >>> 15), 0x2c1b3c6d) >>> 0; return ((t ^ (t >>> 12)) >>> 0) / 4294967296; };

/** An LFO's value 0..1 at `beat` (a position in beats). */
export function lfoValue(lfo, beat) {
    const p = frac(beat * (lfo.rate ?? 1) + (lfo.phase ?? 0));
    switch (lfo.shape) {
        case 'triangle': return p < 0.5 ? p * 2 : 2 - p * 2;
        case 'saw': return 1 - p;
        case 'ramp': return p;
        case 'square': return p < 0.5 ? 1 : 0;
        case 'steps': return Math.floor(p * 4) / 3;
        default: return 0.5 - 0.5 * Math.cos(p * 2 * Math.PI);
    }
}

/** A step lane's value 0..1 at `beat`: its own length and division, with `smooth` gliding into the next step (the last glides to the first). */
export function laneValue(lane, beat) {
    const steps = lane.steps?.length ? lane.steps : [0.5], n = steps.length, pos = beat * (lane.div ?? 4), i = ((Math.floor(pos) % n) + n) % n, f = pos - Math.floor(pos);
    const here = clamp01(steps[i] ?? 0), smooth = clamp01(lane.smooth ?? 0);
    if (!smooth) return here;
    const next = clamp01(steps[(i + 1) % n] ?? 0), start = 1 - smooth;
    return f <= start ? here : here + (next - here) * ((f - start) / smooth);
}

/** All the sources' values 0..1 at `beat`: { lfo1, lfo2, lane1.., rand }. `rand` is a sample-and-hold that draws a new value each beat. */
export function sourceValues(mod, beat) {
    const out = { rand: hash(beat) };
    (mod.lfos ?? []).slice(0, 2).forEach((l, i) => { out['lfo' + (i + 1)] = lfoValue(l, beat); });
    (mod.lanes ?? []).slice(0, MAX_LANES).forEach((l, i) => { out['lane' + (i + 1)] = laneValue(l, beat); });
    return out;
}

/** A parameter's value with one assignment on top of `base`: the source (0..1, centred) moves it by amount * range, plus offset * range; clamped to the range. */
export function modulated(base, spec, assign, source) {
    const range = spec.max - spec.min, v = (source ?? 0.5) - 0.5;
    const out = Math.min(spec.max, Math.max(spec.min, base + (assign.amount ?? 0) * v * range + (assign.offset ?? 0) * range));
    return spec.curve === 'step' ? Math.round(out) : out;
}

/**
 * Every assigned parameter's modulated value at `beat`: `assigns` is { paramKey: assign }, `base(key)` the stored value, `spec(key)` the
 * parameter row. Returns { key: value } for the parameters whose source exists.
 */
export function evaluate(mod, assigns, base, spec, beat) {
    const sources = sourceValues(mod, beat), out = {};
    for (const [key, a] of Object.entries(assigns)) {
        const s = spec(key);
        if (s && a.source in sources) out[key] = modulated(base(key), s, a, sources[a.source]);
    }
    return out;
}

function cleanLanes(raw) {
    return (Array.isArray(raw) ? raw : []).slice(0, MAX_LANES).map((l) => ({
        steps: (Array.isArray(l?.steps) ? l.steps : [0.5]).slice(0, MAX_LANE_STEPS).map((v) => clamp01(+v || 0)),
        div: [1, 2, 4, 8].includes(l?.div) ? l.div : 4, smooth: clamp01(+l?.smooth || 0),
    })).filter((l) => l.steps.length);
}

/** Stored modulation from anything: bad parts are dropped, the rest clamped. */
export function cleanMod(raw) {
    const lfos = (Array.isArray(raw?.lfos) ? raw.lfos : []).slice(0, 2).map((l) => ({ shape: LFO_SHAPES.includes(l?.shape) ? l.shape : 'sine', rate: Math.min(16, Math.max(0.03125, +l?.rate || 1)), phase: clamp01(+l?.phase || 0) }));
    while (lfos.length < 2) lfos.push({ shape: 'sine', rate: lfos.length ? 0.25 : 1, phase: 0 });
    const lanes = cleanLanes(raw?.lanes);
    // lanes of their own for a pattern: { pattern: [lane, ...] }; a pattern without any plays the shared `lanes`
    const patterns = {};
    for (const [p, list] of Object.entries(raw?.patterns && typeof raw.patterns === 'object' ? raw.patterns : {})) {
        const i = Number(p);
        if (Number.isInteger(i) && i >= 0 && i < 256 && Array.isArray(list)) patterns[i] = cleanLanes(list);
    }
    const assigns = {};
    for (const [key, a] of Object.entries(raw?.assigns && typeof raw.assigns === 'object' ? raw.assigns : {})) {
        if (!SOURCES.includes(a?.source)) continue;
        assigns[key] = { source: a.source, amount: Math.min(1, Math.max(-1, +a.amount || 0)), offset: Math.min(1, Math.max(-1, +a.offset || 0)) };
    }
    return { lfos, lanes, patterns, assigns };
}

/** The lanes a pattern plays: its own, or the shared ones. */
export const lanesFor = (mod, pattern) => mod.patterns?.[pattern] ?? mod.lanes;

/** `mod` as pattern `pattern` plays it (what sourceValues and evaluate take). */
export const modForPattern = (mod, pattern) => ({ ...mod, lanes: lanesFor(mod, pattern) });
