// The feel pad (settings.feel: { busy, bright }, each -1..1, 0 = the preset as made): two
// directions applied over the settings while bars are planned (Generator.planBar), so the
// settings themselves and links keep the preset's values plus the pad's place.
//   busy: calmer (-1) .. busier (+1) - lead and drum activity, rhythmic detail, pad patterns
//         against held chords, dynamic range, ornaments
//   bright: darker (-1) .. brighter (+1) - brightness with strength, quicker onsets and a
//         closer room; darker also closes the tone (feelTone)
import { seeded } from '../random';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

export const feelActive = (feel) => !!feel && (feel.busy !== 0 || feel.bright !== 0);

// pad patterns: busier moves weight from held chords to pulses and arpeggios, calmer back
function padWeights(weights, b) {
    const w = { ...weights };
    const moving = ['pulse', 'arpeggio', 'sequence'];
    if (b > 0) {
        const taken = w.sustain * 0.6 * b;
        w.sustain -= taken;
        const share = moving.filter((k) => w[k] > 0);
        for (const k of share.length ? share : ['pulse', 'arpeggio']) w[k] = (w[k] ?? 0) + taken / (share.length || 2);
    } else if (b < 0) {
        let freed = 0;
        for (const k of moving) { const cut = (w[k] ?? 0) * 0.7 * -b; w[k] -= cut; freed += cut; }
        w.sustain = (w.sustain ?? 0) + freed;
    }
    return w;
}

export function applyFeel(settings) {
    const feel = settings.feel;
    if (!feelActive(feel)) return settings;
    const b = clamp(feel.busy ?? 0, -1, 1), t = clamp(feel.bright ?? 0, -1, 1);
    const s = { ...settings };
    if (b) {
        if (s.leadActivity > 0) s.leadActivity = clamp(s.leadActivity + 0.2 * b);
        s.leadDensity = clamp((s.leadDensity ?? 0) + 0.3 * b);
        if (s.drums) s.drums = { ...s.drums, activity: clamp(s.drums.activity + 0.4 * b), variation: clamp(s.drums.variation + 0.2 * b),
            sprinkle: clamp((s.drums.sprinkle ?? 0) + 0.3 * Math.max(0, b)) };
        if (s.padWeights) s.padWeights = padWeights(s.padWeights, b);
        if (s.ornaments > 0) s.ornaments = clamp(s.ornaments + 0.2 * b);
        if (s.humanize) s.humanize = { ...s.humanize, velocity: clamp(s.humanize.velocity + 0.03 * b, 0, 0.25) };
    }
    if (b || t) {
        const d = s.dynamics ?? { level: 1, range: 1, attack: 0, brightness: 0 };
        s.dynamics = { ...d, level: clamp(d.level + 0.04 * b, 0.6, 1.2), range: clamp(d.range * (1 + 0.25 * b), 0, 2),
            brightness: clamp(d.brightness + 0.5 * t), attack: clamp(d.attack - 0.4 * t) };
    }
    if (t) s.sectionSpace = clamp((s.sectionSpace ?? 0) - 0.3 * t);
    return s;
}

/** Calmer as an energy for applyArc (composition/arc.js): fewer drum hits and softer playing. */
export const feelEnergy = (feel) => (feel?.busy < 0 ? 1 + 0.6 * feel.busy : 1);

/** Darker closes the tone: a low-pass at about 4.3 kHz at the darkest. */
export const feelTone = (tone, feel) => (feel?.bright < 0 ? Math.min(tone, 20000 * 2 ** (feel.bright * 2.2)) : tone);

// Drums that take ghost notes when busier (percussion.js DRUMS: brush, shaker, hat, ride).
const GHOSTED = [1, 2, 4, 8];
/**
 * Busier drums on any style: soft ghost notes on the free grid steps (eighths, or the eighth-note
 * grid of a compound meter) of the hats, shakers, brushes and ride the bar already plays, and
 * sixteenths past half way; seeded, so a bar plans the same each time.
 */
export function ghostNotes(hits, busy, { bar, seed = 0, meter }) {
    if (!(busy > 0) || !hits.length) return hits;
    const rng = seeded((seed ^ Math.imul(bar + 31, 0x2c1b3c6d)) >>> 0), out = [...hits];
    const step = meter.unitsPerBeat === 1 ? 0.5 : 1;
    for (const drum of GHOSTED) {
        const own = hits.filter((h) => h.role === 'perc' && h.midi === drum);
        if (!own.length) continue;
        const velocity = own.reduce((a, h) => a + h.velocity, 0) / own.length * 0.55, length = own[0].length;
        const free = (at, gap) => own.every((h) => Math.abs(h.beat - at) > gap) && out.every((h) => h.midi !== drum || Math.abs(h.beat - at) > gap);
        for (let at = 0; at < meter.units - 1e-9; at += step / 2) {
            const half = Math.abs(at / step - Math.round(at / step)) > 1e-9;
            const chance = half ? Math.max(0, busy - 0.5) * 0.5 : busy * 0.6;
            if (rng() < chance && free(at, step / 2 - 1e-6)) out.push({ ...own[0], beat: at, length, velocity: velocity * (half ? 0.8 : 1), ghost: true });
        }
    }
    return out;
}
