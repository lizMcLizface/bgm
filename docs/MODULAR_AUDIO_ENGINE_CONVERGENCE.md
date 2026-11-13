# Audio engine convergence inventory

First cleanup slice, 12–13 November 2026 (Europe/London). Baseline: `dc9b1e8f`.
Read this inventory alongside `MODULAR_AUDIO_ENGINE_CLEANUP_HANDOFF.md`.
The handoff remains the authority for frozen WIP and prior numerical receipts.

The application has optional Rust factories and several accepted components. It
does not yet have a complete Rust execution path for every Instrument effect,
return and final global volume. All now exposes an opt-in prepared Rust runtime;
its current playback backend remains the default. See the All integration below.

## Matched All comparison

All now includes **Compare backends → Freeze workbench and compare**. It captures
the current finite song (or the currently captured Continuous buffer), sound
presets and edits, source/mixer effects, desk, tuning, tempo, mutes and solos.
Ambience must be stopped and queued generation changes resolved. A separate
session-storage capsule drives Current → Rust → Rust → Current, with an actual
document reload and retirement before every trial, including the repeated Rust
trial. The normal All host, scheduler, visible desk and meters run throughout;
this does not substitute the raw-source preview or a synthetic DSP microbenchmark.
The captured material loops unchanged; new Continuous generation is excluded.
Probability and random-direction expression use one recorded seed through the
normal note/drum event factories, reset in every fresh trial. Ordinary playback
keeps its existing random source. A first unseeded repeat was correctly rejected
after its event ledger differed; its negative report is retained under reports/.

Each trial records three seconds idle, five seconds playing warm-up, then
10/30/60 audio-clock seconds of the song. The 30-second choice is the default.
It records output deadline counters, actual wall/context spans, output latency,
sampled nonzero meters, JS heap snapshots, main-thread timer-delay distribution,
the actual selected runtime and a hash of scheduled note/hit payloads and their
relative sample positions. Restored settings are checked against the frozen
recipe and the other runs. Normal rulebook persistence normalization is applied
before capture (an absent inherited-flags object and an empty one are equivalent).
Hidden documents, context interruption, edits, changed quality/buffer/viewport,
different event workloads, late scheduler submissions and unavailable deadline
counters prevent a clean matched-input verdict. Underruns themselves remain a
measured result, not a reason to discard a fair but poorly performing backend.

Trial controls are isolated from the inert musical interface, keyboard/MIDI
input is disabled, and nested workbench storage writes go into a session shadow.
The original local saved song, Continuous preferences and layout remain intact.
**Return to saved workbench** retires the trial host before returning. A missing
capsule gives a recovery link without constructing a fallback audio host.

Browser timer delays are not DSP CPU timings, and browser JS heap is not total
audio memory. `tools/measureAllComparison.ps1` optionally samples explicit OS
process IDs into JSON for the comparison's import control. Example:

```powershell
./tools/measureAllComparison.ps1 -ProcessIds 12345 -Scope 'Confirmed All renderer' -ScopeConfirmed -DurationSeconds 240 -OutputPath reports/all-process.json
```

Identify the actual renderer before using `-ScopeConfirmed`; that flag is an
operator attestation, not automatic tab attribution. A candidate process can be
recorded without it, but the UI marks its CPU scope unconfirmed. Do not substitute
every Chrome process on a computer with other tabs. If the PID changes across
reloads, take separate scoped files and import them together. CPU100% means one
occupied logical core; private bytes are process commit and include Native/Wasm
allocations in that process. Samples must cover at least80% of a measured phase,
with no PID loss/reuse or overlapping intervals, to qualify. Neither aggregate
process CPU nor zero underruns establishes per-quantum audio headroom or a
multicore speedup. No native/plugin or all-Rust claim follows from this comparison.

Downloadable JSON includes the frozen recipe, measurements and comparison
checks. The session shadow of unrelated UI conveniences is excluded. Rust's
configured128ms Core/FM live-input lead remains disclosed separately; this is a
sequence comparison with matched output-buffer policy, not an end-to-end live
keyboard latency comparison. Existing defaults and preserved WIP remain intact.

First final desktop result (13 November): the captured Uplifting Trance Departures
workbench at48kHz /10ms base latency passed all four matched-input/condition
checks. Every trial scheduled532 events with relative-frame/payload hash
`0dc7abda2c2485fd541e0ed4ae21afcfd1375ca4aa2a20983ec156307e5dae3f`.
The two30-second Current windows recorded0/0 underruns; Rust recorded5/0, with
49.4ms total fallback in the first Rust window. JS heap snapshots after the four
windows were115196808,145171578,147891082 and236017919 bytes. Their drift does
not establish total audio-memory savings or a backend memory ranking.
Candidate renderer CPU/private-byte samples are retained separately, with scope
unconfirmed: privileged browser process attribution was unavailable. The import
UI must preserve that qualification, not promote those numbers into a CPU win.
Evidence is under ignored `reports/all-comparison-*`. This fixture establishes
a working comparison and no demonstrated performance advantage warranting a
default change. It is not a six-branch capacity, stress, multi-rate, live-MIDI
latency or subjective sound-quality certification. All7377accepted tests and
the public provenance/build/artifact checks pass; all39WIP hashes remain intact.

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

## All: selectable prepared runtime

The All toolbar now offers **Current · default** and **Rust integrated ·
experimental**. Choose Rust, then press **Prepare Rust audio**. This explicit
gesture resumes the context before owners are constructed, so startup and
retirement can be serviced. Normal Play, keyboard/phrase input, source edits,
scene loading and setup-file restoration then use the selected factories.
The Source tests snapshot executor remains a separate, explicitly invoked tool.

`src/synths/all/runtimeBackend.js` is the selection boundary. One prepared
environment is reused for every host built by that page session. It combines:

- `prepareClockedOwnedHostEnvironment` and clocked Core/FM with the existing
  explicit 128 ms default lead for live input;
- owned CLASSIC, piano/KS and Iowa factories, Wasm basic percussion, prepared
  compressors, Motion/Shimmer, inserts/effects buses and ambience preparation;
- the clocked rack dynamics and Width/Ring factories, rack plugins and owned
  role Wander;
- `deskBackend: owned` for the actual All desk, including its channels and
  master primitives. Existing routing and its summation order are retained.

This is a complete selectable All playback route with declared Native stages,
not every leaf port. Native Instrument outer effects, role tone/initial mix,
shared routing/fan-in, Sweep, return junctions and final global volume remain.
The cold nine-controller Main roots, four-cohort ordered join, standalone
original-effect actors, delayed Room/Freeze joins and 39 frozen WIP files are
not silently enabled. All's editable mixed-source graph is broader than the
fixed ordered Generator recipe, which still has its own review entry.

The selection uses the page URL (`allAudio=rust`), outside compositions and
setup files. `allResume=1` tells a reload to restore the saved workbench rather
than reapply a preset URL and lose later edits. Rust scene selection preserves
both parameters. Switching backends flushes the existing song/Continuous save,
refuses navigation if that save fails, then awaits host retirement before
navigation. Scene/link/file replacement likewise awaits old-host retirement.
The initial loader disposes a failed or superseded candidate. There is no
automatic fallback to Current after a Rust preparation failure.

### Output deadline correction, 13 November

The first integrated route was functionally connected but missed device output
deadlines badly: a visible 48 kHz / 10 ms base-latency idle sample recorded 343
underruns and 46.99% fallback duration. Current at the same latency recorded
0.20%. Substituting only the rack dynamics stages removed the idle failure.
Changing their metadata to k-rate did not solve it.

The clocked compressor/limiter now uses a bounded MessagePort FIFO for authored
lane commands, removing 288 metadata AudioParams per stage. Only demand and the
two authoritative Native clock signals remain AudioParams. The 32-command
unobserved limit, whole-patch preflight, original lane order, Float32 values,
per-lane authored frames, initial-control ACK isolation and terminal disposal
ACK remain. Commands apply at the next observed Native clock block; late edits
are counted rather than described as sample-exact delivery. Rust DSP, lookahead,
coefficient arithmetic, defaults and the frozen WIP remain unchanged. The base
facade accepts an explicit writer factory; existing nonclocked routes retain
their stamped transport. Their generated identities change with that facade,
while their Wasm bytes are identical.

After correction the full Rust idle sample recorded 0.20% fallback, and separate
five-second sustained-note and sequence samples each recorded zero underruns at
the same latency. This measures device deadlines, not subjective sound quality.
Setup's existing backend diagnostics now exposes the measurement on the actual
selected host, with feature detection for browsers without output statistics.
Reports are ignored under `reports/all-audio-*`. The existing 48 kHz browser
Native dynamics batch passed all ten mono/stereo, routing, reload and separate
lane-time cases with zero waveform error. Eight additional real-Wasm tests at
8/44.1/48/96 kHz compare the new transport bit-for-bit with the stamped reference,
including late controls; queue and lifecycle guards are tested separately.

Final verification: 895 accepted test files / 7,366 passing tests and four skips;
public provenance checks, Vite public build and artifact checks passed. A fresh
sequence measurement after those jobs stopped recorded zero output underruns
over 5.0068 reported seconds at the original 48 kHz / 10 ms base latency. Audio
was stopped after verification. All 39 WIP hashes and the backup ZIP hash match.

Unexpected external suspension invalidates the prepared clocked runtime. Reload
to reconstruct it; the page reports live input failure instead of reviving
stale ownership. Per-owner quotas and DSP defaults are unchanged. The owned
desk keeps the existing 3 ms limiter lookahead and does not promise automatic PDC.

**Setup → Audio backend diagnostics** reports the selected environment, actual
source backend labels and actual desk readiness/version. It declares the
remaining Native boundaries. The mixer manifest was derived privately from its
committed predecessor, checked, then published in the existing namespace. Only
the host-reference receipt changes; mixer Wasm bytes are unchanged.

Verification for this slice: the accepted suite passed 892 files / 7,346 tests
with four skips. After the final resume/save safeguards, the complete focused
All page, host and runtime suite passed 119 tests, including both new persistence
regressions. Public provenance checks, the final Vite bundle and public artifact
inventory passed. Browser checks use `localhost:4193` as a separate storage
origin so the user's existing `127.0.0.1` workbench is preserved. They exercise
normal playback and meters, DIM/master level, pause/resume/Stop, live CLASSIC
phrase output, owned Iowa replacement, scene reconstruction, reload persistence
and switching back to Current. Reports remain ignored under `reports/all-runtime-*`.
