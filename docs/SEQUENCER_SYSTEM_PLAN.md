# Sequencers as the front page's playhead (design, 2026-11-06)

Status: phase 1 built 2026-11-06 (uncommitted): `src/seq/harmony.js` (key, degrees, chords with manual inversion / open / spread / bass, range fitting, the harmony and `resolveNote`), `src/seq/notes.js` (pitched steps: ties, gate, strum, repeats, conditions; `projectStepEvents`), `src/seq/targets/synth.js`, and the throwaway page `/synths/all` (`src/synths/all/AllPage.jsx`; added to `SYNTH_PAGES`, so a public build would publish it unlinked like the other sandbox pages). Decisions taken: patterns are project-level slots, stored notes are degrees (`{d,o,a}`) with an absolute fallback (`{midi}`). Octave handling: a per-sequencer `octave` plus a `range` that shifts a whole step by octaves, so chords keep their voicing; chords have manual `inv`, `open`, `spread`, `bass`. **Phase 2 started 2026-11-06 (uncommitted), replacing the first form page:** `/synths/all` now runs on the front page's Generator as the orchestra (`src/synths/all/host.js`). A scene's settings drive the generator's own planner (`Generator.planner()`, offline, no audio), `src/seq/capture.js` turns the plan (chords, and the events of every role) into patterns of scale-degree steps (`captureProject`; pad and rhythm are poly steps, the others note steps), and the sequencers play those patterns on the generator's role instruments (`scheduleNote`), so sounds are loaded the way the main and ensemble pages load them: the scene's voices, or a patch of any classic or DIY synth (level-matched through `ensemble/sources.js`; the role's curated pick, `ROLE_PICKS`, by default). The page uses the real device components (SeqScreen, LaneGrid, the key rows): sequencer select keys, rows are the scale's notes (names follow the octave), pads edit the selected sequencer's notes, encoders for octave, gate, tempo and the row window. Not yet: percussion (the drum sequencer), chord mode and chord steps (the harmony leader), the arp stage, saving the project, a song of several patterns, adding and removing generators (each sequencer has one selector), per-role racks and mix, generator options beyond the scene and seed. Phases 2 onward are otherwise not started. Follows [SEQUENCER_DEVICE_PLAN.md](SEQUENCER_DEVICE_PLAN.md) (the drum device, mod lanes, the global clock) and uses the OXI ONE MKII manual (v2.2.5b; chord mode p.146, arpeggiators p.100, performer p.111-116, harmonizer p.188, sequencer overview p.122).

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
