# Native-clock Core/FM live source

12 November 2026: separate profile `native-clock-owned-core-fm-live-v1`,
identity `a20fefe1bf89996a`. It retains the existing owned Core/FM kernels,
control validation, patch-transition DSP and terminal receipt body. The original
Core/FM host, normal prepared environment and application defaults are untouched.

The audit found that the older host anchors a callback-count clock on raw
worklet `currentFrame`. That clock is not an independent Native epoch authority.
This new host instead binds the accepted Native context-clock source7a and
passes each decoded actual frame into the unchanged Rust source instance.
There is no fitted lag, synthetic elapsed-frame catchup or audio normalization.
Only canonical consecutive active callbacks are admitted. Source gaps,
changed clock identity, external suspend and stale factories fail closed;
a fresh explicit factory binds a newly prepared generation.

The factory is live-only and same-context. It refuses prebooked Offline events,
patches and finite stop budgets, which retain their existing separate host.
An actual offroute pull and first decoded frame must be acknowledged before
note identities or event batches can change. A caller must physically pull the
source before awaiting flush/readiness. Patch messages carry the original main
thread Native frame explicitly; the new processor refuses an unstamped fallback.
Future note/control delivery still needs scheduler headroom. This does not claim
transparent Native patch-message timing or unlimited event admission.

Source failure and release proof are distinct. A source fence can reject its
disposal promise immediately on a primary failure while the later terminal ACK
is still in flight. The new release owner separately waits for positive release
proof before retiring its clock links. Timeout keeps the minimal receiver and
clock lease until a late typed receipt or actual context close. A late receipt
never turns the rejected disposal into success. Clock cleanup failures remain
visible independently. The first actual d228 receipt retained this premature
release-observation failure; the successor fixes it without editing the shared
source fence or accepted processor body.

23 focused checks pass: six sample rates for Core and FM with raw globals frozen,
actual Native-coded frames across an eight-second cycle wrap, exact unchanged
Rust output, malformed authority/patch and true-gap refusal, pre-mutation factory
readiness, partial clock-bind cleanup, late receipt, primary failure retention,
timeout uncertainty, context close and independent clock cleanup failure.

Actual muted desktop runs at48k and192k use one live context, three source7a
generations and two independent sources each (Core, FM, Core). Every captured
logical-channel sample is bit-exact against a separately instantiated unchanged
Rust kernel at the observed Native frame book. The six source outputs are
nonzero, both owners match each other, first note sample positions match exactly,
and the third capture crosses the real eight-second Native clock cycle.
Two expected suspension-retirement failures remain in each report; stale starts
refuse, every source separately acknowledges release, and all clock links finish
cleanup before final context close. These runs assess actual worklet output and
Native frame assignment, not a new Native-synthesis waveform comparison or a
physical device deadline. Existing original-ABI comparisons remain separate.

Local receipts: `reports/modular_audio/core-clock-a20f-48000-final.json` and
`core-clock-a20f-192000-final.json`; first48k successor proof is retained as
`core-clock-3dd2-48000-first.json`, and the release-observation negative as
`core-clock-d228-first-negative.json`. Reports and temporary scripts stay ignored.
The actual raw and decoded first frames happened to agree in these runs; frozen
raw-global independence is additionally tested by the actual-Wasm unit matrix.

Reproduce: `node tools/buildClockedCoreLive.mjs --check`, then
`npm.cmd exec -- vitest run src/modular-audio/clockedCoreLive.test.js src/modular-audio/clockedCoreLive.worklet.test.js src/modular-audio/clockedSourceRelease.test.js`.
The grouped page is `/tools/clocked-core-live.html`. It uses separate identical
source7a capturers and records each owner's initial Native frame; no channel
merger supplies the independence authority.

Next: compose this factory explicitly into the stopped Main runtime after its
coordinated-start checkpoint, with actual scheduler note/control timing and
replacement tests. Other source families still need their own clock/admission
proofs. This checkpoint does not certify whole-source-family construction,
normal Main DSP, mutable Room routing or general live suspension/restart.

## Optional live-input lead successor

The explicit factory now accepts
`prepareClockedCoreLive(context,{liveInputLeadSeconds:.128})`.
Its source provenance is `94c404b7017c5477`; the omitted-option path retains the
complete earlier factory body and original WasmBackend implementation. The
accepted processor, Source7a, Rust algorithms and Wasm bytes are unchanged.
The previous identities and component receipts above remain historical evidence.

The optional value must be a finite number from 0.001 through 2 seconds. Its frozen
policy is `clocked-core-explicit-live-input-lead-v1`. It replaces only omitted
live on/off/retune timestamps with the actual call's `context.currentTime + lead`.
Explicit timestamps, including 0, and explicitly scheduled event batches retain
their original values. Off retains its original start-frame+1 minimum. Selected
`sustain(on,time?)` and `pressure(value,id?,time?)` add an optional final timestamp;
when absent they use the same selected lead and preserve the original event rows.
The default API continues to use the original 25 ms on/retune and 10 ms
off/sustain/pressure expressions. No transport or delivery deadline is promised.

`factory.policy` and `backend.liveInputTiming` expose the immutable policy.
`backend.liveInputTimingStatus()` returns at most 64 immutable records containing
method, defaulted flag, requested seconds and the actual dispatched event row.
It records dispatch, not processor consumption; actual same-port Native/FIFO
receipts remain necessary. Metadata cannot clear a late counter, acknowledge a
note, certify replacement, or turn elapsed main-thread time into a source frame.
Twenty focused factory tests use the actual extracted WasmBackend class and pin
the complete pre-policy factory body. They cover omitted/default and selected
profiles, explicit times/payloads/order, bounds, readiness, independence and
bounded observational metadata. The original default-body SHA256 is
`19ef33339f1a3ab4e3c3365212bafb333784c5692501f194d93117aec6a82914`.

Actual 48k desktop application receipt
`reports/modular_audio/main-cold-root-live128-first-pass.json` passes with no
errors (SHA256 `e71edb8642b16813f32852e03aecec29c6c94b370e7f7e75f8f07ea1228eaffb`).
All five pitched live on calls report requested 2.6373333333333333 seconds and
actual frame 126592 with the explicit 128 ms policy. Fourteen scheduled batch rows
remain separate explicit frames. Strict source confirmations at 171392 and 204032
leave every pitched ledger with no pending host/delivery/future/held records,
matching actual ACK sequences and positive FIFO panic receipts. Six role peaks
range 0.0681554..0.3813535; master peak is 0.4756564. Stopped source replacement and
whole-runtime successor retain the stable six-role Root; 14 previous-owner
retirement records settle. Five incumbent source/consumer pairs and all six Main
control actors have clean terminal ACKs. Final Root borrows, reservation tickets
and shared leases are 0 before closing the still-running context.
Independent assertions are saved in
`reports/modular_audio/main-cold-root-live128-independent-audit.json`.

This is one application's 48k scheduling, routing and ownership pilot, not a new
Native waveform comparison, all-rate GUI delivery guarantee, or default UI
selection. The earlier actual late-event negative
`main-cold-root-v2-late-negative.json` remains valid: the original shorter
headroom produced a real late counter 1 with matching source/clock identities.
The scheduling ledger remains strict. Explicit terminal destruction after such
a failure is a separate lifecycle contract and cannot authorize replacement.
