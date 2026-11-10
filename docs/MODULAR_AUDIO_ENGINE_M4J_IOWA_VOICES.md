# M4j — owned Iowa Held/Decay/Roll voices

2026-11-10. Ports the existing Iowa realtime voice DSP into a portable Rust crate
and the opt-in modular graph. The default native Iowa player remains operational.
This is a realtime voice port; the measurement/FFT preparation in model.js still
runs in JavaScript outside render. It is not a claim that all Iowa preparation or
the host effects/mixer have moved to Rust.

## Audited boundaries and ownership

The original player prepares HeldVoice or DecayVoice specs from its settled
measurement tables. It quantizes velocity to twelve layers, applies measured
level/key calibration, and sends immutable specs and booked notes to its
AudioWorklet. RollVoice repeatedly strikes DecayVoice instances. The native
worklet owns 32 voices, FIFO stealing and its Park–Miller note seed. Held voices
also own their wander/noise state; rolls own their repeat clock and up to 12 hits.

`synth-engine/iowa` now owns those realtime states per graph module: held
wavetable morphing, envelope/release, glide, vibrato, wander and noise; decay
phasors, rise/knee envelopes, damping and burst; and deterministic roll hits.
Immutable prepared data is copied into each engine during preparation. No browser
API, mutable global RNG/cache, host callback or shared Wasm memory is required.
Temporary ABI f64 upload buffers are freed before processing starts.

The versioned `legacy.iowa` contract has stereo output (the original mono source
duplicated), modulatable gain, timestamped note-on/off, panic and owner
cancellation. Limits are 96 prepared layers, 2,000 note specs, 1–32 voices, 128
partials, 12 simultaneous roll hits and 64 MiB of prepared numeric data. The graph
retains its combined eight-pitched-instance limit. JS and Rust reject malformed
or incompatible data, duplicate spec identities, missing banks, invalid fields,
out-of-range values, wrong sample rates and edits after preparation.

The calibration gain limit is 1,024: the actual Brass Bells level/key corrections
exceed the initially considered 64 bound. The library's sound is preserved rather
than clamped. The compiler stops before preparing a 97th distinct layer.

## Clock and persistence

The original worklet starts/releases a note when its requested time is strictly
before the end of a 128-frame callback. Its algorithms are block dependent.
`iowaFrame` preserves that policy, including floating-point boundary cases;
requested times remain visible in the captured source plan. A note may start up
to 127 samples before its requested time, matching the original policy.

Rust uses a canonical 128-frame internal tick with preallocated per-voice PCM.
Arbitrary graph/executor partitions and parameter-event splits do not change DSP
ticks. Note-on/off/panic require tick boundaries. Late notes are counted and
rounded forward to the next tick. Owner cancellation can clear a cached partial
tick immediately. Pause preserves the exact frame and cached remainder; reset
restores seed, clock and owned voices. Saved graphs include complete immutable
numeric banks and note specs, so replay does not need measurement tables, host
preparation or the original player.

All's source lease captures the actual settled table, patch, tuning and vibrato
and injects Rust output at `player.bus`, before its existing room/limiter/output
and role effects/mixer. Table/player/settings replacement invalidates the lease.
A reference-counted hold keeps the effects route awake for the injected source.
Normal live backend selection and song/settings storage are unchanged.

One-worker and optional pool partition planning accept this typed source. The
existing separate detector bus and downstream dependency order remain intact.
No new worker transport, automatic capacity selection or live backend migration
is included.

## Exact validation

Graph `67dc7a260e3e0ae7`, 996,483 bytes. Source, Wasm, contract, cache and worklet
provenance pass `graph:check`; offline local Rust tools build Wasm without running
an Application Control-blocked native executable.

- `iowa-owned-compatibility.json`: all 45 library patches, three sample rates
  (44.1/48/96 kHz), low/mid/high measured registers and three strengths: 405
  actual original-worklet-versus-Rust comparisons. 403 are bit-exact; maximum
  absolute sample error is 4.656612873077393e-10. Host preparation supplies both
  sides. Separate two-note overlap and 34-note FIFO stealing tests pass with
  fixed 1e-6 / 1e-5 tolerances; per-voice f32 accumulation can change low bits.
- Save/load, irregular 1/37/203/127/11-frame partitions, reset/replay, two handles
  in one memory, partial-tick pause, independent owner cancellation, strict
  timestamp boundaries, late events, prepared tuning/slides and raw ABI rejection
  pass. Held, decay and roll are all covered.
- Actual Node worker threads publish the mixed Held/Roll + measured piano +
  core/FM/drums graph and dependent kick-sidechain master exactly at matching
  cadence through one and three workers, with finite PCM and no delivery errors.
- `iowa-owned-allocation.json`: nine two-handle runs across held/decay/roll and
  three rates report zero allocations, frees or memory growth after preparation,
  including stealing/release/enqueue/reset/cancel/pause. The previous 30 graph,
  percussion and core/FM allocation cases also pass.
- Broad modular/All regression: 553 tests / 68 files pass (126.81 s). Additional
  focused native Iowa/piano coverage: 128 tests / 9 files pass (35.09 s). Final
  transition/tuning/lease tests: 66 tests / 5 files pass (8.75 s). These runs
  overlap; their counts must not be summed as unique tests.
- `build:public` and package validation pass (39.41 s), including the new fixed
  mixed-source tool. No deployment or push is performed.

## Browser result and review surface

`tools/iowa-voice.html` fixes Iowa Flute, FM Rhodes, Iowa Marimba roll, Ravel,
Soft Pad and Hand. There are no desk settings to match. The existing piano page
keeps its measured-piano profile. Both use the same full-path controller.

`iowa-full-path-browser.json` records four passing built-in-browser cases:
942,000-frame audition and 726,000-frame captured progression, each on serial and
actual worker with 512-frame / 12-block / Message tasks delivery. Both worker
cases have zero underrun frames and late blocks, with matching captured input
per material. `iowa-audible-browser.json` records a separate completed audible
942,000-frame worker audition: all six source/channel peaks are positive, master
peak 0.13780248165130615, zero underruns/late blocks. Screenshot:
`reports/modular_audio/iowa-mixed-browser.png`.

The built-in browser was unavailable for the initial attempt, and the Chrome
fallback was stopped by its URL policy check. After the built-in browser became
available, all recorded browser checks ran there. No security warning was
bypassed. Browser audio counters/meters are not a new physical listening verdict.

Full diagnostics summarize large prepared bank arrays; fingerprints still cover
their complete input. Persistence tests retain the full data. The user accepted
the prior measured-piano playback and requested automated local comparisons in
larger batches. There is no per-family phone listening gate for this slice.

## Remaining limits and next task

1. Port `iowaModel/model.js` measurement/velocity interpolation, level settling,
   FFT/wavetable and noise/burst preparation into a separate owned Rust
   preparation interface. Compare prepared arrays against all 45 actual tables
   and reuse the immutable realtime contract. Preserve JS default/fallback until
   local parity/resource tests pass. Avoid bloating realtime render state with
   preparation scratch.
2. The current All finite compiler captures normal note times, gates, velocity,
   preset tuning and vibrato. Its prepared schema/DSP can replay held slides,
   but live dynamic retune/pedal and composed expression capture are not migrated.
   Captured-score pitches outside a measured table fail clearly; only diagnostic
   audition pitches are clamped into the measured range.
3. Classic/plucked/other native source families and portable host FX/mixer remain
   separate migrations. Existing defaults, legacy DSP and previously measured
   phone buffering remain operational. Do not ask the phone to certify each
   preset; request a device check for a transport/live-path change or an actual
   unresolved sound discrepancy.
