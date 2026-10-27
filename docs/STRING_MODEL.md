# Measured string model (cello first)

A sampled cello rebuilt from measurements, in the spirit of docs/PIANO_MODEL.md: only derived numbers ship (tables in
`src/library/stringTables/`), never audio. Four patches of one sampler, each measured separately: **Long** and **Live**
(bowed, follow the key) and **Short** and **Pizzicato** (fixed-length samples that ignore it).

## From recording to sound

1. `tools/makeStringCalibrationMidi.mjs` writes the take (C2 to D#6 every third semitone, three dynamics via CC1, long notes,
   short notes, a repeated note, two dynamics ramps, legato pairs). Render it through each patch (tail 0, swell 0, modulation none).
2. `tools/analyzeStringTake.mjs take.wav timeline.json out.json --mode sustain|decay` runs `stringModel/analysis.js` on every held note:
   - the fundamental (a comb of harmonics, then the centroid of power around the first harmonics, because vibrato smears peaks and a
     comb reads them up to 13 cents off);
   - one **cell** of spectrum per harmonic (half a fundamental either side) as tonal power plus noise power (the quiet bins between
     peaks); a cell is always well defined, even where vibrato smears harmonics together;
   - **vibrato**: rate, and depth in three segments of the note (it grows from about a third of its final depth to full in ~2 s);
   - seven **band envelopes** (250 Hz to 8 kHz, octaves) at 24 times after the onset, relative to the band's steady (or first-0.2 s) power;
   - for bowed notes the band envelopes after the key comes up.
3. `tools/buildStringTable.mjs analysis.json out.json` packs it (`model.js` `packTable`, about 100 KB a patch; quiet cells dropped).
4. `model.js` `modelFor(table, midi, velocity, f0)` makes a note: the cells of the measured pitches within six semitones are pooled **by
   absolute frequency** (a body's resonances sit at fixed Hz whatever the pitch; this is commuted synthesis done from the data, without
   fitting filters), averaged in amplitude (a dB mean reads low, a power mean high, left-one-out the amplitude mean has no bias); the
   first few harmonics are instead interpolated by harmonic number between the two pitches around the note (a plucked fundamental is
   strong whatever the pitch). Level comes from the measured total, smoothed across pitch (`evenness`, the sampler's zones are not equally
   loud), and strength is interpolated between the three measured layers.
5. `synth.js`: `renderSustained` = additive harmonics with the measured vibrato, band envelopes per harmonic, shaped noise; it returns an
   attack plus a **seamless loop** (a whole number of fundamental periods and of vibrato cycles; the pitch is scaled by a hair so the
   integral is exact) and `releaseCurve` is the note-off gain. `renderDecay` renders a fixed-length note.
6. `player.js` caches one buffer per patch, pitch and strength, loops it, and follows the release curve. `/synths/strings/` is the test page.

## The wake of the vibrato (added after the first A/B)

The recording's harmonic lines are a moving tone with a fuzzy band around it, and the band only appears once the vibrato starts. It is
not bow noise: a tone that sweeps in frequency through a resonant body or room leaves the frequencies it has passed through still
ringing (a wake over the span of the sweep, fixed in frequency). Two earlier models were wrong (pitch wander per harmonic: pitch
uncertainty that is not in the recording; narrowband noise riding on the harmonic: it followed the vibrato and was there before it).
`tools/harmonicSmear.mjs` and `tools/scanWake.mjs` measure the **skirt** (level 15 to 100 Hz either side of each line's peak, short
frames) of the recording and the model.

`renderSustained` now convolves the note with `wakeImpulse`: the direct sound plus a decaying noise tail (T60 `wakeTime`) whose
power is `wakeDb` relative to the direct sound at 2.5 kHz and above, fading to nothing by 500 Hz (the sweep is a fixed number of
cents, so it is wider in Hz higher up and low notes leave little wake; at C3 a uniform wake overshot the low harmonics by 7 dB), built
in the frequency domain so each frequency's level is kept. A wake needs a steady period before the loop it is taken from, so with a wake
the render holds two loop periods and loops the second. Skirt error at C4: 6.0 dB without a wake, 3.7 dB with. Not explained: the same
frequency needs more wake from the C4 recording than from the C3 one (which also has a shallower vibrato, 13 against 20 cents).

**Noise at the onset** (`tools/onsetNoise.mjs`): the recording's lines are clean in the first 0.7 s, and the cause of the fuzz the model had there
was not the wake but the broadband cell noise (the analysis' estimate of noise between harmonics, played as periodic noise): with it
switched off the skirt at 100 Hz was -64 dB (recording -39), at the old cap of 10% of a cell -31. `NOISE_SHARE` is now .2% (-37.7). A
stronger or longer wake (12 dB, .6 s) washes out the moving line instead of adding a halo to it.

**Defaults chosen by ear** (2026-10-27, Long patch on the page): wake 0 dB, wake time 0.5 s, bow noise -9.5 dB, "Noise in harmonics" off,
vibrato x1, brightness 0, even levels 60%. The measurements above suggested +9 dB / .4 s, but the listener preferred these.

**Decay patches** (Short, Pizzicato): their notes start with a real broadband burst, so the 0.2% noise cap applies to bowed patches only
(`modelFor` with a `decay` table has no cap), their settings are kept per patch (`PATCH_TUNING`: noise as measured, wake 0 dB, .3 s), and
the wake is also applied to them (`renderDecay`): the burst excites the body, which keeps ringing at its own frequencies. The wake
filter is causal (`wakeImpulse` keeps the first half of its inverse transform): a level curve with no phase is symmetric and its wrapped
half played as an echo size/rate (0.68 s) after the note.

**Measured pitches are reproduced almost exactly.** `modelFor` pooled the cells of the notes within six semitones with a pitch weight of
sigma 3 semitones, which diluted a measured note's own character (Short C4 came out 3 to 7 dB under the recording from harmonic 9 up; its
strong lines near 3 kHz were nearly absent). Sigma is now 1.5: a measured pitch is within about 1 dB, in-between pitches still blend
smoothly, and the leave-one-out error (`evalStringTable.mjs`) is unchanged. The decay patches' noise share is a slider (`noiseShare`, 30%
default for Short and Pizzicato; 0.2% for bowed patches); the time envelope of a decay note is normalised so its average power over the
0.2 s the cells were measured over matches (`renderDecay`). Every note fades in over 4 to 6 ms (`fadeIn`) so it does not start on a click.

**Waveform and low end** (found from the user's waveform and spectrogram of Short at C5): `WaveformView` shows the start of the note as samples
(original above model, both short-time levels below), with `tools/periodicity.mjs` (period-to-period correlation and crest factor)
as the number for it. The recording's waveform is only 80-88% periodic in the burst, the model's was 98-100%: (1) the quiet-bins noise estimate read
almost nothing for a short note; for decay notes the tone is now the power within 3 bins of a cell's peak and noise the rest
(`harmonicCells(..., lobe)`), (2) everything below half the fundamental was dropped (cells start at harmonic 1, so at C5 nothing under about
260 Hz, where the recording has a strong thump): decay tables now carry a cell 0 (`[0, -200, noise dB]`), pooled as a density by
`lowNoiseAt` and played as noise below half the fundamental (`lowNoise`), (3) noise defaults per decay patch (Short +5 dB, Pizzicato +3 dB)
from the coherence at three pitches. Bowed notes also differ in phase: a bowed string puts all harmonics in phase once a period (tall
sharp spikes in the recording; the model's random phases give a smooth, low-crest wave), so `phase` can be 'pulse' or 'minimum'
(`harmonicPhases`); the default is still 'random' until it has been listened to.

**Literature pass** (SMS and sines+transients+noise: Serra and Smith, Levine and Smith, Verma and Meng; the bowed string's starting transient:
Guettler, Woodhouse; vibrato through body resonances: Schleske) led to two additions:

1. *Starting transient of bowed notes* (`onsetNoiseOf`, table `onset`, `renderSustained`). The bow needs a number of periods to settle into the
   string's regular motion; before that the waveform is mostly not a repeat of the last period. Measured as 1 minus the period-to-period
   coherence in four-period windows every 10 ms (`tools/onsetCoherence.mjs`): recording 0.04 at 0 ms, 0.46 at 10, 0.70 at 30, 0.84 at 50, 0.92 at
   70, 0.96 at 100, 0.99 from 130 ms (Live a little quicker); the model was 0.99 throughout. The tone now gives that share up (gain sqrt(1-n)) and
   a burst of noise with the harmonics' own (low-heavy) envelope carries it (`BURST_FLAT` 1). First version, scale x2.5 and a flat spectrum, matched the
   coherence curve (0.56/0.72/0.85 at 20/30/50 ms against 0.62/0.70/0.84) but the listener found it "way too much noise for far too long": the
   curve's tail (5-12% of the tone at 100-250 ms) ran to an abrupt cut at 250 ms and the flat burst put hiss up to 4 kHz. Now scale x1.5, full strength to
   40 ms and tapered to nothing by 120 ms (`BURST_FULL`, `BURST_END`), so the metric is no longer matched beyond about 70 ms by design.
2. *Body shimmer* (`bodyTrack`, table `body`, `renderSustained`). Vibrato sweeps each harmonic through the body's resonances, so its level
   rises and falls with the vibrato. Each harmonic's level against its instantaneous frequency is measured in the steady part, pooled over every
   note into a fine response (0.4% bins from 150 Hz); the synth modulates each harmonic by it at its instantaneous frequency (minus its mean over
   the sweep). The pooled response is weak (about -8 to +3 dB); the model's level fluctuation reaches the recording's at some harmonics only
   with `shimmer` 3 to 6 (default 2). The sampler's notes are separate recordings, which probably averages the structure away.

**Bow noise is common to notes (2026-10-27, `tools/commonNoise.mjs`).** The user saw that the noise of C5 and C6 (MIDI 72, 84) looks almost the same and
that the model's starting-transient noise is one broad block at C6 (it is tied to each note's harmonic cells, which are f0 wide). With the harmonic
lines masked and the rest averaged in third-octave bands, the Long patch's C5 and C6 residual shapes correlate 0.94 (first 80 ms), 0.90 (80-300 ms),
0.94 (0.3-1 s) and 0.79 (1.5-3 s), mean shape difference 2.5-4 dB; levels differ (C6 louder: +10 dB at the start, +4 dB later). Over all 17 pitches the
shape stays within 3-4 dB at fixed absolute frequency (level 4-8 dB). Shape is highest near 200-400 Hz and falls steeply above 1 kHz. The pairwise shape
correlations fall into two groups, MIDI 57-69 and 72-84 (0.8-0.9 inside, 0.5-0.7 between), perhaps a change of playing position (cello: C5 and C6 are
normally on the A string, high on the neck; the sampler's actual strings are unknown). Notes below A3 cannot be measured this way (harmonics so close that
nothing is left after masking). PLAN (not built): a pitch-independent bow-noise component, a noise density by absolute frequency pooled over notes
(separately for the two groups, interpolated by pitch) with its own time course (loud at the start, falling), replacing the per-harmonic burst in
`renderSustained` and perhaps the cell noise of the decay patches.

Not yet done (user's observations, 2026-10-27): bowed notes lack the initial bow, a burst of noise that keeps ringing for a while (the
0.2% cap removed it with the haze); the decay patches' noise is hissy and less aggressive than the recording's. An envelope
autocorrelation test (`tools/noisePulse.mjs`) cannot tell whether the noise is gated at the string period, because the harmonic lines
are periodic themselves.

The vibrato has its own timing: the depth is measured in five stretches of the note (`vibratoOf`) because the recording's vibrato starts
about 0.7 s in, and the model starts it the same way. The old "bow noise" bands remain as sliders ("Noise in harmonics", "Line
width"), default off.

## Checks

`node tools/evalStringTable.mjs table.json` (left-one-out spectrum shape: about 4 to 6 dB RMS per cell, no bias; level 3 to 5 dB RMS,
the sampler's own zone-to-zone unevenness), `tools/checkStringModel.mjs` (leave one pitch out, render, analyse like the recording, write
real-then-model WAV), `tools/smokeStringsPage.mjs` (headless page).

## Not done

Ensembles (quartet, chamber, symphonic: measure the extra partial width against the solo cello), legato between notes (Live patch),
round-robin variation, amplitude shimmer from vibrato sweeping the harmonics through the body (the gains are static per harmonic), the
tables are bundled in the page chunk (about 90 KB gzipped), violin, and presets in the generator.

## Bow-noise bed (2026-10-27)

The first test of the idea that bow noise is common to notes (`tools/startNoiseCheck.mjs`) showed that, with the starting transient off, the model's residual (harmonic lines masked) at C6 was 10 to 60 dB under the recording in every stretch of the note, steady part included; at C5 about 10 dB. The recording has a pitch-independent, almost stationary noise floor (about -80 to -105 dB, falling with frequency, louder in the first 300 ms) that the per-harmonic cells and burst could not reproduce.

Built: a **bed** per measured note and strength: for five stretches (0-40, 40-120, 120-300 ms, 0.3-1 s, 1.2-2.8 s) and 18 third-octave bands from 90 Hz, the recording's residual power minus the residual of the model's own rendering of that note without a bed (`tools/calibrateBed.mjs`, page default tuning), where positive; stored in each table layer as `bed` (dB, -120 for none). `modelFor` pools it by pitch (power average, sigma widening from 1.5 to 48 semitones where a band was masked) and interpolates strength. `renderSustained` makes one periodic noise per stretch (density over absolute frequency, `bedNoise`) and crossfades them in power; the per-harmonic burst is skipped when a bed exists (the tone still gives up the measured share during the first 120 ms, which the calibration accounts for). Tuning `bed` is a dB offset (page slider "Bow-noise bed").

Left-one-out result (mean absolute dB difference of the residual, 12 to 18 bands): C4 2.5 to 7, C5 3.7 to 5.5, C6 3.5 to 12 (first 40 ms worst), against 7 to 31 before. Not yet heard. Rebuild order after changing the model or tuning defaults: `analyzeStringTake` (unchanged) -> `calibrateBed` (per patch, on the analysis json, then `buildStringTable`). Not done for Short and Pizzicato.

### Bed for Short and Pizzicato, and the dense take (2026-10-27)

`renderDecay` plays the bed the same way (`addBed`, shared with `renderSustained`). Short and Pizzicato tables were calibrated with `calibrateBed.mjs --leave-out` (the model's rendering made without the note's own pitch, so the bed fills the gap interpolation leaves). Left-out check over C3-C6 (`tools/startNoiseCheck.mjs`, `PATCH=short|pizzicato`): the first 40 ms went from 10.7 / 11.5 dB mean absolute error to 6.7 / 5.5 dB; later stretches stay at 8-9 dB, with the model 4-7 dB too loud between the lines (it already was, 2-4 dB, without a bed). The page default for both is therefore bed -4 dB. The 1-3 s stretch is digital silence in the recordings and is not scored.

Dense take: `node tools/makeStringDenseMidi.mjs` writes `renders/cello-reference/cello-dense.mid` and `.timeline.json`: the 32 pitches the first take skipped (37..83), held 4.2 s at the three dynamics, 11.9 minutes. Render it through each patch (Long, Live, Short, Pizzicato) with tail 0, swell 0, modulation off, 48 kHz float stereo, as before. Then per patch: `analyzeStringTake` on it, merge the notes into the existing analysis json (pitch and velocity keys do not overlap), `calibrateBed`, `buildStringTable`.

### Dense take folded in, and what was wrong with the first calibration (2026-10-27)

The dense take (every semitone 37..83 added to the 17 first-take pitches) went in through `tools/addDenseTake.sh` (analyse, merge, calibrate, build); `tools/recalibrateBed.sh` redoes the calibration alone. All four tables now have 49 pitches (the first take is kept as `analysis/<patch>.first.json`, the dense one as `.dense.json`); tables are 250-350 KB each because of the bed.

Two faults found in the bed calibration and fixed:
1. The baseline the bed was measured against still played the old starting burst, which the bed replaces, so the bed came out near empty at the start (the first 40 ms was 8-15 dB under the recording). The baseline is now rendered with `burst: false`.
2. A crossfade from the centre of one stretch to the next smeared the loud first stretch into the next (+5 dB over 40-120 ms). Each stretch is now held, with a short crossfade at each edge (`BED_EDGES`, `BED_FADES`).

All patches are now calibrated against the model with the note's own pitch left out. Left-out result (C3-C6, mean / mean absolute dB between the lines, `startNoiseCheck.mjs`): Long 0-40 ms -2.2/3.5, 40-120 +1.2/3.4, 120-300 +0.1/3.4, 0.3-1 s -0.4/2.4; Live -2.4/2.9, +0.6/2.3, -0.8/2.5, -0.3/2.0; Short +/-1 to +4 with absolute 3-5.4; Pizzicato -1.3 to +5.2 with absolute 3.6-6.2. Short and Pizzicato default noise lowered (Short -2 dB, Pizzicato -3 dB: the cells' noise was 5-7 dB too loud between the lines, which is the hiss) with the bed at -2 dB.

### The bed reaches the bottom (2026-10-27)

At C6 the model's spectrogram was black below about 170 Hz for the first 0.15 s and below about 100 Hz after: the bed's lowest band began at 90 Hz (falling 6 dB/octave below), but the recording has the thump of the start right down to 0 Hz. The bed now starts at 22 Hz (25 third-octave bands, `START_BANDS`); at the bottom a band holds one 23 Hz bin or none, so a band needs 3 bin-frames instead of 20 to count and a band with nothing measured is filled by the line between its neighbours in `bedNoise`. Tables recalibrated; left-out errors are about 0.5 dB higher than before (more low bands counted): Long 2.5-4.1, Live 2.3-4.0, Short 4.6-6.1, Pizzicato 4.1-5.9 dB mean absolute.

### Speed, tails and levels (2026-10-27, later)

- **Rendering moved to workers.** A note takes 200-340 ms to render in node (wake convolution about 100 ms, shimmer 50, bed 45, the harmonics the rest) and the page rendered 49 keys on the main thread in 25 ms slices that were really 250+ ms blocks. `render.worker.js` and a pool of up to 4 workers (`StringPlayer.prepare`, `cancelQueued`) now do it: all keys ready in about 6 s after choosing a patch, longest frame gap 50-100 ms. `note()` still renders on the spot (main thread) if a key is played before it is ready.
- **Silence is -200 dB in the bed, not -120.** "No excess" was stored as -120 dB per bin, which is louder than the recorded high-frequency tails of Short and Pizzicato (-125 to -144), so the model's tails were up to 24 dB too loud above 2 kHz from 0.3 s.
- **More, shorter bed stretches** (7, to 1.2 s then 1.2-2.8 s) so a fast decay is followed.
- **Defaults:** bed Live -5 dB (articulated notes sounded noisy; the between-line level matches the recording on paper, so the difference is in character: part of what the recording has between the lines is vibrato spread of the high harmonics, which is a tone sweeping, not hiss), Short and Pizzicato -4 dB (the model is 2-5 dB loud over 40-300 ms).
- `tools/lineCheck.mjs` (harmonic line levels over time), `tools/crestCheck.mjs` (pulse shape: crest factor of the first 100 ms and 100-400 ms; the recording's start has a crest factor of 10-12 dB, 'random' phases give 8-10, 'minimum' 11-12, so 'minimum' phase is closer at the start of Short and Long and not later), `tools/timeStringRender.mjs`, `tools/timeStringsWarm.mjs`.

### Line flare for Short and Pizzicato (2026-10-27)

The user's picture of C5 Short: in the recording each harmonic starts broad in frequency (a flare about 100 Hz either side) and narrows to a line in 50-100 ms; the model's was a single line on a separate broadband blob. The bed's residual masks +-70-100 Hz round each line, so it never saw this. `tools/skirtCheck.mjs` measures it (mean power per bin 35-130 Hz beside the line over the peak bin, dB, harmonics 2-9, at 10 to 300 ms): Short recording -5, -18, -22, -24, -19, -20 dB; model before -13, -15, -20, -16, -20, -17.

Built: `flare` in synth.js (decay notes): each harmonic gives up a share n(t) of its power to noise in a Gaussian lobe (sigma 60 Hz) round its frequency with its own envelope; n at 10/30/60 ms from `tools/calibrateSkirt.mjs` (closed loop: the model's skirt ratio is measured as the recording's is, n corrected three times; stored as `skirt` in the table; page slider "Line flare"). Short n = 0.92 at 10 ms, about 0 after; the model's first frame is now -7 dB against -5. Also `noiseTau`: the cell noise of a struck note falls fast to 20% (tau 0.04 s Short, 0.15 s Pizzicato), because it was ringing 5 dB too loud beside the lines at 60-120 ms. Beds recalibrated after both.

Not matched: Pizzicato's skirt stays near -6.5 dB all through 0.3 s in the recording (broad lines throughout: its own beating or modulation), the model's falls to -12; and the same measure has not been looked at for Long and Live (printed below).

## Status and decision (2026-10-27)

Long and Live are accepted as they are. Short and Pizzicato are left in the current, unsatisfactory state on purpose: a short bowed note's dynamics come from the bow-string interaction (the stick-slip start), which a table of measured spectra plus corrections does not contain, and a pizzicato is a struck/plucked string with a different harmonic character. The corrections added to chase them (bed, flare, noise fall, per-patch defaults) were a sign the model lacks the mechanism. Next step, when picked up: design one bow-first model (a bowed string with a friction law and a body) and derive Short, Live and the rest from it; the measurements here (tables, dense take, tools) become its calibration data.

### Plan for the bow-first model (proposed 2026-10-27, not started)

One consistent model with the bowed string as its core, from which every articulation follows, instead of tables plus per-patch corrections:

- **Core:** a string as a delay line with losses (digital waveguide, Smith) and a friction law at the bow (McIntyre, Schumacher and Woodhouse 1983). Controls: bow force, bow speed, bow position along the string. The stick-slip then produces the Helmholtz corner, the start transient (Guettler), the scratch under a light bow, and a short note's dynamics from one rule. Bowing limits from Schelleng's diagram; vibrato is a change of the string's stopped length.
- **Body:** a filter on the string's output, fitted to the cello recordings; the dense take (every semitone, three strengths) gives its response densely.
- **Articulations:** Long, Short, Live and legato differ only in how force and speed are driven over time. Pizzicato is the same string excited by a pluck (an initial displacement or impulse) instead of a bow, so it needs no model of its own.
- **Fitting:** the recordings become targets for a few physical parameters (damping, friction curve, bow position, body filter), fitted on the held notes; short notes are then judged without tuning to them.
- **Risks:** real-time friction models need careful numerics and have a narrow range of settings that give a clean note, so the controls need mapping to dynamics; the risk is timbre from the fit, not speed (the worker pool exists). The literature has only been read as search results, not papers.
- **First step offered:** a small prototype (one cello string, steady bow) listened to against a recorded A3, before any written design.

What stays: the tables, the dense take and the tools are calibration data for the new model; Long and Live keep playing from the current tables.
