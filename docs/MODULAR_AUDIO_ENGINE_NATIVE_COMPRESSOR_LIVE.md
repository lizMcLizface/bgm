# Ordinary native compressor: owned live wrapper

This leaf ports the ordinary `src/nodes/compressor.js` step-control contract,
separately from the amount/makeup VoiceCompressor and the effects desk's parallel
compressor. The original native path remains the default. The prepared factory
uses an actual single-input/output AudioWorkletNode so existing direct
`getNode().connect()` and `getNode().disconnect()` rewiring remains meaningful.

The accepted ef53bc92dc0b1a53 primitive passes the 108-case native matrix, 24
empty/active-zero cases, three arm rounds, six controlled resets and three
original reused-context rounds. The current facade candidate 43e06d45ab8e9a00
adds synchronous Boolean host demand, exact offline initial traces, finite native
clamping and bounded failure cleanup. It reuses the identical 69,695-byte Wasm
(SHA-256 `447eeb308ba2023a6e051d0fba08f9b6b307e1091db4604a325f14ba881eee6e`).
Its 38-case native demand/trace/clamping gate passes with exact PCM. The final
cleanup runtime is 1e26d3251c12099f, with the same Wasm. Aggregate native matrix
coverage is 108/108 across retained 86 cases and the final two rate shards;
41 focused tests pass. Normal Instrument/environment adoption is separate.

## Exact DSP reuse and native parameter timing

`synth-engine/native-compressor-live` owns the accepted native compressor Engine,
five bounded step timelines, parameter state, absolute control clock and audio
buffers. It does not change the accepted mathematical kernel or arithmetic
profile. Wrapper defaults remain threshold -24 dB, knee 30 dB, ratio 12, attack
5 ms and release 50 ms. All five setters retain original currentTime seconds.

A direct `Engine.param` call is insufficient. With an earlier step predecessor,
the native exclusive `ceil(nextEventTime * sampleRate)` bound can preserve the old
value for one k-rate observation when the product is infinitesimally above an
integer frame. At 24 kHz, the original currentTime at frame 896 multiplies back
to 896.0000000000001. The native AudioParam event list and its predecessor must
be preserved; adding an epsilon or globally rounding changes source behavior.

The live controller copies the already accepted AudioParam timeline subset,
adding immediate step insertion. It preserves native pruning, the first and last
equal-time steps, the retained predecessor, and unprocessed-event clamping on first
resumed pull. Intermediate equal-time steps have zero output span; the two
representatives fit in two prepared event slots per parameter. Requested Float64
targets and rendered Float32 coefficients are distinct. There is no native
parameter-value input into Rust DSP.

The absolute parameter frame is separate from processed DSP age. The shared
HostRenderClock translates actual callbacks into monotonic render epochs without
repeating/dropping native input when a resumed worklet global frame is stale.
The underlying native 32/128 mathematical clocks remain unchanged.

## Explicit pull state

An AudioWorklet returning true can remain automatically pulled after its outgoing
audio is disconnected. The original native compressor can instead retain its
history while unreachable. The facade delegates actual connect/disconnect calls
first, tracks only successful outgoing edges, handles duplicate connections and
disconnect overloads, and signals zero/nonzero outgoing demand. An unpulled Rust
controller advances absolute context time but freezes audio and parameter
history. It never guesses liveness from zero-valued PCM.

Direct outgoing edges do not reveal every downstream graph's reachability.
`setHostAwake(Boolean)` supplies that known host state. Effective demand is the
AND of this flag and actual successful outgoing edges. The optional
`Nodes.Compressor(context,{factory,...runtimeOptions})` constructor seam returns
the prepared synchronous stage; its absent/null factory branch is unchanged.
Normal Instrument/environment adoption remains a separate step.

Demand is semantic Boolean metadata, not a native compressor coefficient. The
internal `hostDemand` AudioParam transports only literal 0/1 samples at authored
canonical frame boundaries. Its a-rate block's last sample is latched for the
whole Rust quantum. A k-rate transport would reproduce the proven exclusive-ceil
predecessor delay at frame 121472/48 kHz; authoring one ULP earlier cannot fix it
because native AudioParam clamps past times to currentTime. The explicit Boolean
latch preserves the intended graph-connect boundary without shifting PCM or
altering compressor setter timestamps. Non-Boolean arrays/ramps reject. The old
MessagePort `pulled` command is retained for direct processor/ABI harnesses; the
actual facade uses the synchronous Boolean transport.

## Actual native evidence

`reports/modular_audio/native-compressor-live-first.json` preserves the negative
direct-param experiment: only 12/108 cases passed. All 8 kHz continuous/stopped
source cases were exact; other rates exposed step-predecessor timing, and every
explicit disconnect case exposed the auto-pull history difference. Maximum
absolute error was 2.0620784610509872, relative RMS 0.05693715766170132. These are
controller/lifecycle failures, not a reason to change the accepted compressor
math or comparison bounds.

The corrected controller passed all 108 actual native comparisons in
`native-compressor-live-second.json`, build 62a14286a2155f84 (69,121 bytes): maximum
absolute error 8.940696716308594e-8, relative RMS 3.764837842295322e-9. The matrix
covers six rates (8/24/44.1/48/96/192 kHz), mono/stereo, defaults/synthMix/knee-edge
settings, five-control changes at 896/1664/4096/12288, genuinely stopped/restarted
sources and explicit outgoing disconnect/reconnect. The unchanged declared
absolute/RMS bounds are both 1e-4. There is no alignment, fitted gain or native
pulled-value bridge.

`tools/native-compressor-live.html` runs this fixed batch. Its separate reused
live-context button checks two simultaneous facades, legal maximum release,
independent cold reset and JSON cold reload over three actual AudioContext
rounds. Its acceptance must be recorded separately from the 108 fresh OAC cases.

The first reused-context run passed two of three rounds, with only the second
node's cold reset failing in round one (maximum 0.14705310761928558, relative RMS
0.16190152731995183). The unchanged report is
`native-compressor-live-reuse-first.json`. A six-case controlled native reset
probe, `native-compressor-reset-diagnostic-first.json`, isolated the same result
at epoch 121472/48000 seconds: both native and Rust first output frames matched,
but native attack/release retained constructor values for the first quantum.
Independent native k-rate Gain mirrors and native property getters agreed.

Pinned `AudioParam::setValue` both updates the intrinsic value and appends a
SetValue event. The original wrapper creates attack 0.005/release 0.05 property
events before later property writes. Equal-time native steps are appended rather
than replaced. At this epoch, multiplication produces 121472.00000000001, so the
first equal-time event has one k-rate observation before the last event. A fresh
typed Rust reset already matched a separate fresh typed instance exactly; the
missing constructor/property chronology was the host mismatch.

Candidate 2d402e3303546c5e retains those first/last events and replays the original
constructor properties before the latest public properties on cold reset. This
changes the controller only. All six controlled reset cases now match actual
native PCM exactly (maximum absolute and relative RMS error both zero), saved
in `native-compressor-reset-diagnostic-second.json`. The same build also passed
all three original reused-context rounds in
`native-compressor-live-reuse-second.json`, with maximum absolute and relative
RMS error both zero.

Its next fresh-context batch passed 107/108 cases. The remaining 8 kHz mono
knee-edge stopped-source case exposed asynchronous startup: the worklet had
already executed seven callbacks at the first suspension, but its outgoing-pull
message and six initial control messages had not arrived. Rust processed zero
audio frames while native produced the first 896 frames. The preserved report
is `native-compressor-live-third.json`; maximum error was 0.03447289392352104,
relative RMS 0.03705805739442005. The reset correction did not change DSP math.

Candidate 1edb3c239e93b7a9 supplies original constructor property events and an
optional complete five-setting snapshot directly in processorOptions. Explicit
`initialPull:true` is restricted to OfflineAudioContext preparation. The native
reference still makes the same five setters at zero seconds; their immutable
Rust representation exists before the first callback, without waiting for a
MessagePort task. No initial audio is skipped or shifted. The complete unchanged
108-case native matrix now passes in `native-compressor-live-fourth.json`:
maximum absolute error 8.940696716308594e-8 and relative RMS
3.764837842295322e-9. Final reset/reused-context and explicit arm gates for this
candidate are recorded separately.

## API and persistence

`createRustCompressorFactory(context)` prepares the compiled module and worklet
for that exact context, then returns a synchronous node factory. Each node owns a
separate Wasm instance. A factory used with a different context rejects. Module
loading is shared only as immutable context resources. The measured 48 kHz
instance reserves 1,245,184 bytes of Wasm linear memory after creating its one
controller, including the toolchain stack; this is not the allocator's live
object size. Allocation audits verify no later growth during the tested render,
control and reset operations.

`ready` means that the actual node has been created, including in a suspended
context. Live callers resume the context and await `arm()` before starting
sources; it flushes preceding controls and demand with a bounded five-second
acknowledgement. Calling `arm()` while suspended rejects explicitly. Ordinary
statistics/flush requests also time out rather than hanging. Offline rendering
uses the immutable initial settings/pull contract because awaiting a processor
acknowledgement before `startRendering()` can deadlock. These are separate host
preparation contracts, not a change to the compressor's mathematical clocks.

Offline `initialControls` accepts at most 64 exact `[parameterIndex,rawValue]`
tuples and is mutually exclusive with named `settings`. It follows the original
constructor attack/release property events and can represent SynthMix's three
steps without inventing other events. Named `settings` is a full five-step cold
replay. An offline host can supply its exact initial trace with
`hostAwake:false`, wire the node, then call `setHostAwake(true)` before rendering;
the Boolean path removes the initial MessagePort demand race. Live hosts retain
their actual setters, resume, wake the chain and await `arm()` before booking.
Only offline calls already represented by the captured initial trace may be
elided. Later identical setters retain their native chronology.

The five step setters and connection methods retain the original stage shape.
Synchronous getters describe requested targets; rendered coefficients and
reduction are available through asynchronous Rust statistics. Existing app
consumers do not read the ordinary wrapper getters. No fake native AudioParam
objects or synchronous native pulled-value bridge are introduced.

The facade retains raw finite Float32-representable settings and applies native
Float32 conversion/nominal clamping for DSP. This preserves existing UI controls
such as `masterLimiterRelease:3`, whose native effective value is 1. Snapshot
`settings` keeps raw values; `effectiveSettings` reports normalized targets.
Nonfinite values and Float32 overflow reject. Rendered coefficients remain a
separate asynchronous observation. The strict Rust kernel's nominal range and
arithmetic are unchanged.

Snapshot JSON stores these requested settings, not detector/delay/timeline
history. Cold reload replays the same five original step setters. The explicit
owned reset instead clears histories, then replays constructor attack/release
property events and the latest five public property writes at the original
currentTime seconds. Its reference is a fresh native wrapper with those public
properties assigned before its first pull. The original wrapper has no reset method, so this is not
presented as an existing native API.

Forty-one focused checks compare the public processor with the independently
accepted captured-automation kernel across six rates, then cover independent
state, atomic numerical rejection, reset, real node identity, settings round-trip,
context ownership, disposal, first-callback immutable startup and bounded arm
acknowledgements, plus stale global-frame recovery without dropping input and
the difference between empty inputs and active zero-valued buffers.
All six rates also check the source-defined initial 256-frame latency cache at
the tail boundary before its first DSP quantum.
Rejection/disposal tests verify that an unrequested control rejection fails
closed, requested rejections stay local, disposal runs once with a bounded
acknowledgement, and post failures/context closure release pending requests,
listeners, timers and node references. Raw/effective save/reload and exact
partial initial traces are checked separately.
Constructor-OOM tests verify that the port handler exists before instantiation
and can acknowledge disposal; failure/disposal clears exports and buffer views.
Twelve audited public-processor cases execute
24,000 controls, 24,000 callbacks and 96 resets with zero Rust allocation or
reclamation after preparation and no Wasm memory growth. JavaScript heap use and
physical deadlines are outside that allocator counter.

Diagnostics retain requested targets, rendered coefficients and a bounded
control receipt trace separately. The historical `lastAppliedFrame` field names
the next render epoch at receipt, not a proof that a coefficient or physical
output changed at that frame. `lateControls` exposes delayed messages; the host
must establish readiness before booking its first source.

## Empty inputs and native silence propagation

The first explicit arm-before-note native batch passed only its first round;
later rounds exposed a separate native lifecycle rule. The unchanged evidence is
`native-compressor-live-arm-first.json` (maximum absolute error
0.07661256194114685, relative RMS 0.042143835645766715). All controls had arrived,
but Rust had processed 512 zero-input DSP frames before the first source. This
changed its gain history, while a fresh native node in the older context skipped
that processing.

Pinned `AudioHandler` initializes `last_non_silent_time_` to zero even for a new
node in an old context. When known-silent input outlasts latency plus its 1.625 s
tail, it silences output and processes only AudioParams. It updates the last
non-silent time after each active input quantum. Before its first DSP call, the
native latency cache is 256 frames; the first DSP call installs the declared
rate-dependent lookahead. These are host processing rules, separate from the
accepted compressor arithmetic.

Candidate ef53bc92dc0b1a53 adds a literal raw-controller `render_hint` for a native
128-frame quantum. Parameters continue while the core is skipped; entirely
unpulled nodes still freeze both. The Web Audio adapter automatically supplies
known-silent metadata only for an empty input array, which the pinned worklet
handler constructs when its input is disconnected. An active zero-valued buffer
remains distinct. It never scans PCM to guess a native silent-bus flag.

A connected native node can mark its output bus silent without exposing that
flag to JavaScript. Such graphs need explicit known host metadata; the automatic
empty-input hint does not claim general equivalence for that hidden flag.
`Run empty versus active-zero input batch` checks this exact boundary at six
rates and mono/stereo: two new nodes at context time four seconds, eight empty
or active-zero-buffer quanta, then the same first nonzero source. All 24 cases
match actual native PCM exactly in `native-compressor-live-empty-first.json`.
All three explicit arm-before-note rounds also match exactly in
`native-compressor-live-arm-second.json` (both maximum absolute and relative RMS
errors zero in each report).

The next broad 108-case run hit the unchanged ten-second watchdog. Its original
generic error-only record, `native-compressor-live-fifth-timeout.json`, lost the
active case identity; it is retained as an incomplete run, not a numeric result.
The review harness now preserves completed trials, failing case and phase,
context state/time, cached worklet clocks/control trace, pending requests and
native parameter/reduction observations before bounded cleanup. No watchdog
budget, DSP, alignment or comparison bound changed. The forensic isolated rerun,
`native-compressor-live-sixth.json`, completes all 108 cases on ef53bc92dc0b1a53:
maximum absolute error 8.940696716308594e-8, relative RMS
3.764837842295322e-9. The successful rerun does not establish the earlier timeout's cause.
Final `native-compressor-reset-diagnostic-fourth.json` (six cases) and
`native-compressor-live-reuse-fourth.json` (three rounds) also pass on the same
primitive with maximum absolute and relative RMS errors both zero.

The final facade's 38 prestart/partial-trace/clamping/fractional-demand cases are
also exact in `native-compressor-demand-final.json` (43e06d45ab8e9a00). A later
broad run retained 86 passing numeric cases, then failed constructing case 86
with `WebAssembly.Instance(): Out of memory`. The complete negative and retained
coverage are `native-compressor-final-oom.json`; this was not a PCM failure.
The processor's handler had been installed after instantiation, so that failed
constructor could not acknowledge disposal. The cleanup runtime installs it
first and clears exports and input/output views when releasing a handle.
Closed-context host teardown posts a best-effort disposal before closing its
port. Immediate browser garbage collection is not promised.

The harness now selects at most 18 cases per matrix run, defaulting to 48 kHz;
close completed review documents between rate shards. Global indices remain
stable. `?rate=96000&from=86` selects four cases and `?rate=192000&from=90`
selects eighteen. Both pass with exact PCM on 1e26d3251c12099f in
`native-compressor-final-96k.json` and `native-compressor-final-192k.json`.
Together with the retained 86 passing cases this covers all 108 distinct matrix
cases, maximum absolute error 8.940696716308594e-8 and relative RMS
3.764837842295322e-9. This is aggregate coverage across runs, not one successful
108-case final rerun. No math, bounds or watchdog budget changed.

```powershell
node tools/buildNativeCompressorLive.mjs --publish --check
node tools/captureNativeCompressorLiveReference.mjs --check-local
npm.cmd exec vitest run src/modular-audio/nativeCompressorLive.test.js src/modular-audio/nativeCompressorLiveLifecycle.test.js src/modular-audio/nativeCompressorShardPlan.test.js src/nodes/compressorFactory.test.js
node tools/buildNativeCompressorLive.mjs --audit
node tools/auditNativeCompressorLive.mjs
```

Next is coordinated normal Instrument/environment adoption with the exact
offline initial trace, plus a distinct bare-native initialization profile for
Iowa's limiter. Rack 12 ms target
automation, parallel mix/makeup, arbitrary native AudioParam scheduling and
generic transitive AudioBus liveness are separate contracts.
