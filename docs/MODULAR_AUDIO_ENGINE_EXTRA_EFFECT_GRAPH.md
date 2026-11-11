# Owned rack and space effects in the reference graph

Updated 2026-11-11. The experimental graph now exposes the actual preserved owned
Crusher, Pitch, ZPlane, Shimmer and Freeze kernels. Existing native worklets,
default DSP routes and native unseeded Freeze playback remain operational.

## Contracts and timing

Graph types are `rack.crusher`, `rack.pitch`, `rack.zplane`, `voice.shimmer` and
`voice.freeze`. Each consumes stereo `program.in` and emits `audio.out`. Complete
owned configuration is required; a partial `parameters` object cannot substitute
for the original target list, shape banks or explicit voice-FX seed.

`rack_nodes::Adapter` and `voice_nodes::Adapter` capture exactly 128 input frames
and emit the previous completed kernel block. Their declared adapter latency is
128 frames. Arbitrary graph block sizes and unrelated event splits cannot change
the kernel's original callback cadence. Parameter events must land on canonical
128-frame input boundaries; late valid targets advance to the next boundary.

This is the same original DSP at its original cadence, shifted by the explicit
adapter buffer. Rack Pitch's native wet dual-tap delay is time-varying; the
declared 128 frames cover the adapter only. They do not claim wet/dry phase
alignment or a fixed delay for the pitch algorithm.

Both helpers expose `initial(index,f64)`, `prepare()`, `param(index,f64)`,
`parameters()`, `tick([f32;2])`, `reset()` and `stat()`. Initial controls are accepted
only before preparation; live controls require a prepared adapter at phase zero.
The exact requested f64 target ledger survives reset. Rack DSP retains its
original Float32 AudioParam conversion; voice message controls remain f64.
Shimmer/Freeze retain the explicit `xorshift32-v1` seed and restart it on reset.
Reset also drops pending capture, cached output, histories and transport clocks.
Freeze hold remains at its latest target, so resetting while held starts the
original empty-recording retry behavior rather than releasing hold implicitly.

ZPlane shape count and every built-in/custom row must be prepared before use.
Graph V1 makes all rows immutable after preparation, including custom banks64/65.
Selecting and morphing prepared banks remains available through parameter events.
Standalone owned RackFX retains its separately documented custom-edit API.

## Freeze execution capability

The actual `voice.freeze` descriptor declares `execution:'worker-only'`. Its
original capture copies up to four seconds and scans energy synchronously, so
allocator-free code is still not safe to assume under an AudioWorklet deadline.
All direct realtime constructors reject it before Wasm instantiation. Dedicated
worker PCM playback is allowed; worker startup failure cannot silently select
serial realtime fallback. It cannot occupy the dependent realtime pool master.
Direct/offline `ReferenceGraph` remains available for compatibility verification.

## Evidence and reproduction

Private helper probe:

```powershell
node tools/buildGraphFxAdapterProbe.mjs
node tools/auditGraphFxAdapters.mjs
```

`reports/modular_audio/graph-fx-adapter-parity.json` records 30 bit-exact helper
comparisons against the actual owned kernels at 8/24/44.1/48/96/192 kHz. Tests
include arbitrary graph splits, dynamic controls, partial-capture reset, exact
target retention, seeded replay, and three Freeze captures per sample rate.
All 30 allocation cases record zero allocator/reclamation calls or memory growth;
five additional two-adapter cases verify independent state. This probe is a
private audit crate, not a production ABI or published asset.

Published graph and actual processor constructors:

```powershell
npm.cmd test -- src/modular-audio/extraEffectGraph.test.js src/modular-audio/processorExecutionPolicy.test.js --reporter=json --outputFile=.tmp/extra-effect-graph-tests.json
node reports/scripts/reportExtraEffectGraph.mjs
```

`reports/modular_audio/extra-effect-graph-verification.json` records the exact
published Graph/owned-kernel hashes and 38 passing checks. All five graph effects
match standalone owned PCM exactly with the declared shift at 44.1/48/96 kHz,
despite foreign gates at frames13/41 and odd block lengths. The tests cover f64
automation, reset at latest controls, saved/reloaded complete configurations,
independent graph handles, immutable custom shapes, and raw ABI attempts to omit
required initial targets. A real dedicated worker also runs a seeded Freeze graph
with matching-cadence PCM equality. Realtime constructor tests use the actual
published descriptor and valid Freeze configuration, while checking successful
ordinary preparation on every constructor.

The source-pool integration separately retains Rack Pitch and Shimmer in the
dependent compensated master at 48/96 kHz; see
`MODULAR_AUDIO_ENGINE_POOL_EFFECTS.md`. These functional checks do not assess
physical listening, AudioWorklet scheduling deadlines or parallel speedup.
