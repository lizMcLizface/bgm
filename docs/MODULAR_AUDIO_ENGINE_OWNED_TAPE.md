# Explicit portable Tape profile

Updated 2026-11-11. The native Tape implementation and its default host route
remain unchanged. This is an opt-in, versioned Chromium-profile port; the
primitive reference described below is not a substitute for the full effect.

## Pinned 2x WaveShaper proof

The source profile is pinned to Chromium revision
`e14de735f191c3a2bdce821a5e3f146bdc987b1e`, with recorded file hashes and original
BSD attribution in `synth-engine/tape-fx/CHROMIUM_PROFILE.json` and
`CHROMIUM_NOTICES.txt`. Source capture is a separate explicit tool; normal builds
use the checked-in profile offline and do not download changing browser code.

The primitive reproduces the pinned 128-tap Blackman-sinc interpolation and
256-tap half-band downsampling construction, using causal owned polyphase
histories and Float32 curve/convolution arithmetic. The 2049-point drive curve
is the actual original Tape curve. A separate linear diagnostic isolates the
resamplers. Curves remain immutable during this primitive reference run.

`reports/modular_audio/tape-shaper-native-browser.json` and its screenshot record
**72/72 bit-exact comparisons** in the built-in Chrome 157 browser, engine
`7e3b04628555d62c`, maximum absolute and relative RMS error both zero. The fixed
predeclared limits were 1e-4 each. No alignment, gain normalization, input edits
or startup trimming were applied.

The batch renders the actual original `Tape.shaper` before its tone/delay stages
at 44.1/48/96 kHz, mono/stereo, with the linear diagnostic and original drive
0/0.3/1 curves. It uses impulses, multitone signals and high-frequency material
with folded harmonic/alias measurements. Native and portable impulse peaks
agree at the declared 128-frame FIR group delay. This is resampler group delay,
not an added graph capture buffer; the causal response can contain small
pre-ringing samples before its peak.

Six owned tests separately verify that group delay, isolated stereo state,
mono mapping, independent handles, exact arbitrary callback partitions, reset
replay and explicit profile validation. The primitive cannot claim full Tape
tone/delay/automation compatibility by itself.

```powershell
node tools/buildOwnedTape.mjs
$env:OWNED_TAPE_WASM='.tmp/owned-tape/tape-fx.wasm'
npm.cmd test -- src/modular-audio/ownedTapeShaper.test.js
```

Publishing also copies the pinned profile and required BSD notices alongside
the Wasm artifact. `--check` verifies source/runtime/Wasm, the original Tape
source hash, profile/notices hashes and copied bytes, embedded profile metadata,
and the engine version. The existing native Tape source is not modified.

## Full chain work following the primitive checkpoint

The full native topology adds the original lowpass with Q.value 0.5 dB, its
constructor/startup tone transition, native-style fractional delay, four
continuous sine LFOs, and the original 30 ms target laws. Native target events
must retain original seconds and fractional offsets; the step-only clock importer
must not replace their continuous-time law. Drive curve messages have a separate
native control-boundary contract.

Complete full-chain compatibility, prepared-drive resources, allocator behavior,
state independence and timing will receive separate exact results after their
native browser comparison. Until those checks pass, only the isolated 2x
primitive is verified. See `MODULAR_AUDIO_ENGINE_MOTION_TAPE_AUDIT.md` for the
original graph audit and the measured native-seconds boundary distinction.
