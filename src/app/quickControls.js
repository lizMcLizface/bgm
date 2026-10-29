// The quick panel (QuickPanel.jsx): the settings most worth reaching for without opening the
// rulebook - the mix, the feel sliders, where the chord root goes - and four-step stacks
// (off / low / med / high) that move several linked settings together. Pure data and helpers.

const get = (settings, path) => path.split('.').reduce((o, k) => o?.[k], settings);
// The top-level patch that sets a path (key, key.sub, key.sub.sub) to a value, copying what is around it.
const setIn = (object, keys, value) => (keys.length ? { ...object, [keys[0]]: setIn(object?.[keys[0]], keys.slice(1), value) } : value);
export const mergePatches = (settings, entries) => entries.reduce((patch, [path, value]) => {
    const keys = path.split('.');
    return { ...patch, [keys[0]]: setIn(patch[keys[0]] ?? settings[keys[0]], keys.slice(1), value) };
}, {});
const patchFor = (settings, path, value) => mergePatches(settings, [[path, value]]);

/** Vertical sliders for what plays: the voices' volumes, then the ambience bed. */
export const MIX_SLIDERS = [
    { id: 'lead', label: 'Lead', role: 'lead' },
    { id: 'counter', label: 'Lead 2', role: 'counter', off: (s) => s.counter?.mode === 'off', offTitle: 'There is no second lead: choose what it does under Second lead' },
    { id: 'pad', label: 'Pad', role: 'pad' },
    { id: 'bass', label: 'Bass', role: 'bass' },
    { id: 'perc', label: 'Drums', role: 'perc', off: (s) => s.drums?.style === 'off', offTitle: 'The drums are off' },
    { id: 'ambience', label: 'Ambience', path: 'ambienceVolume', title: 'The whole ambience bed against the music' },
];

/** Vertical sliders for how it plays (calmer / busier and darker / brighter are the feel pad's, beside them). `path` is a settings key, or key.sub inside an object. */
export const FEEL_SLIDERS = [
    { id: 'swing', label: 'Swing', path: 'swing', min: 0, max: 0.6, step: 0.02, title: 'Straight to swung off-beats' },
    { id: 'loose', label: 'Loose', path: 'humanize.timing', min: 0, max: 40, step: 1, title: 'How far notes drift from the grid, in milliseconds' },
    { id: 'offbeat', label: 'Offbeat', path: 'leadSyncopation', min: 0, max: 1, step: 0.05, title: 'How often the lead and bass push half a beat early' },
    { id: 'density', label: 'Density', path: 'leadDensity', min: 0, max: 1, step: 0.05, title: 'How busy the lead rhythms are' },
    { id: 'ornaments', label: 'Ornaments', path: 'ornaments', min: 0, max: 1, step: 0.05, title: 'Grace notes, mordents, turns and trills on the leads' },
    { id: 'rubato', label: 'Rubato', path: 'rubato', min: 0, max: 1, step: 0.05, title: 'Slowing into phrase ends and section changes' },
    { id: 'dynamics', label: 'Dynamics', path: 'dynamics.range', min: 0, max: 2, step: 0.05, title: 'The spread between soft and strong playing' },
    { id: 'space', label: 'Space', path: 'sectionSpace', min: 0, max: 1, step: 0.05, title: 'A wider room in intros and breakdowns' },
];

const same = (a, b) => (typeof b === 'number' ? Math.abs(a - b) < 0.02 : a === b);
const one = (id, label, path, title, choices) => ({
    id, label, title, choices: choices.map(([value, text, hint]) => ({ value, label: text, title: hint, set: [[path, value]] })),
});

/**
 * Groups of choices: each pill sets one or several settings (`set`, which also says when it is the one in
 * place; `also` is set with them but does not count), and the group's Preset puts them all back to the preset's.
 */
export const CHOICE_GROUPS = [
    one('root', 'Root', 'padRoot', 'Where the chord root is played', [
        ['always', 'Both', 'The pad plays the chord root as well as the bass'],
        ['unlessBass', 'Bass', 'The root is left to the bass; the pad keeps its other notes'],
        ['never', 'None', 'The pad never plays the chord root'],
    ]),
    one('chords', 'Size', 'padNotes', 'How many notes the rhythm voice\'s chords have', [
        [3, 'Triad', 'Three notes'],
        [4, '7ths', 'Four notes'],
        [5, '9ths', 'Five notes'],
    ]),
    {
        id: 'colour', label: 'Colour', title: 'What the chords are made of beyond the scale',
        choices: [
            { value: 'scale', label: 'Scale', title: 'Plain chords from the scale', set: [['chordBorrow', 0], ['chordColour.mode', 'plain']] },
            { value: 'borrowed', label: 'Borrow', title: 'Some chords come from the parallel mode', set: [['chordBorrow', 0.3], ['chordColour.mode', 'plain']] },
            { value: 'suspended', label: 'Sus', title: 'Suspended chords that do not settle into major or minor', set: [['chordBorrow', 0], ['chordColour.mode', 'floating']], also: [['chordColour.amount', 0.45]] },
            { value: 'add9', label: '+9', title: 'A ninth added to some chords', set: [['chordBorrow', 0], ['chordColour.mode', 'add9']], also: [['chordColour.amount', 0.4]] },
            { value: 'add6', label: '+6', title: 'A sixth added to some chords', set: [['chordBorrow', 0], ['chordColour.mode', 'add6']], also: [['chordColour.amount', 0.4]] },
        ],
    },
    one('counter', 'Second lead', 'counter.mode', 'What the second lead does', [
        ['off', 'Off', 'No second lead'],
        ['answer', 'Answer', 'It answers the lead'],
        ['harmony', 'Harm', 'It harmonises with the lead'],
        ['line', 'Line', 'Its own line, always'],
    ]),
];

/** The choice of a group whose settings are in place, or undefined. */
export const choiceAt = (settings, group) => group.choices.find(({ set }) => set.every(([path, value]) => same(get(settings, path), value)))?.value;
/** The settings paths a group moves (for its Preset). */
export const choicePaths = (group) => [...new Set(group.choices.flatMap(({ set, also = [] }) => [...set, ...also].map(([path]) => path)))];
/** The patch for picking one of a group's choices. */
export const choicePatch = (settings, group, value) => {
    const { set, also = [] } = group.choices.find((choice) => choice.value === value);
    return mergePatches(settings, [...set, ...also]);
};

export const LEVELS = ['Off', 'Low', 'Med', 'High'];

/** Stacks of linked settings: one button per level sets them all. Off is how the defaults are. */
export const STACKS = [
    {
        id: 'flair', label: 'Flair', title: 'Ornaments, rubato and slow colour movement in the sounds',
        levels: [
            [['ornaments', 0], ['rubato', 0], ['padVibrato', 0], ['timbreDrift', 0]],
            [['ornaments', 0.25], ['rubato', 0.2], ['padVibrato', 0.3], ['timbreDrift', 0.2]],
            [['ornaments', 0.5], ['rubato', 0.4], ['padVibrato', 0.5], ['timbreDrift', 0.4]],
            [['ornaments', 0.8], ['rubato', 0.7], ['padVibrato', 0.8], ['timbreDrift', 0.6]],
        ],
    },
    {
        id: 'groove', label: 'Groove', title: 'Swing, offbeat pushes, loose timing and Euclidean bass figures',
        levels: [
            [['swing', 0], ['leadSyncopation', 0], ['humanize.timing', 12], ['bassEuclid', 0]],
            [['swing', 0.1], ['leadSyncopation', 0.15], ['humanize.timing', 16], ['bassEuclid', 0.15]],
            [['swing', 0.25], ['leadSyncopation', 0.3], ['humanize.timing', 20], ['bassEuclid', 0.3]],
            [['swing', 0.4], ['leadSyncopation', 0.5], ['humanize.timing', 26], ['bassEuclid', 0.5]],
        ],
    },
    {
        // Low is how the defaults have it (gentle, on for the melodic voices)
        id: 'drift', label: 'Drift', title: 'How far the voices wander in pan, volume, tone and pitch over a minute or so', defaultLevel: 1,
        levels: [
            [['wander.pan.min', 0], ['wander.pan.max', 0], ['wander.volume', 0], ['wander.filter', 0], ['wander.pitch', 0]],
            [['wander.pan.min', -0.6], ['wander.pan.max', 0.6], ['wander.volume', 0.12], ['wander.filter', 0.35], ['wander.pitch', 5]],
            [['wander.pan.min', -0.8], ['wander.pan.max', 0.8], ['wander.volume', 0.25], ['wander.filter', 0.8], ['wander.pitch', 10]],
            [['wander.pan.min', -1], ['wander.pan.max', 1], ['wander.volume', 0.4], ['wander.filter', 1.4], ['wander.pitch', 18]],
        ],
    },
    {
        id: 'depth', label: 'Depth', title: 'Room in the quiet parts, ducking under the melody and even loudness',
        levels: [
            [['sectionSpace', 0], ['ducking', 0], ['evenLoudness', 0]],
            [['sectionSpace', 0.25], ['ducking', 0.2], ['evenLoudness', 0.2]],
            [['sectionSpace', 0.5], ['ducking', 0.4], ['evenLoudness', 0.4]],
            [['sectionSpace', 0.8], ['ducking', 0.65], ['evenLoudness', 0.7]],
        ],
    },
];

export const readValue = (settings, path) => get(settings, path);
export const sliderPatch = (settings, path, value) => patchFor(settings, path, value);

/** The stack's level whose settings are all in place, or -1 when they have been set another way. */
export function stackLevel(settings, stack) {
    return stack.levels.findIndex((entries) => entries.every(([path, value]) => (typeof value === 'string' ? get(settings, path) === value : Math.abs((get(settings, path) ?? 0) - value) < 0.02)));
}

/** The settings patch for one level of a stack. */
export const stackPatch = (settings, stack, level) => mergePatches(settings, stack.levels[level]);

// Every settings key the panel can change, so Reset puts exactly those back.
const KEYS = new Set([
    ...FEEL_SLIDERS.map((s) => s.path.split('.')[0]),
    ...STACKS.flatMap((stack) => stack.levels.flat().map(([path]) => path.split('.')[0])),
    ...CHOICE_GROUPS.flatMap((group) => choicePaths(group).map((path) => path.split('.')[0])), 'volumes', 'ambienceVolume',
]);
export const QUICK_KEYS = [...KEYS];

/** The panel's settings out of a whole settings object (a preset's, at Reset). */
export const quickSettings = (settings) => Object.fromEntries(QUICK_KEYS.filter((key) => key in settings).map((key) => [key, structuredClone(settings[key])]));

/** The settings paths a stack moves. */
export const stackPaths = (stack) => stack.levels[0].map(([path]) => path);

/** Whether the settings have these paths as the preset's (`base`: the preset's quickSettings) has them. */
export const matchesPreset = (settings, base, paths) => paths.every((path) => {
    const mine = get(settings, path), theirs = get(base, path);
    return typeof mine === 'number' && typeof theirs === 'number' ? Math.abs(mine - theirs) < 0.005 : mine === theirs;
});

/** The patch that puts these paths back to the preset's values. */
export const presetPatch = (settings, base, paths) => mergePatches(settings, paths.map((path) => [path, get(base, path)]));
