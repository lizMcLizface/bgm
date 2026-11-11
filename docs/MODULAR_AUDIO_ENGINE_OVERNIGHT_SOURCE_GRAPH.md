# Overnight source graph and desk checkpoint

11 November 2026. These are opt-in extensions; normal All transport, source
selection, shared effects and desk defaults keep their existing routes.

## Source and event integration

Graph kind25 (`voice.motion`) now owns the verified Motion kernel and its four
double-precision targets. Its events can occur at any sample, independently of
other graph event splits. Its zero-latency processing keeps the original
absolute128-frame control clock. One- and three-worker master tests cover48/96k.

Graph kind26 (`legacy.plucked`) owns prepared Karplus–Strong banks, finite note
plans, envelope/filter histories and source cursors. The All preview captures
the actual plucked source separately from piano and sends it through the existing
synthMix compressor and shared effects. This initial finite contract is48k only;
active breath, held/future native bookings, incompatible per-slot filters and
steals closer than10ms are explicitly rejected. Shared controls, native source
wall-stop times, planned stealing, owner cancellation and saved replay are kept.
Its source partition still uses the existing five pitched buses plus percussion.

Piano v3 and plucked planned triggers now reject late or duplicate future onsets
before touching the event queue or counters. Ownership is remapped in both
plucked note plans and their events when combining workbench roles.

An independent native BufferSource ramp experiment exposed a real pitch-clock
error. For a source starting inside a quantum, the first partial quantum retains
default detune; the first full absolute128-frame quantum gets the complete
initial amount, and decay begins there. Both finite piano and plucked cursors
now follow that measured clock. Original failures remain in the reports.

- Twelve actual native plucked cases pass the unchanged0.005 relative-RMS and
  0.99998 correlation bounds; worst relative RMS0.000397720503.
- Six targeted native piano cases failed before and pass after the correction;
  worst relative RMS0.000391886237, minimum correlation0.999999925.
- Thirty-two permanent cursor cases use the independently saved native ramp
  measurements, rather than deriving an oracle from the Rust implementation.
- 146 focused tests across9 files pass, including actual mixed-worker delivery
  of four classic mono kernels, stealing plucked Bass and Hand percussion.
- Thirty existing and nine combined full-graph allocator cases pass: zero
  allocation/reclamation calls or memory growth after preparation. Combined
  graphs include Motion, plucked, classic, inserts, sends, rack/voice effects,
  mixer and explicit latency compensation, with exact independent saved replay.

## Explicit desk seam

`createOwnedMixerAudio` creates an isolated portable strip/matrix/fader/limiter
desk. `wireOwnedMixerSeams` retains caller-owned shared FX, music fade/sweep/trim,
ambience outside headroom and master inserts. Exactly one owned limiter adds
`ceil(rate*0.003)` frames; external latency remains separately declared. Disposal
removes only connections created by this adapter. Reserved role names reject
before routing. State targets use explicit integer frames or a separately
validated native target-seconds importer; fractional target phases reject.

The native AudioParam recurrence, endpoint convergence and Biquad Float32 output
history are now modeled explicitly. The18 primitive native comparisons pass.
The deterministic-left-fold-v2 route declares a two-input summing order before
headroom. Its final native/owned PCM is bit-identical at44.1/48/96k through real
shared effects, sweep and master inserts, with automated mute/solo/fader changes.
Fifteen stage taps preserve diagnosis; only inaudible denormal filter residues
differ before the shared route.

This does not assert bit identity with All's implicit multi-input reduction.
Two independent original native desks themselves differed at96k by maximum
0.0000174642 and relative RMS0.000112931 in the saved control. The earlier failed
implicit-route comparisons remain reviewable. No tolerance was widened, native
PCM shifted or default routing changed to make this check pass.

## Evidence and limits

See `plucked-native-browser-v3.json`, `plucked-native-pitch-probe.json`,
`piano-native-pitch-before.json`, `piano-native-pitch-after.json`,
`graph-owned-ports-allocation.json`, `mixer-native-browser-recheck.json` and
`owned-desk-native-deterministic.json` under `reports/modular_audio`.

These checks prove generated/routed desktop PCM, clocks and independent state.
They do not certify physical listening, device underruns or phone behavior.
Normal transport adoption, the remaining native source/host seams and general
cable editing remain later integration work. Full Tape and streaming weather
are independent overnight streams with separate acceptance records.
