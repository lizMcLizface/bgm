// Procedural sounds, version 2 (docs/DESIGN.md §9 B): recipes by *kind* -
// a pad role can get a pad, a texture or keys; a bass a bass or a pluck
// bass; a lead a lead, a pluck or a bell - using the engine's FM, extra
// waveforms, filter motion, tremolo / auto-pan, key tracking, velocity and
// pitch envelopes. Version 1 (soundGen.js) is frozen so v1 links keep
// making v1 sounds; a link names a v2 sound by role, kind and seed, or a
// v2 ensemble by its seed (shareCode.js).
//
// As in v1: changing what a seed makes changes every shared sound - only
// together with a new version (and share-code escape).

import { seeded, pick } from './random';
import { tools, RECIPES_V1, ADJECTIVES, NOUNS, BRIGHT as BRIGHT_V1, round, generateSound, generateEnsembleSound } from './soundGen';

export const GENERATOR_V2 = 2;

/** The kinds each role can be given, with display names. */
export const SOUND_KINDS = {
    pad: { pad: 'Pad', texture: 'Texture', keys: 'Keys' },
    bass: { bass: 'Bass', pluck: 'Pluck bass' },
    lead: { lead: 'Lead', pluck: 'Pluck', bell: 'Bell' },
    counter: { lead: 'Lead', pluck: 'Pluck', bell: 'Bell' },
};
/** Kinds by index in share codes. Append only. */
export const KIND_CODES = ['pad', 'texture', 'keys', 'bass', 'pluck', 'lead', 'bell'];

// "Any kind": how often each comes up for a role.
const ANY_KIND = {
    pad: { pad: 5, texture: 2, keys: 3 },
    bass: { bass: 4, pluck: 2 },
    lead: { lead: 4, pluck: 2, bell: 2 },
    counter: { lead: 4, pluck: 2, bell: 2 },
};

// Brightness per waveform, the new ones included.
const BRIGHT = { ...BRIGHT_V1, square: 0.8, organ: 0.5, hollow: 0.35, choir: 0.45, glass: 0.6, reed: 0.75 };
// The v1 recipes' filter ranges per role at brightness 0 and their slopes,
// to re-aim a filter when the waveform changes (as v1's ensembles do).
const FILTER_AIM = { pad: [5000, 3350], bass: [1200, 675], lead: [7500, 4500], counter: [7500, 4500] };
const aim = (role, wave) => FILTER_AIM[role][0] - FILTER_AIM[role][1] * BRIGHT[wave];
const clampTo = (lo, hi) => (v) => Math.min(hi, Math.max(lo, v));
const FM_KEYS = ['fmRatio', 'fmIndex', 'fmEnvAmount', 'fmDecay'];

function rewave(p, role, wave) {
    const old = p.vcoType;
    p.vcoType = wave;
    if (wave !== 'square_dc') delete p.vcoDutyCycle;
    p.filterFreq = round(clampTo(250, role === 'bass' ? 1450 : 11000)(p.filterFreq * (aim(role, wave) / aim(role, old))), 0);
}

const delayToPingPong = (p) => {
    Object.assign(p, { pingPongDelayTime: p.delayTime, pingPongFeedback: p.delayFeedback, pingPongAmount: p.delayAmount });
    ['delayTime', 'delayFeedback', 'delayAmount'].forEach((k) => delete p[k]);
};

const RECIPES = {
    // The v1 recipes, then the new engine's colours on top.
    pad(t) {
        const p = RECIPES_V1.pad(t);
        if (t.maybe(0.3)) rewave(p, 'pad', t.weighted({ choir: 3, hollow: 2, organ: 1 }));
        if (t.maybe(0.4)) Object.assign(p, { filterLfoRate: t.range(0.03, 0.15), filterLfoDepth: t.range(500, 1500, 0) });
        if (t.maybe(0.3)) Object.assign(p, { autoPanRate: t.range(0.03, 0.15), autoPanDepth: t.range(0.2, 0.5) });
        else if (t.maybe(0.15)) Object.assign(p, { tremoloRate: t.range(2.5, 5), tremoloDepth: t.range(0.15, 0.35) });
        if (t.maybe(0.3)) p.filterVelocity = t.range(600, 1800, 0);
        return p;
    },

    bass(t) {
        const p = RECIPES_V1.bass(t);
        if (t.maybe(0.15)) rewave(p, 'bass', t.weighted({ hollow: 2, organ: 1 }));
        if (t.maybe(0.25)) Object.assign(p, { pitchEnvAmount: t.range(300, 900, 0), pitchEnvDecay: t.range(0.03, 0.08, 3) });
        if (['sine', 'triangle'].includes(p.vcoType) && t.maybe(0.25)) {
            Object.assign(p, { fmRatio: t.pick([1, 1, 2]), fmIndex: t.range(0.2, 0.8), fmEnvAmount: t.range(1, 3), fmDecay: t.range(0.1, 0.35) });
        }
        if (t.maybe(0.4)) p.filterVelocity = t.range(600, 1800, 0);
        return p;
    },

    lead(t) {
        const p = RECIPES_V1.lead(t);
        if (t.maybe(0.3)) rewave(p, 'lead', t.weighted({ reed: 2, hollow: 2, organ: 1, choir: 1 }));
        if (t.maybe(0.4)) p.filterKeyTrack = t.range(0.3, 0.7);
        if (t.maybe(0.4)) p.filterVelocity = t.range(1000, 2400, 0);
        if (p.delayAmount && t.maybe(0.4)) delayToPingPong(p);
        if (t.maybe(0.12)) Object.assign(p, { autoPanRate: t.range(0.1, 0.4), autoPanDepth: t.range(0.2, 0.4) });
        // a little scoop up into each note
        if (t.maybe(0.15)) Object.assign(p, { pitchEnvAmount: -t.range(20, 60, 0), pitchEnvDecay: t.range(0.05, 0.12, 3) });
        return p;
    },

    // Chords that strike and fade: electric piano, felt piano, organ, glass.
    keys(t) {
        const flavour = t.weighted({ rhodes: 3, felt: 3, organ: 1, glass: 1 });
        const p = {
            gainAttack: t.range(0.002, 0.01, 3),
            gainDecay: t.range(0.9, 2.5),
            gainSustain: t.range(0, 0.25),
            gainRelease: t.range(0.4, 1.2),
            filterVelocity: t.range(1200, 3000, 0),
            reverbType: t.pick(['reverb3', 'reverb4', 'reverb4']),
            reverbAmount: t.range(0.2, 0.4),
        };
        if (flavour === 'rhodes') {
            Object.assign(p, { vcoType: 'sine', fmRatio: t.pick([1, 1, 2]), fmIndex: t.range(0.1, 0.4), fmEnvAmount: t.range(2, 6), fmDecay: t.range(0.5, 1.2) });
            if (t.maybe(0.5)) {
                const rate = t.range(3.5, 5.5);
                Object.assign(p, { tremoloRate: rate, tremoloDepth: t.range(0.1, 0.25), autoPanRate: round(rate / 2), autoPanDepth: t.range(0.15, 0.35) });
            }
        } else if (flavour === 'felt') {
            Object.assign(p, {
                vcoType: 'triangle',
                osc2Type: 'sine',
                osc2OctaveOffset: 1,
                osc2Amount: t.range(0.1, 0.3),
                filterType: 'lowpass',
                filterFreq: t.logRange(900, 2200),
                filterKeyTrack: t.range(0.4, 0.8),
                filterEnvAmount: t.range(600, 1500, 0),
                filterDecay: t.range(0.3, 0.8),
                pitchEnvAmount: t.range(5, 20, 0),
                pitchEnvDecay: t.range(0.05, 0.1, 3),
            });
        } else if (flavour === 'organ') {
            Object.assign(p, { vcoType: 'organ', gainAttack: t.range(0.01, 0.03, 3), gainDecay: t.range(0.2, 0.4), gainSustain: t.range(0.6, 0.8), gainRelease: t.range(0.1, 0.3) });
            if (t.maybe(0.6)) Object.assign(p, { tremoloRate: t.range(5, 6.5), tremoloDepth: t.range(0.2, 0.35) });
        } else {
            Object.assign(p, { vcoType: 'glass', filterType: 'lowpass', filterFreq: t.logRange(3000, 7000), gainSustain: t.range(0, 0.1) });
        }
        if (t.maybe(0.4)) Object.assign(p, { chorusAmount: t.range(0.15, 0.3), chorusRate: t.range(0.3, 0.8) });
        return p;
    },

    // Slow, moving, noisy or filtered beds rather than chords you can pick out.
    texture(t) {
        const vcoType = t.weighted({ sine: 2, triangle: 2, hollow: 2, choir: 1, sawtooth: 1 });
        // a band-pass over the notes' fundamentals, and only on waves rich
        // enough to keep a body through it (a filtered sine all but vanishes)
        const bandpass = ['hollow', 'choir', 'sawtooth'].includes(vcoType) && t.maybe(0.5);
        const p = {
            vcoType,
            voiceCount: t.pick([1, 2, 3]),
            detuneSpread: t.range(5, 15, 0),
            stereoSpread: t.range(50, 100, 0),
            gainAttack: t.range(1.5, 4),
            gainDecay: t.range(1, 2),
            gainSustain: t.range(0.5, 0.8),
            gainRelease: t.range(2.5, 5),
            envelopeAttackShape: 'sine',
            envelopeAttackExponent: 1,
            filterType: bandpass ? 'bandpass' : 'lowpass',
            filterFreq: bandpass ? t.logRange(350, 900) : t.logRange(600, 2200),
            filterQ: bandpass ? t.range(0.5, 0.8, 1) : t.range(0.5, 2, 1),
            filterLfoRate: t.range(0.03, 0.2),
            filterLfoDepth: t.range(600, 1800, 0),
            reverbType: t.pick(['reverb4', 'reverb6', 'reverb6']),
            reverbAmount: t.range(0.45, 0.6),
        };
        if (t.maybe(0.5)) Object.assign(p, { noiseType: t.pick(['pink', 'brown', 'white']), noiseMix: t.range(0.2, 0.5), noiseFilterEnabled: true, noiseFilterQ: t.range(4, 14, 1) });
        const motion = t.weighted({ flanger: 2, phaser: 2, chorus: 1, none: 1 });
        if (motion === 'flanger') {
            Object.assign(p, { flangerDelay: t.range(0.005, 0.012, 4), flangerDepth: t.range(0.002, 0.004, 4), flangerRate: t.range(0.05, 0.2), flangerFeedback: t.range(0.2, 0.5), flangerAmount: t.range(0.2, 0.4) });
        } else if (motion === 'phaser') {
            Object.assign(p, { phaserAmount: t.range(0.25, 0.45), phaserRate: t.range(0.05, 0.2), phaserDepth: t.range(500, 1000, 0) });
        } else if (motion === 'chorus') {
            Object.assign(p, { chorusAmount: t.range(0.25, 0.4), chorusRate: t.range(0.2, 0.5) });
        }
        if (t.maybe(0.5)) Object.assign(p, { autoPanRate: t.range(0.03, 0.1), autoPanDepth: t.range(0.3, 0.6) });
        if (t.maybe(0.15)) Object.assign(p, { bitCrushDepth: t.pick([5, 6, 7]), bitCrushAmount: t.range(0.15, 0.3) });
        return p;
    },

    // A struck string: no sustain (a bass keeps a little), a filter that snaps shut.
    pluck(t, role) {
        const bass = role === 'bass';
        const vcoType = t.weighted(bass ? { triangle: 3, sawtooth: 2, square_dc: 2, sine: 1 } : { sawtooth: 3, triangle: 3, square_dc: 2, reed: 1, hollow: 1 });
        const p = {
            vcoType,
            gainAttack: t.range(0.001, 0.005, 3),
            gainDecay: bass ? t.range(0.4, 0.9) : t.range(0.3, 1.2),
            gainSustain: bass ? t.range(0.08, 0.25) : 0,
            gainRelease: bass ? t.range(0.1, 0.3) : t.range(0.25, 0.8),
            filterType: 'lowpass',
            filterFreq: bass ? t.logRange(400, 800) : t.logRange(800, 2200),
            filterQ: t.range(0.5, 3, 1),
            filterEnvAmount: bass ? t.range(1200, 3000, 0) : t.range(1800, 4200, 0),
            filterDecay: bass ? t.range(0.08, 0.25) : t.range(0.1, 0.4),
            filterVelocity: t.range(1200, 3000, 0),
        };
        if (vcoType === 'square_dc') p.vcoDutyCycle = t.range(0.2, 0.45);
        if (!bass) p.filterKeyTrack = t.range(0.3, 0.7);
        if (t.maybe(0.35)) Object.assign(p, { pitchEnvAmount: t.range(8, 30, 0), pitchEnvDecay: t.range(0.02, 0.06, 3) });
        if (bass) {
            if (t.maybe(0.7)) Object.assign(p, { subOscOctaveOffset: -1, subOscType: 'sine' });
            if (t.maybe(0.4)) Object.assign(p, { reverbType: 'reverb1', reverbAmount: t.range(0.03, 0.08) });
            return p;
        }
        const echo = t.weighted({ pingPong: 2, delay: 2, none: 1 });
        if (echo === 'pingPong') Object.assign(p, { pingPongDelayTime: t.range(0.3, 0.5), pingPongFeedback: t.range(0.2, 0.4), pingPongAmount: t.range(0.1, 0.2) });
        if (echo === 'delay') Object.assign(p, { delayTime: t.range(0.3, 0.5), delayFeedback: t.range(0.2, 0.4), delayAmount: t.range(0.1, 0.2) });
        Object.assign(p, { reverbType: t.pick(['reverb3', 'reverb4', 'reverb5']), reverbAmount: t.range(0.2, 0.4) });
        return p;
    },

    // FM bells and chimes (inharmonic ratios), or the glass waveform.
    bell(t) {
        let p;
        if (t.maybe(0.25)) {
            p = { vcoType: 'glass', filterType: 'lowpass', filterFreq: t.logRange(4000, 9000) };
        } else {
            const fmRatio = t.pick([2, 3, 3.5, 4, 5, 7]);
            // high ratios get less index: the modulator is already far above the note
            p = { vcoType: 'sine', fmRatio, fmIndex: t.range(0, 0.5), fmEnvAmount: fmRatio >= 5 ? t.range(2, 5) : t.range(3, 9), fmDecay: t.range(0.6, 2.5) };
        }
        Object.assign(p, {
            gainAttack: t.range(0.001, 0.004, 3),
            gainDecay: t.range(1.5, 3.5),
            gainSustain: t.range(0, 0.12),
            gainRelease: t.range(1, 2.5),
            filterVelocity: t.range(1200, 3000, 0),
            reverbType: t.pick(['reverb6', 'reverb4', 'reverb6']),
            reverbAmount: t.range(0.3, 0.5),
        });
        if (t.maybe(0.5)) Object.assign(p, { pingPongDelayTime: t.pick([0.33, 0.375, 0.4, 0.5]), pingPongFeedback: t.range(0.25, 0.4), pingPongAmount: t.range(0.1, 0.2) });
        if (t.maybe(0.2)) Object.assign(p, { autoPanRate: t.range(0.1, 0.3), autoPanDepth: t.range(0.2, 0.4) });
        return p;
    },
};

// Nouns that say what a kind is; the role's usual kinds use v1's.
const KIND_NOUNS = {
    keys: ['Keys', 'Tines', 'Felt', 'Piano', 'Hammer', 'Reed'],
    texture: ['Haze', 'Fog', 'Veil', 'Drift', 'Murmur', 'Static', 'Tide', 'Smoke'],
    pluck: ['Pluck', 'Harp', 'Pick', 'Koto', 'String', 'Lute'],
    bell: ['Bell', 'Chime', 'Gong', 'Tine', 'Glass', 'Bowl'],
};
const nounsFor = (kind) => KIND_NOUNS[kind] || NOUNS;

/** The kind "any" resolves to for (role, seed). */
export const anyKind = (role, seed) => {
    const t = tools(seeded(seed ^ 0x1b873593));
    return t.weighted(ANY_KIND[role]);
};

const hexOf = (seed) => seed.toString(16).padStart(6, '0').slice(0, 4);

/** Display name of a v2 sound. */
export function soundNameV2(kind, seed) {
    const rng = seeded(seed ^ 0x3c6ef372);
    return `${pick(rng, ADJECTIVES)} ${pick(rng, nounsFor(kind))} #${hexOf(seed)}`;
}

/**
 * A v2 preset for `role` (masterVolume not yet levelled).
 * @param {string} [kind] - one of SOUND_KINDS[role]; missing / 'any': by the seed
 * @returns {{ name: string, preset: object, kind: string }}
 */
export function generateSoundV2(role, seed, kind) {
    const resolved = kind && SOUND_KINDS[role][kind] ? kind : anyKind(role, seed);
    const preset = RECIPES[resolved](tools(seeded(seed)), role);
    preset.masterVolume = 0.6;
    return { name: soundNameV2(resolved, seed), preset, kind: resolved };
}

// --- ensembles v2 ---------------------------------------------------------
// As v1 (a palette shared by every voice), with more characters - glassy,
// organ, lo-fi, dub - and a kind per voice that suits the character.

const ROLES = ['pad', 'bass', 'lead', 'counter'];

const CHARACTER_KINDS = {
    smooth: { pad: { pad: 4, texture: 1, keys: 1 }, bass: { bass: 4, pluck: 1 }, lead: { lead: 4, bell: 1, pluck: 1 } },
    warm: { pad: { pad: 3, keys: 3 }, bass: { bass: 3, pluck: 2 }, lead: { lead: 3, pluck: 2 } },
    bright: { pad: { pad: 4, keys: 1 }, bass: { bass: 3, pluck: 2 }, lead: { lead: 3, pluck: 3 } },
    glassy: { pad: { texture: 2, keys: 2, pad: 1 }, bass: { bass: 3, pluck: 1 }, lead: { bell: 4, lead: 1, pluck: 1 } },
    organ: { pad: { pad: 1 }, bass: { bass: 1 }, lead: { lead: 1 } },
    lofi: { pad: { keys: 3, pad: 2 }, bass: { bass: 2, pluck: 2 }, lead: { pluck: 2, lead: 2, bell: 1 } },
    dub: { pad: { pad: 2, keys: 2 }, bass: { bass: 1 }, lead: { pluck: 3, lead: 1 } },
};
// Waveforms for the sustained kinds per character.
const WAVE_FAMILIES = {
    smooth: { sine: 3, triangle: 2, hollow: 1 },
    warm: { triangle: 3, square_dc: 2, choir: 1, organ: 1 },
    bright: { sawtooth: 3, square_dc: 2, reed: 1 },
    glassy: { sine: 2, glass: 2, triangle: 1 },
    organ: { organ: 4, hollow: 1 },
    lofi: { triangle: 2, square_dc: 1, sine: 1 },
    dub: { sine: 2, triangle: 2 },
};
const BASS_WAVES = new Set(['sine', 'triangle', 'square_dc', 'sawtooth', 'hollow', 'organ']);
const SUSTAINED = new Set(['pad', 'texture', 'bass', 'lead']);
const MOTION_AMOUNT = { pad: 0.3, bass: 0.08, lead: 0.2, counter: 0.2 };

/** The shared character of a v2 ensemble seed. */
export function ensemblePaletteV2(seed) {
    const t = tools(seeded(seed ^ 0x7f4a7c15));
    const character = t.weighted({ smooth: 3, warm: 3, bright: 2, glassy: 2, organ: 1, lofi: 2, dub: 1 });
    const palette = {
        character,
        brightness: t.range(0.6, 1.5),
        reverbType: t.pick(['reverb1', 'reverb3', 'reverb4', 'reverb6']),
        space: t.range(0.5, 1.6),
        motion: t.weighted({ chorus: 3, phaser: 2, flanger: 1, drift: 2, none: 2 }),
        motionRate: t.range(0.15, 0.7),
        softness: t.range(0.7, 1.6),
        echo: t.maybe(character === 'dub' ? 0.9 : 0.5)
            ? { time: t.pick([0.25, 0.33, 0.375, 0.5]), feedback: character === 'dub' ? t.range(0.4, 0.55) : t.range(0.2, 0.4), pingPong: character === 'dub' || t.maybe(0.4) }
            : null,
        vibrato: t.maybe(0.5) ? t.range(3, 8, 1) : 0,
    };
    const kindWeights = CHARACTER_KINDS[character];
    palette.kinds = Object.fromEntries(ROLES.map((role) => [role, t.weighted(kindWeights[role === 'counter' ? 'lead' : role])]));
    return palette;
}

const MOTION_KEYS = ['chorus', 'phaser', 'flanger', 'filterLfo', 'autoPan'];

function applyPaletteV2(role, kind, p, pal, t) {
    if (SUSTAINED.has(kind)) {
        let wave = t.weighted(WAVE_FAMILIES[pal.character]);
        if (role === 'bass' && !BASS_WAVES.has(wave)) wave = 'triangle';
        const filterRole = role === 'counter' ? 'lead' : role;
        rewave(p, filterRole, wave);
        if (wave === 'square_dc' && p.vcoDutyCycle === undefined) p.vcoDutyCycle = t.range(0.25, 0.45);
        if (!['sine', 'triangle'].includes(wave)) FM_KEYS.forEach((k) => delete p[k]);
    }
    if (p.filterFreq !== undefined) p.filterFreq = round(clampTo(250, role === 'bass' ? 1450 : 11000)(p.filterFreq * pal.brightness), 0);

    if (role !== 'bass' || p.reverbAmount) {
        p.reverbType = role === 'bass' ? 'reverb1' : pal.reverbType;
        p.reverbAmount = round(clampTo(0.02, role === 'bass' ? 0.1 : 0.6)((p.reverbAmount || 0.05) * pal.space));
    }

    MOTION_KEYS.forEach((fx) => Object.keys(p).filter((k) => k.startsWith(fx)).forEach((k) => delete p[k]));
    const rate = round(pal.motionRate);
    if (pal.motion === 'chorus') Object.assign(p, { chorusAmount: MOTION_AMOUNT[role], chorusRate: rate });
    if (pal.motion === 'phaser') Object.assign(p, { phaserAmount: MOTION_AMOUNT[role], phaserRate: round(pal.motionRate * 0.5), phaserDepth: 600 });
    if (pal.motion === 'flanger' && role !== 'bass') {
        Object.assign(p, { flangerDelay: 0.008, flangerDepth: 0.003, flangerRate: round(pal.motionRate * 0.3), flangerFeedback: 0.35, flangerAmount: MOTION_AMOUNT[role] });
    }
    if (pal.motion === 'drift' && role === 'pad') Object.assign(p, { filterLfoRate: round(pal.motionRate * 0.2), filterLfoDepth: 1000, autoPanRate: round(pal.motionRate * 0.15), autoPanDepth: 0.4 });
    if (pal.motion === 'drift' && (role === 'lead' || role === 'counter')) Object.assign(p, { autoPanRate: round(pal.motionRate * 0.3), autoPanDepth: 0.25 });

    if (role === 'bass') {
        p.gainRelease = round(clampTo(0.08, 0.5)(p.gainRelease * Math.min(pal.softness, 1.2)));
    } else if (kind === 'pad' || kind === 'texture') {
        p.gainAttack = round(clampTo(0.6, 4)(p.gainAttack * pal.softness), 3);
        p.gainRelease = round(clampTo(0.2, 5)(p.gainRelease * pal.softness));
    } else if (kind === 'lead') {
        p.gainAttack = round(clampTo(0.005, 0.3)(p.gainAttack * pal.softness), 3);
        p.gainRelease = round(clampTo(0.2, 5)(p.gainRelease * pal.softness));
    } else {
        // struck sounds keep their attack; only the tail follows the character
        p.gainRelease = round(clampTo(0.2, 3)(p.gainRelease * pal.softness));
    }

    if (role === 'lead' || role === 'counter') {
        ['delayTime', 'delayFeedback', 'delayAmount', 'pingPongDelayTime', 'pingPongFeedback', 'pingPongAmount'].forEach((k) => delete p[k]);
        if (pal.echo) {
            const amount = role === 'lead' ? 0.18 : 0.12;
            const feedback = round(pal.echo.feedback);
            if (pal.echo.pingPong) Object.assign(p, { pingPongDelayTime: pal.echo.time, pingPongFeedback: feedback, pingPongAmount: amount });
            else Object.assign(p, { delayTime: pal.echo.time, delayFeedback: feedback, delayAmount: amount });
        }
        delete p.vibratoDepth;
        delete p.vibratoRate;
        if (pal.vibrato && kind === 'lead') Object.assign(p, { vibratoDepth: pal.vibrato, vibratoRate: 4.6 });
    }

    if (pal.character === 'lofi' && role !== 'bass') {
        // tape: a slow pitch wobble, crushed and dull
        Object.assign(p, {
            bitCrushDepth: t.pick([6, 7, 8]),
            bitCrushAmount: t.range(0.12, 0.25),
            vibratoRate: t.range(0.3, 0.7),
            vibratoDepth: t.range(3, 7, 1),
            eqHighGain: t.range(-6, -3, 0),
        });
    }
    if (pal.character === 'organ' && role !== 'bass') Object.assign(p, { tremoloRate: t.range(5, 6.5), tremoloDepth: t.range(0.2, 0.35) });
    return p;
}

// Each voice's own seed in a v2 ensemble.
const memberSeedV2 = (ensemble, role) => (Math.imul(ensemble ^ 0x85ebca6b, 2246822507) + (ROLES.indexOf(role) + 1) * 0x27d4eb2f) >>> 8;

/** A v2 ensemble's name for one voice: a shared word and the ensemble's id, the voice's own noun. */
export function ensembleNameV2(role, ensemble) {
    const shared = seeded(ensemble ^ 0x3c6ef372);
    const own = seeded(memberSeedV2(ensemble, role));
    return `${pick(shared, ADJECTIVES)} ${pick(own, nounsFor(ensemblePaletteV2(ensemble).kinds[role]))} #${hexOf(ensemble)}`;
}

/**
 * One voice of a v2 ensemble (masterVolume not yet levelled).
 * @returns {{ name: string, preset: object, kind: string }}
 */
export function generateEnsembleSoundV2(role, ensemble) {
    const seed = memberSeedV2(ensemble, role);
    const palette = ensemblePaletteV2(ensemble);
    const kind = palette.kinds[role];
    const preset = applyPaletteV2(role, kind, RECIPES[kind](tools(seeded(seed)), role), palette, tools(seeded(seed ^ 0x68e31da4)));
    preset.masterVolume = 0.6;
    return { name: ensembleNameV2(role, ensemble), preset, kind };
}

/**
 * A sound from its link info, any version: { role, seed } / { role,
 * ensemble } (v1), { role, seed, kind, version: 2 } / { role, ensemble,
 * version: 2 }.
 */
export function soundFrom(info) {
    if (info.version === GENERATOR_V2) {
        return info.ensemble !== undefined ? generateEnsembleSoundV2(info.role, info.ensemble) : generateSoundV2(info.role, info.seed, info.kind);
    }
    return info.ensemble !== undefined ? generateEnsembleSound(info.role, info.ensemble) : generateSound(info.role, info.seed);
}
