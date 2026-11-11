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

## Full chain implementation and clocks

The full native topology adds the original lowpass with Q.value 0.5 dB, its
constructor/startup tone transition, native-style fractional delay, four
continuous sine LFOs, and the original 30 ms target laws. Native target events
must retain original seconds and fractional offsets; the step-only clock importer
must not replace their continuous-time law. Drive curve messages have a separate
native control-boundary contract.

The standalone `OwnedTape` adapter uses complete version-1 configuration with
profile `chromium-tape-e14de735-v1`, explicit instance-start phase origin, five
raw Float64 requested values and a prepared bank of one to 32 exact drive
values. The input/output buffers are owned by each Rust handle. It accepts
one or two input channels and emits stereo; mono is duplicated through the
same two independent channel histories. No live/default route has changed.

The lowpass preserves native Q-in-decibels conversion, Float64 coefficients,
Float32 signal history and native-128-frame denormal policy. The fractional
delay uses the pinned x86 Float32 position/interpolation order. Four continuous
sines modulate the original 6 ms base delay in native connection order. The
profile is explicit because a browser's platform/version can choose different
resampler, oscillator, convolution or delay implementations.

`target(index, value)` uses an exact integer sample clock. The separate
`target(index, value, originalSeconds)` import evaluates the original 30 ms
target law at its original fractional offset and starts on
`ceil(originalSeconds * sampleRate)`. It does not turn targets into steps.
Native four-lane Float32 recurrence and convergence checks follow an internal
128-frame clock independent of foreign render partitions. Control changes
update only the requested parameter; replaying all controls would restart
unrelated native target laws.

Drive selects an already prepared 2049-point curve, with a bounded 8196-byte
copy and no curve construction/allocation in control or render. Curve messages
require a native 128-frame control boundary and do not inherit AudioParam's
seconds-to-frame conversion. The native browser harness records actual offline
suspend frames for these property changes. It retains original native target
seconds and applies no output alignment or gain fitting.

Reset clears FIR/filter/delay histories, phases and frame counters while
retaining the latest requested parameters and prepared drive bank. It restarts
the original cold tone transition from the native 350 Hz default. Saving stores
configuration, rather than a running delay/FIR/phase snapshot. The full ABI also
exposes simultaneous shaper/tone/final reference taps; these buffers are written
by standalone render calls and are not part of a future per-sample graph API.

`reports/modular_audio/owned-tape-functional.json` records 12 six-rate
mono/stereo cases at 8/24/44.1/48/96/192 kHz: exact callback-partition parity,
save/reload, retained controls/reset, two independent handles, zero Wasm
allocation/reclamation calls after preparation and no Wasm memory growth.
The runs include sample-frame targets and three prepared drive changes.
The same report records 24 bit-exact regressions against the retained
`7e3b04628555d62c` primitive artifact already proven in the native browser.
The focused suites currently pass 18/18 tests, including separate exact-integer
and imported native low-rate event-state contracts.

The maximum drive bank contains 262272 bytes of Float32 curve payload plus
metadata; it is reserved before preparation. Standalone input/output and two
stereo reference-tap stages total 65536 bytes. Delay history has two channels
of `ceil(0.02 * sampleRate) + 128` Float32 samples, plus separate fixed FIR and
filter state. All storage belongs to the instance, including unused prepared
drive capacity. The adapter keeps this preparation cost explicit rather than
constructing arbitrary new curves during audio rendering.

`reports/modular_audio/owned-tape-desktop-cost.json` records a separate warmed
Node Wasm cost sample on the Ryzen 9 3950X desktop. Across six rates, median
128-frame stereo render time was approximately 0.052–0.053 ms and the largest
observed call was 0.422 ms; no measured call exceeded its rate's quantum period.
Prepared-curve selection plus render peaked at 0.100 ms. These samples include
wall-time/preemption and are not a phone, browser scheduling or device deadline
guarantee. No performance threshold or worker policy follows from this desktop
measurement alone.

The FIR contributes a 128-frame group delay. The original downstream 6 ms
delay is modulated and interpolated; total wet timing is therefore time varying.
It must not be reported as a fixed 128-frame total effect latency or silently
compensated as if it were a fixed path delay. This standalone implementation
has not yet been admitted to the graph or substituted for the native host.

```powershell
node tools/buildOwnedTape.mjs --audit
$env:OWNED_TAPE_WASM='.tmp/owned-tape/tape-fx.wasm'
npm.cmd test -- src/modular-audio/ownedTape.test.js src/modular-audio/ownedTapeShaper.test.js
node tools/captureTapePrimitiveProof.mjs
node tools/auditOwnedTape.mjs
node tools/measureOwnedTapeCost.mjs
```

The full native browser comparison is a separate 54-case batch with simultaneous
stage taps (162 comparisons), original setters and native seconds/property
controls at 44.1/48/96 kHz, mono/stereo. Maximum absolute and relative RMS limits
were both fixed at 1e-4 before its first run.

The retained first run, `tape-full-native-browser.json` and screenshot, uses
engine `ba45aa666ff90cf6` and passes **52/54 full cases**. The two failures are
96 kHz, full-depth/high-rate modulation with drive1/tone20k, mono and stereo:
maximum final-delay errors are 0.00011026859283447266 and
0.00010304152965545654. Relative RMS errors remain below the fixed 1e-4 limit;
the maximum is 0.000056862435240349355. Shaper output is bit exact in these
failures and tone differs only by approximately 6.26e-39. The full-chain profile
had therefore **not passed its declared native bound**. No threshold widening,
output shift, gain normalization or silent route substitution is applied.

The follow-up `tapeDelayReferenceVerification.js` captures the same four native
LFO depth outputs in an independent Gain AudioParam with the original base
delay and constant1 input, alongside raw oscillator outputs and original
shaper/tone/delay taps. It separates control-curve differences from Float32
delay read-position/interpolation using explicit source-based reconstruction.
Pinned source auditing identifies native Float32 wavetable increments,
frequency-dependent interpolation and HashSet-derived summing order, while the
initial portable reference used ideal double-phase sines and fixed
creation-order summing. A separate native AudioParam has its own summing
junction, so equality with the original delay's order is measured rather than
assumed. The original failed report remains evidence during refinement.

`tape-delay-native-diagnostic.json` independently confirms the delay math:
reconstruction from native tone plus its mirrored native delay-time curve is
exact apart from subnormal values up to approximately 1.14e-38, and reconstruction
of owned output from owned tone/control values is bit exact. The summed curves
differ by at most 3.725290298461914e-9 seconds. At96k this crosses Float32
read-position steps of 0.00048828125 frames. The native mirror differs from
creation-order summing by up to 1.862645149230957e-9 seconds in five of six
cases; source inspection confirms the native HashSet order. Raw native sine
outputs differ from the initial ideal-sine implementation by up to
4.470348358154297e-6. The next refinement extracts immutable native sine tables
at source-defined integer increments and applies the actual pinned clock and
interpolation behavior; it does not alter the declared bounds.

The native clock capture is retained in `tape-native-clock-capture.json` and its
screenshot. Three source-defined table sizes (2048 at24k,4096 at48k,16384 at96k)
were extracted with `frequency=sampleRate/tableSize`, making the pinned
Float32 phase increment exactly1. Every read is at an integer index with zero
interpolation fraction. All three have raw exact second periods, peak1 and
quarter samples `[0,1,0,-1]`. The installer checks Float32LE SHA-256 values and
refuses to overwrite a resource with other bits. The resulting 90112 bytes are
immutable offline resources, recorded with actual browser/method/rate provenance
in `resources/manifest.json`; there is no runtime browser or FFT dependency.

The same capture runs six original native Tape instances simultaneously from
one mono input. Across all15 pairs, their output differs by up to
0.00009595602750778198 and mirrored delay-time curves by up to
2.7939677238464355e-9 seconds. Native HashSet order is a measured instance
difference, rather than a deterministic portable summing-order contract. The
port keeps stable creation order; it does not fit an order to each reference.

The refined oscillator uses native Float32 rate scales/increments, double
a-rate indices and 2/3/5-point interpolation over the captured tables. Constant
Flutter oscillators preserve the pinned SSE four-lane Float32 clock inside
each native128-frame block and restart the lanes from the more accurate double
phase at the next boundary. State remains owned; foreign render partitions do
not restart those clocks. The a-rate vector-linear choice predicts the current
target's next four increments. An event imported inside a group that changes
its interpolation-threshold classification is a rounding-sensitive boundary
requiring separate proof; future graph controls should retain native128-frame
boundaries. Universal pointwise native equivalence is not claimed.

## Final standalone acceptance

Engine `449029958ac881d3` passes **54/54 full-chain cases and all162 stage
comparisons**, recorded in `tape-full-native-browser-v2.json` and screenshot.
Maximum absolute error is 0.00009357929229736328 and maximum relative RMS error
is 0.00004341233345220533, within the original unchanged 1e-4 limits. The v2
delay diagnostic separately reports exact Wow/Drift oscillator output in all
six cases, remaining constant-oscillator errors at most
7.450580596923828e-8, and summed curve errors at most
1.862645149230957e-9 seconds. Native HashSet variability and Float32 delay
read-position quantization remain explicit numerical limits.

Low-rate native tone carry behavior has a separate reference: at8/24k,
the target can exceed Nyquist, and native clipping carries the last clipped
value into the next128-frame quantum while retaining raw within-quantum values.
The original `tape-lowrate-native-browser.json` retains all8 failed cases from
the first carry-only implementation. Source correction separates emitted
target samples from the scalar value returned to a following prebooked native
event: a converged segment fills target samples but retains its pre-evaluated
transition scalar, and an old segment at an exact quantum boundary can run
with zero outputs while advancing that scalar once. Explicit native-seconds
import preserves this captured/prebooked timeline behavior, distinct from
streaming exact-integer control updates.

`tape-lowrate-native-browser-v2.json` and screenshot pass **8/8 cases and all24
stage comparisons**, including events at8192/8193, 8/24k and mono/stereo, with
maximum absolute error 1.043081283569336e-7 and maximum relative RMS error
8.899211567633177e-9. Both original failed records remain unchanged. These
finite native comparisons establish the tested explicit profile; they do not
establish mobile behavior, arbitrary browser/platform identity, cancellation
or rescheduling equivalence, or realtime deadlines. See
`MODULAR_AUDIO_ENGINE_MOTION_TAPE_AUDIT.md` for the original graph audit and
measured native-seconds boundary distinction.
