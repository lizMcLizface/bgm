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
