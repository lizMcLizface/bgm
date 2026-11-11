# Owned Width / Filter / Ring explicit live-clock profile

Current standalone live asset: c60d8a7d79239cbc, 196019 bytes. Current captured-profile source refresh: 4fe098b973c4877f, the same production Wasm SHA256 35d216f24c6a2236cadb5b28a7fdc3283941bc40e83be701c52518ce6583f95d. Original native/default rack builders and normal app wiring are unchanged by this slice. Filter is not accepted as a transparent normal mixed-native replacement.

## Implemented contract

- Versioned native-rack-explicit-live-pull-v1 spec, integer rates 8000..192000, maximum input channels 1 or2, owned independent state and canonical 128-frame pulls. The captured continuous profile remains separate.
- Explicit global sync advances the control epoch without inventing DSP samples. Ring phase and unpulled control histories retain their state through genuine gaps. Width always outputs two discrete matrix channels; Filter/Ring follow the logical input width, with mono minimum when inactive.
- Native Float32 target import and original 20ms timeline equations; literal four Width gain-branch arithmetic, five native Biquads and the original sine-carrier Ring arithmetic. No PCM shift, fitted gain or widened comparison bound.
- Source-derived native TailFrame equations, real/complex/repeated poles, original1/32768 amplitude threshold, 30-second maximum and Illinois root finder. Separate audio-processing and parameter-pull masks distinguish params-only evaluation from retired handlers. Reactivation evaluates still-fresh native events at the actual pull.
- Known inactive input is identified by zero active channels, never numerical zero detection. Connected external native silent flags and native main-thread retirement dispatch remain explicit caller ownership. Explicit manual masks are an alternative caller-owned activity plan, not inferred from PCM.
- A bounded 128-record canonical GUI call queue, 32 pending host requests, strict late/backwards/malformed rejection, immutable specs/target snapshots, version-bound worklet URL, 10-second registration retry boundary and acknowledged disposal. The current queue contract is authored suspended-GUI calls; it does not claim arbitrary unsuspended MessagePort parity.
- Cold settings serialization preserves complete raw f64 GUI targets, rate, maximum channels and authored origin. It does not save oscillator phase, filter histories or pending live commands. Explicit restart is a cold operation; the original rack clear semantics are untouched.

## Accepted desktop evidence

All accepted native comparisons retain maximum absolute and relative RMS limits 1e-4. Independent instances must be exact.

| Scope | Actual result | Ignored evidence |
| --- | --- | --- |
| Corrected 48k Filter fully-idle 2 +Ring delayed-first/late-construction 4 |6 pass; max absolute8.940696716308594e-8, relative RMS1.0332698552778858e-7; independent0 |native-rack-target-corrected.json |
| Six-rate, three-kind, two-layout short scenarios |216 pass; max absolute4.1350722312927246e-7, relative RMS8.06294679221422e-7; independent0 |native-rack-short-final.json |
| Faithful8k long Filter repeat in six fresh documents |12 pass, all native/owned numeric differences0 |native-rack-faithful-repeat-full.json |
| Original-native twins, six contexts, no Rust/getters |All twins, inputs and cross-runs exact0; output SHA a3dbdfc9724a2b2d9c2d80bbae3c3b7d7b6369ccb81c5a036779dc29e0ba4ac1 |native-rack-native-variation-first.json |

The short scenarios cover continuous input, ended/retriggered source, disconnected/reconnected route, bypass and GUI calls in both gaps. The targeted long case ends at quantum8, authors controls at0.5s, retriggers0.75s and returns to cuts0.85s. Delayed cases withhold both input and output until0.2s and additionally construct nodes at0.1s in an already-running context.

## Retained failures and Filter boundary

The first mask 31 Filter implementation failed mono-ended 48k: maximum0.00020956466323696077/RMS0.00023635417447740811. Native tail processing fixed that actual failure.

The first fully-idle f33 implementation failed both 48k layouts: maximum0.15971780754625797/0.15928848925977945 and RMS0.2121833631279407/0.16988214924713557. A getter-only native probe added no audio taps. All frequencies/Q remained 90/10/14000/21600/350 and 0.707 until retrigger; first returned main frequency 467.7187805175781 and Q 1.362879753112793 proved the idle event stayed fresh. The corrected separate pull masks reproduce that trace and first three returned quanta bit for bit in permanent mono/stereo regressions.

The expanded 324-case plan is NOT accepted. It stopped after 38 cases on one 8k stereo fully-idle reference mismatch: maximum0.02158337365835905/RMS0.01268000400889734, independent0 and no transport errors. Preserve native-rack-filter-8000-long-first.json and native-rack-expanded-first.json. An otherwise identical production-topology getter probe subsequently passed both layouts exactly; the isolated getter topology showed different main parameter aging. Original-native twins and six faithful fresh-document repeats also passed exactly. These passing repeats do not erase or explain the earlier negative. No RNG, bounds change or numerical correction is asserted as its cause.

Native completed-tail output disabling is dispatched through its main-thread graph lifecycle. The portable explicit activity contract is deterministic; universal parity with opaque mixed-native retirement timing is unproven. Normal Filter adoption remains excluded pending an explicit host activity policy or a reproducible causal trace. This boundary must not block independent Width/Ring transport work.

## Permanent verification and provenance

110 live/projection/lifecycle/preservation tests plus9 review-coordinator tests pass. Including the 47 captured regressions, the focused run has 166 tests. The latter verifies connected known-silent inputs continue parameter-only clocks while fully retired handlers retain fresh controls.

Both 36-case private allocation audits pass: captured full 128-slot plans and live 512-GUI-call/gap/empty/layout/reset cases, two handles each, all six rates/layouts. Rust allocations, reallocations and reclamations are 0; memory does not grow, maximum 1,572,864 bytes for two handles. These are not JS/native allocation, physical output or deadline claims.

The exact original accepted 89093f53ab94f71c Wasm (176343 bytes,SHA256dfda798d96d2e2e80af68f10c65a7594f4b74ad5d2fc0385acef68c74f2a8bfb), original manifest and required notices are pinned in src/modular-audio/fixtures/rack-native-89093f53ab94f71c. The 36 old/new comparisons use this immutable test-only fixture, not the refreshed public asset, and cover rates, layouts, controls and reset. Original browser acceptance and reload claims remain bound to 89093; they are not relabeled as a new captured browser run.

Build/check commands are tools/buildRackNativeLive.mjs --publish/--check and tools/buildRackNative.mjs --publish/--check. Native graph lifecycle sources and exact licenses are pinned in the crate profile/notices. The review sweep archives full manifests/reports in namespaced IndexedDB, shows complete evidence in a readonly textarea, and avoids download-event waits.

## Next task

Port Width and Ring normal per-call transport independently using the accepted acknowledged scalar writer. Preserve the original separate currentTime reads and order. Width needs four independently timed branch curves (sameL,sameR,crossL,crossR); the current suspended-call profile shares two curves at one authored frame. Ring has three separately authored calls. Filter has four/seven setters plus an immediate type/reset seam and remains an explicit later boundary. The current whole-call target projection helper is source-tested but is not an unsuspended normal factory.
