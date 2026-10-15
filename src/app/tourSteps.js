// The guided tour (Tour.jsx): the page's sections in the order a newcomer
// meets them. A step with a `selector` frames that part of the page; one
// without is a centred card. Steps whose part isn't on the page right now
// (the second lead's panel while it is off) are skipped.

/** localStorage key: set once the tour has been finished or skipped, so it only opens by itself the first time. */
export const TOUR_KEY = 'bgm-tour-done';

export const TOUR_STEPS = [
    {
        id: 'welcome',
        selector: null,
        title: 'Welcome to bgm',
        text: 'Calm music that writes itself, for working or studying - or under a video or podcast. This short tour frames each part of the page and says what it does. Hover a framed part to read about it, press Next to go on, or Skip whenever you like.',
    },
    {
        id: 'transport',
        selector: '.gen-transport',
        title: 'Play and move around',
        text: 'Play or pause (Space does too). The other buttons go back to the start, to the previous progression or chord, forward a chord or a progression, and loop the chord or progression that is playing.',
    },
    {
        id: 'parts',
        selector: '.gen-parts',
        title: 'Music and ambience',
        text: 'Choose what Play starts: the music, the ambient bed (rain, wind, waves and the like), or both. Either one can play alone.',
    },
    {
        id: 'scene',
        selector: '.gen-scene',
        title: 'Presets',
        text: 'A whole soundscape in one pick: key, scale, feel, drums, ambience and sounds together. A good place to start - everything below can still be changed.',
    },
    {
        id: 'tools',
        selector: '.gen-header-tools',
        title: 'Volume and the ⚙ menu',
        text: 'The master volume, and the ⚙ menu: copy a link to the music you are hearing, type a phrase to replay a piece, set a sleep timer, save a WAV file, change the audio buffer or theme, and open this tour again.',
    },
    {
        id: 'timeline',
        selector: '.gen-timeline',
        title: 'The timeline',
        text: 'The chords being played and, in a row per voice, the notes each voice plays. The music is planned a few bars ahead, so what you see is what you will hear.',
    },
    {
        id: 'tracks',
        selector: '.gen-tracks',
        title: 'Voices and their buttons',
        text: 'One row per voice. M mutes it, S solos it, ⌨ lets you play it from the computer keyboard or a MIDI keyboard, ✎ opens its sound in the editor, the dice picks a random preset and ✦ makes a brand new sound.',
    },
    {
        id: 'randomize',
        selector: '.gen-randomize',
        title: 'Randomize',
        text: 'New variation plays the same settings with different random choices. The other buttons roll the dice on one area at a time; "How" sets how far from the current settings they go.',
    },
    {
        id: 'music',
        selector: '[data-tour="music"]',
        title: 'Music',
        text: 'Key, scale, chords, progression, time signature and tempo. Each control has its own dice. Underneath, what is playing right now - "Keep this" makes it the new home.',
    },
    {
        id: 'evolution',
        selector: '[data-tour="evolution"]',
        title: 'Evolution',
        text: 'How the music drifts over time. "Centered on my settings" drifts around them and keeps coming back; Wandering is a free walk. Choose which keys and modes it may visit, and under More options how often it changes.',
    },
    {
        id: 'arrangement',
        selector: '[data-tour="arrangement"]',
        title: 'Arrangement',
        text: 'How much the lead plays, whether there is a second lead, and sections - intro, build, full and breakdown - that bring voices in and out every few phrases.',
    },
    {
        id: 'feel',
        selector: '[data-tour="feel"]',
        title: 'Feel',
        text: 'Swing, and under More options how loose the playing is: small random shifts in timing, loudness and pitch so that nothing sounds machine-made.',
    },
    {
        id: 'wander',
        selector: '[data-tour="wander"]',
        title: 'Wander',
        text: 'Slow drift, about a minute a round: each voice glides left and right and its volume, filter and pitch breathe, so the sound keeps moving. Set how far, how slowly, and which voices drift.',
    },
    {
        id: 'ambience',
        selector: '[data-tour="ambience"]',
        title: 'Ambience',
        text: 'Rain, distant thunder, wind, waves, a fireplace and vinyl crackle to mix as a bed under the music, with a level for each. Under More options, shape every layer you have turned up.',
    },
    {
        id: 'sounds',
        selector: '.gen-sounds',
        title: 'New sounds',
        text: 'Gives every voice a new sound at once, all sharing one character. The same phrase always makes the same sounds, so a phrase you like can be typed in again.',
    },
    {
        id: 'voice-lead',
        selector: '[data-tour="voice-lead"]',
        title: 'A voice',
        text: 'Each voice has its own panel: its preset, volume and, under More options, its register and how it changes by phrase. The pad also chooses how it plays chords; the bass how it walks.',
    },
    {
        id: 'percussion',
        selector: '[data-tour="percussion"]',
        title: 'Percussion',
        text: 'Soft synthesised drums, off until you pick a style. Activity adds ghost notes and fills, Variation changes the grooves, and Sprinkle scatters crashes, bells and toms over them. "Hear the kit" plays a sample.',
    },
    {
        id: 'editor',
        selector: '.gen-editor',
        title: 'Synth editor',
        text: 'The full synth behind each voice: oscillators, filter, envelopes and effects. Change a sound by hand, or load and save your own presets.',
    },
    {
        id: 'done',
        selector: null,
        title: 'That is the tour',
        text: 'Press Play and leave it running. To see this again, open the ⚙ menu and choose "Take the tour".',
    },
];
