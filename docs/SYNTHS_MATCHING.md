# Matching the internal synths without original hardware

Importing a program verifies the data format. It does not verify the conversion
from slider values to seconds/Hz, or the oscillator and filter response. Engine
consistency tests cannot settle those questions on their own.

## Confirmed correction: OB-Xa filters (20 October 2026)

The [original service manual, third edition](https://synthfool.com/docs/Oberheim/Oberheim_OBXa/oberheim_obxa_service_manual_3.pdf)
shows separate CEM3320 circuits on voice schematic 1520C (PDF page 44): U5 is
the two-pole state-variable circuit; U6 is the four-pole cascade. Printed page 18
sets resonance just below oscillation. Pages 16-18 tune the peak with noise.
The [manufacturer's historical filter description](https://oberheim.com/wp-content/uploads/2022/08/OB-X8-Users-Guide-1.1.pdf)
(printed pages 23-25) corroborates the separate circuits and lack of self-oscillation.

Previously both modes used taps of one four-pole feedback loop, with forced
ringing at high resonance. The two-pole mode now uses an SVF and the four-pole
feedback stays below oscillation. Tests check decay after removing excitation,
noise-peak key tracking, and the two-pole low-frequency passband.

This fixes topology and behaviour. It does **not** establish component-level
accuracy: the damping taper, maximum Q, saturation and four-pole feedback ceiling
(3.9) remain estimates. The Jupiter-8 still uses its four-pole circuit's second
stage output; the OB-Xa correction is local to that model.

## Repeatable recording comparisons

Run:

```sh
npm run audit:synth-reference -- banks/reference-cases/my-case.json
```

The manifest and WAVs can stay in git-ignored `banks/`. Paths inside the manifest
are relative to that file. Example for a **controlled** dry Juno recording:

```json
{
  "model": "juno",
  "reference": "juno-single-note.wav",
  "source": "Describe the unit/recording, program and how settings were established",
  "patchVerified": true,
  "referenceStartSeconds": 0.15,
  "note": 60,
  "velocity": 1,
  "holdSeconds": 1,
  "tailSeconds": 1,
  "values": {
    "saw": 1, "pulse": 0, "sub": 0, "noise": 0,
    "cutoff": 1000, "res": 0.3, "env": 0, "kybd": 0,
    "attack": 0.0015, "decay": 1, "sustain": 1, "release": 0.5,
    "chorus": 0, "spread": 0, "velVcf": 0, "velVca": 0,
    "chorusMix": 0, "reverbMix": 0
  }
}
```

Replace `values` with the complete decoded engine patch when comparing factory
programs. Missing controls use model defaults; the report records the complete
resolved patch. Unknown/out-of-range values fail instead of silently changing.
`note` is a MIDI note number, `velocity` is 0-1, and the start time is the
recorded note-on, including its attack. The WAV must cover the entire hold and
tail. There is no guessed gate time or automatic onset alignment.

For VS factory waves, add:

```json
"waves": {
  "wavs": [{"file": "vs-wave-set-1.wav", "first": 0},
           {"file": "vs-wave-set-2.wav", "first": 64}],
  "userDump": "optional-user-waves.syx"
}
```

`first` is the actual first wave number in each file; use the same ordering as
the existing VS importer. Omit `userDump` if unavailable. Substitute built-in
waves are identified in the report.

Outputs default to `.tmp/synth-matching/<case>/`: a stereo `candidate.wav` for
listening and `report.json` with file/kernel/wave hashes, complete parameters,
20 ms RMS envelopes and averaged spectra. `--out directory` changes the folder.
The tool supports the melodic models, including live TB-303 notes. Drum hits use
`tools/auditDrumReference.mjs`; see the [recorded drum comparison](SYNTHS_DRUM_COMPARISON.md)
for its manifest, measured kick corrections and remaining voice differences.
Drum-pattern matching and performance-controller sequences are outside the single-note tools.

Measurements separate raw loudness correction, pitch error, gain-adjusted envelope
error and spectral-shape error. Stereo is measured by channel power so chorus
cannot cancel through mono summing. Full, held-end and release segments are
reported separately; each segment's gain correction is independent, so use the
full envelope to assess relative attack/sustain/release levels. Spectra average
8192-point Hann windows into sixth-octave bands. The report gives no aggregate
accuracy percentage or automatic pass threshold.

Pitch detection can choose an octave or harmonic on complex sounds; noise,
chords, modulation and very short segments require inspecting the spectra.
20 ms envelopes cannot verify a 1.5 ms attack. Spectral bands cannot identify
fine resonance width. Whole-voice comparisons also include oscillator, VCA and
effects contributions; a spectral difference alone is not a filter measurement.

## Useful evidence already available

Downloads contains the Legowelt Juno-106 and Jupiter-8 WAV archives. These are
useful listening targets, but their filenames do not establish knob settings,
effects, note gate times or recording processing. Mark them `patchVerified: false`.
Keep sample files private; nothing is bundled or deployed by this workflow.

Without documented patch settings, many combinations of mixer, cutoff, envelope
depth and gain can fit one recording. Do not change global parameter laws based
on such a fit. A single unknown sample cannot determine the cutoff range or
envelope curve. A controlled reference set needs several known knob positions,
low/middle/high notes, resonance settings, and held/released notes.

Next useful targets are the remaining per-family filter differences (especially
the TB-303 diode ladder), VS rate tables, and DX7 amplitude modulation against
an independent implementation. Keep sourced endpoints distinct from inferred
interpolation curves; see `SYNTHS_ASSUMPTIONS.md` for the remaining estimates.
