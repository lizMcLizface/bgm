# Captured native compressor automation

Updated 2026-11-11. This is a separate immutable capture layer around the
accepted static native-compressor Engine. Existing native routes, static live
controls, Graph compressors and app defaults remain unchanged.

## Prepared contract

The complete version-1 configuration contains five original initial Float64
controls and original-seconds `step` or `target` events. Target time constants
are retained as requested and converted at the same native Float32 boundary.
Preparation reserves at most256 events per parameter and1024 total. Events
must have strictly increasing original seconds per parameter; the host builder
coalesces identical parameter/time/type replacements before validation.
Different event types sharing one parameter/time are rejected rather than
guessing their ordering. Cancellation, ramps, value curves, live enqueue and
running-state snapshots are outside this captured subset.

The original event seconds remain authoritative. The renderer reproduces the
pinned fixed-k-rate AudioParam evaluator on its128-frame clock, rather than
turning targets into steps or using an ideal elapsed-time exponential. Its
recurrence coefficient is evaluated at `sampleRate / 128`. Native fractional
start correction uses an audio-frame interval, not a control-frame interval;
a target starting elsewhere between control ticks advances one native control
step at its first evaluated tick. An exact-boundary preceding target may run
with zero output samples and still update the scalar returned to the next
event. Step/target retention, convergence, skipped events and source nominal
ranges are preserved by the prepared timeline evaluator.

Current requested targets and actual Float32 coefficients have separate query
methods. Configuration is immutable after preparation. Reset replays the
original initial controls and captured schedule; it does not adopt the static
live Engine's different latest-target reset contract. Save/reload preserves the
captured configuration and original seconds, rather than serializing a running
detector, meter or delay buffer.

The static Engine is reused without kernel/API edits. Its actual32-frame
detector/envelope divisions and lookahead remain intact. The capture layer adds
no audio latency or render/control/reset allocation; each instance owns its
timeline cursors, coefficient state, buffers and compressor state.

## Evidence and limitations

Eight focused checks cover save/replay/reset, independent instances,
foreign render splits, empty-capture parity with the static Engine, control-rate
recurrence, exact-boundary zero-output segments, sub-audio-frame starts and
bounded/immutable validation. The tests entered normal discovery only after a
coherent normal public artifact was published.

`owned-native-compressor-automation-functional.json` records12 mono/stereo
cases at8/24/44.1/48/96/192kHz: raw exact callback-partition and save/reload
equality, original seconds unchanged, capture replay reset, independent handles,
zero Wasm allocation/reclamation after preparation and no memory growth.

The standalone `tools/native-compressor-automation.html` batch compares48
actual native cases across those six rates, mono/stereo, using steps, voice
20 ms targets, rack12 ms targets and boundary/fractional/short target cases.
Five native k-rate Gain parameters driven by constant1 mirror the same legal
native schedules, enabling direct coefficient comparisons independently of
compressor PCM. Before the first run, limits were fixed at one Float32 ULP per
coefficient, maximum absolute/relative RMS PCM error1e-4, reduction error0.01dB
and exact first-input onset latency. No output alignment, gain fitting or default
switch is permitted.

`native-compressor-automation-native-browser.json` and its screenshot record
engine `a1c8f067129ef3dc` passing **48/48 cases** on the first run. All five
coefficient streams are raw exact in every case (0 ULP), reduction metering is
exact, and every measured onset matches declared lookahead, including the
1023-frame cap at192kHz. Maximum absolute PCM error is1.8715858459472656e-5;
maximum relative RMS error is3.0208925450543157e-6. The original unchanged bounds
remain recorded with the full report. No live route has been switched.

This layer ports finite captured native parameter behavior. The complete voice
makeup/trim path, rack parallel mix/gain targets, arbitrary native lifecycle,
physical listening and realtime callback scheduling remain separate work.

```powershell
node tools/buildOwnedNativeCompressorAutomation.mjs --audit
node tools/auditOwnedNativeCompressorAutomation.mjs
node tools/buildOwnedNativeCompressorAutomation.mjs --check --audit
```
