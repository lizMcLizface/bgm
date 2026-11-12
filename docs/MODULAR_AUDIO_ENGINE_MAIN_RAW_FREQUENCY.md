# Main raw-frequency control profile

The separate `main-tone-volume-duck-raw-frequency-v1` kernel is
`f8b72ab621c5a767`, 73,348 bytes, SHA-256
`e570ead98a28a19c84a901d740be3804904859a1c4629f3b518c8197a726b4ff`.
The accepted 03eb kernel, all existing hosts and application defaults are
unchanged. This leaf has no live AudioWorklet/Generator adoption yet.

Original Main can target 20,000 Hz while a low-rate Biquad's nominal maximum is
below that value. Clamping the target changes its trajectory. The actual
Native-to-Native diagnostic reports maximum PCM differences of 0.0760403909 at
8 kHz and 0.0725928461 at 24 kHz. At 44.1/48/96/192 kHz those targets are already
in range. Receipt: `reports/modular_audio/main-native-tone-range-first.json`.

The first new bound-only candidate, 06bf, matched an initial raw target but
failed its later step-to-return case (maximum error 0.0603317656). That negative
is retained in `main-range-06bf-first.json` and its exact predecessor artifacts
in `main-range-06bf-baseline/`.

The pinned original AudioParamHandler implementation resolves the missing
boundary: ValuesForFrameRange clips its 128 values to the nominal range and
returns the last clipped value; CalculateTimelineValues stores that value as
the next quantum's intrinsic/default. It preserves the raw event target.
The source SHA-256 is `50e6da5e2efa1254d05393ca03bae373b8a329e400d85b3f6cafd8ec3896ad8b`,
revision `e14de735f191c3a2bdce821a5e3f146bdc987b1e`.

This new fork adds that frequency-only return/store layer, permits bounded raw
frequency commands up to max(20,000, Nyquist), and exposes a read-only profile
ABI tag. Constructor intrinsic values remain nominal-range. Reversing the
three declared library deltas and removing the tag reproduces the complete
accepted library source. Removing the one added timeline method reproduces
the complete shared timeline. The original shared files remain untouched.
Proof: `reports/modular_audio/main-range-f8b7-body-proof.json`.

Actual Native comparison passes all 48 cases / 96 comparisons: six rates,
mono/stereo, raw target, out-of-range step followed by a return, cancellation
and return, and a late target authored at an exact Native suspension. Every
Float32 word and both independent Rust instances match. Receipt:
`reports/modular_audio/main-range-f8b7-native-final.json`.
The promoted page and a fresh HTML reload also pass; their complete 121,307-byte reports are byte-identical (`main-range-f8b7-promoted-first.json` and `main-range-f8b7-promoted-reload.json`).
The five permanent tests also preserve word identity against 03eb in 24
in-range geometries, including odd chunks and the existing credit API.

The Rust allocation audit passes 12 geometries, 49,152 callbacks and 6,291,456
frames with 105,336 live controls and 147,456 observed-frame credit queries:
zero allocation, reallocation, deallocation or memory growth after preparation.
It includes raw-frequency controls and nominal clipping. This is not a
JavaScript heap, callback deadline or physical-listening claim.

Repeat the component review at `/tools/main-strip-range.html` and run
`npm.cmd run main-strip-range:check` or `npm.cmd run main-strip-range:audit`.
Next: a separate raw-frequency word codec/receiver must carry the unchanged
literal events into the cold six-role host before Generator integration.
The old nominal validators must continue refusing unsupported raw targets.
