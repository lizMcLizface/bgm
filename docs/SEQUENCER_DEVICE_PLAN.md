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
