# Owned insert and send-effect kernels

2026-11-10 overnight checkpoint. `calmbgm_inserts` and `calmbgm_effects` now expose
reusable Rust `Engine` instances, retaining their default `legacy-abi` feature
and original exported functions. `default-features=false` removes the singleton
compatibility ABI. The existing Web Audio wrappers and fresh-page defaults are
unchanged by this extraction.

The exact existing algorithms remain: insert saturation/DC protection, stereo
RBJ EQ, phaser, flanger and chorus; send echo, ducking/feedback filtering, room/
hall/plate/classic FDN, type-switch fade, early reflections and output protection.
This does not port the native pedal compressor or pretend it is equivalent to
`graph.compressor`. Other native and small worklet stages remain separate work.

## API and resources

Both crates expose `BLOCK=2048`, `PARAMS`, `PARAMETER_RANGES` and owned `Engine`:

- `new(rate) -> Option<Box<Engine>>`, accepting finite 8–192 kHz.
- `param(index,value) -> bool` validates finite values and original bounds.
- `parameters()` returns target values; an interrupted reverb-type fade reports
  its pending target. This matters when resetting before that fade completes.
- `input_mut(channel)` / `output(channel)` expose fixed channel buffers.
- `render(frames) -> bool` rejects more than 2,048 frames. Zero-frame processing
  preserves the original behavior. Processing allocates no buffers or views.
- `clear()` follows the original clear policy, retaining frame count and
  controls; `reset()` restarts from frame zero with current targets, matching a
  fresh prepared instance rather than restoring in-flight tails.
- `stat(index)` retains the original statistic meanings. Inserts additionally
  provides `settle()`, required after initial parameter setup like its legacy
  AudioWorklet constructor.

Inserts has 29 parameters, two input/output channels. Send effects has 21
parameters, six inputs (dry L/R, reverb-send L/R, delay-send L/R), two outputs.
The legacy ABI still clamps invalid values and channels exactly as before; the
new owned API fails closed instead. Its opaque-pointer ABI is trusted-host only:
create/free once, serialize access, never reuse freed handles.

All DSP, delay lines, filters, RNG-free modulation and I/O belong to the instance.
The large send-effect storage is initialized directly on the heap with typed
field writes, avoiding a multi-megabyte stack temporary. The `Option` and
headroom fields are explicitly initialized; zero writes apply only to f32 arrays.

`OwnedInserts` and `OwnedEffects` validate complete versioned parameter packets,
provide atomic validated edits, save/reload, clear/reset, stats and idempotent
disposal. `refresh()` makes memory views outside render. Constructing another
instance may grow Wasm memory; existing instances must refresh before rendering.
The adapter rejects stale views rather than allocating during render.

## Clock and preservation limits

These are matching-cadence extractions. The original effects bus scans each
callback's input peak to wake its tank and counts quiet samples at block entry;
inserts flush denormals at block boundaries. Different callback partitions are
not automatically equivalent. A graph adapter must preserve a canonical native
quantum and disclose any buffering latency; this extraction does not add hidden
delay or change the original algorithms to force split invariance.

Parameter timing is caller-owned. The plain API applies edits between renders;
it does not independently provide a new event scheduler. Headroom remains the
existing stereo gain protection, not a new true-peak limiter. Persistence saves
control targets, not active delay/filter contents.

## Evidence

`tools/buildOwnedEffects.mjs` builds audit-only default/owned-only Wasm under
`.tmp/owned-effects`. Publishing default kernels and cache manifests remains a
separate parent integration step. `tools/auditOwnedEffects.mjs` compares to
preserved pre-extraction public kernels under `.tmp/owned-effects-baseline`.
The durable report is `reports/modular_audio/owned-effects-parity.json`.

96 comparisons pass bit-exactly for both rebuilt legacy and owned output at
44.1/48/96 kHz, eight settings per kernel and native128/irregular callback
partitions. Inputs include distinct stereo/send signals, bypass transitions,
clear, room-type changes and echo-time changes. Original baseline SHA-256:

- Inserts: `3dac67271f175014ae84affecc3d57d6700caac9e056794f8b9f9ede2ce368c8`
- Effects: `3a130c7432ff5a1da7eaa5644a20a6b00477db4f0d02a2fcdbfb4edb1ed6bae7`

Six two-handle cases across both kernels/three rates report zero allocation,
reallocation, free or memory growth after preparation. Two insert instances use
1,507,328 total Wasm bytes; two send-effect instances use 12,910,592 bytes in the
isolated audit module. Handles retain independent buffers, processing histories
and frame clocks through clear/reset and disposal.

Six permanent tests in `ownedEffects.test.js` pass: saved parameter/PCM replay,
independent handles, invalid configuration and atomic edit rejection, interrupted
type-switch reset, dry/send isolation and independent tank clearing. Local audit
builds can be selected with `OWNED_EFFECTS_AUDIT_WASM_DIR=.tmp/owned-effects`;
the default test path uses published `public/synth-lab` kernels after integration.
`cargo check --offline --tests` passes for both crates. Native test executables
were not run under Application Control. Browser and physical listening evidence
are not claimed by this extraction report.
