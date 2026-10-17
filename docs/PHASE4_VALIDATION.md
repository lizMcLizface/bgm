# Phase 4 sound validation

Implementation and automated checks completed locally on 17 October 2026. The common listening review is at [tools/phase4.html](http://localhost:5173/tools/phase4.html?preset=rainy-cafe&seed=42&bars=8&part=all&sound=library). [One chord tone sliding](http://localhost:5173/tools/phase4.html?preset=rainy-cafe&seed=42&bars=8&part=pad&sound=library&fixture=chord-slide&auditRole=pad&slides=1) and [melodic slides](http://localhost:5173/tools/phase4.html?preset=rainy-cafe&seed=42&bars=8&part=lead&sound=library&fixture=lead-slide&auditRole=lead&slides=1) use the same page.

## Comparison contract

- Reference: earlier named/library oscillator patches or earlier generated recipes, without the new expression layers. This is a sound control, not Original composition.
- Current: the same written score, current sound counterparts/families, articulation, held-wind expression and wind connection. Saved decay/release stays full; envelope fitting, beat linking and slides are off.
- Optional timing: current plus beat linking and short-note envelope fitting, only for that listening version.
- Optional slides: current plus independent melodic/single-tone chord slides, only for that version.

Pitches, beats, velocities and written lengths are frozen across versions. Sound recipe and expression differences are intentional. RMS matching attenuates only, can be disabled, and does not alter the envelope shape. WAV audio uses normal export processing; its final fade and soft limiting are not raw safety measurements. The raw audit uses floating-point OfflineAudioContext output, with actual role gain/polyphony and original effects, before those export operations.

## Automated coverage

554 unit/integration tests across 75 files and the production build pass. The raw browser matrix contains 487 renders, including repeated controls, at 48 kHz:

| Group | Cases |
| --- | ---: |
| Representative current library/generated sources | 182 |
| Earlier/current/tighter controls, including actual piano/plucked upgrades | 273 |
| Current/slide examples and forced reuse/cancellation/resume | 32 |

The matrix covers Rainy café, Fireside folk, Zero Fun Zone, Oxygen Debt, Boss Fight Politely, Deep night and Chapel organ; role/source combinations include keys, winds, plucks, chip leads, analogue bass, organ, brass and ambient pads. A fixed seed is used: music 42, generated sound 12345. Each core suite checks soft/medium/hard velocity, octave-low/high registers, short notes, a four-second hold, a chord, dense notes, forced voice stealing, no-note silence, cancellation and resume. Active cases include a twenty-second tail window. The cancellation fixture silences first, lets the fade finish, then flushes tails, matching the app's contract.

| Raw metric | Checked maximum/result |
| --- | ---: |
| Absolute peak at role gain | 0.746151 |
| Absolute whole-render channel mean | 0.000912102 |
| Final 0.5-second tail RMS | 0.000003634 |
| Non-finite samples | 0 |
| Samples reaching full scale | 0 |
| Cases with threshold findings | 0 |
| Cases exercising voice stealing | 127 |

Compressor/limiter reduction is recorded at 250 ms checkpoints; these samples establish activity, not an exact worst-case maximum. DC is a whole-render channel mean, not a perceptual or frequency-response score. Thresholds diagnose problems; they do not decide whether a sound is musical. The window is finite, and the matrix is representative rather than every possible seed/patch/device.

A source DC issue in older generated asymmetric pulses was fixed by subtracting the interpolated transfer curve's mean. The AC step stays the same; half-duty pulses remain unchanged. A stressed earlier generated control changed from channel mean 0.0227697 to 0.0000315. This does not introduce shorter musical decay or remove the older chip recipes.

## Slides and transport

Slides use audio-clock automation in cents, reaching each written destination independently. Only one changing pad note receives a slide in the haunted-chord example; the other notes retain their pitches. Instrument tuning, oscillator/sub layers, physical-source buffers, pitch envelopes and delayed vibrato are accounted for. Pitch is reset on plain-note reuse and silence; no extra oscillator or per-frame JavaScript loop is created. Automatic slides start off; they can be inherited by future haunted presets.

The per-note scheduler accepts, for example:

~~~js
instrument.scheduleNote(65, time, 2, 0.7, 0, {
    slideFromMidi: 64,
    slideSeconds: 0.8,
});
~~~

This enters the new F4 from E4; other scheduled chord tones are unaffected. It describes a new note's trajectory, not a retuning command for an already-held note ID. The existing monophonic patch portamento remains available separately. Automatic lead joins are bounded to an octave, close written gates and adequate note length. Automatic chord joins choose one nearest changing tone, leaving common pitches alone. Explicit engine bends are bounded to two octaves and 1.5 seconds, additionally limited by the note's sounding gate.

A sine-wave browser check measured the early glide at 444.89 Hz and its destination at 523.26 Hz (C5). Physical piano, plucked and oscillator slide cases pass the raw checks, including forced steals and cancellation of booked bends. Independent rule choices survive reload; Original generation does not plan slides or the other new expression layers.

Live browser checks passed patch switching, seeking with a chord loop, mute/solo, tempo and 6/8 meter changes, pause/resume, hidden-tab progress, ending planning/finish and Original playback. Common library/generated pairs and optional versions keep identical written scores, expose WAV downloads and keep all vertical markers synchronized when seeking to bar 5. Audit table/JSON downloads were exercised too.

## Reproduce

Start Vite on port 5173, then run:

~~~sh
npm test
npm run build
npm run audit:phase4
npm run audit:phase4 -- --preset=rainy-cafe --quick
~~~

The audit command discovers Chrome or uses CHROME_BIN / --browser=/absolute/path/to/chrome. --url=http://localhost:5173 selects another server, and --output=/absolute/path/report.json selects the JSON location. Default output is ignored .tmp/phase4-audit.json, checkpointed after each sound; a nonzero exit code reports threshold findings or browser errors. The full command includes the shared core cases and slide checks for selected roles; totals can exceed the original checked matrix as cases overlap across modes.

The page can also run the selected voice's raw audit directly and save its JSON. Listening to the actual music, long background sessions and constrained-device testing remain release evaluation gates. No deployment is part of this slice.

## Phase 4 listening refinement — continuous pitch motion, 17 October 2026

Listening feedback rejected the automatic lead's short previous-pitch catch-up bends: pitch motion should already be happening before a new note and continue afterward. The opt-in melodic rule now supplies a slow voice-wide contour, sampled at each note's absolute musical position. It uses two smooth unequal cycles, bounded to ±35 cents, with independent phases for lead and second lead. New attacks, repeated notes, rests and bar boundaries do not restart the contour. The written melody still changes its target pitches normally; this is gentle continuous detuning, not a full semitone portamento between every pair of notes.

Rhythm/pad and bass have independent off-by-default rulebook choices for the same motion. Chord tones share their voice's contour, so overlapping arpeggios and long release tails remain coherent. Both oscillator and physical buffer sources use the same automation. Saved tails and note lengths are preserved. The existing single-changing-chord-tone slide remains a distinct off-by-default haunted/unsettled effect; ordinary comparison arrangements no longer enable it with melodic motion.

The common Phase 4 page includes an overlapping arpeggio fixture for any selected voice, counts moving notes separately from explicit bends, and describes the distinction. Existing melodic-slides rule IDs and URL choices remain valid; new pad/bass choices persist through the normal rulebook URL/saved-setup path.

Validation: 556 tests across 75 files pass; production build passes. A browser check rendered 24 raw-audio cases across library/generated lead, pad and bass without audit findings. A sine-source render measured the ongoing contour before and after a changed note within 0.14 cents of the expected curve. Tests cover matching pitch offset and slope at note/bar boundaries, overlapping tails, common chord motion, voice reuse/silence and Original bypass. Pad and bass rule switches persisted through reload. Results: workspace outputs/phase4-continuous-motion.json.

Phase 4 remains implemented locally, with this listening refinement ready for review. Remaining gates: listening approval, longer-session and constrained-device checks. Direct next step: review continuous motion on lead, overlapping pad arpeggios and sustained bass, then start Phase 5's breath excitation/formant work.

## Phase 4 held-pad glide example — 17 October 2026

Added the requested single-attack held-pad render to the common comparison as held-glide. Three chord voices start once, sustain for 12 seconds and follow smooth pitch paths across three harmonic changes. Transitions begin 0.8 seconds before each destination change and finish 0.8 seconds after it. The original gain/filter envelopes continue; only pitch changes. The two reference versions sustain the initial chord for the same span, so the comparison demonstrates held retuning rather than retriggered playing. The diagram shows the trajectories.

The engine accepts bounded pitchTargets (time in seconds since attack, MIDI destination), resolves their intervals through the patch tuning, and books smooth cents curves on oscillator or physical-buffer detune. There are at most 64 target points over 30 seconds, bounded to two octaves from the initial pitch. Voice reuse and silence clear these curves through the existing cancellation path. This is an explicit scheduled-note capability and listening fixture; automatic held chord voice-leading in normal arrangements is a future composition choice, not enabled by this example. Decaying sources retain their natural decay; a sustained patch such as Deep night's Breathing Pad makes the effect clearer.

Validation: 558 tests pass across 75 files; production build passes. Four raw held renders cover library/generated Deep night and Rainy café, with no audit findings. Instrument booking checks confirm three attacks per render, not a new attack at each chord change. A single-attack sine render reaches 440.000, 523.260 and 392.000 Hz at its held pitch destinations. Browser render/diagram checks passed without page errors. Workspace artifacts: outputs/held-pad-glide.wav, outputs/held-pad-glide-validation.json and outputs/held-pad-glide.png.

Phase 4: listening refinement. Remaining gates are listening approval and longer-session/constrained-device checks. Direct next step is reviewing the held-pad glide before deciding whether to add an optional held chord voice-leading rule to normal arrangements; Phase 5 synthesis remains next in the main plan.

### Phase 4 bass held-glide extension — 17 October 2026

The held-glide comparison now follows the selected voice instead of forcing Rhythm / pad. Bass uses one long root voice (C2 → F2 → D2 → C2), with a single attack and smooth target changes over the same 12-second span. Pad retains the three-tone chord example. This avoids placing three low chord tones onto the bass's two-voice allocator and stealing a note. Voice/part selectors synchronize in both directions for the held example.

Seaside Hearth's library Dark Drone was rendered in fixed-pitch and held-glide versions. Both raw renders were audible, had zero voice steals and no audit findings; the comparison booked exactly one bass attack per version, and browser selection/render checks passed without page errors. Saved listening artifact: workspace outputs/dark-drone-held-glide.wav. Targeted fixture/engine checks: 15 tests pass; production build passes. This remains an explicit listening example using the existing engine trajectory support; automatic held-note connections in generated arrangements remain a separate composition-rule decision.

Phase 4 remains in listening refinement. Remaining: listening review, long-session and constrained-device checks. Direct next step: review the Dark Drone bass example, then decide the scope of an optional held voice-leading rule before starting Phase 5 synthesis work.

## Phase 4 integration — optional held pad and bass connections, 17 October 2026

Implemented independent off-by-default rulebook controls: held-pad-glides / heldPadGlides in Rhythm / pad and held-bass-glides / heldBassGlides in Bass / support. They participate in the existing preset inheritance, overrides, saved setups and book URL parameter. Hidden pages do not restrict presets. Original generation bypasses the connections.

A shared performance interpreter joins long, almost contiguous notes on sustaining oscillator patches (gain sustain at least 0.2). It excludes piano/plucked physical decays, short notes, larger rests, jumps beyond seven semitones and section/ending boundaries. It admits small gate trims up to eight percent of attack spacing, bounded between 0.24 and 0.8 seconds. Common tones keep their pitch and nearby tones receive smooth destination trajectories; one incoming/outgoing voice is assigned per chord tone. No arranger RNG, written pitches, events or rhythm settings change. Gain/filter envelopes and the first note's dynamics continue for each chain, which renews within four bars or 24 seconds.

Live scheduling marks connected future attacks as covered and books the chain once. The offline renderer uses the same interpreter with actual per-bar tempi; its existing 30-second pre-roll covers the bounded holds. Seeking/resuming recreates a head at the destination. Loop limits stop chains crossing the loop seam. Replanning, sound changes and endings cancel old held trajectories at a boundary; replacement early notes wait for that reset, and queued resets follow loop wraps. Normal fluid note events receive the joined duration so their sources remain active while the held sound plays.

The common Phase 4 comparison has an optional held pad/bass connections version for generated music (connections=1), with the identical written score, counts of attacks replaced, and diagrams of performed trajectories. A 16-bar Seaside Hearth bass render contains six connected spans replacing ten of its 22 written bass attacks. Pad checks also found connections in Deep night, Chapel organ and Seaside Hearth. The normal-generation listening WAV is saved in workspace outputs/seaside-held-bass-generation.wav.

Validation: all 567 tests across 76 files pass; production build passes. New tests cover matching/common tones, one-to-one assignment, duration bounds, gate trims, rests/short notes/acoustic exclusions, independent rules, inheritance, shared live/export interpretation, seeking, cancellation and early boundary notes/loop resets. Browser checks verified both rule choices after reload, actual live pad+bass connections, tempo replanning, seek/restart, loop limits and ending cancellation. A comparison render longer than 60 seconds exercised export chunking. Browser report: workspace outputs/held-glide-rules-validation.json; no page errors. These are implementation and automated checks, not a claim of full listening approval or constrained-device validation.

Phase 4 is implemented locally, including the held-connection follow-up. Remaining evaluation gates: listen to the integrated rule behavior, long-session and constrained-device checks. Direct next step: review the generated Seaside Hearth comparison, then proceed to Phase 5 breath excitation/formant work.
