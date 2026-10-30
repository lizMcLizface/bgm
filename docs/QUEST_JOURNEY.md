# Quest journey

What a new visitor is asked to do, level by level. **Edit this file freely** - names, descriptions, help, task wording, counts, which level a quest sits in, quests added or removed - and ask Claude to apply it. Turning tasks into code is Claude's part, so for a new or changed task just say in plain words what should count.

The code lives in `src/app/quests/questDefs.js`. A quest completes when all its tasks are done, in any order. Finishing every quest in a level unlocks the next level (and offers a tour of what is new). Level 1 is the landscape view only; the whole page opens at level 2, a little at a time (the rulebook not before level 5).

How a quest looks on the card:

- **Name** is the heading, **Description** the line under it, **Tasks** the checklist with progress such as `0/1`.
- **Help** appears behind the `?` button.
- Hovering a task lights up the control it is about (the *Highlights* line below, a part of the page).

How to edit: change the text after a label, change `need` (how many times), move a quest by cutting it under another level, or write a new quest in the same shape. Leave the `id`s alone unless you are adding something new.

---

## Level 1: The basics
*The landscape view. The whole page is locked until these are done.*

### First Notes  `first-notes`
- **Description:** Start the music, then find your way around it.
- **Help:** Play and pause with the big button or the space bar. The arrows beside it move around the piece: a chord forward or back, a whole progression, or all the way to the start. The left and right arrow keys do the same.
- **Tasks:**
  1. **Press play** - counts when music is started (play button, Space, media key). *Highlights: the play button.*
  2. **Jump ahead a chord** - the forward-one-chord button or the right arrow key. *Highlights: the transport buttons.*
  3. **Jump ahead a progression** - the forward-one-progression button or Shift + right arrow. *Highlights: the transport buttons.*
  4. **Jump back to the start** - the back-to-the-start button. *Highlights: the transport buttons.*

### On Repeat  `on-repeat`
- **Description:** Hold the music on one spot for a while.
- **Help:** The loop button has three states. Press it once to repeat the chord playing, a second time to repeat the whole progression, and a third time to let go. Looping is handy for hearing what one chord does while you change other things.
- **Tasks:**
  1. **Loop a chord** - the loop button set to "chord". *Highlights: the loop button.*
  2. **Loop a progression** - the loop button set to "progression". *Highlights: the loop button.*
  3. **Turn looping off** - the loop button pressed once more, back to off. *Highlights: the loop button.*

### Change of Scenery  `scenery`
- **Description:** Try other presets.
- **Help:** A preset is a whole soundscape: key, feel, drums, sounds and landscape together. The arrows ([ and ] on the keyboard) step through them, the dice picks one, and the name opens the full list. Give each a minute rather than clicking through.
- **Tasks:**
  1. **Pick another preset** - from the list, the arrows, [ ] or the dice. *Highlights: the preset controls.*
  2. **Listen to three presets for half a minute each** - need 3. A preset counts after 30 seconds of playing. *Highlights: the preset controls.*

### Landscaper  `landscaper`
- **Description:** Make the landscape behind the music your own.
- **Help:** Open the look menu (the palette button) and choose Landscape: its options appear. Kind is the place, Weather the sky, Time of day how fast the day passes (or fix an hour) and Season how the year turns. Each preset brings its own, but you can set them by hand.
- **Tasks:**
  1. **Pick a different landscape** - the Kind dropdown. *Highlights: the look menu.*
  2. **Change the weather** - the Weather dropdown. *Highlights: the look menu.*
  3. **Set the time of day** - the Time of day dropdown, or the hour slider when it is fixed. *Highlights: the look menu.*
  4. **Pick the season** - the Season dropdown, or the time-of-year slider when it is fixed. *Highlights: the look menu.*

---

## Level 2: Voices
*Opens the whole page, with the voices.*

### Volume Knob  `volume-knob`
- **Description:** Turn the voices up and down to hear what each adds.
- **Help:** Each voice has its own panel below the timeline, with a Volume slider. Drag it up to hear the voice more and down to tuck it away. The preset you chose set the starting balance; from here it is yours to change.
- **Tasks:**
  1. **Turn a voice's volume up** - a voice's Volume slider moved up. *Highlights: the voice panels.*
  2. **Turn a voice's volume down** - moved down. *Highlights: the voice panels.*

### Voice Controls  `voice-controls`
- **Description:** Take voices out, listen to one alone, then put everything back.
- **Help:** Each voice row has M and S buttons. M mutes a voice so you hear the music without it: the quickest way to learn what the bass or the pad adds. S solos it, so only that voice plays. Press either again to undo it.
- **Tasks:**
  1. **Mute a voice** - M on. *Highlights: the voice rows.*
  2. **Play one voice alone** - S on. *Highlights: the voice rows.*
  3. **Unmute it** - M off. *Highlights: the voice rows.*
  4. **Take it off solo** - S off. *Highlights: the voice rows.*

### Hands On  `hands-on`
- **Description:** Play along with the music yourself, on each voice in turn.
- **Help:** The ⌨ button on a voice lets you play it. A small piano pops up at the bottom of the page: tap its keys (or press the A S D F row on a computer keyboard, or a MIDI keyboard) and the voice plays your notes over the music, in its own sound. Z and X change the octave. Press ⌨ again, or close the piano, to stop. Try it on the lead for a melody, the rhythm for chords and the bass for the low notes.
- **Tasks:**
  1. **Play the lead** - any note from the on-screen keys, keyboard or MIDI while the lead is armed. *Highlights: the lead row.*
  2. **Play the rhythm** - the same, on the rhythm / pad. *Highlights: the rhythm row.*
  3. **Play the bass** - the same, on the bass. *Highlights: the bass row.*
- *Note: the first time the on-screen piano opens it shows a floating explanation of what key input is.*

### New Voices  `new-voices`
- **Description:** Give the rhythm, the lead and the bass new sounds.
- **Help:** The quick way is the dice on a voice: it picks a good sound for that voice at random, and you can keep rolling until you like it. Clicking the voice itself opens the whole list of sounds, which is a lot to look through; it is there when you want to hunt for something specific, and its arrow keys step through it. Whichever you use, the new sound starts at the next bar. If you wander too far, the ↶ at the top right of the Preset field in a voice panel takes it straight back to the sound the preset gave it.
- **Tasks:**
  1. **Change the rhythm sound** - from the list or the dice. *Highlights: the rhythm row.*
  2. **Change the lead sound** - the same. *Highlights: the lead row.*
  3. **Change the bass sound** - the same. *Highlights: the bass row.*
  4. **Roll a voice's dice three times** - need 3, any voice. *Highlights: the voice rows.*
  5. **Return a voice to its preset sound** - the ↶ at the top right of a voice panel's Preset field (it appears once the sound differs from the preset's). *Highlights: that button.*
- *Note: the first time the full list of sounds opens it shows a floating explanation of what it is and a pointer to the dice.*

---

## Level 3: Ambience
*The ambience panel and the music / ambience buttons by play.*

### Weather Report  `mixing-desk`
- **Description:** Add some weather under the music.
- **Help:** Ambience is a bed of rain, wind and waves under the music, or on its own: turn a layer up to start it, and use the music and ambience buttons by play to choose which one plays.
- **Tasks:**
  1. **Turn an ambience layer up** - any ambience layer, or the ambience play button. *Highlights: the ambience panel.*

---

## Level 4: Music

### Key & Scale  `key-and-scale`  *(unlocks the Fluid background)*
- **Description:** Change where the music sits and what mood it has. Finishing this unlocks the Fluid background, whose colours follow the harmony.
- **Help:** The key sets how high or low everything sits. The scale sets the mood: major is bright, minor is sad, Dorian warm, Lydian dreamy. Beyond the seven modes of the major scale are harmonic and melodic minor and their relatives, which sound more exotic. Everything changes live while it plays.
- **Tasks:**
  1. **Change the key** - any new key. *Highlights: the key and scale row.*
  2. **Pick a different scale** - any scale or mode. *Highlights: the key and scale row.*
  3. **Try a scale outside the major family** - any scale that is not one of the seven major-scale modes. *Highlights: the key and scale row.*
- *Note: until this is done, the Fluid button in the look menu is greyed out ("Unlocks with the Key & Scale quest"). It is open from the start for anyone who knew the page before quests, with quests off, and in a shared-link preview.*

### Time & Chords  `time-and-chords`
- **Description:** Change the speed, the pulse and the chords.
- **Help:** The tempo sets how fast it moves. The time signature changes the pulse: 3/4 and 6/8 sway, 4/4 is steady. The progression is the chord pattern that repeats; pick another from the list or press the dice.
- **Tasks:**
  1. **Change the tempo** - the tempo control. *Highlights: the tempo row.*
  2. **Change the time signature** - the time signature control. *Highlights: the tempo row.*
  3. **Pick another chord progression** - from the list, the dice, or switching how progressions are made. *Highlights: the progression row.*

---

## Level 5: Instruments & playing rules

### Liquid Light  `liquid-light`
- **Description:** Swap the landscape for a fluid that moves with the sound.
- **Help:** Fluid is a flowing background the notes stir: short notes make small fast jets, held notes broad plumes, and the colours follow the harmony. Its options sit in the look menu when it is chosen: colours, flow look, quality for slower machines, jet direction and how long trails linger.
- **Tasks:**
  1. **Choose the Fluid background** - Fluid in the look menu. *Highlights: the look menu.*
  2. **Change a fluid setting or its colours** - any fluid option, the colours, or Shuffle colours. *Highlights: the look menu.*

### Instrument Maker  `instrument-maker`
- **Description:** Invent a sound, then look inside one.
- **Help:** The sparkle button on a voice invents a brand new sound for it: press it a few times and keep what you like. The pencil opens the voice's synth on faders, with its effects; while it is open your computer or MIDI keyboard plays that voice.
- **Tasks:**
  1. **Make a new sound** - the sparkle button on a voice. *Highlights: the voice rows.*
  2. **Open a voice's synth** - the pencil on a voice. *Highlights: the pencil button.*

### On the Beat  `on-the-beat`
- **Description:** Change the drums, or program your own beat.
- **Help:** The percussion panel picks the drum style and shapes the kit. The step sequencer replaces the generated drums with a beat you program, one pattern per chord, played on drum machine sounds.
- **Tasks:**
  1. **Change the drums** - style, activity, kit or similar in the percussion panel. *Highlights: the percussion panel.*
  2. **Switch on the step sequencer** - the sequencer's on switch. *Highlights: the sequencer panel.*

### Play Along  `play-along`
- **Description:** Watch a voice being played, note by note.
- **Help:** The piano, guitar and bass buttons under the timeline open a keyboard or fretboard that shows exactly which notes are being played, so you can follow on a real instrument.
- **Tasks:**
  1. **Open a piano, guitar or bass block** - any of the three. *Highlights: the voice rows.*
- *Note: these buttons only show from this level on, unless a shared link opens them.*

### Hero Mode  `hero-mode`
- **Description:** Play the music yourself, game-style.
- **Help:** Open the piano, guitar or bass block and press its hero button. A window shows the notes arriving towards you like a rhythm game, fingered so a hand can actually play them. Keys held on a MIDI keyboard light up too.
- **Tasks:**
  1. **Open hero view** - the hero button on a piano, guitar or bass block. *Highlights: the voice rows.*

---

## Level 6: Composition rules

### The Rule Book  `rule-book`
- **Description:** Change how the music is written.
- **Help:** Rules decide how the music is composed: how the lead moves, how voices answer each other, how sections build. Open a page of the rulebook and move something. Rules apply to the music coming up, so a phrase already playing finishes first.
- **Tasks:**
  1. **Change three rules** - need 3. Any rule or rule group in the rulebook. *Highlights: the rulebook.*

### The Long View  `long-view`
- **Description:** Shape the piece over minutes, not bars.
- **Help:** Sections give the piece an intro, a build, a full middle and a breakdown. The arc shapes the energy over a longer stretch. Change either to hear the music take a longer breath.
- **Tasks:**
  1. **Change the sections or the arc** - either setting. *Highlights: the rulebook.*

---

## Level 7: Evolution

### Drift Away  `drift-away`
- **Description:** Let the music wander off on its own.
- **Help:** Evolution lets the key and mode move over time, either around your settings (it keeps coming back) or freely. You choose which keys and modes it may visit.
- **Tasks:**
  1. **Change the evolution mode** - any evolution setting. *Highlights: the evolution panel.*

---

## Level 8: Harmony, feel & wander
*The control panel (faders, the feel pad, chord size and colour) opens here.*

### Feel the Room  `feel`
- **Description:** Set how busy, bright and restless the music is.
- **Help:** The feel pad is one point in a diamond: left is calmer and right is busier, down is darker and up is brighter. Wander is a slower drift: each voice glides left and right while its volume, filter and pitch breathe.
- **Tasks:**
  1. **Move the feel pad** - drag the point. *Highlights: the control panel.*
  2. **Set the sound wandering** - any wander setting. *Highlights: the wander panel.*

---

## Level 9: Randomize

### Roll the Dice  `roll-the-dice`
- **Description:** Let chance rewrite the music, then share what you find.
- **Help:** The randomize buttons roll the dice on one area at a time, or make a new variation of the same settings. When something sounds good, the ⚙ menu copies a link to exactly what you hear; whoever opens it gets the same music.
- **Tasks:**
  1. **Randomize something** - any randomize button or a new variation. *Highlights: the randomize panel.*
  2. **Copy a link to your music** - either copy-link button in the ⚙ menu. *Highlights: the header tools.*

---

## Achievements
Noticed, not asked for. They pop up bottom right and are listed behind the ★.

| Title | Earned by |
|---|---|
| First notes | Pressing play for the first time. |
| Changing the scenery | Picking a different preset. |
| Browser | Trying ten different presets. |
| Collector | Trying fifty different presets. |
| Mode explorer | Playing in five different scales. |
| Taking one out | Muting a voice. |
| Sound designer | Making a brand new sound. |
| Pass it on | Copying a link to your music. |
| Settling in | Listening for ten minutes. |
| In the zone | Listening for an hour. |
| Regular | Listening for ten hours. |
| Part of the furniture | Listening for a hundred hours. |
| Back again | Listening on three different days. |
| A habit | Listening on fourteen different days. |
| Everything unlocked | Reaching the last level. |
| *One per preset category* | Listening to every preset in the category for at least 5 minutes. Categories: Cozy, Night & deep, Focus, Ambience, Sub-light Cruising, Console Nostalgia, Dig, Farm, Repeat, Under Speech, Synth Cinema, Unsettling, Electronic Horizons, Wasm showcases, Feel demos. Each is titled "*Category*, all of it". |

Ideas not built yet (add a line here and ask): listening in the small hours, a streak of consecutive days, trying every drum style, saving a preset of your own.

---

## Preset unlocks
While quests are on, the preset list starts small and opens as you listen. Nothing is hidden for people who knew the page before quests, with quests off, in a shared-link preview, or after pressing **Unlock all presets** in the list. Anything you have heard stays in the list. Stars (the ☆ on a card) keep presets at the top, and each card shows how long you have listened to it.

**Starters** (edit in `src/app/presetUnlocks.js` `STARTERS`): Rainy café, Ambient Piano Distant Storm, Solo Grand, Thunderstorm, Hull Breach Brunch, Mushroom Kingdom Commute, Island Shop Hours, Late Show Lounge, Replicant Blues, Seaside Hearth and Progressive Night Bus. Wasm showcases and Feel demos (demos of new features, for testing) are always fully open.

**Tiers** (per category; time is all presets of the category added up, "heard" is a preset listened to for 30 seconds):

| Listened in the category | Presets open |
|---|---|
| Start | 1 (the starter) |
| 1 minute | 3 |
| 5 minutes | 5 |
| 15 minutes and 4 presets heard | 9 |
| 30 minutes and 7 presets heard | 14 |
| 1 hour and 11 presets heard | 22 |
| 2 hours and 16 presets heard | all |

Change the numbers in the table and I will update `TIERS`. Locked presets are left out of the list, the arrow and `[` `]` keys, the dice and search; each category shows how many more there are and what to listen to for the next ones.
