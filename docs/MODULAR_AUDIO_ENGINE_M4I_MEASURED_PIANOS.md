# M4i — eight measured-table piano families

2026-11-10. Ports the existing measured piano preparation path into portable Rust
and the owned finite graph. It uses the actual eight packed tables; it does not
replace them with fitted acoustic shapes or another synth preset.

## Data and DSP ownership

`tools/buildPianoTables.mjs` generates immutable Rust tables from measured,
measuredAmbient, measuredDrama, measuredGlass, measuredHouse, measuredRavel,
measuredSoft and measuredSubdued. Both graph and preparation builds/checks verify
the generated file against all eight JSON sources. Generated constants contain
the reference strength, hammer curves, measured pitches, partials and noise bands.
They are read-only and safe for independent instances or later parallel readers.
There is no mutable global cache or shared random state in the Rust renderer.

`measured.rs` ports the sound-producing path used by renderCalibratedPiano:

- Bracket measured pitches, preserve sparse-partial nearest-note behavior, blend
  amplitude in dB, times/slopes linearly, rise/stiffness geometrically, and take
  beating from the nearer note.
- Apply the actual reference hammer curves and C4 anchor normalization, preserving
  the instrument's register-dependent loudness.
- Apply default treble tidy limits, frequency movement, decay scale and unison.
- Render two-stage/swelling/beating modal envelopes with float32 control points
  every millisecond and the original oscillator renormalization cadence.
- Render the eleven shaped noise bands with two cascaded biquads, deterministic
  white-noise normalization and the original action/body floor envelopes.
- Preserve the 50 ms ending fade and 0.85 peak bound.

The original noise seed multiplies in Float64 before ToUint32. Rust explicitly
preserves that rounding; wrapping integer multiplication changes large seeds.
Filter normalization uses temporary note-owned state. All model/buffer allocation
and reclamation occurs during preparation, outside process().

Existing kind codes 0–10 remain; codes 11–18 name the measured families. The
preparation ABI and graph bank schema stay compatible. Older hosts/Wasm reject
unknown kinds rather than substituting sounds. Unknown and Iowa types still fail
closed in this piano adapter. Native JS preparation remains the fresh default;
the existing opt-in Rust preference now includes these measured pianos, with the
same separate cache namespaces and explicit fallback reporting.

The finite graph uses the same prepared gain/filter/pitch controls, stereo output,
slot ownership and steal fades as M4e–M4g. Acoustic/measured banks have no invented
looping modal body. The worst-case bank preflight now allows the original measured
9-second buffers while retaining the 64 MiB prepared PCM cap. Playback allocates
and frees nothing. Save/reload retains settings and owns fresh playback state.

## Verification

Preparation `534ac58cc4da8c0b` is 655226 bytes; graph `92cca7d693913923` is 961175
bytes. The growth includes all eight immutable measured tables. No startup/CPU,
latency or memory-use improvement is claimed.

`npm.cmd run piano:audit-measured` passes 288 actual-table PCM comparisons:
8/24/44.1/48/96/192 kHz, bass/middle/treble, weak/strong velocities, decay, unison,
zero/max unsigned seeds and sustained noise floors. 248 are bit-exact; maximum
absolute sample error is 3.725290298461914e-9. Lengths match and samples are finite.
See `piano-measured-rust-compatibility.json`. The earlier fitted/base report keeps
its original M4h build identity.

All 32 actual native-versus-Rust dry comparisons pass, including the eight actual
measured presets in the low/middle registers. Their relative RMS errors are about
1.02e-7–1.54e-7, with the existing 0.005 RMS /0.99998 correlation gates unchanged.
See `piano-native-measured-browser.json`. These measurements do not establish
isolated wet PCM parity or physical listening.

Tests cover each measured family, independent handles and Wasm instances, memory
view refresh after allocation, exact persisted settings, prepared graph replay,
reset and irregular blocks. A real worker publishes exact eight-bus PCM with
measured Ambient/Ravel, sine/walk modulation, stealing, core/FM/drums and the
sidechain master. 30 existing and 22 piano allocation audits report zero render
allocation/reclamation or Wasm memory growth. Build/package/provenance and final
application results are recorded in the handoff.

Final application run passes 552 tests /72 files. Public packaging and all
source/table/binary provenance checks pass. All four browser full-path cases
pass: 942000-frame audition and 726000-frame captured progression, serial and
actual worker. Each progression records three Rhythm steals; worker underruns
and late blocks are zero. A separate audible progression reaches all six
source/channel outputs and master peak0.266908 with zero underruns. Reports:
`piano-measured-full-path-browser.json` and `piano-measured-audible-browser.json`.

## Boundaries and next task

This ports the eight shipped reference-layer tables and their current default
tidy rules. Analysis, fitting, arbitrary table import and table authoring remain
existing tools. The standalone JS model synth's optional keyUp/release API is not
a new live Rust keyboard/pedal contract; native finite piano notes also use
pre-rendered held strikes and the existing voice envelope. Dense steals below
10 ms, live release/pedal/retune and host FX/mixer migration remain separate work.

The fixed test page uses House Piano, Ravel and Studio Concert v2 alongside
core/FM/Hand, with sine/walk/vibrato and forced stealing. Its profile is
piano-measured-controls-steals-v1. All song/settings storage and normal transport
defaults remain unchanged. The previous phone result stays attached to M4g.
After this larger batch, check measured-family listening on the fixed page, then
audit and port the actual Iowa held/decay/roll voices with their own event and
release contracts. Classic/plucked/native fallback families remain separate.
