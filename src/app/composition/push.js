// Intensity (settings.push): a much stronger calmer .. busier than the feel pad, and a program that
// moves it over the piece's running time, for working out (effort and recovery) or a long build.
//   level: -1 (very calm) .. +1 (overdrive); 0 is the preset as made. With a program on it is
//          the program that sets the level, from the bar's place in music time (as arc.js does).
//   program.mode: 'off' (the level is the slider's), 'intervals' (low for lowSeconds, a steady ramp
//          over rampSeconds, high for highSeconds, a ramp down, and again) or 'ramp' (one steady
//          ramp from low to high over `minutes`, then it holds).
// applyPush puts the level over the settings for one bar's planning, as applyFeel does: lead,
// drums, pad and bass patterns, dynamics and the sequencer. Tempo (pushTempo), the calm
// energy (pushEnergy) and the calm tone (pushTone) are applied by the generator's planBar.
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const toward = (v, target, amount) => v + (target - v) * clamp(amount);

export const PUSH_MODES = { off: 'Manual', intervals: 'Intervals', ramp: 'Ramp' };
export const defaultPush = () => ({
    level: 0,
    program: { mode: 'off', low: -0.6, high: 0.9, lowSeconds: 45, highSeconds: 45, rampSeconds: 8, minutes: 10 },
});

/** How fast a manual change of the level moves, per second of music: a full swing (2) takes 25 seconds. A program ramps by its own rules. */
export const PUSH_RATE = 0.08;
/** The level a bar plays at: the target, or - by hand - a step from the bar before's toward it, so the slider moves the music gently. */
export function glidePush(push, previous, target, seconds) {
    if ((push?.program?.mode ?? 'off') !== 'off' || !Number.isFinite(previous)) return target;
    const step = PUSH_RATE * Math.max(0, seconds);
    return previous + Math.max(-step, Math.min(step, target - previous));
}

export const pushActive = (push) => !!push && (push.level !== 0 || (push.program?.mode ?? 'off') !== 'off');

/** The level at `seconds` into the piece. */
export function pushLevel(push, seconds = 0) {
    const p = push?.program;
    if (!p || p.mode === 'off' || !PUSH_MODES[p.mode]) return clamp(push?.level ?? 0, -1, 1);
    const low = clamp(p.low ?? -0.6, -1, 1), high = clamp(p.high ?? 0.9, -1, 1), t = Math.max(0, seconds);
    if (p.mode === 'ramp') return low + (high - low) * clamp(t / (Math.max(1, p.minutes ?? 10) * 60));
    const ramp = Math.max(0, p.rampSeconds ?? 0), lowFor = Math.max(1, p.lowSeconds ?? 45), highFor = Math.max(1, p.highSeconds ?? 45);
    let at = t % (lowFor + ramp + highFor + ramp);
    if (at < lowFor) return low;
    at -= lowFor;
    if (at < ramp) return low + (high - low) * (at / ramp);
    at -= ramp;
    if (at < highFor) return high;
    at -= highFor;
    return high + (low - high) * (at / ramp);
}

export const PUSH_LABELS = [[-0.8, 'Very calm'], [-0.35, 'Calm'], [-0.05, 'Easing'], [0.05, 'As made'], [0.35, 'Lifted'], [0.65, 'Driving'], [0.9, 'Intense'], [Infinity, 'Overdrive']];
export const pushLabel = (level) => PUSH_LABELS.find(([limit]) => level < limit)[1];

/** The tempo as a share of the preset's: 15% slower at the calmest, 15% faster at the full. */
export const pushTempo = (level) => 1 + 0.15 * clamp(level ?? 0, -1, 1);
/** Calm as an energy for applyArc (composition/arc.js): fewer drum hits and softer playing; overdrive adds none. */
export const pushEnergy = (level) => (level < 0 ? 1 + 0.7 * level : 1);

// pad patterns: overdrive moves the held chords into pulses, arpeggios and sequences; calm moves the moving patterns back to held chords
function padWeights(weights, level) {
    const w = { sustain: 0, pulse: 0, arpeggio: 0, sequence: 0, rolled: 0, stacked: 0, ...weights };
    if (level > 0) {
        const taken = w.sustain * 0.95 * level + (w.rolled + w.stacked) * 0.8 * level;
        w.sustain *= 1 - 0.95 * level; w.rolled *= 1 - 0.8 * level; w.stacked *= 1 - 0.8 * level;
        // a harder push goes to the faster patterns
        const split = { pulse: 0.4 - 0.2 * level, arpeggio: 0.35, sequence: 0.25 + 0.2 * level };
        for (const [k, share] of Object.entries(split)) w[k] += taken * share;
    } else if (level < 0) {
        let freed = 0;
        for (const k of ['pulse', 'arpeggio', 'sequence']) { const cut = w[k] * 0.9 * -level; w[k] -= cut; freed += cut; }
        w.sustain += freed;
    }
    return w;
}

function bassWeights(weights, level) {
    const w = { whole: 0, half: 0, walking: 0, drive: 0, ...weights };
    if (level > 0) {
        const taken = (w.whole + w.half * 0.7) * 0.9 * level;
        w.whole *= 1 - 0.9 * level; w.half *= 1 - 0.63 * level;
        w.drive += taken;
    } else if (level < 0) {
        const freed = (w.drive + w.walking * 0.5) * 0.85 * -level + w.half * 0.6 * -level;
        w.drive *= 1 - 0.85 * -level; w.walking *= 1 - 0.43 * -level; w.half *= 1 - 0.6 * -level;
        w.whole += freed;
    }
    return w;
}

// the light drum styles take a harder one as it climbs and a lighter one as it calms
const LIGHT_STYLES = new Set(['heartbeat', 'brushes', 'shaker', 'lofi', 'downtempo']);
function drumStyle(style, level) {
    if (!style || style === 'off') return style;
    if (level > 0.85) return 'drive';
    if (level > 0.5 && LIGHT_STYLES.has(style)) return 'electro';
    if (level < -0.6 && !['heartbeat', 'brushes'].includes(style)) return 'heartbeat';
    return style;
}

// the stages of the step sequencer's recipe a very high or very low level plays in place of the preset's: the Drop and the Breakdown
export const PUSH_DROP = 6, PUSH_BREAKDOWN = 4;

export function applyPush(settings, level) {
    const L = clamp(level, -1, 1);
    if (!L) return settings;
    const up = Math.max(0, L), down = Math.max(0, -L);
    const s = { ...settings, pushLevel: L };
    if (s.leadActivity > 0) s.leadActivity = clamp(toward(s.leadActivity, up ? 1 : 0.1, up ? 0.9 * up : 0.85 * down));
    s.leadDensity = clamp((s.leadDensity ?? 0) + 0.6 * up - 0.45 * down);
    s.leadSyncopation = clamp((s.leadSyncopation ?? 0) + 0.3 * up - 0.2 * down);
    if (s.counter && s.counter.mode !== 'off') s.counter = { ...s.counter, activity: clamp(toward(s.counter.activity ?? 0.5, up ? 1 : 0, up ? 0.7 * up : 0.85 * down)) };
    if (s.drums) s.drums = { ...s.drums, style: drumStyle(s.drums.style, L), activity: clamp(s.drums.activity + 0.6 * up - 0.7 * down),
        variation: clamp(s.drums.variation + 0.4 * up - 0.3 * down), sprinkle: clamp((s.drums.sprinkle ?? 0) + 0.5 * up - 0.2 * down) };
    if (s.padWeights) s.padWeights = padWeights(s.padWeights, L);
    if (s.bassWeights) s.bassWeights = bassWeights(s.bassWeights, L);
    if (s.ornaments > 0 || up) s.ornaments = clamp((s.ornaments ?? 0) + 0.3 * up - (s.ornaments ?? 0) * down);
    const d = s.dynamics ?? { level: 1, range: 1, attack: 0, brightness: 0 };
    s.dynamics = { ...d, level: clamp(d.level + 0.25 * up - 0.3 * down, 0.5, 1.4), range: clamp(d.range * (1 + 0.6 * up - 0.5 * down), 0, 2.5),
        brightness: clamp(d.brightness + 0.5 * up - 0.4 * down), attack: clamp(d.attack - 0.5 * up + 0.3 * down) };
    s.sectionSpace = clamp((s.sectionSpace ?? 0) - 0.5 * up + 0.3 * down);
    const seq = s.sequencer;
    if (seq?.on && seq.arrangement) {
        s.sequencer = { ...seq, pump: clamp((seq.pump ?? 0.5) + 0.35 * up - 0.4 * down), variation: clamp((seq.variation ?? 0.6) + 0.3 * up),
            fills: seq.fills || L > 0.3, ...(L >= 0.8 ? { forceStage: PUSH_DROP } : L <= -0.7 ? { forceStage: PUSH_BREAKDOWN } : {}) };
    }
    return s;
}

/** Calm closes the tone a little more: a low-pass at about 6 kHz at the calmest (on top of the arc's and the feel pad's). */
export const pushTone = (tone, level) => (level < 0 ? Math.min(tone, 20000 * 2 ** (level * 1.7)) : tone);
