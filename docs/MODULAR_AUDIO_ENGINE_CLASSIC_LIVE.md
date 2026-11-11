# Owned CLASSIC live source bridge

The fourteen existing CLASSIC instruments now have an explicit owned Rust
AudioWorklet factory. This preserves their original Rust models, private
BBD/space/output stages and uploaded VectorVS/Quadwave resources. It adds no
replacement synthesis algorithm or adapter block latency.

## Host contract

`prepareOwnedClassicLive(context, {assets})` loads and verifies the standalone
`public/classic-live` Wasm and prepares that context's bundled worklet once. It
returns an async `sourceNodeFactory(context, options)` yielding the actual
`AudioWorkletNode`, with a `ready` promise and acknowledged `disposeOwned()`.
`factory.prepareContext(otherContext)` prepares a separate offline/live context
using the same verified immutable compiled module. Each node instantiates its
own Wasm memory, native engine, waves, note ownership and scope history.

`startLiveSynth({sourceNodeFactory, ...})` and
`ClassicsInstrument.create({sourceNodeFactory, ...})` opt into this source. Their
existing nativeGate, source input leases, external rack, output monitor,
destination and shared-context lifetime remain authoritative. The default
continues to construct the original legacy processor. Backend selection is a
prepared host dependency, not a change to saved song/preset data. The parent
host environment wires that dependency separately.

Offline preparation awaits the owned node before rendering and captures sorted
copies of the current params/resources/events. Repeated preparation shares one
promise; disposal during preparation rolls back without publishing the node.
Failed owned mono-stack preparation disposes every successful sibling. Live
Mercury D still uses the existing two/four-kernel stack, while the existing
one-kernel offline policy remains one kernel; this change does not reconcile
that pre-existing musical difference.

## Original controls and clocks

The adapter accepts the legacy message shape and explicitly remaps legacy
pressure/control codes 2/3 to owned codes 3/2. Timestamped notes, pressure and
controls use the original `round(seconds * sampleRate)` rule and split a
canonical 128-frame native callback at those source event boundaries. Untimed
params, sequencer commands and wave uploads retain their existing receive-time
semantics. The shared measured HostRenderClock gives each actual callback its
own source time when the browser repeats a reported global frame. It does not
invent missing audio callbacks or promise device timing.

The owned Rust admission now includes the original drum track tune/decay range
-1..1 (key fields 2/3), retains drum accent and pitched pressure 0..1, and accepts
original sequencer command 8 for per-pattern tempo. Additive owned stat indices
10/11/12 expose step/pattern/running; old indices 0..9 and original model math
are unchanged. Both Graph runtime and Rust source admission use the same model
and key-field rules. Pitched note-expression pressure remains 0..1.

Pending native events are bounded to 65,536 per node, host stats requests to 32,
params per packet to 256 and sequencer commands per packet to 4,096. Malformed
raw worklet payloads stop the source with an explicit error before Wasm casts.
Registration failures can retry. Disposal rejects pending host requests and
waits for the processor acknowledgement, with a bounded one-second fallback.
The processor uses JS message queues/scope copies; the zero-allocation claim
below applies to the Rust DSP, not to the JavaScript runtime or browser.

## Verification and provenance

`tools/buildClassicLive.mjs` builds offline with local Rust and
`--no-default-features`, and checks all Rust/host source hashes plus published
Wasm SHA. The final component is `f04c8685facab2b1`, 393,845 bytes, Wasm SHA
`fd9cb3cee9e67aff7bbc37bd0ad64fe090f48859c17cbefa8aa78a83ab7e2729`.
The legacy build was also refreshed because it includes owned.rs in its source
set; the original public legacy processor was not edited. Graph publication is
a coordinated parent build, separate from this standalone asset.

112 focused tests across eight files pass, including actual legacy/owned
processor PCM comparisons for all fourteen models at 44.1/48/96 kHz, real
presets and VS/WT waves, sample-split controls/pressure, held-note stealing,
scope, panic, strict payloads, independent memories, cold config replay,
registration retry, failed startup, offline rollback and source leases. Six
new admission tests exercise both JS and raw Graph Wasm using the isolated
private build, including rejection without queue insertion. Existing Graph
CLASSIC tests remain passing. After the parent published Graph
5d419303c1dba1f9, the six admission tests also pass against its normal public
asset, along with 25 additional existing compiler/composite/workbench tests
(including the real worker delivery protocol): 137 tests across 11 files.

The Rust allocator audit covers fourteen models x three rates, with two handles
per memory. Render/note/control/pedal/panic/reset produce zero allocation or
reclamation calls and no memory growth; largest prepared memory is 8,978,432
bytes. This is functional/allocation evidence, not a physical callback deadline
measurement.

The fixed `tools/classic-live.html` batch uses actual native legacy and owned
AudioWorklets. Its first browser capture produced exactly equal PCM in all 42
cases; however the harness incorrectly expected six applied events for drum
cases that explicitly sent two additional tune/decay events. That initial
report is retained as a failed harness result. The corrected batch records
expectedApplied 6/8 and requires final stats, pending zero and late zero, while
retaining exact PCM as the declared gate. The final corrected browser capture at component f04c8685facab2b1 passes all
42 cases with exact PCM zero, matching final event counts and no late/pending
events. A second real HTML reload at that final identity also passes with the
same complete-source hash. Evidence: classic-live-browser-final.json and
classic-live-reload-final.json under the local modular_audio reports directory.

The actual ClassicsInstrument offline host batch also passes all fourteen
models at 48 kHz: awaited factory/source preparation completes before
startRendering, final PCM through the existing external clean rack is exactly
equal to the native host, every output is nonzero, and every model retains one
offline source node (including Mercury D). There is no preroll, output shift or
constructor-readiness workaround. Evidence: classic-live-offline-host-final.json.

The first real HTML reload replays the complete saved Quadwave config, wave
resources and timed events exactly, with source JSON SHA
`b2a5b753883ad825763347863cda783087c287ce999744697e86849358aeeba1`.
The separate live host button routes the owned source through the actual
existing rack/monitor/destination and reports six applied events, zero late.
Physical listening is not assessed by those automatic reports.

## Remaining scope

Normal host environment selection is parent integration work. This component
keeps legacy defaults and external effect paths operational. Native versus
owned source parity does not establish bit identity of an entire song, host
mixing order, external effects or physical speaker output. Cold persistence
replays captured configuration/resources/events from frame zero; it does not
serialize a running oscillator, delay or voice state. Phone suspend/lock-screen
and device underruns remain separate from this desktop source acceptance.
