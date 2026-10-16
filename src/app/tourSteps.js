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
    { id: 'ambience', name: 'Ambience' },
    { id: 'music', name: 'Music' },
    { id: 'instruments', name: 'Instruments' },
    { id: 'arrangement', name: 'Arrangement' },
    { id: 'evolution', name: 'Evolution' },
    { id: 'feel', name: 'Colour, feel & wander' },
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
        text: 'Calm music that writes itself, for working or studying - or under a video or podcast. To start with only the basics are shown: play, presets and the voices. This short tour covers them; more unlocks whenever you are ready.',
    },
    {
        id: 'transport',
        stage: 0,
        selector: '.gen-transport',
        title: 'Play and move around',
        text: 'Play or pause (Space does too). The other buttons go back to the start, to the previous progression or chord, forward a chord or a progression, and loop the chord or progression that is playing.',
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
        text: 'The chords being played and, in a row per voice, the notes each voice plays. The music is planned a few bars ahead, so what you see is what you will hear.',
    },
    {
        id: 'tracks',
        stage: 0,
        selector: '.gen-tracks',
        title: 'Voices',
        text: 'One row per voice. Click a voice to choose its sound. M mutes it, S solos it, ⌨ lets you play it from the computer keyboard or a MIDI keyboard, and the dice picks a random preset for it. Try muting the bass, or the pad, to hear what each adds. The volume of each is in its panel further down.',
    },
    {
        id: 'tools',
        stage: 0,
        selector: '.gen-header-tools',
        title: 'Volume, theme and options',
        text: 'The master volume and the theme button. The speaker button shows how hard the audio engine is working - if the sound crackles, open it for a bigger buffer or a lighter reverb. The ⚙ menu copies a link to the music, sets a sleep timer, saves a WAV file, and can start over with only the basics. The Tour button repeats this tour.',
    },
    {
        id: 'unlock',
        stage: 0,
        hint: true,
        selector: '.gen-unlock',
        title: 'That is the basics',
        text: 'Press Play and leave it running. When you want more, press this button: it unlocks the next set of features and shows you around them, one set at a time. The Tour button beside it repeats a tour whenever you like.',
    },

    // ---- 1: ambience ----
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
        title: 'Ambience',
        text: 'Rain, distant thunder, wind, waves, a fireplace and vinyl crackle to mix as a bed under the music, with a level for each. Try raising the rain, then add a little fireplace. Under More options, shape every layer you have turned up.',
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
        text: 'Each voice now has two more buttons: ✎ opens its sound in the editor, and ✦ makes a brand new sound for it. Press ✦ a few times and keep what you like.',
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
        text: 'Each voice panel now has a "Kind of new sound" for its ✦ button and, under More options, its register and how it changes by phrase. The pad also chooses how it plays chords; the bass how it walks.',
    },
    {
        id: 'percussion',
        stage: 3,
        selector: '[data-tour="percussion"]',
        title: 'Percussion',
        text: 'Soft synthesised drums, off until you pick a style. Activity adds ghost notes and fills, Variation changes the grooves, and Sprinkle scatters crashes, bells and toms over them. "Hear the kit" plays a sample.',
    },
    {
        id: 'editor',
        stage: 3,
        selector: '.gen-editor',
        title: 'Synth editor',
        text: 'The full synth behind each voice: oscillators, filter, envelopes and effects. Change a sound by hand, or load and save your own presets.',
    },

    // ---- 4: arrangement ----
    {
        id: 'arrangement',
        stage: 4,
        selector: '[data-tour="arrangement"]',
        title: 'Arrangement',
        text: 'How much the lead plays, whether there is a second lead, and sections - intro, build, full and breakdown - that bring voices in and out every few phrases. Try turning Sections on and the lead busyness up.',
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
        stage: 6,
        selector: '[data-tour="feel"]',
        title: 'Feel',
        text: 'Swing, and under More options how loose the playing is: small random shifts in timing, loudness and pitch so that nothing sounds machine-made.',
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
        stage: 6,
        selector: '[data-tour="colour"]',
        title: 'Colour',
        text: 'Spice for the chords: richer chord types, borrowed chords, a held bass note, and how the piece moves and ends. Each is off or neutral to begin with - try one.',
    },

    // ---- 7: randomize ----
    {
        id: 'randomize',
        stage: 7,
        selector: '.gen-randomize',
        title: 'Randomize',
        text: 'Everything is unlocked, so the dice can touch it all. New variation plays the same settings with different random choices. The other buttons roll the dice on one area at a time - music, evolution, arrangement, ambience and more; "How" sets how far from the current settings they go.',
    },
    {
        id: 'done',
        stage: 7,
        hint: true,
        selector: null,
        title: 'That is everything',
        text: 'Press Play and leave it running. The Tour button repeats the tour, and the ⚙ menu can start over with only the basics.',
    },
];
