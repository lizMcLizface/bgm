# Active VoiceCompressor: captured topology acceptance

Updated 2026-11-11. The active captured topology now passes the unchanged native
48-case acceptance suite using the explicitly pinned version-2 FMA math profile.
The first46/48 failure and subsequent unsuccessful non-fused candidate are
retained below. Existing native host routes and defaults remain unchanged.
Mutable live controls and Instrument enable/bypass/rewiring remain separate work;
this acceptance covers the prepared active node plus makeup topology.

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

## Functional checks and retained initial native result

Before the math correction, final-window normal2e4963cea4401d75 /75,055bytes and
audited18116602b2419005 followed a validation-only dependency fix. All48 owned PCM
and coefficient hashes still equaled the first run; the same two192k extreme
cases failed. `voice-compressor-native-morning.json` and
`compressor-contract-correction-continuity.json` preserve that negative recheck.

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

## Arithmetic diagnosis and source correction

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

## Version-2 source profile and production acceptance

The corrected profile is
`amd-avx2-fma3-log10f-rounded-binary64-pow-v2`. Global `LinearToDecibels` now uses a
literal scalar translation of AMD's public AVX2 FMA3 `log10f` implementation,
pinned to revision155b5ab00879dd0d4fcf89aa602415ced5546218. Float32 stages, explicit
fused operations and all three129-entry source tables are preserved; no CPU/rate
dispatch or measured correction table is used. Existing global power and
explicitly qualified fdlibm boundaries remain unchanged. The source and BSD
notices are pinned in the three dependent profiles/build fingerprints. This is
an explicit portable arithmetic profile, not a claim about browser DLL linkage
or universal numerical identity across native operating systems.

A private non-fused AMD source candidate first fixed192k but failed the96k
extreme-control cases at frame15110. Its complete negative record remains
`native-math-candidate-browser-first.json`. The separately published FMA3 source
matches both sensitive curves with one global algorithm, all eight retained
neighboring192k curves and all seven independent CRT static presets. All inverse,
head and tail source tables match the pinned assembly byte-for-byte. The FMA
candidate then passed all unchanged suites, retained as
`native-math-candidate-fma-browser.json`.

`native-compressor-fma-production-browser.json` confirms the final published
local artifacts in the supported built-in desktop browser:

| Suite | Cases | Maximum absolute PCM error | Maximum relative RMS error |
| --- | ---: | ---: | ---: |
| Static native core |96/96|1.7881393432617188e-7|7.910122629557796e-11|
| Captured core automation |48/48|0|0|
| Active VoiceCompressor |48/48|5.960464477539063e-8|6.250315529754387e-9|
| Independent seeded/corner static controls |384/384|.0000030994415283203125|3.4486632671619437e-7|

All eight quiet-DC effective gains are raw exact, all reduction values are exact,
and onset latency remains correct. Captured and Voice control comparisons are
0ULP (equal signed zeros treated equally). The384 independent cases use twenty
unrelated fixed-seed legal static settings and twelve fixed corners at all six
rates, mono/stereo, under the original1e-4 PCM/.01dB bounds. The original48 Voice
fixtures, timestamps and limits were not changed or narrowed.

Final normal versions are static335aff83b5b5bf1a, capture947d6df716a3f0e5 and
Voice5a21904607c19428. Thirty focused tests pass across all three wrappers;
36 audited six-rate mono/stereo cases pass with zero post-prepare allocation or
reclamation and no memory growth. `native-compressor-fma-desktop-timing.json`
records Node/V8 stereo128-frame render means up to .02253/.02313/.02652ms for
static/capture/Voice, respectively; p99 maxima are .0347/.0281/.0326ms. These
offline timings include host overhead/preemption and are not worklet/phone or
physical-audio guarantees.

## Next task: live host lifecycle

Keep the accepted captured contract intact while adding bounded live raw-control
delivery and the original host's amount-zero enable/bypass/rewiring behavior.
Validate control chronology, reconnection histories, tails, latency transitions,
independent instances and save/reload against actual native behavior. An active
amount-zero compressor must not be presented as the existing Instrument bypass.
Rack parallel-mix compressor wrappers remain a separate topology.

```powershell
node tools/buildOwnedVoiceCompressor.mjs --publish --check
npm.cmd exec vitest run src/modular-audio/ownedVoiceCompressor.test.js
node tools/buildOwnedVoiceCompressor.mjs --audit --check
node tools/auditOwnedVoiceCompressor.mjs
```

The last command writes a fresh functional report; native numerical evidence is
recorded separately. `--audit --publish` is rejected by the builder. The permanent
384-case tool is available at `tools/native-compressor-reference.html#math`.
