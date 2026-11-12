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
