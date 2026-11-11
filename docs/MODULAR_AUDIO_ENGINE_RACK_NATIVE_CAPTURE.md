# Captured native Width / Filter / Ring

This independent opt-in component ports the literal native inner graphs in
src/synths/effects/extras.js. It does not change the current rack, default
backend, shared Graph, physical-source kernel, or common control code.

## Exact scope and ownership

The profile is native-rack-captured-continuous-v1. Creation starts at native
frame zero, the source has one fixed logical input layout (mono or stereo),
and every canonical 128-frame quantum is pulled continuously. The source
buffer remains alive through any numerical-zero tail. Source-ended channel
collapse, disconnected/unpulled gaps, changing layouts and arbitrary already
running context epochs are not accepted activity-clock equivalents. The node
factory rejects a context that has advanced during preparation. No normal
createRack/extras integration is included in this step.

The Rust engine owns histories, oscillator phase, native control timelines,
complete initial settings, and up to 128 captured GUI packets. Each packet
records the original native call seconds at a canonical callback boundary.
The original seconds are retained; near-integer frame recognition is only
bounded bookkeeping for the discrete type-change/call boundary. Packet values
are complete captured state; builder convenience partial edits carry prior
settings forward. Captured packets become native setTarget events only when
their call frame is reached. They are not pre-scheduled future AudioParam
automation: prebooking would change Ring's constant/SSE versus a-rate path
before the original GUI call occurred.

Width projects amount into same=(1+amount)/2 and cross=(1-amount)/2 before
native Float32 control curves. Both branch multiplies round to Float32 before
the two-input channel sum. Mono uses the original discrete splitter model,
so its right input is absent rather than automatically duplicated. Width's
logical output is stereo. Filter/Ring keep the captured mono/stereo output
layout; any comparison upmix is an explicit native speakers-layout capture
boundary applied equally to the reference and owned output.

Filter keeps all five real nodes: HP x2, LP x2, then main. Ten-Hz/open0.45*rate
settings are actual native filters, not a shortcut bypass. The main node
supports cuts, bandpass, notch and both shelves. A changed main type resets
its histories, including intermediate same-boundary changes. Returning to
mode zero keeps prior main frequency/Q automation and only ramps main gain
toward zero, matching the existing builder. Each node has one coefficient
cache and independent channel histories. Native Float32 feedback, canonical
denormal flush and the accepted Float32 pow10 boundary are preserved.

Ring uses the pinned native FFT sine tables, phase increments, interpolation
and constant-frequency SSE/a-rate path from the accepted readonly live sine
profile. It samples LiveTimeline.accurate before preparing that quantum.
Carrier phase advances through continuously pulled silence and native bypass;
it does not restart at an input attack or mix edit. Native Float32 boundaries
remain at carrier modulation, wet/dry gains and the final two-input sum.

External stage on/off bypass remains the original two native gains with 20ms
targets in the review wrapper. The kernel implements the inner DSP and its
original controls. Original rack clear() for these units is a no-op; the
standalone reset API instead explicitly models a fresh instance/cold replay.
It is not silently substituted for rack clear or a running-context phase reset.

## API and bounds

rackNativeSpec(kind, rate, {channels, initial, events}) creates the complete
contract; saveRackNativeSpec/loadRackNativeSpec validate its cold replay JSON.
OwnedNativeRack takes independent Wasm exports and a captured spec. It exposes
fixed input/output views, render(0..2048), refresh, stats, reset and dispose.
Logical output channels are explicit. Caller partitions do not change the
native 128-frame control/denormal/oscillator cadence. Preparing another handle
in the same memory may require refreshing views before rendering.

The rate is an integer 8,000..192,000 Hz, channels are 1 or 2, render duration
is bounded to one hour, packets to 128, each timeline to 256 preallocated
records. Settings use the existing UI bounds and exact enum identities.
Raw ABI numeric indices/channel/block values reject fractional or nonfinite
numbers before conversion. Preparation requires every initial parameter and
remains retryable after incomplete configuration; published plans are sealed.
No state or target is shared between handles. Reset restores cold histories,
frame/phase and the same captured initial plan without allocation.

createNativeRackNode creates an actual review/capture AudioWorkletNode using
a verified immutable compiled Module. It requires a fresh frame-zero context,
fixed logical layout and 128-frame pulls. The shared measured HostRenderClock
recovers stale reported global frames; a real pull gap stops explicitly rather
than shifting the signal or generating missing history. Unknown mutation
messages reject because this profile is immutable. Stats requests are bounded
to 32 with ten-second timeouts; disposal waits for ACK with a one-second
shutdown fallback. Physical listening and arbitrary live GUI ownership require
separate acceptance before normal host adoption.

## Provenance and evidence

The first browser candidate is 89093f53ab94f71c, 176,343 bytes. Its source list
pins the readonly live_timeline.rs/live_sine.rs from committed3657089 and the
accepted native sine resource bytes, plus the explicit Chromium e14de735
source profiles/notices for Biquad/type reset, native automation, oscillator,
gain and audio-bus boundaries. Existing dependencies are not edited.

47 permanent tests across two files pass: cold save/reload, same-memory
independent handles, explicit layouts, fresh replay, irregular caller spans,
full parameter masks/raw numeric bounds, future uncalled Ring packets not
changing prior phase, actual Worklet/direct Rust equality over six rates and
mono/stereo, measured stale-clock recovery and terminal real gaps/layout
mismatch. These tests do not replace native-node PCM evidence.

The maintained auditNativeRack.mjs runs 36 cases (three kinds x six rates x
two layouts), each with two handles, all 128 captured packet slots, irregular
render spans, reset and resumed rendering. Allocations, reallocations and
reclamations are zero under the Rust audit allocator; memory does not grow.
Largest two-handle Wasm memory is 1,572,864 bytes. This excludes JS allocation,
CPU deadlines, browser/device underruns and physical output quality.

The fixed tools/native-rack.html batch compares the actual original native
stages against two owned stage wrappers across those 36 cases. It exercises
all main Filter modes, zero-slope/steep cuts, resets, bypass/return, Ring
frequency/mix changes, mono/stereo and explicit native call-time assertions.
It also captures raw owned output and requires exact equality against direct
Rust rendered with unrelated caller partitions. Native max-absolute and
relative RMS limits are fixed at 1e-4 before the first run. A real HTML reload
replays the complete saved Ring scene and checks the PCM SHA. Actual browser acceptance at 89093f53ab94f71c passes all 36 cases. Largest
native absolute difference is 5.21540641784668e-7 and largest relative RMS
3.723803658136283e-7, below the unchanged 1e-4 limits. Both independent owned
outputs and raw owned Worklet/direct Rust are exact zero in every case.
All captured/native call-time assertions pass.

The real HTML reload of Ring48k passes with saved PCM SHA
b46245f78a183b211da9fb723529f630b244cef43ab38a8e19d14befbafa3c3f
matching exactly. Its native max difference is 8.940696716308594e-8 and relative
RMS 5.5720194570190566e-8; raw Worklet/direct remains zero. Local evidence is
native-rack-first.json and native-rack-reload-final.json under the ignored
modular_audio reports directory. This accepts only the stated captured profile;
no normal backend migration, arbitrary live demand or source-ended activity
clock equivalence is claimed.
