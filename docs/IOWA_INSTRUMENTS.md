# Iowa instruments (/synths/iowa)

Winds, brass, strings and mallets synthesized from measurements of the [University of Iowa Musical Instrument Samples](https://theremin.music.uiowa.edu/mis.html). The site says the recordings "may be downloaded and used for any projects, without restrictions" and asks to be told about projects that use them. Only derived tables ship (`src/library/iowaTables/`); the recordings stay in the git-ignored `banks/iowa/`.

Piccolo, harp, muted horn and muted trumpet come from [VSCO 2 Community Edition](https://versilian-studios.com/vsco-community/) (CC0), which has them and Iowa does not (`banks/vsco`, `node tools/fetchVsco.mjs`). VSCO samples every few notes, in a room, so the tables are sparser and the release holds some of that room. Its string sections are left out: one wavetable voice cannot make a section's chorusing.

## In the main app

The instruments are in the voice list as `Iowa & VSCO` (`node tools/buildIowaVoices.mjs`), tagged Iowa or VSCO in the picker. A preset naming one gets an `IowaInstrument` (`engine/iowaInstrument.js`) in place of the role's own synth, as a classic synth does, with its own room. Its `range` keeps the part inside what was recorded, one octave shift per phrase (`composition/registerShift.js`). A voice's slides and portamento play as one breath or bow: the note starts past its attack at the pitch before and glides over (`HeldVoice`). The flutes have `glide` in `patches.js`, so they do that by themselves, the lead most; the role's glide setting can only add to it. Struck and plucked voices do not bend. The sound editor can only change such a voice's level and room. The labs catalog leaves them out: they have their own page and level pass.

The category From Recordings (`recordings` in `scenes.json`) showcases them. Each preset's `fits:<category>` tag names where it could later be merged. `node tools/smokeIowaScenes.mjs URL` plays those presets live and meters every role; a render goes through a different path.

## Rebuilding

```sh
node tools/fetchIowa.mjs --list      # banks/iowa/manifest.json
node tools/fetchIowa.mjs             # about 6 GB: skips rolls, glissandi, dampened strokes and the guitar's stereo copies
node tools/analyzeIowa.mjs           # src/library/iowaTables/*.json, and banks/iowa/notes/ for the page's A/B
node tools/measureIowaLevels.mjs     # the balance between instruments
node tools/buildIowaVoices.mjs       # the voice list and the ranges, after any change to the tables
node tools/checkIowa.mjs             # renders notes through the voices and measures them again
node tools/smokeIowaPage.mjs URL     # plays every instrument through the page in headless Chrome
```

## Which recordings

The pre-2012 set: 16-bit, 44.1 kHz mono chromatic scales at pp, mf and ff in an anechoic chamber, with input levels constant within a session, so the level differences between dynamics are real. The post-2012 per-pitch files are ff only, so they are not used. The marimba, xylophone, vibraphone and bells takes are 96 kHz with a higher floor.

## Cutting scales into notes

- **Silence first.** `segmentBySilence` tries thresholds until the note count equals what the file name promises.
- **Gapless takes** such as the horn dip about 9 dB between notes with no silence. `segmentHeld` then scores how much of each frame sits on each note's harmonics, finds the best path up the scale, and moves each cut to the lowest level nearby.
- **Struck and plucked takes** use `segmentStruck`: a rebound is a strike too, and one miscount moves every later note to the wrong pitch. Every sharp rise is a candidate, scored on how much of it sits on each note's partials, and the best assignment in order picks the strikes.
- Held notes more than 70 cents from their name are dropped. On several strings, the file whose scale starts highest wins (nearest the nut).

## What a note becomes

**Held** (`analyzeHeld`, `HeldVoice`): harmonic shape in dB, its difference at six moments of the attack, level envelope, release, third-octave noise (typical level between harmonics, less the recording's floor), an attack noise burst, vibrato rate and depth, tremolo, and the wander left over. The voice morphs through wavetables with shared phases, so a morph cannot cancel, and reads noise from a shaped loop.

**Struck and plucked** (`analyzeDecay`, `DecayVoice`): up to 32 partials, each with its frequency ratio, level, rise and two decay rates, plus the strike's noise. They play live in the worklet as rotating phasors, so nothing is rendered ahead. Between strengths the same partial is blended into one, not summed, which would beat. A roll patch (`RollVoice`) repeats the strike while the key is held, at the rate measured from the roll recordings.

Pitch and strength blend in dB between the measured neighbours. Notes play in equal temperament; the player's measured intonation is kept in the table (`c`) but not used. A layer's level may stray only 3 dB from the notes around it, and a take more than 12 dB under its neighbours, or a held take with over 20 cents of pitch wander, is dropped so its neighbours stand in.

Two patches depart from their recordings on purpose (`patches.js`), so the page's A/B will not match them. The double bass (`even`) took each note as its own event: neighbouring keys differed by 12 dB in level and from 20 to 400 ms in attack, with a catch of the bow in many. Each note now takes the median of the notes around it, with its rise limited to 0.7 dB per ms, and its level from a straight line through the layer, since all the dynamics step by about 10 dB where the scale changes string at B♭3. The violin (`soften`) is 20 dB brighter above 4 kHz than the Iowa viola, at every dynamic, and a held chord made that dominate whatever its level: 8 dB per octave comes off above 2 kHz. That is the voice's spectrum, not its level, which the balance pass then restores.

Every held note opens over 5 ms, because a gapless take's measured attack can start within a few dB of the note, and that step on the first sample is a click.

## Measurement traps already hit

- A partial's level has to be read with a window of about three cycles of the distance to its nearest stronger partial, and only once the window lies wholly inside the note. Otherwise the neighbour leaks in and a -46 dB partial reads -24.
- In a gapless take, a note's tail is the note, so it cannot serve as the noise floor. Only struck takes use their tails.
- In a gapless take the cut starts on the last note's tail, so the attack is read off the note's own strongest harmonic.
- The measured envelope stops at 500 ms, and slow bowed notes have not arrived by then. The voice continues to the steady level by 1 s.

- A file filter must not match `*.roll.*` along with the single strikes: the rolls overwrote them once, and the model turned rapid hits into one long pitch.
- A held cut can open on a second or more of room noise, loud enough to pass for the note by level. Measured as the note, it became a stuttering attack and 56 cents of vibrato on the double bass. `heldStart` finds where the note's own harmonics arrive.
- A strike reaches its partials at once. A later peak in the measurement is beating, and playing it as a rise makes a pluck fade in.
- A low rise in the room's hum can win a note. Candidates more than 35 dB under the loudest strike do not count.

## Balance

`tools/measureIowaLevels.mjs` levels these the way the rest of the library is levelled (`src/labs/levels/measure.js`): full velocity, peak dBA as a power mean over the keyboard, each instrument brought to the median of its class in `src/labs/levels/suite.json`, with the dB in `src/library/iowaLevels.json`. It then reports the level across the range and the fall from attack to hold, and corrects any key more than 3 dB from the instrument's typical key back to that line, at most 12 dB up, since a key far under the others is a weak take. A layer's slope across the range is halved in `settleLevels`. Rerun it after any change to the tables; `--report` measures without writing.

## Not modelled

The slow beating of a real string's two polarizations (a guitar's level moves 5 to 10 dB over a note; ours falls smoothly), spectrum changing with the vibrato (body resonances), note transitions beyond a glide, bow changes, and anything beyond each recorded note's roughly 2 s. Strength is a blend of pp, mf and ff, not a crescendo within a note.
