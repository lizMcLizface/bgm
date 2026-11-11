# Optional normal rack dynamics

Current publication uses the separately versioned stamped-word transport. The original independent AudioParam fields could expose partial records during unsuspended normal-host restoration; ACK capacity alone did not make their payload atomic. Prior positive reference runs below retain their original version binding. See [the stamped transport contract](MODULAR_AUDIO_ENGINE_STAMPED_TARGET_TRANSPORT.md) for the retained negatives, formal publication proof, measured overhead and current acceptance boundary.

The accepted compound dynamics leaf is committed as0439b06. Its17cca081c52cf5f8 native147-case acceptance remains a distinct baseline. This follow-up adds an optional per-call factory to the real Effects Desk graph and extra limiter; Native construction remains the default when no factory is supplied.

## Native chronology

The original compressor code reads `context.currentTime` separately for dry, wet, threshold, ratio, knee, attack and release, in that order. The limiter reads it for threshold, outer wet and outer through. The normal factory retains those exact call orders and individual getter reads. Initial writes are steps; subsequent writes use the original12/20ms targets. No unused lane is retargeted. The old atomic packet API remains available with its own explicit timestamp contract.

Each complete normal patch validates its full target tuple, samples the first existing timestamp once, and reserves the entire7/3-call capacity before its first target or snapshot mutation. That timestamp is reused for the first write; later writes read `currentTime` individually. A rejected reservation applies no part of the patch. Calls that fail a later clock/host validation remain errors rather than synthesized timestamps.

Normal transport has32 acknowledged records, each carrying lane/value, exact integer-frame halves, sequence and step/target flag. This uses193 native AudioParams containing authored metadata only. Rust owns all smoothing/DSP. Four full seven-call compressor patches can be authored before observation; a fifth safely refuses. This covers original initialization, immediate workbench reapplication and reload/reorder paths without deduplicating repeated calls. The prepared Rust timelines have64 entries to accommodate32 calls to one lane plus retained predecessors/constructor points. The generic transport defaults remain8 slots for the existing atomic protocol.

## Optional host seams

`prepareNormalRackDynamics(context)` returns an immutable synchronous factory for that exact context. Its stages own a single input/output worklet, preserve cold latest-target snapshots, report bounded async health/stats, and dispose their owned state. Reduction metering uses at most one async stats request at a time. Clear remains a no-op, matching the original rack compressor/limiter.

`createRack(...,{dynamicsFactory})` uses the compound compressor while retaining the original external input Gain for the pre-DSP analyser. `createExtraStage(context,'limiter',{dynamicsFactory})` returns the whole owned limiter/bypass stage; no duplicate outer bypass is added. Without this option both literal Native routes remain available. Existing pluginFactory behavior is unchanged, and Width/Filter/Ring factory adoption is outside this change.

The prepared environment exposes `rackDynamicsFactory` at its top level. It is not a serialized song field or an accepted Instrument constructor option. Forwarding into normal application hosts remains gated on real normal-path Native comparison; merely preparing the environment does not select this optional rack branch.

## Current evidence

Per-call unit/actual-Wasm tests cover seven distinct timestamp reads, exact call order, limiter3-call order, four successive initialization/restore patches, whole-patch overflow refusal before mutation,32 same-lane records and untouched lanes. Existing27 atomic/kernel/lifecycle tests still pass. Default Native graph/plugin tests pass; optional routing tests verify the input analyser, absence of a redundant bypass layer and idempotent async teardown. Environment validation rejects effects factories in unsupported Instrument options.

The normal allocation audit covers12 cases at8/24/44.1/48/96/192 kHz for compressor/limiter:12,000 actual processor callbacks and62,592 authored records, including32 same-lane bursts, inactive callbacks and cold resets. Rust allocation/reclamation/growth counts are zero. In this synthetic NodeVM run, the largest per-case median process time is0.0969ms, largest p95 is0.1607ms and largest observed callback1.01ms. These figures include synthetic controls every callback; they exclude Native AudioParam transport/serialization and do not establish device deadline safety. Report: `reports/modular_audio/rack-dynamics-normal-allocation.json`.

Actual normal-host acceptance on **d5dacd86a2cc7397** passes all60 cases:10 each at8/24/44.1/48/96/192 kHz. The actual normal graphs retain two active owned dynamics owners; cold JSON replacement disposes the old pair and prepares a fresh pair (four total recorded owners). Five rates have max absolute and relative RMS sample errors0;96 kHz has max absolute error1.043081283569336e-7 and max relative RMS6.014669642922696e-9, within the original1e-4 limits. The exact reports are `reports/modular_audio/rack-dynamics-normal-{8000,24000,44100,48000,96000,192000}-final.json`. No limits, gain fitting or output shifts changed.

The retained atomic API also passes its complete147-case regression on **ad55e63646117856**:13/13 shards,72 portable/72 actual worklet/3 reused live cases. All twelve rate/executor shards have sample and relative RMS errors0. The reused live shard has max absolute error8.940696716308594e-8 and relative RMS7.0012624853758375e-9. Aggregate: `reports/modular_audio/rack-dynamics-atomic-regression-final.json`; complete2.096MB manifests and shard records: `rack-dynamics-atomic-full-final.json`, run `bcf0b70a-c679-476a-88db-9f12d4bf349b`, started2026-11-11T18:30:30.575Z. Both new profiles share Wasm SHA256db64b55a617dd518d7e9d215e908192972dd1780c9f9f8c400b8d9081cbccfe6. These results are distinct from the original17cca baseline, with its own exact-error0 report.

The new normal profile is optional; forwarding into real application hosts remains a separate integration step.

 `tools/rack-dynamics-normal.html` runs10 contexts per selected rate: mono/stereo cold-double initialization, bypass/reorder/removal/re-add, JSON reload, and compressor/limiter lane writes forced into separate quanta. It uses the actual `createRack`/`createExtraStage` Native and optional owned routes with the same upstream signal. The original fixed1e-4 max sample and relative RMS bounds apply; no gain fitting or output shift is allowed.

```powershell
node tools/buildRackDynamicsLive.mjs --publish
node tools/buildRackDynamicsLive.mjs --calls --publish
node tools/buildRackDynamicsLive.mjs --calls --publish --check
node tools/buildRackDynamicsLive.mjs --calls --audit
node tools/auditRackDynamicsCalls.mjs
```


## Normal host forwarding (desktop integration gate)

The optional prepared `rackDynamicsFactory` now travels through All's instrument/mixer racks, both Generator CLASSIC creation paths, CLASSIC live/offline external racks, and the serial/three-bus workbench. `startDiySynth` accepts an optional `prepareAudioEnvironment(context)` callback after creating its original context, validates context binding, and uses only the prepared rack factory here; omitting it retains the existing Native route and context policy. Runtime factories remain outside song JSON.

All wakes arm external racks before booking. CLASSIC arming is skipped during suspended/offline preparation, and live source stacks aggregate their external racks. Workbench arming waits for a pending topology replacement. Owned teardown is aggregated; partial parallel preparation or a rejected replacement is disconnected/disposed. CLASSIC disposal invokes every owner even after a synchronous failure, immediately disconnects its output, waits for all asynchronous owners, and records an AggregateError without leaving other owners unfreed.

Actual browser Native/owned host comparison passes **18/18** cases on the same **d5dacd86a2cc7397** numerical profile: three at each8/24/44.1/48/96/192kHz. Cases are workbench serialÃ¢â€ â€™parallelÃ¢â€ â€™serial, parallelÃ¢â€ â€™serialÃ¢â€ â€™parallel and cold CLASSIC external-rack reconstruction. The source input is deliberately shared deterministic stereo PCM so this comparison isolates the actual host's external rack, routing and fades. The largest max sample error is7.301568984985352e-7 and largest relative RMS error2.0167677475601459e-7 (24kHz), below unchanged1e-4 limits. Serial cases record10 total owned stages/2 active at completion, parallel14/6, CLASSIC2/2. Reports: `reports/modular_audio/rack-dynamics-hosts-{8000,24000,44100,48000,96000,192000}-final.json`. No numerical assets changed for forwarding.

The first actual six-source All dynamics/reload attempts exposed failures before the current stamped profile. The first attempt (`owned-host-dynamics-first.json`) ended before any dynamics owner was created, but the review tool accidentally replaced the primary startup error with its secondary missing-owner check. That negative report is retained; the review tool now preserves primary errors/stacks and records secondary checks separately, covered by two regression tests. The first report does not establish a DSP failure or a startup cause. No DSP fix or timing offset was inferred from it.

`tools/rack-dynamics-hosts.html` runs the three external-rack comparisons per selected rate. `tools/owned-active-host.html` has a distinct CLASSIC/rack dynamics batch for real-source routed output, live desk edits and saved-host reconstruction; its health result is separate from exact external-rack PCM comparison and physical listening.


Current stamped publication is accepted on the complete225-case desktop sweep plus the actual six-source All three-host/reload batch. Normal identity `4a9139b792b7efd2` and atomic `4d6b7d778e0eb3d1` share the unchanged kernel. Atomic147 cases have sample/RMS errors0, normal60 worst is1.043081283569336e-7 /6.014669642922696e-9, and actual workbench/CLASSIC18 worst is7.301568984985352e-7 /2.0166515838102606e-7. Actual All records45 owned dynamics stages without errors and retains source/desk/live-edit/reload behavior. Full evidence, retained failures, exact resource costs and the next task are in the [stamped transport contract](MODULAR_AUDIO_ENGINE_STAMPED_TARGET_TRANSPORT.md). This optional prepared environment selects the owned rack path; omitted factories retain Native defaults.

## Dormant startup follow-up

Normal calls5a236fa5de4b0607 and atomic a72a4aa085cfe2e2 add only bounded
pre-origin admission for declared dormant, input-isolated owners. The kernel
bytes remain unchanged. Two144owner real-context batches pass, as do actual
All/reload and built48k native rack comparisons. Active stamped metadata remains
strict; a separate Width activation failure is still under diagnosis. Exact
conditions, counts, identities and retained negatives are in
[the startup record](MODULAR_AUDIO_ENGINE_RACK_STARTUP.md).
