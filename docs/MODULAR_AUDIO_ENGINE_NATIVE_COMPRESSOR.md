# Explicit native DynamicsCompressor profile

Contract correction checkpoint: current standalone version518439cc3c3f8cc9
retains byte-identical33,718-byte numeric Wasm. Installed JS snapshots are now
immutable, while builder configurations remain editable. Eleven focused static
tests pass, including the previously divergent save/patch metadata case.
Updated 2026-11-11. This independent port preserves the actual Chromium native
node algorithm behind an opt-in profile. It does not replace the original live
Web Audio routes, the existing zero-lookahead `graph.compressor`, the desk
compressor, or the custom master limiter.

## Source and actual host boundaries

`synth-engine/native-compressor/CHROMIUM_PROFILE.json` pins official source and
host hashes at Chromium revision `e14de735f191c3a2bdce821a5e3f146bdc987b1e`.
`CHROMIUM_NOTICES.txt` retains the original Google/Apple BSD notices and Chromium
license. The source has one `DynamicsCompressor` implementation; old separate
kernel filenames are absent at this revision. Normal builds are offline.

The native algorithm includes stereo max-absolute detection, the original
15-iteration soft-knee search, built-in empirical makeup gain, 32-frame adaptive
attack/release divisions, sine-warped gain, native predelay and the original
0.325-second reduction-meter release. All signal/curve state and stereo delay
buffers belong to an instance. There is no native external sidechain input.

| Native parameter | Range | Native default |
| --- | --- | --- |
| Threshold dB | -100 to0 | -24 |
| Knee dB | 0 to40 | 30 |
| Ratio | 1 to20 | 12 |
| Attack seconds | 0 to1 | 0.003 |
| Release seconds | 0 to1 | 0.25 |

The kernel still applies its original 1 ms internal attack minimum when the
requested attack is below it. The raw Float64 request ledger retains the actual
requested value, including zero, before native Float32 conversion.

The existing application has several uses of this same native node:

- `nodes/compressor.js` changes attack/release to0.005/0.05 and exposes direct
  current-time step setters.
- `nodes/voiceCompressor.js` maps amount to threshold, schedules 20 ms targets,
  and adds an external makeup/trim GainNode. The Instrument bypasses it at
  amount0.
- The effects rack schedules 12 ms targets and blends a separate undelayed dry
  branch with compressed audio and output trim.
- The extra limiter uses knee0, ratio20, attack0.002 and release0.09, with its
  own threshold target smoothing. It is not a true-peak/brick-wall guarantee.
- The piano and Iowa players use separate native limiter presets. Their
  source routing, convolver, gains and defaults remain operational unchanged.

The first standalone slice ports the actual compressor node kernel and static
presets. Native target-law compilation, surrounding parallel mix/gain smoothing
and native AudioNode silence/tail scheduling require separate host evidence.
They are not silently approximated by another compressor implementation.

## Timing and state contract

All five native AudioParams are fixed k-rate. The owned kernel snapshots complete
parameters on its internal 128-frame clock and retains the native 32-frame
detector/envelope divisions across arbitrary foreign render-call splits.
Controls are accepted only at128-frame boundaries. Input/output buffers accept
up to2048 frames, mono or stereo, with explicit mono duplication through two
independent channel histories and shared stereo detection.

Actual native lookahead is
`min(trunc(Float32(0.006) * Float32(sampleRate)), 1023)` frames, not a universal
exact6 ms delay. It is48/144/264/288/576/1023 frames at8/24/44.1/48/96/192kHz.
The fixed stereo rings hold1024 Float32 samples per channel. Native metering
tail time is1.625 seconds; this differs from an audible ring tail and from the
native host's silence/lifecycle policy. This profile adds no separate graph
capture latency.

Preparation requires all five unique initial controls exactly once. Instance
render/control/reset calls allocate no Rust memory after preparation. Reset
retains the latest requested configuration and restarts as a fresh native-node
instance: rings, detector, gain, meter and32/128 clocks restart. It does not
reuse the native internal Reset's256-frame default write index with a stale
last-predelay cache. Save/reload stores configuration rather than running
detector/meter/delay state.

## Verification and current scope

`reports/modular_audio/owned-native-compressor-functional.json` records12
six-rate mono/stereo cases with raw exact callback-partition equality, timestamped
128-frame controls, save/reload, latest-target reset, independent handles, zero
Wasm allocation/reclamation calls after preparation and no memory growth.
Thirteen focused tests cover those clocks, latency, stereo linking/isolation, mono
mapping, complete validation, parameter bounds, fresh-instance reset and immutable
installed target snapshots. Builder configurations remain editable; installed
snapshots are frozen so external edits cannot make save/reload disagree with DSP.

The first real native comparison page is
`tools/native-compressor-reference.html`:96 static cases across44.1/48/96kHz,
mono/stereo, eight actual native/rack/voice/limiter kernel presets, impulse and
dynamic-level material. It compares raw PCM, public reduction metering and exact
impulse lookahead with the actual native node and original Compressor wrapper.
Maximum absolute/relative RMS bounds of1e-4 and reduction-meter error0.01dB were
declared before its first browser run. No alignment, input edits, gain fitting,
default switch, physical listening or realtime deadline claim is permitted.
The retained first browser report, `native-compressor-native-browser.json`,
uses engine `739479667ce03057` and passes90/96 cases. The six failures are only
the voice-kernel static impulse at all three rates, mono/stereo: maximum PCM
error0.00015425682067871094 and relative RMS0.00011142548593621406 exceed the
unchanged1e-4 bounds. All96 impulse timing checks pass and all reduction checks
remain inside0.01dB. The failed record is preserved during source correction.

The error is almost rate invariant while reduction agrees closely, which
localizes it to the static knee/makeup curve. The pinned `fdlibm` float wrappers
explicitly evaluate binary64 functions then convert toFloat32; the initial
port used separate single-precision transcendental approximations. The explicit
`rounded-binary64-float-v1` math profile now preserves these wrapper boundaries
and uses rounded binary64 logarithm/power for its native-style float utility
functions.

`native-compressor-ucrt-curve.json` records an independent arithmetic probe of
the installed Windows CRT's ordinary `powf`/`log10f`/`exp` functions, with DLL
version/hash. A source-identical static-curve translation explains the sensitive
voice preset: one threshold Float32 bit changes the 15-step knee search and
therefore its makeup gain. All six exposed static fields now match this probe
bit exactly for seven presets. This supports the math-profile inference; it
does **not** prove which DLL the browser links, or replace actual native PCM
acceptance. The source code and system math library are not modified, and no
new native executable or security-policy bypass is used.

The additional quiet-DC diagnostic feeds native and owned nodes with identical
amplitude2^-20, below even the minimum threshold. The original diagnostic
incorrectly labeled this effective gain as bare native postgain: the detector
starts at0 and stalls slightly below1 in Float32, so a residual envelope warp
remains. The corrected version renders both implementations for the identical
128-aligned duration, compares their actual effective gains/reduction, and shows
owned static postgain separately. The original mislabeled record is retained
with this interpretation correction. No fitted compensation or new production
curve/gain constants are generated.

## Static native acceptance

`native-compressor-native-browser-v2.json` and its screenshot record engine
`4057fdc2c9a3136d` passing **96/96 cases** under the original unchanged limits.
Maximum absolute PCM error is1.7881393432617188e-7, maximum relative RMS error
is7.910122629557796e-11, reduction metering is exact, and every impulse latency
matches. Native defaults, the original Compressor wrapper and all six other
actual host-kernel presets pass at44.1/48/96kHz, mono/stereo, for impulse and
dynamic-level material. The first failed record is preserved.

`native-compressor-curve-native-browser-v2.json` and screenshot separately
compare all8 quiet-DC effective gains and reduction values **raw exactly**
(maximum error0), on the same engine. This corrected diagnostic measures actual
finite-state output rather than claiming to expose bare native postgain.

This establishes the tested static explicit profile. Native k-rate target-law
automation, surrounding gain/parallel wrappers, long-silence AudioNode lifecycle,
physical listening and realtime scheduling remain separate acceptance work.
No existing live/default route has been switched by this standalone port.

Retained edge finding, resolved by version2 below: the later active VoiceCompressor research suite exposed an underlying
knee/math-profile mismatch at the exact coefficients reached by raw extreme
controls at192kHz. Its native core maximum absolute error is .0005338191986083984,
despite exact mirrored control coefficients; external makeup increases the error.
The accepted static fixtures above still pass, but their numerical coverage is
bounded, not universal. Global float/double primitive switches are not a valid
correction. See `MODULAR_AUDIO_ENGINE_VOICE_COMPRESSOR_RESEARCH.md` for the retained
46/48 native failure, neighboring-curve evidence and shared-core regression gate.

Version2 replaces only global `LinearToDecibels` log10f with a literal pinned AMD
AVX2 FMA3 scalar translation, preserving Float32 stages, explicit fused operations
and three129-entry source tables. It retains global rounded-binary64 power and
the separately qualified fdlibm calls. The explicit profile is
`amd-avx2-fma3-log10f-rounded-binary64-pow-v2`; source/notices pin AMD revision
155b5ab00879dd0d4fcf89aa602415ced5546218. Neither CPU/rate switching, fitted gains,
output alignment nor tolerance changes are used. A non-fused candidate's96k
failure is preserved alongside the earlier192k failure.

`native-compressor-fma-production-browser.json` verifies final static artifact
335aff83b5b5bf1a: original96 cases pass with the same1.7881393432617188e-7 maximum
absolute error and exact reduction/latency. All eight quiet-DC effective gains
remain raw exact. An additional384 unrelated seeded/corner static cases at all
six rates, mono/stereo, pass under the same bounds (maximum absolute error
.0000030994415283203125). Captured48 and active Voice48 suites pass as well,
including the original192k and new candidate96k sensitive cases. Numeric coverage
remains bounded, not a universal native/platform identity claim. See the focused
VoiceCompressor document for exact source-profile and negative-proof history.

```powershell
node tools/buildOwnedNativeCompressor.mjs --audit
node tools/auditOwnedNativeCompressor.mjs
node tools/buildOwnedNativeCompressor.mjs --check --audit
```

`--audit --publish` is rejected. Published normal artifacts include pinned
source/notices beside the Wasm, and `--check` verifies source/runtime/Wasm,
profile/notices, original host references, build mode and version fingerprints.
