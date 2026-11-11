# Bounded desktop review sweep

The new tools/native-rack-live-sweep.html page coordinates fixed muted review shards through its visible Run button. It is application review code, not external browser automation. Existing app defaults and user settings are untouched. The supported root IAB session is the only available browser surface; child agents have no IAB surface.

## Fixed plans

- Default Final plan: 369 cases in 33 documents. Filter48k fully-idle2, Ring48k delayed4, Rack Dynamics48k live12, all216 native-rack short cases, remaining72 portable and60 live dynamics cases, then three reused-context rounds.
- Targeted plan: only the two suspected closure boundaries above, six cases.
- Native short: 216 cases, six rates x three kinds x two layouts x six scenarios.
- Optional native closure: 324 cases including all long-idle and delayed-first variants.
- Reused-only: actual live Dynamics AudioContext, from a fresh visible click if autoplay requires a new gesture.

At most12 contexts are created in one document. Each shard awaits its own node/port cleanup, saves complete evidence, then uses location.replace to create the next document. A failure, changed source identity or lost storage stops navigation. Pause takes effect after the current shard and complete evidence save. The coordinator retains an exclusive lease through the save/commit boundary so Resume cannot duplicate a completed-but-not-yet-saved shard.

## Evidence ownership

Only compact progress and pointers use the namespaced sessionStorage key calmbgm.native-rack-dynamics-review-sweep.v1. Complete reports are saved in IndexedDB database calmbgm-owned-browser-review-v1, shards store, under unique runId:index keys. No store is cleared and no application/user persistence keys are modified. Reports are bounded to16million JSON characters per shard; compact state is bounded to4million characters. The complete DOM evidence view is bounded to8million characters with per-shard selection fallback and no truncation. Storage failures stop visibly; they do not discard a failing check or continue with incomplete evidence.

The visible aggregate retains exact component version/Wasm/source/profile identities, rate, kind, scenario, per-case errors and measured metrics. Download aggregate result reads the corresponding complete IndexedDB records and includes full native reports. Each run records its exact current source identities; native-rack c60d8a7d79239cbc is the current accepted scoped candidate. Dynamics versions are recorded independently, including their complete manifests. A different identity requires an explicit new sweep; previous results are not relabeled.

## Validation

Nine focused coordinator tests cover one shard per document, source mismatch refusal, first failure, paused completion, cleared work, bounded plans, full-save-before-navigation, evidence storage errors and exclusive save ownership. Node syntax checks pass. Actual supported-IAB execution completed scoped native6/216/12 runs and independent Dynamics147. The expanded native324 run stopped at a retained failure; the runner stopped correctly. Full archived evidence was read through the visible textarea at about2.1million characters, avoiding the stalled download-event path. These are separate scope-specific artifacts, not one blanket passing aggregate.

Audio-device autoplay refusal in the reused-context phase is a startup failure, not a numerical DSP mismatch. It remains visible and can be tested separately with the reused-only preset. The other fixed contexts are OfflineAudioContexts. No physical listening claim is inferred from recorded PCM or counters.

The visible Show complete archived evidence button and shard selector load canonical saved records into textarea#sweepFullEvidence for readonly DOM extraction. Failed artifacts are retained; reruns use new run IDs. A Dynamics147-only preset allows an unrelated native-rack failure to stop without blocking independent checks. A faithful8k Filter long-repeat preset runs the same uninstrumented production case in six fresh documents, adding native/input hashes only after rendering has finished.
