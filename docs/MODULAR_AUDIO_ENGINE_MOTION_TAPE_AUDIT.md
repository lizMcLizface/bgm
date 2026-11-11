# Native Motion port and Tape boundary audit

Updated 2026-11-11. This slice preserves the original native files and defaults.
It ports the defined native Motion signal chain into a separate reusable Rust
engine. Tape remains an explicit native host seam until its oversampling profile
and automation behavior have a defensible browser reference.

## Motion: actual graph and portable contract

Source: `src/nodes/motion.js`, baseline SHA-256
`49f562d04dab23839d3c623fed2856ea4f507e4f12eb56a7492d816192b3ca80`.
The baseline is also retained locally at `.tmp/owned-motion-baseline/motion.js`.

The original signal path is input gain → tremolo gain → explicit stereo splitter
→ two balance gains → stereo merger. A continuous sine LFO at default 4 Hz drives
tremolo around `1-depth/2` with amplitude `depth/2`. A second continuous sine at
default 0.2 Hz drives two WaveShapers carrying the original 1025-point balance
curves: left `sqrt(2)*cos((position+1)*pi/4)`, right corresponding sine. This is
equal-power stereo balance, not a StereoPanner that sums input channels at its
extremes. Mono input is explicitly upmixed before splitting.

The actual setters use immediate `setValueAtTime` steps. Depths are in 0..1 and
rates in 0.01..20 Hz. There is no implicit smoothing, delay, oversampling, history
tail or modulation reset when a control changes. Already-created oscillators
continue through silence and zero-depth spans. Native `VoiceFx` separately creates
and routes the stage only when needed; that creation/routing lifecycle remains a
host responsibility and is not silently reproduced by a portable bypass flag.

`synth-engine/motion-fx` owns all buffers, curves, exact f64 requested targets,
phase and transport clocks. Processing uses f32 boundaries matching native audio
signals/AudioParam values and phase-continuous sine evaluation. It supports
stereo `tick`, `render(frames,channels)` with explicit mono/stereo mapping,
`param`, `parameters`, `input_mut`, `output`, `reset`, and `stat`. Render, setters
and reset allocate/reclaim nothing. Reset is an explicit new fresh-instance
policy: latest controls remain, phases and clocks restart at zero. The original
Motion class has no reset method.

Graph hosts using `tick` call `begin_block` once per outer render to clear the
span's peak meter. Internal event splits must not clear that meter. The standalone
`render` method owns this boundary itself. Neither operation changes PCM or phase.

`src/modular-audio/ownedMotion.js` uses complete versioned `native-motion-v1`
configuration with `phaseOrigin:'instance-start'`. It preserves requested f64
targets through validation, edits and save/reload, and rejects stale memory views
after preparation grows Wasm memory. Parameter events have no canonical 128-frame
restriction: the standalone engine is invariant under caller partitions when
the caller splits at the same sample-frame control events.

## Motion evidence

Build and check owned state:

```powershell
node tools/buildOwnedMotion.mjs --audit
$env:OWNED_MOTION_WASM='.tmp/owned-motion/motion-fx.wasm'
npm.cmd test -- src/modular-audio/ownedMotion.test.js
node tools/auditOwnedMotion.mjs
```

Eight permanent tests cover analytic tremolo/balance extrema, exact zero-depth
stereo passthrough and mono upmix, continuous phases, callback partitions,
save/reload, independent handles, outer render peak metering and atomic invalid edits. The dedicated owned
report records 12 mono/stereo cases across 8/24/44.1/48/96/192 kHz, including
sample-frame parameter edits at 13/41/512/513/4001/8191/10003. Allocation checking
includes rendering, setters and reset. These owned invariants are separate from
native browser numerical compatibility.

`tools/motion-reference.html` runs a fixed muted OfflineAudioContext batch using
the actual original Motion class and its actual setters. A scheduling-clock
facade only supplies event times to those setters; node creation, routing and
native DSP are unchanged. Native and portable inputs are identical. The batch
compares 36 cases at 44.1/48/96 kHz, mono/stereo, flat controls, extremes, combined
motion and imported native-time automation. Before comparison, the maximum absolute and
relative RMS error bounds were fixed at 1e-4 each. There is no alignment search,
gain normalization, changed event timing or dropped startup segment. Browser
oscillator/precision implementation differences must be reported rather than
presented as bit-exact native equivalence.

The original Chrome 157 comparison is retained in
`reports/modular_audio/motion-native-browser.json`: 34 of 36 cases passed. The two
44.1 kHz automation cases exposed a timing-contract mismatch rather than a broad
DSP error: their maximum error 0.0023449324 occurs at frame 13. The other 34 cases
had maximum absolute error 5.22e-7 and relative RMS error 9.19e-7.

`motion-native-browser-timing.json` retains the independent native proof. The
captured native time `13/44100` multiplied by 44100 is
`13.000000000000002`. A native GainNode step at that unchanged time first affects
frame 14. At 48/96 kHz the corresponding time maps to frame 13; values just below an
integer, such as 4000.9999999999995, also match ceiling. All 21 marker events agree.
No PCM shift or tolerance change is needed to explain the isolated discrepancy.

### Two explicit clocks

Owned Motion applies an integer-frame event at that exact frame. This remains
unchanged. Importing a native `setValueAtTime` timeline uses a different explicit
preparation contract: `native-step-ceil-v1`. The new pure
`nativeAutomationTime.js` helper preserves original seconds and f64 targets,
orders events stably by native time, and computes `ceil(timeSeconds*sampleRate)`
before portable enqueue. Requested and effective frames remain in the captured
timeline. It does not round away floating-point boundary behavior or adjust
rendered audio afterward.

The version 2 browser harness captures those original seconds once, sends them
unchanged to the actual native setters, and supplies compiled effective integer
frames to Rust. The independent GainNode markers remain and must agree with the
import profile for the overall report to pass. The original failing reports are
retained separately. Eight preparation-helper tests cover the boundary case,
stable ordering, preserved seconds/precision and invalid inputs.

The final Chrome 157 version 2 run passes **all 36 cases** with unchanged bounds.
`reports/modular_audio/motion-native-browser-v2.json` and its screenshot retain
the evidence for standalone Motion `bd20967bd090f540`. Maximum absolute error is
`5.21540641784668e-7`; maximum relative RMS error is
`9.18376948692699e-7`. Every independent native marker agrees with the compiled
frame. Original native seconds, all input samples, gains and alignment remain
unchanged; the correction is the explicit clock conversion before enqueue.

This import helper describes **step events only**. Native targets, linear or
exponential ramps, value curves and fractional oscillator starts need their
original continuous-time semantics; they must not be approximated by importing
only a ceiling frame. A successful native browser result applies to its recorded
browser/profile, not a universal bit-exact Web Audio implementation claim.

## Reference-graph integration

The parent integration exposes `voice.motion` with complete owned configuration,
zero adapter latency and parameter quantum1. Direct Graph events keep exact
integer frames, including13/41; the native seconds importer is a separate host
preparation step. Graph base values retain f64 targets, reset restarts phase at
latest targets, and late controls clamp to the current frame rather than a
128-frame effect boundary. The pool can retain Motion in its dependent master.

```powershell
npm.cmd test -- src/modular-audio/motionGraph.test.js src/modular-audio/ownedMotion.test.js src/modular-audio/nativeAutomationTime.test.js --reporter=json --outputFile=.tmp/motion-graph-tests.json
node tools/reportMotionGraph.mjs
```

`reports/modular_audio/motion-graph-verification.json` records25 passing checks
against graph `de1b3f998cdf0939` and standalone Motion `bd20967bd090f540`. The nine
graph-specific tests compare exact PCM with actual OwnedMotion at44.1/48/96 kHz,
odd calls, foreign gate splits and integer controls13/41; cover saved/reloaded
settings, reset, independent handles, late timing and raw incomplete-config
rejection; and verify real one/three-worker master execution at48/96 kHz. The
peak-meter test places a single impulse before internal splits, then checks a
silent next render, making the outer render scope observable.

## Tape: actual graph, not a generic saturator

Source: `src/nodes/tape.js`, baseline SHA-256
`cb70af70081f5383946951ced2019d48d9419ade365a4efda855b8b23e5c1260`.
Local baseline: `.tmp/owned-motion-baseline/tape.js`.

The actual path is:

1. A 2049-point Float32 `tanh` WaveShaper with `oversample='2x'`. Drive gives
   `k=1+5*drive` and curve gain `(1+0.15*(k-1))/k`. At drive 0 the curve is still
   `tanh(x)`, not identity; stage bypass belongs to the host.
2. Native lowpass BiquadFilter, Q.value 0.5 and tone target. Constructor tone
   automation starts from the native default frequency, not a settled 9000 Hz
   filter. Replacing it with an initially settled filter changes the attack.
3. Native DelayNode(maxDelay 0.02) with base 0.006 seconds. Four phase-continuous
   sine LFOs add wow 0.003, drift 0.0015, flutter 0.00025 and second flutter 0.00012 seconds
   of full-depth swing. Default frequencies are 0.6,0.222,7.3 and11.7 Hz. Maximum
   combined swing 0.00487 stays within the nominal positive delay range.
4. Wow/drift depths, wow/drift rates, flutter depths and tone use 30 ms
   `setTargetAtTime` automation. Drive replaces the curve as a control message,
   not an AudioParam. Curve replacement therefore needs a separately recorded
   control-boundary policy; it cannot inherit arbitrary sample-frame automation.

Two details are material to any future profile. Web Audio specifies linear
WaveShaper curve interpolation but deliberately leaves oversampling filters and
their latency implementation-dependent. Lowpass/highpass Biquad Q is in dB,
unlike the linear Q of several other Biquad types. Thus Tape's Q 0.5 must not be
silently treated as a linear 0.5 quality factor. See the primary
[WaveShaper specification](https://www.w3.org/TR/webaudio-1.1/#WaveShaperNode) and
[Biquad Q contract](https://www.w3.org/TR/webaudio-1.1/#dom-biquadfilternode-q).

## Concrete next Tape task

Build an independent native-reference page around the unchanged Tape class, with
recorded stage taps for shaper, tone and delay. At44.1/48/96 kHz capture impulses,
low-level sweeps, multitone/high-frequency material and transient/noise signals
for drive 0/0.3/1, wobble endpoints, tone targets and repeated automation. Record
unaligned full-chain errors, stage errors, impulse latency, spectral/alias energy
and control times. Drive-curve edits should use explicit quantum-aligned offline
suspend/resume points and report their actual native control frame.

Before a Rust implementation is accepted, choose and version its 2x up/down filter
profile, fractional-delay interpolation, native Biquad coefficient/update
precision, target automation law and initial state. Either preserve a documented
browser implementation under its license or label the resulting portable profile
and measure its native differences. A universal bit-exact native 2x claim is not
supported by the Web Audio contract. Keep dry/oversampling/variable-delay latency
separate; wow/flutter makes the delay time-varying, and a single fixed PDC number
cannot align its wet modulation with dry sound.

There is a concrete Chromium profile to investigate. Its current official
[UpSampler source](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/platform/audio/up_sampler.cc)
defines a 128-tap Blackman-windowed sinc interpolator, while its
[DownSampler source](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/platform/audio/down_sampler.cc)
defines a 256-tap half-band construction with a reduced odd-coefficient kernel.
Both select direct convolution for the corresponding small native block sizes.
These files carry BSD redistribution notices. Pin the actual target browser
revision, retain required attribution, and verify impulse latency and alias
behavior before adopting that profile; links to a moving main branch alone are
not a versioned compatibility contract.

No approximate Tape kernel, replacement native compressor, generic fallback,
shared graph change or default route switch is introduced by this slice.
