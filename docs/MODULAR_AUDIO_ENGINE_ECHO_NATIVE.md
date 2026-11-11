# Original native echo in portable Rust

Accepted captured profile: `native-echo-continuous-sse128-v1`, engine
`a99400a9a23f9a8f`, 20,374-byte Wasm. This ports the original static
`nativeEcho` topology: send, matching feed-forward pre-delay, main delay,
first-order IIR tone, feedback and optional stereo swap. Original Native code
and normal application defaults remain operational.

Each owner contains its rings, double-precision IIR history and feedback block.
The contract requires fixed stereo, continuous pulls and the measured 128-frame
feedback compensation. Other compensation profiles are refused. Preparation
allocates; render/reset allocate nothing. Render accepts at most 2,048 frames,
independent of partitioning. Typed normalized JSON saves configuration, not
transient audio history; reload reconstructs fresh independent state.

## Verification

The actual original Native graph passed 25 muted desktop comparisons: both
ping-pong settings, two parameter sets and six rates (8/24/44.1/48/96/192 kHz),
plus a 2.5-second ring-wrap case. Maximum difference was approximately
1.244e-38, from Native flushing subnormal values; the existing 1e-6 absolute
and relative RMS bounds were unchanged. Irregular partitions and independent
JSON replay were sample-bit exact. Actual page reload matched saved PCM SHA
`5b946ad60cf637243648f55db4c41573a6477a94363bf79297e5a6858bb3ef5f`.

Eight permanent checks cover rates, reset/reload, independence, causal onset,
ping-pong and strict contracts. Twelve allocation cases render two owners
through ring wrap, reset and render again with zero allocations, frees or
memory growth. Source and license fingerprints are published with the assets.

The first comparison failed because its Rust fixture used a fractional raw
millisecond value while the original sanitizes to integer milliseconds.
The fixture now applies the original sanitizer before capture; no numeric
algorithm or acceptance bound was changed. That negative report is retained.

Ignored evidence: `reports/modular_audio/native-echo-first.json`,
`native-echo-final.json`, `native-echo-reload-final.json`,
`native-echo-allocation-final.json` and `native-echo-verified.png`.
Maintained review: `/tools/native-echo.html`.

## Remaining boundary

This is the captured DSP checkpoint, not an adopted live host. Next implement
an owned AudioWorklet with explicit clock, empty-input/tail, clear, startup and
reused-context contracts, then compare the actual routed host before exposing
an optional context factory. No phone listening or device deadline claim is
inferred. The original native echo algorithm must not be replaced by the
separate FDN delay.

## Owned live host checkpoint

Host `ab1b41b6a9044dc5` keeps the accepted numeric Wasm unchanged. Its
AudioWorklet owns one static echo, canonical callback recovery, bounded requests,
clear acknowledgement and disposal. Preparation remains valid while paused;
explicit `arm()` requires a running context and bounds processor readiness.
No startup timer can expire merely because the user has not started playback.

All72 actual Native/worklet comparisons passed at the same six rates: both
stereo feedback modes through continuous input, ended/retriggered input,
disconnect/reconnect, clear, delayed input and late creation. Largest differences
remain subnormal noise under1.5e-38. Two owned instances remain numerically exact.
A real HTML reload reproduces saved192k late-created PCM. Three actual live
rounds in one reused48k AudioContext also pass with zero measured Native error,
covering clear, source tail, explicit demand gaps and JSON reconstruction.
These are desktop captured PCM checks; listening remains unassessed.

The first live negative was a genuine host boundary: an active AudioWorklet
continued rendering while the disconnected Native graph froze. The retained
negative has maximum error0.1361. Explicit Boolean owner demand now freezes
Rust history at the original disconnect/reconnect boundaries. DSP samples are
not invented for skipped callbacks. A host must own this demand signal; the
processor does not guess Native bus silent flags by scanning PCM.

Seven additional permanent tests prove demand freeze/causal resumption, stale
clock recovery, acknowledged clear, malformed/missed-frame failure cleanup,
paused startup, context identity and registration retry. Native comparisons use
suspended edit barriers for exact clear boundaries. Ordinary clear messages act
when delivered; no unsuspended MessagePort/UI timestamp parity is claimed.

Maintained review: `/tools/native-echo-live.html`. Ignored evidence:
`native-echo-live-first.json`, six `native-echo-live-<rate>-final.json` shards,
`native-echo-live-reused-final.json`, `native-echo-live-reload-final.json` and
`native-echo-live-lifecycle-final.log` under `reports/modular_audio/`.
Normal context-factory adoption is the next task and is not included here.
