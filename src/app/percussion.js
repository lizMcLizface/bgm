// Percussion patterns (docs/DESIGN.md §9 C4): one bar of hits for the
// drum kit (engine/drumKit.js) from a style, the meter and the section.
// Pure, like the arranger, but with randomness of its own - seeded from the
// piece's seed and the bar - so turning drums on or off never changes the
// notes the other voices play.
//
// Each style has several grooves. A section (or, with sections off, every
// 16 bars) settles on one; with *variation* a phrase now and then borrows
// another, bars drop or add a hit, and each hit carries a small random
// `vary` (-1..1) the kit turns into a slightly different sound (pitch,
// brightness, length, sweep direction) - at 0 every bar of a groove is the
// same. *Activity* adds ghost notes, extra kicks and fills; phrases close
// with a fill now and then, sections with a bigger one. Sections also thin
// the kit out: none or a little in an intro, all of it in Full.
//
// Variation also colours whole phrases, so a groove doesn't repeat bar for
// bar: the hats may move to the ride or a shaker and the backbeat to a
// clap or a rim, every second bar may get a twist (an extra kick, a moved
// one, an open accent at its end), and a phrase may open on a ride swell.
//
// *Sprinkle* scatters colour over any groove: a crash where a section
// begins, now and then a bell or a ride tap on an off-beat, a little tom
// pickup. It draws from a stream of its own, so it never moves the rest.

import { seeded, chance, normal } from './random';
import { groupStarts, beatStarts } from './meter';

/** The drums, by the index an event carries as its `midi`. */
// Append only: an event's drum is its index here (and links store the kit
// in this order).
export const DRUMS = ['kick', 'brush', 'shaker', 'rim', 'hat', 'swish', 'tom', 'clap', 'ride', 'crash', 'bell', 'snare', 'punch', 'sizzle'];
export const DRUM_LABELS = {
    kick: 'Felt kick', brush: 'Brush tap', shaker: 'Shaker', rim: 'Rim click', hat: 'Soft hat', swish: 'Brush swish',
    tom: 'Felt tom', clap: 'Soft clap', ride: 'Soft ride', crash: 'Soft crash', bell: 'Ride bell',
    snare: 'Crisp snare', punch: 'Punchy kick', sizzle: 'Bright hat',
};
const DRUM = Object.fromEntries(DRUMS.map((name, i) => [name, i]));

// Append only (links store the index). Electro and Driving are for fast
// presets: four-on-the-floor and rock-like beats with sixteenth hats.
export const DRUM_STYLES = {
    off: 'Off', heartbeat: 'Heartbeat', brushes: 'Brushes', lofi: 'Lo-fi beat', shaker: 'Shaker', downtempo: 'Downtempo',
    electro: 'Electro pulse', drive: 'Driving',
};
// The kit the grooves play on: 'felt' as the grooves are written, 'crisp' puts
// a snare, a punchy kick and a bright hat where the brush, felt kick and soft
// hat were (the rest - clap, rim, toms, cymbals - stay).
export const DRUM_KITS = { felt: 'Felt and brushes', crisp: 'Crisp and electronic' };
const CRISP = { kick: 'punch', brush: 'snare', hat: 'sizzle' };
export const DEFAULT_DRUMS = { style: 'off', activity: 0.5, variation: 0.5, sprinkle: 0.35, kit: 'felt' };

// The kit's sound (engine/drumKit.js), per drum: on, level (1 = as made),
// tone (-1 dark .. 1 bright), decay (x length); and the room's reverb.
export const DRUM_PARAMS = {
    level: { min: 0, max: 2, step: 0.05, label: 'Level' },
    tone: { min: -1, max: 1, step: 0.1, label: 'Tone' },
    decay: { min: 0.5, max: 2, step: 0.05, label: 'Length' },
};
export const defaultDrumKit = () => ({
    room: 0.15,
    ...Object.fromEntries(DRUMS.map((name) => [name, { on: true, level: 1, tone: 0, decay: 1 }])),
});

// How much of the kit plays per section: 0 nothing, 1 sparse, 2 all.
const SECTION_LEVEL = {
    gentle: { intro: 1, build: 1, full: 2, breakdown: 1 },
    strong: { intro: 0, build: 1, full: 2, breakdown: 0 },
};
// With sections off, the groove may change this often (bars).
const GROOVE_BARS = 16;
// Styles that play as a machine would (see drumBar).
const STEADY = new Set(['electro', 'drive']);

// --- the bar's geometry -----------------------------------------------------

// The grid hats and shakers play on: half beats in simple meters, the
// eighths of 6/8.
function geometry(meter) {
    const step = meter.unitsPerBeat === 1 ? 0.5 : 1;
    const grid = Array.from({ length: Math.round(meter.units / step) }, (_, i) => i * step);
    const beats = beatStarts(meter);
    const [first, ...groups] = groupStarts(meter);
    // where a backbeat lands: later beat groups, or - in 3/4, one group -
    // the beats after the first
    const backbeats = groups.length ? groups : beats.slice(1);
    const middle = groups.length ? groups[0] : Math.floor(meter.units / 2);
    const offbeats = grid.filter((at) => !beats.includes(at));
    // sixteenths (a compound meter's grid is already its eighths)
    const fineStep = meter.unitsPerBeat === 1 ? 0.25 : 0.5;
    const fine = Array.from({ length: Math.round(meter.units / fineStep) }, (_, i) => i * fineStep);
    return { step, grid, fine, fineStep, beats, first, groups: [first, ...groups], backbeats, middle, offbeats, units: meter.units };
}

// --- grooves ------------------------------------------------------------------
// Each: ({ g, level, activity, rng, hit }) => void, adding hits with
// hit(drum, beat, velocity[, length]). level 1 is the sparse kit.

const GROOVES = {
    heartbeat: [
        // lub-dub on the one
        ({ g, hit }) => {
            hit('kick', g.first, 0.7);
            hit('kick', g.first + g.step, 0.42);
        },
        // ... and again, softer, half way
        ({ g, level, hit }) => {
            hit('kick', g.first, 0.68);
            hit('kick', g.first + g.step, 0.4);
            if (level >= 2) {
                hit('kick', g.middle, 0.48);
                hit('kick', g.middle + g.step, 0.3);
            }
        },
        // lub-dub with a rim tick before the next one, a shaker breathing on the beats
        ({ g, level, activity, rng, hit }) => {
            hit('kick', g.first, 0.7);
            hit('kick', g.first + g.step, 0.4);
            if (level >= 2) {
                hit('rim', g.grid[g.grid.length - 1], 0.25);
                g.beats.forEach((at) => chance(rng, 0.3 + activity * 0.5) && hit('shaker', at, 0.18));
            }
        },
        // lub-dub, answered by a low tom half way
        ({ g, level, activity, rng, hit }) => {
            hit('kick', g.first, 0.7);
            hit('kick', g.first + g.step, 0.4);
            if (level < 2) return;
            hit('tom', g.middle, 0.42, 0.25, -0.6);
            if (chance(rng, activity * 0.6)) hit('tom', g.middle + g.step, 0.26, 0.25, -0.8);
        },
    ],

    // Brushes: the taps carry the groove; sweeps are an occasional colour -
    // mostly a stroke over the bar's last group, leading into the next -
    // never one per beat.
    brushes: [
        // taps on the backbeats and ghost taps between; now and then a sweep into the next bar
        ({ g, level, activity, rng, hit }) => {
            g.backbeats.forEach((at) => hit('brush', at, level >= 2 ? 0.55 : 0.38));
            g.offbeats.forEach((at) => chance(rng, 0.15 + activity * 0.35) && hit('brush', at, 0.18));
            if (level >= 2 && chance(rng, 0.5)) hit('kick', g.first, 0.34);
            const last = g.groups[g.groups.length - 1];
            if (chance(rng, 0.15 + activity * 0.25)) hit('swish', last, 0.45, g.units - last, rng() < 0.5 ? 1 : -1);
        },
        // a long stroke on the one some bars, room after it; taps answer it
        ({ g, level, activity, rng, hit }) => {
            if (chance(rng, 0.35 + activity * 0.2)) hit('swish', g.first, 0.45, g.groups[1] ?? g.units, rng() < 0.5 ? 1 : -1);
            g.backbeats.forEach((at) => hit('brush', at, level >= 2 ? 0.5 : 0.36));
            if (level < 2) return;
            g.offbeats.forEach((at) => chance(rng, 0.2 + activity * 0.4) && hit('brush', at, 0.18));
            if (chance(rng, activity)) hit('kick', g.first, 0.34);
        },
        // a ride on every beat and the off-beat before each backbeat
        // ("ding, ding-da ding"), taps on the backbeats
        ({ g, level, activity, rng, hit }) => {
            g.beats.forEach((at) => hit('ride', at, at === g.first ? 0.42 : 0.34));
            g.backbeats.forEach((at) => at - g.step > g.first && hit('ride', at - g.step, 0.26));
            if (level < 2) return;
            g.backbeats.forEach((at) => hit('brush', at, 0.48));
            if (chance(rng, 0.3 + activity * 0.4)) hit('kick', g.first, 0.32);
        },
    ],

    lofi: [
        // kick on the one and after the middle, snare (brush) backbeats, hats on the grid
        ({ g, level, activity, rng, hit }) => {
            g.grid.forEach((at) => hit('hat', at, g.beats.includes(at) ? 0.36 : 0.22));
            if (level < 2) return g.backbeats.forEach((at) => hit('rim', at, 0.34));
            hit('kick', g.first, 0.75);
            hit('kick', g.middle + g.step, 0.55);
            if (chance(rng, activity * 0.5)) hit('kick', g.units - g.step, 0.4);
            g.backbeats.forEach((at) => hit('brush', at, 0.62));
            return undefined;
        },
        // anticipated: the second kick before the middle, hats skip the backbeats
        ({ g, level, activity, rng, hit }) => {
            g.grid.forEach((at, i) => !g.backbeats.includes(at) && hit('hat', at, i % 2 ? 0.2 : 0.34));
            if (level < 2) return g.backbeats.forEach((at) => hit('rim', at, 0.32));
            hit('kick', g.first, 0.72);
            hit('kick', g.middle - g.step, 0.58);
            if (chance(rng, activity * 0.4)) hit('kick', g.middle + g.step, 0.38);
            g.backbeats.forEach((at) => hit('brush', at, 0.6));
            return undefined;
        },
        // half time: one snare in the middle, room around it, a rim ghost
        ({ g, level, activity, rng, hit }) => {
            g.grid.forEach((at) => hit('hat', at, g.beats.includes(at) ? 0.32 : 0.18));
            if (level < 2) return undefined;
            hit('kick', g.first, 0.74);
            if (chance(rng, 0.5 + activity * 0.4)) hit('kick', g.first + 3 * g.step < g.middle ? g.first + 3 * g.step : g.first + g.step, 0.45);
            hit('brush', g.middle, 0.64);
            if (chance(rng, activity * 0.6)) hit('rim', g.units - g.step, 0.24);
            return undefined;
        },
        // boom-bap: a clap on the backbeats, a lazy second kick, hats on the beats
        // and an open one before the bar ends
        ({ g, level, activity, rng, hit }) => {
            g.beats.forEach((at) => hit('hat', at, 0.32));
            hit('hat', g.units - g.step, 0.3);
            if (level < 2) return g.backbeats.forEach((at) => hit('rim', at, 0.3));
            hit('kick', g.first, 0.74);
            hit('kick', g.middle + (chance(rng, 0.5) ? 0 : g.step), 0.5);
            if (chance(rng, activity * 0.5)) hit('kick', g.first + g.step, 0.36);
            g.backbeats.forEach((at) => hit('clap', at, 0.5));
            return undefined;
        },
    ],

    // Downtempo: deeper and rounder - kick, clap, ride and toms.
    downtempo: [
        // kick one and the and of the middle, clap backbeats, ride eighths
        ({ g, level, activity, rng, hit }) => {
            g.grid.forEach((at) => hit('ride', at, g.beats.includes(at) ? 0.3 : 0.2));
            if (level < 2) return;
            hit('kick', g.first, 0.72);
            hit('kick', g.middle + g.step, 0.5);
            g.backbeats.forEach((at) => hit('clap', at, 0.46));
            if (chance(rng, activity * 0.5)) hit('tom', g.units - g.step, 0.3, 0.25, -0.3);
        },
        // half time: a clap in the middle, toms answering the kick, a shaker on the grid
        ({ g, level, activity, rng, hit }) => {
            g.grid.forEach((at) => hit('shaker', at, g.beats.includes(at) ? 0.26 : 0.18));
            if (level < 2) return;
            hit('kick', g.first, 0.74);
            hit('clap', g.middle, 0.5);
            hit('tom', g.first + g.step * 3 < g.middle ? g.first + g.step * 3 : g.first + g.step, 0.32, 0.25, -0.5);
            if (chance(rng, 0.3 + activity * 0.5)) hit('kick', g.units - g.step, 0.42);
        },
        // broken: kick, rim and clap trading, hats skipping, a ride on the one
        ({ g, level, activity, rng, hit }) => {
            hit('ride', g.first, 0.36);
            g.offbeats.forEach((at) => chance(rng, 0.6 + activity * 0.3) && hit('hat', at, 0.24));
            if (level < 2) return;
            hit('kick', g.first, 0.72);
            hit('kick', g.first + g.step * 3 < g.units ? g.first + g.step * 3 : g.first + g.step, 0.48);
            g.backbeats.forEach((at, i) => hit(i % 2 ? 'clap' : 'rim', at, i % 2 ? 0.46 : 0.34));
            if (chance(rng, activity)) hit('rim', g.units - g.step, 0.2);
        },
    ],

    // Electro pulse: kick on every beat, claps on the backbeats, hats on
    // the off-beats, sixteenths running underneath - a steady engine.
    electro: [
        // four on the floor, open hats between, a clap on the backbeats
        ({ g, level, activity, rng, hit }) => {
            g.offbeats.forEach((at) => hit('hat', at, 0.34));
            if (level < 2) return g.beats.forEach((at) => hit('kick', at, 0.45));
            g.beats.forEach((at) => hit('kick', at, at === g.first ? 0.8 : 0.7));
            g.backbeats.forEach((at) => hit('clap', at, 0.56));
            g.fine.forEach((at) => !g.grid.includes(at) && chance(rng, 0.15 + activity * 0.5) && hit('shaker', at, 0.16));
        },
        // sixteenth hats with an accent on the beats, kick on the one and the 'and' of the middle
        ({ g, level, activity, rng, hit }) => {
            g.fine.forEach((at) => hit('hat', at, g.beats.includes(at) ? 0.34 : g.grid.includes(at) ? 0.24 : 0.14));
            if (level < 2) return undefined;
            g.beats.forEach((at) => hit('kick', at, at === g.first ? 0.78 : 0.62));
            g.backbeats.forEach((at) => hit('clap', at, 0.52));
            if (chance(rng, activity)) hit('rim', g.units - g.step, 0.26);
            return undefined;
        },
        // pulse: kick on the one and the beats after, a rim sixteenth pattern, a clap and a tom answering
        ({ g, level, activity, rng, hit }) => {
            g.grid.forEach((at) => hit('hat', at, g.beats.includes(at) ? 0.3 : 0.22));
            if (level < 2) return undefined;
            g.beats.forEach((at) => hit('kick', at, at === g.first ? 0.78 : 0.66));
            g.backbeats.forEach((at) => hit('clap', at, 0.54));
            g.fine.forEach((at, i) => i % 4 === 3 && chance(rng, 0.3 + activity * 0.5) && hit('rim', at, 0.2));
            if (chance(rng, activity * 0.5)) hit('tom', g.units - g.step, 0.34, 0.25, 0.4);
            return undefined;
        },
    ],

    // Driving: a rock-like beat - kick and snare (rim and clap together),
    // eighth hats, toms in the gaps. Fills come often.
    drive: [
        // kicks on the one and the 'and' before the middle, snare on the backbeats, eighth hats
        ({ g, level, activity, rng, hit }) => {
            g.grid.forEach((at) => hit('hat', at, g.beats.includes(at) ? 0.36 : 0.26));
            if (level < 2) return g.backbeats.forEach((at) => hit('rim', at, 0.36));
            hit('kick', g.first, 0.82);
            hit('kick', g.middle - g.step, 0.62);
            if (chance(rng, 0.3 + activity * 0.5)) hit('kick', g.units - g.step, 0.5);
            g.backbeats.forEach((at) => { hit('clap', at, 0.56); hit('rim', at, 0.4); });
            return undefined;
        },
        // double time: kick eighths on the bar's first group, snare on every beat after
        ({ g, level, activity, rng, hit }) => {
            g.grid.forEach((at) => hit('hat', at, g.beats.includes(at) ? 0.34 : 0.22));
            if (level < 2) return undefined;
            g.grid.filter((at) => at < g.middle).forEach((at) => hit('kick', at, g.beats.includes(at) ? 0.74 : 0.52));
            g.beats.filter((at) => at >= g.middle).forEach((at) => { hit('clap', at, 0.54); hit('rim', at, 0.36); });
            if (chance(rng, activity * 0.6)) hit('tom', g.units - g.step, 0.4, 0.25, -0.4);
            return undefined;
        },
        // marching: kick on every beat, snare on the off-beats leading in, a ride keeping time
        ({ g, level, activity, rng, hit }) => {
            g.beats.forEach((at) => hit('ride', at, 0.3));
            if (level < 2) return undefined;
            g.beats.forEach((at) => hit('kick', at, at === g.first ? 0.8 : 0.6));
            g.backbeats.forEach((at) => hit('clap', at, 0.56));
            g.offbeats.forEach((at) => chance(rng, 0.2 + activity * 0.4) && hit('rim', at, 0.3));
            return undefined;
        },
    ],

    shaker: [
        // the grid, accents on the beats
        ({ g, level, hit }) => {
            g.grid.forEach((at) => hit('shaker', at, at === g.first ? 0.4 : g.beats.includes(at) ? 0.32 : 0.2));
            if (level >= 2) g.backbeats.forEach((at) => hit('rim', at, 0.34));
        },
        // accents off the beat, a kick on the one
        ({ g, level, activity, rng, hit }) => {
            g.grid.forEach((at) => hit('shaker', at, g.beats.includes(at) ? 0.18 : 0.34));
            if (level < 2) return;
            hit('kick', g.first, 0.42);
            if (chance(rng, activity)) g.backbeats.forEach((at) => hit('rim', at, 0.3));
        },
        // a looser shaker that leaves gaps, soft hats on the off-beats
        ({ g, level, activity, rng, hit }) => {
            g.grid.forEach((at, i) => (i === 0 || chance(rng, 0.55 + activity * 0.35)) && hit('shaker', at, at === g.first ? 0.38 : 0.26));
            if (level < 2) return;
            g.offbeats.forEach((at) => chance(rng, 0.5) && hit('hat', at, 0.2));
            if (chance(rng, activity * 0.7)) hit('kick', g.first, 0.38);
        },
    ],
};

// Fills, to close a phrase (small) or a section (big): taps over the last
// beat or two, getting louder - or, now and then, toms falling in pitch.
function fill(g, big, rng, hit, driving) {
    // a driving style rolls over sixteenths, on snare and toms
    const grid = driving ? g.fine : g.grid;
    const count = big ? Math.min(grid.length - 1, 4 + Math.floor(rng() * 3)) : 2 + Math.floor(rng() * 2);
    const tail = grid.slice(-(driving ? count * 2 : count));
    const toms = chance(rng, big ? 0.5 : 0.3);
    tail.forEach((at, i) => {
        const velocity = 0.3 + (0.35 * i) / tail.length;
        if (toms) hit('tom', at, velocity, 0.25, 0.8 - (1.6 * i) / Math.max(1, tail.length - 1));
        else hit(driving ? (rng() < 0.6 ? 'clap' : 'rim') : (rng() < 0.75 ? 'brush' : 'rim'), at, velocity);
    });
    if (big) hit('kick', tail[0], 0.5);
}

// A phrase's colour (variation): which drums stand in for the hats and the
// backbeat, the twist every second bar gets, and whether it opens on a ride.
function phraseColour(variation, rng) {
    const swaps = {};
    if (chance(rng, variation * 0.45)) swaps.hat = rng() < 0.6 ? 'ride' : 'shaker';
    if (chance(rng, variation * 0.45)) swaps.brush = rng() < 0.6 ? 'clap' : 'rim';
    const twists = ['kick', 'push', 'open'];
    return {
        swaps,
        twist: chance(rng, variation * 0.8) ? twists[Math.floor(rng() * twists.length)] : null,
        opening: chance(rng, variation * 0.5),
    };
}

// The twist on a phrase's second and fourth bars.
function twistBar(twist, g, events, hit) {
    const kicks = events.filter((e) => e.midi === DRUM.kick || e.midi === DRUM.punch);
    if (twist === 'kick') {
        // an extra, quieter kick on an off-beat after the middle
        const at = g.offbeats.find((o) => o > g.middle) ?? g.grid[g.grid.length - 1];
        hit('kick', at, 0.4);
    } else if (twist === 'push' && kicks.length > 1) {
        // the last kick comes a step early
        kicks[kicks.length - 1].beat = Math.max(g.step, kicks[kicks.length - 1].beat - g.step);
    } else {
        // an open accent on the bar's last off-beat
        hit('ride', g.grid[g.grid.length - 1], 0.34);
    }
}

// Colour scattered over the bar (see the top): a crash where a section
// begins and, rarely, on a phrase's first bar; otherwise now and then one
// of a bell, a ride tap or a falling tom pickup.
function sprinkle({ g, amount, activity, atSectionStart, index, rng, hit }) {
    if (atSectionStart && chance(rng, 0.3 + amount * 0.6)) {
        hit('crash', g.first, 0.5, 1, (rng() * 2 - 1) * 0.6);
        return;
    }
    if (!chance(rng, amount * (0.12 + activity * 0.25))) return;
    const pick = rng();
    const away = g.offbeats.length ? g.offbeats : g.grid.slice(1);
    const at = away[Math.floor(rng() * away.length)];
    if (index === 0 && pick < 0.2) hit('crash', g.first, 0.3, 1, (rng() * 2 - 1) * 0.6);
    else if (pick < 0.55) hit('bell', at, 0.2 + rng() * 0.14, 0.5, rng() * 2 - 1);
    else if (pick < 0.75) hit('ride', at, 0.2 + rng() * 0.1, 0.25, rng() * 2 - 1);
    else {
        const last = g.grid.slice(-2);
        last.forEach((beat, i) => hit('tom', beat, 0.26 + i * 0.06, 0.25, -0.2 - 0.5 * i));
    }
}

// --- streams --------------------------------------------------------------
// Per bar, per phrase and per groove: streams of their own, from the
// piece's seed.
const stream = (salt, seed, n) => seeded(((seed ^ salt) + Math.imul(n + 1, 0x9e3779b1)) >>> 0);

/**
 * One bar of percussion (exact - see loosenDrums).
 * @param {object} args
 * @param {number} args.bar
 * @param {object} args.meter - from meter.js METERS
 * @param {object} args.drums - { style, activity, variation }
 * @param {object|null} args.section - the phrase's section ({ type, start }), null when sections are off
 * @param {string} args.sectionsMode - 'off' | 'gentle' | 'strong'
 * @param {number} [args.sectionBars] - a section's length
 * @param {number} args.phraseStart - the bar its phrase started at
 * @param {number} args.seed - the piece's seed
 * @returns {object[]} events ({ role: 'perc', midi: drum index, beat, length,
 *   velocity, detune: the hit's variation -1..1 })
 */
export function drumBar({ bar, meter, drums, section, sectionsMode, sectionBars = 16, phraseStart, seed }) {
    const grooves = GROOVES[drums.style];
    if (!grooves) return [];
    const level = section && SECTION_LEVEL[sectionsMode] ? SECTION_LEVEL[sectionsMode][section.type] : 2;
    if (!level) return [];
    const variation = drums.variation ?? DEFAULT_DRUMS.variation;
    const activity = drums.activity;

    // The groove: one per section (or GROOVE_BARS), a phrase may borrow another.
    const grooveStart = section ? section.start : Math.floor(bar / GROOVE_BARS) * GROOVE_BARS;
    let groove = Math.floor(stream(0x510e527f, seed, grooveStart)() * grooves.length);
    const phraseRng = stream(0xbb67ae85, seed, phraseStart);
    // A steady style (electro, driving) is a machine groove: it keeps to one groove per section and
    // leaves out the swapped drums, twists, dropped hits, ghost notes and constant fills the soft
    // styles use for life - on a beat like that they read as mistakes.
    const steady = STEADY.has(drums.style);
    if (phraseRng() < variation * (steady ? 0.1 : 0.4)) groove = (groove + 1 + Math.floor(phraseRng() * (grooves.length - 1))) % grooves.length;

    const colour = steady ? { swaps: {}, twist: null, opening: false } : phraseColour(variation, phraseRng);

    const rng = stream(0x6a09e667, seed, bar);
    const g = geometry(meter);
    const events = [];
    const crisp = drums.kit === 'crisp';
    const hit = (drum, beat, velocity, length = 0.25, vary) => {
        if (beat < 0 || beat >= g.units) return;
        const named = colour.swaps[drum] || drum;
        events.push({
            role: 'perc',
            midi: DRUM[crisp ? CRISP[named] || named : named],
            beat,
            length,
            velocity,
            // the sound's variation; a sweep's direction comes from the groove
            detune: vary !== undefined ? vary * (0.5 + variation * 0.5) : (rng() * 2 - 1) * variation * (steady ? 0.25 : 1),
        });
    };
    grooves[groove]({ g, level, activity, rng, hit });
    const index = (bar - phraseStart) % 4;
    if (level >= 2 && colour.twist && index % 2 === 1) twistBar(colour.twist, g, events, hit);
    if (level >= 2 && colour.opening && index === 0) hit('ride', g.first, 0.5, 0.25, 0.8);

    // Variation from bar to bar: a hit dropped, a ghost added.
    if (!steady && events.length > 2 && chance(rng, variation * 0.5)) {
        const i = 1 + Math.floor(rng() * (events.length - 1));
        if (events[i].midi !== DRUM.swish) events.splice(i, 1);
    }
    if (!steady && chance(rng, variation * activity)) {
        const at = g.offbeats.length ? g.offbeats[Math.floor(rng() * g.offbeats.length)] : g.grid[g.grid.length - 1];
        hit(rng() < 0.5 ? 'brush' : 'rim', at, 0.16);
    }

    // Fills: a phrase's last bar now and then; a section's last bar more often and bigger.
    const sectionEnds = section ? (bar + 1 - section.start) % (section.bars || sectionBars) === 0 : (bar + 1) % GROOVE_BARS === 0;
    const phraseEnds = index === 3;
    // (a steady beat fills at the end of a section, and only now and then at a phrase's)
    const fillChance = steady ? (sectionEnds ? 0.7 : 0.04 + activity * 0.12) : 0.15 + activity * 0.35 + variation * 0.15;
    if (level >= 2 && phraseEnds && chance(rng, fillChance)) {
        fill(g, sectionEnds, rng, hit, drums.style === 'electro' || drums.style === 'drive');
    }
    if (level >= 2 && drums.sprinkle > 0) {
        sprinkle({
            g,
            amount: drums.sprinkle,
            activity,
            atSectionStart: bar > 0 && (section ? bar === section.start : bar % GROOVE_BARS === 0),
            index,
            rng: stream(0x1f83d9ab, seed, bar),
            hit,
        });
    }
    return events;
}

/**
 * Timing and velocity looseness for a bar's hits (as Generator.humanize),
 * from a stream of its own: drums never draw from the arranger's.
 * @param {object} humanize - { timing (ms), velocity }
 */
export function loosenDrums(events, { timing, velocity }, unitSeconds, seed, bar) {
    const rng = stream(0x3c6ef372, seed, bar);
    events.forEach((e) => {
        e.beat = Math.max(0, e.beat + normal(rng, timing / 1000) / unitSeconds);
        e.velocity = Math.max(0.05, Math.min(1, e.velocity * (1 + normal(rng, velocity + 0.04))));
    });
}

/** A few hits for an audition (the kit on its own while stopped). */
export const auditionHits = () => ['kick', 'hat', 'brush', 'shaker', 'rim', 'clap', 'tom', 'ride', 'bell', 'crash', 'swish', 'punch', 'snare', 'sizzle'].map((drum, i) => ({ midi: DRUM[drum], beat: i * 0.5, velocity: 0.6, detune: 0 }));

/** Random drum settings: a style, activity and variation. */
export function randomDrums(rng = Math.random) {
    const styles = Object.keys(DRUM_STYLES).filter((s) => s !== 'off');
    return {
        style: styles[Math.floor(rng() * styles.length)],
        activity: Math.round((0.2 + rng() * 0.6) * 20) / 20,
        variation: Math.round((0.2 + rng() * 0.7) * 20) / 20,
        sprinkle: Math.round((0.1 + rng() * 0.6) * 20) / 20,
        kit: rng() < 0.25 ? 'crisp' : 'felt',
    };
}
