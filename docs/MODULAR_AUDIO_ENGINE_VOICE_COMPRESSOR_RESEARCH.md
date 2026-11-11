# Active VoiceCompressor research checkpoint

Final-window recheck: normal2e4963cea4401d75 /75,055bytes and audited
18116602b2419005 follow the validation-only dependency fix. All48 owned PCM
and coefficient hashes equal the first native run; the same two192k extreme
cases remain failed. Eight owned tests and12 refreshed allocation cases pass.
Evidence: voice-compressor-native-morning.json and compressor-contract-correction-continuity.json. This remains UNACCEPTED research.
Updated 2026-11-11. **Unaccepted research slice.** The owned wrapper passes
functional checks, but its first native comparison passes only 46 of 48 cases.
It must not replace the existing VoiceCompressor route or enter a production
Graph/default adoption gate. The original host and accepted static/captured
compressor kernels are unchanged. This finding does not block other port work.

## Actual topology and prepared contract

`synth-engine/voice-compressor` owns the active topology in the unchanged
`src/nodes/voiceCompressor.js`: the existing captured native compressor core,
followed by the actual external makeup/trim Gain. It does not infer the
Instrument's separate `compAmount > 0` enable/bypass/rewiring policy. Even
amount zero in this explicitly active topology retains native lookahead.

The complete immutable configuration contains five original Float64 requested
controls: amount [0,1], ratio [1,20], trim [-18,18] dB, attack [.001,1] seconds
and release [.01,1] seconds. It accepts at most 128 chronological original-seconds
raw UI events. Same-time operations are grouped with the final requested state,
matching replacement of same-time native targets. Preparation compiles the
actual setter calls; live mutation, cancellation, ramps and running DSP-state
snapshots are outside this captured subset. Reset replays the original capture.
Save/reload preserves configuration, raw requested values and original seconds.

Amount/ratio/trim updates each schedule threshold, ratio and makeup with the
source's 20 ms targets, even if some requested values are unchanged. The source
formula is preserved in Float64 before the native Float32 parameter boundary:

```text
threshold = -amount * 36
slope = 1 - 1 / ratio
builtIn = .6 * -threshold * slope
typical = max(0, -18 - threshold) * slope
makeup = 10 ** ((-builtIn + typical * .85 + trim) / 20)
```

This uses requested values, not smoothed current coefficients or a queried
detector gain. Attack and release setters schedule only their own targets.
The native cold compressor starts at threshold -24, knee 6, ratio 12, attack
.003 and release .25; the external gain starts at 1. Initial requested controls
are targets at time zero, preserving that first native quantum.

The five core parameters retain the accepted 128-frame fixed k-rate evaluator.
The owned external Gain reproduces the pinned full a-rate target evaluator,
including four-lane recurrence, fractional start correction, convergence,
exact-boundary zero-output segments and returned-scalar behavior. Foreign render
partitions do not reset either clock. Lookahead is inherited from the core:
48/144/264/288/576/1023 frames at 8/24/44.1/48/96/192 kHz, respectively. No extra
wrapper delay is added. Each instance owns its timelines, gain state, native
core and input/core-output/post-output buffers; render/reset allocate nothing.

Source provenance, original host hashes and BSD notices are pinned in
`synth-engine/voice-compressor/CHROMIUM_PROFILE.json` and
`CHROMIUM_NOTICES.txt`, at Chromium revision
`e14de735f191c3a2bdce821a5e3f146bdc987b1e`.

## Functional checks and actual native result

Eight discoverable `ownedVoiceCompressor.test.js` checks cover configuration
round trips, two independent handles, odd render partitions, replay reset,
cold targets, same-time replacement, source makeup formula, separate core/post
taps, active amount-zero latency, original sub-quantum timestamps and bounded,
complete, immutable preparation. These checks establish owned behavior, not
native numerical acceptance.

`owned-voice-compressor-functional.json` records 12 mono/stereo cases across
8/24/44.1/48/96/192 kHz, using audited engine `ecb534dfa034aa66`: callback
partition and save/reload PCM are raw exact, reset replays the capture,
independent handles do not interfere, post-prepare allocation/reclamation calls
are zero and Wasm memory does not grow.

The local standalone `tools/voice-compressor-reference.html` compares the
**unchanged actual native VoiceCompressor class** with normal owned engine
`cb9d68f048f05d42` (75,507 bytes). It records the native setter arguments and
simultaneously taps core/post PCM. Five k-rate and one a-rate native Gain
parameters mirror the actual calls independently. Original seconds are retained.
Before the run, bounds were fixed at maximum absolute and relative RMS PCM
error 1e-4, coefficient error 1 Float32 ULP, reduction error .01 dB and exact
first-input onset latency. There is no alignment, gain fitting, fixture change
or tolerance adjustment.

`voice-compressor-native-browser-first.json` and its screenshot preserve the
first Chrome 157/Win64 run: **46/48 pass, acceptance false**. Across all 48 cases,
all six coefficient streams compare exactly (0 ULP, treating equal positive and
negative zeros equally), onset latency is correct and
reduction stays within bounds (maximum 7.62939453125e-6 dB). Only
`raw-control-extremes` at 192 kHz fails, in both mono and stereo:

| Case | Core maximum absolute | Post-makeup maximum absolute | Post relative RMS |
| --- | ---: | ---: | ---: |
| Mono | .0005338191986083984 | .0021266937255859375 | .000007366063291436675 |
| Stereo | .0005326271057128906 | .0021228790283203125 | .000007132064752998987 |

The absolute-error failures remain failures despite the passing RMS values.
Sixteen coefficient byte hashes differ because native Gain processing can
normalize the sign of zero; these are not claims of byte-for-byte equality.
The rate range has not been narrowed to hide them. The test page is a local
research tool, not a public build entry or a default route.

## Narrowed arithmetic diagnosis; no accepted-core change

Both failing cases reach their maximum error at output frame 38,039. Coefficient
mirrors are exact, while the core tap already differs before external makeup.
The relevant native control quantum starts at frame 38,016 with these exact
Float32 coefficients:

```text
threshold -35.9862174987793; knee 6; ratio 19.99250030517578
attack .9999427795410156; release .9998725056648254
```

`voice-compressor-quantum-curve.json` records the unchanged owned static curve
at eight neighboring quanta. `voice-compressor-quantum-ucrt.json` independently
evaluates the pinned curve equations using read-only existing system math DLL
functions. Seven neighboring curves agree exactly. At frame 38,016, the owned
search yields k=217.51889038085938 and postgain=9.336949348449707; the independent
CRT calculation yields k=217.82183837890625 and postgain=9.338461875915527.
That gain ratio explains the observed PCM discrepancy. This is arithmetic
evidence and an inference about the failure, **not proof of browser DLL linkage**.

The pinned source distinguishes two math boundaries:

- `audio_utilities.cc` calls **global unqualified** `powf`/`log10f` in
  `DecibelsToLinear` and `LinearToDecibels`.
- Explicitly qualified `fdlibm` float wrappers in `ieee754.cc` call their
  binary64 functions before conversion to Float32. These are separate calls;
  their behavior must not be assumed for every global platform primitive.

`native-compressor-primitive-math.json` records a private Wasm-only probe of
four float-versus-rounded-double primitive combinations. Current rounded-double
log matches 7/8 neighboring CRT curves. Switching globally to f32 log fixes
frame 38,016 but breaks 37,632 and 37,888, matching only 6/8. Switching global
pow precision also introduces discrepancies. **Neither switch is a valid fix.**
The 15-step knee search amplifies tiny primitive rounding differences into a
material postgain change. No per-input correction table or fitted multiplier
has been introduced.

An optional further primitive-level PowerShell probe was blocked by the system
script execution policy and was not run with an override or inline workaround.
The existing successful arithmetic reports and failed native record remain the
complete evidence. No claim of universal native/platform bit equivalence follows
from the earlier finite static or automation suites.

## Next task and acceptance gate

Identify a source-supported, explicitly versioned math profile for the global
native primitives, and validate it on the exact failing coefficients and their
neighbors before proposing any shared-core change. If such a change is justified,
rerun the accepted static 96-case native suite, captured automation 48-case suite,
quiet-DC diagnostics, Graph/native checks and this unchanged 48-case Voice suite,
as well as owned allocation/persistence/independence tests. Preserve every first
failure report. Existing accepted kernels and app defaults remain frozen until
that review succeeds. Rack parallel-mix compressor wrappers are separate future
work; they have not been substituted with this research topology.

```powershell
node tools/buildOwnedVoiceCompressor.mjs --publish --check
npm.cmd exec vitest run src/modular-audio/ownedVoiceCompressor.test.js
node tools/buildOwnedVoiceCompressor.mjs --audit --check
node tools/auditOwnedVoiceCompressor.mjs
```

The last command writes a fresh functional report; it does not supersede the
native numerical failure. `--audit --publish` is rejected by the builder.
