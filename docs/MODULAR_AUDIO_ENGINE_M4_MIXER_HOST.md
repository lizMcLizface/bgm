# Opt-in owned desk host boundary

This is a desk primitive replacement foundation. The existing All host and its
native default are unchanged. `createOwnedMixerAudio` in
`src/modular-audio/ownedMixerAudio.js` returns the same channel input/output and
master input/output seams used by `createMixerAudio`; no existing connections are
moved automatically. The new `tools/owned-desk.html` is an isolated comparison.

## Actual routing retained

The audited implementation is `src/synths/all/host.js::setupMixer` and
`src/app/Generator.js::{routeSharedEffects,applyBus,applySpace}`:

1. Role effects, scene volume, duck and wander precede each desk strip.
2. A strip's output goes both to headroom and to its shared bus/section-space
   send. Shared effect returns join headroom input. Send gain targets use30ms;
   section-space targets use `barSeconds * .7`.
3. Headroom output feeds Generator output. The shared reverb-hub return joins
   Generator output after headroom, before its fade, optional sweep and
   arrangement level trim.
4. Generator level trim feeds desk master input. Ambience has its own strip and
   joins that master input outside music/headroom.
5. Stereo matrix/balance precedes the optional caller-owned master insert. Master
   fader/dim follows that insert. Exactly one owned desk limiter follows fader.

`wireOwnedMixerSeams` executes these connections for an isolated desk and creates
native send GainNodes plus the declared pairwise headroom reduction below. Its
disposal removes only the connections it added;
it does not dispose caller-owned sources, effects or Generator stages. External
effects remain their existing kernels. Their parameter-dependent wet delays are
not relabelled as zero-latency portable processing.

## Deterministic reference reduction

Revision `deterministic-left-fold-v2` adds explicit two-input native GainNode
additions before headroom, ordered by role list followed by shared-return list.
This matches the reference `mixerGraphPlan` reduction policy. Each pairwise
addition has two stereo inputs; the next node adds the next input to that result.
The mathematical routing remains the same. Existing All uses implicit native
fan-in; its floating-point reduction order is not asserted to be bit-identical.
Both routes on the isolated comparison page use the explicit policy.

The earlier implicit comparison is retained in the browser reports. Its role
strips and native send returns became exact after the primitive fixes, but a
one-ULP headroom sum difference was amplified by caller-owned native SweepFilter
history. The diagnostic page includes two independent native/native implicit
runs as an additional repeatability control; one exact control run does not make
native connection order an API guarantee. No PCM is shifted or normalized.

## Primitive execution and timing

`public/modular-audio/mixer-node-processor.js` has no imports. It instantiates the
actual published `mixer.wasm` module passed through processorOptions. Every
primitive has private Wasm memory and owned DSP state. The loader verifies the
published mixer manifest's SHA256 before compiling. No separate implementation
of mixer DSP is introduced in JavaScript.

The rendered automation profile is `webaudio-f32-128-target-v1`: Float32
four-sample exponential evaluation and finite convergence at canonical128
boundaries. Requested parameter targets stay f64. Native Biquad coefficients
use their actual parameter/normalization boundaries and store Float32 output
feedback. Message-based limiter ceiling and detector state remain f64. These
policies were measured against actual native PCM and checked against the primary
[AudioParamHandler](https://chromium.googlesource.com/chromium/src/+/3328c3d3dd7dbe1263da0e1bd300bacaf365b638/third_party/blink/renderer/modules/webaudio/audio_param_handler.cc)
and [Biquad](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/platform/audio/biquad.cc)
implementations. This is a deterministic measured profile, not a claim of
bit-exact output from every native browser or CPU architecture.

Strip, matrix and fader process the current input sample without a block cache.
Limiter latency is `ceil(sampleRate * .003)` in enabled and disabled modes:
133/144/288frames at44.1/48/96kHz. External master insert, source and shared FX
latencies stay explicit caller metadata; no automatic PDC is asserted here.

This is a stereo host contract, matching All's post-wander outputs. Native
StereoPannerNode has a different equal-power law for genuinely mono input. This
executor does not claim that mono-input parity.

`patch(state,{frame,owner})` uses an absolute AudioContext integer frame. The
optional `when` convenience imports integer-frame origins through the separate
`native-target-integer-origin-v1` policy, allowing only floating-point error from
the frame/sampleRate round trip. Genuine fractional exponential phases are
rejected. The step-event ceil policy is deliberately separate. The comparison
includes an independent native target marker at the original `13/sampleRate`
time; native seconds are never changed to make a test pass.
Patch calls must contain the whole current desk state and have monotonically
ordered frame snapshots. The factory deliberately has no cancel convenience:
raw timeline cancellation requires the caller to own/rebuild its target
projection. Raw processor/Rust cancellation remains available at that lower seam.

Each processor records its first process callback as its context origin and
converts absolute events to its local Rust clock. The startup queue holds512
parameter changes; normal Rust queue overflow and late counters remain visible.
Events earlier than first processing also have a separate `preOriginLateEvents`
counter. Host control requests are bounded to64 per primitive. The factory's
role limit is16; with both auxiliary strips and three master primitives this
means at most21 private worklet instances.

A shared zero-gain keepalive advances unconnected strips/taps without another
audible monitor. Disposal removes that sink, disconnects owned outputs, releases
Wasm handles through control messages outside process(), and removes the one
caller master-insert output→owned-fader connection. Startup failure performs the
same cleanup. There is no automatic backend fallback during playback.

## Verification and next gate

Thirteen Node tests execute the exact public processor and host helper and test:

- all four primitive outputs against standalone Rust;
- absolute startup events, late clamps, private clocks and no memory growth;
- complete packet validation,512-event startup bound, cancellation and disposal;
- exact post-fader/shared-return/headroom/ambience connection positions;
- native send target laws, explicit frame/seconds import, and connection-specific
  external insert cleanup.
- ordered two-input headroom reduction and reserved auxiliary-role rejection
  before any feedback connection can be created.
- shared module registration failure, zero primitive/keepalive allocation on
  failure, and a successful later retry on the same AudioContext.

Ten target-time policy tests cover integer-frame origins and fractional rejection.
Fifteen automation regressions include nine exact native critical filter PCM
points and, in the audit build, six exact native endpoint cutover frames and
Float32 parameter samples. The private curve audit observes no allocation,
reclamation or memory growth. All nine original limiter regressions still pass.

The fixed browser comparison uses actual native `createMixerAudio`, real legacy
EffectsBus and InstrumentInserts processors, and native SweepFilter and gain
automation on both routes. It schedules mute, solo, master fader/width/balance
and headroom mute automatically. Both max absolute and relative RMS limits are
`1e-4`; native automation times are preserved, with no PCM shifts.

The built-in browser run on 2026-11-11 passed revision
`deterministic-left-fold-v2`, recorded in
[`owned-desk-native-deterministic.json`](../reports/modular_audio/owned-desk-native-deterministic.json)
and its matching screenshot. Final stereo PCM matched exactly at all three rates:

| Sample rate | Rendered frames | Limiter latency | Maximum absolute error | Relative RMS error |
| --- | ---: | ---: | ---: | ---: |
| 44,100 Hz | 61,824 | 133 frames | 0 | 0 |
| 48,000 Hz | 67,200 | 144 frames | 0 | 0 |
| 96,000 Hz | 134,400 | 288 frames | 0 | 0 |

All fifteen simultaneous stereo stage taps matched exactly downstream of
headroom. A few strip taps differed only by denormal values, below `2.08e-37`.
All nine independent filter-startup markers and all three original-time target
markers passed. The original eighteen native primitive comparisons also passed
in `mixer-native-browser-recheck.json` (maximum absolute error `7.68155e-6`,
maximum relative RMS `2.70097e-5`). The tested published mixer is
`580e991836a79baf`, 70,229 bytes, Wasm SHA256
`abb416923ee7d39dc871cedf76b6268f317123dc76d8af6c4267587db58d4e3d`,
source fingerprint
`10c1f95369e0ecb49b58871392fec0b6ac7ecfbe4f3c1631051b1365597dc9a4`.

The earlier implicit-fan-in failures remain preserved in
`owned-desk-native-browser.json`, `owned-desk-native-stage-probe-v2.json`,
`owned-desk-native-fixed.json` and `owned-desk-native-feedback-fixed.json`.
The final native/native implicit-repeat control at 96 kHz itself differed by
`0.000017464160919189453` maximum absolute error and
`0.0001129306845082967` relative RMS. This supports the explicit reduction policy;
the passing fixture does not establish rounding identity with All's unchanged
implicit fan-in. No acceptance bound was widened and no output was normalized.

These are actual browser DSP/output checks, not a full All backend migration or
physical device assessment. The separate listening button plays the rendered
48 kHz owned result; listening remains unassessed in the saved muted report.

An immutable opt-in actual All host API now selects this factory before setup,
with off-route preparation, rollback, lease guards and asynchronous error health;
see `MODULAR_AUDIO_ENGINE_ALL_DESK_BACKEND.md` for its exact acceptance state.
Its actual built-in-browser native/owned/restored-owned full-path batch and
separate live owned case passed at 48 kHz, recorded in
`all-owned-desk-host-browser.json` and `all-owned-desk-live-browser.json`.
That later host proof uses mixer version `d43cbe6314cd15e6`, source fingerprint
`cc40b2df4e0986979522ce7e3f7bf5e3d9cbcff39a6c167a554bf476b7287fe9`,
with the same 70,229-byte Wasm and SHA256 listed above. It preserves All's
implicit fan-in and checks nonzero finite music/output, controls and lifetime;
it does not replace the earlier deterministic-fixture PCM assertion.
The normal All UI retains the native default. A stopped-state UI backend choice
and complete project/executor selection remain later gates. Save snapshots here
capture desk targets only, not external FX, native Generator automation or
in-flight tails.
