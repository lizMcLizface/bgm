# Sequencers as the front page's playhead (design, 2026-11-06)

Status: phase 1 built 2026-11-06 (uncommitted): `src/seq/harmony.js` (key, degrees, chords with manual inversion / open / spread / bass, range fitting, the harmony and `resolveNote`), `src/seq/notes.js` (pitched steps: ties, gate, strum, repeats, conditions; `projectStepEvents`), `src/seq/targets/synth.js`, and the throwaway page `/synths/all` (`src/synths/all/AllPage.jsx`; added to `SYNTH_PAGES`, so a public build would publish it unlinked like the other sandbox pages). Decisions taken: patterns are project-level slots, stored notes are degrees (`{d,o,a}`) with an absolute fallback (`{midi}`). Octave handling: a per-sequencer `octave` plus a `range` that shifts a whole step by octaves, so chords keep their voicing; chords have manual `inv`, `open`, `spread`, `bass`. **Phase 2 started 2026-11-06 (uncommitted), replacing the first form page:** `/synths/all` now runs on the front page's Generator as the orchestra (`src/synths/all/host.js`). A scene's settings drive the generator's own planner (`Generator.planner()`, offline, no audio), `src/seq/capture.js` turns the plan (chords, and the events of every role) into patterns of scale-degree steps (`captureProject`; pad and rhythm are poly steps, the others note steps), and the sequencers play those patterns on the generator's role instruments (`scheduleNote`), so sounds are loaded the way the main and ensemble pages load them: the scene's voices, or a patch of any classic or DIY synth (level-matched through `ensemble/sources.js`; the role's curated pick, `ROLE_PICKS`, by default). The page uses the real device components (SeqScreen, LaneGrid, the key rows): sequencer select keys, rows are the scale's notes (names follow the octave), pads edit the selected sequencer's notes, encoders for octave, gate, tempo and the row window. Not yet: percussion (the drum sequencer), chord mode and chord steps (the harmony leader), the arp stage, saving the project, a song of several patterns, adding and removing generators (each sequencer has one selector), per-role racks and mix, generator options beyond the scene and seed. Phases 2 onward are otherwise not started. Follows [SEQUENCER_DEVICE_PLAN.md](SEQUENCER_DEVICE_PLAN.md) (the drum device, mod lanes, the global clock) and uses the OXI ONE MKII manual (v2.2.5b; chord mode p.146, arpeggiators p.100, performer p.111-116, harmonizer p.188, sequencer overview p.122).

**Progression arrangement started:** `/synths/all` captures generator cycle boundaries. Arrangement replaces the note grid with the device's eight-row pad grid: each column is a progression, each row a sequencer, and a dot means that role has notes in that progression. Pads select a sequencer and progression; the Mute and Solo control buttons switch the row buttons between sequencer-wide mute and solo. The progression knob scrolls through arrangements longer than sixteen columns. Transport loops the selected cycle by default or plays the arrangement. The captured role patterns are still stored as whole-song step arrays. Previously saved projects without cycle metadata open as one progression.

The page prepares a song on open without waiting for playback; Play resumes audio on user interaction. New songs use a requested count of complete progression cycles (four by default), rather than a bar count. A saved song is restored instead of overwritten.

On a fresh session or when a scene or front-page setup is opened, the mixer selects the same initial pad or rhythm as the sequencer. Setup-file restoration preserves the saved mixer and sequencer selections independently.

Front-page preset names, share URLs and copied setup JSON can be opened from the ribbon. A link in the All page's own address takes precedence over a saved song. The address is not rewritten as the song or controls change; choosing a built-in scene replaces it with that scene's preset link. A downloaded All setup also retains an imported scene.

Unmoved voice windows follow the sequencer: the synth is above it, the effects rack is centred to its left, and the tuner is centred below the rack. Dragged positions remain independent and Reset layout restores these defaults, including when effects are hidden. Fit All measures the visible panels and keyboard, not the empty instrument home area or hidden panels.

Arrangement and progression views share the same uninterrupted grid display and horizontal and vertical knob positions; unavailable controls remain visible but disabled.

The progression grid now has scale-row and octave-row views, a scale/off-scale switch, a chord timeline that changes interval labels and colours while keeping pitch positions fixed, and a page knob limited to the selected progression. It starts at the coarsest resolution for the meter. In arrangement view selecting a sequencer row opens its editor; the Mute and Solo modes instead use the row buttons for those actions, and tapping the active mode again returns to selection. Taps insert or remove the selected pitch and octave without replacing other pitches at that step; the bottom row indicates off-scale notes.

The generator's percussion is captured as drum hits on a sixth sequencer. The Voices card can select scene kits, a basic generator kit, or an 808, 909, 707 or 606 machine and its presets without replacing the pattern. Identical scene kits share one picker entry; a scene still loads its own drum settings. The Synth button uses the existing kit or machine voice controls; Effects is independent, and room is on the mixer. The common grid keeps the fourteen generator slots and adds lanes for extra machine tracks; when a kit lacks a track it plays the nearest common drum instead. Saved finite songs retain their kit selection and edits. The voice knob scrolls the lanes and arrangement mute/solo applies to drums as to other sequencers. Older saved projects have no captured drum part until a new song is generated. Pitched pads use the main piano's interval colours: chord tones relative to the chord root, other scale tones relative to the scale tonic, and off-scale notes in the sequencer colour. Stacked pitches in octave view share a multicolour pad. Older saved songs without chord pitch metadata use their scale colours.

Note labels and pitch-selection buttons use interval colours and names relative to the selected chord root, or the scale tonic when no chord is selected. Octave controls and drum labels retain the sequencer colour.

In octave view the rows are labelled by octave, while the pitch buttons and their adjacent note labels use the same top-to-bottom pitch order as scale view, including off-scale pitches.

The Insert control switches between notes and placed chords. Chord mode uses octave rows: tap an empty pad or drag horizontally to insert a chord rooted at the progression chord at the start; tapping an existing placed chord selects it, cycling through layered chords. Shift-click inserts on an occupied pad instead. The Chord overlap menu defaults to replacing notes and placed chords in the selected root octave over the inserted interval, splitting holds at its boundaries; Layer keeps them. Notes and placed chords are saved together and can sound simultaneously. Their pad highlights appear in note views as well as chord view.

The selected placed chord's Chord page has root voicing (on, down one or two octaves, or off), colour (normal, sus2, sus4, add7, add9), complexity (power, triad, seventh), and inversion. Its Arp page sets at-once or arpeggio playback, direction (up, down, random, up/down, down/up, or the generator's broken pattern), note hold (to chord end or one to three arpeggio notes), and rate (one, two, four, or eight underlying timing steps per note). Chord and arpeggio holds are clipped to repeated spans and resume at loop boundaries. The progression's bar-dividing chord remains separately selectable on the Bars page.

The generator tags its pad and rhythm chord-part events with their source root and playing style; captured notes retain that provenance. Chord mode displays those explicitly tagged groups without guessing from unrelated simultaneous notes, and playback remains the original captured events until a chord or arpeggio control is changed. Changing one of those controls converts the group into a placed chord and its generated playing configuration. Older saved songs have no provenance; generate a new song to see these groups. Notes without chord provenance remain individual notes.

Edit mode selects an item without changing it; tap again to cycle a stack, and Shift-tap to add other pads. The Note page adjusts velocity, length in underlying steps, gate and chance on the selection. Generated chord-group metadata edits apply to its member notes; chord or arp edits convert the group. Copy mode selects a source on its first tap, then pastes it repeatedly at destination pads until Copy is turned off. Copies retain their settings and length, clipped at the progression boundary; octave rows move the copy by octave. Generated chord copies preserve their original notes.

Delete mode works in either pitched grid. A single item deletes on tap; tap a stacked pad repeatedly to cycle through its notes, placed chords, and all, then press Confirm Delete. Hold a pad for 600 ms to delete its whole visible stack. Deletion removes the selected note or placed chord for its whole duration. In chord mode the stack is grouped by chord root octave; in note views it is grouped by the displayed pitch or sounding octave. Chord objects follow progression chord transposition and are split at moved chord boundaries.

Selecting a chord opens its display and four controls: octave, scale degree, start and end. Transposition changes pitched notes across all sequencers within the chord; percussion is untouched. Boundary changes cascade through adjacent chords within the progression, preserving at least one bar per chord and remapping transferred notes by scale degree. Sustained notes crossing a moved boundary are split there. Selecting the chord again returns to the scale view. Transposition of older saved chords without pitch metadata is unavailable and reports an error; generate a new song to use it.

The repeat control cycles through progression, song, bar and chord. Bar and chord repeat use the audible playhead's current position; switching modes continues at the next unbooked step on the same audio-clock schedule. Already booked steps finish before the new mode takes effect. Held pitched notes crossing into a repeated span resume at its start and are clipped at its end. Degree transposition retains the ordered scale-degree chord tones and names them with scale spelling and conventional extensions; octave-only changes leave the chord name unchanged.

The Seq display's Resolution knob selects the grid's note value. Quarter-note meters offer quarter, eighth and sixteenth views; eighth-note meters offer eighth, sixteenth and thirty-second views, matching the underlying four steps per meter unit. Pads cover that interval and held notes are marked on subsequent pads. Editing replaces overlapping instances of the selected pitch (or drum lane) within the interval, leaving other pitches and lanes intact; tapping a single matching note spanning exactly the interval removes it. Independent note durations preserve overlaps during playback. Existing projects retain their legacy step durations until edited; saved projects without meter metadata use the saved scene's meter.

Drag pitched pads horizontally to replace matching notes with a held note covering the dragged interval. Sustained pads are dimmed; in scale view lower octaves are darker and higher octaves brighter than the selected insertion octave. Hold the Shift button or keyboard Shift and select an octave to temporarily display only that octave, without changing the insertion octave. During playback, Shift-click a chord to jump to and loop it temporarily; releasing Shift resumes the previous repeat mode from the next unbooked step without interrupting the audio clock. Playback follows the audible playhead in four-pad increments when it reaches the edge, including across progressions and loop wraps.

## The idea

The front page's generator already is a leader and followers: it makes a chord progression in a scale (the leader), and a pad, bass, lead, second lead, rhythm part and percussion that follow it (the followers). The OXI's harmonizer is the same arrangement with hands on it: a chord or poly sequencer is the primary leader, the other sequencers follow its pitch.

So: the sequencers are the generator's parts made visible and editable. A generated song is *captured* into them (one sequencer per role), edited there, and played from them; a sound generator (a synth, a drum machine) is connected to each sequencer. The front page and the sequencer page are two views of one model, not two engines.

## What already exists, in the OXI's words

| Front page (generator) | OXI idea | Where it is |
|---|---|---|
| scale, tonic, chord progression, complexity, voicings | chord mode: rows are the scale's chords, per-step type, voicing, spread, bass | `app/theory.js`, `progressions`, `arranger.js` |
| pad styles: sustain / rolled / stacked / pulse / arpeggio / sequence | hold (ties), strum, stacked chord entries, repeats, arpeggiator, poly steps | `arranger.js` `HELD_STYLES`, `RUNNING_STYLES`, `ARP_PATTERNS`, `PULSE_PATTERNS` |
| lead, second lead (counter), bass, rhythm | mono sequencers following the chord leader (harmonizer) | `arrangeBar` roles |
| percussion | multitrack / drum grid | the drum pages (done) |
| sections, phrases, layer flow | patterns and the song (chain of patterns with repeats) | `arrangementBank`, the arranger device (done for drums) |
| sequencer panel stages + lanes (`x f h s a` rows) | step grid with tie / chord / arp steps | `app/sequencer.js` `sequencerLanes` |
| effect moves per stage | mod lanes | done on the drum pages |

`arrangeBar` is pure (bar, chord, scale, settings, rng in; events in beats out), so a generated song can be run offline, with no audio, and captured.

## Model

- **Project**: key (scale + tonic), meter, tempo, the **harmony** (below), up to **8 sequencers**, **patterns** and a **song**.
- **Harmony (the leader)**: the chord progression as a list of chords over bars (chord, type/complexity, voicing, bass). It is owned by the chord sequencer (pad role) and is what the others read. Changing it (a step, a transpose from Perf) re-harmonizes every follower, as on the OXI.
- **Sequencer** (8; six get roles: lead, second lead, rhythm, pad, bass, percussion): a **mode**, a **role**, a **target** (a sound generator), a **follow** setting (Scale: degrees of the project key; Chord: snap to the leader's current chord tones; Off: absolute pitches), and its own mod lanes, generators, conditions (all built).
- **Patterns are project-level slots**, like the drum page's 1A..8H: pattern *n* holds one set of rows per sequencer (any may be empty). A pattern is a section; the **song** is a list of `{pattern, repeats}` (exists in the arranger device). One pattern switch (with the pattern change quantize that exists) changes every sequencer together, which is what the generator's phrases and sections are. (OXI keeps patterns per sequencer; we do not need that independence, and it makes "generate a song, edit it" much simpler. A per-sequencer override can come later.)
- **Provenance**: each pattern cell (sequencer x pattern) is `generated` or `user`. A generated one is read-only and, in live mode, regenerated by the generator; editing it (or "Freeze") copies it and makes it `user`. This is the "fully generative mode cannot be edited" rule, made explicit per cell.

## Sequencer modes and what the rows are

| Mode | Rows | A step holds | Role |
|---|---|---|---|
| Drum (multitrack, exists) | voices (BD, SD, ...) | hit + step values | percussion |
| Note (OXI mono) | notes of the scale, scrolled by octave; labels are note names | one note | lead, second lead, bass |
| Chord | the scale's chords by degree (I ii iii IV V vi vii°), labels are chord names | one chord (up to 8 notes) with type, voicing, spread, strum | pad (the leader) |
| Poly | notes | up to 7 notes | rhythm, and chord-like parts |

Notes are stored as **scale degree + octave (+ accidental)**, not MIDI numbers, so they follow a key or chord change; "Off" follow mode stores the absolute note. Chord steps store the degree and the chord parameters, and resolve to notes through the harmony. Ties are the chord *hold* (pads); the OXI's inverted tie (fills) is a generator, not a data type.

## One pipeline, arpeggios included

```
step  ->  mode (note / chord / poly)  ->  note set
      ->  harmonizer (degrees -> pitches, through the leader)
      ->  [arp]  (optional: note set -> notes over time)
      ->  step parameters (repeats, probability, conditions, velocity, gate, strum, nudge)
      ->  mod lanes  ->  target
```

The arp is a stage, not a mode (the OXI: "a sequence within a sequence"; it has a chord/poly arp driven by the grid and a keyboard arp). It takes any held note set (a chord step, a poly step, keyboard notes with Hold) and its settings are the OXI's: type (up, down, inc, exc, random, order, up x2, down x2), octave range, gate, its own division, accent from a groove, a Euclidean length/pulses/repeats, reset, latch. The generator's `arpeggio`, `pulse` and `sequence` styles are presets of this stage; `rolled` is strum; `stacked` is a chord whose notes enter one by one. So the generated song and a hand edit use the same vocabulary, and "Freeze" is lossless for the structure (chords, arp settings) rather than a pile of notes.

The core already has the per-step half (events with params, locks, conditions, ratchet, polymeter, mod). What is new is events that carry pitches, and the harmonizer and arp stages in front of it (`src/seq`, pure and testable).

## Generator <-> sequencers

- **Capture** ("Generate a song"): run the generator offline for N phrases; chords -> chord steps in the pad sequencer (as degrees + chord parameters); lead, second lead, bass -> note steps (degree + octave); rhythm -> poly or arp steps; percussion -> the drum sequencer (the arrangement recipes already do this). Each phrase or section becomes a pattern, the section order becomes the song. Up to X patterns (a setting; the pattern bank is 64).
- Timing is quantized to the step grid (16ths, 32nds for fast figures). The generator's expression (humanize, gate, vibrato) is applied at playback, as now, so little is lost; non-grid timing is the part that is.
- **Live mirror** (the earlier plan's first step): while the generator plays live, the sequencers show what it plays, read-only. Freeze captures it.
- **Edit**, then play from the sequencers (the generator stays out), or keep it in the loop on cells still marked generated.

## Connecting sound generators: a `synths/all` page

`/synths/ensemble` already runs the real Generator with one sound per role (lead, 2nd lead, pad, bass, percussion; any classic synth, the calmbgm voices, a drum machine). The new page is that with the sequencers between the generator and the voices: add a sound generator, assign it to one of the 8 sequencers, and the sequencer plays it through a **synth target**. The live engine already takes timed `noteOn(id, note, velocity, time)` and `noteOff(id, time)` (`liveSynth.js`), so a target is small. Polyphony and per-role racks come from the ensemble page. The drum machine is the existing drum target.

On `/synths/all`, named scene sounds are loaded as their corresponding individual synth presets (including DI-Poly, DIY FM, piano and measured instruments). Each voice has independent Synth and Effects windows; DI-Poly, DIY FM and piano also have a separate Tuning window. The effects window uses the synth pages' compact rack, with each preset's own cleaned chain and rack settings.

The page ribbon independently shows or hides the Generator and Ambience panels without resetting their controls. The generator's scene preset encoder and the ribbon's scene selector load the same scene; restoring the scene's song reloads its settings and voices.

On that page delay and reverb run in a separate per-channel mixer stage after the instrument rack, including the piano, measured-instrument and drum-kit room sends. The piano and measured-instrument Room controls follow the mixer reverb send. This replaces their native rooms with the rack reverb; its sound is not identical to the original room. Mixer gain and the rack output trim are one control, including when the rack is bypassed. The rack wet/dry control applies to each of the two stages separately, so intermediate mixes differ from a single unsplit chain. Channel, ambience and stereo master meters tap the real audio; headroom has no source. Mixer channel gain, delay and reverb are live; the other desk controls are visual mock-ups.

On a fresh page the generator defaults to continuous mode: one persistent planner creates complete progressions as playback advances, with four future progressions buffered and three previous ones retained by default. Setup controls the finite lookahead and history, including unlimited session history. Pausing and selecting a retained progression resumes from it; already-buffered progressions are replayed before further generation. The rolling buffer and its edits live only for the current session, while the setup preferences are saved; switching to continuous mode does not overwrite the saved finite song, which is restored in song mode on reload.

The default desk places the sequencer and keyboard on the left, with the mixer and voices to their right; the generator above the sequencer, ambience beside the voices, and scope beside the mixer start hidden and can be opened from the ribbon. The scope taps the actual master output, including ambience and master gain. **Fit all** excludes hidden panels. Dragged positions remain saved; **Reset layout** restores the default arrangement without deleting a saved song or continuous-buffer preferences.

Fresh sessions and newly selected scenes initially show a pad or rhythm part with notes in the first progression, preferring the pad when both play. Clicking a voice card or selecting a mixer voice channel opens its sequencer; the ambience and headroom channels have no sequencer. Card controls still operate independently, and saved setups restore their selected sequencer.

The All page's **Save setup** and **Open setup** buttons download and load a versioned JSON file. It contains the scene and generator settings, the edited sequencer tracks and progression buffer, instrument and drum-kit selections and edits, effects and mixer controls, ambience panel state, and tuning. Opening a file stops playback; it does not start it automatically. For continuous sessions the saved buffer is preserved and the original planner is replayed to continue generating the same progression sequence; very long sessions take longer to open (the file supports up to 100,000 generated progressions and 16 MB). Invalid files or sound-loading failures leave the existing setup in place. Tuning is shared across the synth pages, so opening a setup also updates their tuning. Device-specific MIDI/keybed preferences and window positions are not included. Ambience and the non-live mixer controls remain visual mock-ups; saving them does not make them audio controls. Automatic browser persistence still applies only to finite songs, so save a file to keep a continuous session across reloads.

## On the page (the drum device, extended)

- **Sequencer select**: a button over the voice buttons (BD, SD, ...). Pressed, the eight voice buttons become SEQ 1-8 (coloured by role, with a short role label); tapping one switches the grid to that sequencer. The row labels then follow the mode: voices, note names, or chord names.
- **Fourth key row** on the left panel (the panel grows slightly): **Hold** (chord hold / keyboard latch), **Mode** (drum / note / chord / poly for the selected sequencer), **Arp**, **Keys** (the keyboard / chord palette view, as the OXI's [Keyboard]).
- **Perf**: the performer grid as the OXI's, rows are sequencers; per row: mute, transpose -/+, rotate -/+; for chord and poly sequencers the stored chord slots (12), hold, ignore sequence, play. Transposing the chord sequencer transposes the harmony, so every follower moves with it.
- The Gen tab gains what each mode has (generators per mode, as the OXI's table: note, poly, chord and multitrack have them).

## Phases (each testable on its own)

1. **Harmony and notes in the core.** Scale/degree model, the harmony object, events with pitches, the harmonizer stage, `synthTarget`; tests only plus a minimal note sequencer on a throwaway page.
2. **Note mode** on the sequencer page: role + target, scale rows, piano-roll labels, ties; a lead or bass sequencer driving a synth from the `synths/all` page.
3. **Chord mode**: chord rows by degree, type/voicing/spread/strum, hold; the leader feeding followers (the harmonizer made audible).
4. **Arp stage** and **poly mode**, keyboard Hold/Latch; the generator's styles expressed as presets of it.
5. **Project-level patterns across sequencers**, sequencer select, the fourth key row, Perf grid.
6. **Capture**: generate-a-song into the sequencers; provenance, Freeze; the live mirror.
7. Generators per mode (note/chord random and Euclid), stochastic-style generation later.

Phases 1-3 are the large part; 4-6 mostly reuse what exists (the generator's pure functions, the arranger device, the pattern bank).

## Open questions

- **Project-level pattern slots** (recommended above) versus the OXI's per-sequencer patterns.
- **Degrees versus MIDI for stored notes**; recommended degrees, with an absolute fallback. Chromatic generated notes need an accidental field.
- **How many patterns** a generated song makes (one per phrase, one per section type, or one per distinct 4-bar phrase), and whether repeats are merged.
- Whether the `synths/all` page grows out of the ensemble page (recommended) or is a new page that imports its parts.
- The OXI's other modes (stochastic, matriceal, domino, saga) are out of scope; the stochastic generator is the closest to what the front page does and may become a generator rather than a mode.
