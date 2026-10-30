// Quests and achievements.
//
// A QUEST has a name, a line saying what to do, a longer help text and one or more TASKS, each completed
// by an action (an event from questBus.js - quests detect what the person did, they are never ticked by hand).
// Quests belong to a STAGE (tourSteps.js STAGES): finishing every quest of the stage you are on levels
// you up, which unlocks the next stage and offers its tour.
//
// Adding a feature later: add a quest with `added` set to the next QUEST_VERSION and bump it. People
// whose quest list was seeded earlier (questState.js seedExisting) see only the quests newer than that,
// each with its explanation; new visitors meet it at its stage like the rest.
//
// An ACHIEVEMENT is a milestone that is noticed, not asked for; some are tests over the state.

import { SCENES, SCENE_CATEGORIES } from '../scenes';

export const QUEST_VERSION = 1;

/** Seconds of listening to a preset that count as having heard it, for the category achievements. */
export const HEARD_SECONDS = 300;

const task = (id, label, on, where, extra = {}) => ({ id, label, on, where, ...extra });
const setting = (id, label, keys, extra = {}) => task(id, label, 'setting', (e) => keys.includes(e.key), extra);

/**
 * @type {Array<{id: string, stage: number, added: number, name: string, text: string, help: string,
 *   tasks: Array<{id: string, label: string, on: string, where?: function, need?: number, show?: string}>}>}
 * `unlocks` names a feature the quest opens (questState.js isUnlocked) besides its level.
 * `name` heads the card, `text` says what to do, `help` is the longer explanation behind the ? button.
 * A task's `show` is the selector "Show me" points at, `need` how many times it must happen.
 */
export const QUESTS = [
    // ---- 0: the basics ----
    {
        id: 'first-notes', stage: 0, added: 1, name: 'First Notes',
        text: 'Start the music, then find your way around it.',
        help: 'Play and pause with the big button or the space bar. The arrows beside it move around the piece: a chord forward or back, a whole progression, or all the way to the start. The left and right arrow keys do the same.',
        tasks: [
            task('play', 'Press play', 'play', null, { show: '.gen-play' }),
            task('chord', 'Jump ahead a chord', 'step', (e) => e.unit === 'chord' && e.dir > 0, { show: '.gen-transport' }),
            task('progression', 'Jump ahead a progression', 'step', (e) => e.unit === 'progression' && e.dir > 0, { show: '.gen-transport' }),
            task('start', 'Jump back to the start', 'step', (e) => e.unit === 'start', { show: '.gen-transport' }),
        ],
    },
    {
        id: 'on-repeat', stage: 0, added: 1, name: 'On Repeat',
        text: 'Hold the music on one spot for a while.',
        help: 'The loop button has three states. Press it once to repeat the chord playing, a second time to repeat the whole progression, and a third time to let go. Looping is handy for hearing what one chord does while you change other things.',
        tasks: [
            task('loop-chord', 'Loop a chord', 'loop', (e) => e.mode === 'chord', { show: '.gen-loop' }),
            task('loop-progression', 'Loop a progression', 'loop', (e) => e.mode === 'progression', { show: '.gen-loop' }),
            task('loop-off', 'Turn looping off', 'loop', (e) => e.mode === 'off', { show: '.gen-loop' }),
        ],
    },
    {
        id: 'scenery', stage: 0, added: 1, name: 'Change of Scenery',
        text: 'Try other presets.',
        help: 'A preset is a whole soundscape: key, feel, drums, sounds and landscape together. The arrows ([ and ] on the keyboard) step through them, the dice picks one, and the name opens the full list. Give each a minute rather than clicking through.',
        tasks: [
            task('preset', 'Pick another preset', 'preset', null, { show: '.gen-scene-nav' }),
            task('heard', 'Listen to three presets for half a minute each', 'preset-heard', null, { need: 3, show: '.gen-scene-nav' }),
        ],
    },
    {
        id: 'landscaper', stage: 0, added: 1, name: 'Landscaper',
        text: 'Make the landscape behind the music your own.',
        help: 'Open the look menu (the palette button) and choose Landscape: its options appear. Kind is the place, Weather the sky, Time of day how fast the day passes (or fix an hour) and Season how the year turns. Each preset brings its own, but you can set them by hand.',
        tasks: [
            task('kind', 'Pick a different landscape', 'scenery', (e) => e.keys.includes('biome'), { show: '.gen-visual' }),
            task('weather', 'Change the weather', 'scenery', (e) => e.keys.includes('weather'), { show: '.gen-visual' }),
            task('time', 'Set the time of day', 'scenery', (e) => e.keys.some((k) => ['time', 'hour'].includes(k)), { show: '.gen-visual' }),
            task('season', 'Pick the season', 'scenery', (e) => e.keys.some((k) => ['season', 'year'].includes(k)), { show: '.gen-visual' }),
        ],
    },

    // ---- 1: voices and ambience ----
    {
        id: 'volume-knob', stage: 1, added: 1, name: 'Volume Knob',
        text: 'Turn the voices up and down to hear what each adds.',
        help: 'Each voice has its own panel below the timeline, with a Volume slider. Drag it up to hear the voice more and down to tuck it away. The preset you chose set the starting balance; from here it is yours to change.',
        tasks: [
            task('up', "Turn a voice's volume up", 'volume', (e) => e.dir > 0, { show: '[data-tour="voice-lead"]' }),
            task('down', "Turn a voice's volume down", 'volume', (e) => e.dir < 0, { show: '[data-tour="voice-lead"]' }),
        ],
    },
    {
        id: 'voice-controls', stage: 1, added: 1, name: 'Voice Controls',
        text: 'Take voices out, listen to one alone, then put everything back.',
        help: 'Each voice row has M and S buttons. M mutes a voice so you hear the music without it: the quickest way to learn what the bass or the pad adds. S solos it, so only that voice plays. Press either again to undo it.',
        tasks: [
            task('mute', 'Mute a voice', 'mute', (e) => e.on, { show: '.gen-tracks' }),
            task('solo', 'Play one voice alone', 'solo', (e) => e.on, { show: '.gen-tracks' }),
            task('unmute', 'Unmute it', 'mute', (e) => !e.on, { show: '.gen-tracks' }),
            task('unsolo', 'Take it off solo', 'solo', (e) => !e.on, { show: '.gen-tracks' }),
        ],
    },
    {
        id: 'hands-on', stage: 1, added: 1, name: 'Hands On',
        text: 'Play along with the music yourself, on each voice in turn.',
        help: 'The ⌨ button on a voice lets you play it. A small piano pops up at the bottom of the page: tap its keys (or press the A S D F row on a computer keyboard, or a MIDI keyboard) and the voice plays your notes over the music, in its own sound. Z and X change the octave. Press ⌨ again, or close the piano, to stop. Try it on the lead for a melody, the rhythm for chords and the bass for the low notes.',
        tasks: [
            task('lead', 'Play the lead', 'liveplay', (e) => e.role === 'lead', { show: '.gen-track-lead' }),
            task('pad', 'Play the rhythm', 'liveplay', (e) => e.role === 'pad', { show: '.gen-track-pad' }),
            task('bass', 'Play the bass', 'liveplay', (e) => e.role === 'bass', { show: '.gen-track-bass' }),
        ],
    },
    {
        id: 'new-voices', stage: 1, added: 1, name: 'New Voices',
        text: 'Give the rhythm, the lead and the bass new sounds.',
        help: 'The quick way is the dice on a voice: it picks a good sound for that voice at random, and you can keep rolling until you like it. Clicking the voice itself opens the whole list of sounds, which is a lot to look through; it is there when you want to hunt for something specific, and its arrow keys step through it. Whichever you use, the new sound starts at the next bar. If you wander too far, the ↶ at the top right of the Preset field in a voice panel takes it straight back to the sound the preset gave it.',
        tasks: [
            task('pad', 'Change the rhythm sound', 'sound', (e) => e.role === 'pad', { show: '.gen-track-pad' }),
            task('lead', 'Change the lead sound', 'sound', (e) => e.role === 'lead', { show: '.gen-track-lead' }),
            task('bass', 'Change the bass sound', 'sound', (e) => e.role === 'bass', { show: '.gen-track-bass' }),
            task('dice', "Roll a voice's dice three times", 'dice', null, { need: 3, show: '.gen-tracks' }),
            task('reset', 'Return a voice to its preset sound', 'voice-reset', null, { show: '.gen-field-reset' }),
        ],
    },
    {
        id: 'mixing-desk', stage: 2, added: 1, name: 'Weather Report',
        text: 'Add some weather under the music.',
        help: 'Ambience is a bed of rain, wind and waves under the music, or on its own: turn a layer up to start it, and use the music and ambience buttons by play to choose which one plays.',
        tasks: [
            setting('ambience', 'Turn an ambience layer up', ['ambience', 'playAmbience'], { show: '[data-tour="ambience"]' }),
        ],
    },
    {
        id: 'play-along', stage: 4, added: 1, name: 'Play Along',
        text: 'Watch a voice being played, note by note.',
        help: 'The piano, guitar and bass buttons under the timeline open a keyboard or fretboard that shows exactly which notes are being played, so you can follow on a real instrument.',
        tasks: [task('pattern', 'Open a piano, guitar or bass block', 'pattern', (e) => e.on, { show: '.gen-tracks' })],
    },

    // ---- 2: music ----
    {
        id: 'key-and-scale', stage: 3, added: 1, name: 'Key & Scale', unlocks: 'fluid',
        text: 'Change where the music sits and what mood it has. Finishing this unlocks the Fluid background, whose colours follow the harmony.',
        help: 'The key sets how high or low everything sits. The scale sets the mood: major is bright, minor is sad, Dorian warm, Lydian dreamy. Beyond the seven modes of the major scale are harmonic and melodic minor and their relatives, which sound more exotic. Everything changes live while it plays.',
        tasks: [
            setting('key', 'Change the key', ['tonic'], { show: '[data-tour="music-key"]' }),
            setting('scale', 'Pick a different scale', ['mode'], { show: '[data-tour="music-key"]' }),
            task('rare', 'Try a scale outside the major family', 'setting', (e) => e.key === 'mode' && typeof e.value === 'string' && !e.value.startsWith('Major-'), { show: '[data-tour="music-key"]' }),
        ],
    },
    {
        id: 'time-and-chords', stage: 3, added: 1, name: 'Time & Chords',
        text: 'Change the speed, the pulse and the chords.',
        help: 'The tempo sets how fast it moves. The time signature changes the pulse: 3/4 and 6/8 sway, 4/4 is steady. The progression is the chord pattern that repeats; pick another from the list or press the dice.',
        tasks: [
            setting('tempo', 'Change the tempo', ['bpm'], { show: '[data-tour="music-tempo"]' }),
            setting('meter', 'Change the time signature', ['meter'], { show: '[data-tour="music-tempo"]' }),
            setting('progression', 'Pick another chord progression', ['progression', 'progressionMode'], { show: '[data-tour="music-progression"]' }),
        ],
    },

    // ---- 3: instruments ----
    {
        id: 'liquid-light', stage: 4, added: 1, name: 'Liquid Light',
        text: 'Swap the landscape for a fluid that moves with the sound.',
        help: 'Fluid is a flowing background the notes stir: short notes make small fast jets, held notes broad plumes, and the colours follow the harmony. Its options sit in the look menu when it is chosen: colours, flow look, quality for slower machines, jet direction and how long trails linger.',
        tasks: [
            task('fluid', 'Choose the Fluid background', 'backdrop', (e) => e.mode === 'fluid', { show: '.gen-visual' }),
            task('fluid-options', 'Change a fluid setting or its colours', 'fluid-option', null, { show: '.gen-visual' }),
        ],
    },
    {
        id: 'instrument-maker', stage: 4, added: 1, name: 'Instrument Maker',
        text: 'Invent a sound, then look inside one.',
        help: "The sparkle button on a voice invents a brand new sound for it: press it a few times and keep what you like. The pencil opens the voice's synth on faders, with its effects; while it is open your computer or MIDI keyboard plays that voice.",
        tasks: [
            task('new-sound', 'Make a new sound', 'newsound', null, { show: '.gen-tracks' }),
            task('editor', "Open a voice's synth", 'editor', null, { show: '.gen-rolebuttons button[title="Edit sound"]' }),
        ],
    },
    {
        id: 'on-the-beat', stage: 4, added: 1, name: 'On the Beat',
        text: 'Change the drums, or program your own beat.',
        help: 'The percussion panel picks the drum style and shapes the kit. The step sequencer replaces the generated drums with a beat you program, one pattern per chord, played on drum machine sounds.',
        tasks: [
            setting('drums', 'Change the drums', ['drums'], { show: '[data-tour="percussion"]' }),
            task('sequencer', 'Switch on the step sequencer', 'setting', (e) => e.key === 'sequencer' && e.value?.on === true, { show: '.gen-sequencer' }),
        ],
    },

    // ---- 4: composition ----
    {
        id: 'rule-book', stage: 5, added: 1, name: 'The Rule Book',
        text: 'Change how the music is written.',
        help: 'Rules decide how the music is composed: how the lead moves, how voices answer each other, how sections build. Open a page of the rulebook and move something. Rules apply to the music coming up, so a phrase already playing finishes first.',
        tasks: [task('rules', 'Change three rules', 'rule', null, { need: 3, show: '[data-tour="rulebook"]' })],
    },
    {
        id: 'long-view', stage: 5, added: 1, name: 'The Long View',
        text: 'Shape the piece over minutes, not bars.',
        help: 'Sections give the piece an intro, a build, a full middle and a breakdown. The arc shapes the energy over a longer stretch. Change either to hear the music take a longer breath.',
        tasks: [setting('sections', 'Change the sections or the arc', ['sections', 'arc'], { show: '[data-tour="rulebook"]' })],
    },

    // ---- 5: evolution ----
    {
        id: 'drift-away', stage: 6, added: 1, name: 'Drift Away',
        text: 'Let the music wander off on its own.',
        help: 'Evolution lets the key and mode move over time, either around your settings (it keeps coming back) or freely. You choose which keys and modes it may visit.',
        tasks: [setting('drift', 'Change the evolution mode', ['drift'], { show: '[data-tour="evolution"]' })],
    },

    // ---- 6: feel ----
    {
        id: 'feel', stage: 7, added: 1, name: 'Feel the Room',
        text: 'Set how busy, bright and restless the music is.',
        help: 'The feel pad is one point in a diamond: left is calmer and right is busier, down is darker and up is brighter. Wander is a slower drift: each voice glides left and right while its volume, filter and pitch breathe.',
        tasks: [
            task('feel', 'Move the feel pad', 'feel', null, { show: '[data-tour="quick"]' }),
            setting('wander', 'Set the sound wandering', ['wander'], { show: '[data-tour="wander"]' }),
        ],
    },
    {
        id: 'hero-mode', stage: 4, added: 1, name: 'Hero Mode',
        text: 'Play the music yourself, game-style.',
        help: 'Open the piano, guitar or bass block and press its hero button. A window shows the notes arriving towards you like a rhythm game, fingered so a hand can actually play them. Keys held on a MIDI keyboard light up too.',
        tasks: [task('hero', 'Open hero view', 'hero', null, { show: '.gen-tracks' })],
    },

    // ---- 7: randomize ----
    {
        id: 'roll-the-dice', stage: 8, added: 1, name: 'Roll the Dice',
        text: 'Let chance rewrite the music, then share what you find.',
        help: 'The randomize buttons roll the dice on one area at a time, or make a new variation of the same settings. When something sounds good, the ⚙ menu copies a link to exactly what you hear; whoever opens it gets the same music.',
        tasks: [
            task('randomize', 'Randomize something', 'randomize', null, { show: '.gen-randomize' }),
            task('share', 'Copy a link to your music', 'share', null, { show: '.gen-header-tools' }),
        ],
    },
];

export const QUEST_BY_ID = new Map(QUESTS.map((q) => [q.id, q]));

const HOUR = 3600 * 1000;
const heardAll = (state, category) => {
    const names = SCENES.filter((s) => s.category === category && !s.hidden).map((s) => s.name);
    return names.length > 0 && names.every((n) => (state.heard[n] ?? 0) >= HEARD_SECONDS);
};

/**
 * Milestones. `test(state)` is checked after every change; the first time it passes it is awarded.
 * Each has a title and a line saying what earned it.
 */
export const ACHIEVEMENTS = [
    { id: 'first-play', title: 'First notes', text: 'Pressed play for the first time.', test: (s) => s.counts.play >= 1 },
    { id: 'first-preset', title: 'Changing the scenery', text: 'Picked a different preset.', test: (s) => s.counts.preset >= 1 },
    { id: 'presets-10', title: 'Browser', text: 'Tried ten different presets.', test: (s) => s.seen.presets.length >= 10 },
    { id: 'presets-50', title: 'Collector', text: 'Tried fifty different presets.', test: (s) => s.seen.presets.length >= 50 },
    { id: 'scales-5', title: 'Mode explorer', text: 'Played in five different scales.', test: (s) => s.seen.scales.length >= 5 },
    { id: 'first-mute', title: 'Taking one out', text: 'Muted a voice.', test: (s) => s.counts.mute >= 1 },
    { id: 'first-sound', title: 'Sound designer', text: 'Made a brand new sound.', test: (s) => s.counts.newsound >= 1 },
    { id: 'first-share', title: 'Pass it on', text: 'Copied a link to your music.', test: (s) => s.counts.share >= 1 },
    { id: 'listen-10m', title: 'Settling in', text: 'Listened for ten minutes.', test: (s) => s.listenMs >= 10 * 60 * 1000 },
    { id: 'listen-1h', title: 'In the zone', text: 'Listened for an hour.', test: (s) => s.listenMs >= HOUR },
    { id: 'listen-10h', title: 'Regular', text: 'Listened for ten hours.', test: (s) => s.listenMs >= 10 * HOUR },
    { id: 'listen-100h', title: 'Part of the furniture', text: 'Listened for a hundred hours.', test: (s) => s.listenMs >= 100 * HOUR },
    { id: 'days-3', title: 'Back again', text: 'Listened on three different days.', test: (s) => s.days.length >= 3 },
    { id: 'days-14', title: 'A habit', text: 'Listened on fourteen different days.', test: (s) => s.days.length >= 14 },
    { id: 'all-levels', title: 'Everything unlocked', text: 'Reached the last level.', test: (s, stage, last) => stage >= last },
    // one per category of presets: every preset in it heard for five minutes
    ...SCENE_CATEGORIES.map((c) => ({
        id: `heard-${c.id}`,
        title: `${c.label}, all of it`,
        text: `Listened to every preset in ${c.label} for at least ${HEARD_SECONDS / 60} minutes.`,
        test: (s) => heardAll(s, c.id),
    })),
];
