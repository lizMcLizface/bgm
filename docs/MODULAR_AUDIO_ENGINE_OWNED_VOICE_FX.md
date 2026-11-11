# Owned Shimmer and Freeze DSP

2026-11-10 overnight checkpoint. `synth-engine/voice-fx` ports the actual DSP in
`public/space-processor.js`. The native file and its current wrappers/defaults
remain unchanged. Tape and Motion use native Web Audio graphs, including native
oversampling/filter behavior, and are explicitly not approximated by this port.

## Portable state and API

`Kind::{Shimmer,Freeze}` selects the processor. `Engine::new(kind,rate,seed)`
prepares all memory; rates are integer 8–192 kHz and the seed is nonzero u32.
`Kind::bounds` supplies parameter bounds. `param(index,value)` validates controls
and applies their original message-rate semantics. These values remain f64,
unlike the separate rack worklets' Float32 AudioParams. Freeze Hold accepts only
0/1. New code fails closed instead of silently applying native clamping.

`input_mut(ch)` and `output(ch)` expose fixed explicit stereo buffers;
`render(frames)` handles 0–2,048 frames. Zero frames is an owned no-op: Web Audio
does not call the original processors with zero-length quanta, and their energy/
retry divisions do not provide useful zero-frame behavior. `clear()`, `reset()`,
`parameters()` and `stat(index)` complete the owned lifecycle. There is no mutable
singleton, browser access, random host callback or allocation inside render.

All histories are instance-owned: Shimmer's four unequal f32 delay lines, two
diffusers, f64 filter state, 8,192-sample pitch-feedback ring and phase; Freeze's
4.5-second stereo recording ring, two four-second stereo clouds, cloud levels,
four grains per cloud, capture/retry clocks and RNG state. Preparation is capped
at32 MiB per instance; the maximum-rate Freeze payload is approximately19.2 MB
plus fixed I/O/metadata. No capture/clear/reset creates or resizes storage.

The explicit version1 spec names `random: "xorshift32-v1"` and an initial seed.
Freeze preserves the original grain selection/draw order under that stream.
This is not a claim that a seeded run equals a prior unseeded native
`Math.random` performance. The existing native RNG remains untouched. Same seeds
reproduce the graph; another instance's capture/reset cannot advance this seed.

## Preserved behavior and integration limits

Shimmer retains the original left-input-only sleep check, Householder network,
pitch-feedback taps, high-pass/tanh protection, TINY offset, gain/damping and dry
addition. Its 8,192-sample shifter ring remains the original size, including the
wrap behavior at sample rates whose60 ms window exceeds that ring.

Freeze retains quarter-window energy gating, two-second waiting fallback,
callback-dependent retry, exact cloud selection, four staggered randomized
grains, fades, re-holding and clear behavior. Both sides of an explicit stereo
bus are supplied. Implicit mono-upmix and host connection behavior remain the
host's responsibility.

`clear()` follows the original messages: Shimmer clears audio/filter contents
while retaining positions/phase; Freeze drops clouds but retains recorded
history, retry clocks and RNG, then waits to capture again if Hold is still on.
Thus clearing a held Freeze does not promise permanent silence. A transport stop
must also release Hold or retire/gate the owner as appropriate. `reset()` is an
explicit fresh-instance replay with controls retained, phase/recording restored
and the seed reset; persistence stores those controls and seed, not an active
recording, cloud or tail snapshot.

The block-dependent sleep/retry policy requires faithful callback cadence in a
graph adapter. Allocator-free processing does not prove deadline safety.
**Keep Freeze experimental/direct or worker-backed; do not put its v1 capture in
the dependent AudioWorklet master by default.** A separate snapshot/capture
scheduling design must resolve that limit before automatic live adoption.

## Exact validation

`tools/buildOwnedVoiceFx.mjs --audit` prepares local audit Wasm;
`tools/auditOwnedVoiceFx.mjs` runs original JS worklet classes with the same
explicit Freeze random stream. The original source SHA-256 is
`815d8158cf9c49ccf118fb1838d341513d5b6983a102823b4ecc16b18808a6c0`.
Audit build `38a2f2cd32343a9a` is49,441 bytes.

`owned-voice-fx-parity.json` records72 comparisons across8/24/44.1/48/96/192 kHz,
Shimmer interval/decay/tone/climb extremes, Freeze window/fade/mix variations,
holding/releasing/re-holding, empty-window waiting and clear messages. All72 are
bit-exact. Freeze RNG draws/state and pending capture agree with the injected
reference stream. Six two-handle cases at44.1/48/96 kHz report zero allocations,
reallocations, frees or memory growth, exact saved-spec output and isolated
reset clocks. Two Freeze handles use10,289,152 /11,075,584 /20,774,912 total Wasm
bytes respectively in this isolated audit module.

Seven focused tests in `ownedVoiceFx.test.js` pass: actual clear-message and
irregular-callback parity, save/reload and exact seeded replay, independent
recording/filter/RNG state, original Shimmer sleep behavior and host/raw invalid
operation rejection. The default test reads the dedicated published artifact;
local tests can set `OWNED_VOICE_FX_WASM=.tmp/owned-voice-fx/voice-fx.wasm`.
The optional build helper `--publish` writes that artifact/manifest; parent owns
shared graph and default/public-build integration. `--check` verifies the chosen
output directory's source/runtime/Wasm hashes.

## Measured capture deadline concern

On this Windows x64 Ryzen9 3950X, Node24.18.0, three offline four-second-capture
trials per rate measure the wall time of one128-frame owned render including
copy/gating/grain startup. JIT/preemption may contribute; this is not a physical
device callback guarantee.

| Rate | Observed capture render time | 128-frame period | Trials over period |
| --- | --- | --- | --- |
|44.1 kHz|2.284–2.307 ms|2.902 ms|0/3|
|48 kHz|2.532–2.768 ms|2.667 ms|1/3|
|96 kHz|4.987–5.099 ms|1.333 ms|3/3|
|192 kHz|10.079–10.166 ms|0.667 ms|3/3|

The original algorithm synchronously copies and scans up to four seconds during
capture. The port removes capture allocation while retaining that behavior;
the measured copy spike is a concrete remaining problem. Browser/physical
listening and safe direct-worklet deadlines are not claimed.

A proposed copy-on-write follow-up needs more than a single snapshot pointer:
the original copies the candidate cloud **before** testing energy, so failed
captures can replace audible data in a fading cloud; changing length can replace
only a prefix while old grains continue reading the previous suffix. Exact
quarter-energy gating also remains a scan without a separately proven index.
Any optimization must preserve those cases and disclose its extra state/cost.

Parent published production build 7b490244eb5cd194,47438 bytes; source/runtime/Wasm provenance check passes. Instrumented audit build hashes remain separate. Published-asset permanent tests pass.
