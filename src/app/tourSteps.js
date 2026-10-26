// The guided tour (Tour.jsx): the page's sections in the order a newcomer
// meets them. A step with a `selector` frames that part of the page; one
// without is a centred card. Steps whose part isn't on the page right now
// are skipped.
//
// The page unlocks in STAGES, one set of features at a time. Each step
// belongs to a `stage`; a stage's tour covers just its own steps. A step
// with `hint` closes the tour only when its stage is the last one shown.

/**
 * localStorage key: set once the tour has been finished or skipped, so it only opens by itself the first time.
 * The key changed with the staged tour (the old one was 'bgm-tour-done'), so people who finished the
 * single tour are asked again and can choose to unlock everything.
 */
export const TOUR_KEY = 'bgm-tour-v2';
/**
 * localStorage key: how many stages are unlocked (an index into STAGES). Versioned with TOUR_KEY: an
 * earlier build stored 'bgm-stage' as everything-unlocked for people who had seen the single tour.
 */
export const STAGE_KEY = 'bgm-stage-v2';

/** The stages, in the order they unlock. `name` labels the top-bar button that unlocks it. */
export const STAGES = [
    { id: 'basics', name: 'The basics' },
    { id: 'ambience', name: 'Voices & ambience' },
    { id: 'music', name: 'Music' },
    { id: 'instruments', name: 'Instruments & playing rules' },
    { id: 'arrangement', name: 'Composition rules' },
    { id: 'evolution', name: 'Evolution' },
    { id: 'feel', name: 'Harmony, feel & wander' },
    { id: 'randomize', name: 'Randomize' },
];
export const LAST_STAGE = STAGES.length - 1;

export const TOUR_STEPS = [
    // ---- 0: the basics ----
    {
        id: 'welcome',
        stage: 0,
        selector: null,
        title: 'Welcome to bgm',
        text: 'Calm music that writes itself, for working or studying - or under a video or podcast. Start with play, presets and the background: a pixel landscape, or a fluid that reacts to the sound. This short tour covers them; more unlocks whenever you are ready.',
    },
    {
        id: 'transport',
        stage: 0,
        selector: '.gen-transport',
        title: 'Play and move around',
        text: 'Play or pause (Space does too). The other buttons go back to the start, to the previous progression or chord, forward a chord or a progression, and loop the chord or progression that is playing.',
    },
    {
        id: 'fluid',
        stage: 0,
        selector: '.gen-visual',
        title: 'Music in motion',
        text: 'Pick a background here. Fluid follows the music: press Play and short notes make small, fast jets, held notes make broader plumes, and colours follow the harmony and mood; ambient sounds add their own motion too. Landscape is a pixel scene whose light follows the clock, its season the calendar, with weather that drifts on its own. Hide the interface with the arrow beside it for a clearer view.',
    },
    {
        id: 'scene',
        stage: 0,
        selector: '.gen-scene',
        title: 'Presets',
        text: 'A whole soundscape in one pick: key, scale, feel, drums, ambience and sounds together. Start here - open the list, try a few, and keep the one you like. [ and ] step through them from the keyboard.',
    },
    {
        id: 'timeline',
        stage: 0,
        selector: '.gen-timeline',
        title: 'The timeline',
        text: 'The chords being played and, in a row per voice, the notes each voice plays. The music is planned a few bars ahead, so what you see is what you will hear. Hover a chord for its recorded explanation, or click/tap to keep it open. Escape or × closes it. Explore this rule takes you to the matching card in the book.',
    },
    {
        id: 'tools',
        stage: 0,
        selector: '.gen-header-tools',
        title: 'Volume, look and options',
        text: 'The master volume and the look menu (theme and the background). The speaker button shows how hard the audio engine is working - if the sound crackles, open it for a bigger buffer or a lighter reverb. The ⚙ menu copies a link to the music, sets a sleep timer, saves a WAV file, repeats this tour and can start over with only the basics.',
    },
    {
        id: 'rulebook', stage: 0, selector: '[data-tour="rulebook"]', title: 'Explore the rules',
        text: 'Open the rulebook to see three rows: instrument rules for how each voice plays, harmonic rules for chord colour and bass pedals, and composition rules for phrases, dialogue and sections. A + reveals a page’s controls; every preset can use those rules from the start.',
    },
    {
        id: 'unlock',
        stage: 0,
        hint: true,
        selector: '.gen-unlock',
        title: 'That is the basics',
        text: 'Press Play and leave it running. When you want more, press this button: it unlocks the next set of features and shows you around them, one set at a time. The ⚙ menu repeats a tour whenever you like.',
    },

    // ---- 1: voices and ambience ----
    {
        id: 'tracks',
        stage: 1,
        selector: '.gen-tracks',
        title: 'Voices',
        text: 'One row per voice. Click a voice to choose its sound. M mutes it, S solos it, ⌨ lets you play it from the computer keyboard or a MIDI keyboard, and the dice picks a random preset for it. Try muting the bass, or the pad, to hear what each adds. The volume of each is in its panel further down.',
    },
    {
        id: 'voice-basics',
        stage: 1,
        selector: '[data-tour="voice-lead"]',
        title: 'Shape each voice',
        text: 'Each voice now has a panel for its sound and volume. Try another preset, or roll its dice. The compact controls beside the timeline let you mute, solo or play a voice. Sound design and the synths behind each voice unlock later.',
    },
    {
        id: 'ambience-intro',
        stage: 1,
        selector: '.gen-parts',
        title: 'Music and ambience',
        text: 'Choose what Play starts: the music, the ambient bed (rain, wind, waves and the like), or both. Either one can play alone - try switching Music off for just the rain.',
    },
    {
        id: 'ambience',
        stage: 1,
        selector: '[data-tour="ambience"]',
        title: 'Vibe',
        text: 'Mix rain, thunder and waves beneath the music or listen to weather alone. Each source has its own presets and settings: try Open rain, then add Distant rolls. Wind, fireplace and vinyl have their own levels too; shape those under More options when enabled.',
    },

    {
        id: 'ambient-dynamics', stage: 1, rulePage: 'ambient-dynamics', selector: '#group-ambient-drift-period', title: 'Let the ambient bed breathe',
        text: 'Ambient dynamics lives in the instrument row of the rulebook. Set whole-bed and individual-layer level drift, movement and speed. The ambience mixer stays outside the book. Source can follow the preset or keep your own choice; Reset restores that group without touching the others.',
    },

    // ---- 2: music ----
    {
        id: 'music-intro',
        stage: 2,
        selector: '[data-tour="music"]',
        title: 'Music',
        text: 'Here is what the music is made of. Everything changes live while it plays, so try each control as we go. Each has its own dice for a random pick.',
    },
    {
        id: 'music-key',
        stage: 2,
        selector: '[data-tour="music-key"]',
        title: 'Try it: key and scale',
        text: 'The key sets how high or low everything sits. The scale sets the mood: major is bright, minor is sad, Dorian warm, Lydian dreamy. Pick another of each and listen - the whole piece moves there.',
    },
    {
        id: 'music-progression',
        stage: 2,
        selector: '[data-tour="music-progression"]',
        title: 'Try it: progressions',
        text: 'The progression is the chord pattern that repeats. Change how many chords it has, then pick another from the list - or press the dice and hear what you get. "Bars per chord" slows the changes down. The ← → keys step through the chords while you listen, Shift+← → through whole progressions.',
    },
    {
        id: 'music-tempo',
        stage: 2,
        selector: '[data-tour="music-tempo"]',
        title: 'Try it: time and tempo',
        text: 'Drag the tempo down for something sleepier, up for something that moves. The time signature changes the pulse: 3/4 and 6/8 sway, 4/4 is steady.',
    },
    {
        id: 'music-now',
        stage: 2,
        selector: '.gen-nowplaying',
        title: 'What is playing right now',
        text: 'Later, evolution can make the music drift away from your settings. This line shows what is playing at this moment, and "Keep this" makes it your new home.',
    },

    // ---- 3: instruments ----
    {
        id: 'instruments-intro',
        stage: 3,
        selector: '.gen-tracks',
        title: 'Making your own sounds',
        text: 'Each voice now has two more buttons: ✎ opens its sound in a window, and ✦ makes a brand new sound for it. Press ✦ a few times and keep what you like.',
    },
    {
        id: 'sounds',
        stage: 3,
        selector: '.gen-sounds',
        title: 'New sounds',
        text: 'Gives every voice a new sound at once, all sharing one character. The same phrase always makes the same sounds, so a phrase you like can be typed in again.',
    },
    {
        id: 'voice-lead',
        stage: 3,
        selector: '[data-tour="voice-lead"]',
        title: 'More about a voice',
        text: 'Each voice panel has a "Kind of new sound" for its ✦ button. Register and playing choices now live in the rulebook: Lead style, Rhythm / pad and Bass / support each have their own instrument page.',
    },
    {
        id: 'percussion',
        stage: 3,
        selector: '[data-tour="percussion"]',
        title: 'Percussion',
        text: 'This panel shapes and mixes the drum kit. Its patterns live in the rulebook’s Percussion patterns page: choose a style, ornaments, variation and occasional colour accents. Hear the kit auditions its sound.',
    },
    {
        id: 'pad-rules', stage: 3, rulePage: 'pad', selector: '#group-pad-styles', title: 'Rhythm / pad playing rules',
        text: 'This voice has its own page for chord size, register, styles, patterns and movement. Style weights are relative shares of phrases. Zero excludes a choice if another has weight; all zero gives equal shares. A slider or dice edit becomes Your choices; Follow preset or Reset restores that group.',
    },
    {
        id: 'bass-rules', stage: 3, rulePage: 'bass', selector: '#group-bass-styles', title: 'Bass playing rules',
        text: 'Choose held, beat-group, walking or driving bass phrases here, independently of its sound and volume. Register has its own group. Resetting styles does not reset register, other voices or harmonic pedal rules.',
    },
    {
        id: 'percussion-rules', stage: 3, rulePage: 'percussion', selector: '#rule-percussion-presence', title: 'Percussion patterns',
        text: 'Choose the drum style and its ornaments, variation and colour accents. Zero ornament activity keeps the groove’s anchors; switch the style off to stop generating drums. Kit design, audition and volume stay in the percussion sound panel.',
    },
    {
        id: 'editor',
        stage: 3,
        selector: '.gen-rolebuttons button[title="Edit sound"]',
        title: 'The synth behind a voice',
        text: '✎ opens a voice’s sound: the calmbgm synth on faders, DIY Poly and FM, or one of the classic synths, with its effects. While it is open your keyboard and MIDI play that voice, and the arrow keys step through sounds (← →) and categories (↑ ↓). Save, export and import presets there too.',
    },

    // ---- 4: arrangement ----
    {
        id: 'arrangement',
        stage: 4, rulePage: 'melodic-composition',
        selector: '#rule-motif-development',
        title: 'Composition rules',
        text: 'Open the rulebook. Instrument rules choose lead activity and backing styles. Composition pages shape melodic development, voice dialogue, shared rhythm and the long view, including sections and whether they change the tone.',
    },

    {
        id: 'duet-rules', stage: 4, rulePage: 'duet', selector: '#rule-duet-dialogue', title: 'A conversation between voices',
        text: 'Voice dialogue coordinates the lead and an independent second lead. Enabling a rule never silently enables a missing voice: the card explains prerequisites and keeps your permission for when they are met. A mute affects what you hear, not the voice’s generation.',
    },
    {
        id: 'section-rules', stage: 4, rulePage: 'form', selector: '#rule-sections', title: 'The long view',
        text: 'Sections, tension, harmonic pacing, transitions and endings shape the longer piece here. Sections change the tone is a separate rule; length has its own preset source and reset. Rules apply to upcoming music, allowing a phrase already in progress to finish.',
    },

    // ---- 5: evolution ----
    {
        id: 'evolution',
        stage: 5,
        selector: '[data-tour="evolution"]',
        title: 'Evolution',
        text: 'How the music drifts over time. "Centered on my settings" drifts around them and keeps coming back; Wandering is a free walk. Choose which keys and modes it may visit, and under More options how often it changes.',
    },

    // ---- 6: colour, feel and wander ----
    {
        id: 'feel',
        stage: 6, rulePage: 'performance',
        selector: '#rule-human-timing',
        title: 'Feel',
        text: 'Open Playing feel under Instrument rules for swing, timing, dynamics and individual-note tuning. Slow continuous movement stays in the separate Wander panel.',
    },
    {
        id: 'wander',
        stage: 6,
        selector: '[data-tour="wander"]',
        title: 'Wander',
        text: 'Slow drift, about a minute a round: each voice glides left and right and its volume, filter and pitch breathe, so the sound keeps moving. Set how far, how slowly, and which voices drift.',
    },
    {
        id: 'colour',
        stage: 6, rulePage: 'harmony',
        selector: '#rule-borrowed-chords',
        title: 'Harmonic rules',
        text: 'The Harmonic colour page holds borrowing, chord colour and its chance, open voicings, harmonic scales and bass pedals. Each rule can follow the preset or take your own choice. Allowed means it may act in a suitable passage; it need not fire in every bar. Chord explanations report the decisions that actually happened.',
    },

    // ---- 7: randomize ----
    {
        id: 'randomize',
        stage: 7,
        selector: '.gen-randomize',
        title: 'Randomize',
        text: 'The main interface is fully revealed, and every rulebook page is available. The dice can touch it all. New variation plays the same settings with different random choices. The other buttons roll the dice on one area at a time - music, evolution, arrangement, ambience and more; "How" sets how far from the current settings they go.',
    },
    {
        id: 'done',
        stage: 7,
        hint: true,
        selector: null,
        title: 'That is everything',
        text: 'Press Play and leave it running. The ⚙ menu repeats the tour and can start over with only the basics.',
    },
];

/**
 * localStorage key: set once the tour of the minimal view (where a first visit starts: the landscape
 * with only the play controls, the presets and the timeline) has been finished or skipped.
 */
export const MINIMAL_TOUR_KEY = 'bgm-tour-minimal-v1';

/** The tour of the minimal view. Opening the whole page afterwards starts the main tour (TOUR_STEPS). */
export const MINIMAL_TOUR_STEPS = [
    {
        id: 'minimal-welcome',
        selector: null,
        title: 'Welcome to calmbgm',
        text: 'Calm music that writes itself, for working, studying or winding down. The landscape behind it changes with the preset, the time of day and the season. This is the quiet view; the whole page with every control is one click away.',
    },
    {
        id: 'minimal-transport',
        selector: '.gen-transport',
        title: 'Play',
        text: 'Play or pause (Space does too). The other buttons go back to the start, a chord or a progression back or on, and loop what is playing.',
    },
    {
        id: 'minimal-presets',
        selector: '.gen-scene-nav',
        title: 'Presets',
        text: 'Each preset is a whole soundscape with its own landscape. The arrows step to the previous or next one ([ and ] on the keyboard), the dice picks one at random, and the name opens the full list.',
    },
    {
        id: 'minimal-timeline',
        selector: '.gen-timeline',
        title: 'The timeline',
        text: 'The chords being played and the notes each voice plays, a few bars ahead, so what you see is what you will hear. Hover or tap a chord to read why it was chosen.',
    },
    {
        id: 'minimal-view',
        selector: '.gen-zen-views',
        title: 'What shows',
        text: 'Show the instruments beside the timeline (with their mute and solo buttons), or fold the timeline away to leave only the landscape.',
    },
    {
        id: 'minimal-look',
        selector: '.gen-visual',
        title: 'The background',
        text: 'Choose the landscape and whether it follows the preset, the clock and the calendar, or switch to the fluid background that moves with the sound.',
    },
    {
        id: 'minimal-expand',
        selector: '.gen-expand',
        title: 'The whole page',
        text: 'Opens every control: voices, ambience, the rulebook and more, a set at a time, with a tour of its own. Esc does the same, and the same corner button brings this view back.',
    },
];
