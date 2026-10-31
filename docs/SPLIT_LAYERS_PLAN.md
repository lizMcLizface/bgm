# Rhythm and pad as separate layers

31 October 2026. Plan only: nothing here is built, and nothing has been heard. Status marks: `[ ]` open, `[~]` in progress, `[x]` done and checked.

## Why
Today there is one chord voice, the `pad` role. Each four-bar phrase picks a style for it from `padWeights` (`arranger.js`): held styles (sustain, rolled, stacked) or rhythmic ones (pulse, arpeggio, sequence). So a preset is "a pad" or "a rhythm part" only through its weights and the voice in the pad slot.

The two do different jobs and are not interchangeable:
- **Pad:** sustained harmony, glue, space, chord colour (the mood slider).
- **Rhythm layer:** pulse and movement, which carries the fast presets.

Pads plus bass alone sound like an ambient bed. A rhythm part alone sounds thin and exposed, because the chord is only implied. The best arrangements have both.

Survey of the 188 presets by pad weights (about 17 are `previous` / `v1` / `·` variants of others):

| Class | Count | Examples |
| --- | --- | --- |
| Held (sustain + rolled + stacked at 65% or more) | 45 | Underwater, Chapel organ, Choir at sea, Deep night |
| Rhythmic (pulse + arp + sequence at 65% or more) | 81 | Zero Fun Zone, Mushroom Kingdom Commute, Pastel Coastline, Clockwork |
| Mixed | 51 (5 ambience-only, no pad) | Rainy café, Late Show Lounge, the piano presets, Outrun After Midnight |
| Sequencer lanes | 11 | Warehouse Lift, Acid Jack Afterhours |

The rhythmic class is the largest, and most of those have no pad under them.

## The setting: `layers`
One setting, four values.

| Value | Plays | Voice slot used |
| --- | --- | --- |
| `pad` | held styles only | pad |
| `rhythm` | pulse, arpeggio, sequence only | rhythm |
| `split` | held styles on the pad and rhythmic styles on the rhythm layer, at the same time, two instruments | both |
| `combined` | every style on one voice, switching per phrase (today's behaviour) | pad |

- **Default is `combined`.** With it, a preset plans exactly the notes it plans today, so every existing preset and every old share link sounds the same with no migration. Presets are then moved to `pad`, `rhythm` or `split` one at a time.
- `pad` is `combined` with the rhythmic weights forced to zero. `rhythm` is `combined` with the held weights forced to zero, planned for the rhythm role.
- Where the controls show: the rhythm mixer row, mute, voice picker and colour only appear in `rhythm` and `split`. A user on `combined` or `pad` sees nothing new, so the quests and onboarding are unchanged.

## Stages and goals

### Stage 1: engine (no UI)
- [ ] **1.1** `layers` setting in `settings.js`: default `combined`, validator, passed through `Generator.js` (both places).
- [ ] **1.2** New role `rhythm` in the role lists: `Generator.js` (`ROLES`, the voice loops), `engine/bus.js`, `engine/wander.js`, `engine/ducking.js`, `engine/loudness.js`, `composition/loudness.js`, `performance.js`, `sectionSpace.js`, `timbreDrift.js`, `presets.js` (`ROLE_VOLUMES`), `patternDefaults.js`.
- [ ] **1.3** Arranger: split the phrase's `padStyle` / `padPattern` / `padStep` into a held part and a rhythmic part. In `split` both exist; in `pad`, `rhythm` and `combined` one does. Add a `RHYTHM_RANGE` and its octave limits beside `PAD_RANGE`.
- [ ] **1.4** Rhythm layer events through the existing `padEvents` (its pulse / arpeggio / sequence paths), planned separately from the pad's.
- [ ] **1.5** Voices: `voices.rhythm` in presets and `sceneVoices.js`. A preset that sets `layers: 'rhythm'` and no rhythm voice falls back to its pad voice.
- [ ] **Check:** `combined` plans identical notes to the last commit (the plan-dump check in [COMPOSITION_PLAN.md](COMPOSITION_PLAN.md), expecting all entries to match). Unit tests for each mode: `pad` has no rhythmic styles, `rhythm` no held ones, `split` has both, `combined` is unchanged.

### Stage 2: composition rules that keep the two apart
See the next section. Each is an amount or a switch, default off, and only applies in `split`.
- [ ] **2.1** Register split (rhythm range separate from the pad's)
- [ ] **2.2** Chord-tone ownership (bass root, pad guide tones, rhythm full chord)
- [ ] **2.3** Attack separation (the rhythm layer stays off the pad's re-strikes)
- [ ] **2.4** Density budget across lead, rhythm and counter
- [ ] **2.5** Section entrances (pad-only intro, rhythm enters in the build)
- [ ] **2.6** Mix and tone pairing (levels, ducking, send defaults, voice pairing guidance)
- [ ] **Check:** a metric in `tools/compositionMetrics.js` for simultaneous low-register pairs closer than a third and for attack overlap between the layers, shown in `tools/compositionAudit.audit.js`; a `split` preset must score no worse than its `combined` form.

### Stage 3: UI
- [ ] **3.1** Four-way selector (Pad / Rhythm / Pad + rhythm / One voice) in the Sound window and the quick panel.
- [ ] **3.2** Rhythm mixer row: volume, mute, voice picker, sends. `Tracks.jsx`, `ChordTimeline.jsx`, `AudioStatus.jsx`, `MiniKeyboard.jsx`.
- [ ] **3.3** A colour for the rhythm role in the playhead and note colours (`visuals/musicColour.js`, `musicForces.js`, `generative.css`, `icons.jsx`).
- [ ] **3.4** Rulebook: the pad page gets the `layers` rule and a rhythm-layer page (or section) for its range and patterns (`rulebook/model.js`; append the new rule ids at the end of `BOOK_RULE_IDS` in `bookCodec.js`).
- [ ] **3.5** Quests and the feature intro: do not mention the layer until the user has unlocked the pad rules (`quests/questDefs.js`, `FeatureIntro.jsx`).
- [ ] **Check:** the existing UI tests; look at it on the dev server in light and dark and at phone width.

### Stage 4: share links and randomizer
- [ ] **4.1** Append a **new group** at the end of `MUSIC_GROUPS` in `shareCode.js` holding `layers` (2 bits) and the rhythm range / octave. Add the rhythm role to the voice codes without changing the existing `CODE_ROLES` layout (append, never reorder).
- [ ] **4.2** `randomize.js`: pick `layers` with a bias toward the mode that matches the chosen weights.
- [ ] **Check:** round trip tests; a link made before this change decodes as `combined` and plans the same notes.

### Stage 5: presets, by ear
- [ ] **5.1** Reassign existing presets: held ones to `pad`, rhythmic ones to `rhythm` (their current pad voice moves to the rhythm slot). No change in sound; verify with the plan-dump check.
- [ ] **5.2** Convert the `split` candidates below, one at a time, listening on the dev server. Adding a pad voice is a deliberate sound change: write what was chosen and why in the preset's blurb.
- [ ] **5.3** Add the new presets below.
- [ ] **5.4** Loudness: every converted or new `split` preset gets a rhythm volume; compensate the other roles' volumes if the preset got louder (see the scene-volume rule).
- [ ] **5.5** CPU: run each `split` preset on the Pixel 8 Pro; note any that drop frames. The rhythm voices are mostly short plucks, so this should be cheap, but it is a second always-on voice.

### Stage 6: sequencer lanes
- [ ] **6.1** Decide which layer the sequencer's `pad` lane drives. Proposed: the rhythm layer when `layers` is `split` or `rhythm`, the pad otherwise; the held pad then sustains underneath the stabs.
- [ ] **6.2** Convert the lane presets that suit it (see below).

### Stage 7: playable voicings (related option, can ship before or after the layers)
Raised 31 October 2026 from the piano roll view: the rhythm part there held six simultaneous notes across an octave and a half, which no single hand reaches. Voicings are chosen only for smooth voice leading and register (`voiceLead` in `theory.js`, `voicingsInRange`, `openVoicing` in `arranger.js`), so nothing limits them to what a person could play. The guitar view has the opposite problem: fingering is worked out afterwards (`heroFingering.js`: four-fret reach, distinct strings, Viterbi over a run of chords) from piano-shaped voicings, so guitar chords come out as shapes nobody would choose on a neck.
- [ ] **7.1** Measure first: how many planned pad / rhythm chord voicings in the presets exceed one hand's reach (span over 9 and over 12 semitones, more than 5 simultaneous notes), and for the guitar view how many have no playable fingering inside the reach. A metric in `tools/compositionMetrics.js` and the audit. This says how much the option would change.
  - **Result (31 October 2026, `tools/voicingReach.audit.js`, 124 presets with pad chords, 2 seeds, 48 bars, 8,251 chords struck together).** Pad chords are 3 to 5 notes (67% triads, 26% four notes, 8% five); never more than five struck at once. Span: 40% exceed 9 semitones and 22% exceed an octave, up to 22 semitones. Every one of them splits into two hands of at most 5 notes within an octave each, but 22% need both hands, and with a 9-semitone (small-hand) reach 39% need two hands and 1% fit neither. For guitar, 82% have a fingering with every note placed within a four-fret reach and no string reused, 18% need a stretch beyond it; this does not test whether the shape is one a guitarist would play. Counting every note sounding at once (arpeggios and pulses that overlap), 0.1% of moments exceed five notes (8 of 130 presets, up to seven notes: Plotting a Course, Electro Story, Bonfire Rest, Tears in Weather, Deep Pocket Daydream, Replicant Blues), but 21% span more than an octave and 5.5% more than an octave and a half. Rhythmic presets are the most affected (about 29% need two hands); mixed presets least (7%).
- [ ] **7.2** Setting `voicing`: `free` (today, default so nothing changes), `hand` (piano-playable), `guitar` (neck-playable), and `auto` (picked from the voice's instrument family, `editor/soundFamilies.js`: keys and mallets get `hand`, plucked guitar voices get `guitar`, everything else `free`). Held per layer once `layers` exists, since the pad and the rhythm layer can be different instruments.
- [ ] **7.3** `hand`: filter the candidates in `voicingsInRange` to what one hand plays (about 5 notes at most, span of an octave by default, `comfortable` 9 semitones for small hands, a tenth for large ones), with a two-hand allowance that splits the chord into a left hand below and a right hand above, each within reach, with a gap between them allowed. Prefer playable and fall back to the closest (a soft mode, with a hard "only playable" switch). Where no playable voicing exists for a chord (a six-note thirteenth), drop the fifth first, then the root where the bass has it (the same ownership rule as `padRoot`), then the remaining colour tone.
- [ ] **7.4** `guitar`: generate voicings from the neck, not from pitches. Take the shapes `heroFingering.shapesFor` already enumerates (distinct strings, four-fret reach, open strings), keep the ones that spell the chord (root, third and seventh present, other tones optional), and choose between them by the existing movement cost plus fingering cost, so voicings move the way a hand moves on the neck. Include the open-string shapes (open G, open C and so on) that are very unlike piano voicings, and barre shapes. The low string is E2 (MIDI 40), below the pad range (G3 to D5), so the guitar pad range is different and the bass has to give way: use `padRoot: unlessBass` or have the guitar voicing leave off its low strings when the bass is playing the root.
- [ ] **7.5** Rolled and stacked styles then become strums and picked entries: rolled follows the string order (low to high for a down-strum, high to low for an up-strum); arpeggio patterns pick the shape's strings in finger-picking order (thumb on the bass strings, fingers on the upper three).
- [ ] **7.6** Rulebook rule, quick-panel control and randomizer entry; append the setting as a new share group (never into an existing one).
- [ ] **7.7** UI: the fretboard and hero view read the fingering the generator chose and no longer need to search for one. The piano roll shows the hand split with two colour tones if two hands are used (optional).
- [ ] **Check:** every voicing planned under `hand` is within reach in a test over all presets and two seeds; under `guitar` every voicing has a fingering with no string reused; both are no worse than `free` on the roughness and spacing metrics; `free` plans identical notes to the last commit.

How it connects to the layers: the playable limits are another reason a `split` rhythm layer stays small. Three or four notes in one hand, or a two-hand chord with a gap, is easier to keep clear of the pad than a six-note cluster. A rhythm layer on `hand` voicing and a pad on `free` is a coherent default for a keys-and-pad preset. The rhythm layer's arpeggios and sequences need no change, because they play one note at a time, so reach only limits the chords and pulses.

### Stage 8: tuning to the key and chords instead of equal temperament (raised 31 October 2026)
Every engine's `scheduleNote` already takes a per-note `detune` in cents (humanization fills it at `Generator.humanize`, about line 1754 of `Generator.js`), and `engine/temperament.js` already has eight temperaments (equal, Vallotti, Young, Werckmeister III, Kirnberger III, quarter-comma meantone, Pythagorean, 5-limit just) centred on any key. Today only the modelled piano uses them (`Instrument.noteInfo`). So a tuning offset can be added to `e.detune` at plan time and every voice follows, with no engine changes. Equal temperament stays the default, so nothing changes until it is turned on.
- [ ] **8.1** `tuning` setting (key-centred, default equal): add `temperamentOffsets(tuning, tonic)` for each note's pitch class to `e.detune` for every role except percussion, using the bar's tonic (so key lifts follow). Skip the piano voice's own tuning so it is not applied twice. About a day.
- [ ] **8.2** Share link (a new appended group), rulebook rule, quick-panel control, `randomize.js`.
- [ ] **8.3** Slides and glides: `slideFromMidi` and `pitchTargets` in `Instrument.js` use the untempered pitch, so their end points can be a few cents off; give them the same offset.
- [ ] **8.4** Listen on pad, organ and string presets first: gains should be biggest where sustained thirds beat, small on supersaws (already beating by design) and short plucks.
- [ ] **8.5** Chord-adaptive tuning (each bar's chord tuned from its own root with pure ratios, other scale notes tuned against it). Needs a drift limit (pull back toward the tonic, about ±20 cents, common tones held) and a rule for notes that continue through a chord change (leave them, or slide them with the existing `plan.slide` / `pitchPath`). A few days plus listening; do 8.1 to 8.4 first.
- [ ] **Check:** with `tuning` off, the plan-dump check still matches (it does not hash `detune`); a unit test that the offsets sum to the table's cents for each pitch class and follow a key lift.
The same hook carries scale-specific tuning for non-Western scales, see [WORLD_MUSIC_PLAN.md](WORLD_MUSIC_PLAN.md) (stage W2).

## Compositional rules for keeping them apart
The current pad range is G3..D5 (`PAD_RANGE = [55, 74]`), the counter sits at 62..84 and the lead at 69..91. Most presets keep the pad in that narrow range with little octave wander. That keeps one pad tidy, but a second chord layer in the same range will sit on top of the first. So each layer needs its own job.

1. **Register split (2.1).** The pad stays low-mid (about G3..A4); the rhythm layer sits above it (about E4..C6, `RHYTHM_RANGE`, to be tuned by ear), under the lead. Neither wanders octaves by default. A `rhythm` octave offset lets a preset drop the pluck an octave when the pad is bright. Rule: the rhythm layer's lowest note stays at least a fourth above the pad's top note at the same moment, and never sits a step or less from a sounding pad note (see the literature check: close pitches fuse into one stream or beat against each other). Avoid exact unisons and octaves between the layers on the same beat for the same reason, except on the chord-change downbeat where fusion is wanted.
2. **Chord-tone ownership (2.2).** This extends the existing `padRoot` rule (`always` / `unlessBass` / `never`), the "no bass in the pad" option that already exists. In `split`:
   - The bass owns the root.
   - The pad drops the root and fifth where the chord is rich enough and plays the guide tones (third, seventh, colour tones). With `padRoot` set to `unlessBass` or `never`, this already works for held styles. Make it the default for the pad in `split`.
   - The rhythm layer plays the full chord, because arpeggios and sequences need it (`arranger.js` forces `padRoot: 'always'` for arpeggio and sequence for exactly this reason: three notes would repeat pitches). It may omit the root on the beats where the bass is attacking, a new `rhythmRoot` option with the same three values as `padRoot`.
   - Result: the root is heard once (bass), the colour once (pad), the movement once (rhythm).
3. **Attack separation (2.3).** The pad moves only at a chord change and then holds (one attack per chord, with `stacked` or `rolled` entries allowed). The rhythm layer is allowed to hit the chord-change downbeat but not to re-articulate on top of the pad entry in the same sub-beat; the pad's attack is soft, the rhythm's fast, which is also a timbre rule for choosing voices. Under `combined` this does not apply (one voice).
4. **Density budget (2.4).** `thinPadUnderLead` already thins arpeggios when the lead plays. In `split` it thins the **rhythm layer** (fewer notes, longer steps, or resting a bar), never the pad. The existing "fast" chance for half-unit arpeggios only happens when the lead rests. Add a ceiling on attacks per beat across lead, counter and rhythm together so a busy lead and a 16th-note sequence do not stack.
5. **Section entrances (2.5).** Sections (`intro / build / full / breakdown`) already override the pad style (`shape.padStyle`). In `split`: intro is pad only, build brings the rhythm layer in, full has both, breakdown drops the rhythm layer (or the pad, for a rhythm-led break). This is the cheapest way to make the two layers feel like different parts and not two copies.
6. **Mix and tone pairing (2.6).** Rhythm layer 2 to 4 dB under where the pad would sit alone; the pad's send to the reverb higher and the rhythm's lower and drier, so the pluck stays in front. The pad ducks lightly on the kick as it does now. Voice-pairing guidance for presets: a soft-attack, low-brightness pad with a fast-attack, brighter rhythm voice.
7. **Mood slider.** Mood colours (suspended to lush) apply to the pad only in `split`, so the rhythm layer keeps playing clean chord tones and the colour lives in one place.

Open question: whether the rhythm layer should follow the lead's chord thinning at all in `split`, since the pad is now what carries the harmony. Try it by ear.

## Literature check (31 October 2026)
A web search plus the repo's own grounding ([MUSIC_THEORY_GROUNDING.md](MUSIC_THEORY_GROUNDING.md) §2.5). The web results were thin: mostly production blogs, glossaries and course pages, with no authoritative arranging text reached. The perceptual claims below rest on Huron 2001 (*Music Perception* 19(1), "Tone and Voice") and Plomp & Levelt 1965, both already cited in the grounding doc. The genre rows are common production practice, not tested findings. Book-level claims (Berry, Adler, Bregman) come from memory and were not re-checked here.

**What the sources support**
- **Pad as glue, pluck/arp as drive.** Producer sources agree: the pad sits under the harmony and fills gaps in a sparse mix; plucks have a fast attack that cuts through and stresses rhythm; swapping pad for pluck, or legato for staccato, changes the perceived energy of a section. The standard pairing is a sustained pad with a rhythmic pulse or arp, "to fill space while maintaining momentum" (Sound On Sound, Future Music, glossaries). This is the core case for `split`.
- **Guide tones, root left to the bass.** Jazz comping practice: the third and seventh define the chord, the fifth is optional, the bass covers the root, and shell voicings are root + guide tones. Guide-tone voicings are "shell voicings with the root removed" for exactly that pairing. This supports rule 2 (chord-tone ownership) and the existing `padRoot` option. Extra colour or fuller voicings are used sparingly in an ensemble.
- **Spacing.** Huron's perceptual derivation of voice-leading rules (from auditory stream segregation) says close pitches fuse into one stream, voices should resist crossing and overlap, and concurrent tones that start together fuse. For two layers: keep a register gap (rule 1), avoid unisons / octaves / fifths between them on the same beat (fusion), and prefer onsets that do not coincide so the layers stay two streams (rule 3). The grounding doc already records the critical band as about 3 semitones near middle C and wider below, with sustained pads occupying their range continuously. Low intervals muddy sooner than high ones, which is why the pad drops its root and stays above about G3.
- **Pads collide more than hits do.** A sustained pad occupies its band continuously, so two pads clash where two drum patterns would not. Another reason `split` is one pad plus one pluck, not two pads.
- **Two rhythmic layers need different step counts.** Sound On Sound: different step lengths on layers A and B keep them from locking. So the rhythm layer's step should differ from the lead's rhythm, and a `split` preset should not put its sequence in the same subdivision as the lead's busiest cells.
- **Density as an arc.** Berry's texture theory treats density (number of simultaneous components) and compression as structural, and arrangement guides describe building by adding layers over a section. This is the basis for section entrances (rule 5) and the attack budget (rule 4). Adaptive game scores do the same, stacking synchronised layers that fade in over one timeline for intensity, and switching segments for large state changes. Our sections already play the second role, and `split` gives the first.

**How it applies by genre or use** (practice conventions)

| Context | Pad's job | Rhythm layer's job | `split` fit |
| --- | --- | --- | --- |
| Cozy / lo-fi | warm bed, soft attack | slow arp or plucked pulse, sparse | strong with a quiet pluck; keep the pluck dry and low |
| Ambient / sleep | the whole piece | little or none | `pad`, or `split` with a very slow arp that enters rarely |
| Synthwave / outrun | wide saw pad, held | 8th or 16th arp ostinato | strong; the genre is built on this pair |
| Trance / house / progressive | pad holds through breakdown | pluck or stab carries the groove; pad and bass duck to the kick | strong, with sidechain on the pad; pad in breakdown, stabs return in the drop |
| Chiptune / game overworld | none (the arp implies the chord) | arp or pulse implies harmony | `rhythm`, or `split` for the later "orchestrated" version of a theme |
| Cinematic / minimalism (Glass, Reich) | sustained harmonic bed | ostinato that builds by adding and shifting layers | strong; layers enter in sequence (rule 5) |
| Jazz / bossa / lounge | shell or guide-tone comping | rhythmic comping figure | one instrument playing both is the norm, so `combined` stays right |
| Solo piano | none | none | `combined`; one instrument, two hands |

**Implications for the rules**
- Rule 1 corrected: no unisons or octaves between layers except on chord changes (fusion there is wanted).
- Rule 3: stay off the pad's attacks to keep two streams, but allow the chord-change downbeat, where onset synchrony makes the two read as one new chord.
- Rule 5: matches the layering practice in game scores, EDM breakdowns and minimalist builds.
- Keep the sidechain-style ducking as a groove tool and not a constant pump (producer guidance); the pad ducks lightly, not fully.
- Nothing found argues against a separate rhythm voice. The only genre where one voice is clearly right is solo piano and similar single-instrument styles, which `combined` already covers.

Sources: [Sound On Sound, creating electronic rhythms (layers A and B)](https://www.soundonsound.com/techniques/creating-electronic-rhythms-steinberg-padshop-2), [Future Music, making textures from pads](https://www.pressreader.com/australia/future-music-9629/20170309/282699046914285), [Production Expert, 7 tricks for better pads](https://production-expert.com/production-expert-1/2020/10/22/7-tricks-for-making-better-pads-in-your-music-productions), [pad and pulse techniques (glossary)](https://bennysutton.com/glossary/pad-and-pulse-techniques), [The Jazz Resource, shell voicings](https://www.thejazzresource.com/shell_voicings.html), [Huron, Tone and Voice](https://www.scilit.net/publications/94cabd5623d929e69eb16f5bd5ad72a0), [Robin Hoffmann, low interval limits](https://www.robin-hoffmann.com/dfsb/low-interval-limits), [Berry texture and density-compression](https://periodicos.ufmg.br/index.php/permusi/article/view/40979), [Cedar Sound, EDM building blocks](https://www.cedarsoundstudios.com/blogs/news/the-building-blocks-behind-todays-biggest-electronic-hits), [Adaptive music, vertical layering](https://sounddesign.irpr.agency/glossary/vertical-layering/).

## Existing presets that would benefit from `split`
Chosen by rhythm class with no pad under it, or mixed classes that already alternate between the two jobs. Not heard in this form; each is a guess to try.

**Fast or driving, currently rhythm-only with nothing holding the chord** (a pad under them is the clearest win):
Zero Fun Zone, Zero Fun Zone v1, Mildly Alarmed, Big Blue-ish, Robot Factory Rush, Haunted Staircase, Oxygen Debt, Amber Transit, Hull Breach Brunch, Slightly Slower Than Light, Mushroom Kingdom Commute, Falling Blocks Folk Dance, Tall Grass Route, Long Way to Sunrise, Rooms Above the Clouds, Orbital Afterglow, Pocket Circuit, Neon Overpass, Rainfall Breaks, Heroic Field Trip, Dark Mirror Dimension, Boss Fight Politely, Bounty Hunter Basement.

**Slower rhythm-only presets that would gain warmth under the pluck:**
Pastel Coastline, Tine and Tide, Cold Drifts Warm Socks, Falling Stars Mostly Harmless, Clockwork, Glass garden, Fireside folk, Desert dusk, Slightly Lost Forest, Lantern Circuit, Night drive, Plotting a Course.

**Mixed presets that already switch between pad and rhythm styles:**
Outrun After Midnight, Wet Pavement Two-Step, Oxygene Sunrise, Getaway Driver Off Duty, Outrun Lullaby, Nightcall Voicemail, Late Show Lounge, Bittersweet Sunday, Late-night brushes, Tape memories, Study session, Demo: Two-minute wave, Demo: Groove slider, Demo: Opening out.

**Sequencer lane presets (stage 6):** Slow House Sunset, Deep Pocket Daydream, Disco Ride Afternoon, Progressive Night Bus, Uplifting Trance Departures, Warehouse Lift. A held pad under the stabs is what trance and house arrangements use.

**Leave on `combined` or `pad`:** the piano presets (Solo Grand, Pure Piano, Felted Piano, Ambient Piano), because one instrument playing both is the point; all the pad-class presets that are meant to be bare (Deep night, Underwater, Choir at sea).

## New presets to show it off
Names are placeholders. All voices named exist now.

1. **Demo: Pad under pluck.** Layers `split`, the same preset heard in each mode by flipping the selector. Velvet Pad plus Kalimba Pluck at 84 bpm, defaults for everything else. The teaching preset for the feature.
2. **Harbour Lights After Rain** (cozy, 78 bpm, lofi drums): Breathing Pad held low, Music Box arpeggio above; section intro is pad only, rhythm enters in the build.
3. **Night Shift Arcade** (synthwave, 108 bpm): Neon Saw Pad held, Arp Pluck running sequence in 16ths, bass on the root, the pad on guide tones only. An answer to Outrun After Midnight.
4. **Overworld, Layered** (game, 128 bpm): Heroic Strings held, Pixel Piano pulse on the beat groups, lead on top. A fuller version of Mushroom Kingdom Commute.
5. **Chapel Pulse** (slow, 70 bpm): Tremolo Organ held and Harp Pluck on slow arpeggio, a wide-register example where the rhythm layer sits well above the pad.
6. **Starlight Over the Pulse** (dance, 122 bpm): Starlight Pad under Warm Organ pulse and the 808 kit; shows ducking and the kick pump with a pad present.
7. **Breakdown Test** (136 bpm sequencer): Warehouse Lift arrangement with the stabs on the rhythm layer and a held Supersaw pad that stays when the stabs drop out in the breakdown.

## Risks
- **Mud.** Mitigated by rules 1 to 4 above; the stage 2 metric must show `split` no worse than `combined` before presets are converted.
- **CPU on mobile.** A second voice always sounding. Check on the Pixel (5.5) and respect the low-CPU work in the roadmap.
- **Loudness.** A new role in the loudness weights, and a pad under a pluck changes the perceived level; presets need compensation (5.4).
- **Share links.** Fields are append-only; one new group for `layers` and the rhythm range, and the rhythm voice codes appended, never reordered (4.1).
- **UI breadth.** The second lead (`counter`) touched about 50 files; this is a similar size. Staging keeps each step testable and the default sounding as today.

## Working order
1 then 4.1 (so links never break), then 2, then 3, then 5. Stage 6 last, because the lane presets are the least heard. Stage 7 is independent of the layers: its measurement (7.1) can run first, and its `voicing` setting can ship on the single pad voice before `layers` exists.
