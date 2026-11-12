# Original Tape source-ended activity investigation

The accepted `tape-live` numeric kernel (`7e165c5616e8d55a`), resource service (`ce36219935010076`), and explicit audio facade (`67c4c16fb555b3f3`) remain unchanged. The new automatic stage policy `33f009f5e5b66c0c` and its audio candidate `a292f1a96b4f797e` are **not accepted for Native source-ended parity**.

## Retained negative

The first 48 kHz mono ended/retriggered fixture stops its source at frame 1024 and starts a new source at frame 9600. The two independent owned instances agree exactly, but the original Native chain differs: maximum absolute error 0.11990169435739517, relative RMS 0.12312217680428753, maximum-error frame 14706. No transport error or late command was reported. The provisional policy stops all eleven stages at frame 2560. Evidence: `reports/modular_audio/tape-native-a292-endpoint-48k-first-negative.json`.

A passive original-oscillator tap attaches only at the existing retrigger epoch. Its first Native wow/drift/flutter/flutter2 samples are respectively 0.24550743401050568, 0.09164717048406601, 0.43560799956321716, and -0.9212121963500977. All four differ from separately continuously pulled Native oscillators. Thus the original oscillators did freeze during the gap; continuously running them is not a valid repair. The tap never feeds owned DSP. Evidence: `reports/modular_audio/tape-native-a292-passive-phase-first.json`.

Exact failed source/artifact snapshots are retained under `.tmp/tape-native-baseline-a292f1a96b4f797e/`. No acceptance bound, signal epoch, or PCM alignment was changed.

## Pinned scheduling authority

Revision: `e14de735f191c3a2bdce821a5e3f146bdc987b1e`, under `third_party/blink/renderer/modules/webaudio/`.

- `OfflineAudioContext::HandlePostRenderTasks` invokes `BreakConnections`, `HandleDeferredTasks`, then `RequestToDeleteHandlersOnMainThread` while holding the graph lock.
- `DeferredTaskHandler::UpdateTailProcessingHandlers` detects expired tails on the audio thread and moves them to the finished-tail list.
- `RequestToDeleteHandlersOnMainThread` posts `DeleteHandlersOnMainThread` to a main-thread task runner. That task reacquires the graph lock and calls `DisableOutputsForTailProcessing`.
- `DisableOutputsForTailProcessing` calls each handler's `DisableOutputs`. A downstream handler requiring a tail is then added to the tail-processing list, rather than disabled immediately.
- `AudioHandler::ProcessIfNecessary` still pulls AudioParams when its audio inputs propagate silence. Consequently the four Delay AudioParam oscillator connections continue to advance until the Delay stage actually becomes unpulled.
- AudioParam connections do not increment the destination handler's node-input connection refcount: `AudioNodeWiring::Connect(output, AudioParamHandler&)` and `Connect(output, AudioNodeInput&)` have distinct lifetime bookkeeping. A refcount-based claim that the four modulation inputs permanently keep the Delay node enabled is false.

The provisional policy instead disables successive expired stages synchronously in one `begin` call before rendering. It does not model the main-thread task boundary. The source defines no fixed two-quantum service deadline; adding a measured constant would be a timing fit. Whether normal Native repetitions observably disagree is a separate empirical question.

Local raw source SHA-256 (including the downloaded file line endings):

| File | SHA-256 |
| --- | --- |
| deferred_task_handler.cc | `3db25afa2b090da39d914e7fea537e79c6f0e436a47955151b8cde592bb62eb9` |
| offline_audio_context.cc | `c9307da9c70dfb38fcf72d7a487bf05e307079cb8aff5b75aa92c324302eface` |
| audio_handler.cc | `37dd5f0b367b18db123e12193ad7f2e71fde99d63aaded84f7017e77a07b8d9b` |

## Reproducibility probe

`/tools/tape-native-repeat.html` creates six sequential fresh 48 kHz OfflineAudioContexts. Each contains two unchanged original Tape chains sharing one stopped/retriggered source. Original phase taps are connected only at retrigger; separate continuously pulled Native oscillators provide a counterfactual. The report compares both original chains within each context, and complete wet PCM plus phase samples against the first context. It retains hashes and numerical errors. It does not adjust portable processing or waive parity checks. The first six-pair capture completed: all four oscillator phase windows are bit identical both within each context and across all six contexts. Wet-only differences against the first context reach about 3.47e-6, consistent with the already measured Native AudioParam summation-order variation. This capture **does not demonstrate phase nondeterminism**. Evidence: `reports/modular_audio/tape-native-six-pair-reproducibility-first.json`.

This is a diagnostic boundary, not a blocker for the already accepted explicit activity facade. Automatic source-ended activity adoption remains pending a source-derived and measured contract.


## Stage-order witness

`/tools/tape-native-stage-witness.html` adds three shaper/tone/delay output fanouts to a silent review-only worklet on one original chain. The worklet records input channel presence transitions, not numerical PCM silence. A second original chain in the same context shares the exact stopped/retriggered source and remains untapped until retrigger. Its four phase windows must equal the witnessed chain exactly before the connection trace can support a conclusion.

Source rationale: a stage output's disabled state is propagated to all its node-input destinations by `AudioNodeOutput::DisableAndEnqueue`. A new downstream destination does not add a connection reference to that source handler; `AudioNodeWiring::Connect` increments the **destination** handler's connection refcount. Nevertheless a diagnostic fanout can alter graph pulling or scheduler load, so the untouched-chain phase control remains mandatory. The actual witness capture passed the exact four-phase nonperturbation control. Its Native connection trace is frame0 `[1,1,1]`, frame2176 `[0,1,1]`, frame2432 `[0,0,1]`, frame2816 `[0,0,0]`, then frame9600 `[1,1,1]`. The two original wet paths differ only by about 3.35e-6. Evidence: `reports/modular_audio/tape-native-stage-witness-first.json`. These measured boundaries do not by themselves justify a production timing adjustment.


## Controlled task-service intervention

`/tools/tape-native-main-workload.html` runs three otherwise identical original Native paired fixtures: idle, a finite batch of 4096 original Tape drive-curve preparations, then idle again. The middle batch runs synchronously **after** `startRendering` and **before** yielding the main thread. It computes exactly 8,392,704 Float32 cells with the original JS formula, retaining a digest, but assigns none of those resources to an audio node. Counts are fixed in advance; there is no sleep, deadline loop, audio event shift, or PCM search. The report records the actual elapsed wall time and checks both within-pair phases and the final idle replay.

This intervention tests the source-defined cross-thread service boundary. `OfflineAudioDestinationHandler::DoOfflineRendering` loops over quanta on the rendering thread, whereas the queued output-disable task must run on the main thread. The probe does not establish a new acceptance bound or permit a portable phase correction. The actual controlled capture completed: the fixed batch took 716.3000000119209 ms and produced digest1534.6164687871933. The middle case's original oscillator windows match all continuously pulled Native references exactly, whereas idle-before froze. Workload-versus-idle phase maximum is1.7655400037765503 and wet maximum is0.4882875084877014. The final idle replay also differs from idle-before (phase maximum1.7973918318748474; wet maximum0.4945574402809143). Every simultaneous original pair remains phase-exact. Evidence: `reports/modular_audio/tape-native-main-workload-first.json`.

## Proposed portable lifecycle boundary (not selected)

The reusable Rust components can be used without pretending to observe Native internal tasks:

1. Curve preparation is explicit asynchronous host resource work. A ready immutable lease is required before a synchronous `setDrive` or full-preset commit; missing capacity/readiness rejects before target or snapshot mutation. Callback copies remain bounded to 1024 Float32 values and two transfer credits. Prepared resource latency is reported, never hidden by backdating installation.
2. Route demand, input connection presence, and input-bus silence are distinct typed facts. They cannot be inferred from an all-zero PCM buffer. The existing eleven-stage activity API remains the complete lower-level authority.
3. Audio/parameter-only eligibility can be calculated from the pinned stage tail predicates. Retirement of a connection is a separate host event. It must not be silently collapsed into eligibility or guessed as a fixed number of samples after source end.
4. A portable graph may author an explicit deterministic retirement epoch and test that contract. It cannot label that epoch as the original Native main-thread task's observed epoch without evidence. Arbitrary legacy stopped-source graphs retain their original route until an equivalent lifecycle authority is available.
5. Existing Native defaults, accepted explicit-activity assets, and the accepted captured Tape numeric profile stay unchanged. The unaccepted automatic candidate is not an app fallback or default.

This is a proposal for a bounded ownership contract, not an implemented replacement for the failed source-ended policy. The running-resource review at `/tools/tape-running-ready.html` separately tests immutable audio host67 with the Rust curve preparer: continuous audio continues while two new resources are prepared/uploaded, then original Native and both owned facades install each ready curve at the same captured suspended epoch. It requires callback/body progress, copied-cell and credit bounds, full unshifted PCM parity, and authoritative disposal. No automatic source-ended claim is attached to that review.

## Successor host lifecycle hardening

The unaccepted automatic host successor `90cb8b8dbc8d9d8d` fixes only factory ownership behavior: invoking an owned node's `dispose` immediately marks it closed and refuses setters in the same JS turn, while the factory keeps its ownership count until cleanup settles. A preset preparation that resumes after factory disposal rejects before installing a new token. The actual public-wrapper regression tests immediate refusal, idempotent cleanup promise, owner-count fencing, and late preparation refusal.

All 20 focused stage-policy/audio-host tests pass. Against the archived a292 assets, both numeric Wasm files are byte identical; the generated processor differs only in host identity strings. Proof: `reports/modular_audio/tape-native-logical-close-identity.json`. The synchronous automatic tail policy is unchanged and remains unaccepted. Older Native negative/diagnostic reports keep their original a292 binding. The accepted explicit host67 is untouched.


The controlled intervention changes main-thread work after rendering starts, without assigning a new audio resource or changing a source/control event. The predicted continued oscillator pull while the main-thread disable task cannot run is observed exactly. The final idle replay also shows that the earlier six identical idle repetitions were not a universal phase guarantee. These results establish that source events/settings alone did not specify the Native phase result in these experiments. They do not isolate the cause of every scheduling difference, prove every browser behaves identically, establish device timing bounds, or waive the unchanged Native numerical gate. No fixed offset was adopted.

## Implemented separate portable lifecycle

New paths `synth-engine/tape-portable-lifecycle/`, `OwnedTapePortableLifecycle`, and `public/tape-portable-lifecycle/` implement **only** the explicit lifetime contract. Public profile `portable-tape-explicit-retirement-e14de735-v1`, version `3d17422c4a741992`, ABI1,61522bytes, declares `nativeAutomaticRetirementEquivalent:false`.

- `begin(frame,{inputSilent,inputActive,demand})` calculates the eleven activity modes from owned body/parameter eligibility and currently authored output connections. Eligibility never changes output connectivity by itself.
- `retire(frame,remainingMask,epoch)` atomically validates every removal. Allowed serial-chain masks are7(all),6(tone+delay),4(delay),0(none). The shaper needs inactive-source authority; each removed stage must be tail-eligible and its predecessor must also be retired. A no-op mask remains an explicit exact-frame fence.
- `activate(frame,newEpoch)` requires a strictly newer nonzero u32 epoch and restores all three outputs without resetting DSP, oscillator, or parameter history. Stale retirement epochs fail closed.
- Connection edits are between transactions; their next `begin` must use exactly the authored canonical frame. This is a single exact observed-admission fence, not a future event queue or cancellation API. An active source under retired outputs is rejected when demand is active, rather than silently dropping it.
- Whole-route unpulled demand is independent of retirement and freezes all eleven nodes. A connected Delay in parameter-only mode continues its four oscillator/depth clocks.
- `eligible(frame)` and `stats()` expose eligibility and control diagnostics; no Native samples or coefficients are accepted.

Thirteen permanent tests pass across all six rates, including atomic rejection, exact-frame fencing, stale epochs, malformed raw/JS authority, whole-route unpulled history, literal Native float boundaries, and two unchanged real Tape kernels with different explicitly authored retirement epochs. The latter retain different oscillator histories across activation as requested; they do not pretend to compare against the hidden Native task scheduler. A separate raw-ABI regression proves two handles in one Wasm instance keep independent connectivity, epochs, and counters.

A separate audited build ran4096quanta/rate (24576total), with8retirements and7activations perrate plus stale-epoch refusals: zero Rust allocations, reallocations, frees, or memory growth after preparation. Evidence: `reports/modular_audio/tape-portable-lifecycle-allocation.json`. JS/Native heap and device deadlines are outside that audit. Both public/private provenance checks validate source and copied notices. This module is not wired into a live factory, graph, app default, or legacy fallback.

## Running-resource acceptance

The independent immutable67 host plus dcad Rust preparation passed two actual 48 kHz mono/stereo cases, including four Native-versus-owned comparisons and two independent-instance comparisons. Maximum absolute error4.060566425323486e-6, relative RMS2.0840192408330774e-6, independent difference0, unchanged1e-4 bounds. Every new resource was prepared while callbacks/body processing advanced, then installed only at a matched READY epoch. Per-node total6147copied values, max1024percallback, maxqueued2; per-context Rust preparer6calls. Awaited cleanup completed without a reported rejection. Evidence: `reports/modular_audio/tape-running-rust-ready-67-first.json`.

This acceptance is independent of the failed automatic retirement candidate. The separate explicit output-gap fixture passed both actual48kmono/stereo cases: maximum absolute1.7136335372924805e-6, relative RMS5.83742910314049e-7, independent difference0. Before reconnect at9600, both nodes had inputConnected:false, shaper/delay/LFO counts held at2048, and all12controls observed. A shared looping source had no always-pulled program tap, so the unshifted resumed wet comparison also covers upstream cursor and FIR/LP/Delay/LFO history. Evidence: `reports/modular_audio/tape-explicit-gap-67-48000-first.json`. This does not extend acceptance to other rates, late construction/reused contexts, or automatic source-ended retirement.
