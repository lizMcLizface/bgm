# Original Room output-clock controls and split return

This is a NEW, optional component profile. Accepted complete Room hosts (c7b4 / 500e), their numerical DSP, Native defaults, Graph and app routing are unchanged.

## Contracts

The original Reverb amount law runs in Rust, with two independent Gain timelines. For amount v<.5, dry=1 and wet=2*v; otherwise dry=1-((v-.5)*2) and wet=1. Projection uses original f64 branch/arithmetic then Float32 targets. Each output is Float32(dry*gain) + Float32(wet*gain), dry first. Both Gain intrinsics begin at Native default1. The constructor's amount0 is an explicit two-step call, never an invented wet intrinsic0.

The complete captured/future API admits both lanes atomically before timeline mutation. The synchronous live publisher reserves both TRANSPORT record credits before reading or publishing either leaf, then retains the original sequence: dry currentTime read/publication, wet currentTime read/publication. On dry-row admission Rust reserves BOTH gain-timeline capacities before appending either Rust lane. A returned live row proves authored publication, not Rust admission; flush provides complete-pair admission acknowledgement. An exhausted Rust timeline can terminally refuse a published call, so synchronous parent-preset atomicity across unseen Rust capacity is not claimed. Normal parent adoption requires a prepared reservation/staged admission contract. A permanent actual-Wasm test fills both timelines with255 future pairs plus the retained predecessor, then proves a live publication can be refused terminally with NO Rust lane/target mutation. It also verifies the main writer snapshot is publication state, not render-admission proof. A real quantum can elapse between those reads. An already audible dry change cannot be rolled back. Missing/malformed wet retires the owner with diagnostics.

Native main-thread time clamping, insertion-time event pruning and render-time NEW-event clamping remain separate operations. Repeated steps are retained, same-time order is stable, and pruning retains the last predecessor. Raw Float64 payloads preserve negative zero and all finite seconds/value bits. The prepared render/admission path has no Rust allocation.

The split Worker returns unchanged dry input plus independently coloured/convolved wet audio, up to four internal planes. Both branches cross exactly one declared audio delay L=max(2*B,ceil(rate*.5/128)*128). Original RoomColour/convolver Rust modules are reused byte-for-byte. Output-thread amount events keep their ABSOLUTE Native Source7a output times; they are not shifted by L or rebased to source time.

Colour remains an explicitly source-local prepared/future API. Its ACK reports source frame and effective output frame epoch+sourceFrame+L. It refuses a target behind the generated source frontier before mutation. IR is immutable READY data. There is no GUI IR swap or original asynchronous Native task/tail identity claim.

## Boundaries and ownership

- Rates8/24/44.1/48/96/192k; source/wet logical layouts1/2. Canonical output128.
- Per-lane timeline capacity256; at most16 pending live pair reservations.
- Generic stamped raw-word transport: wordCount1..24, at most64 slots (Room selects32), exact sequence maximum16777215 and no wrap. Room's16-word schema uses32 slots.
- Room complete future booking consumes one record. Live amount consumes two records; both credits are reserved before mutation.
- ACK advances only over a completed live pair or a complete pair's explicit acceptance/refusal. Unobserved slots cannot be reused. Torn Native AudioParam fields defer a complete contiguous record prefix; per-word stamps prevent a header from mixing payload generations.
- Known missing live wet is terminal after8192 output frames. Main pending requests have bounded deadlines; no silent late application after timeout.
- Real live AudioContext only for the dedicated Worker stream; OfflineAudioContext fast-render is explicitly refused. Fixed known-layout finite input and a future source epoch are required.
- Two owners per context. Disposal independently obtains the output all-resource ACK and positive Worker termination. Quota and Source7a links remain quarantined after missing release proof until ACK or context close.
- Live suspend retires the Source7a generation; it does not freeze this profile for arbitrary resume.
- Final output drain is distinct from Worker source-budget completion.
- Native AudioParam metadata currently uses643 descriptors. JS arrays/copies, Native AP processing, Worker resources, walltime and physical audio deadlines are not covered by the Rust zero-allocation claim.

The generic transport is independently committed b4fc4f5c. Its normalized-LF SHA256 is879186484c9f6ba837ba5d302e0f12120a907dc9ca6447dda577b6177aea5b0a. It transports authored metadata; it does not borrow Native DSP coefficient values.

## Verification state

Current unpublished adoption candidates:
- Rust controller fcaa051b59881695 (39367B normal Wasm).
- Standalone output controller host c7405046a5686fc5.
- Split Worker/output host13629fa3a440d127, unchanged colour7725 and convolverc5db component bytes; Source7a0838a735108706. Numerical six-rate authority remains bound to predecessor4f4e00c9e6fabaea.

58 focused checks pass across nine files. These cover generic raw word/F64/torn records, actual Rust controller vs the accepted prepared mixer across six rates/layouts, cross-quantum live leaves, repeat/capacity atomicity, future deadline refusal, real threaded four-plane packets/partial final credits, actual published worklets, absolute13/41 output-time changes after PCM queued, all four Full/Light layouts, future source-colour refusal, owner quota/retirement/ACK quarantine and aggregate cleanup. Six additional review-oracle checks verify all rates with literal absolute event seconds at a reused-context epoch.

Private audited Wasm:24 rate/layout cases,196608 callbacks /25165824 output frames. Actual allocator counters after preparation report0 allocations,0 reallocations,0 frees, no memory growth. Admission, live split leaves, complete past pairs, all three activity modes and98304 invalid-pair refusals are included. Report: reports/modular_audio/room-control-live-allocation.json.

Grouped actual desktop Native review PASSED all six rates:24cases/48Native comparisons on4f4e00c9e6fabaea. All captured inputs and independent outputs are whole-stream bitExact; every owner drained with zero underrun/rejected packets and positive aggregate cleanup. Max absolute error2.9802322387695312e-8 /relativeRMS2.0029975361256776e-7. Successor1362 lifecycle passed at48k; true192k HTML cold replay passed with all11 complete-authority fields exact. The page /tools/room-split-live.html composes original source-local Native colour/convolution with the actual original Reverb/Gain controller at unchanged absolute output event seconds. It books six future amount pairs after source PCM has already queued, including repeated same-time pairs and independent dry/wet13/41 sample changes. Two owned instances and captured source are compared. Full mono/stereo and Light mono/stereo use3/4/2/3 internal planes. Exact L by rate is4096/12032/22144/24064/48000/96000 frames. Measured pool bounds range from98304B to1671168B per owner (PCM credits only, not total heap); pool blocks6..51. Every case booked future output edits after at least2048 source frames had returned, with maximum pending owned queue6 of32 records. Aggregate evidence: reports/modular_audio/room-split-4f4e-six-rate-summary.json and its six full receipts. Limits are declared before execution: max absolute error1e-4 and relative RMS1e-4, exact independent instances/input, no fitted time shift.

The separate /tools/room-split-lifecycle.html prepares three actual generations in one reused AudioContext, exact Rust/reference outputs, quota refusals, offroute no audio/parameter DSP, retirement/reprepare and all-resource cleanup. This is NOT a second Native PCM claim.

No normal default selection, shared RoomHub, mutable IR, automatic original Native tail retirement, indefinite keyboard stream, saved live ring/FFT state, arbitrary upstream ownership, physical deadline guarantee or zero JS allocation is claimed.

## Retirement release successor

The first actual4f4e lifecycle receipt stopped after one numerically correct round during an offroute suspend/retirement probe. All four created owners ultimately released, but the third owner returned AggregateError. A deterministic published-worklet test reproduced a concrete race: begin dispose(), then retire Source7a before the Worker terminal ACK. Primary fail() rejected every pending RPC, accidentally including the independent terminal Worker disposal request. The old regression failed with inner Native clock retired.

Successor13629fa3a440d127 preserves only terminal kind:dispose requests through primary failure. Ordinary operations are still rejected; terminal timeout, typed output fence, positive Worker termination, quota quarantine and aggregate cleanup remain enforced. Its regression passes; Node cleanup/lifecycle reporting now retains structured inner causes. Actual successor lifecycle passed three reused-context generations1/2/3 at48k. All six stream outputs matched the separate absolute-clock Rust oracle and each independent owner exactly; all three captured source streams were bitExact. Two real third-owner quota refusals, four offroute probes with audio/parameter DSP0, and two suspend/stale-start refusals passed. All10 owners obtained clean typed transport receipts, clock-link release and positive Worker termination BEFORE context close; expected primary retirement errors remained visible, with no cleanup failure. Receipt: reports/modular_audio/room-split-1362-lifecycle-final.json. This lifecycle gate is not Native PCM comparison. True192k HTML cold replay passed: complete source/event recipe, all component/IR identities and BOTH independent PCM hashes remained exact after full HTML reload. Raw absolute event seconds were identical, with explicit sourceSeconds8 on each fresh context, no fitted alignment. Native maxAbs1.4901161193847656e-8 /relativeRMS9.493470308053964e-8; source and independent streams bitExact, all owners released. Receipts: reports/modular_audio/room-split-1362-192000-cold-save.json and -cold-replay.json.

The archived4f4e files and first negative receipt are retained. Proof reports/modular_audio/room-split-1362-valid-body-proof.json verifies unchanged control Wasm (SHA2564a685c9a1c3ba1eba148eb713349c25266c065e4edd81f23cf3497392c782ed8), generic codec, core, output processor source and Worker source. Published Worker bytes are identical; the published output processor differs only in host identity. This is a Node-side release-authority correction, not an audio algorithm change or a waiver of the failed lifecycle gate.

## Standalone two-input Native controller

The separate c7405046a5686fc5 standalone facade passed all six rates:24 cases /48 actual original Native Gain comparisons, dry/wet layouts1/1,1/2,2/1,2/2 and two independent actual AWP owners per case. All Native/output comparisons and independent streams were Float32-word exact (maxAbs0, relativeRMS0, differingWords0). Positive same-port pre-render clock fencing proved zero DSP before cold Offline rendering. Repeated steps and independent13/41-sample dry/wet times use the actual original Reverb/Gain controller.

These cold Offline receipts use clean context-closed disposal proof and released clock links, not live terminal Rust/Worker ACKs. The distinct live1362 lifecycle provides its own before-close all-resource proof. No unmatched unsuspended GUI timestamp equivalence is inferred from the Offline matrix. Evidence: reports/modular_audio/room-control-c740-six-rate-summary.json and room-control-c740-{rate}-final.json.
