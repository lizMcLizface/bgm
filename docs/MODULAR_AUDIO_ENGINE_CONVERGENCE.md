# Audio engine convergence inventory

First cleanup slice, 12–13 November 2026 (Europe/London). Baseline: `dc9b1e8f`.
Read this inventory alongside `MODULAR_AUDIO_ENGINE_CLEANUP_HANDOFF.md`.
The handoff remains the authority for frozen WIP and prior numerical receipts.

The application has optional Rust factories and several accepted components. It
does not yet have a complete Rust execution path for every Instrument effect,
return and final global volume. Normal application selection and defaults are
unchanged by this cleanup.

## Selection and dependency spine

`Generator` / `synths/all/host.js` → `audioEnvironment.js` validation →
`clockedOwnedHostEnvironment.js` → `ownedHostEnvironment.js` → context-bound
factories. An environment prepares capabilities; it does not select every
standalone original-effect actor with a similar name.

The tracked desktop entry is `tools/audio-engine-review.html`. It promotes the
actual `reports/scripts/mainOrderedMixReview.js` setup, including the temporary
incumbent control-pull consumer and its SourceFence ownership. The original
ignored scripts remain local evidence, not maintained parallel entry points.
`tools/audioEngineReview.js` is now the canonical version of that review.

After selection, use the browser Reload command outside a page-button gesture.
Page-button navigation can auto-resume Web Audio before cold constructor capture.
Saving a passed recipe likewise requires a real browser Reload before replay.
The opt-in review prepares `generatorRustMasterSession.js` at suspended frame
zero, activates its role/scalar/output roots, selects clocked Core/FM factories,
then publishes through `mainStoppedRuntimeBinding.js` / `stoppedRuntimeBundle.js`.
`generatorOrderedMixRoot.js` adds four explicitly budgeted cohorts. It refuses
a whole-runtime overlap before owner/settings/registry mutation; a stopped
source-slot replacement remains supported. No quotas are raised in this slice.

`tools/all-desk-host.html` links to this entry. The owned-active page is covered
by the accepted mixer provenance guard; it is kept byte-identical in this slice.
The two existing pages retain their distinct coverage: the former exercises the actual All desk;
the latter covers mixed physical/CLASSIC sources. The new fixed recipe uses
five simultaneous Core/FM roles and percussion, not six different source models.

## Component inventory

Unqualified runtime modules below are under `src/modular-audio/`; `app/` and
`nodes/` abbreviate their directories under `src/`. Public and engine paths are
repository-relative. Assets identify canonical families,
not an instruction to republish them. Bundled worklets imported with `?worker&url`
are emitted by Vite; standalone public bundles retain their existing provenance.
“Prepared” means opt-in application wiring exists; “reference” means a component
proof with no normal Instrument adoption; “WIP” remains unfinished.

| Component | Canonical source / generated assets | Actual selection and review status |
| --- | --- | --- |
| Core/FM | `clockedCoreLive.js`, `ownedCoreLive.js`; `public/modular-audio/core-live-clocked-build.json`, graph/core kernels | Prepared via `createCoreBackend`; integrated review explicitly selects 128 ms live-input lead and observes actual authority. |
| CLASSIC | `ownedClassicLive.js`, `classicLive.worklet.js`; `public/classic-live/` | Prepared via `classicSourceNodeFactory`; mixed-host coverage, not exercised by the integrated Core/FM recipe. |
| Piano / KS | `app/engine/pianoStreamingSource.js`, `pianoLiveSource.js`, `pluckedLiveSource.js`; `public/piano-live/`, `physical-buffer-clocked/`, plucked families | `instrumentOptions` selects owned physical sources for supported presets; mixed-host coverage. |
| Iowa | `app/engine/iowaInstrument.js`, `app/engine/iowaModel/player.js`; `public/iowa-live/`, Iowa preparation | `iowaSourceBackend: owned-rust`; mixed-host coverage. |
| Percussion | `app/engine/wasmDrumKit.js`, percussion kernel/worklet | Integrated recipe explicitly selects Wasm percussion and retains acknowledged lifecycle. |
| Voice / ordinary compressors | `nodes/voiceCompressorRust.js`, `nodes/compressorRust.js`; voice/native compressor public families | Prepared `voiceCompressorFactory` / `ordinaryCompressorFactory`; original Instrument synthMix/limiter policy remains explicit. |
| Motion / Shimmer | `nodes/motionRust.js`, `nodes/shimmerRust.js`; `public/motion-live-host/`, Shimmer families | Prepared via Instrument and voice-FX factories; logical demand and terminal ACK contracts retained. Freeze is separate. |
| Role Wander / pan / level | `ownedRoleWanderNode.js`, `generatorMainControlSession.js`, `generatorMainControlRoot.js`; Main role control public families | Prepared environment plus explicit cold Main roots. Integrated review exercises role mix, tone and source replacement. |
| Master scalar / fade | `generatorMasterScalarSession.js`, `generatorMasterOutputSession.js`, `generatorRustMasterSession.js`; `public/main-scalar-cold/`, Main output families | Explicit cold roots; integrated review checks stop/resume and honest intrinsic-read refusal. |
| Sweep | `generatorPreparedSweepSession.js`, `generatorPreparedSweep.js`; `public/sweep-live/` | Accepted optional `prepareSweep` session; ignored `mainPreparedSweepReview.js` proves its join separately. Integrated ordered recipe currently leaves Sweep Native. |
| Ordered send/sum | `generatorOrderedMixRoot.js`, `orderedSendBudget.js`, `orderedSendNode.js`; `public/ordered-send-live/` | Explicit `orderedMix:true`; integrated four-cohort review. Captured returns and Native outer junctions remain. Late publications are allowed and reported. |
| Legacy inserts / FDN bus | `ownedBusLive.js`, `ownedInserts.js`, `ownedEffects.js`; synth-lab inserts/effects kernels, bus-live manifest | Prepared `createInserts` / `createEffectsBus`. These algorithms are not the original named Instrument outer effects. |
| Rack Crusher / Pitch / ZPlane | `ownedRackPlugins.js`; rack-FX public families | Prepared `rackPluginFactory`; existing plugin control/bypass/routing. Distinct from original Instrument BitCrusher. |
| Rack dynamics / Width / Ring | `clockedRackDynamicsFactory.js`, `nativeClockedRackFactory.js`; `public/rack-dynamics-calls/`, rack-native families | Clocked environment replaces normal rack factory seams. Filter remains separately scoped. |
| Original Filter / EQ2 | `nodes/instrumentToneRust.js`, `nodes/instrumentToneFacade.js`; `public/instrument-tone-host/`, `instrument-tone-live/` | Reference live actor; `Instrument.js` still constructs `Nodes.Filter` / `Nodes.EQ2`. Keep facade/interleave numerical and route laws. |
| Original BitCrusher | `nodes/instrumentCrusherRust.js`; `public/instrument-crusher-host/`, live assets | Reference actor; normal Instrument construction still Native. Four-owner quota blocks blind five-role adoption. |
| Original Delay / PingPong | `nodes/instrumentDelayTimingRust.js`, `originalDelayTiming.js`, `app/engine/tempoEffects.js`; `public/instrument-delay-timing-kernel/`, `instrument-delay-timing-live/` | Timing facade seam registered; normal Instrument still Native. Per-input-channel timeline fork is behavioral, not packaging duplication. Preserve tempo/reload counterexamples. |
| READY Distortion | `nodes/distortionRust.js`, `instrumentDistortionLiveProcessor.js`; `public/instrument-distortion-live/` | Accepted reference actor with asynchronous resource readiness and four-owner budget. Not adopted by Instrument. |
| Direct-cell Distortion | `nodes/distortionCellsRust.js`, `instrumentDistortionCellsProcessor.js`; `public/instrument-distortion-cells-live/` | 22 frozen WIP files. Numerical basis accepted; direct live bank/replacement, multi-rate and reload acceptance pending. Candidate for synchronous canonical adoption, not yet selected. |
| Chorus / Phaser | `synth-engine/instrument-modulation/`, numerical host modules/public family | Numerical reference accepted. Thirteen frozen live-modulation WIP files lack actual node/factory/admission and complete browser acceptance. |
| Flanger | `synth-engine/instrument-flanger/`, numerical host modules/public family | Numerical reference with explicit traversal variants; normal Instrument remains Native. |
| Rack outer trim/pair | `rackOuterCore.js`, `rackOuterStageNode.js`, `rackOuterPair.js`; `public/rack-outer-live/` | Accepted standalone two-stage actor. Pre-nonlinear trim and post-FX processed/bypass mix are separate operations. Normal Generator activity authority remains unfinished. |
| Logical activity | `orderedActivityCore.js`, `orderedActivityProcessor.js`, `rackActivityTrimCore.js`, `rackActivityTrimProcessor.js` | Four frozen WIP files; no factories/builders/integration. Receiver diagnostics mismatch is still pending. Do not count zero PCM as inactivity. |
| Room / Freeze | continuous Room, split Room, `fdnRoomLive*`, Freeze streaming modules; `public/room-continuous-live/`, `fdn-room-live-host/`, `freeze-stream/` | Component and optional factory proofs; delayed private returns/lifecycle/PDC are not a completed normal Instrument path. |
| Ambience / weather | `ownedAmbienceHost.js`, bank/spatial/playback modules | Prepared `ambienceOptions` / `weatherOfflineFactory`; integrated recipe deliberately silences ambience to isolate ordered music routes. Retain ambience-host reviews. |
| Final global volume | `src/audio/bus.js` | Native Gain; UI AudioParam readers/writers still depend on it. No replacement in this cleanup. |

## Duplication and removal decisions

An exact-byte scan of tracked JS/Wasm/Rust files of at least 512 bytes under
`src/modular-audio`, `public` and `synth-engine` found 19 duplicate groups,
1,842,283 repeated bytes. This is a byte count, not a safe deletion estimate.
Ignored machine inventory: `reports/cleanup-convergence-2026-11-12/` contains
`dependencies.json` and `duplicate-bytes.json` (the initial scan counted 10,249 import edges).
The import scan is lexical: dynamic URLs and manifest-generated dependencies
must still be checked before removal.

| Candidate | Decision / prerequisite |
| --- | --- |
| Five identical Tape Wasm copies (`tape-live-audio`, `tape-live-resources`, `tape-live`, `tape-native-audio`, `tape-portable-audio`) | First packaging consolidation candidate. Choose one shared immutable kernel URL, update loaders/builders/manifests and all five contracts together; retain distinct lifecycle/reference wrappers until proven redundant. |
| Physical-buffer / piano Wasm; rack-native / rack-native-live Wasm; motion kernel/host copies | Packaging candidates after loader/provenance audit. Equal bytes do not prove equal owner lifecycle. |
| Tone / Delay numerical-host and live-host copies | Shared immutable assets are plausible; retain distinct numerical and live route laws. The older stereo Delay timeline remains a negative reference. |
| Ignored Main root/master/ordered review copies | New tracked entry supersedes ordered review maintenance. Keep local evidence; do not promote all historical scratch scripts. Cold reload and Sweep setups remain scoped references for future joins. |
| Targeted numerical pages | Retain when testing constructor chronology, gap/reconnect, traversal, attribution or a real counterexample. No mass deletion of review pages by filename or age. |
| Direct-cell vs READY Distortion | Decide only after completing the direct actor's pending acceptance and measuring five-role plus replacement capacity. Preserve both until then. |
| Modulation / activity scaffolding | Preserve all hashes and pending status. Finish only when needed for the next integrated join. |
| Dense one-line helpers | The promoted review/helper are formatted for maintenance. Avoid broad formatting of provenance-hashed runtime sources. |

## Finite sequence from here

1. Establish this inventory and one tracked Generator review with explicit
   selection, grouped muted/listen checks, stop, real reload replay and actual
   terminal cleanup. Keep the mixed-source host as complementary coverage.
2. Audit and consolidate the identical Tape kernel packaging without changing
   DSP or default selection. Update all dependent guards in the same slice.
3. Resolve one normal Instrument outer-effect join, beginning with direct-cell
   Distortion acceptance and measured bank/replacement admission. Whole preset
   and morph preflight, amount-before-drive ordering, hold/tempo and diagnostics
   must remain honest. Do not create another permanent packaging namespace.
4. Establish real source/activity authority, then private processed/bypass and
   return joins. Preserve both rack trim positions; never infer demand from PCM.
5. Join prepared Sweep with the chosen ordered runtime; integrate delayed Room/
   Freeze/PDC and finally post-sum global volume with its UI adapter. Expand the
   same acceptance entry rather than adding another application demo.

Run `npm.cmd run test:accepted` for tracked accepted coverage; `npm.cmd test`
still discovers unfinished untracked WIP. The explicit accepted runner promotes
the prior ignored tracked-only Vitest configuration into `tools/`, so acceptance
no longer depends on a scratch file. Run focused checks first, full accepted
coverage and the public build after a coherent change. No push or deployment.

All 39 WIP file hashes and the ZIP hash were reverified before editing. The
archive remains at `reports/cleanup-handoff-2026-11-12/untracked-wip.zip` with
SHA256 `8c3200477061de6a3309aa7dd89a786b171eb402041e8df96a3981d5861bfc65`.

## First-slice verification

Evidence remains ignored under `reports/cleanup-convergence-2026-11-12/`.
The accepted runner passed the 890 previously tracked files: 7,339 tests and
four skips, in 203.49 seconds. Its file list was captured before the new replay
tests were staged; those two new tests passed separately. Frozen WIP is excluded
from this acceptance, and its pending status has not changed.

The actual 48 kHz browser baseline and saved-recipe external reload replay
passed six-role/cohort output, controls, ten stop/resume command acknowledgements,
stopped source replacement, overlap refusal and terminal ACK cleanup. The replay
matched all four recipe/settings/preset/factory fingerprints. The baseline
recorded 18 late ordered publications and the retained replay recorded six;
these are functional receipts, not zero-late scheduling guarantees. A separate
listening-button run also visibly passed; listening quality was not assessed.
Stop during preparation was checked separately: it cancelled acceptance, retired
the acquired Main/scalar/output owners with clean ACKs, left no registry claims,
and reported the actual zero cohort budget. Cancellation is not a passed batch.

All public provenance prechecks passed after restoring the guarded owned-host
HTML. The Vite public bundle and `checkPublicBuild.mjs` passed with the existing
large-chunk warning. The new entry is registered and required by the artifact
checker. Initial build failures (guarded navigation HTML and unsupported
top-level await in the page loader) were corrected without regenerating DSP.
