# Live VoiceCompressor Rust stage

This is an additive port of the existing `VoiceCompressor` raw controls and its
actual Instrument/VoiceFx lifecycle. It preserves the accepted captured APIs and
the original native factory. A prepared context-bound factory injects the Rust
stage; there is no preset/backend field or per-effect UI selector.

## Native lifecycle evidence

`reports/modular_audio/voice-compressor-pending3.json` records 48 actual native
comparisons: 8/24/44.1/48/96/192 kHz, mono/stereo, eager Instrument and lazy VoiceFx,
and initially active/bypassed. Controls change during both a short bypass and a
2.1-second bypass. The source-derived pending-event policy passed all 48 cases,
maximum absolute PCM difference 1.1920928955078125e-7. Four simpler lifecycle
policies failed all cases; their negative evidence is retained.

The production owned backend independently passed the same 48 actual native cases
in `live-voice-backend-production.json`: maximum absolute difference
1.1920928955078125e-7 and all six observed intrinsic parameter values exactly
equal (0 Float32 ULP). That report uses numeric build 434f135ddebe7dc7. Subsequent
worklet/facade packaging retains the same 74,534-byte numeric Wasm. The actual
managed AudioWorklet host batch then passed all 48 cases on bundle
e872febf68deb64d. `reports/modular_audio/live-voice-host-final.json` records maximum
absolute difference 1.1920928955078125e-7 and relative RMS error
7.387176821613904e-9, identical raw call sequences and applied suspension frames,
and successful processor health. This is separate acceptance of actual
Instrument.set/updateChain and VoiceFx routing, not only the standalone kernel.
The permanent batch is `tools/live-voice-compressor.html`.

`live-voice-state-first.json` then passed 18 actual four-channel comparisons with
two simultaneous stages, JSON settings round-trip and cold stage replacement.
The unaffected second stage retains independent settings/history. Three source
variants distinguish continuous zero PCM, a genuinely stopped/restarted
AudioBufferSource and delayed first input. All six rates pass: maximum absolute
error 2.9802322387695312e-8, relative RMS error 2.782886404477218e-9. The permanent
page is `tools/live-voice-compressor-state.html`. The separate legal maximum-
release follow-up also passed all 18 cases: `live-voice-extreme-final.json` records
maximum absolute error 2.9802322387695312e-8 and relative RMS error
2.936054490876809e-9. It uses the same fixture and unchanged bounds through
`tools/live-voice-compressor-extreme.html`.

Bundle ac6248622e53a405 added disposal/error cleanup after these native batches;
final bundle 61003cb61b59b2f0 adds the independently verified host render clock.
Numeric Wasm remains byte-identical: SHA-256
923e65664dc31cb3243f44be1dff77fffce9c32dad86553dde2ea5203c8773da.
Failed/closed processors release without waiting for an unavailable handler;
acknowledged disposal removes the node reference and listeners. Meter polling
stops after failure, and intentional cancellation during disposal does not create
a false processor error.

## Reused AudioContext callback clock

Independent native AudioBufferSource cursor/AudioParam probes established that a
resumed host's global `currentFrame` can repeat while each actual native callback
consumes another 128 samples. Dropping/repeating PCM solely because that reported
global frame repeats is incorrect. The shared `HostRenderClock` anchors the first
canonical frame, advances one quantum for each actual callback, and uses a later
global epoch only as a forward anchor. It rejects backward/noncanonical epochs
and stale lag beyond the explicitly declared 8192-frame safety limit. A genuine
unpulled forward gap does not synthesize missing DSP samples.

The builder embeds the exact shared helper source (only its export is removed)
and includes it in runtime provenance. The strict portable Rust clock and native
32/128 mathematical clocks are unchanged. No native pulled parameter value feeds
the Rust calculations.

`reports/modular_audio/live-voice-reused-final.json` then passed three actual
48 kHz AudioContext rounds in the same resumed context, with two separate Rust
facades and two original native VoiceFx references in each round. Eight channels
are captured before muting the destination. Maximum absolute error is
3.129243850708008e-7 and relative RMS error 1.1485966899135134e-6, under the unchanged
1e-4 bounds. The third round measured one recovered stale callback per facade
(128 frames); another round recorded a 384-frame genuine forward epoch gap.
Every facade reported zero waiting/silenced frames. The VM regression separately
covers the original three-stale-callback native marker fixture. The same permanent
page exposes **Run reused live context batch**.

The declared native PCM bounds remain maximum absolute error 1e-4 and relative RMS
error 1e-4. There is no post-alignment, gain fitting, rate-specific arithmetic
switch or weakened bound. These measured browser fixtures establish bounded
coverage, not universal browser/CPU identity.

## Two clocks and bounded pending targets

The original amount-zero host bypass stops processing compressor history while
the context clock advances. Parameter insertion still prunes historical events.
Unprocessed new `setTargetAtTime` events are clamped to the first resumed pull,
as pinned Chromium AudioParamHandler does. Keeping only the newest target, running
the core on zeros, or evaluating every disconnected target at its old timestamp
changes native output.

`synth-engine/voice-compressor-live` owns the existing compressor kernel, five
control timelines, the separate a-rate makeup Gain clock, stereo buffers and
bounded target storage. Commands are immediate at canonical 128-frame context
boundaries. Five raw controls retain original ranges, 20 ms targets, coupled
amount/ratio/trim formula and Float64 makeup calculation. The kernel retains its
32-frame division clock and native 128-frame parameter clock.

Preparation allocates all audio/controller storage. Render, parameter changes,
first lazy activation, synchronization and reset use prepared storage. The dry
path copies PCM and does not tick the core or its parameter evaluators. The
intrinsic lookahead is the existing native rate-dependent delay; active latency
reports it, while dry bypass reports zero. This dynamic transition cannot be
represented as a fixed automatic PDC promise.

`syncFrame` advances the absolute context clock after a pull gap without rendering
missing audio. `reset` starts fresh native histories at the current canonical
boundary with the latest requested raw controls. Saving restores settings and
host lifetime, not running delay/detector/parameter histories.

## Host interface

`createLiveVoiceCompressorFactory(context)` prepares the immutable Wasm module
and processor for that exact context, then returns a synchronous factory
`(context, {hostLifetime: 'instrument' | 'voicefx'})`. Reusing it with another
context throws. Each node has its own Wasm instance and mutable state.

`RustVoiceCompressor` preserves `getNode`, `connect`, the five setters and the
reduction meter. `managedBypass: true` keeps its lightweight dry stage connected
after creation, while Rust skips the compressor at amount zero. VoiceFx retains
its original lazy creation. Instrument creates the eager stage. Neither original
native factory nor normal defaults are replaced globally.

`ready` resolves after resources/node wiring, without waiting for a suspended or
offline render-thread handshake. `health` separately records processor creation
or error. Meter requests are bounded to one pending request and are not sent
before health or while suspended. Construction-time raw calls retain their
chronology rather than collapsing to a synthetic final snapshot.

The worklet has fixed control/trace queues. It records requested and applied
frames and late deliveries; ordinary asynchronous controls are applied at the
actual receiving boundary, not retroactively. The native-reference batch awaits
control acknowledgements while genuinely suspended so exact event schedules can
be compared. Queue overflow and invalid controls reject explicitly. No worker
pool or SharedArrayBuffer is required for this small serial effect.

## Permanent checks

Nineteen focused checks cover six-rate partition-invariant PCM, two handles,
configuration round-trip/latest-target reset, atomic validation, bypass clocks,
actual public processor execution, future controls, disposal, context ownership,
readiness, bounded meter requests, failed/closed-context cleanup, idempotent
disposal, the pending-meter/disposal race and the actual public processor's
measured stale-frame sequence. Four additional shared clock tests cover the
native marker fixture, genuine pull gaps, invalid epochs and declared lag limits.

The audited build matches 48 persisted fingerprints of the independently native-
accepted owned policy, then executes 480,000 controls during bypass across 12
rate/lifetime cases. It reports zero allocation/reclamation and no Wasm memory
growth after preparation. These hashes are owned-reference fingerprints, not a
claim that native PCM is byte-identical. The fixture capture tool requires the
separately pinned research baseline and never regenerates acceptance from the
production implementation.

```powershell
node tools/buildOwnedLiveVoiceCompressor.mjs --publish --check
npm.cmd exec vitest run src/modular-audio/ownedLiveVoiceCompressor.test.js src/nodes/voiceCompressorRust.test.js
node tools/buildOwnedLiveVoiceCompressor.mjs --audit
node tools/auditOwnedLiveVoiceCompressor.mjs
```

Instrument's managed-stage and effectsReady hooks are coordinated with the live
piano stream and remain in its uncommitted Instrument change until that stage is
accepted. The accepted standalone/facade/VoiceFx checkpoint does not claim normal
application adoption on its own.

Remaining acceptance is coordinated runtime-environment adoption and its full
application playback/export route.
Native AudioBus silence/tail liveness outside this
component is not inferred from zero-valued PCM. The uninterrupted-input bypass
fixture does not establish every upstream silence-flag policy. The parallel-mix
EffectRack compressor remains a distinct topology.
