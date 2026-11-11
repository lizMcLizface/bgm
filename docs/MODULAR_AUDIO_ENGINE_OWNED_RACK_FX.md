# Owned crusher, pitch and Z-plane DSP

2026-11-10 overnight checkpoint. `synth-engine/rack-fx` ports the actual three
algorithms in `public/rack-fx-processor.js` into owned portable Rust. The original
worklets, native wrappers, AudioParam smoothing, bypass crossfades and default
routing remain unchanged. This provides reusable processing cores; it does not
claim that every rack wrapper or native processor has migrated.

## Processing and contracts

The owned `Engine` supports `Kind::{Crusher,Pitch,ZPlane}`. Each instance owns its
stereo I/O, held samples, sample counter, delay heads/buffer, coefficients and
filter histories. There is no singleton state or browser dependency.

Crusher preserves sample-and-hold timing and JS `Math.round`, including negative
half ties and negative zero. Pitch retains the original 32,768-sample stereo
ring, dual read heads, linear interpolation and sine-squared windows. Z-plane
retains all 12 sections, logarithmic frequency/bandwidth morph, pole/zero radii,
40-point average-dB normalization and transposed DF-II histories. JS Number
arithmetic maps to f64; ring buffers and output remain f32. K-rate parameters are
rounded through f32 exactly like the original AudioParam buffers.

API: `Engine::new(kind,rate)`, `param(index,value)`, `shape_count(count)`,
`shape_row(shape,section,[frequency,bandwidth,boost])`, `prepare()`, `input_mut(ch)`,
`output(ch)`, `render(frames)`, `clear()`, `reset()` and `stat(index)`.

Limits: finite sample rate 8–192 kHz, 0–2,048 frames per call, complete parameter
sets (3 crusher/pitch, 6 Z-plane), 1–64 built-in Z-plane shapes of exactly 12
rows, and two custom shapes. Custom rows use original bounds: 20–12,000 Hz,
8–8,000 Hz bandwidth, ±30 dB. Built-in rows cannot change after prepare; custom
rows can change between processing calls, invalidating the coefficient cache.
Input/output channels fail closed on invalid indices. All allocation and view
creation occurs during preparation or explicit refresh, outside render.

Built-in shape IDs are 0 through `shape_count-1`; upload custom A/B at internal
IDs64/65. The original selected-index policy remains: an index beyond built-ins
uses that side's custom rows. Built-in and custom numeric rows persist in the
versioned JS spec, so save/reload does not depend on mutable worklet tables.
`OwnedRackFx` validates complete detached data, atomic edits, custom replacement,
memory refresh, reset and idempotent disposal.

`clear()` is an explicit new owned API that clears audio history and restarts
effect phase while retaining parameters/shapes/frame count. `reset()` additionally
restarts frame zero and clears input. The original three worklets have a stop
message, not a clear message; these lifecycle extensions are not relabelled as
unchanged native clear behavior. Replay stores configuration, not live filter
history, pitch-buffer audio or a transport snapshot.

These kernels consume fixed k-rate values once per call. Faithful graph adapters
must preserve the original callback timing and disclose any canonical-quantum
buffering. Pitch has time-varying dual-tap delay with an undelayed dry blend;
its approximate 25 ms sound does not justify claiming a fixed 25 ms compensable
latency. Z-plane frequency-dependent phase is likewise not a fixed path delay.
Host smoothing and outer bypass/mix behavior remain integration work.

## Evidence and reproduction

`node tools/buildOwnedRackFx.mjs --audit` builds only local audit artifacts under
`.tmp/owned-rack-fx`; `node tools/auditOwnedRackFx.mjs` compares to the preserved
original worklet classes. Native browser automation is not used by this Node
reference test. The unchanged source hash is
`259a75b8dff44f9b53a304930fd2f460c6fbbad850d09af4aeed9f46f190b296`.

The audit report `reports/modular_audio/owned-rack-fx-parity.json` records 300
comparisons across 8/24/44.1/48/96/192 kHz, all 12 built-in shapes and custom
morphs, pitch extremes/fine offsets, crusher quantization and dry/wet settings.
296 are bit-exact; maximum absolute sample error is 7.105427357601002e-15.
Audit build `8d69dca7a813ac15` is 71,860 bytes; allocator exports account for part
of that build. Nine two-handle cases at 44.1/48/96 kHz report zero allocations,
reallocations, frees or memory growth after preparation, plus exact matching
instance output and isolated reset clocks. Two handles use 1,245,184 Wasm bytes
for crusher/Z-plane or 1,769,472 for pitch in this audit build.

Eight tests in `ownedRackFx.test.js` pass, including dynamic parameter and custom
shape updates on irregular callback partitions, save/reload and exact PCM replay,
independent handles, negative-half/signed-zero rounding and raw/host rejection.
The default test reads `public/modular-audio/rack-fx.wasm`; local audit builds can
be selected with `OWNED_RACK_FX_WASM=.tmp/owned-rack-fx/rack-fx.wasm`.

The build helper's optional `--publish` produces the dedicated public Wasm and
manifest; parent integration owns publishing and shared graph/build checks.
`--check` validates the selected output directory's Rust/runtime/shape/Wasm
provenance. No existing live backend is selected automatically. Browser audio,
physical listening and desktop deadline behavior are not claimed by this audit.

Parent published production build d7303d633df13018,71429 bytes; source/runtime/Wasm provenance check passes. Instrumented audit build hashes remain separate. Published-asset permanent tests pass.
