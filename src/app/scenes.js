// Scenes - "Presets" on the page: whole soundscapes to start from - key,
// scale, tempo, meter, progression, arrangement, drums, ambience and a
// sound for every voice - picked from the top row. (Called scenes here so
// they aren't confused with the synth presets of presets.js.) A scene is a
// patch over the default settings (anything it doesn't name is the
// default) plus a built-in synth preset per role; choosing one moves the
// piece there from the next bar, with a new seed, and plays what the scene
// plays - music, ambience or both. Afterwards everything is as editable as
// ever. Its group in the picker follows from what it plays (sceneGroup).

import { defaultSettings, newSeed, sanitizeSettings } from './settings';

const C = 0;
const D = 2;
const E = 4;
const F = 5;
const G = 7;
const A = 9;
const BB = 10;

const MAJOR = 'Major-1';
const DORIAN = 'Major-2';
const LYDIAN = 'Major-4';
const MIXOLYDIAN = 'Major-5';
const AEOLIAN = 'Major-6';
const PHRYGIAN_DOMINANT = 'Harmonic Minor-5';
const MAJOR_PENTATONIC = 'Pentatonic-1';

const drums = (style, activity = 0.5, variation = 0.6) => ({ style, activity, variation });
const ambience = (levels) => ({ rain: 0, thunder: 0, wind: 0, waves: 0, fire: 0, vinyl: 0, ...levels });
// Ambience alone: no music, and the sounds are left as they are.
const bed = (levels, shape = {}) => ({ playMusic: false, playAmbience: true, ambience: ambience(levels), ambienceShape: shape });

/** In picker order. */
export const SCENES = [
    {
        name: 'Rainy café',
        blurb: 'Felt piano and a lazy lo-fi beat, rain on the window',
        patch: {
            tonic: D, mode: DORIAN, bpm: 76, progression: 7, padNotes: 4,
            padWeights: { sustain: 30, pulse: 50, arpeggio: 20 },
            drums: drums('lofi', 0.55, 0.7), swing: 0.35, sectionTone: true,
            ambience: ambience({ rain: 0.4, vinyl: 0.25 }), playAmbience: true,
        },
        presets: { pad: 'Felt Piano', bass: 'Thump Bass', lead: 'Reed Lead' },
    },
    {
        name: 'Late-night brushes',
        blurb: 'Electric piano ninths, a walking bass and brushes, by the fire',
        patch: {
            tonic: F, mode: DORIAN, bpm: 84, progression: 16, padNotes: 5, barsPerChord: 2,
            padWeights: { sustain: 40, pulse: 40, arpeggio: 20 }, bassWeights: { whole: 10, half: 30, walking: 60 },
            drums: drums('brushes', 0.6, 0.8), swing: 0.5,
            counter: { mode: 'answer', activity: 0.5 },
            ambience: ambience({ fire: 0.3 }), playAmbience: true,
        },
        presets: { pad: 'FM Rhodes', bass: 'FM Bass', lead: 'Organ Whistle', counter: 'Soft Flute' },
    },
    {
        name: 'Deep night',
        blurb: 'A slow breathing pad, bells and a heartbeat under distant thunder',
        patch: {
            tonic: A, mode: AEOLIAN, bpm: 58, progression: 6, barsPerChord: 2, leadActivity: 0.4,
            drums: drums('heartbeat', 0.4, 0.5), sections: { mode: 'strong', phrases: 2 }, sectionTone: true,
            ambience: ambience({ rain: 0.3, thunder: 0.25 }), playAmbience: true,
        },
        presets: { pad: 'Breathing Pad', bass: 'Sub Bass', lead: 'FM Bell' },
    },
    {
        name: 'Glass garden',
        blurb: 'Bright Lydian chimes and marimba over a shaker and waves',
        patch: {
            tonic: E, mode: LYDIAN, bpm: 92, progression: 10, padNotes: 4,
            padWeights: { sustain: 20, pulse: 20, arpeggio: 60 },
            drums: drums('shaker', 0.6, 0.6),
            counter: { mode: 'answer', activity: 0.6 },
            ambience: ambience({ waves: 0.25 }), playAmbience: true,
        },
        presets: { pad: 'Glass Pad', bass: 'Round Pluck Bass', lead: 'Soft Marimba', counter: 'Glass Mallet' },
    },
    {
        name: 'Underwater',
        blurb: 'A filtered, drifting bed in 6/8 with a slow line weaving through',
        patch: {
            tonic: C, mode: AEOLIAN, bpm: 62, meter: '6/8', progression: 12, barsPerChord: 2, leadActivity: 0.3,
            bassWeights: { whole: 80, half: 20, walking: 0 },
            counter: { mode: 'line', activity: 0.35 },
            ambience: ambience({ waves: 0.5 }), playAmbience: true,
        },
        presets: { pad: 'Underwater', bass: 'Deep Pulse', lead: 'Glass Lead', counter: 'Hollow Tremolo' },
    },
    {
        name: 'Chapel organ',
        blurb: 'A tremolo organ and a flute, wind around the walls',
        patch: {
            tonic: G, mode: MAJOR, bpm: 66, progression: 1, padNotes: 4, barsPerChord: 2,
            padWeights: { sustain: 80, pulse: 20, arpeggio: 0 },
            sections: { mode: 'gentle', phrases: 4 }, sectionTone: true,
            ambience: ambience({ wind: 0.25 }), playAmbience: true,
        },
        presets: { pad: 'Tremolo Organ', bass: 'Warm Bass', lead: 'Soft Flute' },
    },
    {
        name: 'Fireside folk',
        blurb: 'A harp in 3/4, an upright bass and an ocarina by the fire',
        patch: {
            tonic: D, mode: MAJOR_PENTATONIC, bpm: 88, meter: '3/4', progression: 14,
            padWeights: { sustain: 10, pulse: 20, arpeggio: 70 },
            drums: drums('shaker', 0.3, 0.5),
            ambience: ambience({ fire: 0.45 }), playAmbience: true,
        },
        presets: { pad: 'Harp Pluck', bass: 'Upright Pluck', lead: 'Ocarina' },
    },
    {
        name: 'Desert dusk',
        blurb: 'Phrygian dominant: kalimba and clarinet over a heartbeat and wind',
        patch: {
            tonic: E, mode: PHRYGIAN_DOMINANT, bpm: 70, progression: 13, barsPerChord: 2,
            padWeights: { sustain: 30, pulse: 20, arpeggio: 50 },
            drums: drums('heartbeat', 0.5, 0.6),
            ambience: ambience({ wind: 0.35 }), playAmbience: true,
        },
        presets: { pad: 'Kalimba Pluck', bass: 'Warm Bass', lead: 'Clarinet Lead' },
    },
    {
        name: 'Tape memories',
        blurb: 'A worn tape pad and a square lead, a dusty beat and vinyl',
        patch: {
            tonic: BB, mode: MAJOR, bpm: 72, progression: 3, padNotes: 4,
            drums: drums('lofi', 0.4, 0.8), swing: 0.25,
            humanize: { timing: 18, velocity: 0.12, detune: 6 },
            ambience: ambience({ vinyl: 0.45 }), playAmbience: true,
        },
        presets: { pad: 'Lo-fi Tape Pad', bass: 'Felt Bass', lead: 'Warm Square Lead' },
    },
    {
        name: 'Choir at sea',
        blurb: 'Voices and a reed over long Mixolydian chords and waves',
        patch: {
            tonic: A, mode: MIXOLYDIAN, bpm: 64, progression: 10, barsPerChord: 4, leadActivity: 0.5,
            padWeights: { sustain: 90, pulse: 10, arpeggio: 0 },
            counter: { mode: 'harmony', activity: 0.5 },
            ambience: ambience({ waves: 0.4, wind: 0.15 }), playAmbience: true,
        },
        presets: { pad: 'Choir Ah', bass: 'Sub Bass', lead: 'Reed Lead', counter: 'Sine Whistle' },
    },

    // music only
    {
        name: 'Morning coffee',
        blurb: 'Soft keys, a round bass and a kalimba, a light swung beat',
        patch: {
            tonic: C, mode: MAJOR, bpm: 94, progression: 1, padNotes: 4,
            padWeights: { sustain: 20, pulse: 60, arpeggio: 20 },
            drums: drums('lofi', 0.35, 0.6), swing: 0.2,
        },
        presets: { pad: 'Soft Keys', bass: 'Round Pluck Bass', lead: 'Kalimba Pluck' },
    },
    {
        name: 'Clockwork',
        blurb: 'A music box in 5/4 with bells and a ticking shaker',
        patch: {
            tonic: A, mode: MAJOR, bpm: 80, meter: '5/4', progression: 15,
            padWeights: { sustain: 10, pulse: 10, arpeggio: 80 },
            drums: drums('shaker', 0.4, 0.4),
            counter: { mode: 'answer', activity: 0.4 },
        },
        presets: { pad: 'Music Box', bass: 'Sub Bass', lead: 'Bell Lead', counter: 'Celesta' },
    },
    {
        name: 'Slow motion',
        blurb: 'Shimmer and a dark drone, very slow, sections that open and close',
        patch: {
            tonic: F, mode: LYDIAN, bpm: 52, progression: 10, barsPerChord: 4, leadActivity: 0.35, padNotes: 5,
            padWeights: { sustain: 100, pulse: 0, arpeggio: 0 },
            sections: { mode: 'strong', phrases: 2 }, sectionTone: true,
        },
        presets: { pad: 'Shimmer', bass: 'Dark Drone', lead: 'Glass Lead' },
    },
    {
        name: 'Study session',
        blurb: 'A velvet pad in minor, a steady quiet beat, nothing to distract',
        patch: {
            tonic: G, mode: AEOLIAN, bpm: 80, progression: 6, leadActivity: 0.3, padNotes: 4,
            padWeights: { sustain: 60, pulse: 40, arpeggio: 0 }, bassWeights: { whole: 60, half: 40, walking: 0 },
            drums: drums('lofi', 0.25, 0.4), swing: 0.15,
        },
        presets: { pad: 'Velvet Pad', bass: 'Warm Bass', lead: 'Soft Saw Lead' },
    },
    {
        name: 'Night drive',
        blurb: 'Pulsing analog chords in minor, a saw bass and a steady beat',
        patch: {
            tonic: D, mode: AEOLIAN, bpm: 88, progression: 8, padNotes: 4,
            padWeights: { sustain: 20, pulse: 70, arpeggio: 10 }, bassWeights: { whole: 20, half: 70, walking: 10 },
            drums: drums('lofi', 0.5, 0.6), sections: { mode: 'gentle', phrases: 4 }, sectionTone: true,
        },
        presets: { pad: 'Swelling Analog', bass: 'Analog Saw Bass', lead: 'Hollow Pulse' },
    },
    {
        name: 'Quiet-room waltz',
        blurb: 'Tine keys in 3/4, a felt bass and a clarinet, brushed lightly',
        patch: {
            tonic: F, mode: MAJOR, bpm: 76, meter: '3/4', progression: 15, padNotes: 4,
            padWeights: { sustain: 20, pulse: 30, arpeggio: 50 },
            drums: drums('brushes', 0.35, 0.6), swing: 0.3,
        },
        presets: { pad: 'Tine Keys', bass: 'Felt Bass', lead: 'Clarinet Lead' },
    },
    {
        name: 'Dorian walk',
        blurb: 'ii-V-I in Dorian: seventh chords, a walking upright bass and a flute',
        patch: {
            tonic: A, mode: DORIAN, bpm: 100, progression: 16, padNotes: 4,
            padWeights: { sustain: 30, pulse: 50, arpeggio: 20 }, bassWeights: { whole: 0, half: 20, walking: 80 },
            drums: drums('brushes', 0.6, 0.7), swing: 0.45,
        },
        presets: { pad: 'Soft Keys', bass: 'Upright Pluck', lead: 'Soft Flute' },
    },
    {
        name: 'Breathing room',
        blurb: 'Long slow sweeps over four-bar chords, a heartbeat, a whistle now and then',
        patch: {
            tonic: E, mode: AEOLIAN, bpm: 56, progression: 11, barsPerChord: 4, leadActivity: 0.3,
            padWeights: { sustain: 100, pulse: 0, arpeggio: 0 },
            drums: drums('heartbeat', 0.3, 0.4),
        },
        presets: { pad: 'Slow Sweep', bass: 'Sub Bass', lead: 'Sine Whistle' },
    },
    {
        name: 'Sunrise in seven',
        blurb: 'Major pentatonic in 7/4: a glass pad, an ocarina and a kalimba answering',
        patch: {
            tonic: G, mode: MAJOR_PENTATONIC, bpm: 84, meter: '7/4', progression: 10,
            padWeights: { sustain: 40, pulse: 20, arpeggio: 40 },
            drums: drums('shaker', 0.5, 0.6),
            counter: { mode: 'answer', activity: 0.5 },
        },
        presets: { pad: 'Glass Pad', bass: 'Rubber Bass', lead: 'Ocarina', counter: 'Kalimba Pluck' },
    },

    // ambience only
    {
        name: 'Thunderstorm',
        blurb: 'Heavy rain, rolling thunder and gusts',
        patch: bed({ rain: 0.7, thunder: 0.6, wind: 0.3 }, { rain: { intensity: 0.8 }, thunder: { frequency: 0.6, intensity: 0.7 }, wind: { gusts: 0.7 } }),
        presets: {},
    },
    {
        name: 'Beach at night',
        blurb: 'Slow waves and a light sea breeze',
        patch: bed({ waves: 0.6, wind: 0.2 }, { waves: { period: 0.7, size: 0.4 }, wind: { speed: 0.3 } }),
        presets: {},
    },
    {
        name: 'Campfire',
        blurb: 'A crackling fire, wind in the trees',
        patch: bed({ fire: 0.6, wind: 0.2 }, { fire: { crackle: 0.6 }, wind: { distance: 0.5 } }),
        presets: {},
    },
    {
        name: 'Rain on the window',
        blurb: 'Steady rain and the hiss of a record that has ended',
        patch: bed({ rain: 0.5, vinyl: 0.35 }, { rain: { intensity: 0.45, distance: 0.4 } }),
        presets: {},
    },
    {
        name: 'Windy hill',
        blurb: 'Open wind, gusting now and then',
        patch: bed({ wind: 0.6 }, { wind: { speed: 0.55, gusts: 0.6, width: 1 } }),
        presets: {},
    },
];

/** The picker's groups, in order. */
export const SCENE_GROUPS = { both: 'Music with ambience', music: 'Music only', ambience: 'Ambience only' };

/** Which group a scene is in: what it plays. */
export function sceneGroup(scene) {
    if (scene.patch.playMusic === false) return 'ambience';
    const levels = scene.patch.ambience || {};
    return Object.values(levels).some((v) => v > 0) ? 'both' : 'music';
}

/**
 * A scene's complete settings: the defaults, the scene, and `seed` (a new
 * one unless given). Volumes and mutes go back to their defaults too.
 */
export function sceneSettings(scene, seed = newSeed()) {
    const base = defaultSettings();
    // a scene names only the ambience shape it changes
    const shape = Object.fromEntries(Object.entries(base.ambienceShape)
        .map(([id, params]) => [id, { ...params, ...((scene.patch.ambienceShape || {})[id] || {}) }]));
    const merged = { ...base, ...scene.patch, ambienceShape: shape, seed };
    return sanitizeSettings(merged, base);
}
