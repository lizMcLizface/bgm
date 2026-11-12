# Prepared Room amount admission

This NEW successor closes the capacity gap documented in the accepted output-clock Room component. Accepted fad/c0d/d816 assets and defaults remain unchanged. It is not wired into the app, Graph, shared RoomHub or normal factories.

## Admission before preset mutation

A synchronous publication cannot know whether a remote Rust timeline has capacity. The new API first reserves two main metadata credits AND both real Rust Gain timeline slots:

1. await owner.prepareAmount(value) → an opaque READY handle.
2. owner.preflightAmount(handle,value) → no time read, target or preset mutation.
3. The parent may now update its staged preset.
4. owner.commitAmount(handle) → original dry-currentTime-read/publication, then wet-currentTime-read/publication.
5. owner.flush() establishes complete-pair admission. It does not claim the audio has already played.

An unused READY handle can be cancelled with await owner.cancelAmount(handle). Credits return only after positive Rust cancellation. Handles are owner/context/generation bound, single-use and unforgeable through the public facade. READY pins do not expire automatically and are never evicted by LRU. Disposal synchronously removes caller authority and obtains independent all-resource release proof.

If capacity is unavailable, preparation refuses BEFORE the parent mutation or any Native AudioParam publication. A full table of255 future events plus retained predecessor is a tested example. Captured/future pair admission continues to refuse atomically; it cannot steal held READY slots.

Once dry is published it may become audible before wet. A missing/malformed wet, broken clock or transport fault retires the owner; it never pretends to roll audio back. This is resource atomicity, not a promise that arbitrary system failure can reverse emitted samples.

## Bounds and clocks

- Two Gain event vectors,256 events each, at most16 pending pair reservations.
- Both metadata records are reserved before any original setter clock read. Global unobserved+reserved metadata capacity remains32.
- Rust capacity reservation is conservative at zero-time without a prune-time guess or parameter evaluation. It can refuse an already-full stale table rather than guessing what a later Native call would prune.
- The first prepared dry uses its actual later Native call time. Wet must retain the original order and both raw amount bits.
- Live seconds must equal the canonical authored frame/rate; correctly stamped but forged live times are terminally rejected before either gain lane changes.
- Preparation/cancellation do not append gain events, change values or advance parameter state. The main ticket helper does not read setter currentTime; outer Source7a validity checks may inspect context time when validating an explicit paused Offline context. Commit still performs exactly the original two setter reads.
- Commit retains literal original two reads, even across a real quantum. Amount and times stay raw Float64 until Rust projects original Float32 gains.
- Parameter-only/audio/unpulled rules, Source7a retirement, input isolation, Worker source budget, one shared audio delay L, READY IR and future source-local colour remain the accepted contracts.
- No Native coefficients or output-time rebasing are used.

The separate reserved split profile uses the unchanged dry/wet Worker and identical render source body. Only controller admission and typed prepare/cancel RPCs change. IR and normal routing remain outside this slice.

## Private verification

Published NEW candidate; direct Native controller and actual live resource gates have passed. The complete split six-rate matrix is also accepted below. Current identities: kernel e323611d27ec3a36 (43214B), controller eab4968025d06a07, split664ffad7162e4a71. Accepted fad/c0d/d816 remain unchanged.



- 24 rate/layout cases compared2,064,384 Float32 words EXACT against the accepted gain renderer, including READY cancellations and cross-quantum commits.
- Three capacity/cancellation/invalid-handle boundaries and five actual Rust/core+opaque-helper checks pass, including forged stamped time, mixed prepared/unprepared wet refusal and repeated same-value/same-time calls retaining all four setter reads/events and ACK sequence4.
- 28 focused helper/actual-worklet tests pass, with real new Wasm, transferred Worker packets and all four split layouts.
- Actual facade tests reserve16 real Rust tickets, refuse a17th before publication, cancel after ACK, reuse64 cycles, refuse foreign/disposed handles and prove full future capacity leaves the parent preset unchanged and owner healthy.
- Actual audited Wasm24 cases /196608 callbacks /25165824 frames:0 allocations,0 reallocations,0 frees and no growth after preparation. READY reserve/cancel, cross-quantum commit, read-only credits, three processing modes and98304 invalid reservations are included. JS/Native/worker allocation and physical deadlines are excluded.
- Render source is byte-identical to the accepted original Room gain body. The new Wasm changes because reservation state/APIs are added; numerical equality is measured, not assumed from whole-module byte identity.

Evidence is stored in reports/modular_audio/room-reserved-control-private-verification.json and room-reserved-control-allocation.json.

The grouped candidate review pages use only the NEW candidate artifacts, now published for desktop QA:
- /tools/room-reserved-control.html: four direct Native Gain layouts, two actual owners.
- /tools/room-reserved-split.html: Full/Light mono/stereo, future output-time edits after PCM queued.
- /tools/room-reserved-resources.html: actual live READY capacity/cancel/reuse/full-timeline parent refusal and independent owner, no Native PCM claim.

## Actual resource acceptance

The actual48k live resource gate passed on kernel e323611d27ec3a36 /split664ffad7162e4a71. Two independent real Worker/output owners were used.16 READY handles held BOTH Rust lane capacities before publication; a17th and a foreign handle refused. Positive cancellation restored all held credits.64 prepared commits completed130 original constructor/live leaf events with sequence130==observed130 and no pending ticket.

Then255 complete future pairs filled both vectors: commands640, pairs320, read-only credits0/0. A new preparation refused before changing the parent amount0.984375, main publication sequence385, gain events or reservations; only the rejection diagnostic incremented. The independent owner still accepted its own prepared commit (commands4). All source/Worker, audio and parameter-processing frames remained0. Output-clock/unpulled counters advanced under metadata service as declared. Author-delivery lateness was measured (maximum128 frames); no live Native PCM claim is made for this resource-only gate.

Both owners obtained clean typed transport receipts, released clock links and positively terminated Workers BEFORE context close, with no quarantine or cleanup error. Evidence: reports/modular_audio/room-reserved-664f-resources-final.json. The direct controller Native matrix is accepted below; the complete split six-rate matrix is accepted below.

## Direct Native controller acceptance

All six rates8/24/44.1/48/96/192k passed24 cases /48 actual original Native Gain comparisons with dry/wet layouts1/1,1/2,2/1,2/2. EVERY Float32 word matched (maxAbs0, relativeRMS0, differingWords0), as did the two independent owners per case. Both prepared constructor/live tickets were READY before their commits. Positive pre-render clock fences confirmed audioFrames0 before the cold Offline render. Cleanup uses explicit clean context-closed proof plus released clock links; live terminal Worker/output ACKs are the separate resource gate. No unmatched unsuspended GUI timing identity is inferred. Summary: reports/modular_audio/room-reserved-eab4-control-six-rate-summary.json.

The48k complete split pilot passed all four Full/Light mono/stereo cases /8 Native comparisons on664ffad7162e4a71. MaxAbs2.9802322387695312e-8 /relativeRMS1.4341157593655902e-7; source and independent streams wordExact, no underrun/rejected packets, all exact final drains. Clean typed output ACK, clock release and positive Worker termination occurred before context close for every owner. Planes3/4/2/3 and one L24064 were retained;16,384–18,432 source frames had returned before output edits. Other split rates remain pending. Receipt: reports/modular_audio/room-reserved-664f-split-48000-final.json.

## Complete split Native acceptance

All six rates passed24 Full/Light mono/stereo cases /48 actual Native comparisons on split664ffad7162e4a71 with kernel e323611d27ec3a36. MaxAbs2.9802322387695312e-8 /relativeRMS2.0029975361256776e-7; the original fixed1e-4 limits were unchanged. All captured source and independent owned streams were whole-stream wordExact. Every finite budget drained with zero underrun/rejected packet. Every owner obtained a clean typed output receipt, released clock links and positively terminated its Worker BEFORE context close.

Internal planes remained3/4/2/3; exactly one L=4096/12032/22144/24064/48000/96000 frames was used by rate. At least2048 source frames were already returned before output-time edits; no event was shifted by L. Native reference scope remains original source-local colour/convolver composed with the original controller at unchanged absolute output times. Summary: reports/modular_audio/room-reserved-664f-split-six-rate-summary.json and all six bound full receipts.

Body proof: reports/modular_audio/room-reserved-render-body-proof.json pins identical Rust gain rendering, Core/processor/split render methods and entire Worker bytes (SHA2563d620f0e761f8bccc0c6b88a76221e66383028229ef30d62f767b6daa8506582). Numerical old-render parity is additionally measured, not inferred from module identity. New Wasm bytes intentionally differ because READY state/APIs were added.

The new prepared successor has not yet had its own true-HTML cold replay or prepared-handle live suspension matrix. Baseline1362 has separate lifecycle/cold acceptance; that is not relabelled as new prepared-host evidence. The new actual resource gate establishes before-close release and parent refusal; Native matrices establish the stated finite matched-clock PCM scope. Normal factories, mutable IR, shared Hub, indefinite keyboard and automatic Native tail adoption remain separate work.
