// A long energy arc (settings.arc: { shape, minutes }) over the piece's running time: 'rise'
// grows from calm to full, 'winddown' settles from full to calm (and stays there), 'wave' swells
// and settles with that period. A bar's energy (0 calm .. 1 full) makes calmer bars play softer,
// sound darker, keep fewer drum hits (never the downbeat) and sit further back in the section
// space. Measured in music time from the start, so renders follow it as playback does.
import { seeded } from '../random';

export const ARC_SHAPES = { off: 'Off', rise: 'Rise', winddown: 'Wind down', wave: 'Wave' };
const smooth = (t) => t * t * (3 - 2 * t);

/** Energy 0..1 at `seconds` into the piece; 1 (no effect) with the arc off. */
export function arcEnergy(arc, seconds) {
    if (!arc || arc.shape === 'off' || !ARC_SHAPES[arc.shape]) return 1;
    const t = Math.max(0, seconds) / (Math.max(1, arc.minutes) * 60);
    if (arc.shape === 'rise') return 0.15 + 0.85 * smooth(Math.min(1, t));
    if (arc.shape === 'winddown') return 1 - 0.85 * smooth(Math.min(1, t));
    return 0.5 - 0.5 * Math.cos(2 * Math.PI * t); // wave: calm at the start, full half a period in
}

/** The bar's notes at its energy: softer and with fewer drum hits as it calms. */
export function applyArc(events, energy, { bar, seed = 0 }) {
    if (energy >= 1) return events;
    const rng = seeded((seed ^ Math.imul(bar + 7, 0x85ebca6b)) >>> 0), level = 0.82 + 0.18 * energy;
    const kept = events.filter((e) => e.role !== 'perc' || e.beat === 0 || rng() >= (1 - energy) * 0.6);
    for (const e of kept) e.velocity *= level;
    events.splice(0, events.length, ...kept);
    return events;
}

/** The bar's tone (a low-pass cutoff) at its energy: about 3.5 kHz at the calmest. */
export const arcTone = (tone, energy) => (energy >= 1 ? tone : Math.min(tone, 20000 * 2 ** (-(1 - energy) * 2.5)));
/** Extra section-space send at its energy. */
export const arcSpace = (energy) => (energy >= 1 ? 0 : (1 - energy) * 0.15);
