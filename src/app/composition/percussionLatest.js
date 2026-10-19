// Meter-specific anchors and a restrained, persistent groove. The original
// percussion.js remains the complete pre-upgrade path.
import {additionalDrumBar} from '../additionalDrumStyles';
import { DRUMS } from '../percussion';
import { seeded, normal } from '../random';
import { beatStarts } from '../meter';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const crispMap = { kick: 'punch', brush: 'snare', hat: 'sizzle' };
const randomFor = (seed, bar, salt) => seeded(Math.imul(seed ^ salt, 1664525) ^ Math.imul(bar + 1, 1013904223));
export const LATEST_GROOVE_COUNT = 3;

export function percussionGeometry(meter, halfTime = false) {
    const beats = beatStarts(meter);
    // All positions are zero-based units. 6/8 is two felt dotted quarters.
    const shape = meter.unitsPerBeat === 3 ? { kicks: [0], backbeats: [3] }
        : meter.units === 3 ? { kicks: [0], backbeats: [1, 2] }
            : meter.units === 5 ? { kicks: [0, 3], backbeats: [1, 4] }
                : meter.units === 7 ? { kicks: [0, 2, 4], backbeats: [1, 3, 5] }
                    : { kicks: [0, 2], backbeats: halfTime ? [2] : [1, 3] };
    const step = meter.unitsPerBeat === 3 ? 1 : 0.5;
    const grid = Array.from({ length: Math.round(meter.units / step) }, (_, i) => i * step);
    return { ...shape, beats, step, grid };
}

/** grooveIndex and embellish are review controls, not user settings. */
export function drumBarLatest({ bar, meter, drums, section, sectionsMode, sectionBars = 16, phraseStart = bar - bar % 4, phraseBars = 4,
    seed = 1, grooveIndex, embellish = true, rhythm, boundaries }) {
    const added=additionalDrumBar({bar,meter,drums,section,sectionsMode,sectionBars,phraseStart,phraseBars,seed,grooveIndex,embellish,rhythm,boundaries},DRUMS);
    if(added)return added;
    if(boundaries?.phrase){phraseStart=boundaries.phrase.start;phraseBars=boundaries.phrase.bars;}
    const style = drums.style;
    if (!style || style === 'off') return [];
    const sparse = section && section.type !== 'full';
    if (section?.type === 'intro' && sectionsMode === 'strong' && (!section.form || bar - section.start < 4)) return [];
    if (section?.type === 'breakdown' && sectionsMode === 'strong' && !section.form) return [];
    const activity = clamp(drums.activity ?? 0.5), variation = clamp(drums.variation ?? 0.5);
    const start = rhythm?.groove?.start ?? section?.start ?? Math.floor(bar / 16) * 16;
    const groove = grooveIndex ?? Math.floor(randomFor(seed, start, 0x510e527f)() * LATEST_GROOVE_COUNT);
    const g = percussionGeometry(meter, style === 'downtempo' && groove === 1);
    if (rhythm) g.kicks = [...rhythm.kicks];
    const rng = randomFor(seed, bar, 0x6a09e667);
    const ornamentRng = rhythm?.groove ? randomFor(seed, rhythm.groove.ornamentBar, 0x6a09e667) : rng;
    const soundRng = randomFor(seed, bar, 0x1f83d9ab);
    const events = [];
    const hit = (name, beat, velocity, anchor = false, length = 0.22) => {
        if (beat < 0 || beat >= meter.units) return;
        const mapped = drums.kit === 'crisp' ? crispMap[name] || name : name;
        const midi = DRUMS.indexOf(mapped);
        if (midi < 0) return;
        const existing = events.find(e => e.midi === midi && Math.abs(e.beat - beat) < 1e-6);
        if (existing) { existing.velocity = Math.max(existing.velocity, velocity); existing.anchor ||= anchor; return; }
        events.push({ role: 'perc', midi, beat, length, velocity: velocity * (sparse ? 0.78 : 1) * (section?.form ? section.energy : 1), anchor,
            detune: (soundRng() * 2 - 1) * variation * 0.22 });
    };
    const backbeat = (name = 'brush', level = 0.55) => g.backbeats.forEach(at => hit(name, at, level, true));
    const kick = (level = 0.7) => g.kicks.forEach(at => hit('kick', at, at === 0 ? level : level * 0.85, true));
    const ticks = (name, level, fine = false) => {
        const step = fine ? g.step / 2 : g.step;
        for (let at = 0; at < meter.units; at += step) {
            // Sparse sections keep felt beats, not a random subset of anchors.
            const feltOnly=section?.curves?section.motion.subdivision<.9:sparse;
            if (feltOnly && !g.beats.includes(at)) continue;
            const accent = g.beats.includes(at) ? 1 : at % g.step === 0 ? 0.65 : 0.42;
            hit(name, at, level * accent);
        }
    };
    if (style === 'heartbeat') {
        hit('kick', 0, 0.62, true);
        hit('kick', g.step, 0.34, true);
        if (groove === 1 && !sparse && meter.units >= 4) {
            const middle = meter.unitsPerBeat === 3 ? 3 : 2;
            hit('kick', middle, 0.42, true); hit('kick', middle + g.step, 0.24);
        }
        if (groove === 2 && !sparse) g.beats.forEach(at => hit('shaker', at, 0.14));
    } else if (style === 'brushes') {
        kick(0.36); backbeat('brush', 0.46);
        if (groove === 1) {
            g.beats.forEach(at => hit('ride', at, 0.25));
            g.backbeats.forEach(at => hit('ride', at - g.step, 0.17));
        } else if (groove === 2 && !sparse) {
            // A brief sweep once per two bars, not a sustained wash every beat.
            if (bar % 2 === 1) hit('swish', meter.units - meter.unitsPerBeat, 0.22, false, meter.unitsPerBeat * 0.75);
        } else ticks('shaker', 0.14);
    } else if (style === 'shaker') {
        ticks('shaker', 0.3);
        if (groove === 1 && !sparse) g.backbeats.forEach(at => hit('rim', at, 0.24, true));
        if (groove === 2 && !sparse) hit('kick', 0, 0.34, true);
    } else if (style === 'electro') {
        g.beats.forEach(at => hit('kick', at, at === 0 ? 0.72 : 0.62, true));
        backbeat('clap', 0.49);
        if (!sparse) g.grid.filter(at => !g.beats.includes(at)).forEach(at => hit('hat', at, 0.28));
        if (groove === 1 && !sparse) ticks('shaker', 0.14, meter.unitsPerBeat === 1);
    } else if (style === 'drive') {
        kick(0.74); backbeat('brush', 0.63); ticks('hat', 0.29, groove === 1 && meter.unitsPerBeat === 1 && !sparse);
        if (groove === 2 && !sparse) hit('kick', meter.units - g.step * 3, 0.45);
    } else if (style === 'lofi' || style === 'downtempo') {
        kick(style === 'lofi' ? 0.68 : 0.72);
        backbeat(style === 'lofi' ? 'brush' : 'clap', style === 'lofi' ? 0.53 : 0.46);
        ticks(style === 'downtempo' && groove === 2 ? 'shaker' : 'hat', 0.26);
        if (groove === 1 && !sparse && style === 'lofi') hit('kick', meter.units - g.step * 3, 0.43);
        if (groove === 2 && !sparse) hit('kick', meter.units - g.step, 0.36);
    } else return [];

    if (rhythm?.pickup !== null && rhythm?.pickup !== undefined && !sparse && !['heartbeat', 'shaker'].includes(style)) {
        hit('kick', rhythm.pickup, 0.42, true);
    }
    if (embellish && (!sparse || section?.form && section.transition === 'arrival')) {
        const sectionEnds = section ? bar + 1 - section.start === (section.bars || sectionBars) : (bar + 1) % 16 === 0;
        const phraseEnds = bar - phraseStart === phraseBars - 1;
        const doFill = !boundaries?.ending && section?.transition !== 'release' && phraseEnds && activity > 0.25 && rng() < variation * activity * (sectionEnds ? 0.85 : 0.16);
        if (doFill && style !== 'heartbeat' && style !== 'shaker') {
            const fillStart = meter.units - meter.unitsPerBeat;
            // Reserve the final felt beat; retain structural anchors underneath.
            for (let i = events.length - 1; i >= 0; i--) if (events[i].beat >= fillStart && !events[i].anchor) events.splice(i, 1);
            const step = meter.unitsPerBeat === 3 ? 1 : 0.5;
            for (let at = fillStart; at < meter.units; at += step) hit(at === fillStart ? 'brush' : 'tom', at, 0.3 + (at - fillStart) / meter.unitsPerBeat * 0.12);
        } else if (ornamentRng() < variation * activity * 0.35) {
            // One embellishment budget: a ghost OR an extra kick, never both.
            const at = rhythm?.groove?.ornamentBeat ?? meter.units - g.step;
            hit(groove === 2 ? 'kick' : 'rim', at, groove === 2 ? 0.32 : 0.15);
        } else if (ornamentRng() < (drums.sprinkle ?? 0.35) * 0.1) {
            hit('ride', section && bar === section.start ? 0 : meter.units - g.step, 0.23);
        }
    }
    if (section?.form && section.transition === 'release' && bar === section.start + section.bars - 1) {
        for (let i = events.length - 1; i >= 0; i--) if (!events[i].anchor && events[i].beat >= meter.units - meter.unitsPerBeat) events.splice(i, 1);
    }
    return events.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}

export function loosenDrumsLatest(events, { timing = 0, velocity = 0 }, unitSeconds, seed, bar, meter) {
    const beatMotion = new Map();
    const rng = randomFor(seed, bar, 0x3c6ef372);
    for (const e of events) {
        const beat = Math.floor(e.beat / meter.unitsPerBeat);
        if (!beatMotion.has(beat)) beatMotion.set(beat, normal(rng, timing * 0.4 / 1000) / unitSeconds);
        const name = DRUMS[e.midi];
        const shift = e.anchor && e.beat === 0 ? 0 : beatMotion.get(beat)
            + normal(rng, timing * 0.12 / 1000) / unitSeconds + (['brush', 'snare', 'clap'].includes(name) ? timing * 0.15 / 1000 / unitSeconds : 0);
        e.beat = clamp(e.beat + shift, 0, meter.units - 0.001);
        e.velocity = clamp(e.velocity * (1 + normal(rng, velocity)), 0.05, 1);
    }
    events.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
}
