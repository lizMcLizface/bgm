# Sequencer as a separate device

Plan, 2026-11-04. Nothing built. Discussed with the user; the first stages are display-only and exist to find where the current model and the UI disagree.

## Why

- The sequencer is baked into each drum page (`src/synths/seq/useSequencer.js`, a shared hook, but each page defines its own pattern format through `patternCommands` / `empty` / `valid`) and bolted onto the main page (`src/app/sequencer.js`, `SequencerPanel.jsx`, a rule-based arrangement generator tied to the 808/909 voices, with `lanes` driving `pad` and `bass`).
- Two sequencers that both know too much about what they play. Expression, vibrato and voicing decisions are scattered (`composition/noteExpression.js`, `engine/noteExpression.js`, per-voice settings).
- Model: the OXI One. A sequencer is a separate device from the drum machine (a Behringer RD-8 / RD765 style box); they meet on a connection. Our connection is an internal, typed event bus. Real MIDI is only another source and target on the same bus, later.

## Shape

1. **Sequencer**: emits timed events and owns transport, clock, patterns, chains, swing, probability, per-step locks, the arrangement. Knows nothing about kicks or chords as such.
2. **Generator**: fills sequencer tracks. A generated track and a hand-drawn one are the same data. Each track has `source: 'generated' | 'manual'`; the generator refills generated tracks and never touches manual ones. Editing a generated track flips it to manual.
3. **Targets**: drum machine, each drum voice, pad, bass, rhythm, lead. Each declares the notes it takes and a registry of named controls (expression, vibrato, filter, voicing, send levels...).
4. **Routing**: a track points at a target (`Drums/bd`, `Pad/vibrato`). Track types: drum, note, chord, modulation lane.

Keep the bus internal and typed; do not serialize to MIDI bytes (float parameters and per-step locks would be lost). Web MIDI in/out and MIDI learn come last and only need the target control registry.

## Contract between generator and sequencer

- Generator writes **resolved events**, a short horizon ahead (one bar or one chord span; `sequencerBar` is already per bar and seeded). Intensity, mood, key and preset changes land from the next fill.
- The sequencer owns the lookahead buffer and schedules on the audio clock (the existing worker / worklet scheduler), never through React. Mobile is CPU-bound; this is the risky part.
- A step carries either a concrete `pitch` or a scale-relative reference (see Chords) that is resolved when scheduled.
- Expression (vibrato, swell, voicing change) travels as parameter events on a track next to the notes. Decisions now made per note in `noteExpression` move into generator output; voices apply what arrives.

## Chords (from the OXI One)

The OXI treats a chord as a step: a scale degree plus Type, Voicing (inversion / open), Spread (extra upper-octave notes), global Bass, per-step Strum (-100..100 %). Everything is scale-relative, so changing scale or root moves the pattern. Auto voicing picks inversions for smooth leading. A separate arpeggiator reads the chord stage. We adopt:

- Chord step fields: `degree`, `type`, `voicing`, `spread`, `strum`, plus a track-level `bass`. The generator already decides these implicitly (voicing modes free / hand / guitar / auto, `chordSize`, `padRoot`); naming them lets generator and human edit the same fields.
- Pipeline: chord stage -> arpeggiator (type, octave range, accent, division, groove, reset) -> voice.
- Concrete pitch stays as the fallback; the scale-relative form is what lets a hand-edited chord row follow key and progression changes.

## Harmony lane (the first thing built)

A global lane that every track reads, shown above the beat grid.

What exists today (checked in `Generator.js` 1323-1342, `composition/harmonicRhythm.js`):

- A progression is a list of numerals (`PROGRESSIONS[...]`, or a generated cycle's own `numerals`) plus per-slot `borrows` and a colour. `chordAt(bar, music)` builds the chord for the slot containing the bar.
- Slots are whole bars. Base length is `settings.barsPerChord`; `harmonicDurations` shifts bars between the first slots by section type and keeps the last two on the reference grid for cadences. Chords change only on bar lines.
- The next cycle is planned a cycle early; changes in intensity / mood apply from the next planned bar.

Lane schema (slots in beats, so a finer grid later is not a schema change):

```
{ start, length,            // in beats, from the song start
  numeral, borrow, unresolved,
  chord: { root, quality, notes[] },   // resolved
  section?: { type, index } }
```

Display: blocks spanning their bars, labelled numeral and chord name (`V7 · G7`), borrowed / unresolved marked; bar numbers and beat ticks underneath, beat count from the meter (odd meters handled). Shows the planned cycle, including the next one. Read-only at first. Editing a slot later turns the harmony lane manual.

## Stages

1. **Harmony lane, read-only, on the main page.** Pure display. Purpose: an impedance check. Write down, while building it:
   - what the generator knows but the stored settings / share code cannot hold (planned cycles, generated numerals, durations, section type, colour);
   - what the UI wants to show but the generator never computes;
   - what could be generated but is not (sub-bar chords, per-step voicing, strum).
   Record the findings at the end of this file.
2. **Split view on the /synths drum pages**: left sequencer, right drum machine, as a trial ground for the direct sequencer-to-instrument UI. Define the event and target-control schema here, extract a device-agnostic core from `useSequencer`, and move one drum page onto it. Playhead, per-step locks, a pattern chain, track strip with target assignment.
3. **Main page**: the generator emits tracks into the same core; redo `SequencerPanel` around tracks and lanes (known gaps there: no playhead in the grid, odd meters only tile 16 steps, stage per chord not per section boundary).
4. **Control targets as modulation lanes** (OXI model: step-grid value lanes, own division / length / smoothing / min / max, up to 2 destinations; a matrix with project and pattern scope; quick assign by long-press on a control; later MIDI learn). Collapses expression, vibrato, voicing into one interface.
5. **Chord step and arpeggiator stages**, scale-relative steps, strum.
6. **Web MIDI in / out and learn.**

Each stage ships separately; stages 1 and 2 touch no stored data.

## UX rules taken from the OXI

- Modes narrow the interface: a bass track shows bass options, a chord track chord options, a drum track voices.
- Three levels: global (sequencer), track, step. One gesture reaches the step level: hold a step, then move a control (touch version: hold, then drag a slider). The same control without a held step edits the global value.
- Pages instead of sprawl; a visible hint that more exists.
- Live performance (transpose, rotate, mute) kept apart from editing.
- Internal modulation is non-destructive: it sits on top of the stored value.

## Risks and open questions

- Audio-clock scheduling and the mobile CPU budget (above).
- Share codes and saved state hold sequencer data (`shareExtras.js`, `settings.js`, `library/scenes.json`); a new pattern format needs a migration. Drum-style share field is already full.
- Whether progressions live on a chord track or as a global lane: decided as a global lane that all tracks read.
- Sub-bar chord changes need generator work, not just UI; not planned.
- Generated vs. manual flag semantics when a user edits a generated track mid-song (flip immediately, or on the next fill).

## Stage 2 status (2026-11-04, uncommitted)

Built:
- `src/seq/core.js` (pattern step -> timed events: hit, flam grace note, swing, accent fraction), `scheduler.js` (audio-clock lookahead, chain, pattern lengths and tempos, reads the bank every step so edits are heard at once), `targets/drum.js` (a drum machine as a target: tracks, a control registry, `trigger` -> timed `noteOn`), `useCoreClock.js` (drives a drum page from the core), tests in `core.test.js`.
- The /synths drum pages (808, 909, 606) are split into two devices: Sequencer on the left (transport, pattern letters, chain, square-pad grid), drum machine on the right (tempo, selected voice, reverb, levels). A "Core clock (experimental)" switch on the sequencer picks who books the notes: the engine's own sequencer (default, unchanged) or the core. `useSequencer` gained an external-clock mode (`setExternal`, `setTransport`, `showPattern`).
- Checked in headless Chrome against the real engine: with the core clock a kick on steps 1, 5, 9, 13 at 120 bpm arrives as timed `noteOn` events exactly 0.5 s apart, the snare once per bar, play/stop and the playhead work; with the switch off no timed events are sent and playback is the engine's. Not heard.

Findings (what the engine's built-in sequencer does that a target cannot be told):
- **Accent is a kernel multiplier, not a velocity.** A note can only reach velocity 1, and `note_on` passes accent 0 (`drums.rs`), so the target spends the accent downward: the loudest hit is velocity 1, the rest sit beneath it. The kit plays up to 20 log10(1 + 0.9 x accent knob) dB (3.2 dB at the default 0.5) quieter than from the built-in sequencer, and `velocity.max(0.2)` floors quiet hits. An event needs an `accent` channel to a target, i.e. a per-hit parameter, which is exactly the "parameter lock" of the OXI design.
- **Flam gap, grace velocity and swing are kernel rules** copied into the core (`flamGap`, `GRACE_VELOCITY`, `swingDelay`); they now live in two places and can drift. The kernel's swing is on the engine's own step clock; the core's is on the scheduler's.
- **Voice limit.** The worklet's `held` set counts note-on keys; drum hits use one key per track (800 + track), so the polyphony cap does not bite, but a core clock plus the pad keys (900 + track) would share nothing. Fine today; a target registry should own the key range.
- **Timing source.** The page's timer only has to wake within the lookahead (120 ms); notes carry audio-clock times and the worklet plays them to the sample. A background tab throttles the timer to about 1 s, so a hidden tab would drop out; the built-in sequencer has no such weakness. The core would need a worker-hosted timer for that.
- **Reload:** the pattern bank is still the engine's format (rows of 0/1/2 plus an accent row). The core reads it through `drumPattern`; no stored data changed.
- **Not covered by the core yet:** MIDI clock follow (off while the core clock is on), the pad row's accent cycling is unchanged, per-pattern tempo is handled, nothing yet for modulation lanes or chords.

### Per-hit parameters (added the same day)

An event now carries `params` (named per-hit parameters) instead of a fixed `accent` field, and a core pattern may carry `locks` (`{ track: { step: { name: value } } }`, the OXI's parameter locks; a lock named `velocity` replaces the hit's velocity). The accent row arrives as `params.accent`. A target declares its parameters (`DRUM_PARAMS`: accent realized; tune and decay declared, not realized) and reports what it could not realize through `unsupported(event)` / `onIgnored`, so nothing is dropped silently. No UI for locks yet (the gesture is hold a step, then move a control).

What is missing for the rest (needs a kernel rebuild, no Rust toolchain on the dev machine, so not done):
- `Drums::note_on` passes accent 0 and a fixed velocity floor (`drums.rs` 678-681). A timed note that carries its accent would be the exact fix for the 3 dB: e.g. read the accent as the part of the velocity above 1 (`accent = (velocity - 1).max(0)`, velocity clamped to 1 for the gain), or a new timed event kind.
- Per-hit tune / decay / tone / pan: `trigger()` takes its knob values from `self.knobs[track]`; a hit would need optional overrides (a small struct passed through `queue`/`trigger`), and a timed parameter event in the worklet (`events` with a kind the processor applies at the hit's frame; parameter messages are not timed today).
- Mute / solo per voice: trivial in the core (skip the events) but impossible against the engine's own sequencer; a drum-machine "mute" would have to live in the kernel to work for both.

### Drum machine layout (after the Behringer RD-8 MKII)

Read from the RD-8 MKII manual (30 pages, PDF viewed in Chrome): a column per voice with Level, Tune/Tone and Decay/Snappy knobs and a SELECT button; Accent is the first column; every voice's main controls are in view at once; a display with a data encoder and DATA MODE for Tempo, Swing, Probability and Flam; mode buttons Song / Pattern / Step; patterns picked with the step keys; Select chooses the voice whose pattern the 16 step keys show; Track Mute / Solo; Sync INT / MIDI / USB / TRIG. Our version (`DrumMachine.jsx`), transposed to rows so it sits level with the sequencer's rows:
- A master strip: a tempo LCD with a tempo slider, Swing, Flam, Master, Room (mix, length, colour), Kick body.
- A mixer: one vertical Level fader per voice (and Accent) side by side, in the main page's fader style, the name button (SELECT: plays and selects, in both devices) under each. The selected voice's Tune, Decay, Tone (kit-specific label) and Pan sit in a panel below the faders, so nothing overlaps. (A first version with five sliders per voice was too busy; a second with a floating panel covered voices.)
- Under 1100 px the two devices stack, sequencer first (checked at 900 and 390 px; the 909's 12 faders fit at 390).
- Not taken over: per-voice mute/solo (see above), probability per step (a lock, later), the single data encoder (on screen, direct sliders are quicker), banks of 16 steps (our patterns are 16 steps).

#### Compared with the original TR-808 and its descendants
Original 808: per voice a Level plus one or two knobs (BD Tone/Decay, SD Tone/Snappy, toms and congas Tuning, CB and CY Tone, OH Decay), Accent level, Master volume, Tempo; 16 step keys with a voice select, Basic Variation A/B, Fill In, Scale (last step), Clear, Tap/Sync. No pan or reverb. We have all of it except Fill In and Tap tempo; the extras are Pan, Room, Swing, Flam and patterns A-H.
Missing, by how much it matters: (1) per-voice mute/solo (every RD-8/TR-8S has it; needs the core or a kernel change); (2) hit lights on the faders; (3) a value readout while dragging; (4) Fill In and Tap tempo; (5) per-step probability and per-step tune/decay (parameter locks, kernel change); (6) hat choke, if the kernel does not already do it; (7) per-track pattern length (TR-8S, Digitakt), which gives polymeter.

#### Mute, solo, hit lights, the family pass (2026-11-04)
- **Mute/solo** (M and S under each voice name): the stored pattern is untouched; what the engine (or the core) is sent leaves a silent voice out (`patternCommands(kit, i, p, silent)`, `drumPattern(kit, silent)`), and a change resends the patterns. Works with either clock. Not persisted.
- **Hit lights:** a lamp above each fader flashes when its voice has a hit on the playhead step (read from the playhead's `--step`, so it follows either clock; muted voices stay dark).
- **Per-kit knobs (`kit.knobs`):** the selected voice's panel shows the knobs the original panel has for that voice (909: BD Tune/Attack/Decay, SD Tune/Snappy, toms Tune/Decay, hats Decay, CR/RD Tune; 606: BD Tune/Decay, SD Snappy, toms Tune, OH Decay, CY Tone; 707: Tune on BD/SD/toms, hat Decay), then Pan; our other fields sit under More. Written from memory of the panels, not checked against the manuals.
- **707** (`/synths/tr707`): a voicing of the 909 engine's eleven voices (`kit.base`: shorter, brighter, less sub), because a true 707 is sampled and its cowbell and tambourine need new kernel voices (no Rust toolchain here). Unheard. Added to the home page, vite pages, `synths:presets` (bank `tr707-originals`) and the public-build guard.

#### Sequencer features on the drum pages (2026-11-04)
The core clock is now the default on the drum pages (the switch stays); these features need it.
- **Per-step values** (Edit tool, click a lit step): Velocity, Chance (probability), Ratchet (x1-x4, each repeat a little quieter), Nudge (-50..+50 % of a step). Stored in the bank as `bank.locks[pattern]["track:step"]`, cleaned by `cleanLocks`; a lit step with values shows a white corner dot.
- **Loop length per voice** (polymeter): `bank.trackLengths[pattern][track]`, the voice loops on its own length counted from the start of playback; steps past it are dimmed. Hit lights follow it (the core stamps the step count on the playhead).
- **Tap tempo** on the tempo display.
- **Conditions** (Edit tool, per step): play on the 1st-4th of every 2/3/4 loops of the pattern, only in a fill, or not in a fill. **Fill** is a hold button in the transport (core clock only).
- **Looks:** every voice has a colour (`voiceColour` in kits.js) shared by its step row, fader, lamp and panel; lit steps glow and pop when played; striped chassis per machine; LCD breathes; the output dots bounce and Play pulses while running (all off under reduced motion).
- Not carried: share links and the engine's own copy of the bank do not hold locks or voice lengths (so the built-in clock ignores them); library beats load without them; no song mode.

#### Kernel voices and song mode (2026-11-04)
- **Toolchain:** the project's own Rust toolchain is in `.tmp/rust-tools`; `npm run synths:build` rebuilds `public/synths/classics.wasm`, its manifest and the cache version. (Earlier notes saying there was no toolchain were wrong: it was not on PATH.)
- **Per-hit overrides** (`drums.rs`, `poly_pressure`): a timed pressure event just before a note sets that one hit's accent (key = track * 4 + 1, 0..1), tune offset (+2) or decay offset (+3, both -1..1, applied as half the knob range). The drum target sends them; the accent is no longer spent downward, so the core clock is as loud as the engine's own sequencer. The Edit tool has Tune and Decay per step.
- **707** (`STYLE_707`, model 13, `/synths/tr707`): thirteen voices (BD SD LT MT HT RS CP CB TB CH OH CR RD) in the 909's digital architecture with shorter, brighter specs, the 808's cowbell and a new tambourine (band-passed noise, two shakes and a ringing tail). Old kits are bit-identical (the Deep-kick hashes pass). Unheard.
- **Song mode** (`SongStrip.jsx`): blocks of { pattern, repeats 1-8 }, up to 16, played in order, looping or ending (the transport stops after the last step is heard). It replaces the chain while on, core clock only. Stored in the bank (`song`, `songOn`, `songLoop`); not in share links. The playing block lights and fills as its repeats pass.

- **One look per machine:** 808 warm and sunny (faders, rounded); 909 steel (hard corners, condensed type, red LED tempo, square fader caps, lit-top pads); 606 pocket box (deep teal, round pads, rotary Level knobs, mint display); 707 night-black digital (mono type, LED-dot pads, segmented LED faders, cyan display). Palettes per machine in kits.js (`voiceColour(key, kitId)`), looks in drums.css under `.drums.trNNN`.

## Findings from stage 1

Built 2026-11-04: `src/app/harmonyLaneModel.js` (plan -> slots in beats), `HarmonyLane.jsx` (eight bars ahead, bar/beat ticks, chord blocks with numeral, name, "bar 2/3" and the stage the sequencer plays), shown above the beat grid in `SequencerPanel`. Display only, uncommitted. Tested with fake plans; **not yet looked at in the browser**. The findings below come from reading the code while building it.

Corrections to what I said earlier:
- Chords do not only change on bar lines: `plan.split = { beat, chord }` already puts a second chord in the middle of a bar (`splitHarmony`, used by cadences/bridges). The lane shows it as a dashed block. Sub-bar harmony exists in the generator; it is just rare and not part of the progression model.

Cannot be stored / is not on the plan:
- Whether a chord is **borrowed**: only `chord.provenance` (and only with `rulebookTrace` on). The plan chord has `unresolved` and `cadence` but no borrow flag. The lane can show neither borrowing nor cadence kind without a change.
- **Section type and strategy** (build, full, breakdown...) that drove `harmonicDurations`: recomputed through `sectionFormAt`, not stored per bar. A harmony lane that labels sections needs it on the plan.
- **Slot index inside the progression** and the cycle number: derivable (`harmonicSlot`) but not on the plan entry, so the lane cannot say "chord 3 of 4".
- The next progression cycle is planned only as far as the plan reaches; how far ahead that is varies. The lane shows what exists and ends where the plan ends.
- Meter is per bar (`planned.meter`, breakdowns can differ); the lane uses the generator's current `beatsPerBar` for all bars.
- `seqPlayed` (the stage per bar) exists only while the sequencer is on and a bar was planned after it was switched on.

Wanted by the UI, never computed:
- A per-bar **voicing / register** of the chords (the plan has `state.padVoicing`, but no summary the lane could show next to the chord).
- Where the **bass root and rhythm part** sit against the chord (an event view: `plan.events` has them, unsorted by role for display).

Could be generated, is not:
- Chord changes at any beat (strum, chord per step) in the progression itself.
- Per-chord voicing, spread and strum as named fields (they are decided implicitly in voicing code).

Drums view (added the same day, `percussionRows.js`, `PercussionView.jsx`): the main-page panel used to show nothing unless a beat was chosen, which is almost never. The panel now always shows the lane and a read-only grid of the current bar's planned percussion, whatever makes it (drum style, beat, sequencer). Findings:
- Generated drums have no pattern object, only events (`midi` = drum index, `beat`, `velocity`); the grid is rebuilt from the bar's events, so a drum style is not an editable thing and nothing says which style or rule made a hit (`anchor` marks rhythmic anchors only).
- Events are not on a grid: swing, rubato, flams and ornaments fall between sixteenths, so the view rounds to the nearest step and says so. A real sequencer pattern for generated drums would need timing offsets per step.
- Sequencer events carry a `track` (18 voices) but also a `midi` mapped to the nearest of the 14 built-in drums (`nearestDrum`), so the view merges voices the 808/909 keep apart (toms, congas...).
- Not checked: events for an external drum machine (`percMachine`) may use other `midi` numbers.

Mismatch between the grid and the lane:
- The grid edits one 16-step bar of one stage; the lane spans eight bars of the harmony. The only link between them is the stage-per-chord setting, so the lane shows the stage name on each chord. Whether the grid should show the bar it is editing inside the lane (a cursor on the lane) is a UI question for stage 2.

## Eight-track device (2026-11-06, uncommitted)

The drum pages' sequencer is now laid out as an eight-track device after the OXI One: a control column on the left (transport, pattern letters A-H, copy / clear, steps, tempo, MIDI clock, core clock, the voice page, Hit / Flam / Edit tools, Fill, the step editor) and the sequence on the right (beat ruler, eight lanes of square pads, a slim accent lane, the song strip). The beat and arrangement loader is a ribbon across the top.
- `src/synths/seq/lanes.js`: the eight-lane view. A lane says which row of the stored pattern it edits; a kit with more than eight voices is shown a page at a time (the 808's sixteen are two pages; picking a voice on the drum machine switches to its page). Storage, the engine's pattern format, share codes and the scheduler are unchanged.
- `src/synths/seq/LaneGrid.jsx`: the sequence view, driven only by lanes (index, short, long, colour), so it knows nothing about drums.
- To carry eight parallel sequencers: a lane becomes a track with its own target (drum machine, bass, pad), pattern, length and rate; the adapter that builds lanes changes (a `trackLanes(bank)` next to `drumLanes`), the grid does not. Still open: per-track rate / division in `scheduler.js` (today one clock steps every row, with per-voice lengths), a track-level target assignment and a mode per track (drum, note, chord).

### Track mode and patterns (2026-11-06, uncommitted)
- **Track page** (fourth encoder page): the selected voice's own Length, Rate (1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32 against the sixteenth grid), Direction (forward, reverse, ping-pong, random) and Level. `src/seq/core.js` `trackWindow` / `directedIndex` do the timing: a track's own steps that begin inside a grid step, each at its own pace, read in its direction; swing follows the track's own steps. Stored per pattern as `bank.trackPlay[pattern][track] = { div, dir }` (`cleanTrackPlay` in bank.js); like locks and track lengths it is core-clock only and not in share links. A lane's name shows a badge when its track is not plain.
- **Patterns A-H**: a dot for a pattern that holds notes, a green dot for the one playing, a pulse for the one that plays next (a pattern picked while playing starts at the end of the loop). Copy is armed, then a letter is tapped to put the pattern there with its length, tempo, step values and track settings (`seq.copyTo`). Clear also clears the track settings.
- Not yet: pattern names editable on the display, per-track copy, a pattern-change quantize setting, a per-track playhead (the pads light as each voice plays, but the one playhead still follows the grid), swing per track.

### Arranger, 64 patterns and arrangement files (2026-11-06, uncommitted)
- **Separation of duties**: the sequencer owns patterns (layer 1-8 x letter A-H, so 1A to 8H, 64 in all; previous / next pattern; previous / next song block), the **arranger** (third, movable device under the sequencer) owns the song and its loop: a display and four encoders (page Song: Scroll, Zoom, Loop in, Loop out; page Block: Pattern, Repeats, Move), the block strip, Song and Loop switches. Selecting a block in the arranger makes its pattern the one being edited.
- **Bank**: `normalizeBank` / `blankBank` in `bank.js`; a bank of eight patterns (older storage, an arrangement recipe, an old share link) is filled up to 64. `loopIn` / `loopOut` are song block indexes; the scheduler starts at the loop in and wraps at the loop out. The engine's own sequencer still holds only the first eight patterns (layer 1); patterns past the eighth play on the core clock only.
- **Files, not links**: Save arrangement / Open in the top bar write and read a JSON file (`arrangementFile.js`, format `calmbgm-drum-arrangement` v1): all patterns (empty ones as null), step values, track settings, song and loop, the machine's sound and the effects rack. The page keeps its own copy in the browser's storage as before. The Share drums button is gone; old `#drum=` links still open (they decode into the first layer); `encodeDrumState` in share.js is now unused by the page.
- Not yet: pattern names editable on the display, per-track playhead, a quantize setting for pattern changes, copy / paste of a song block or a whole layer, the 303 page on the 64-pattern bank.

### Four keys, modes (2026-11-06, uncommitted)
The sequencer's buttons are four keys whose meaning follows the mode, to stop the button count growing. Steps mode: Pattern, Voices (next eight), Tool (Hit / Flam / Edit, cycling), Fill (hold). Pattern mode (Pattern pressed; pressed again it closes): the step grid becomes the 8x8 pattern grid (layers by letters, `PatternGrid.jsx`) and the keys become Copy (then tap the destination), Clear, Load. Load takes a loop from the beats library through the display (Style and Loop encoders; Load again puts it into the lit pattern, with its tempo and swing). Whole arrangements load from the arranger's top ribbon. Layer and Pattern are also encoders on the display's first page.

### The grid keeps its place (2026-11-06, uncommitted)
Pattern mode no longer swaps the grid for another one. `LaneGrid.jsx` draws the same eight rows and sixteen columns in both modes and only changes what they mean: in steps mode a pad is a step; in pattern mode a row is a layer and the first eight columns are the letters, so a pad is a pattern (lit: being edited, grey dot: holds notes, green dot: playing, pulse: plays next), and the lane buttons pick a layer. Over the pads, four small displays (one per beat) show 1 2 3 4, or in pattern mode the pattern being edited, its name, its length and its tempo. Left of each lane button is a small display: the voice, the note it plays and any own length / rate / direction (steps mode), or the layer and how many of its patterns hold notes (pattern mode). Free room for more (levels, mute, lock indicators) and more modes (a note-and-chord view for the later targets).

### Second key row, mute mode, wider layout (2026-11-06, uncommitted)
- Keys: row one is Pattern, Voices, Tool (Hit / Flam), Fill; row two is Edit (its own switch), Mute, and two bays left empty. In pattern mode row one is Pattern, Copy, Clear, Load and row two is idle.
- The display's pages follow the work: Pattern and Track by default; Step and Step 2 replace them only while Edit is on and a lit step is picked (so no pages are wasted when no step is selected); Load while a loop is being chosen.
- Mute mode: tap a voice row (the lane button, its display or any pad in the row) to mute or unmute it. It is the same mute set as the drum machine's M buttons; muted rows are dimmed everywhere, and the lane display says MUTED / PLAYING while the mode is on.
- The four displays over the pads are left aligned with room for three lines (beat or pattern first; the others free, for example for chord names of a progression later).
- Layout: no fixed 1500 px width any more; pads are 36 px and the two devices take the width they need (the desk zooms).

### Steps carry their own properties (2026-11-06, uncommitted)
No tool modes (no Hit / Flam / Accent / Edit keys). Tapping an empty pad adds a note and picks it; a tap on a lit pad picks it; a tap on the picked pad removes it; dragging carries on adding (or removing). While a lit step is picked the display's pages become Step (Velocity, Type = Hit / Flam, Chance, Ratchet), Step 2 (Nudge, Tune, Decay, Accent) and Step 3 (When: the loop condition), keeping Voice; the voice buttons only select, and Perf plays. Accent is a per-step property that applies to every voice at that step (the 808's accent row, still stored as the pattern's last row); a step with accent shows a small bar on the top lane. Keys: Pattern, Voices, Mute, Perf / Fill.

### Draw and Edit layers, selections (2026-11-06, uncommitted; replaces the tap-to-pick scheme above)
- **Draw layer** (default): a single tap on a pad adds a note, a single tap on a lit pad removes it, dragging carries on; a new note is selected so its properties come up on the display. A voice's button selects the voice only; Perf plays it.
- **Edit layer** (the Edit key): a tap on a pad selects it (tapping the only selected pad again clears), a voice's button selects its whole row, a column head selects the whole column (all voices); **Shift** (hold the key or the keyboard's Shift) adds to the selection (and takes a whole group out if it is all in). The encoders edit everything selected at once; a property the selection disagrees on reads MIX, and setting it sets all. Selecting empty pads does nothing to them: properties apply to the lit steps (`seq.setLocks` writes them in one commit); the display says how many of the selection hold notes.
- **Column heads** sit in the lower edge of the four displays over the pads, one per column, showing the step's accent as three bars. In the draw layer a tap cycles that column's accent (off, low, mid, high); in the edit layer it selects the column. Accent is a column property (it applies to every voice at that step), edited with the Accent encoder on Step 2 for the selected columns. The accent bars on the top lane are gone.
- `src/synths/seq/selection.js` holds the selection helpers (keys, row and column keys, shift toggling, describing a selection, the value a selection agrees on); `LaneGrid.jsx` now only draws and reports taps (step, step drag, lane, column) and the page decides what they mean.

### Column key; the column page (2026-11-06, uncommitted; replaces the column heads above)
The strip of column heads in the displays over the pads is gone. Selecting a column is a key (Column, next to Edit and Shift): with it on, a tap on any pad selects that pad's whole column for every voice (Shift adds columns; a voice's button selects its row). The accent is shown, when a pattern has any, in the second line of the four displays, one mark per column aligned with the pads, not as a row of its own. What a column carries besides its notes is a list the machine declares (`COLUMN_PARAMS` in DrumPage.jsx: the drum machine has its Accent) shown on the display's Column page for the selected columns, so a synth target can list its own per-column properties (velocity scale, mod wheel, ...) there without changing the interface. Step 2 now has Nudge, Tune, Decay, When.

### One way to edit, loudness by brightness (2026-11-06, uncommitted; replaces the Column page above)
A column is only another way to select steps (the Column key): every page edits the lit steps in the selection, whether it is a pad, a row, a column or several of them, so there is no separate column-level setting and no accent control of its own; loudness is a step's velocity. A lit pad's brightness shows it (`--lv`: the velocity, 0.8 when none is set, plus a little for any accent a loaded loop carries in its accent row, which still plays as before). The white dot for "this step has values" and the accent marks in the top displays are gone. If a synth target later needs properties that belong to a whole column (not to its notes), they can get a page again.

### Accent folded into velocity; transport (2026-11-06, uncommitted)
- **Fold**: `foldAccent(kit)` (kits.js) is the bank `migrate` hook on every way a bank comes in (browser storage, loops, arrangements, files, old links): each lit step gets the velocity that keeps the accent's contrast (highest accent 1.0, 0.84, 0.68, unaccented 0.52 in a pattern that had accents; an existing velocity is scaled by the same factor) and the accent row is emptied, so loudness is only velocity and the fold is a no-op the second time. Pad brightness is the velocity (full when none is set). The Groove page's Accent encoder became Tempo.
- **Scheduler** (`src/seq/scheduler.js`): `pause()` / `resume()` keep the place; `stop()` forgets it; `stepBy(±1)` plays the next step (or the one before the last) while stopped or paused and moves the place while running; `gotoBlock(i)` / `gotoPattern(p)`; bank flags `linear` (go on through the patterns that have notes, wrapping, instead of repeating the one being edited) and `holdBlock` (stay on the song's current block). `useCoreClock` exposes play / pause / resume / stop / stepBy / goto and `paused`.
- **UI**: the sequencer has one row of Play, Pause, Stop and Loop (lit: stay on this pattern; off: go on linearly). The arranger has two rows under the song strip: Play, Pause, Stop, Loop block / Prev, Step back, Step on, Next (Prev and Next go to the song's previous or next block when the song is on, otherwise the previous or next pattern, and the pattern being edited follows). With the core clock off only Play, Pause and Stop work (on the engine's own clock).

### Voice window, fill notes, Track on selection, two transport scopes (2026-11-06, uncommitted)
- **Voice window**: the Voices key is gone; a knob in the corner above the voice displays slides the window of eight lanes over the voices a row at a time (`drumLaneWindow`, `revealRow` in lanes.js), with "4-11 ▲3 ▼5" beside it. Picking a voice anywhere scrolls it into view. The same window will scroll octaves or notes on a synth target.
- **Buttons play, displays select**: a voice's button plays it; the display beside it selects it (for the Voice and Track pages). In the edit and column layers both select the row; in mute mode both mute. Perf makes the pads play their voice.
- **Fill**: notes carry a condition (`cond` in the step values). Fill edit (key): tap an empty pad for a note that plays only in a fill (dotted), tap a note for one that does not play in a fill (striped), tap either again to undo it (a fill-only note is removed). Outside fill edit a tap on a fill-only or not-in-fill note makes it an ordinary note that always plays. The Fill key (hold) is the fill itself: fill-only notes join in (and show solid) and not-in-fill notes drop out. A flam is now a pad with a dark grace-note notch, no longer stripes.
- **Track on the selection**: the Track page (length, rate, direction, level) edits the rows of the selection, or every row when nothing is selected (display: ALL ROWS / the row / n ROWS; MIX when they differ). With a selection the tabs are Step, Step 2, Track, Voice.
- **Scopes**: the scheduler plays in 'pattern' scope (the sequencer: only the pattern being edited, a song and chain ignored; it repeats, or with Loop off goes on through the patterns with notes) or 'song' scope (the arranger). Stop from the sequencer leaves the song's place alone; stop from the arranger rewinds the song. Pressing play from the other one while it runs changes what it follows. Each play key is lit only for its own scope.
- Open: whether rows with their own length should restart at the pattern's first step (no drift) or run free as a polymeter (today).
- Rows with their own length now start again with the pattern (they meet at every bar); the sequencer's settings cog has "Rows run free past the bar" for a free-running polymeter (`bank.freeRun`, `free` in `trackWindow`). Rate and direction were already bar-aligned.

## Roadmap after the eight-track device (2026-11-06)

Compared with the OXI One (specs from retailer listings and memory, not its manual). Agreed order:

1. **Longer patterns.** Up to 64 steps per pattern (OXI: 128). The grid stays 16 columns; a Page knob scrolls the window a beat (4 steps) at a time. The four displays over the pads show the bars/beats of the visible window; the playhead page can be followed. Old banks stay valid (16 is just a length).
2. **Generators.** Euclidean (pulses, rotation), random (density, seeded), mutate; applied to the selected rows. Output is ordinary notes.
3. **Mod lanes.** A target registry per device (name, range, curve; the drum target's `DRUM_PARAMS`, `src/synths/params.js`), lanes with LFO (existing LFO logic) or step values, two destinations with min/max, learn mode on screen (arm a lane, touch a control). External CC later on the same bus. Must be scheduled on the audio clock, not through React; the kernel has timed pressure events for per-hit overrides only, so continuous lanes need a worklet-side LFO or a timed parameter event. Decide that first.
4. **Per-track things.** Per-track copy, patterns, playhead, pattern-change quantize.
5. **Track modes.** Note, chord (holds), arpeggio, as for the main page's chord stage.
6. **Live performance tools.** Transpose, rotate, etc. Need an instrument that can be transposed, so after the track modes.


### Longer patterns (2026-11-06, uncommitted)
- A pattern may be 1-64 steps. Rows are stored in whole pages of 16 (`capacityFor`; `validPattern` accepts 16/32/48/64 wide rows, all equal); `setLength` grows them when needed and never shrinks them, so steps past a shortened length are kept, only dimmed. Per-step values and per-track lengths accept steps up to 63.
- The grid still shows 16 columns: a window starting at `colEff`, moved a beat (4 steps) at a time by the Page knob next to the Voices knob. The four displays over the pads read bar.beat and the first step of their beat when the pattern is longer than one bar. While playing, the window follows the playhead page by page (display: FOLLOW) until the knob is turned; double-click it to follow again and go back to the start. `LaneGrid` takes `offset` and `pages`; all handlers still receive absolute step numbers; the playhead is hidden while outside the window (`--off`, `data-out`).
- The engine's own sequencer plays only the first 16 steps of a pattern (commands and length are clamped); the core clock, which is the default, plays all of it.
- Checked in headless Chrome on /synths/tr808/: a 40-step pattern, the window following 0 -> 16 -> 24 and wrapping, no console errors. Not heard.
- Not yet: bar/beat labels for track lengths other than the pattern's, a pattern length stepper in whole bars, Euclidean / random generators (next).

### Generators (2026-11-06, uncommitted)
- `src/seq/generate.js` (pure, seedable; tests in `generate.test.js`): `bjorklund` / `euclid(pulses, steps, rotation)`, `randomRow(length, density)`, `mutateRow(row, amount)` (drops, nudges a note a step either way, grows a few new ones around the same density), `tile`.
- UI: a fifth display page, **Gen** (Mode Euclid / Random / Mutate; Pulses / Density / Amount; Rotate for Euclid; Cell = how many steps one pass covers, repeated to fill the row, 0 = the row's own length) and no key of its own: tapping the Gen tab again generates (a separate button shifted the layout). It fills the selected rows, or the selected voice's row when nothing is selected, over each row's own length. The output is ordinary notes: a note that stays keeps its type and step values, one that goes takes them with it. Each press of Random / Mutate is a new roll; there is no undo yet (nothing else in the sequencer has one).
- Whole-row selections and the "row" description now cover the pattern's length, not 16 steps.
- Checked in headless Chrome on /synths/tr808/ (E(4,16), E(7,16) = x..x.x.x..x.x.x., rotation, random, mutate; no console errors). Not heard.
- Not yet: generating a whole kit (a style-aware pattern across voices), velocity shaping for random off-beats, a `source: generated` flag, an undo for generator results.

## OXI ONE MKII manual check (2026-11-06, manual v2.2.5b, read by the user's PDF)

Replaces the retailer-listing guesses above. What the manual says that matters for the drum device:

**Corrections to what was said earlier**
- The OXI does generate a kit: Multitrack mode has a *drum pattern generator* on tracks 1-3 (kick, snare, hat): an X/Y position in a table of rhythm patterns (0-127 each), a Chaos amount, and a per-track Density; non-destructive, tuned for 32 steps, existing steps are kept. So a style-aware kit generator is not beyond the OXI; it is a Grids-style map. (p.143-145)
- Generators are not just per track Euclid: two Euclidean layers (length, pulses, rotation each) combined with OR / AND / XOR / Accent, plus Density, Invert, note and octave randomisation, tie %, velocity variation; steps set to Fixed or Locked are left alone. The random generator has Human (nudge/gate jitter, adds no notes), Order, Pitch and Flip modifiers that act on the existing pattern. Undo covers the last 15 actions. (p.78-82)
- 128 steps per pattern, 16-step pages, a Follow mode (Shift + Track) that can be switched off: the same model as the longer-pattern window built today (ours: 64 steps, follow stays on until the Page knob is turned).

**Ahead of us, drum-relevant (candidate list, not a plan)**
- Step conditions: A:B (2:2 to 8:8), !A:B, PRE / !PRE (depends on the previous trig), 1st / !1st, Flow / !Flow, Fixed, Locked. We have A:B, fill, not-fill. Fixed/Locked matter once generators exist: they protect hand-made steps.
- Repeats: 1-15 repeats over 1-15 steps, velocity ramp +-70 %, acceleration +-28 %, repeat probability, plus retrigger 1-8. Ours: ratchet x1-4 with a fixed decay.
- Track directions: forward, reverse, pendulum (end steps twice), pong (once), drunk, random; also drunk pong. Ours: forward, reverse, ping-pong, random. Time division also has bar, 1/32T, 1/64 and a randomised division amount.
- Per track: swing (10-90), groove template (16-step velocity + timing), loop within the pattern, mute/solo, random perform (non-destructive velocity/gate/retrig/trig variation), fills of several intensities, loop capture pads, rolls at a chosen division.
- Per sequencer: nudge +-100 ms and time bend +-12 %.
- Modulation: 8 lanes per sequencer, each with its own length and division (independent of the notes), min/max/offset/random, smoothing, 2 MIDI and 2 internal destinations, recorded live from the knobs; 2 LFOs per sequencer with 24 shapes, retrigger and phase. **Quick Assign**: parameters that can be modulated carry a corner tag; Shift + long press on one opens a page with Source (off, LFO 1/2, random S&H, mod lane 1-8, MIDI learn), Amount, Offset and Adapt (fits the range to the target). This is the on-screen "learn" the roadmap's mod-lane stage should copy.
- Arranger: 32 slots, per-lane patterns (each lane picks its own pattern per slot), repeats 1-19 or infinite, Next (next, previous, first, random, other), a master lane that drives the others, launch quantisation, clip launch while playing, program/bank change per slot. Ours: one pattern per song block, 16 blocks, repeats 1-8, loop in/out.

**Ahead of the OXI (they do not have)**: the sound (it is only a sequencer), per-step tune and decay on a drum voice, fill-only and not-in-fill notes edited on the grid, kit-specific voice panels.

**Effect on the order**
- 1 longer patterns: done; 64 vs 128 is a one-line cap if wanted.
- 2 generators: built (Euclid, random, mutate, Fixed steps, kit generator: 3x3 style map + busy + chaos for kick/snare/hat; Fixed = the step condition `fixed`, plays every loop and generators skip it; no separate Locked, no per-voice density yet). Add: Invert, a second Euclid layer with logic, Human, and a kit generator (X/Y style map with chaos and per-voice density).
- 3 mod lanes: BUILT for the drum pages (2026-11-06). Decision: control rate, not sample-accurate: `useModulation` evaluates `src/seq/mod.js` every 20 ms against a beat counter advanced from the audio clock and sends batched `setParams` on top of the knobs' values (non-destructive; the knobs' values are sent back on stop or unassign). 2 LFOs (6 shapes), 8 step lanes (own length up to 64, division, glide), random S&H; assignment = source + amount + offset; Quick Assign = long-press (600 ms) an encoder, `ModPanel`. Stored per kit under `synths:<kit>:mod`. Kernel check (2026-11-06): Pan already ramped; Level/Accent/Flam/Tune/Decay are read at trigger time (they step once per hit, no zipper); only Master stepped per sample and now glides (10 ms, `master_g` in drums.rs, kernel rebuilt). **Effect moves** (the front page's "Effect moves while Build plays" for the drum pages): `src/seq/moves.js` + `useRackMoves`, edited on the display's Moves tab (Effect / Start / End / Loops encoders; double-click Start or End removes the move; first built as a `<details>` box, which the desk's pan handler swallowed: anything not in Desk.jsx's INTERACTIVE list starts a pan on pointerdown, so use encoders/buttons); per pattern, each move sweeps a rack effect (phaser/chorus/flanger/saturation, delay mix/spacing/feedback, reverb, rack high-/low-pass) from Start to End over 1-8 loops of the pattern, then again; 20 Hz patches to the rack, whose Web Audio glides (20 ms), units needed are added to the chain while it plays; follows the playhead's step count, so core clock only; stored under `synths:<kit>:moves`. **Global clock** (`src/seq/clock.js`, 2026-11-06): the scheduler records every step it books as an anchor (count, audio time, step length, pattern, step); `clock.at(audioTime)` gives the position (fractional steps, beat, pattern, length) interpolated between anchors, held while paused, empty after a stop. `useCoreClock` owns it (`clock.clock`); modulation lanes and effect moves read it instead of keeping their own counters, so they follow per-pattern tempo, pauses and pattern changes exactly. New followers (the playhead, a harmony lane, MIDI clock out) should read it too. Open: lanes are global, not per pattern; no recording from knobs; no second destination per lane; no tag for MIDI/learn; other devices' targets. Original idea: copy Quick Assign (tagged parameters, source/amount/offset), lanes with their own length and division.
- 4 per-track: swing, groove, loop-in-pattern, mute/solo, per-lane arranger slots.
