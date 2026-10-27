# Calibrated piano model

The acoustic piano (`src/app/engine/acousticPiano.js`) is a modal model with about a dozen global knobs,
so every note of a type shares one recipe and none of them can match a particular piano. This is the
infrastructure for replacing the recipe with measurements of a real piano, following the sinusoids-plus-noise
view of piano tones used in the literature (Bank, *Physics-based sound synthesis of the piano*; Bank and
Chabassier, *Model-based digital pianos*; Rauhala et al. on beating and two-stage decay).

Notes are rendered once into cached buffers (`noteBufferCache`), so the cost of a richer model is paid when a
note is first needed, not during playback.

## Pieces (`src/app/engine/pianoModel/`)

| file | does |
|---|---|
| `dsp.js` | FFT, windowed-sinc decimation, `heterodyne` (one partial's complex envelope: mix down, two moving averages one fundamental period long, which null every other harmonic) |
| `analysis.js` | `analyzeNote(x, rate, { midi, held })`: onset, fundamental and stiffness B (partial n at `n f1 sqrt(1 + B n^2)`), per partial its peak amplitude, onset delay and swell time, two-stage decay (`s1`, `s2` dB/s with a hinge at `tb`) and beating (rate, depth, phase); the residual left after subtracting the measured sinusoids as eight noise bands (level, peak time, decay) |
| `synth.js` | `renderPianoModel(model, rate)`: the sum of those partials plus band-passed noise; sine phase; envelope `a * (1 - exp(-(t - delay) / rise))^3 * 10^(decay / 20) * (1 + depth cos(2 pi beat t + phase))` |
| `hammer.js` | `fitHammer(table)`: how velocity shapes a note, as two pitch-independent curves S(f) (partials) and Sn(f) (noise bands) scaled by ln(115 / velocity) |
| `tableFile.js` | `packTable` / `unpackTable`: the measured piano as a file (71 KB for 30 pitches) with one reference layer, the hammer curves and the release |
| `interpolate.js` | `modelFor(table, midi, velocity)`: blends the measured notes around a pitch partial by partial (dB amplitudes, linear decay rates, geometric swell times and B), then across measured strengths; beating is taken from the nearer note |

`tools/analyzePianoTake.mjs take.wav timeline.json out.json` measures every note of a recorded take (reads notes
straight from the WAV, any size, any common sample format). `tools/makePianoCalibrationMidi.mjs` writes the take
to record: every third semitone from A0 to C8, three velocities, short notes, a repeated note, a pedal section;
`--controllers open|none|cc1` chooses what the sampler is told about the mod wheel and expression.

## How the model is stored

Three forms, from the recording to the sound:

1. **Analysis** (`tools/analyzePianoTake.mjs` output, e.g. `renders/piano-reference/analysis/cc1.json`, 645 KB, not
   shipped): for every recorded note, every measured parameter, at all three strengths, plus the short notes.
2. **Packed table** (`tools/buildPianoTable.mjs`, `tableFile.js`, `renders/piano-reference/grand-table.json`, 71 KB; to ship
   it goes in `src/library`): `format 1` JSON with the name, sample rate, reference velocity (115), the hammer curves
   `S` and `Sn` on eight nodes (100 Hz to 12.8 kHz), the damper `release`, and one entry per measured pitch (30: A0 to C8 every
   third semitone) at the reference strength only. A note entry holds `f1`, `B`, `onset`, `held`, `level` (dB) and
   `partials` (rows `[n, f, dB, tPeak, delay, rise, s1, s2, tb, beat, depth, phase]`, about 30 to 60 a note) and eleven `noise`
   rows `[dB, tPeak, tau]`. Numbers keep four significant figures. The note levels have been evened toward a smooth curve
   by `evenness` (default 0.7).
3. **In memory** (`unpackTable`): an array of `{ pitch, velocity, analysis }` with `.hammer` and `.release` attached.
   `modelFor(table, midi, velocity)` blends the two measured pitches around `midi` partial by partial, applies the hammer
   curves for the velocity, and returns a transient model object; `renderPianoModel(model, rate, { keyUp })` turns it into
   a Float32Array; `normalizedGain` levels it for the engine. The engine caches that buffer per pitch and strength, so
   a note costs 4 to 125 ms the first time (A0 slowest) and nothing afterwards.

In the app: `src/library/pianoTables/grand.json` is the packed table (72 KB, imported statically by
`engine/calibratedPiano.js`), `pianoType: 'measured'` selects it, `piano.js` `renderPiano` dispatches to
`renderCalibratedPiano`, and the library preset **Studio Concert v2** (Pianos category, appended to `SHAREABLE_PRESETS`) uses it.
The engine's `pianoDecay` scales the decay rates (2.8 as measured) and `pianoUnison` the beating (.25 as measured);
`pianoStretch` and the temperament move the partials onto the frequency the engine asks for; brightness, hammer, resonance
and wear are not used (velocity and the hammer curves replace them).

## What has been checked

- Model to analysis to model with known parameters: stiffness, both decay slopes and the beating come back.
- The current model's notes, analysed and rebuilt, match within 1.5 dB RMS in every window from 30 ms to 2.5 s.
- A real grand (the user's LUNA "Pianos" library, exported 2026-10-27): a note rebuilt from its own measurements is
  within about +-1.5 dB of the recording across A0 to C7 (the top octave has too few partials to measure well).
- A note left out of the table and rebuilt from neighbours three semitones away: +-2 to 7 dB. The real piano's own
  note-to-note unevenness is part of that (middle C is 6 dB louder than the D sharp above it), so the packed levels are
  evened toward a smooth curve (`evenness`); the largest step between neighbouring semitones fell from 5.3 to 4.2 dB.
- Velocity: from 40 to 115 the level rises 6-14 dB, the partials above 1 kHz drop 15-30 dB and the residual noise
  10-13 dB, but decay rates, swell times and peak times do not change at all. The change is nearly one pitch-independent
  curve of partial frequency scaled by ln(115 / velocity) (`hammer.js`). A velocity layer that was left out is predicted
  within about 1.5 dB in the bass and tenor and 3-5 dB in the treble, as well as by blending the measured layers, and any
  velocity (10 to 127) can be asked for from the one reference layer.
- The noise: bands of the residual that last more than ~0.3 s are unresolved partials, not noise, and replayed as noise
  they sound like a cymbal; only what dies away quickly (hammer and action) is kept, in eleven bands, through steep
  filters. In 6-15 kHz the model is now within a few dB of the recording where it was 15-40 dB too loud.
- Partial tracking: the stiffness fit from the first few partials drifts by ~1% by partial 20, and a mean-based floor test
  rejected strong partials in the dense bass spectrum; both made the bass thin. Partials are now found one after
  another with the series refitted each time (C1 went from 30 to 63 partials, C2 from 27 to 62).
- Release: the damper takes about 0.15 s to settle (-40 dB/s), then the note dies at about -110 dB/s (-20 dB at 0.3 s, -40 dB
  at 0.55 s), the same from A0 to C5; modelled by `releaseGain` and the `keyUp` option of `renderPianoModel`.
- Phantom and longitudinal partials: after the tracking fix, nothing off the stiff-string series is stronger than -32 dB
  below the strongest partial in the bass and nearly all of it is the unison strings drifting 1-2 Hz apart (which the
  beating model covers). Not built; revisit if the bass still sounds wrong against the recording.

## Treble clean-up (2026-10-27, `tidyModel` in `calibratedPiano.js`)

**Revised after the seven-piano comparison:** the decay limits described below were tuned by ear on The Grand and were wrong: the
recorded treble genuinely dies fast (Glass Grand C6 to C7: -60 dB/s for half a second, then gone), so the limits made it ring 25-30 dB
too long (the "resonance" that did not fit). Measured as the fundamental's level every 100 ms against the recordings, C#5 to F#7, all
seven pianos: the old limits gave 18.9 dB RMS error, no limit 4.7 dB, a loose sanity limit (`TIDY`: s2 >= -(25 + 0.6 over) dB/s, first
stage 4x that) 4.7 dB. Unison beating above C5 halved (`TIDY.beat` .5): 4.4 dB. The noise cut makes no measurable difference 40-100 ms in
(the model is already a clean tone there; the recordings carry 2 dB more besides the tone). The noise cut was wrong too: the model's spectrum in the first 150 ms (9 bands, 250 Hz to 20 kHz, relative to the fundamental's band,
C5 to F#7, three strengths, seven pianos) was 10.6 dB RMS from the recordings with the cut, 6.2 without, 6.0 with +3 dB (`TIDY.noiseGain`,
bias 0); the cut had also flattened the pianos' differences in hammer texture at the top. The text below is the original reasoning.

Above C5 the fits are unreliable (4 to 20 partials): first-stage decays of -40 to -160 dB/s killed the fundamental within 0.2 s,
and the noise bands sat at or above the fundamental, so C7 and up was a burst of hiss ("zish") with no ring. Heard problems:
hiss on the attack, a lagging felt thud, no ringing through at low velocity. Fixes, applied when a note is made (the table
file is unchanged): decay rates limited to what a treble string does (s2 >= -(5 + 0.2 (midi - 72)) dB/s, times 1 + 0.25 (n - 1) for
partial n; a fast first stage only where there is a hinge before 1 s); noise pulled to at most 8 to 22 dB under the fundamental and
shortened; noise onset <= 6 ms and swell rise <= 12 ms everywhere (bass fits reached 0.1 s); and the velocity curve reads
min(f, 800 n) so a treble fundamental is not darkened like an upper partial at soft strengths.

## Not yet done

- Velocity is measured only through the `cc1` take (`Pianos - cc1.wav`, mod wheel set to the velocity before each note):
  the first two exports pinned the sampler's dynamics with controllers in the MIDI and sounded the same at every velocity,
  and the no-controller export stays silent because this piano starts with its dynamics at 0.
- A soundboard response measured from the short notes; the action's thud is eleven noise bands for now.
- The pedal section (sympathetic resonance, strings left undamped).
- Hear it in the app and tune it: the preset's `gainRelease` (0.45 s) approximates the measured damper (`RELEASE`), the
  top two octaves are 3-5 dB quieter than the old grand and the very top notes (above C8 minus a fourth) quieter still, and
  the packed table could be loaded lazily (it is in the main bundle now, about 72 KB before compression).
- Rebuild the file from a new recording: `node tools/analyzePianoTake.mjs take.wav timeline.json analysis.json --kinds held`,
  then `node tools/buildPianoTable.mjs analysis.json src/library/pianoTables/measured.json --name Grand`.

## Seven sampled pianos (2026-10-27)

Tables in `src/library/pianoTables/` (`measured` = The Grand, `measuredAmbient`, `measuredDrama`, `measuredGlass`, `measuredHouse`,
`measuredRavel`, `measuredSubdued`), each built from its own cc1 take of the calibration MIDI (`tools/analyzePianoTake.mjs ... --kinds held`
then `tools/buildPianoTable.mjs`). The Intimate export was bit-identical to Ambient in every held note, so it has no table of its own.
Presets `Studio Concert v2` ... `Subdued Piano v2` (Pianos). `pianoDecay` was fitted per instrument against the recording (decay of the level
at 1 to 6 s relative to 0.3 to 0.5 s, A0 to C6, velocity 80): 2.8 for five of them, 2.0 for Glass Grand, 2.4 for House Piano. The remaining
error is about 6 to 8 dB RMS in those late windows (beating, room tails), 8 to 10 dB with the treble up to C8.

The A/B listening against the recordings (an `original` button per preset, `public/piano-originals/*.ogg`) was a test bench for
tuning and has been taken out of the piano page and the build; `tools/extractPianoOriginals.mjs take.wav timeline.json out.ogg` still cuts
such clips from a take (every sixth semitone, three strengths, Opus) if it is wanted again.

Soft Piano v2 (`measuredSoft`) comes from the older piano take (`piano.timeline.json`, 96 kHz, sustained and low kinds): 15
pitches (A0 to G3 every 2-4 semitones, then C4, C5, C6), strengths 35/80/120 only at the octaves. `packTable` lifts the single-strength
pitches to the reference with `liftToReference` (the inverse of the hammer curves). Its decay is the default 2.8, not fitted. Re-export it
with the cc1 calibration MIDI for a full table. Its recordings are `public/piano-originals/measuredSoft.ogg` (one strength).

## Loudness across the keyboard (2026-10-27)

The engine used to level every note by its low band, so the top was as loud as the middle; the recordings fall 10 to 20 dB from C4 to
C8 (Glass Grand 19 dB, The Grand 11 dB). `renderCalibratedPiano` now uses one gain per pitch-independent strength, set at C4
(`anchorGain`), so each key keeps the recording's own level (the partial amplitudes are absolute). First half second, relative to
C4, velocity 80, seven pianos: the model is within about 3 dB of the recordings for most keys (Ambient's mid keys are 5-6 dB off:
the packed levels are evened toward a smooth curve, `evenness` .7, which also smooths real note-to-note unevenness). The piano page
no longer levels each buffer: the model and the recorded clips are both levelled by C4 (C-nearest clip) at the played strength.

## Low body under a high note (2026-10-27)

In the recordings a note above C6 keeps energy far below its fundamental (the action's and sound board's thump, sympathetic strings): at
C7, 480-960 Hz stays 20-30 dB above what the model had 0.2 to 0.7 s in. The analysis threw it away as "unresolved partials" (anything
lasting past 0.3 s) and capped the low bands at 0.1 s. For a note with f1 >= 1 kHz the bands below 0.85 f1 now also get a *floor*: the
band's level 0.25-0.8 s in and its decay time (from 1-2 s), stored as two extra numbers in the band's row (`[dB, tPeak, tau, floorDb, floorTau]`),
interpolated, scaled by velocity with the band, and played as a second, slowly dying noise in the band (`synth.js`). Spectrum of the
model against the recordings, C5-F#7 over three strengths and seven pianos, 0.2-0.7 s in: shape error 13.8 dB RMS before, 7.7 after
(first 150 ms: 4.8). The tables were rebuilt from fresh analyses (`renders/piano-reference/analysis/new/v2-*.json`).

## Naming, size, loading (2026-10-27)

- Presets, lined up with the modelled ones they were measured to replace: Studio Concert v2 (The Grand), Ambient Piano v2, Soft Drama v2,
  Glass Grand v2, Subdued Piano v2, Soft Piano v2; House Piano and Ravel have no earlier version. Share-code slots are unchanged.
- Packed tables are `format 2`: no partial frequencies (the stiff-string series gives them back), levels to 0.1 dB, times and rates to
  three figures, partials down to 70 dB under the strongest. The eight tables are 368 KB raw, 111 KB with gzip -9 (178 KB in format 1);
  `unpackTable` reads both formats. Rebuild with `tools/buildPianoTable.mjs` from the analyses in `renders/piano-reference/analysis/new/v2-*.json`.
- The tables are bundled, so there is no fetch. `preloadCalibratedPiano(types?, strengths?)` is the eager step: it unpacks a table and sets
  its levels for the usual strengths so the first note costs only its own rendering. `prepareSound` calls it for a preset with a measured
  piano and the piano page for the chosen type. Loading the tables on demand would need every caller of `renderPiano` (synchronous)
  to wait for them first; not done.

## On the page (scenes)

The piano scenes use the measured pianos: Concert Grand became Studio Concert v2 (The Grand: the same grand, brightest and widest in
dynamics), Studio Grand became Ravel (a studio grand of middling brightness and a wide dynamic range), Ambient Piano and Glass Grand their
v2. Each updated scene (Solo Grand, Piano and Pads, Piano and Clarinet Cinematic, Ambient Piano Distant Storm) is followed by a
"(v1)" copy that keeps the modelled voices; Demo: Low note, then chord was switched with no copy. `Pure Piano` (one grand on all three
tracks) and `Felted Piano` are new. No measured piano is felted: `Felted Piano v2` is Subdued Piano v2 (the darkest with a normal
dynamic range) under a 3.6 kHz low-pass, with a shorter ring; Soft Piano v2 is darker still but its dynamics are flat.
